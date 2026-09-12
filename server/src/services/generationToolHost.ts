/**
 * 生成工具宿主：智能体模式（function call 循环）的工具集与统一动作外壳。
 * - createGenContext：会话级上下文（xpathMap/占位符/emit/进度回调）
 * - buildGenTools：snapshot（编号表）/page_tree（结构树兜底）/goto/click/fill/press/check/select/assert/wait/readText/api（接口响应查询）/act/ask_human（困惑时主动求助）/finish + 插件动作工具
 * - runActionShell：索引解析 → 遮挡校验 → 动作前语义化预采集 → 真实执行 → 自动 emit → 回灌单行结果
 * 红线：所有落库步骤经 semanticizeLocator（count===1+同节点）；失败尝试天然不入库。
 * 候选采集在动作前（capture-before-mutation）：动作态类（checked/selected…）与可访问名漂移不编入定位器。
 */
import type OpenAI from 'openai';
import type { AgentTool, AgentToolResult } from './toolLoop';
import type { TestStep, ReviseOp, EmitOutcome } from '../shared/testScript';
import { locatorSchema } from '../shared/testScript';
import { browserAssertionTypes } from '../shared/testIntent';
import type { TestIntent } from '../shared/testIntent';
import { assertionContractError } from './generation/intentCoverage';
import { resolveQuery, semanticizeLocator } from './locatorVerifier';
import { analyzeElement } from './locatorCandidateScript';
import { executeLocatorAction, observedAction, waitForBrowserAssertion } from './browserExecution';
import { captureObservation, observationText, stateFingerprint, batchBoundary, type BrowserObservation } from './browserObservation';
import { shotHash, waitStableInPage, effectChanged, shotBase64 } from './visualFrameService';
import { componentActionParameters, buildPluginActionStep } from './genToolsPlugin';
import type { ActionVocabEntry } from './pluginStore';
import type { PluginActionResult } from '../types/plugin-api';
import { getUsage } from './tokenUsage';
import type { NetworkCapture } from './networkCaptureService';
import { redactGenerationData, redactGenerationText } from './generation/privacy';

export interface GenToolContext {
  jobId: string;
  intent?: TestIntent;
  onAssertionPassed?: (step: TestStep) => void;
  signal?: AbortSignal;
  snapshotVersion?: string;
  lastObservation?: BrowserObservation;
  page: any; // Stagehand page（snapshot/act）
  stagehand: any; // Stagehand 实例（act/observe 挂在实例上）
  pwPage: any; // CDP 桥 playwright 视图（locator/evaluate/screenshot）
  client: OpenAI;
  model: string;
  /** 快照数字索引 → xpath（最新快照，resolveTarget 用）。 */
  xpathMap: Record<string, string>;
  /** 占位符代入（generate 侧注入：系统变量惰性求值 + 环境变量，执行用真实值、落库保留 {{}}）。 */
  sub: (t: string | undefined | null) => string | undefined;
  envMap: Record<string, string>;
  /** emit 落步骤（generate 侧：appendStep + pub gen:step），返回新步骤的 1-based 序号。
   *  引擎忠实记录实际执行的每个操作（含有意重复），去重由 LLM 语义判断（revise + finish 审查）。 */
  emit: (s: TestStep) => Promise<EmitOutcome>;
  /** 工具轨迹回调（generate 侧：pub gen:tool）。 */
  onTool: (index: number, label: string, detail: string, result: string) => void;
  /** 记录逐步上下文（act 的前缀）。 */
  note: (s: string) => void;
  /** 当前已落步骤数（emit 后自增由 emit 实现方负责）。 */
  stepCount: () => number;
  /** 修订已落步骤（generate 侧闭包：applyReviseOps + 原地替换 steps + pub gen:revise），回显最新步骤清单。 */
  revise: (ops: ReviseOp[]) => Promise<string>;
  usageKey: string;
  /** 主模型视觉能力（openaiModelVision）。 */
  modelVision: boolean;
  /** 项目内已启用插件的动作词表（preset 编排，按语义动作名去重；与预拆分 prompt 词表同源）。 */
  pluginActions: ActionVocabEntry[];
  /** 本次生成的网络捕获（api 工具查询用；runGenerationLoop 创建并 attach）。 */
  network: NetworkCapture;
}

/** 占位符代入：转调 ctx.sub（generate 侧闭包，含系统变量惰性求值）。 */
function sub(ctx: GenToolContext, t: string | undefined | null): string | undefined {
  return ctx.sub(t);
}

/** 语义化输入源：编号 → 属性选择器（否则 semanticizeLocator 会把裸数字当 css 而回退坏 locator）。 */
function semanticSource(selector: string): string {
  const raw = String(selector ?? '').trim();
  return /^\d+$/.test(raw) ? `[data-tt-idx="${Number(raw)}"]` : raw;
}

/** 快照数字编号/定位表达式 → playwright locator（编号 = data-tt-idx 属性，绝对唯一）。 */
async function resolveLocator(ctx: GenToolContext, selector: string, version?: unknown): Promise<any> {
  const raw = String(sub(ctx, selector) ?? '').trim();
  if (/^\d+$/.test(raw)) {
    if (version != null || ctx.snapshotVersion) {
      const current = await captureObservation(ctx.pwPage);
      if (version != null && String(version) !== current.version || ctx.snapshotVersion && ctx.snapshotVersion.split(':')[0] !== current.documentId) {
        throw new Error('元素编号来自过期快照，请使用最新 snapshotVersion 和编号');
      }
    }
    // 文档内唯一编号；路由切换不会复用旧节点的身份。
    return ctx.pwPage.locator(`[data-tt-idx="${Number(raw)}"]`);
  }
  return ctx.pwPage.locator(raw.startsWith('/') ? `xpath=${raw}` : raw);
}

/** 遮挡校验：目标元素中心点是否被弹层遮罩挡住（.ant-modal-mask/.el-overlay 等）。 */
async function checkOcclusion(ctx: GenToolContext, loc: any): Promise<string | null> {
  try {
    const handle = await loc.elementHandle({ timeout: 5000 });
    if (!handle) return null;
    const res = (await handle.evaluate((el: any) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return { blocked: false };
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || top === el || el.contains(top) || top.contains(el)) return { blocked: false };
      const mask = top.closest('.ant-modal-mask, .ant-modal-wrap, .el-overlay, .el-dialog__wrapper, [class*="mask"], [class*="overlay"]');
      return { blocked: true, blocker: String((mask as any)?.className ?? top.tagName).slice(0, 80) };
    })) as { blocked: boolean; blocker?: string };
    if (res?.blocked) return `目标元素被「${res.blocker}」遮挡，请先关闭弹层/遮罩再操作`;
    return null;
  } catch {
    return null; // 校验失败不阻塞主流程
  }
}

