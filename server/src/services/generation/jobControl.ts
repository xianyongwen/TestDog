import { registerCancel, unregisterCancel } from '../../ws/hub';
import { closeSession } from '../stagehandManager';
import { clearUsage, type TokenUsage } from '../tokenUsage';
import { pub } from './logBridge';
import { testIntentSchema, type TestIntent } from '../../shared/testIntent';
import type { AssistDecision, PlanStep, ConfirmedPlan } from './types';
import { clearCheckpoint } from './checkpoint';
import { clearGenerationEnvironment, redactGenerationData } from './privacy';

type Wait =
  | { type: 'plan'; intent?: TestIntent; resolve: (v: ConfirmedPlan | null) => void }
  | { type: 'assist'; resolve: (v: AssistDecision | null) => void };

const PLAN_TIMEOUT_MS = 5 * 60_000;
const ASSIST_TIMEOUT_MS = 5 * 60_000;

/** 挂起的「等待用户」请求：计划确认 / 定位失败三选一。 */
const waits = new Map<string, Wait>();
const waitTimers = new Map<string, NodeJS.Timeout>();

/** 运行中循环注册的「撤销步骤」处理器（jobId → 删范围实现）：assistStep 收到 revoke 决策时应用。 */
export const revokeHandlers = new Map<string, (from: number, to: number) => string | null>();

/** 运行中任务的「停止（保留浏览器会话）」回调。 */
const pauseHandlers = new Map<string, () => void>();
/** 停止后未继续的会话回收定时器（30 分钟）。 */
const pauseTimers = new Map<string, NodeJS.Timeout>();
const runningJobs = new Map<string, symbol>();
export function isJobRunning(jobId: string): boolean { return runningJobs.has(jobId); }
export function claimJob(jobId: string): symbol | null {
  if (runningJobs.has(jobId)) return null;
  const owner = Symbol(jobId);
  runningJobs.set(jobId, owner);
  return owner;
}
export function releaseJobSlot(jobId: string, owner?: symbol): void {
  if (!owner || runningJobs.get(jobId) === owner) runningJobs.delete(jobId);
}

function setWait(jobId: string, wait: Wait, timeoutMs: number): void {
  waits.set(jobId, wait);
  const t = setTimeout(() => resolveWait(jobId, null), timeoutMs);
  t.unref?.();
  waitTimers.set(jobId, t);
}

function resolveWait(jobId: string, value: unknown): void {
  const w = waits.get(jobId);
  if (!w) return;
  waits.delete(jobId);
  const t = waitTimers.get(jobId);
  if (t) clearTimeout(t);
  waitTimers.delete(jobId);
  w.resolve(value as never);
}

/** 用户点击「停止」：中断执行但保留浏览器会话，供「继续生成」复用。返回 false 表示该任务不在运行状态。 */
export function pauseJob(jobId: string): boolean {
  const h = pauseHandlers.get(jobId);
  if (!h) return false;
  h();
  return true;
}

/** 停止后长时间未继续：回收浏览器会话。 */
export function scheduleSessionGc(jobId: string): void {
  cancelSessionGc(jobId);
  const t = setTimeout(
    () => {
      pauseTimers.delete(jobId);
      pauseHandlers.delete(jobId);
      clearCheckpoint(jobId);
      clearGenerationEnvironment(jobId);
      clearUsage(jobId);
      unregisterCancel(jobId);
      closeSession(jobId).catch(() => {});
    },
    30 * 60_000,
  );
  t.unref?.();
  pauseTimers.set(jobId, t);
}

/** 继续生成接管会话：取消未触发的会话回收定时器（仍在 GC 宽限期内继续）。 */
export function cancelSessionGc(jobId: string): void {
  const gc = pauseTimers.get(jobId);
  if (gc) {
    clearTimeout(gc);
    pauseTimers.delete(jobId);
  }
}

/** 路由调用：用户确认/修改计划后继续执行。返回 false 表示该 job 不在等待计划确认状态。 */
export function confirmPlan(jobId: string, steps: PlanStep[], intent?: TestIntent): boolean | string {
  const w = waits.get(jobId);
  if (!w || w.type !== 'plan') return false;
  steps = redactGenerationData(jobId, steps);
  const selected = redactGenerationData(jobId, intent ?? w.intent);
  if (selected) {
    const parsed = testIntentSchema.safeParse(selected);
    if (!parsed.success) return `测试意图无效：${parsed.error.issues.map(i => i.message).join('；')}`;
    for (const criterion of parsed.data.criteria.filter(c => c.required)) {
      if (!steps.some(s => s.kind === 'assert' && s.criterionId === criterion.id && s.assertion?.type === criterion.assertion.type && s.assertion?.expected === criterion.assertion.expected))
        return `必验目标 ${criterion.id} 缺少对应的计划断言，或类型/预期不一致。请同时修改验收目标与计划。`;
    }
    if (steps.some(s => s.criterionId && !parsed.data.criteria.some(c => c.id === s.criterionId))) return '计划引用了不存在的验收目标';
    if (steps.at(-1)?.kind !== 'assert') return '计划末步必须是断言';
    resolveWait(jobId, { steps, intent: parsed.data });
  } else resolveWait(jobId, { steps });
  return true;
}

