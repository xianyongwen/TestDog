import type { EmitOutcome, TestStep } from '../../shared/testScript';
import { semanticizeLocator } from '../locatorVerifier';
import { pub, pubToolWithUsage } from './logBridge';
import { trunc } from './util';
import type { CapturedEvent } from './types';

/** 手动捕获等待用户操作的超时（比 assist 决策更长：用户要在页面上完成真实操作）。 */
const CAPTURE_TIMEOUT_MS = 10 * 60_000;

/** 手动捕获注入脚本：每次注入先清空缓冲，再把用户真实操作写进 window.__tt_buffer（首个事件即该步）。
 *  仅在工具循环挂起等待用户期间注入（智能体不动作），无需区分事件是否来自自动化。 */
const CAPTURE_SCRIPT = `(() => {
  window.__tt_buffer = [];
  if (window.__tt_capturing) return;
  window.__tt_capturing = true;
  const esc = (s) => CSS.escape(String(s));
  const selOf = (el) => {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + esc(el.id);
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      let part = n.tagName.toLowerCase();
      const parent = n.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === n.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      }
      parts.unshift(part);
      n = parent;
    }
    return parts.join(' > ');
  };
  const send = (evt) => { try { window.__tt_buffer.push(evt); } catch (e) {} };
  let fillTimer = null;
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? (e.target.closest('a,button,input,textarea,select,[role="button"]') || e.target) : null;
    if (!el) return;
    send({ type: 'click', selector: selOf(el) });
  }, true);
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    clearTimeout(fillTimer);
    fillTimer = setTimeout(() => send({ type: 'fill', selector: selOf(el), value: el.value }), 400);
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el instanceof HTMLSelectElement) send({ type: 'select', selector: selOf(el), value: el.value });
    else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) send({ type: 'fill', selector: selOf(el), value: el.value });
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const el = e.target instanceof Element ? (e.target.closest('input,textarea') || e.target) : null;
    if (!el) return;
    send({ type: 'press', selector: selOf(el), key: 'Enter' });
  }, true);
})();`;

/** 手动捕获事件 → TestStep（定位器用 semanticizeLocator 稳定化，失败回退 CSS 选择器定位）。 */
function buildCapturedStep(evt: CapturedEvent, locator: TestStep['locator'] | undefined, instruction: string): TestStep {
  const base = { kind: 'action' as const, instruction, description: instruction, ...(locator ? { locator } : {}) };
  if (evt.type === 'click') return { ...base, action: 'click' };
  if (evt.type === 'fill') return { ...base, action: 'fill', value: evt.value ?? '' };
  if (evt.type === 'select') return { ...base, action: 'select', value: evt.value ?? '' };
  return { ...base, action: 'press', key: evt.key ?? 'Enter' };
}

/** 手动捕获事件摘要（pubTool / gen:assist-status 文案用）。 */
function capturedEventLabel(evt: CapturedEvent): string {
  if (evt.type === 'click') return '点击';
  if (evt.type === 'fill') return `填写「${trunc(String(evt.value ?? ''), 40)}」`;
  if (evt.type === 'select') return `选择「${trunc(String(evt.value ?? ''), 40)}」`;
  return `回车`;
}

export interface ManualCaptureDeps {
  jobId: string;
  pwPage: any;
  /** 落库 emit（智能体循环的 emitStep：捕获步骤经大纲等待补插/侦察吸收装饰后落库）。 */
  emit: (step: TestStep) => Promise<EmitOutcome>;
  isCancelled: () => boolean;
}

/** 手动捕获工厂：注入监听脚本等待用户在浏览器里完成操作，首个事件稳定化后落库为脚本步骤，
 *  并把捕获结果作为工具结果回灌给模型（「手动操作」决策的唯一实现，三条 assist 通道共用）。 */
export function createManualCapture(deps: ManualCaptureDeps): (context: string) => Promise<string> {
  const { jobId, pwPage, emit, isCancelled } = deps;

  /** 轮询页内 __tt_buffer 取首个捕获事件；取消/超时/页面关闭返回 null。400ms 间隔，
   *  页面跳转导致执行上下文重建时自动重注入监听脚本（缓冲清零，用户在新页面重新操作）。 */
  const pollCapturedEvent = (): Promise<CapturedEvent | null> =>
    new Promise((resolve) => {
      const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
      let reinject = false; // 上次读取失败 → 下次先重注入再读
      const timer = setInterval(() => {
        if (isCancelled() || Date.now() > deadline) {
          clearInterval(timer);
          resolve(null);
          return;
        }
        void (async () => {
          try {
            if (reinject) {
              reinject = false;
              await pwPage.evaluate(CAPTURE_SCRIPT);
            }
            const buf = (await pwPage.evaluate(() => (globalThis as any).__tt_buffer || [])) as CapturedEvent[];
            if (buf.length) {
              clearInterval(timer);
              resolve(buf[0]);
            }
          } catch {
            reinject = true; // 执行上下文已销毁（跳转）或浏览器已关闭，下轮重试
          }
        })();
      }, 400);
    });

  return async (context: string): Promise<string> => {
    try {
      await pwPage.evaluate(CAPTURE_SCRIPT);
      // 页面跳转/上下文重建后重注入（幂等：脚本自身先清缓冲）
    } catch {
      /* 注入失败不阻塞：轮询侧会兜底重注入 */
    }
    pub({ type: 'gen:assist-status', jobId, status: 'manual', message: '请在浏览器中完成该步骤（点击/输入/回车）…' });
    const evt = await pollCapturedEvent();
    if (isCancelled()) return '（生成已取消）';
    if (!evt) return `人工协助超时未响应：${context}`;
    // 定位器稳定化（与智能体动作同红线）；失败回退原始 CSS 选择器，保证步骤可用
    const loc = await semanticizeLocator(pwPage, evt.selector, { mode: 'playwright' }).catch(() => null);
    const instruction = trunc(context, 120) || `手动${capturedEventLabel(evt)}`;
    const step = buildCapturedStep(evt, loc ?? undefined, instruction);
    const oc = await emit(step);
    pubToolWithUsage(jobId, 0, '手动捕获', `${evt.type} ${evt.selector}`, `手动捕获：${capturedEventLabel(evt)}（${evt.selector}）`, {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
    });
    const where = `已记录为第 ${oc.index} 步`;
    return `【用户引导】用户已手动在浏览器完成操作：${capturedEventLabel(evt)}（${evt.selector}），系统已捕获并${where}。请重新 snapshot 确认当前页面状态，从新状态继续完成目标（不要重复该操作）。`;
  };
}