/** 检测页面可见的弹窗/下拉浮层（act 的 Escape 拦截判定；查询失败按无浮层放行，不阻塞主流程）。 */
async function detectOverlays(page: any): Promise<{ dialog: boolean; dropdown: boolean }> {
  try {
    return await page.evaluate(() => {
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        const st = getComputedStyle(el);
        return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) !== 0;
      };
      const anyVisible = (sel: string) => Array.from(document.querySelectorAll(sel)).some(visible);
      return {
        dialog: anyVisible('dialog[open],[role="dialog"],[role="alertdialog"],.el-dialog,.el-drawer,.el-message-box,.ant-modal,.ant-drawer'),
        dropdown: anyVisible('[role="listbox"],.el-select-dropdown,.el-dropdown-menu,.el-picker-panel,.el-cascader__dropdown,.ant-select-dropdown,.ant-picker-dropdown'),
      };
    });
  } catch {
    return { dialog: false, dropdown: false };
  }
}

/** 统一动作外壳：执行 → 语义化 → 自动 emit → 回灌（含生效确认）。 */
// 生成模式动作超时：不用 Playwright 默认 30s——空转/被测环境异常时反复超时会拖垮整轮生成。
const ACTION_TIMEOUT_MS = 15_000;
async function runActionShell(
  ctx: GenToolContext,
  action: 'click' | 'fill' | 'press' | 'check' | 'select',
  args: Record<string, unknown>,
  extra?: { pressKey?: string },
): Promise<string | AgentToolResult> {
  const selector = String(args.selector ?? '').trim();
  if (!selector) throw new Error(`${action} 缺少 selector（元素编号或定位表达式）`);
  const instruction = String(args.instruction ?? '').trim();
  if (!instruction) throw new Error(`${action} 缺少 instruction（本步自然语言描述）`);
  const loc = await resolveLocator(ctx, selector, args.snapshotVersion);

  const blocked = await checkOcclusion(ctx, loc);
  if (blocked) return { status: 'failed', text: `错误：${blocked}` };

  if ((action === 'fill' || action === 'select') && typeof args.value !== 'string') throw new Error(`${action} 缺少 value`);
  const rawValue = args.value != null ? String(args.value) : undefined;
  const realValue = sub(ctx, rawValue);
  // 语义化候选在动作前采集（capture-before-mutation）：动作引发的状态类（checked/selected/
  // loading 等）与可访问名漂移（开启→关闭）不会被编入定位器——回放该步时的页面初始态与
  // 采集态一致。预采集失败时不执行动作，避免页面变化后无法记录。
  const semPre = await semanticizeLocator(ctx.pwPage, semanticSource(sub(ctx, selector) ?? selector), { mode: 'playwright', noRawFallback: true }).catch(() => null);
  if (!semPre) throw new Error('无法在操作前生成可靠定位器，本步未执行。请重新 snapshot 定位。');
  if (action === 'check' && args.checked != null && typeof args.checked !== 'boolean') throw new Error('checked 必须是布尔值');
  const step = buildStep(action, semPre, instruction, action === 'fill' || action === 'select' ? rawValue : undefined, action === 'press' ? extra?.pressKey ?? 'Enter' : undefined);
  if (action === 'check') step.checked = args.checked == null ? true : args.checked as boolean;
  if (ctx.signal?.aborted) throw new Error('操作已中止');
  await executeLocatorAction(loc, { ...step, value: realValue }, ACTION_TIMEOUT_MS);
  // 一旦执行成功就保存；后验失败也不能抹掉已执行的操作。
  const oc = await ctx.emit(step);
  ctx.note(`${instruction}（${action}）`);
  return { status: 'success', recordedStep: oc.index, effect: 'unknown', text: `${actionLabel(action)}已执行。${落库提示(ctx, oc)}` };
}

function buildStep(
  action: string,
  sem: NonNullable<TestStep['locator']>,
  instruction: string,
  value?: string,
  key?: string,
): TestStep {
  const base: TestStep = { kind: 'action', action: action as TestStep['action'], locator: sem, instruction, description: instruction };
  if (value != null) return { ...base, value };
  if (key) return { ...base, key };
  return base;
}

function actionLabel(a: string): string {
  return { click: '点击', fill: '填写', select: '选择', press: '按键', check: '勾选' }[a] ?? a;
}

function 已落库提示(ctx: GenToolContext): string {
  return `（已记录为第 ${ctx.stepCount()} 步）`;
}

/** emit 结果回显：统一「已记录为第 N 步」口径。oc 缺失（语义定位失败未落库）时由调用方另行措辞。 */
function 落库提示(ctx: GenToolContext, oc: EmitOutcome | undefined | null): string {
  return oc ? `（已记录为第 ${oc.index} 步）` : 已落库提示(ctx);
}

/** 读最新快照：仅可交互元素编号表（单一编号体系，与截图标注同源）。
 *  默认不带语义树——树文本是上下文里最大的单块增量（实测约 3-4k token/次），编号表已够模型选元素操作；
 *  完整结构树由 page_tree 按需兜底。 */
async function doSnapshot(ctx: GenToolContext, options: Record<string, unknown> = {}): Promise<string> {
  const snap = await captureObservation(ctx.pwPage, options);
  ctx.lastObservation = snap;
  ctx.snapshotVersion = snap.version;
  return observationText(snap);
}

async function doPageTree(ctx: GenToolContext, options: Record<string, unknown> = {}): Promise<string> {
  let tree: string;
  const scope = String(options.scope ?? 'auto');
  const active = ctx.pwPage.locator('dialog[open], [role="dialog"]:visible, [role="listbox"]:visible');
  if (scope !== 'page' && (scope !== 'auto' || await active.count())) {
    tree = await (scope === 'auto' ? active.last() : ctx.pwPage.locator(scope)).ariaSnapshot({ timeout: 5000 });
  } else {
    const snap = await ctx.page.snapshot();
    tree = String(snap?.formattedTree ?? '');
    ctx.xpathMap = snap?.xpathMap ?? {};
  }
  let lines = tree.split('\n');
  if (options.query) {
    const selected = new Set<number>();
    lines.forEach((line, i) => { if (line.toLowerCase().includes(String(options.query).toLowerCase())) for (let j = Math.max(0, i - 2); j <= i; j++) selected.add(j); });
    lines = lines.filter((_, i) => selected.has(i));
  }
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  const out: string[] = [];
  let chars = 0;
  for (const line of lines.slice(offset)) {
    if (chars + line.length > 14000 && out.length) break;
    out.push(line.slice(0, 14000)); chars += line.length + 1;
  }
  return `【结构树；树内编号不能用于 selector】\n${out.join('\n')}\n${offset + out.length}/${lines.length} 行` +
    (offset + out.length < lines.length ? `；继续 page_tree(offset=${offset + out.length})，保持 scope/query` : '');
}

const snapshotParameters = {
  type: 'object', properties: {
    scope: { type: 'string', description: 'auto（默认活动浮层/视口）、page、viewport 或 CSS 区域选择器' },
    query: { type: 'string', description: '按元素名称或状态筛选' },
    offset: { type: 'integer', minimum: 0 },
    limit: { type: 'integer', minimum: 1, maximum: 150 },
  },
};

