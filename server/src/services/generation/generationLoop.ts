import type { TestIntent } from '../../shared/testIntent';
import { testIntentSchema } from '../../shared/testIntent';
import { completionError, coverageStatus, evidenceSignature, type AssertionEvidence } from './intentCoverage';
import { buildWorkingMemory } from './workingMemory';
import type OpenAI from 'openai';
import type { getConfig, ReasoningEffort } from '../../config';
import { applyReviseOps, absorbProbeClick, revokeStepRange, type EmitOutcome, type ReviseOp, type TestStep } from '../../shared/testScript';
import { legacyToUnifiedSystemVars } from '../../shared/envVars';
import { runToolLoop, usageDelta } from '../toolLoop';
import { buildGenTools, type GenToolContext } from '../generationToolHost';
import { NetworkCapture } from '../networkCaptureService';
import { enabledActionVocabulary } from '../pluginStore';
import { getUsage } from '../tokenUsage';
import { askUser, revokeHandlers } from './jobControl';
import { pub, pubToolWithUsage, updateToolAssistant } from './logBridge';
import { createManualCapture } from './manualCapture';
import { normalizeStepSystemVars, safeJsonParse, stripFences } from './util';
import { createValueBinder } from './valueBinding';
import type { Substituter } from './substitution';
import type { AssistDecision, PlanStep } from './types';
import { redactGenerationData } from './privacy';

const MAX_ASSIST_PER_STEP = 3;
/** 断言同签名累计失败达该次数 → 挂起 gen:assist：断言是「判断」不是「动作」，同目标重试不会改变页面结果。 */
const ASSERT_FAIL_ASSIST_AT = 2;
/** 观察类工具（与 toolLoop STUCK_MUTATING 互补，新增动作工具默认可重置）：
 *  成功不代表流程推进（页面状态未变），不重置变更类连续失败计数——
 *  否则「断言失败 → snapshot/readText 观察 → 再断言」会不断清零，阈值永远达不到。 */
const GEN_OBSERVATION_TOOLS = new Set(['snapshot', 'page_tree', 'wait', 'readText', 'see', 'api']);

