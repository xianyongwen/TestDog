import type OpenAI from 'openai';
import type { ReasoningEffort } from '../../config';
import { getUsage, type TokenUsage } from '../tokenUsage';
import { usageDelta } from '../toolLoop';
import { appendStep, STEP_TYPE } from '../generationLogService';
import { enabledActionVocabulary } from '../pluginStore';
import { safeJsonParse, stripFences } from './util';
import type { PlanStep, SplitImage } from './types';

/** 插件动作词表 → 预拆分 prompt 的【组件语义动作】段（空词表返回空串，不拼段落）。 */
function semanticActionSection(vocab: { name: string; doc?: string; preferFill?: boolean }[]): string {
  if (!vocab.length) return '';
  const lines = vocab
    .map((v) => `  · "${v.name}"：${(v.doc ?? '').trim()}${v.preferFill ? '（可输入控件会优先尝试直接填写）' : ''}`)
    .join('\n');
  return `\n\n【组件语义动作】当前项目注册了以下组件库语义动作。遇到对应组件（如组件库下拉、日期选择器等非原生控件）时，优先把该操作拆分为**一个**语义动作步："action" 填动作名，"value" 填主要参数（选项文本/日期），目标元素仍写在 "instruction" 里——执行期平台会自动匹配组件库插件完成，无需拆成多步点击。原生 <select> 与普通输入框不要使用语义动作：\n${lines}`;
}

/** 拆分 system prompt 拼接插件动作词表段（按项目预设解析词表；无词表时原样返回）。 */
export async function splitSystemWithVocab(base: string, projectId?: string | null): Promise<string> {
  try {
    const vocab = await enabledActionVocabulary(projectId ?? undefined);
    return base + semanticActionSection(vocab);
  } catch {
    // 词表解析失败不阻塞拆分（退回基础动作词表）
    return base;
  }
}

/** 预拆分：一次结构化输出调用，返回「步骤 + 本次调用 usage」。reasoningEffort 非空时发 reasoning_effort（推理模型），'' 时发 thinking disabled 真关闭 + temperature=0。
 *  images 非空时（主模型具备视觉能力），user content 构建为「文本 + 图片」多模态数组，直接让主模型看图。
 *  steps 为 null 表示调用失败/未解析出步骤；usage 始终返回（供 gen:plan 消息展示本次多模态调用的 token 消耗）。 */
export async function preSplit(
  client: OpenAI,
  model: string,
  systemContent: string,
  userContent: string,
  envVarHint: string,
  reasoningEffort: ReasoningEffort,
  logId: string | null,
  jobId: string,
  images: SplitImage[] = [],
): Promise<{ steps: PlanStep[] | null; usage: TokenUsage }> {
  // reasoning_effort 不在 openai v4 SDK 的类型里，网关透传，故整体放宽类型
  const fullUser = `${envVarHint ? envVarHint + '\n\n' : ''}${userContent}`;
  const userMsgContent: unknown = images.length
    ? [
        { type: 'text', text: fullUser },
        ...images.map((img) => ({
          type: 'image_url',
          image_url: { url: `data:${img.imageMime || 'image/png'};base64,${img.imageB64}` },
        })),
      ]
    : fullUser;
  const req: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userMsgContent },
    ],
    response_format: { type: 'json_object' },
  };
  if (reasoningEffort) req.reasoning_effort = reasoningEffort;
  else {
    // DeepSeek 思考模式默认打开且 effort=high，「不发送参数」≠关闭；显式发 thinking disabled 才真正关思考
    req.thinking = { type: 'disabled' };
    req.temperature = 0;
  }
  // 必须在 LLM 调用之前快照：调用返回时 usage 已入账，否则差分恒为 0
  const before = { ...getUsage(jobId) };
  const res = await client.chat.completions.create(req as never);
  const text = res.choices?.[0]?.message?.content ?? '';
  // 网关的真实 usage 由 createGatewayClient 在底层入账，这里用差分拿到本次调用消耗
  const usage = usageDelta(before, getUsage(jobId));
  const parsed = safeJsonParse(stripFences(text)) as { steps?: any[] } | undefined;
  const steps = Array.isArray(parsed?.steps) ? parsed.steps : null;
  if (logId) {
    appendStep(logId, {
      type: STEP_TYPE.PLAN,
      system: systemContent,
      user: fullUser,
      assistant: text || null,
      usage,
    });
  }
  if (!steps) return { steps: null, usage };
  return {
    steps: steps
      .map((s: any): PlanStep | null => {
        const instruction = String(s?.instruction ?? '').trim();
        if (!instruction) return null;
        return {
          kind: s?.kind === 'assert' ? 'assert' : 'action',
          instruction,
          action: s?.action,
          url: s?.url != null ? String(s.url) : undefined,
          value: s?.value != null ? String(s.value) : undefined,
          key: s?.key != null ? String(s.key) : undefined,
          assertion: s?.assertion && typeof s.assertion === 'object' ? { ...s.assertion } : undefined,
        };
      })
      .filter((s): s is PlanStep => s !== null),
    usage,
  };
}
