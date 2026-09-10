import { publish, type ServerMsg } from '../../ws/hub';
import { appendStep, markFinished, markStatus, STEP_TYPE, updateStepAssistant, type GenLogStatus } from '../generationLogService';
import type { TokenUsage } from '../tokenUsage';
import { trunc } from './util';
import { redactGenerationData, redactGenerationText } from './privacy';

/** jobId -> 当前活跃 logId 的运行时映射。done/error 时清空；paused 时保留以便 continue 续写。 */
export const activeLogIds = new Map<string, string>();

/** publish 的本地包装：发送 WS 同时把事件落到生成记录。 */
export function pub(msg: ServerMsg): void {
  if (msg.jobId) msg = redactGenerationData(String(msg.jobId), msg);
  publish(msg);
  const logId = msg.jobId ? activeLogIds.get(msg.jobId as string) : null;
  if (logId) logFromWsEvent(msg, logId);
}

/** 把 WS 事件转成日志 step / 状态更新。 */
function logFromWsEvent(msg: ServerMsg, logId: string): void {
  switch (msg.type) {
    case 'gen:status':
      appendStep(logId, { type: STEP_TYPE.STATUS, message: String(msg.message ?? '') });
      return;
    case 'gen:tool': {
      const s = (msg.step as any) ?? {};
      appendStep(logId, {
        type: STEP_TYPE.TOOL,
        stepIndex: typeof msg.index === 'number' ? msg.index : null,
        tool: String(s.actionLabel ?? ''),
        message: String(s.actionDetail ?? ''),
        result: String(s.result ?? ''),
        args: (msg.args ?? null) as any,
        usage: (msg.usage as TokenUsage) ?? null,
      });
      return;
    }
    case 'gen:plan':
      // 预拆分调用的 usage 已由 PLAN step 记录（差分），此处不再重复入账
      appendStep(logId, {
        type: STEP_TYPE.STATUS,
        message: `预拆分完成，请确认步骤计划（${Array.isArray(msg.steps) ? msg.steps.length : 0} 步）`,
      });
      return;
    case 'gen:coverage':
      appendStep(logId, { type: STEP_TYPE.STATUS, message: '验收覆盖已更新', args: { coverage: msg.coverage } });
      return;
    case 'gen:revoke':
      appendStep(logId, {
        type: STEP_TYPE.REVOKE,
        message: `已撤销第 ${msg.from}~${msg.to} 步`,
        args: { from: msg.from, to: msg.to, nl: msg.nl },
      });
      return;
    case 'gen:revise':
      appendStep(logId, {
        type: STEP_TYPE.REVISE,
        message: `模型修订脚本步骤（${Array.isArray(msg.ops) ? msg.ops.length : 0} 项操作）`,
        args: { ops: msg.ops, base: msg.base },
      });
      return;
    case 'gen:assist':
      appendStep(logId, {
        type: STEP_TYPE.ASSIST,
        stepIndex: typeof msg.stepIndex === 'number' ? msg.stepIndex : null,
        message: String(msg.instruction ?? ''),
        args: { kind: msg.kind, canManual: msg.canManual },
      });
      return;
    case 'gen:assist-status':
      appendStep(logId, { type: STEP_TYPE.STATUS, message: String(msg.message ?? '') });
      return;
    case 'gen:paused':
      appendStep(logId, { type: STEP_TYPE.STATUS, message: '已暂停，可继续生成' });
      if (msg.jobId) markStatus(msg.jobId as string, 'PAUSED');
      return;
    case 'gen:done': {
      const stepCount = (msg.script as any)?.steps?.length ?? 0;
      const usage = (msg.usage as TokenUsage) ?? null;
      // DONE step 不落 usage：它携带的是运行时累计值，落明细会与各步差分重复计入（reconcile 求和翻倍）；
      // 累计值只走 markFinished 写入头部 totalUsage。
      appendStep(logId, {
        type: STEP_TYPE.DONE,
        message: `生成完成，共 ${stepCount} 步`,
        args: { stepCount, intent: (msg.script as any)?.intent },
      });
      if (msg.jobId) {
        markFinished(msg.jobId as string, 'DONE', {
          scriptSteps: (msg.script as any)?.steps,
          totalUsage: usage ?? undefined,
        });
      }
      return;
    }
    case 'gen:error': {
      const message = String(msg.message ?? '');
      const isCancel = message.includes('取消');
      const status: GenLogStatus = isCancel ? 'CANCELLED' : 'ERROR';
      const usage = (msg.usage as TokenUsage) ?? null;
      // ERROR step 不落 usage（运行时累计值，同 gen:done），累计只走 markFinished 写头部
      appendStep(logId, { type: STEP_TYPE.ERROR, error: message });
      if (msg.jobId) {
        markFinished(msg.jobId as string, status, {
          error: message,
          totalUsage: usage ?? undefined,
        });
      }
      return;
    }
  }
}

/** 直接以给定的 usage 增量推送工具步骤（toolLoop onStep 路径：增量已由循环差分好，不可再差分）。
 *  args 为可选的结构化补充数据（如脚本审查的模型原始输出、see 观察的完整 question），只落库不推送展示。 */
export function pubToolWithUsage(jobId: string, index: number, actionLabel: string, actionDetail: string, result: string, usage: TokenUsage, args?: unknown): void {
  pub({
    type: 'gen:tool',
    jobId,
    index,
    step: { actionLabel, actionDetail, result: trunc(result, 300) },
    usage,
    args,
  });
}

/** 回填 see 观察步骤的模型回答（GenerationStep.assistant）：toolLoop 下一轮 completion 到达时回调，
 *  只写库不推送——回答晚于该步骤的 WS 事件到达，属事后补录，供事后排查「模型当时对截图说了什么」。 */
export function updateToolAssistant(jobId: string, stepIndex: number, assistant: string): void {
  updateStepAssistant(activeLogIds.get(jobId), stepIndex, redactGenerationText(jobId, assistant));
}
