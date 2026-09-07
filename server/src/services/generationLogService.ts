import { prisma } from '../db';
import type { TokenUsage } from './tokenUsage';
import type { TestStep } from '../shared/testScript';

/** 生成记录的步骤类型。前端用此枚举显示中文标签 / 折叠逻辑。 */
export const STEP_TYPE = {
  USER_INPUT: 'user_input', // 用户提交自然语言
  PLAN: 'plan', // preSplit LLM 调用（含 system/user/assistant）
  AIFIX: 'aifix', // aiFix LLM 调用
  VISION: 'vision', // 视觉模型调用
  TOOL: 'tool', // act/observe/手动捕获/pubTool 等工具轨迹
  STATUS: 'status', // 普通状态消息
  PLAN_CONFIRMED: 'plan_confirmed', // 用户确认步骤计划
  REVOKE: 'revoke', // 撤销步骤范围并重拆
  REVISE: 'revise', // 模型修订已落库脚本步骤（revise 工具：改参数/删冗余步骤）
  ASSIST: 'assist', // 定位失败用户决策（重新描述/AI 修正/手动/跳过/撤销）
  DONE: 'done', // 生成完成（含最终脚本）
  ERROR: 'error', // 生成失败
} as const;
export type StepType = (typeof STEP_TYPE)[keyof typeof STEP_TYPE];

export type GenLogStatus = 'RUNNING' | 'DONE' | 'ERROR' | 'CANCELLED' | 'PAUSED';

/** 写日志的 step 数据（不含 id/logId/createdAt）。 */
export interface StepInput {
  type: StepType | string;
  stepIndex?: number | null;
  message?: string | null;
  system?: string | null;
  user?: string | null;
  assistant?: string | null;
  tool?: string | null;
  args?: unknown;
  result?: string | null;
  error?: string | null;
  usage?: TokenUsage | null;
}

const MAX_RESULT_CHARS = 16_000; // 单条 step.result 的最大长度，超过则截断（避免 DB 巨大）

/** 截断过长文本。 */
function trunc(s: string | null | undefined, n: number = MAX_RESULT_CHARS): string | null | undefined {
  if (s == null) return s;
  return s.length > n ? s.slice(0, n) + `\n…(已截断, 原始 ${s.length} 字)` : s;
}

/** 吞错：日志写入失败不应影响主流程。 */
function swallow(p: Promise<unknown>): void {
  p.catch((e) => console.warn('[genLog] 写入失败:', e));
}

/** upsert：按 jobId 找到已存在则更新，不存在则创建。返回 logId。null 表示失败。 */
export async function upsertLog(
  jobId: string,
  patch: {
    projectId?: string | null;
    testCaseId?: string | null;
    status?: GenLogStatus;
    nl?: string;
    startUrl?: string | null;
  },
): Promise<string | null> {
  try {
    const log = await prisma.generationLog.upsert({
      where: { jobId },
      create: {
        jobId,
        projectId: patch.projectId ?? null,
        testCaseId: patch.testCaseId ?? null,
        nl: patch.nl ?? '',
        startUrl: patch.startUrl ?? null,
        status: patch.status ?? 'RUNNING',
      },
      update: {
        // 续接（continueGenerate）时允许更新这些元数据
        ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
        ...(patch.testCaseId !== undefined ? { testCaseId: patch.testCaseId } : {}),
        ...(patch.startUrl !== undefined ? { startUrl: patch.startUrl } : {}),
        ...(patch.nl ? { nl: patch.nl } : {}),
        ...(patch.status ? { status: patch.status } : {}),
      },
    });
    return log.id;
  } catch (e) {
    console.warn('[genLog] upsertLog 失败:', e);
    return null;
  }
}

/** 追加一条 step 到指定 logId。失败只 warn，不抛。 */
export function appendStep(logId: string | null | undefined, step: StepInput): void {
  if (!logId) return;
  swallow(
    prisma.generationStep
      .create({
        data: {
          logId,
          type: step.type,
          stepIndex: step.stepIndex ?? null,
          message: step.message ?? null,
          system: step.system ?? null,
          user: trunc(step.user) ?? null,
          assistant: trunc(step.assistant) ?? null,
          tool: step.tool ?? null,
          args: (step.args ?? null) as any,
          result: trunc(step.result) ?? null,
          error: step.error ?? null,
          usage: (step.usage ?? null) as any,
        },
      })
      .then(() => undefined),
  );
}

/** 回填工具步骤的模型回答（see 观察截图的作答滞后一轮到达）：按 logId+stepIndex 定位 TOOL 行写 assistant 列。
 *  updateMany 容忍行已清理/未落等场景（0 匹配静默）；失败只 warn，不阻断生成主流程。 */
export function updateStepAssistant(logId: string | null | undefined, stepIndex: number, assistant: string): void {
  if (!logId || !Number.isInteger(stepIndex)) return;
  swallow(
    prisma.generationStep
      .updateMany({
        where: { logId, stepIndex, type: STEP_TYPE.TOOL },
        data: { assistant: trunc(assistant) },
      })
      .then(() => undefined),
  );
}

/** 标记 job 结束状态（done/error/cancelled/paused）。 */
export function markFinished(
  jobId: string,
  status: GenLogStatus,
  extra?: { error?: string; scriptSteps?: TestStep[]; totalUsage?: TokenUsage },
): void {
  swallow(
    prisma.generationLog
      .update({
        where: { jobId },
        data: {
          status,
          finishedAt: new Date(),
          ...(extra?.error ? { error: extra.error } : {}),
          ...(extra?.scriptSteps ? { scriptSteps: extra.scriptSteps as any } : {}),
          ...(extra?.totalUsage ? { totalUsage: extra.totalUsage as any } : {}),
        },
      })
      .then(() => undefined),
  );
}