/**
 * 路由调用：用户在定位失败时选择重新描述 / AI 修正 / 手动操作 / 跳过 / 撤销步骤。
 * revoke 在解除挂起前先真正删除步骤区间并发布 gen:revoke（前端同步收缩步骤列表）；
 * 返回 true 成功，false = 不在等待协助状态，字符串 = 撤销失败原因（挂起保持，用户可修正范围重试）。
 */
export function assistStep(jobId: string, decision: AssistDecision): boolean | string {
  const w = waits.get(jobId);
  if (!w || w.type !== 'assist') return false;
  if (decision.decision === 'revoke') {
    const handler = revokeHandlers.get(jobId);
    if (!handler) return '当前没有可撤销的生成流程';
    const err = handler(decision.from, decision.to);
    if (err) return err;
    pub({ type: 'gen:revoke', jobId, from: decision.from, to: decision.to, nl: decision.nl });
  }
  resolveWait(jobId, decision);
  return true;
}

/** 人工协助统一入口：广播 gen:assist 并挂起等待用户决策（超时返回 null）。 */
export function askUser(
  jobId: string,
  o: { stepIndex: number; kind: string; instruction: string; canManual: boolean },
): Promise<AssistDecision | null> {
  pub({ type: 'gen:assist', jobId, stepIndex: o.stepIndex, kind: o.kind, instruction: o.instruction, canManual: o.canManual });
  return new Promise<AssistDecision | null>((resolve) => setWait(jobId, { type: 'assist', resolve }, ASSIST_TIMEOUT_MS));
}

/** 广播计划并挂起等待用户确认/修改（超时返回 null）。 */
export async function awaitPlanConfirm(jobId: string, plan: PlanStep[], usage: TokenUsage, intent?: TestIntent): Promise<ConfirmedPlan | null> {
  pub({ type: 'gen:plan', jobId, steps: plan, intent, usage });
  return new Promise<ConfirmedPlan | null>((resolve) => {
    setWait(jobId, { type: 'plan', resolve, intent }, PLAN_TIMEOUT_MS);
  });
}

/** 一次生成任务的取消/暂停运行时：中断工具循环（abortCtrl）、关闭会话或保留供「继续生成」复用。 */
export interface JobRuntime {
  /** 中断工具循环（取消/暂停共用）。 */
  abortCtrl: AbortController;
  isCancelled: () => boolean;
  isPaused: () => boolean;
  /** 取消：中断执行并关闭浏览器（用户点取消 / 浏览器被手动关闭均走这里）。 */
  cancel: (message: string) => void;
  /** 停止：中断执行但保留浏览器会话，供「继续生成」复用。 */
  pause: () => void;
}

/** 注册 WS 取消回调与停止处理器，返回该任务的运行时句柄（生成/继续生成共用）。 */
export function createJobRuntime(jobId: string): JobRuntime {
  let cancelled = false;
  let paused = false;
  const abortCtrl = new AbortController(); // 中断工具循环（取消/暂停共用）
  // 取消：中断执行并关闭浏览器（用户点取消 / 浏览器被手动关闭均走这里）
  const cancel = (message: string) => {
    paused = false;
    cancelled = true;
    abortCtrl.abort();
    resolveWait(jobId, null);
    void closeSession(jobId).catch(() => {});
    pub({ type: 'gen:error', jobId, message });
    if (!isJobRunning(jobId)) {
      cancelSessionGc(jobId);
      clearCheckpoint(jobId);
      clearGenerationEnvironment(jobId);
      clearUsage(jobId);
      unregisterCancel(jobId);
    }
  };
  registerCancel(jobId, () => cancel('已取消'));
  const pause = () => {
    if (cancelled) return;
    paused = true;
    cancelled = true; // 复用取消的循环退出与跳过逻辑
    abortCtrl.abort();
    resolveWait(jobId, null);
    pub({ type: 'gen:status', jobId, message: '正在暂停，等待当前操作记录和保存完成…' });
  };
  pauseHandlers.set(jobId, pause);
  return { abortCtrl, isCancelled: () => cancelled, isPaused: () => paused, cancel, pause };
}

/** 任务外层收尾：暂停（非取消）时保留 usage 累计与会话，供「继续生成」在同一 jobId 上接着累计；
 *  清理（pauseHandlers/waits/cancel/usage）交给接管任务的 continueGenerate 处理，
 *  否则 generate 的延迟 finally 可能清掉 continue 已重新初始化的 usage，导致步骤 token 全为 0。 */
export function releaseJob(jobId: string, paused: boolean): void {
  pauseHandlers.delete(jobId);
  resolveWait(jobId, null);
  releaseJobSlot(jobId);
  if (paused) {
    pub({ type: 'gen:paused', jobId, message: '已暂停，可调整步骤后继续生成' });
  }
  if (!paused) {
    cancelSessionGc(jobId);
    unregisterCancel(jobId);
    clearUsage(jobId);
    clearCheckpoint(jobId);
    clearGenerationEnvironment(jobId);
  }
}
