import type OpenAI from 'openai';
import type { ReasoningEffort } from '../config';
import { getUsage, type TokenUsage } from './tokenUsage';
import { redactGenerationData, redactGenerationText } from './generation/privacy';

/** 工具结果：文本 + 可选截图（stateful 工具的截图槽随同槽降级/水位压缩回收，防历史截图滚雪球）。 */
export interface AgentToolResult {
  /** 旧文本/截图工具默认 success；动作失败必须显式返回 failed 或抛异常。 */
  status?: 'success' | 'failed' | 'uncertain';
  text: string;
  image?: string;
  recordedStep?: number;
  effect?: 'observed' | 'unknown';
  progressed?: boolean;
  stateFingerprint?: string;
  resetFields?: string[];
  observation?: string;
  observationKind?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /**
   * 返回文本（必填）+ 可选截图（base64 jpeg，不含 data: 前缀）。
   * 截图直接进入上下文，避免额外的图像描述调用；费用依模型而定。
   */
  execute: (args: Record<string, unknown>) => Promise<string | AgentToolResult>;
  /**
   * 大体积状态类结果（单状态槽治理）：新一轮同槽结果回灌时，历史同槽消息 content
   * 原地降级为一行占位——旧快照/旧截图的信息价值随页面变化归零，防止上下文滚雪球。
   * supersedes：新本槽结果同时使这些槽失效（如新快照使旧结构树的层级信息过期），一并降级。
   */
  stateful?: string;
  supersedes?: string[];
}

// —— 上下文治理常量（内部约定，无配置面）——
/** 普通工具回灌的单行化上限：超长时保留头尾，中间省略。 */
const RESULT_MAX_CHARS = 400;
/** 输入 token 水位：上一轮主调用输入达到该值时压缩中间历史（旁路观测 usage，不引入 tokenizer）。 */
const CONTEXT_WATERMARK_TOKENS = 60_000;
/** 水位压缩时保留最近几轮完整原文（一轮 = assistant + 其全部 tool 消息）。 */
const KEEP_RECENT_ROUNDS = 3;
/** 中间历史压缩时，单条消息保留的头部长度。 */
const TRIM_KEEP_CHARS = 80;

// —— 空转保护常量（滑动窗口检测「同工具 + 同参数」反复执行无进展）——
/** 滑动窗口大小（按变更类工具调用计）。 */
const STUCK_WINDOW = 8;
/** 窗口内同签名达到该次数 → 结果追加警告提示（模型自行调整）。 */
const STUCK_WARN_AT = 4;
/** 窗口内同签名达到该次数 → 挂起 gen:assist 请求人工决策。 */
const STUCK_ASSIST_AT = 6;
/** 同签名累计达到该次数 → 终止循环（按累计而非窗口计，防止 assist 重置窗口后无限续空转）。 */
const STUCK_ABORT_AT = 9;
/** 参与空转检测的变更类工具；观察类（snapshot/wait/see/readText/assert）重复属正常行为。 */
const STUCK_MUTATING = new Set(['goto', 'click', 'fill', 'press', 'check', 'select', 'component_action', 'act', 'batch_actions']);
/** see（视觉观察）自上次进展（goto/落库新步骤）以来连续达到该次数 → 挂起 gen:assist 人工决策。 */
const SEE_ASSIST_AT = 4;
/** 联动死锁检测：select 类成功调用近窗内同对元素的相邻转移达该次数 → 挂起人工决策。 */
const LINK_FLIP_TRANSITIONS = 4;
/** 联动死锁检测的滑动窗口（按 select 类成功调用计）。 */
const LINK_WINDOW = 12;

/** 空转签名归一化：同一目标元素 + 同参数视为同一操作（instruction 文本不参与，避免措辞变化绕过检测）。 */
export function stuckSig(name: string, args: Record<string, unknown>): string | null {
  if (!STUCK_MUTATING.has(name)) return null;
  const sel = String(args.selector ?? '').trim();
  if (name === 'goto') return `goto ${String(args.url ?? '')}`;
  if (name === 'batch_actions') return `batch ${JSON.stringify(args.actions ?? [])}`;
  if (name === 'check') return `check ${sel} ${args.checked ?? true}`;
  if (name === 'act') return `act ${String(args.instruction ?? '').trim()}`;
  if (name === 'component_action') return `component_action ${sel} ${String(args.action ?? '')} ${String(args.value ?? '')}`;
  if (name === 'fill' || name === 'select') return `${name} ${sel} ${String(args.value ?? '')}`;
  // click / press / check：同一 selector 即同一操作（press 另看按键）
  return `${name} ${sel}${args.key != null ? ` ${String(args.key)}` : ''}`;
}