/** 组装全套生成工具。askHuman：主动求助回调（困惑时挂起 gen:assist 等人决策），未传则不注册 ask_human 工具。 */
export function buildGenTools(
  ctx: GenToolContext,
  finishValidate?: (args: Record<string, unknown>) => Promise<string | null>,
  askHuman?: (question: string) => Promise<string>,
): AgentTool[] {
  const tools: AgentTool[] = [
    {
      name: 'snapshot',
      description: '获取带字段值和校验状态的编号快照，默认聚焦活动浮层/视口。可用 scope/query 扩大或缩小范围，offset 翻页。动作已附快照时直接使用，无需重复调用。',
      parameters: snapshotParameters,
      stateful: 'snapshot',
      supersedes: ['tree', 'screenshot'], // 新快照 = 页面已变化，旧结构树层级信息一并失效
      execute: async (a) => doSnapshot(ctx, a),
    },
    {
      name: 'page_tree',
      description: '获取当前页面完整语义树（层级结构 + 文本，体积大，仅在需要时调用）。用于编号表看不出的问题：目标不在编号表、需要理解区域层级/排查结构类问题。树内编号是结构 id，不能用作工具 selector。',
      parameters: snapshotParameters,
      stateful: 'tree',
      execute: async (a) => doPageTree(ctx, a),
    },
    {
      name: 'goto',
      description: '导航到指定 URL。args.url + args.instruction（必填）',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' }, instruction: { type: 'string' } },
        required: ['url', 'instruction'],
      },
      execute: async (a) => {
        const u = String(a.url ?? '');
        await ctx.page.goto(sub(ctx, u) ?? u);
        const oc = await ctx.emit({ kind: 'navigate', action: 'goto', url: u, instruction: String(a.instruction), description: String(a.instruction) });
        return `已导航到 ${u}。${落库提示(ctx, oc)}`;
      },
    },
    {
      name: 'click',
      description: '点击元素（编号或定位表达式）。args.selector + args.instruction（必填）',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string' }, instruction: { type: 'string' } },
        required: ['selector', 'instruction'],
      },
      execute: async (a) => runActionShell(ctx, 'click', a),
    },
    {
      name: 'fill',
      description: '填写输入框。args.selector + args.value + args.instruction（必填）',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string' }, value: { type: 'string' }, instruction: { type: 'string' } },
        required: ['selector', 'value', 'instruction'],
      },
      execute: async (a) => runActionShell(ctx, 'fill', a),
    },
    {
      name: 'press',
      description: '聚焦目标元素后按键（默认 Enter，不额外点击）。args.selector + args.key? + args.instruction（必填）',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string' }, key: { type: 'string' }, instruction: { type: 'string' } },
        required: ['selector', 'instruction'],
      },
      execute: async (a) => runActionShell(ctx, 'press', a, { pressKey: String(a.key ?? 'Enter') }),
    },
    {
      name: 'check',
      description: '设置控件勾选状态，checked=true 勾选、false 取消；radio 仅支持 true。args.selector + args.checked + args.instruction。',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string' }, instruction: { type: 'string' }, checked: { type: 'boolean' } },
        required: ['selector', 'checked', 'instruction'],
      },
      execute: async (a) => runActionShell(ctx, 'check', a),
    },
    {
      name: 'select',
      description: '原生 <select> 下拉选择。组件库假控件（antd/element 下拉）请改用 component_action 的 select 语义动作（原生/组件库下拉统一入口，自动按优先级适配）。args.selector + args.value + args.instruction',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string' }, value: { type: 'string' }, instruction: { type: 'string' } },
        required: ['selector', 'value', 'instruction'],
      },
      execute: async (a) => {
        try {
          return await runActionShell(ctx, 'select', a);
        } catch (e) {
          return { status: 'failed', text: `错误：${String(e)}。提示：组件库假控件不支持原生 selectOption，请改用 component_action 的 select 语义动作或 click+click 两段式。` };
        }
      },
    },
    {
      name: 'wait',
      description: '等待页面渲染稳定（多帧像素哈希，动画/加载结束即返回；上限 3s）。args.ms? 为最小等待毫秒',
      parameters: { type: 'object', properties: { ms: { type: 'string' } } },
      execute: async (a) => {
        const minMs = Math.max(0, Number(a.ms) || 0);
        if (minMs) await new Promise((r) => setTimeout(r, minMs));
        // 页内信号判定（零截图，避免有头模式截图轮询闪烁）；页面上下文不可用时内部自动回退帧哈希版
        const r = await waitStableInPage(ctx.pwPage);
        return r.stable ? `页面已稳定（${r.elapsedMs}ms）` : `已达等待上限 3s（页面仍有变化，可能是持续动画）`;
      },
    },
    {
      name: 'readText',
      stateful: 'readText',
      description: '读取元素文本内容。args.selector',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string' } },
        required: ['selector'],
      },
      execute: async (a) => {
        const loc = await resolveLocator(ctx, String(a.selector ?? ''));
        const text = await loc.innerText({ timeout: 8000 });
        return String(text ?? '').slice(0, 800) || '(空)';
      },
    },
    {
      name: 'assert',
      description: '验证结果并记录证据。text=包含、text_exact=规范化空白后全文相等、value=字段值相等、checked/unchecked、enabled/disabled、count=匹配数量（含隐藏节点）、visible/hidden、url=包含/url_exact=相等。验收目标必须带 criterionId，严格沿用已确认类型和 expected，并定位 target 范围。count/hidden 可用稳定 locator 描述符匹配多个或尚不存在的元素；不要用临时编号表示集合/不存在目标。',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...browserAssertionTypes] },
          criterionId: { type: 'string' },
          locator: { type: 'object', properties: { strategy: { type: 'string', enum: ['role', 'label', 'text', 'placeholder', 'testid', 'alt', 'title', 'css', 'xpath'] }, value: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' }, scope: { type: 'object', properties: { strategy: { type: 'string', enum: ['role', 'testid', 'text', 'css'] }, value: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' } }, required: ['strategy', 'value'] } }, required: ['strategy', 'value'] },
          selector: { type: 'string' },
          timeoutMs: { type: 'integer', minimum: 0, maximum: 30000 },
          expected: { type: 'string' },
          instruction: { type: 'string' },
        },
        required: ['type', 'instruction'],
      },
      execute: async (a) => {
        const type = String(a.type);
        const instruction = String(a.instruction ?? '').trim() || `断言 ${type}`;
        const expect = a.expected == null ? undefined : String(a.expected);
        const criterionId = a.criterionId == null ? undefined : String(a.criterionId);
        const criterion = ctx.intent?.criteria.find(c => c.id === criterionId);
        if (criterionId && !criterion) throw new Error(`未知验收目标：${criterionId}`);
        const isUrl = type === 'url' || type === 'url_exact';
        let assertSem: TestStep['locator'];
        let loc: any;
        let scope: any;
        if (!isUrl) {
          if (a.locator) {
            const descriptor = locatorSchema.parse(a.locator);
            if (descriptor.strategy === 'role' && !descriptor.role) descriptor.role = descriptor.value;
            if (descriptor.scope?.strategy === 'role' && !descriptor.scope.role) descriptor.scope.role = descriptor.scope.value;
            if (['response', 'websocket'].includes(descriptor.strategy) || !descriptor.value.trim() ||
                JSON.stringify(descriptor).includes('data-tt-idx')) throw new Error('请提供稳定的浏览器定位描述符');
            const resolved = JSON.parse(JSON.stringify(descriptor), (_key, v) => typeof v === 'string' ? sub(ctx, v) : v);
            const root = resolved.scope ? resolveQuery(ctx.pwPage, resolved.scope) : ctx.pwPage;
            if (resolved.scope && await root.count() !== 1) throw new Error('断言作用域必须唯一存在，避免空范围造成错误通过');
            scope = resolved.scope ? root : undefined;
            loc = resolveQuery(root, resolved);
            assertSem = descriptor;
          } else if (a.selector) {
            loc = await resolveLocator(ctx, String(a.selector), a.snapshotVersion);
            if (type === 'count' || type === 'hidden') {
              const selector = String(a.selector).trim();
              if (/^\d+$/.test(selector) || selector.includes('data-tt-idx')) throw new Error('数量/隐藏断言请使用稳定 locator，不能使用临时编号');
              assertSem = { strategy: 'css', value: selector };
            }
          }
        }
        const assertion = { type: type as NonNullable<TestStep['assertion']>['type'], expected: expect };
        if (criterion) {
          const error = assertionContractError(criterion, { assertion, locator: assertSem ?? (loc ? { strategy: 'css', value: String(a.selector) } : undefined) }, ctx.sub);
          if (error) throw new Error(error);
        }
        await waitForBrowserAssertion({ page: { url: () => ctx.page.url(), locator: (selector: string) => ctx.pwPage.locator(selector) }, locator: loc, scope, type, expected: sub(ctx, expect), timeoutMs: a.timeoutMs == null ? 10000 : Number(a.timeoutMs), signal: ctx.signal });
        // 单元素等待挂载后再采集；集合/不存在断言保留经过校验的稳定查询，不能强制唯一命中。
        if (loc && !assertSem) assertSem = await semanticizeLocator(ctx.pwPage, semanticSource(sub(ctx, String(a.selector)) ?? String(a.selector)), { mode: 'playwright', noRawFallback: true });
        if (loc && !assertSem) throw new Error('断言定位器未通过唯一性验证');
        const step: TestStep = { kind: 'assert', action: 'assert', assertion, criterionId, ...(assertSem ? { locator: assertSem } : {}), instruction, description: instruction };
        const oc = await ctx.emit(step);
        ctx.onAssertionPassed?.(step);
        return { status: 'success', progressed: true, recordedStep: oc.index, text: `断言通过（${type}${criterionId ? `，目标 ${criterionId}` : ''}）。${落库提示(ctx, oc)}` };

      },
    },
    {
      name: 'act',
      description: '自然语言单动作兜底：observe 解析最匹配候选，执行前验证定位并记录。复合目标一次只推进一个动作，依据返回快照继续。args.instruction（必填）。不要用 Escape 关闭弹窗内展开的下拉——会把整个弹窗关掉、已填表单全丢；收起下拉改点触发器或直接点选项，关闭弹窗改点「取消/关闭」按钮。',
      parameters: {
        type: 'object',
        properties: { instruction: { type: 'string' }, scope: { type: 'string', description: '可选 CSS 区域，收窄 observe 上下文' } },
        required: ['instruction'],
      },
      execute: async (a) => {
        const instruction = sub(ctx, String(a.instruction ?? ''));
        if (instruction && Object.values(ctx.envMap).some((v) => v && instruction.includes(v))) {
          return { status: 'failed', text: 'act 指令包含环境变量值，请改用 fill/select/component_action 等确定性工具并传入占位符，避免将真实值交给浏览器 AI。' };
        }
        // Escape 在弹窗/下拉上常被组件库连弹窗一起关掉（表单已填内容全丢，只能重开重填）——有浮层时拦截并给替代方案
        if (/\b(?:esc|escape)\b/i.test(String(a.instruction ?? ''))) {
          const ov = await detectOverlays(ctx.pwPage);
          if (ov.dialog || ov.dropdown) {
            const scene = [ov.dropdown && '展开的下拉面板', ov.dialog && '弹窗'].filter(Boolean).join(' + ');
            return { status: 'failed', text: `已拦截「按 Escape」：当前页面有${scene}，Escape 可能把整个弹窗一起关闭、已填内容全部丢失。请改用：收起下拉→再点一次触发器或直接点选目标选项；关闭弹窗→点「取消/关闭」按钮或右上角 ×。` };
          }
        }
        const scope = a.scope ? ctx.page.locator(String(a.scope)) : undefined;
        const result = await ctx.stagehand.observe(instruction, { page: ctx.page, ...(scope ? { locator: scope } : {}) });
        if (ctx.signal?.aborted) throw new Error('操作已中止');
        const candidates = result?.data;
        if (!Array.isArray(candidates) || !candidates.length) throw new Error('observe 未找到候选动作');
        // 只执行最匹配的候选；多个候选并不是多步计划。后续动作由新快照继续规划。
        const parsed = observedAction(candidates[0]);
        return runActionShell(ctx, parsed.action, { ...parsed, instruction: String(a.instruction) }, { pressKey: parsed.key });
      },
    },
    ...(ctx.modelVision
      ? [
          {
            name: 'see',
            description: '视觉观察当前页面：截图（带编号标注）直接附于结果进入上下文（无额外的图像描述子调用）。蓝色边框上的白色数字 = snapshot 元素编号，可直接用于 selector。与文本快照并列的一等观测：快照文本信息不足或存疑（选项列表不全/被虚拟滚动截断、元素与文本对不上、确认渲染状态）时优先 see，不要靠反复试错。args.x/y/w/h 为可选裁剪区域（px），聚焦小控件时提升清晰度。',
            parameters: {
              type: 'object',
              properties: {
                question: { type: 'string', description: '关注的问题（可选）' },
                x: { type: 'number', description: '裁剪区域左上角 x（可选）' },
                y: { type: 'number', description: '裁剪区域左上角 y（可选）' },
                w: { type: 'number', description: '裁剪区域宽（可选）' },
                h: { type: 'number', description: '裁剪区域高（可选）' },
              },
            },
            // 视觉观察与快照同为「当前画面」状态：新观察回灌时历史同槽（含所附截图）降级为占位，防止上下文累积
            stateful: 'screenshot',
            supersedes: ['snapshot', 'tree'],
            execute: async (a) => {
              await doSnapshot(ctx);
              // 绘制编号标注 → 截图（可选区域裁剪）→ 清除标注（恢复画面）
              await ctx.pwPage.evaluate(() => {
                try {
                  if ((window as any).__ttCollectInteractive) (window as any).__ttCollectInteractive();
                  if ((window as any).__ttDrawOverlays) (window as any).__ttDrawOverlays();
                } catch { /* 标注失败不影响截图 */ }
              });
              const region =
                a.x != null && a.y != null && a.w != null && a.h != null
                  ? { x: Number(a.x), y: Number(a.y), width: Number(a.w), height: Number(a.h) }
                  : undefined;
              const b64 = await shotBase64(ctx.pwPage, region).finally(async () => {
                await ctx.pwPage.evaluate(() => {
                  try {
                    if ((window as any).__ttClearOverlays) (window as any).__ttClearOverlays();
                  } catch { /* 忽略 */ }
                });
              });
              // 截图直连主上下文（按张固定计价），不再子调用转文字描述；观察请求回显在文本里引导主模型看图作答
              const q = String(a.question ?? '描述页面当前状态与可交互元素').slice(0, 200);
              return {
                text: `snapshotVersion=${ctx.snapshotVersion}。截图已附于下一条消息（蓝色边框上的白色数字为元素编号，与 snapshot 编号一致，可直接用作工具 selector）。观察请求：${q}。请依据截图作答并决定下一步。`,
                image: b64,
                stateFingerprint: ctx.lastObservation ? stateFingerprint(ctx.lastObservation) : undefined,
              };
            },
          } as AgentTool,
        ]
      : []),
    // 接口响应查询：感知层兜底——错误可能只在接口响应里（如「手机号码重复」）、页面上看不到，
    // 模型反复点击提交前应先用本工具查看状态码与响应体。纯观察不 emit。
    {
      name: 'api',
      description:
        '查询页面最近捕获的网络接口请求/响应（XHR/fetch 等）。提交表单或点击 确定/提交/保存 后，若弹窗未关闭、页面无变化或疑似失败，先用本工具查看接口状态码与响应体定位真实错误——错误可能只在接口响应里、页面上看不到。不带参数=列出最近请求；args.keyword 按 URL 子串过滤列表；args.id=条目 id 查看该条响应体（可加 args.search 在响应体内搜关键字）；只给 args.search=在所有响应体里搜关键字。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '按 URL 子串过滤（列表模式）' },
          id: { type: 'string', description: '条目 id（查看该条响应体）' },
          search: { type: 'string', description: '响应体内搜索的关键字' },
        },
      },
      // 与快照同为「当前状态」：新查询回灌时旧列表/响应体结果降级为一行占位，防止上下文累积
      stateful: 'network',
      execute: async (a) => {
        const id = Number(a.id);
        if (Number.isFinite(id) && id > 0) return ctx.network.getBody(id, a.search != null ? String(a.search) : undefined);
        const search = a.search != null ? String(a.search).trim() : '';
        if (search) return ctx.network.searchInBodies(a.keyword != null ? String(a.keyword) : undefined, search);
        return ctx.network.list(a.keyword != null ? String(a.keyword) : undefined);
      },
    } as AgentTool,
  ];

  // 统一组件语义动作工具（词表来自项目 preset 内插件声明，与预拆分 prompt 词表同源）；
  // 执行外壳为三级降级分发器：preferFill 真实交互 → 插件匹配链 → 原生交互，全链失败回灌模型。
  if (ctx.pluginActions.length) {
    const vocabDesc = ctx.pluginActions
      .map((v) => `- ${v.name}：${v.doc ?? ''}${v.preferFill ? '（优先直接填写）' : ''}`)
      .join('\n');
    tools.push({
      name: 'component_action',
      description: `组件库语义动作：对组件库假控件（antd/element 的下拉、日期选择器等非原生控件）执行注册的语义动作，平台自动按优先级匹配组件库插件完成（失败自动降级：下一插件 → 原生交互）。动作自身会打开/收起弹层等临时 UI：直接对目标控件调用即可，无需先点击它打开（如先点开下拉）；不确定选项/值是否存在也可直接调用，失败结果会列出当前可选项。args.action=动作名（限下方词表）+ args.selector（目标元素编号或定位表达式）+ args.value（主要参数：选项文本/日期；select 可改传 args.index，0 起，与 value 二选一）+ args.instruction（必填）。\n可用动作词表：\n${vocabDesc}`,
      parameters: componentActionParameters(ctx.pluginActions.map((v) => v.name)),
      execute: (a) => runComponentAction(ctx, a),
    });
  }

  // 主动求助（人在回路）：模型困惑时挂起等人决策，替代盲目重试/重复已落库步骤。
  // 决策结果（补充说明/AI 修正/手动完成/跳过）作为工具结果回灌，模型从当前状态继续。
  if (askHuman) {
    tools.push({
      name: 'ask_human',
      description:
        '主动向用户求助（挂起生成，等待人工决策）。感到困惑时立即调用，不要在困惑中反复试错：换过不同方式仍无法达成目标、页面状态与预期不符且看不出原因、编号表和结构树里都找不到目标、或下一步只能是重复之前已做过的操作。args.question 简述困惑点与已尝试的做法（将展示给用户）。',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string' } },
        required: ['question'],
      },
      execute: async (a) => askHuman(String(a.question ?? '').trim() || '（未说明困惑点）'),
    });
  }

  // 脚本步骤修订（只改脚本不执行浏览器动作）：修正后重做提交时修订已落步骤而非追加，
  // 保持已验证流程的行为等价，只清理有明确证据的失败重试冗余。
  tools.push({
    name: 'revise',
    stateful: 'script',
    description:
      '修订已记录的脚本步骤（只改脚本，不执行浏览器动作，不影响当前页面状态）。' +
      '适用场景（修正动作已实际执行并验证后，仅清理有明确证据的失败重试冗余；保留完整成功流程，不以步骤最少为目标，不得仅因 URL、元素或值相同就删除重复操作）：' +
      '① 提交失败且是参数问题（如手机号重复、名称已存在、值不合法）需要换值重试——改 value、删除冗余的旧值提交/重填链；' +
      '② 点击提交后弹窗未关、被必填校验拦截（提交未生效）——补填缺失字段重新提交成功后，删除先前落空的旧提交步。' +
      'args.ops 操作数组，序号与本轮工具结果里「已记录为第 N 步」的 N 一致（1-based，仅本轮生成内；可修订范围见返回的清单）：\n' +
      '- {"op":"update","step":9,"value":"新值"} 修改第 9 步的填写值（可改 value/key/instruction/expected，只改给出的字段；expected 仅断言步）\n' +
      '- {"op":"delete","from":12,"to":13} 删除第 12~13 步（含端点；省略 to = 只删 from）\n' +
      'ops 按顺序执行，先删后改会使后面的序号移位（以返回的最新步骤清单为准）。修订后继续正常执行剩余动作。',
    parameters: {
      type: 'object',
      properties: {
        ops: {
          type: 'array',
          description: '修订操作数组（按顺序执行）',
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['update', 'delete'] },
              step: { type: 'number', description: 'update：待改步骤序号（1-based）' },
              from: { type: 'number', description: 'delete：起始步序号（1-based）' },
              to: { type: 'number', description: 'delete：结束步序号（含端点，省略 = 只删 from）' },
              value: { type: 'string', description: 'update：新的填写/选择值' },
              key: { type: 'string', description: 'update：新的按键' },
              instruction: { type: 'string', description: 'update：新的自然语言描述' },
              expected: { type: 'string', description: 'update：断言步新的期望值' },
            },
            required: ['op'],
          },
        },
      },
      required: ['ops'],
    },
    execute: async (a) => {
      const ops = a.ops;
      if (!Array.isArray(ops)) throw new Error('revise 缺少 ops（修订操作数组）');
      return ctx.revise(ops as ReviseOp[]);
    },
  });

  tools.push({
    name: 'finish',
    description: '完成脚本生成。所有必验目标必须有与当前脚本一致的实际通过证据，且末步为断言；不能用总结文字代替验证。args.message 可选总结。',
    parameters: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
    execute: async (a) => {
      const reject = finishValidate ? await finishValidate(a) : null;
      if (reject) throw new Error(reject);
      return `脚本生成完成。${a.message ?? ''}`;
    },
  });

  const mutations = new Set(['goto', 'click', 'fill', 'press', 'check', 'select', 'act', 'component_action', 'batch_actions']);
  const batchTools = new Set(['fill', 'check', 'select']);
  tools.push({
    name: 'batch_actions',
    description: '批量填写独立字段：最多 6 个 fill/check/原生 select，逐个串行验证、执行并保存。失败、页面/浮层变化、其他字段联动时立即停止，已完成动作不会重做。不要批量操作联动字段。',
    parameters: { type: 'object', properties: { actions: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', properties: {
      action: { type: 'string', enum: ['fill', 'check', 'select'] }, selector: { type: 'string' }, instruction: { type: 'string' }, value: { type: 'string' }, checked: { type: 'boolean' },
    }, required: ['action', 'selector', 'instruction'] } } }, required: ['actions'] },
    execute: async (args) => {
      if (!Array.isArray(args.actions) || !args.actions.length || args.actions.length > 6) throw new Error('批次必须包含 1~6 个动作');
      const actions = args.actions as Record<string, unknown>[];
      for (const a of actions) {
        if (!a || !batchTools.has(String(a.action)) || !a.selector || !a.instruction) throw new Error('批次只能包含有效的 fill/check/select');
        if (a.action === 'check' ? typeof a.checked !== 'boolean' : typeof a.value !== 'string') throw new Error('批次缺少 value/checked');
      }
      let before = await captureObservation(ctx.pwPage);
      const completed: string[] = [];
      for (const [i, action] of actions.entries()) {
        if (ctx.signal?.aborted) return { status: 'uncertain', text: `批次已中止；已完成 ${completed.length} 项：${completed.join('；')}` };
        let targetId: string | null = null;
        try {
          const loc = await resolveLocator(ctx, String(action.selector));
          targetId = await loc.getAttribute('data-tt-idx', { timeout: 1000 });
          const result = await runActionShell(ctx, action.action as 'fill' | 'check' | 'select', action);
          if (typeof result !== 'string' && result.status === 'failed') throw new Error(result.text);
          completed.push(`${i + 1}. ${String(action.instruction)}`);
        } catch (e) {
          return { status: 'failed', text: `第 ${i + 1} 项失败：${String(e)}。已完成 ${completed.length} 项（已保存，不要重做）：${completed.join('；')}；剩余未执行。` };
        }
        await waitStableInPage(ctx.pwPage);
        const after = await captureObservation(ctx.pwPage);
        if (!targetId || batchBoundary(before, after, targetId)) {
          return { status: 'success', text: `批次在第 ${i + 1} 项后检测到页面/其他字段变化，已停止。已完成并保存：${completed.join('；')}；剩余 ${actions.length - completed.length} 项未执行，请依据新快照重新规划。` };
        }
        before = after;
      }
      return { status: 'success', text: `批次完成（逐项已保存）：${completed.join('；')}` };
    },
  });

  return tools.map((tool) => {
    if (mutations.has(tool.name)) {
      const props = (tool.parameters.properties ?? {}) as Record<string, unknown>;
      tool.parameters = { ...tool.parameters, properties: { ...props, snapshotVersion: { type: 'string', description: '使用编号时传最新快照版本；页面变化后旧版本会被拒绝' } } };
    }
    return { ...tool, execute: async (args: Record<string, unknown>) => {
      if (ctx.signal?.aborted) throw new Error('操作已中止');
      const mutating = mutations.has(tool.name);
      const before = mutating ? await captureObservation(ctx.pwPage).catch(() => null) : null;
      if (mutating && args.snapshotVersion != null && (!before || args.snapshotVersion !== before.version)) throw new Error('快照版本已过期，请获取新快照后重新规划');
      const targetId = before && args.selector ? await ctx.pwPage.locator(semanticSource(sub(ctx, String(args.selector)) ?? String(args.selector))).getAttribute('data-tt-idx', { timeout: 200 }).catch(() => null) : null;
      const countBefore = ctx.stepCount();
      let result: string | AgentToolResult;
      try { result = await tool.execute(args); }
      catch (error) {
        if (!mutating) throw new Error(redactGenerationText(ctx.jobId, String(error)));
        result = { status: 'failed', text: redactGenerationText(ctx.jobId, String(error)) };
      }
      if (mutating) {
        // 成功动作已保存。观察失败不会诱导重新执行，也不撤销部分成功。
        const data: AgentToolResult = typeof result === 'string' ? { status: 'success', text: result } : result;
        try {
          if (before && !ctx.signal?.aborted) await waitStableInPage(ctx.pwPage);
          const after = await captureObservation(ctx.pwPage);
          ctx.lastObservation = after;
          ctx.snapshotVersion = after.version;
          data.progressed = before ? stateFingerprint(before) !== stateFingerprint(after) : false;
          data.effect = data.progressed ? 'observed' : 'unknown';
          data.stateFingerprint = stateFingerprint(after);
          data.observation = observationText(after);
          data.observationKind = 'snapshot';
          if (before) data.resetFields = Object.keys(before.values).filter(id => id !== (targetId ?? String(args.selector)) && id in after.values && before.values[id] !== after.values[id] && /value=\S|checked=true/.test(before.values[id]));
        } catch { data.progressed = false; data.effect = 'unknown'; }
        const recorded = ctx.stepCount() - countBefore;
        if (recorded > 0) data.text += ` 本次共记录 ${recorded} 步。`;
        if (!data.progressed && data.status !== 'failed') data.text += ' 尚未确认状态变化；请检查结果，不要直接重复提交。';
        result = data;
      } else if (['snapshot', 'page_tree', 'readText', 'api'].includes(tool.name)) {
        const state = tool.name === 'snapshot' ? ctx.lastObservation : await captureObservation(ctx.pwPage).catch(() => null);
        result = { text: typeof result === 'string' ? result : result.text, stateFingerprint: state ? stateFingerprint(state) : undefined };
      }
      // 直调异常保持原契约；部分成功保留结构化结果供循环处理。
      if (typeof result !== 'string' && result.status === 'failed' && ctx.stepCount() === countBefore && tool.name !== 'select' && tool.name !== 'component_action' && tool.name !== 'act' && tool.name !== 'batch_actions') throw new Error(redactGenerationText(ctx.jobId, result.text));
      return redactGenerationData(ctx.jobId, result);
    } };
  });
}