/** 生成循环的 system prompt：工具使用规范 + 大纲软约束 + 占位符规则（大纲在 user 侧注入）。 */
const GEN_LOOP_SYSTEM_PROMPT = `你是 Web 测试脚本生成 Agent：通过调用工具在真实浏览器里完成测试目标，每一步成功操作都会自动记录为脚本步骤。

操作规范：
1. 首次动手前获取 snapshot。动作结果若已附最新快照，直接据此继续，不要重复观察。快照默认聚焦浮层/视口，找不到目标用 scope=page + query。文本快照与 see 截图是并列的观测手段：选项列表被虚拟滚动截断、元素文本与预期对不上、编号表里找不到目标、需要确认视觉状态时，直接 see（带 question 聚焦关注点），不要靠反复填写/点击试错；字段值和校验文字仍以文本快照为准。
2. 独立字段可用 batch_actions 一次规划多个 fill/check/select，宿主串行执行并在变化时停止；按返回的已完成清单继续，不重做。联动字段、提交和弹窗切换单步处理。act 兜底一次只执行一个最匹配候选，复合目标根据新状态继续。取消勾选明确传 checked=false。元素引用：工具的 selector 参数填 snapshot 编号表里的元素编号（如 "12"）；使用编号时携带对应 snapshotVersion；旧版本会被拒绝。编号表里找不到目标、或需要页面层级结构时，才调用 page_tree 获取完整语义树（体积大，不要反复调用）；树内编号不能用作 selector。
3. 每个动作工具的 instruction 必填：写一句自然语言描述（如「点击登录按钮」），它会被保存进脚本用于回放自愈。
4. 组件库假控件（antd/element 的下拉、日期面板等）不是原生控件：不要对下拉触发器用 fill/select 原生方式；若可用工具中有 component_action（组件语义动作，如选择下拉选项、设置日期），优先使用它。select 必须传具体 value，或对 Ant Design、Element 普通下拉/原生 select 传 args.index（0=第一项，1=第二项，与 value 二选一）；instruction 不代替参数。按序选择无需先展开或截图识别名称，直接调用组件动作。参数错误只修正参数后重试本动作。
5. 可输入控件（日期输入框等）直接用 fill 填值（如日期 2026-05-04），不要逐格点击。
6. wait 工具用于等待弹层动画/加载结束（多帧稳定判定），不要盲目连续点击。点击或其他动作后若结果快照显示新弹框已经出现，下一步必须先调用 wait(ms="500") 等待至少 500 毫秒，让弹框过渡动画完成；等待完成前不要读取或操作弹框内的控件，也不要直接使用弹框快照中的元素编号。
7. 遇到错误不要重复同一操作：先 snapshot 查看当前状态，换路径或调整参数；连续失败会请求人工协助。已成功执行的步骤都会自动记录为脚本步骤，不要重做——重复登录/重复提交只会产生冗余步骤、还可能破坏当前页面状态。
8. 级联/联动下拉：若选择某字段后另一个字段的值被页面清空/回设，可能存在联动、异步加载或产品缺陷，不能据此认定组合无效。先检查校验信息和需求——先选父字段（如部门），再打开子字段下拉、从当前可选列表里选择匹配的子项（如该部门下的账号）；若选完子项父字段仍被打回，换子字段当前可选列表里的其他选项，或调用 ask_human 说明联动现象请用户确认目标组合；不要交替反复重设两个互相打回的字段。
9. 感到困惑时不要反复试错，立即调用 ask_human 主动向用户求助（挂起生成、等待人工决策）。以下情况视为困惑：换过不同方式仍无法达成目标、页面状态与预期不符且看不出原因、编号表和结构树里都找不到目标元素、或下一步只能是重复之前已做过的操作。args.question 简述困惑点与已尝试的做法，用户会据此给出补充说明、手动完成或跳过。系统也会在多次视觉观察仍无进展时自动挂起请求人工协助——与其反复截图盲找，不如尽早求助。
10. 提交类操作（点击 确定/提交/保存/发布）后若弹窗未关闭、页面无变化或结果异常：调用 api 工具查看最近的接口请求/响应（状态码与响应体），将接口响应与页面实际表现作为证据，对照已确认需求交叉核对（HTTP 200 不等于业务正确），再决定下一步，不要盲目重复点击。分流只看一条标准——失败原因是否被页面明确告知、且可归因于输入：
  · 可归因（页面有明确错误提示/红字校验，且接口同样报错、指向可修正的输入问题）→ 先对照测试意图；负向测试验证预期拒绝，fixed 数据不得更改；仅正向测试允许调整 generated 数据时才换值重试（revise 配合见规则 13）。
  · 不可归因，或页面表现与接口结果互相矛盾——疑似被测页面 Bug：调用 ask_human 求助（question 写明「疑似被测页面 Bug」，附上查证到的接口响应与页面实际表现），不要盲目重试，也不要为迁就 Bug 修改测试目标。矛盾形态不限于以下例子：
    - 接口报错但 UI 装作成功：弹窗/表单照常关闭，无任何错误提示（UI 吞掉失败）；
    - 接口成功但页面未呈现结果：列表无新条目、数据未变化；
    - 页面报错但接口实际成功：出现错误提示或状态回滚，而接口响应正常、数据已生效；
    - 无声失败：成功/失败提示皆无，接口也无对应请求（点击未触发任何调用）或响应无法判断成败。
11. 每个必验目标都必须由实际通过的 assert 覆盖（携带 criterionId，严格沿用确认的类型/预期/目标范围）；末步必须是断言，再调用 finish。不能用整页通用文案代替指定记录结果。失败保留证据并求助，不得弱化断言。
12. 环境变量与系统变量都以 {{key}} 占位符引用（fill/select 的 value、断言 expected 里直接写，如 {{密码1}}、{{randomNumber[:6]}}、{{randomPhone}}），不要写死真实值。已确认测试意图中 policy=generated 的数据与验收 expected 里出现的占位符必须原样传入，由平台统一解析（同一轮生成内同键同值，fill 写入的值与断言期望自动一致）——不要自己编造唯一值（写死随机数字/手机号），也不要改写占位符形态。
13. 以下清理仅适用于意外失败重试；负向测试中的错误输入、失败提交、拒绝断言均为必要步骤，必须保留。修正后重做提交时，若旧提交/填写操作已落库为脚本步骤，配合调用 revise 清理，回放脚本应保留完整、可验证的成功流程，仅清理有明确证据的失败重试冗余，不以步骤最少为目标。两类场景：① 提交失败原因是参数问题（如手机号重复、名称已存在、值不合法）需换值重试——重填时 value 仍传同一占位符并加 regenerate=true（平台重新生成新值，后续同占位符引用与断言自动同步），先实际执行修正动作并验证成功，再 revise 同步已验证的新值、删除有明确证据的旧值提交/重填冗余链；② 点击提交后弹窗未关、被必填校验拦截（提交未生效）——补填缺失字段重新提交，成功后调用 revise 删除先前落空的旧提交步。不要留下「注定失败的提交 + 重填」的冗余链路。所有成功执行的操作都会如实落库（含有意重复，如循环造数的多次填写同一输入框）——落库步骤与浏览器实际执行一一对应，不要重复执行已成功且已落库的操作；失败重试产生的冗余链请用 revise 清理，finish 时系统还会做一次全局脚本审查兜底。`;

/** 断言失败签名：type + expected + selector 定位同一「判断」；instruction 文本不参与（避免措辞变化绕过累计）。 */
function assertFailSig(args: Record<string, unknown>): string {
  return `${String(args.type ?? '')}|${String(args.expected ?? '')}|${String(args.selector ?? '')}`;
}

/** assist 决策 → 回灌给模型的 tool result 文本（redescribe/skip/revoke 出口；
 *  manual 走手动捕获流程、amend 走验收目标修订，均不在此处理。decision 为 null 表示超时未响应。 */
function assistResultText(decision: AssistDecision | null, errorText: string): string | null {
  if (!decision) return `人工协助超时未响应：${errorText}`;
  switch (decision.decision) {
    case 'redescribe':
      return `【用户补充说明】${decision.instruction}\n请据此重新完成目标（可先 snapshot 确认当前状态）。`;
    case 'skip':
      return '【用户引导】用户明确要求跳过该目标。请继续完成测试意图的其余部分（保持末步断言）。';
    case 'revoke':
      return `【用户引导】用户已撤销第 ${decision.from}~${decision.to} 步，这些步骤已从回放脚本中删除。请先 snapshot 确认当前页面状态（被撤销步骤在浏览器里的实际效果可能仍在），${decision.nl ? `按用户补充说明调整做法：${decision.nl}。` : ''}重新完成这部分流程——执行正确路径并正常落库，不要重复已被撤销的错误操作。`;
    default:
      return null;
  }
}

/** finish 全局脚本审查的执行体（LLM 语义去重兜底）：引擎忠实落库后唯一一次全局视野的语义清理。
 *  「重复是有意操作还是失败重试」需要整条链的语义（错误提交→重填→成功提交）才能判断，物理信号
 *  （同定位器/同值）无法区分——TodoMVC「填+回车×5」与「填错重填」物理上同构，引擎流式去重会把
 *  有意重复误删/错并。审查失败/超时静默跳过：审查是兜底而非门禁，不阻塞 finish；usage 由
 *  gateway client 底层入账（差分口径同预拆分）。 */