/** select 类动作：参与联动死锁检测的调用（语义下拉选择，成功后可能被联动字段回设/清空）。 */
function isSelectLike(name: string, args: Record<string, unknown>): boolean {
  return name === 'select' || (name === 'component_action' && String(args.action ?? '') === 'select');
}

/**
 * 联动死锁签名：窗口内相邻转移最多的无序元素对。转移 = 相邻两次 select 类成功调用落在不同元素上
 * （同元素连选不构成「选 A 后 B 被打回」的翻转证据）。返回 null 表示没有元素对达到 LINK_FLIP_TRANSITIONS。
 * 级联表单的典型死循环是「选部门 → 账号被清空 → 选账号 → 部门被打回」：selector 编号随快照漂移、
 * 值也会换，按元素对转移计数才能聚成同一签名（同签名空转通道对这种漂移会拆散计数）。
 */
export function linkFlipPair(hist: string[]): { a: string; b: string; transitions: number } | null {
  if (hist.length < LINK_FLIP_TRANSITIONS + 1) return null;
  const counts = new Map<string, number>();
  for (let i = 1; i < hist.length; i++) {
    const p = hist[i - 1];
    const q = hist[i];
    if (p === q) continue;
    const key = p < q ? `${p}|${q}` : `${q}|${p}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: { key: string; n: number } | null = null;
  for (const [key, n] of counts) if (!best || n > best.n) best = { key, n };
  if (!best || best.n < LINK_FLIP_TRANSITIONS) return null;
  const [a, b] = best.key.split('|');
  return { a, b, transitions: best.n };
}

export interface ToolLoopOpts {
  /** OpenAI 兼容客户端（已带 usage 记账包装，如 createGatewayClient）。 */
  client: OpenAI;
  model: string;
  /** 主调用思考深度：low/high/max 透传 reasoning_effort；'' 发 thinking:{type:'disabled'} 真关闭（DeepSeek 思考模式默认打开且 effort=high，不发送≠关闭）。 */
  reasoningEffort?: ReasoningEffort;
  tools: AgentTool[];
  /** 会被循环原地修改（追加 assistant/tool 消息；水位压缩时也会原地截断历史内容）。 */
  messages: OpenAI.ChatCompletionMessageParam[];
  maxSteps: number;
  usageKey: string; // usage 记账的 jobId
  signal?: AbortSignal;
  /** 可选：模型调 finish 时的校验。返回 null 接受并结束；返回字符串则拒绝本次 finish，把该消息回灌给模型继续（如「脚本必须以断言结尾」）。 */
  validateFinish?: (args: Record<string, unknown>) => Promise<string | null>;
  /**
   * 可选：工具执行异常时先问钩子。返回 null → 错误照常回灌（模型自行调整重试）；
   * 返回字符串 → 作为「人工介入已完成」的替换结果回灌（如 assist 修正/手动捕获/跳过）。
   * 钩子自身抛出的异常会被吞掉并按 null 处理，不阻断主循环。
   */
  onFailure?: (name: string, args: Record<string, unknown>, error: string) => Promise<string | null>;
  /**
   * 可选：工具执行成功（未抛异常）时回调（如上层用于重置连续失败计数）。
   */
  onSuccess?: (name: string, args: Record<string, unknown>) => void;
  /**
   * 可选：空转保护升级回调（窗口内同签名变更类操作反复出现达 STUCK_ASSIST_AT，或 see 观察空转达 SEE_ASSIST_AT，
   * 或 select 类调用在两元素间交替翻转达 LINK_FLIP_TRANSITIONS）。
   * kind 缺省为 'repeat'（同签名重复）；'observe'为 see 连续无进展；'linkage'为联动字段死锁（detail 携带两元素的可读描述）。
   * 返回 null → 照常回灌并追加空转警告；返回字符串 →作为替换结果回灌（并重置该签名的窗口计数）。
   */
  onStuck?: (
    name: string,
    args: Record<string, unknown>,
    count: number,
    kind?: 'repeat' | 'observe' | 'linkage',
    detail?: string,
  ) => Promise<string | null>;
  /**
   * 可选：进展探针——工具成功执行后回调，返回该次调用是否算「有进展」。
   * 用于观察空转保护的重置口径（如「goto 导航或落库新脚本步骤」才算进展）；
   * 未传时 see 连击仍会累计，但任何变更类成功不重置（仅人工介入后重置）。
   */
  isProgress?: (name: string) => boolean;
  /** 从实际脚本重建已完成事实，供历史压缩；不额外调用模型。 */
  workingMemory?: () => string;
  /**
   * 可选：see 观察步骤的「模型回答」回传。截图回灌后，模型的作答在下一轮 completion 的 content 里
   * 滞后到达（执行序：see 结果+截图入上下文 → 下轮模型作答并决定下一步）；到达时按 see 的步骤序号回调，
   * 供上层落库（如写 GenerationStep.assistant，事后可查「模型当时对截图说了什么」）。content 为空不回调。
   */
  onAssistantContent?: (stepIndex: number, content: string) => void;
  /** 观察空转保护阈值：观测类工具连续 N 次画面无变化即挂起（onStuck kind='observe'）。缺省 4。 */
  seeAssistAt?: number;
  onStep: (info: { index: number; name: string; args: Record<string, unknown>; result: string; usageDelta: TokenUsage }) => void | Promise<void>;
}

export interface ToolLoopResult {
  finished: boolean;
  /** finish 工具带上的 message（若提供）。 */
  finishMessage?: string;
  /** finish 工具带上的 success（agent 语义；生成不填则为 undefined）。 */
  finishSuccess?: boolean;
  steps: number;
}

/** 单次工具调用前后的 usage 差分。 */
export function usageDelta(before: TokenUsage, after: TokenUsage): TokenUsage {
  return {
    inputTokens: after.inputTokens - before.inputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    totalTokens: after.totalTokens - before.totalTokens,
    cachedTokens: after.cachedTokens - before.cachedTokens,
  };
}

/** 空转警告回灌文本。 */
const stuckWarnText = (count: number): string =>
  `\n⚠️ 系统提示：同一操作近期已重复执行 ${count} 次且无进展。不要再次重复：请先 snapshot 确认当前状态，换一种方式（其他定位/组件动作/act）完成目标；若确认目标无法达成，请调用 finish(success=false) 结束。`;

/** 观察空转兜底警告（onStuck 钩子缺失/异常时回灌，引导模型主动求助而非继续盲看）。 */
const observeWarnText = (count: number): string =>
  `\n⚠️ 系统提示：已连续 ${count} 次观察仍无进展。不要继续盲目截图：请调用 ask_human 向用户求助（简述困惑点与已尝试的做法），或换一条路径完成目标。`;

/** 联动死锁兜底警告（onStuck 钩子缺失/异常/超时回灌）：给出级联表单的正确策略而非继续交替重设。 */
const linkFlipWarnText = (a: string, b: string, count: number): string =>
  `\n⚠️ 系统提示：元素「${a}」与「${b}」的 select 已交替成功执行 ${count} 轮——选择其中一个后另一个被页面回设/清空，疑似联动字段（当前组合不被页面接受）。不要继续交替重设：请先 snapshot 确认两字段当前值，改选与已选字段一致的组合（在其中一个字段的当前可选列表里另选），或调用 ask_human 向用户说明该联动现象并确认目标组合。`;

/**
 * 通用 tool-call 循环：模型每次从 tools 里选一个工具执行，结果以 {role:'tool'} 回灌，
 * 直到调用 finish（或达到 maxSteps / signal 中止）。每步执行后调 onStep 供上层推送进度。
 * 工具名 'finish' 视为终止：args 可带 success/message（agent 语义），生成仅用它表示脚本完成。
 *
 * 上下文治理（防雪球）：
 * - stateful 工具的结果在新一轮同槽回灌时，历史同槽消息原地降级为一行占位（supersedes 声明的连带失效槽一并降级）；
 * - 普通回灌超长做头尾保留的单行化（stateful 除外，各自工具内部已有上限）；
 * - 上一轮主调用输入超水位时压缩中间历史：保 system + 首条 user + 最近 KEEP_RECENT_ROUNDS 轮原文，
 *   中间消息正文截到一行、assistant tool_calls 参数瘦身（按上一轮输入而非累计判断，累计值单调递增会使水位失效）。
 *
 * 空转保护：变更类工具「同工具 + 同参数」在滑动窗口内反复执行时分级干预——
 * STUCK_WARN_AT 追加警告、STUCK_ASSIST_AT 挂起人工决策（onStuck）、
 * STUCK_ABORT_AT（按同签名累计计）强制终止循环（finished:false 交由上层走未收敛错误）。
 * 另有观察空转保护：see 自上次进展（isProgress：goto/落库新步骤）以来连续 SEE_ASSIST_AT 次
 * → 挂起人工决策（onStuck kind='observe'），覆盖「反复截图找入口却找不到」的卡死模式。
 * 另有联动死锁保护：select 类成功调用近窗内于两个元素间交替翻转达 LINK_FLIP_TRANSITIONS 次
 * （选其一另一个被页面回设，级联表单组合不被接受的死循环）→ 挂起人工决策（onStuck kind='linkage'）。
 */
export async function runToolLoop(opts: ToolLoopOpts): Promise<ToolLoopResult> {
  const { client, model, reasoningEffort, tools, messages, maxSteps, usageKey, signal, validateFinish, onFailure, onSuccess, onStuck, isProgress, onAssistantContent, onStep } = opts;
  const SEE_ASSIST_LIMIT = Math.max(1, opts.seeAssistAt ?? SEE_ASSIST_AT);
  let finished: { success: boolean; message: string } | null = null;
  let steps = 0;
  // —— 单状态槽登记：tool_call_id → { kind, round } ——
  const statefulSlots = new Map<string, { kind: string; round: number }>();
  let round = 0;
  // 续跑从已持久化的消息重建观测槽，包括动作附带的快照。
  const historicalTools = new Map<string, string>();
  for (const message of messages as any[]) {
    if (message.role === 'assistant') for (const tc of message.tool_calls ?? []) historicalTools.set(tc.id, tc.function?.name);
    if (message.role === 'tool') {
      const kind = message.__ttStateKind || tools.find(t => t.name === historicalTools.get(message.tool_call_id))?.stateful;
      if (kind) statefulSlots.set(message.tool_call_id, { kind, round: 0 });
    }
  }
  let lastObservedFingerprint: string | undefined;
  let unchangedObservations = 0;
  const recentEvidence: string[] = [];

  // —— 空转保护状态：滑动窗口（近期签名）+ 同签名累计（防 assist 重置后无限续空转）+ assist 闩锁 ——
  let stuckHist: string[] = [];
  const stuckTotal = new Map<string, number>();
  const stuckAssistLatched = new Set<string>();
  let stuckAbortMsg: string | null = null;
  // —— 观察空转保护状态：see 自上次进展以来的连击计数 ——
  let seeStreak = 0;
  // 待回传回答的 see 步骤序号：see 结果回灌后，模型作答在下一轮 completion 到达时按此序号回调
  let pendingSeeStep: number | null = null;
  // —— 联动死锁保护状态：select 类成功调用的近窗 selector 序列 + 各元素最近 instruction（供挂起文案可读化）——
  let linkHist: string[] = [];
  const linkLabels = new Map<string, string>();

  /** 普通结果单行化：超长保留头尾；stateful 结果不在此截断（各自工具内部已有上限）。 */
  const compactResult = (text: string, stateful: boolean): string => {
    if (stateful || text.length <= RESULT_MAX_CHARS) return text;
    return `${text.slice(0, 200)}\n…(中间省略)…\n${text.slice(-120)}`;
  };

  /** stateful 单状态槽：新的同槽结果入列前，把历史同槽（及被 supersede 的槽）消息 content 原地降级为一行占位；
   *  同槽截图（user 消息带 __ttSlotKind 标记）一并降级——旧画面信息价值随页面变化归零，多模态按张计价不回收会滚雪球。 */
  const demoteOldSlots = (kinds: string[], incomingId: string) => {
    for (const m of messages as any[]) {
      if (m.role !== 'tool' || m.tool_call_id === incomingId) continue;
      const slot = statefulSlots.get(m.tool_call_id);
      if (!slot || !kinds.includes(slot.kind)) continue;
      m.content = `（第 ${slot.round} 轮同槽结果已省略：索引/画面已失效，请以最新结果为准）`;
    }
    for (const m of messages as any[]) {
      if (m.role !== 'user' || !m.__ttSlotKind || !kinds.includes(m.__ttSlotKind)) continue;
      m.content = `（第 ${m.__ttSlotRound} 轮的截图已省略：画面已失效，请以最新结果为准）`;
      delete m.__ttSlotKind;
    }
  };

  /** 中间历史压缩时，assistant tool_calls 参数瘦身：长字符串值截断，保留结构（selector/key 等短字段可关联旧结果）。 */
  const shrinkArgs = (raw: unknown): string => {
    const text = typeof raw === 'string' ? raw : '';
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (typeof v === 'string' && v.length > TRIM_KEEP_CHARS) obj[k] = `${v.slice(0, TRIM_KEEP_CHARS)}…`;
        }
        return JSON.stringify(obj);
      }
    } catch {
      /* 非法 JSON：退化为原文截断 */
    }
    return text.length > TRIM_KEEP_CHARS * 2 ? `${text.slice(0, TRIM_KEEP_CHARS * 2)}…` : text;
  };

  /** 上一轮主调用的输入 token（≈当前上下文大小；不含工具内部触发的 LLM 调用）。 */
  let lastRoundInput = 0;

  /**
   * 上一轮输入超水位时压缩中间历史：保 system(0) + 首条 user(1) + 最近 N 轮完整原文；
   * 中间消息正文截到一行，assistant tool_calls 参数瘦身。
   * 按上一轮输入而非累计输入判断——累计值单调递增，会让水位在首次到达后每轮都触发/此前永不触发。
   */
  const compressIfNeeded = () => {
    const textSize = messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
    const rounds = messages.filter(m => m.role === 'assistant').length;
    if (opts.workingMemory && (rounds > 18 || textSize > 48000 || lastRoundInput > 20000)) {
      const starts = messages.map((m, i) => m.role === 'assistant' ? i : -1).filter(i => i >= 0);
      const cutAt = starts[Math.max(0, starts.length - 4)];
      if (cutAt != null && cutAt > 2) {
        const memory = redactGenerationText(usageKey, opts.workingMemory());
        const previous = (messages as any[]).find(m => m.__ttMemory)?.content ?? '';
        const facts = recentEvidence.length ? recentEvidence.join('\n') : String(previous).slice(-2500);
        messages.splice(2, cutAt - 2, { role: 'user', content: `【已执行事实；原始轨迹保留在日志】\n${memory}\n【近期证据与失败原因】\n${facts}\n未列为完成的目标仍需验证。`, __ttMemory: true } as any);
        const live = new Set((messages as any[]).filter(m => m.role === 'tool').map(m => m.tool_call_id));
        for (const id of statefulSlots.keys()) if (!live.has(id)) statefulSlots.delete(id);
      }
      return;
    }
    if (lastRoundInput < CONTEXT_WATERMARK_TOKENS) return;
    let seen = 0;
    let cut = 2; // 至少保住 system 与首条 user
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i] as any;
      if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
        seen++;
        if (seen > KEEP_RECENT_ROUNDS) {
          cut = i;
          break;
        }
      }
    }
    for (let i = 2; i < cut; i++) {
      const m = messages[i] as any;
      // 历史截图消息（工具未再调用、未经同槽降级的）：正文压占位并丢弃图片
      if (m.role === 'user' && m.__ttSlotKind) {
        m.content = `（历史截图已省略：画面已失效）`;
        delete m.__ttSlotKind;
        continue;
      }
      const text = typeof m.content === 'string' ? m.content : '';
      if (text.length > TRIM_KEEP_CHARS * 2) {
        m.content = `${text.slice(0, TRIM_KEEP_CHARS)}…（历史已压缩）`;
      }
      if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          if ((tc as any)?.function?.arguments) (tc as any).function.arguments = shrinkArgs((tc as any).function.arguments);
        }
      }
    }
  };

  for (let i = 0; i < maxSteps && steps < maxSteps; i++) {
    if (signal?.aborted) break;
    compressIfNeeded();
    round = i + 1;
    // 快照必须在 LLM 调用之前：调用返回时 usage 已入账，若在调用后才取快照，差分恒为 0。
    const base = { ...getUsage(usageKey) };
    // thinking/reasoning_effort 不在 openai v4 SDK 的类型里，网关透传，故整体放宽类型（同 preSplit）
    const req: Record<string, unknown> = {
      model,
      messages: messages.map(m => Object.fromEntries(Object.entries(m).filter(([key]) => !key.startsWith('__tt')))),
      tools: tools.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      tool_choice: 'auto',
      parallel_tool_calls: false,
    };
    if (reasoningEffort) req.reasoning_effort = reasoningEffort;
    else {
      // DeepSeek 思考模式默认打开且 effort=high，「不发送参数」≠关闭；显式发 thinking disabled 才真正关思考
      req.thinking = { type: 'disabled' };
      req.temperature = 0;
    }
    let completion;
    try {
      completion = await client.chat.completions.create(req as never, signal ? { signal } : undefined);
    } catch (error) {
      // 暂停/取消是正常出口，保留调用方持有的 messages 供检查点保存。
      if (signal?.aborted) break;
      throw error;
    }
    // 记录本轮主调用输入（=当前上下文大小），供下轮水位判断；此区间仅该调用，差分即其输入
    lastRoundInput = getUsage(usageKey).inputTokens - base.inputTokens;
    const msg = redactGenerationData(usageKey, completion.choices?.[0]?.message);
    const toolCalls = msg?.tool_calls ?? [];

    // see 的「模型作答」滞后一轮到达：本轮 content 即上一轮 see 观察的回应，按步骤序号回传上层落库
    if (pendingSeeStep != null && msg?.content) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      try {
        onAssistantContent?.(pendingSeeStep, content);
      } catch {
        /* 落库异常不阻断主循环 */
      }
      pendingSeeStep = null;
    }

    if (!toolCalls.length) {
      // 模型直接输出结论而未调用 finish → 视为未完成，交由上层判定
      return { finished: false, finishMessage: msg?.content ?? undefined, steps };
    }

    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls } as OpenAI.ChatCompletionMessageParam);
    // prev 随工具逐个推进：本轮 LLM 的用量记在首个工具上，后续工具（无 LLM 调用）为 0，
    // 工具内部触发 LLM（act/observe/see）的用量则记在该工具上。
    let prev = base;
    const answeredIds = new Set<string>();
    for (const tc of toolCalls) {
      if (signal?.aborted || finished || steps >= maxSteps) {
        // 中止时为剩余 tool_calls 补占位消息：否则 messages 留下孤儿 tool_calls（协议违规，续跑时网关 400）
        messages.push({ role: 'tool', tool_call_id: tc.id, content: finished ? '（未执行：任务已结束）' : signal?.aborted ? '（已中止）' : '（未执行：已达到工具步数上限）' } as OpenAI.ChatCompletionMessageParam);
        continue;
      }
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function?.arguments ?? '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }
      const tool = tools.find((t) => t.name === tc.function?.name);
      let stateful = Boolean(tool?.stateful);
      let resultData: AgentToolResult | undefined;
      let humanIntervened = false;
      let result: string;
      let resultImage: string | undefined;
      let toolOk = false; // 工具执行是否成功（观察空转保护：仅成功调用参与连击/重置）
      if (tool?.name === 'finish') {
        // 有校验钩子（如「最后一步必须是断言」）时先校验；拒绝则回灌消息继续，不结束
        let rejectMsg: string | null;
        try {
          rejectMsg = validateFinish ? await validateFinish(args) : null;
        } catch (error) {
          if (!signal?.aborted) throw error;
          rejectMsg = '（已中止）';
        }
        if (signal?.aborted) rejectMsg = '（已中止）';
        if (rejectMsg) {
          result = rejectMsg;
        } else {
          finished = { success: Boolean(args.success), message: String(args.message ?? '') };
          result = `${'success' in args ? `测试结束：${finished.success ? '通过' : '失败'}` : '脚本生成结束'}${finished.message ? ` — ${finished.message}` : ''}`;
        }
      } else if (tool) {
        try {
          const r = await tool.execute(args);
          if (typeof r === 'string') {
            result = r;
          } else {
            resultData = r;
            result = r.text;
            resultImage = r.image;
            if (r.status === 'failed') throw new Error(r.text);
          }
          toolOk = typeof r === 'string' || r.status == null || r.status === 'success';
          if (toolOk) onSuccess?.(tool.name, args);
        } catch (e) {
          const err = redactGenerationText(usageKey, String(e));
          // 失败先问 onFailure 钩子：null → 错误照常回灌让模型自愈；字符串 → 人工介入完成的替换结果
          let override: string | null = null;
          if (onFailure && !signal?.aborted) {
            try {
              override = await onFailure(tool.name, args, err);
            } catch {
              override = null;
            }
          }
          humanIntervened = override != null;
          result = override ?? `错误：${err}`;
        }
      } else {
        result = `未知工具：${tc.function?.name}`;
      }
      // —— 空转保护：滑动窗口内同签名变更类操作反复出现时分级干预 ——
      // 执行/记录和任务进展分离。宿主有实际状态信号时优先使用；兼容其他调用方的探针。
      const toolName = tc.function?.name ?? '';
      const progressed = !finished && resultData?.progressed != null ? resultData.progressed : toolOk && !finished ? Boolean(isProgress?.(toolName)) : false;
      const sig = stuckSig(toolName, args);
      if (sig && !finished && !progressed && !signal?.aborted) {
        stuckHist.push(sig);
        if (stuckHist.length > STUCK_WINDOW) stuckHist.shift();
        const total = (stuckTotal.get(sig) ?? 0) + 1;
        stuckTotal.set(sig, total);
        const inWindow = stuckHist.filter((s) => s === sig).length;
        if (total >= STUCK_ABORT_AT) {
          stuckAbortMsg = `空转保护：同一操作「${sig.slice(0, 60)}」已累计重复 ${total} 次仍无进展，为避免无效消耗已自动终止本次生成`;
          result += `\n（空转保护：本次生成已被强制终止）`;
        } else if (inWindow >= STUCK_ASSIST_AT && !stuckAssistLatched.has(sig)) {
          // 闩锁：同签名一个窗口周期只挂起一次 assist（超时未响应不反复弹窗）；用户决策后重新武装
          stuckAssistLatched.add(sig);
          let override: string | null = null;
          try {
            override = onStuck ? await onStuck(toolName, args, inWindow) : null;
          } catch {
            override = null; // 钩子异常按 null 处理，不阻断主循环
          }
          if (override != null) {
            humanIntervened = true;
            result = override;
            stuckHist = stuckHist.filter((s) => s !== sig); // 用户已介入决策，给该签名新预算
            stuckAssistLatched.delete(sig);
          } else {
            result += stuckWarnText(inWindow);
          }
        } else if (inWindow >= STUCK_WARN_AT) {
          result += stuckWarnText(inWindow);
        }
      }
      // —— 观察空转保护：观察自上次实际进展以来连续停滞达阈值 → 挂起人工决策 ——
      // 仅计成功执行：失败的观察/动作不重置也不累计（失败本身会走 onFailure/同签名空转通道）
      const observationTool = ['see', 'snapshot', 'page_tree', 'readText', 'api'].includes(toolName);
      const fingerprint = resultData?.stateFingerprint ?? (observationTool && toolName !== 'see' ? `${toolName}:${result}` : undefined);
      if (fingerprint) {
        if (fingerprint === lastObservedFingerprint) unchangedObservations++;
        else { lastObservedFingerprint = fingerprint; unchangedObservations = 0; }
      }
      if (observationTool && !finished && toolOk && !signal?.aborted && (toolName === 'see' || unchangedObservations > 0)) {
        seeStreak++;
        if (seeStreak >= SEE_ASSIST_LIMIT) {
          let override: string | null = null;
          try {
            override = onStuck ? await onStuck(toolName, args, seeStreak, 'observe') : null;
          } catch {
            override = null; // 钩子异常按 null 处理，不阻断主循环
          }
          if (override != null) { result = override; humanIntervened = true; } // 人工决策作为替换结果回灌（与同签名空转同模式）
          else result += observeWarnText(seeStreak);
          seeStreak = 0; // 介入后给新一轮预算
        }
      } else if (tool && !finished && progressed) {
        unchangedObservations = 0;
        seeStreak = 0; // 实际状态推进，重置观察连击
      }
      // —— 联动死锁保护：select 类成功调用在两个元素间交替（选择其一另一个被页面回设）达阈值 → 挂起人工决策 ——
      // 仅计成功执行：失败的 select 不构成「选上又被联动打回」的翻转证据（失败本身走 onFailure/同签名空转通道）；
      // 与同签名重复通道不会同时达到挂起阈值（同签名占窗 6+ 时窗口余量不足以构成 4 次转移），不会连环弹窗。
      if (!finished && toolOk && tool && !signal?.aborted && isSelectLike(toolName, args) && (resultData?.resetFields == null || resultData.resetFields.length > 0)) {
        const sel = String(args.selector ?? '').trim();
        if (sel) {
          linkHist.push(sel);
          if (linkHist.length > LINK_WINDOW) linkHist.shift();
          if (args.instruction) linkLabels.set(sel, String(args.instruction).slice(0, 60));
          const flip = linkFlipPair(linkHist);
          if (flip) {
            const label = (s: string) => (linkLabels.get(s) ? `「${linkLabels.get(s)}」(元素 ${s})` : `元素 ${s}`);
            let override: string | null = null;
            try {
              override = onStuck ? await onStuck(toolName, args, flip.transitions, 'linkage', `${label(flip.a)} 与 ${label(flip.b)}`) : null;
            } catch {
              override = null; // 钩子异常按 null 处理，不阻断主循环
            }
            if (override != null) { result = override; humanIntervened = true; } // 人工决策作为替换结果回灌（同签名/观察空转同模式）
            else result += linkFlipWarnText(flip.a, flip.b, flip.transitions);
            linkHist = []; // 介入后清窗，给新一轮预算
          }
        }
      }
      if (humanIntervened && !signal?.aborted) {
        // 人工处理可能已改动页面，不能继续附上介入之前的观测。
        resultData = { ...resultData, text: result, observation: undefined, observationKind: undefined };
        try {
          const fresh = await tools.find(t => t.name === 'snapshot')?.execute({});
          if (fresh != null) resultData = { ...resultData, text: result, observation: typeof fresh === 'string' ? fresh : fresh.text, observationKind: 'snapshot' };
        } catch { result += '\n人工处理后请重新 snapshot 获取当前页面。'; }
      }
      if (!stateful && toolName !== 'finish') {
        recentEvidence.push(`${toolName} ${JSON.stringify(args).slice(0, 250)} => ${result.slice(0, 550)}`);
        if (recentEvidence.length > 8) recentEvidence.shift();
      }
      const stateKind = resultData?.observationKind ?? tool?.stateful;
      if (resultData?.observation) {
        result += `\n${resultData.observation}`;
        stateful = true;
      }
      result = redactGenerationText(usageKey, result);
      const after = { ...getUsage(usageKey) };
      const delta = usageDelta(prev, after);
      prev = after;
      steps++;
      await onStep({ index: steps, name: tc.function?.name ?? '', args, result, usageDelta: delta });
      if ((tc.function?.name ?? '') === 'see') pendingSeeStep = steps;
      if (stateKind) {
        // 新同槽结果入列前，降级历史同槽与被 supersede 的槽（本轮并行重复结果同样被降级，仅留最新）
        demoteOldSlots([stateKind, ...(tool?.supersedes ?? []), ...(stateKind === 'snapshot' ? ['tree', 'screenshot'] : [])], tc.id);
        statefulSlots.set(tc.id, { kind: stateKind, round });
      }
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: compactResult(result, stateful),
        ...(stateKind ? { __ttStateKind: stateKind } : {}),
      } as OpenAI.ChatCompletionMessageParam);
      if (resultImage) {
        // 截图直连：以 user 消息紧随工具结果（协议合法：全部 tool_call 应答前允许夹 user 消息）。
        // 带 __ttSlotKind 标记：同槽降级与水位压缩按标记回收，防止历史截图在上下文滚雪球。
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: `（${tc.function?.name ?? ''} 截图，对应上一条工具结果）` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${resultImage}` } },
          ],
          __ttSlotKind: tool?.stateful ?? '',
          __ttSlotRound: round,
        } as any as OpenAI.ChatCompletionMessageParam);
      }
      answeredIds.add(tc.id);
      if (stuckAbortMsg) break;
    }
    if (stuckAbortMsg) {
      // 为本轮未应答的 tool_calls 补占位消息（同中止路径）：否则 messages 留下孤儿 tool_calls（协议违规，续跑时网关 400）
      for (const tc of toolCalls) {
        if (!answeredIds.has(tc.id)) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: '（空转保护终止）' } as OpenAI.ChatCompletionMessageParam);
        }
      }
      return { finished: false, finishMessage: stuckAbortMsg, steps };
    }
    if (finished) break;
  }

  return { finished: Boolean(finished), finishMessage: finished?.message, finishSuccess: finished?.success, steps };
}