/** 页内动作转发（带 15s 超时兜底）：结果为运行时归一化的三态协议（string→success / throw→failed / 对象→显式三态）。 */
async function invokeInPage(ctx: GenToolContext, pluginId: string, action: string, handle: any, args: Record<string, unknown>): Promise<PluginActionResult> {
  const run = ctx.pwPage.evaluate(
    async ([pid, act, target, actionArgs]: any[]) => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      if (!reg) throw new Error('页面未注入插件运行时：请检查项目的组件预设');
      const el = target && target.isConnected ? target : null;
      return await reg.invokeAction(pid, act, el, actionArgs ?? {});
    },
    [pluginId, action, handle, args] as any,
  );
  return await Promise.race([
    run,
    new Promise<PluginActionResult>((_, reject) => setTimeout(() => reject(new Error(`插件动作 ${pluginId}.${action} 执行超时（15s）`)), 15000)),
  ]);
}

// ---- 语义动作分发器（component_action：三级降级）----

/** 页内匹配链解析：detect(el) 命中且注册了该动作的插件，按注册顺序（= preset 注入优先级）返回。 */
async function resolveChainInPage(ctx: GenToolContext, action: string, handle: any): Promise<{ id: string; variant?: string }[]> {
  try {
    const chain = (await ctx.pwPage.evaluate(
      ([act, target]: any[]) => {
        const reg = (globalThis as any).__ttPluginRegistry__;
        if (!reg || !target || !target.isConnected) return [];
        return reg.resolveChain(target, act);
      },
      [action, handle] as any,
    )) as { id: string; variant?: string }[];
    return Array.isArray(chain) ? chain : [];
  } catch {
    return []; // 运行时未注入/解析失败：链视为空，走原生交互 tier
  }
}