/** 仅更新状态（不写 finishedAt），用于暂停 / 恢复。 */
export function markStatus(jobId: string, status: GenLogStatus): void {
  swallow(
    prisma.generationLog
      .update({
        where: { jobId },
        data: { status, finishedAt: status === 'RUNNING' ? null : undefined },
      })
      .then(() => undefined),
  );
}

/** 列表查询。 */
export interface ListOpts {
  limit?: number;
  offset?: number;
  /** 模糊匹配用例标题或 NL 文本。 */
  keyword?: string;
  status?: GenLogStatus | 'ALL';
}

export async function listLogs(opts: ListOpts = {}): Promise<{ items: any[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where: any = {};
  if (opts.status && opts.status !== 'ALL') where.status = opts.status;
  if (opts.keyword) {
    where.OR = [
      { nl: { contains: opts.keyword } },
      { testCase: { is: { title: { contains: opts.keyword } } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.generationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        testCase: { select: { id: true, title: true } },
        _count: { select: { steps: true } },
      },
    }),
    prisma.generationLog.count({ where }),
  ]);
  return { items, total };
}

/** 详情：log + 全部 steps（按时间顺序）。 */
export async function getLogById(id: string): Promise<(any & { steps: any[] }) | null> {
  const log = await prisma.generationLog.findUnique({
    where: { id },
    include: {
      testCase: { select: { id: true, title: true } },
      steps: { orderBy: { createdAt: 'asc' } },
    },
  });
  return log;
}

/** 单条删除。 */
/**
 * usage 对账：Σ步骤明细 与 运行时累计（getUsage）取大者回写 totalUsage。
 * 背景：长会话中记账可能丢失部分轮次（如异常中止后 clear 时机），导致头部 < 明细和；
 * 步骤明细是逐轮落库的事实数据，取大者保证头部 ≥ 真实消耗。差异超 5% 时打告警日志供排查。
 * 注意：DONE/ERROR step 不参与求和——它们历史上曾携带运行时累计值（现已不落 usage），
 * 求和会把累计值与各步差分重复计入，导致头部翻倍。
 */
export async function reconcileTotalUsage(logId: string): Promise<void> {
  try {
    const rows = await prisma.generationStep.findMany({
      where: { logId, type: { notIn: [STEP_TYPE.DONE, STEP_TYPE.ERROR] } },
      select: { usage: true },
    });
    let sumTotal = 0;
    let sumCached = 0;
    let sumInput = 0;
    let sumOutput = 0;
    for (const r of rows) {
      const u = r.usage as any;
      if (!u) continue;
      sumTotal += Number(u.totalTokens ?? 0);
      sumCached += Number(u.cachedTokens ?? 0);
      sumInput += Number(u.inputTokens ?? 0);
      sumOutput += Number(u.outputTokens ?? 0);
    }
    const log = await prisma.generationLog.findUnique({ where: { id: logId }, select: { totalUsage: true } });
    const runtime = (log?.totalUsage as any) ?? {};
    const runtimeTotal = Number(runtime.totalTokens ?? 0);
    const runtimeCached = Number(runtime.cachedTokens ?? 0);
    const runtimeInput = Number(runtime.inputTokens ?? 0);
    const runtimeOutput = Number(runtime.outputTokens ?? 0);
    const finalTotal = Math.max(sumTotal, runtimeTotal);
    const finalCached = Math.max(sumCached, runtimeCached);
    const finalInput = Math.max(sumInput, runtimeInput);
    const finalOutput = Math.max(sumOutput, runtimeOutput);
    if (sumTotal > runtimeTotal * 1.05 && runtimeTotal > 0) {
      console.warn(`[usage] 记账疑似丢失：运行时累计 ${runtimeTotal} < 步骤明细和 ${sumTotal}（差 ${sumTotal - runtimeTotal}），头部以明细和为准`);
    }
    await prisma.generationLog.update({
      where: { id: logId },
      data: { totalUsage: { inputTokens: finalInput, outputTokens: finalOutput, totalTokens: finalTotal, cachedTokens: finalCached } },
    });
  } catch (e) {
    console.warn('[usage] 对账失败（保留原值）:', e);
  }
}

export async function deleteLog(id: string): Promise<void> {
  await prisma.generationLog.delete({ where: { id } });
}

/** 批量删除：返回实际删除条数。空数组视作全部清除。 */
export async function deleteLogs(ids: string[]): Promise<number> {
  if (!ids.length) {
    const r = await prisma.generationLog.deleteMany();
    return r.count;
  }
  const r = await prisma.generationLog.deleteMany({ where: { id: { in: ids } } });
  return r.count;
}

/** 全部清除。 */
export async function clearAllLogs(): Promise<number> {
  const r = await prisma.generationLog.deleteMany();
  return r.count;
}

/** 按保留天数清理过期记录。days=null/0/负数 视作永久，不清理。返回清理条数。 */
export async function pruneExpired(days: number | null | undefined): Promise<number> {
  if (!days || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const r = await prisma.generationLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (r.count > 0) console.log(`[genLog] 已清理 ${r.count} 条超过 ${days} 天的生成记录`);
  return r.count;
}