async function runScriptReview(o: {
  jobId: string;
  client: OpenAI;
  model: string;
  reasoningEffort: ReasoningEffort;
  steps: TestStep[];
  revise: (ops: ReviseOp[]) => Promise<string>;
  signal?: AbortSignal;
}): Promise<void> {
  const { jobId, client } = o;
  if (o.steps.length < 4) return; // goto+动作+断言的最小脚本无冗余空间
  const detail = o.steps
    .map((s, i) => {
      const label = s.kind === 'assert' ? '断言' : (s.action ?? s.kind);
      const loc = s.locator ? ` locator=${s.locator.strategy}:${s.locator.value}${s.locator.name ? `[${s.locator.name}]` : ''}` : '';
      const param =
        s.kind === 'navigate'
          ? ` url=${s.url}`
          : s.value != null
            ? ` value=${s.value}`
            : s.action === 'check'
              ? ` checked=${s.checked ?? true}`
              : s.key != null
              ? ` key=${s.key}`
              : s.assertion?.expected != null
                ? ` expected=${s.assertion.expected}`
                : '';
      return `${i + 1}. [${label}]${s.criterionId ? ` criterionId=${s.criterionId}` : ''}${loc}${param} ${s.instruction}`;
    })
    .join('\n');
  try {
    const before = { ...getUsage(jobId) };
    const req: Record<string, unknown> = {
      model: o.model,
      messages: [
        {
          role: 'system',
          content:
            '你是回放测试脚本的审查员。已落步骤与浏览器实际执行一一对应。请找出「失败重试/被后续操作替代」的冗余步骤并清理，保持已验证流程的行为等价，仅清理有明确证据的失败重试冗余，不以步骤最少为目标：\n' +
            '- 保留：负向测试中的非法/重复输入、失败提交和错误提示断言，它们是测试目标，不是重试冗余；\n' +
            '- 删除：已确认未生效且已被成功重试替代的操作链；不得仅因 URL、元素或值相同就删除重复操作，重复导航可能承担刷新作用；\n' +
            '- 保留：有意的重复操作（循环造数、逐行填写、反复切换等，即使元素与值完全相同）；\n' +
            '- 断言一般保留；唯一可删例外：两条断言互为冗余（同一定位、期望值一方是另一方的前缀/子集，如泛化 text=客户_ 与精确 text=客户_1788703830578 并存，不论谁前谁后），只删其中一条、保留另一条；无论删否，应用全部 ops 后脚本末步必须是断言——若末步断言不属于冗余对，任何删除都不得触及它；\n' +
            '- 不确定时保留，宁多勿错删；仅在已实际执行并验证替代值后，才可用 update 同步修正 value；不得为通过测试而弱化断言或改写未经验证的值。ops 按顺序应用，delete 会使之后的原序号前移——连续删除一段请合并为一个范围 op（from~to），先删后改时 update 的 step 序号按删除后的新编号给出。\n' +
            '输出 JSON：{"ops": [{"op":"delete","from":n,"to":m} 或 {"op":"update","step":n,"value":"新值"}]}，ops 为空数组表示无需修订。只输出 JSON。',
        },
        { role: 'user', content: `【已落步骤】\n${detail}` },
      ],
      response_format: { type: 'json_object' },
    };
    if (o.reasoningEffort) req.reasoning_effort = o.reasoningEffort;
    else {
      req.thinking = { type: 'disabled' };
      req.temperature = 0;
    }
    const res = await client.chat.completions.create(req as never, o.signal ? { signal: o.signal } : undefined);
    if (o.signal?.aborted) return;
    const text = redactGenerationData(jobId, res.choices?.[0]?.message?.content ?? '');
    const usage = usageDelta(before, getUsage(jobId));
    const parsed = safeJsonParse(stripFences(text)) as { ops?: ReviseOp[] } | undefined;
    const ops = Array.isArray(parsed?.ops) ? (parsed!.ops as ReviseOp[]) : [];
    // 审查原始输出（text+解析出的 ops）随 args 落库：预检拦截后不回灌重试，「模型到底给了什么」
    // 只此一处留痕，事后排查不合规原因全靠它（如 cmtpz11km000i 案例只能靠重建输入反推）。
    const reviewArgs = { reviewOutput: text, ops };
    if (ops.length) {
      // 应用前预检（applyReviseOps 为纯函数）：产出非法（越界/末步不再是断言）则整体跳过，
      // 不让审查把合法脚本改成非法脚本——revise 一经应用即已广播，无法回退。
      const probe = applyReviseOps(o.steps, ops);
      if (typeof probe === 'string') {
        // ops 本身非法（越界/缺字段等）：错误文案自解释，直接透出
        pubToolWithUsage(jobId, 0, '脚本审查', `审查 ${o.steps.length} 步`, `审查产出不合规（${probe}），已跳过清理`, usage, reviewArgs);
        return;
      }
      if (!probe.steps.length || probe.steps[probe.steps.length - 1].kind !== 'assert') {
        pubToolWithUsage(jobId, 0, '脚本审查', `审查 ${o.steps.length} 步`, '审查产出不合规（应用后末步不再是断言），已跳过清理', usage, reviewArgs);
        return;
      }
      const n = o.steps.length;
      const summary = await o.revise(ops);
      pubToolWithUsage(jobId, 0, '脚本审查', `审查 ${n} 步`, summary, usage, reviewArgs);
    } else {
      pubToolWithUsage(jobId, 0, '脚本审查', `审查 ${o.steps.length} 步`, '审查通过：无冗余步骤需要清理', usage, reviewArgs);
    }
  } catch (e) {
    // 审查异常不阻塞 finish：模型也可在 finish 前自用 revise 清理。但要留痕——静默失败会让
    // 「审查兜底失效」无从排查（如 DeepSeek 对 json_object 要求提示词含 json 一词，缺失即 400）。
    if (!o.signal?.aborted) console.warn(`[gen:${jobId}] 脚本审查失败，跳过清理：`, redactGenerationData(jobId, String(e)));
  }
}