/** 页内链式后验（fill 优先路径专用）：对链上声明了 verify 的插件逐个执行，任一通过即真。
 *  true=后验通过；false=有插件声明 verify 但全部未过（输入未真实提交）；
 *  null=链为空或无人声明 verify（无法判定，调用方回退帧哈希口径）。 */
async function verifyChainInPage(
  ctx: GenToolContext,
  chain: { id: string; variant?: string }[],
  action: string,
  handle: any,
  args: Record<string, unknown>,
): Promise<boolean | null> {
  if (!chain.length) return null;
  try {
    const verdicts = (await ctx.pwPage.evaluate(
      async ([act, target, actionArgs, ids]: any[]) => {
        const reg = (globalThis as any).__ttPluginRegistry__;
        if (!reg) return null;
        const el = target && target.isConnected ? target : null;
        const out: (boolean | null)[] = [];
        for (const pid of ids) {
          out.push(await reg.invokeVerify(pid, act, el, actionArgs ?? {}));
        }
        return out;
      },
      [action, handle, args, chain.map((c) => c.id)] as any,
    )) as (boolean | null)[] | null;
    if (!Array.isArray(verdicts)) return null;
    if (verdicts.some((v) => v === true)) return true;
    if (verdicts.some((v) => v === false)) return false;
    return null;
  } catch {
    return null; // 页面上下文不可用等：视为无法判定
  }
}

