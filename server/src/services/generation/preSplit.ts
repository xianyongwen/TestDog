import { testIntentSchema, type TestIntent } from '../../shared/testIntent';
import type OpenAI from 'openai';
import { redactGenerationText } from './privacy';
import type { ReasoningEffort } from '../../config';
import { getUsage, type TokenUsage } from '../tokenUsage';
import { usageDelta } from '../toolLoop';
import { appendStep, STEP_TYPE } from '../generationLogService';
import { enabledActionVocabulary } from '../pluginStore';
import { safeJsonParse, stripFences } from './util';
import type { PlanStep, SplitImage } from './types';

/** 始终附加协议（含自定义拆分提示词），避免旧模板静默跳过验收目标。 */
export const INTENT_OUTPUT_PROMPT = `
【测试意图与输出协议（覆盖旧版 steps-only 示例）】
输出 JSON：{"intent":{"version":1,"scenario":"positive|negative|mixed","objective":"测试目标","preconditions":["必要前置条件"],"data":[{"name":"字段名","value":"测试值或 {{变量}}","policy":"fixed|generated"}],"criteria":[{"id":"C1","description":"验收结果","target":"具体元素/记录/字段范围；使用本次唯一值锚定","source":"用户需求原文或验收依据；推断项明确写待确认","required":true,"assertion":{"type":"text_exact","expected":"完整期望值"}}],"cleanup":[]},"steps":[...]}。
- intent 是待用户确认的验收约定。只覆盖用户要求，不擅自扩大测试范围；未知业务规则写待确认，不从页面当前表现推定正确结果。
- criteria 至少一个 required=true；每个必验目标都对应一个计划断言，断言步骤携带 criterionId，类型和 expected 与目标完全一致。
- 支持的浏览器断言：visible/hidden/text(包含)/text_exact(规范化空白后全文相等)/value(输入值精确相等)/checked/unchecked/enabled/disabled/count(匹配节点数，expected 为非负整数字符串)/url(包含)/url_exact(相等)。value/text_exact 可期望空字符串。不要计划生成器不能执行的接口或 WS 断言。
- 优先验证指定记录及字段的持久业务结果，不能只检查全页通用前缀或成功 toast；不虚构接口路径，HTTP 200 不能代替业务验收。只有需求涉及持久化时才补刷新验证。
- 用户指定数据 policy=fixed；仅用户允许自由生成的测试数据用 generated 和系统变量。负向测试的非法/重复值必须保留，预期拒绝也是正确结果，不能改值追求提交成功。
- 业务规则没把握的验收目标（source/target 写「待确认」）不得设为 required=true：无法预知正确结果就写不出可执行断言，改 required=false（覆盖报告仍展示但不阻塞完成），由用户在确认页定夺后修订。
- 断言类型必须匹配目标形态：目标是输入框/文本域/下拉/日期等表单控件的当前值用 value（label/placeholder 定位到的是控件本体），列表单元格、详情等已渲染文本用 text/text_exact；对表单控件用 text 断言必然失败（控件 innerText 恒为空）。
- preconditions/cleanup 只描述有依据的要求；需要执行的准备/清理动作写入 steps，最终仍保留结果断言。没有清理要求时 cleanup=[]。
`;

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
  signal?: AbortSignal,
): Promise<{ steps: PlanStep[] | null; intent?: TestIntent; usage: TokenUsage }> {
  // reasoning_effort 不在 openai v4 SDK 的类型里，网关透传，故整体放宽类型
  const fullUser = redactGenerationText(jobId, `${envVarHint ? envVarHint + '\n\n' : ''}${userContent}`);
  systemContent = redactGenerationText(jobId, systemContent + INTENT_OUTPUT_PROMPT);
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
  const res = await client.chat.completions.create(req as never, signal ? { signal } : undefined);
  const text = redactGenerationText(jobId, res.choices?.[0]?.message?.content ?? '');
  // 网关的真实 usage 由 createGatewayClient 在底层入账，这里用差分拿到本次调用消耗
  const usage = usageDelta(before, getUsage(jobId));
  const parsed = safeJsonParse(stripFences(text)) as { steps?: any[]; intent?: unknown } | undefined;
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
  const intent = testIntentSchema.safeParse(parsed?.intent);
  if (!intent.success) throw new Error(`测试意图格式不完整：${intent.error.issues.map(i => i.message).join("；")}`);
  return {
    intent: intent.data,
    steps: steps
      .map((s: any): PlanStep | null => {
        const instruction = String(s?.instruction ?? '').trim();
        if (!instruction) return null;
        return {
          criterionId: typeof s?.criterionId === 'string' ? s.criterionId : undefined,
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