/** 生成循环：大纲软约束 + runToolLoop（LLM 在回路自主选择工具，动作成功即语义化落库）。 */
export async function runGenerationLoop(o: {
  jobId: string;
  page: any;
  stagehand: any;
  pwPage: any;
  client: OpenAI;
  cfg: ReturnType<typeof getConfig>;
  modelVision: boolean;
  envMap: Record<string, string>;
  envVarHint: string;
  /** 占位符解析器（generate 侧 createSubstituter）。提供时启用值绑定（fill 实例值反绑占位符、
   *  断言前反向绑定、regenerate 再生成）；缺省（测试桩）仅按 sub 做代入，无绑定。 */
  substitution?: Substituter;
  /** 兜底代入（仅测试桩使用；生产经 substitution.sub）。 */
  sub?: (t: string | undefined | null) => string | undefined;
  emit: (s: TestStep) => Promise<void>;
  steps: TestStep[];
  /** 本轮目标描述（原测试目标/追加目标，含附件文本）。 */
  goalText: string;
  /** 续跑时已完成的前缀步骤（完整脚本 = baseSteps + 本轮 steps）：撤销范围可跨它，gen:revise 同步偏移动态取其长度。 */
  baseSteps?: TestStep[];
  /** 用户确认的大纲（软约束：参考路线，可据实际偏离）。 */
  outline: PlanStep[];
  intent?: TestIntent;
  evidence?: AssertionEvidence[];
  /** 大纲断言序号基数：续跑（resumeLoop）时 outline 为完整原大纲、baseSteps 已含此前断言，需按其数量对齐第 k 个落库断言 ↔ 大纲第 k 个断言；常规续跑的大纲只覆盖剩余流程，不传（0）。 */
  outlineAssertBase?: number;
  projectId?: string | null;
  logId: string | null;
  isCancelled: () => boolean;
  signal?: AbortSignal;
  /** 续跑：外部传入已持久化的 messages（继续生成读回），不再重建 system/user。 */
  resumeMessages?: OpenAI.ChatCompletionMessageParam[];
  /** 无论完成、暂停还是异常，交还当前消息以保存检查点。 */
  onCheckpoint?: (messages: OpenAI.ChatCompletionMessageParam[]) => void;
}): Promise<{ ok: boolean; finishMessage?: string; messages: OpenAI.ChatCompletionMessageParam[] }> {
  const { jobId, pwPage, page, client, cfg } = o;
  const evidence = o.evidence ?? [];
  const allSteps = () => [...(o.baseSteps ?? []), ...o.steps];
  const coverage = () => o.intent ? coverageStatus(o.intent, allSteps(), evidence) : [];
  const compactCoverage = () => coverage().map(({ id, required, passed }) => ({ id, required, passed }));


  // 插件编排（preset 唯一入口）：成员脚本已注入会话；此处取动作词表构建统一语义动作工具（与预拆分 prompt 词表同源）
  const pluginActions = await enabledActionVocabulary(o.projectId ?? null);

  // 生成期网络捕获（api 工具的数据源）：runGenerationLoop 在 startUrl 导航之后调用，首屏导航的响应不捕获
  // （可接受：提交报错场景不在此）；每轮 loop（生成/续跑/重规划）各自新建，循环结束即 dispose
  const network = new NetworkCapture();
  network.attach(pwPage);

  // 撤销处理器（人工「撤销步骤」决策的落点）：assistStep 收到 revoke 时删范围并广播 gen:revoke，
  // 模型随后经 assistResultText 收到引导文本，基于当前页面重做被撤销的流程。循环结束即注销。
  revokeHandlers.set(jobId, (from, to) => revokeStepRange(o.baseSteps ? [o.baseSteps, o.steps] : [o.steps], from, to));

  // 大纲等待步确定性落库：确认计划中断言前的 wait 步（拆分规范「在断言前可加适当延时」）必须进入回放脚本，
  // 而智能体循环的 wait 工具只做运行时稳定等待（多帧判定，不落库）。对齐规则：第 k 个落库断言 ↔ 大纲第 k 个
  // 断言，落库前补插两者之间的大纲 wait 步（大纲为软约束，模型可能增删断言，超出大纲断言数的不再补插）。
  let assertSeq = o.outlineAssertBase ?? 0;
  const emitWithOutlineWaits = async (step: TestStep): Promise<void> => {
    if (step.kind === 'assert') {
      const outlineAsserts = o.outline.map((s, i) => (s.kind === 'assert' ? i : -1)).filter((i) => i >= 0);
      if (assertSeq < outlineAsserts.length) {
        const lo = assertSeq > 0 ? outlineAsserts[assertSeq - 1] + 1 : 0;
        const hi = outlineAsserts[assertSeq];
        for (const w of o.outline.slice(lo, hi).filter((s) => s.kind === 'action' && s.action === 'wait')) {
          const ms = Math.max(0, Number(w.value) || 1000);
          await o.emit({ kind: 'wait', action: 'wait', value: String(ms), instruction: w.instruction, description: w.instruction });
        }
      }
      assertSeq++;
    }
    await o.emit(step);
  };

  // 侦察性 click 吸收（absorbProbeClick）：组件语义动作成功落库即证明自身自足（自动开合弹层），
  // 此刻移除尾部紧邻的同 locator click 步（模型先点开下拉侦察选项），避免回放脚本冗余。
  // 移除后广播 gen:revise 让前端整表收缩；本步随后的 gen:step 因数组缩短自然占据被删位置。
  const emitAbsorbingProbe = async (step: TestStep): Promise<void> => {
    const removedAt = absorbProbeClick(o.steps, step);
    if (removedAt != null) {
      pub({ type: 'gen:revise', jobId, base: o.baseSteps?.length ?? 0, steps: o.steps, ops: [{ op: 'delete', from: removedAt, to: removedAt }] });
    }
    await emitWithOutlineWaits(step);
  };

  // 落库 emit：忠实记录浏览器实际执行的每个操作（含有意重复，如循环造数对同一输入框的多次填写），
  // 不做流式同字段去重——「重复是有意操作还是失败重试」只有语义判断可信，物理信号（同定位器/同值）
  // 无法区分（TodoMVC「填+回车×5」与「填错重填」物理上同构）。去重职责交给 LLM：
  // 模型自用 revise 清理失败重试链，finish 时全局脚本审查（runScriptReview）兜底。
  // 落库与执行一一对应也让「执行成功/记录正确」不脱节，调试有据可查。
  const emitStep = async (step: TestStep): Promise<EmitOutcome> => {
    normalizeStepSystemVars(step); // 原地归一化：落库口径与前端检测一致（都是 {{...}}）
    await emitAbsorbingProbe(step);
    return { index: o.steps.length };
  };

  // 步骤修订（revise 工具的落点）：纯脚本操作，不触碰浏览器。原地替换 o.steps（引用不变——
  // emitWithOutlineWaits/finishValidate/最终 script 组装均持有同一数组），pub gen:revise 让前端整表同步。
  const binder = createValueBinder(o.substitution, o.intent, [...(o.baseSteps ?? []), ...o.steps]);
  const revise = async (ops: ReviseOp[]): Promise<string> => {
    // update 补丁携带的 value/instruction/expected 也归一化旧写法（模型可能在修订时写 ${systemTime}），
    // 并做保守实例→模板规范化（本会话真实写入过的字面值精确替换回占位符，防止 revise 把实例烤死进脚本）
    for (const op of ops) {
      if (op?.op !== 'update') continue;
      if (op.value != null) op.value = binder.canonicalizeText(legacyToUnifiedSystemVars(String(op.value))!);
      if (op.instruction != null) op.instruction = binder.canonicalizeText(legacyToUnifiedSystemVars(String(op.instruction))!);
      if (op.expected != null) op.expected = binder.canonicalizeText(legacyToUnifiedSystemVars(String(op.expected))!);
    }
    const applied = applyReviseOps(o.steps, ops);
    if (typeof applied === 'string') throw new Error(applied);
    o.steps.splice(0, o.steps.length, ...applied.steps);
    pub({ type: 'gen:revise', jobId, base: o.baseSteps?.length ?? 0, steps: o.steps, ops });
    const lines = applied.steps
      .slice(0, 60)
      .map((s, i) => `${i + 1}. [${s.kind === 'assert' ? '断言' : (s.action ?? s.kind)}] ${String(s.instruction ?? '').slice(0, 60)}`);
    return `已修订脚本步骤（更新 ${applied.updated} 步、删除 ${applied.deleted} 步）。当前已落步骤：\n${lines.join('\n')}`;
  };

  const ctx: GenToolContext = {
    jobId,
    intent: o.intent,
    onAssertionPassed: (step) => {
      const criterion = o.intent?.criteria.find(c => c.id === step.criterionId);
      if (!criterion) return;
      const steps = allSteps();
      const signature = evidenceSignature(steps, steps.length - 1, criterion);
      if (!evidence.some(e => e.signature === signature)) evidence.push({ criterionId: criterion.id, signature, verifiedAt: new Date().toISOString() });
      pub({ type: 'gen:coverage', jobId, coverage: coverage() });
    },
    signal: o.signal,
    page,
    stagehand: o.stagehand,
    pwPage,
    client,
    model: cfg.openaiModel,
    xpathMap: {},
    sub: o.substitution?.sub ?? o.sub ?? ((t: string | undefined | null) => t ?? undefined),
    envMap: o.envMap,
    valueBinding: binder,
    emit: emitStep,
    onTool: (index, label, detail, result) => pubToolWithUsage(jobId, index, label, detail, result, { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 }),
    note: () => {},
    stepCount: () => o.steps.length,
    revise,
    usageKey: jobId,
    modelVision: o.modelVision,
    pluginActions,
    network,
  };

  // ---- 人在回路「手动操作」：捕获用户首个真实操作 → 落库 → 回灌引导文本 ----
  const manualCapture = createManualCapture({ jobId, pwPage, emit: emitStep, isCancelled: o.isCancelled, valueBinding: binder });

  /** 决策回灌统一出口：manual 走手动捕获（等待用户操作、落库、反馈），amend 走验收目标修订，其余走 assistResultText。 */
  const applyAmend = (next: unknown): string => {
    if (!o.intent) return '当前生成没有验收目标，无法修订。';
    const parsed = testIntentSchema.safeParse(next);
    if (!parsed.success) return `修订的验收目标无效：${parsed.error.issues.map(i => i.message).join('；')}`;
    // 原地更新：ctx.intent / checkpoint 持同一引用；旧证据签名含 criterion，标准一改自动失效，须按新标准重新断言。
    // 与 confirmPlan 同口径先脱敏（用户编辑内容进 LLM 上下文前过滤密钥形态文本）
    Object.assign(o.intent, redactGenerationData(jobId, parsed.data));
    pub({ type: 'gen:coverage', jobId, coverage: coverage(), intent: o.intent });
    return '【验收目标已修订】用户已更新验收标准，旧证据随之失效。请用 read_coverage 获取最新验收目标与预期，并按新标准重新完成当前目标。';
  };
  const assistFollowup = async (decision: AssistDecision | null, context: string): Promise<string | null> => {
    if (decision?.decision === 'manual') return manualCapture(context);
    if (decision?.decision === 'amend') return applyAmend(decision.intent);
    if (decision?.decision === 'skip' && o.intent) return '用户要求跳过当前操作，请继续其余目标；若涉及必验项，该项保持未验证，不能报告完整完成。';
    return assistResultText(decision, context);
  };

  // finish 全局脚本审查：执行体见 runScriptReview。一次生成只审一次：
  // finish 被拒后续跑不重复审（无新步骤则无新冗余）。
  let scriptReviewed = false;
  const reviewScriptSteps = async (): Promise<void> => {
    if (scriptReviewed) return;
    scriptReviewed = true; // 一次生成只审一次：finish 被拒后续跑不重复审（无新步骤则无新冗余）
    await runScriptReview({ jobId, client, model: cfg.openaiModel, reasoningEffort: cfg.reasoningEffort, steps: o.steps, revise, signal: o.signal });
  };

  // finish 校验：脚本末步必须是断言，随后做全局脚本审查（LLM 语义去重兜底）
  const finishValidate = async (): Promise<string | null> => {
    const error = completionError(o.intent, allSteps(), evidence);
    if (error) return error;
    await reviewScriptSteps();
    // 审查可删改步骤，必须再次核对证据，不能靠审查前的通过状态放行。
    const reviewedError = completionError(o.intent, allSteps(), evidence);
    pub({ type: 'gen:coverage', jobId, coverage: coverage() });
    return reviewedError;
  };

  // 主动求助（ask_human 工具）：模型困惑时挂起 gen:assist 等人决策（与 onStuck 同通道），决策结果作为工具结果回灌
  const askHuman = async (question: string): Promise<string> => {
    const context = `Agent 主动求助：${question.slice(0, 200)}`;
    const decision = await askUser(jobId, {
      stepIndex: o.steps.length,
      kind: 'tool',
      instruction: context,
      canManual: true,
    });
    if (o.isCancelled()) return '（生成已取消）';
    return (
      (await assistFollowup(decision, context)) ??
      '用户未给出有效决策，请自行决定下一步（换路径、跳过该项或如实 finish）。'
    );
  };

  const tools = buildGenTools(ctx, finishValidate, askHuman);
  tools.push({ name: 'read_coverage', description: '分页读取已确认验收目标、预期及证据覆盖；offset 为字符偏移。不调用模型、不操作页面。',
    parameters: { type: 'object', properties: { offset: { type: 'integer', minimum: 0 } } }, stateful: 'coverage',
    execute: async (a) => {
      const full = JSON.stringify({ coverage: compactCoverage(), criteria: o.intent?.criteria ?? [] });
      const offset = Math.max(0, Math.floor(Number(a.offset) || 0));
      return `${offset}~${Math.min(full.length, offset + 10000)}/${full.length} 字符\n${full.slice(offset, offset + 10000)}`;
    } });
  tools.push({ name: 'read_goal', description: '分页读取完整测试目标/附件和确认的大纲；初始内容被省略时先读取相关部分。',
    parameters: { type: 'object', properties: { offset: { type: 'integer', minimum: 0 }, query: { type: 'string' } } }, stateful: 'goal',
    execute: async (a) => {
      const full = `${o.goalText}\n【已确认测试意图】\n${JSON.stringify(o.intent ?? null)}\n【当前验收覆盖】\n${JSON.stringify(coverage())}\n【参考大纲】\n${JSON.stringify(o.outline)}`;
      const found = a.query ? full.toLowerCase().indexOf(String(a.query).toLowerCase()) : -1;
      const offset = Math.max(0, found >= 0 ? found - 200 : Math.floor(Number(a.offset) || 0));
      return `${offset}~${Math.min(full.length, offset + 10000)}/${full.length} 字符\n${full.slice(offset, offset + 10000)}`;
    } });
  tools.push({ name: 'read_script', description: '分页读取当前已保存脚本，序号与 revise 一致；修订前可核对。',
    parameters: { type: 'object', properties: { offset: { type: 'integer', minimum: 0 } } }, stateful: 'script',
    execute: async (a) => {
      const offset = Math.max(0, Math.floor(Number(a.offset) || 0));
      const items: string[] = [];
      let size = 0;
      for (let i = offset; i < o.steps.length && items.length < 20; i++) {
        const line = `${i + 1}. ${JSON.stringify(o.steps[i])}`;
        if (size + line.length > 12000 && items.length) break;
        items.push(line); size += line.length;
      }
      return `${items.join('\n')}\n当前 ${offset + items.length}/${o.steps.length} 步；offset=${offset + items.length} 读取后续`;
    } });

  const outlineText = o.outline.length
    ? o.outline.map((s, i) => {
        const head = `${i + 1}. [${s.kind === 'assert' ? '断言' : (s.action ?? '操作')}] ${legacyToUnifiedSystemVars(s.instruction) ?? s.instruction}`;
        // value/expected 必须随大纲注入：它们是用户在确认页最终敲定的取值（可能改过模型草案），
        // 只传 instruction 会把用户的编辑丢弃、模型按意图旧值执行（cmtwv3up8：初始密码改 pw_{{randomNumber:6}} 落库仍是 {{密码1}}）
        const value = s.value != null && s.value !== '' ? `（value: ${legacyToUnifiedSystemVars(s.value)}）` : '';
        const assertion = s.kind === 'assert' && s.assertion?.expected != null ? `（expected: ${legacyToUnifiedSystemVars(s.assertion.expected)}）` : '';
        return `${head}${value}${assertion}`;
      }).join('\n')
    : '（用户未确认具体大纲，请自行规划步骤）';
  const pluginHint = pluginActions.length
    ? `\n\n【可用组件语义动作】\n${pluginActions.map((v) => `- ${v.name}：${v.doc ?? ''}`).join('\n')}`
    : '';

  const messages: OpenAI.ChatCompletionMessageParam[] = o.resumeMessages ?? [
    { role: 'system', content: `${GEN_LOOP_SYSTEM_PROMPT}${pluginHint}${o.envVarHint ? `\n\n${o.envVarHint}` : ''}` },
    {
      role: 'user',
      content: `【测试目标】\n${o.goalText}\n\n【参考大纲（执行路线是软约束：按实际情况执行，允许合理偏离；不要照抄大纲文本当作操作。步骤括号内的 value/expected 是用户确认的取值，fill/select 的 value 与断言 expected 必须采用，与意图 data 不一致时以大纲为准）】\n${outlineText}`,
    },
  ];
  // 原始目标仍由 read_goal 完整提供，初始提示不携带无限长附件。
  if (messages[1]?.role === 'user' && typeof messages[1].content === 'string' && messages[1].content.length > 16000) {
    messages[1].content = messages[1].content.slice(0, 12000) + '\n【后续目标/附件已省略，请先使用 read_goal 分页读取完整要求】';
  }
  // 大纲/意图注入前归一化旧写法 ${var} → {{var}}（拆分提示词版本可能仍教 ${}，注入侧统一口径，
  // 避免模型把 ${...} 当成要自己实例化的模板而编字面值）。
  const intentText = legacyToUnifiedSystemVars(JSON.stringify(o.intent ?? null))!;
  if (o.intent) messages.push({ role: 'user', content: `【已确认测试意图：执行路线可调整，验收预期不得擅自更改】\n${intentText.slice(0, 12000)}${intentText.length > 12000 ? '\n【后续约定已省略，执行前用 read_goal / read_coverage 读取完整要求】' : ''}\n【当前覆盖】${JSON.stringify(compactCoverage())}\n对每个验收目标调用 assert 时携带 criterionId，严格使用该目标的 type/expected，并定位 target 范围。负向测试保留错误输入及验证拒绝的步骤；fixed 数据不可擅自替换。结束前用 read_coverage 检查遗漏。` });
  if (o.resumeMessages) {
    // 暂停期间页面可能已被人工修改；首次续跑模型调用前刷新旧观测。
    const ids = new Set<string>();
    for (const m of messages as any[]) if (m.role === 'assistant') for (const tc of m.tool_calls ?? []) {
      if (['snapshot', 'see', 'page_tree', 'api', 'readText'].includes(tc.function?.name)) ids.add(tc.id);
    }
    for (const m of messages as any[]) {
      if (m.role === 'tool' && (ids.has(m.tool_call_id) || m.__ttStateKind) || m.role === 'user' && m.__ttSlotKind) m.content = '（暂停前观测已过期，请以续跑时的新状态为准）';
    }
    try {
      const snapshot = await tools.find(t => t.name === 'snapshot')!.execute({});
      messages.push({ role: 'user', content: `【续跑当前页面】\n${typeof snapshot === 'string' ? snapshot : snapshot.text}`, __ttSlotKind: 'snapshot', __ttSlotRound: 0 } as any);
    } catch {
      messages.push({ role: 'user', content: '续跑观测尚不可用，请先获取 snapshot，禁止使用暂停前的编号。' });
    }
  }
  messages.splice(0, messages.length, ...redactGenerationData(jobId, messages));

  // 连续失败计数：变更类工具连续异常达阈值即挂起 gen:assist 请求人工决策；
  // 重置只认「推进型成功」——观察类工具（GEN_OBSERVATION_TOOLS）成功不清零，
  // 否则「断言失败 → snapshot/readText → 再断言」的循环会不断清零，阈值永远达不到。
  let failStreak = 0;
  const onSuccess = (name: string): void => {
    if (!GEN_OBSERVATION_TOOLS.has(name)) failStreak = 0;
  };

  // 断言是「判断」不是「动作」：同签名（type+expected+selector）重试不会改变页面结果，
  // 累计失败 ASSERT_FAIL_ASSIST_AT 次即挂起等人。内建 askUser（不依赖调用方回调）：
  // 生成/续跑/常规继续三条路径同样生效（与 onStuck 同理）。
  const assertFailTotal = new Map<string, number>();
  const onAssertFail = async (args: Record<string, unknown>, error: string): Promise<string | null> => {
    // 合同错误（断言与已确认验收标准不一致）不计数：护栏锁的是冻结的验收标准，重试不可能通过，
    // 计数只会制造机械的求助循环（cmtwv3up8 C4 死锁）。给修订指引——放行靠用户修订 intent（assist amend）。
    if (error.startsWith('AssertionContractError:')) {
      return `该断言与已确认验收标准不一致（${error.replace(/^AssertionContractError:\s*/, '').slice(0, 200)}），原样重试不可能通过。若用户已修订验收目标，先用 read_coverage 获取最新标准再断言；否则调用 ask_human 请求修订验收目标，并在 question 里直接给出具体建议修订（目标 ID + 断言类型 + expected 沿用原值 + 定位描述符），依据当前页面控件形态判断建议类型：表单控件（输入框/文本域/下拉/日期）建议 value 断言 + label/placeholder 定位控件本体，已渲染文本建议 text/text_exact。例：「C3 建议改为 value 断言 + 定位 label=摘要 的输入框，expected 不变」。`;
    }
    const sig = assertFailSig(args);
    const total = (assertFailTotal.get(sig) ?? 0) + 1;
    assertFailTotal.set(sig, total);
    if (total < ASSERT_FAIL_ASSIST_AT) return null; // 未达阈值：错误照常回灌，模型自行调整
    assertFailTotal.set(sig, 0); // 介入后清零：给用户决策后的重试新预算
    const decision = await askUser(jobId, {
      stepIndex: o.steps.length,
      kind: 'assert',
      instruction: `断言同目标已失败 ${ASSERT_FAIL_ASSIST_AT} 次：${String(args.instruction ?? sig).slice(0, 200)}`,
      canManual: false,
    });
    if (o.isCancelled()) return null;
    if (decision?.decision === 'amend') return applyAmend(decision.intent);
    return assistResultText(decision, String(error).slice(0, 200));
  };

  const onFailure = async (name: string, args: Record<string, unknown>, error: string): Promise<string | null> => {
    if (name === 'assert') return onAssertFail(args, error); // 判断类走同签名累计通道，不占变更类连续失败计数
    failStreak++;
    if (failStreak < MAX_ASSIST_PER_STEP) return null; // 未达阈值：错误照常回灌，模型自行调整
    failStreak = 0;
    // 连续失败达阈值：挂起等人（gen:assist）。超时/取消返回 null → 错误照常回灌。
    // 注意：不能在此处向 messages 注入 user 消息——此刻对应 tool 消息尚未回灌，
    // 中间插 user 会违反协议（孤儿 tool_calls → 网关 400）；tool result 本身就是安全通道。
    const context = `工具「${name}」连续失败：${String(error).slice(0, 200)}`;
    const decision = await askUser(jobId, {
      stepIndex: o.steps.length,
      kind: 'tool',
      instruction: context,
      canManual: true,
    });
    if (o.isCancelled()) return null;
    return assistFollowup(decision, context);
  };

  // 空转保护升级：窗口内同签名变更类操作反复出现（runToolLoop 检测）→ 挂起等人决策。
  // 内建于循环内：生成/续跑/常规继续三条路径都能获得空转人工介入。
  // kind='observe' 为观察空转：see 自上次进展以来连续多次仍找不到目标（如菜单入口）。
  // kind='linkage' 为联动死锁：select 在两个元素间交替翻转（选择其一另一个被页面回设），detail 携带两元素可读描述。
  const onStuck = async (
    name: string,
    args: Record<string, unknown>,
    count: number,
    kind?: 'repeat' | 'observe' | 'linkage',
    detail?: string,
  ): Promise<string | null> => {
    const context =
      kind === 'observe'
        ? `连续 ${count} 次观察无进展`
        : kind === 'linkage'
          ? `疑似联动字段的组合已交替重试 ${count} 轮`
          : `相同操作已重复 ${count} 次无进展`;
    const decision = await askUser(jobId, {
      stepIndex: o.steps.length,
      kind: 'tool',
      instruction:
        kind === 'observe'
          ? `观察空转保护：已连续 ${count} 次观察仍无进展，疑似找不到目标入口`
          : kind === 'linkage'
            ? `联动死锁保护：${detail ?? '两个下拉字段'}已交替成功选择 ${count} 轮，选择其一后另一个被页面回设，疑似联动字段（当前组合不被页面接受）`
            : `空转保护：工具「${name}」相同操作已重复 ${count} 次无进展`,
      canManual: true,
    });
    if (o.isCancelled()) return null;
    return assistFollowup(decision, context);
  };

  const loop = await runToolLoop({
    client,
    model: cfg.openaiModel,
    reasoningEffort: cfg.reasoningEffort,
    tools,
    messages,
    maxSteps: Math.max(20, cfg.maxSteps ?? 200),
    usageKey: jobId,
    signal: o.signal,
    // toolLoop 的 finish 是特殊分支（不执行 finish 工具的 execute），校验必须经此传入：
    // 末步断言校验 + finish 时全局脚本审查（reviewScriptSteps）都挂在这里
    validateFinish: finishValidate,
    onFailure,
    onSuccess,
    onStuck,
    workingMemory: () => buildWorkingMemory(o.steps, o.goalText) + '\n【验收覆盖】' + JSON.stringify(compactCoverage()) + '\n用 read_coverage 读取完整验收预期；不允许弱化断言。',
    seeAssistAt: cfg.seeAssistAt,
    onStep: ({ index, name, args, result, usageDelta: ud }) => {
      const label = ({ snapshot: '快照', page_tree: '结构树', goto: '导航', click: '点击', fill: '填写', press: '按键', check: '勾选', select: '选择', wait: '等待', readText: '读取文本', assert: '断言', act: 'AI 兜底', see: '视觉观察', api: '网络请求', component_action: '组件动作', batch_actions: '批量填写', read_goal: '读取目标', read_script: '读取脚本', read_coverage: '验收覆盖', ask_human: '人工求助', finish: '完成' } as any)[name] ?? name;
      let detail = '';
      try {
        detail = JSON.stringify(args ?? {}).slice(0, 160);
      } catch {
        detail = '';
      }
      // see 的完整 question 落 args 列（detail 有 160 字截断）；模型回答由 onAssistantContent 滞后回填 assistant 列
      pubToolWithUsage(jobId, index, label, detail, result, ud, name === 'see' ? args : undefined);
    },
    // see 截图的「模型作答」在下一轮 completion 到达（toolLoop 回调），回填对应 GenerationStep.assistant
    onAssistantContent: (stepIndex, content) => updateToolAssistant(jobId, stepIndex, content),
  }).finally(() => {
    revokeHandlers.delete(jobId);
    network.dispose();
    o.onCheckpoint?.(messages);
  });

  if (o.isCancelled()) return { ok: false, messages };
  if (!loop.finished) {
    if (!o.isCancelled()) pub({ type: 'gen:error', jobId, message: `生成循环未正常收敛（${loop.steps} 个工具步骤）：${loop.finishMessage ?? '未调用 finish'}`, usage: getUsage(jobId) });
    return { ok: false, finishMessage: loop.finishMessage, messages };
  }
  return { ok: true, finishMessage: loop.finishMessage, messages };
}