/** 语义化落库（count===1+同节点）并 emit 语义动作步骤（action='plugin'，pluginId 为命中提示）。
 *  pre 为动作前预采集的候选（见 runComponentAction）；缺省时动作后补采。
 *  返回 emit 结果；sem 采集失败未落库时返回 null（调用方回退为不带步号的文案）。 */
async function emitSemanticActionStep(
  ctx: GenToolContext,
  action: string,
  selector: string,
  instruction: string,
  winner: string | undefined,
  rawValue: string | undefined,
  extraArgs: Record<string, unknown>,
  pre?: TestStep['locator'] | null,
): Promise<EmitOutcome | null> {
  const sem = pre ?? (await semanticizeLocator(ctx.pwPage, semanticSource(sub(ctx, selector) ?? selector), { mode: 'playwright' }).catch(() => null));
  if (!sem) return null;
  return ctx.emit(
    buildPluginActionStep(action, sem, instruction, {
      pluginId: winner,
      value: rawValue,
      args: extraArgs,
      // 插件声明的展示名随步骤落库（状态标签/导出等展示点直接取用，无需再查词表）
      label: ctx.pluginActions.find((v) => v.name === action)?.label,
    }),
  );
}

/**
 * 统一语义动作执行外壳（三级降级，所有成功路径统一 emit 语义动作步骤；全链失败回灌模型不抛错）：
 * 1) preferFill 真实交互优先（fill+Enter；页内链式后验通过才算成功——画面变化可能只是弹出面板展开，
 *    无 verify 声明才回退帧哈希口径，且哈希采集失败不按成功接受）；
 * 2) 插件匹配链逐个尝试（resolveChain：detect 命中且注册了该动作，preset 优先级序）——
 *    success 即成；uncertain 以页面效果哈希兜底判定（不轻信插件自述）；failed 落链上下一个；
 * 3) 原生交互 tier（selectOption / fill / click）。
 */
async function runComponentAction(ctx: GenToolContext, a: Record<string, unknown>): Promise<string | AgentToolResult> {
  const action = String(a.action ?? '').trim();
  const selector = String(a.selector ?? '').trim();
  if (!action) throw new Error('component_action 缺少 action（语义动作名）');
  if (!selector) throw new Error('component_action 缺少 selector（元素编号或定位表达式）');
  const instruction = String(a.instruction ?? '').trim() || action;
  const entry = ctx.pluginActions.find((v) => v.name === action);
  if (!entry) {
    // 词表校验：未知动作直接回灌提示（含可用清单），不执行
    return { status: 'failed', text: `错误：未注册的语义动作「${action}」。可用动作：${ctx.pluginActions.map((v) => v.name).join('、') || '（无）'}。` };
  }
  const extraArgs = (a.args && typeof a.args === 'object' ? { ...a.args } : {}) as Record<string, unknown>;
  const providedValue = a.value ?? extraArgs.value;
  const indexed = action === 'select' && extraArgs.index != null;
  if (action === 'select') {
    if (indexed && (!Number.isInteger(extraArgs.index) || Number(extraArgs.index) < 0)) {
      return { status: 'failed', text: 'select 参数错误：args.index 必须为非负整数（0=第一项，1=第二项）。本步未执行。' };
    }
    if (indexed && providedValue != null) {
      return { status: 'failed', text: 'select 参数冲突：value 与 args.index 只能二选一。本步未执行，请修正参数后重试本动作。' };
    }
    if (!indexed && (typeof providedValue !== 'string' || !providedValue.trim())) {
      return { status: 'failed', text: 'select 缺少 value（选项文本）。若目标是第一项，请保持 action、selector 不变，补上 args:{index:0} 重试；若已知名称，请补上 value。instruction 仅用于描述，不会自动解析为选项。本步未执行，无需先点击展开或使用 act。' };
    }
  }
  let rawValue = providedValue != null ? String(providedValue) : undefined;
  const value = sub(ctx, rawValue);
  delete extraArgs.value;
  const loc = await resolveLocator(ctx, selector, a.snapshotVersion);
  const handle = await loc.elementHandle({ timeout: 8000 }).catch(() => null);
  if (!handle) return { status: 'failed', text: `错误：未找到目标元素（${selector}）。请重新 snapshot 确认编号后重试。` };
  // 语义化候选动作前预采集（同 runActionShell：动作引发的状态类/可访问名漂移不编入定位器）；
  // 无可靠定位器时不执行，避免操作完成却无法保存。
  const semPre = await semanticizeLocator(ctx.pwPage, semanticSource(sub(ctx, selector) ?? selector), { mode: 'playwright', noRawFallback: true }).catch(() => null);
  if (!semPre) return { status: 'failed', text: '无法在操作前生成可靠定位器，本步未执行。请重新 snapshot 定位。' };
  const actionArgs: Record<string, unknown> = { ...extraArgs, ...(value != null ? { value } : {}) };
  const beforeHash = await shotHash(ctx.pwPage).catch(() => null);

  const finishOk = async (winner: string | undefined, message: string): Promise<string | AgentToolResult> => {
    const oc = await emitSemanticActionStep(ctx, action, selector, instruction, winner, rawValue, extraArgs, semPre);
    ctx.note(`${instruction}（${action}${winner ? ` via ${winner}` : ''}）`);
    return oc ? `${message}。${落库提示(ctx, oc)}` : { status: 'uncertain', text: `${message}。（语义定位失败，本步未落库，请先确认页面状态并请求人工协助，不要重复执行）` };
  };

  // 1) preferFill：真实交互优先（可输入控件直接 fill+Enter 最稳定）。
  // 成功判定不在「画面有变化」——对弹出型控件（日期/时间选择器等）fill 本身就会展开面板，
  // 帧哈希必变但值未必提交。口径：插件链上声明了 verify 的，页内后验通过才算成功；
  // 后验不过 → 落插件链走动作本体（面板翻页等）；无 verify 声明时才回退帧哈希口径，
  // 且哈希采集失败（!beforeHash/!afterHash）不再按成功接受，同样落链。
  if (entry.preferFill && value != null) {
    try {
      await loc.fill(value);
      await ctx.pwPage.keyboard.press('Enter');
      await new Promise((r) => setTimeout(r, 300));
      const chain = await resolveChainInPage(ctx, action, handle);
      const verdict = await verifyChainInPage(ctx, chain, action, handle, actionArgs);
      if (verdict === true) {
        return await finishOk(undefined, `已通过输入方式设置：${value}`);
      }
      if (verdict !== false) {
        // 无 verify 声明（null）：保留旧帧哈希口径，但仅画面真实变化才接受
        const afterHash = await shotHash(ctx.pwPage).catch(() => null);
        if (beforeHash && afterHash && effectChanged(beforeHash, afterHash)) {
          return await finishOk(undefined, `已通过输入方式设置：${value}`);
        }
      }
    } catch {
      /* fill 不可行（非可输入控件等）或后验未过：转入插件匹配链 */
    }
  }

  // 2) 插件匹配链：success 即成；uncertain 以效果哈希兜底；failed/未过验 → 链上下一个
  const chain = await resolveChainInPage(ctx, action, handle);
  const attempted: string[] = [];
  let chainMessage = '';
  for (const hit of chain) {
    attempted.push(hit.id);
    const result: PluginActionResult = await invokeInPage(ctx, hit.id, action, handle, actionArgs).catch((e) => ({ status: 'failed' as const, message: String(e) }));
    if (result.status === 'success') {
      if (indexed) {
        if (!result.resolvedValue?.trim()) return { status: 'uncertain', text: '插件未返回按序选择的实际文本，无法保存可回放步骤。请确认页面状态并请求人工协助，不要重复执行。' };
        rawValue = result.resolvedValue;
        delete extraArgs.index;
      }
      return await finishOk(hit.id, result.message || `已由插件 ${hit.id} 完成`);
    }
    if (result.status === 'uncertain' && !indexed) {
      await new Promise((r) => setTimeout(r, 300));
      const afterHash = await shotHash(ctx.pwPage).catch(() => null);
      if (beforeHash && afterHash && effectChanged(beforeHash, afterHash)) {
        return await finishOk(hit.id, result.message || `已由插件 ${hit.id} 完成（效果校验通过）`);
      }
    }
    chainMessage = result.message;
  }

  // 3) 原生交互 tier：无插件命中或全链失败时兜底（select 动作对原生 <select> 走 selectOption）。
  // 链上有 verify 声明时，原生兜底同样过页内后验：原生 fill 本身无验证，若不验即报成功，
  // 会把插件链的诊断（如「日期处于禁用状态」）掩盖成假成功，模型失去修正参数的机会
  let nativeMessage = '';
  try {
    if (action === 'select') {
      const native = await handle.evaluate((el: Element) => el.tagName === 'SELECT');
      if (!native) throw new Error('已跳过原生 selectOption：目标不是原生 <select>，请修正选择参数或检查插件适配');
      if (indexed) {
        const option = await handle.evaluate((el: HTMLSelectElement, requestedIndex: number) => {
          const indices = Array.from(el.options).map((o, index) => ({ o, index })).filter(({ o }) => !o.disabled && !o.closest('optgroup[disabled]') && !o.hidden && getComputedStyle(o).display !== 'none' && getComputedStyle(o).visibility !== 'hidden' && o.value !== '');
          const option = indices[requestedIndex];
          return option ? { index: option.index, value: option.o.value } : null;
        }, Number(extraArgs.index));
        if (!option) throw new Error('args.index 超出可选范围（已排除禁用、隐藏和空值占位项），请修正索引后重试本动作');
        await loc.selectOption({ index: option.index });
        rawValue = option.value;
        actionArgs.value = option.value;
        delete extraArgs.index;
      } else {
        await loc.selectOption(String(value ?? ''));
      }
    } else if (value != null) {
      await loc.fill(String(value ?? ''));
    } else {
      await loc.click();
    }
    const verdict = await verifyChainInPage(ctx, chain, action, handle, actionArgs);
    if (verdict === false) {
      nativeMessage = '原生交互已执行但页内后验未通过（终态与预期不符，值未真正提交）';
    } else {
      return await finishOk(undefined, `已通过原生交互完成 ${action}`);
    }
  } catch (e) {
    nativeMessage = String(e);
  }

  // 错误透传：插件链诊断与原生层错误并列回灌、不互相覆盖——链上消息（如「下拉选项未找到（当前可选：…）」）
  // 才是模型修正参数的关键信息，置于最前避免被截断丢掉。
  const detail = [
    chainMessage.trim() ? `插件链：${chainMessage.trim()}` : '',
    nativeMessage.trim() ? `原生交互：${nativeMessage.trim()}` : '',
  ]
    .filter(Boolean)
    .join('；');
  // 链上错误已带真实可选值清单（select 系插件「当前可选：」/ tree-select 系插件「当前可见：」）时，首选建议是
  // 修正 value 重试同一语义动作——这比换路径（两段式/act）路径更短，且成功后落库的是稳健的语义动作步骤。
  // 日期禁用类诊断同理：值本身格式合法但被应用规则（disabledDate）拒绝，换路径无解，只能换值。
  const guide = indexed
    ? '请修正 args.index，或从当前可选清单取具体文本作为 value 并移除 args.index 后重试本动作；不要重复相同参数或改用 act。'
    : /缺少.*value/.test(chainMessage)
    ? '该插件需要具体选项文本；请补上 value 并移除 args.index 后重试本动作，不要重复缺参调用。'
    : /（当前(可选|可见)：/.test(chainMessage)
    ? '请从上方「当前可选/当前可见」清单中取正确文本，仅修正 args.value 重试本动作（其余参数不变），不要改用两段式点击或 act。'
    : /禁用/.test(chainMessage)
      ? '该值格式合法但被应用规则禁用（如日期不可早于今天），请仅修正 args.value 为可用值（如未来日期）重试本动作（其余参数不变）。'
      : '请 snapshot 确认当前页面状态后换路径（两段式点击、修正参数或 act）。';
  return { status: 'failed', text: `错误：语义动作 ${action} 全链失败（尝试顺序：${attempted.join(' → ') || '无匹配插件'}）。${(detail || '无错误信息').slice(0, 300)}。${guide}` };
}
