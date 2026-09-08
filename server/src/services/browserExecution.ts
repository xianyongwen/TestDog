import type { TestStep } from '../shared/testScript';

export type LocatorAction = 'click' | 'fill' | 'press' | 'check' | 'select';

/** 生成、回放共用的动作语义；省略 checked 的旧脚本仍表示勾选。 */
export async function executeLocatorAction(loc: any, step: Pick<TestStep, 'action' | 'value' | 'key' | 'checked'>, timeout = 15000): Promise<void> {
  const options = { timeout };
  switch (step.action) {
    case 'click': await loc.click(options); break;
    case 'fill': await loc.fill(step.value ?? '', options); break;
    case 'press': await loc.press(step.key ?? 'Enter', options); break;
    case 'check': await loc.setChecked(step.checked ?? true, options); break;
    case 'select': await loc.selectOption(step.value ?? '', options); break;
    default: throw new Error(`不支持的定位动作：${step.action}`);
  }
}

/** 解析单个 observe 候选。候选之间是替代关系，不作为多步计划执行。 */
export function observedAction(action: any): { action: LocatorAction; selector: string; value?: string; key?: string; checked?: boolean } {
  if (!action?.selector || typeof action.selector !== 'string') throw new Error('observe 未返回有效 selector');
  const args = action.arguments ?? [];
  const base = { selector: action.selector };
  switch (action.method) {
    case 'click': return { ...base, action: 'click' };
    case 'type':
    case 'fill':
      if (typeof args[0] !== 'string') throw new Error('observe 填写动作缺少文本参数');
      return { ...base, action: 'fill', value: args[0] };
    case 'press':
      if (typeof args[0] !== 'string') throw new Error('observe 按键动作缺少 key');
      return { ...base, action: 'press', key: args[0] };
    case 'check': return { ...base, action: 'check', checked: true };
    case 'uncheck': return { ...base, action: 'check', checked: false };
    case 'setChecked':
      if (args[0] !== true && args[0] !== false && args[0] !== 'true' && args[0] !== 'false') throw new Error('observe setChecked 参数必须是布尔值');
      return { ...base, action: 'check', checked: args[0] === true || args[0] === 'true' };
    case 'select':
    case 'selectOption':
      if (typeof args[0] !== 'string') throw new Error('observe 选择动作仅支持单个字符串值，请使用 component_action');
      return { ...base, action: 'select', value: args[0] };
    default: throw new Error(`不支持的 observe 动作：${action.method}；请使用确定性工具或组件动作`);
  }
}

export async function waitForBrowserAssertion(o: {
  page: any; locator?: any; type: string; expected?: string; timeoutMs?: number; signal?: AbortSignal;
}): Promise<void> {
  if (!['visible', 'hidden', 'text', 'url'].includes(o.type)) throw new Error(`未知断言类型：${o.type}`);
  if ((o.type === 'text' || o.type === 'url') && !o.expected) throw new Error(`${o.type === 'url' ? 'URL' : '文本'} 断言缺少 expected`);
  if ((o.type === 'visible' || o.type === 'hidden') && !o.locator) throw new Error('可见性断言缺少定位器');
  const end = Date.now() + Math.min(30000, Math.max(0, o.timeoutMs ?? 10000));
  let actual = '';
  do {
    if (o.signal?.aborted) throw new Error('断言已中止');
    try {
      let ok = false;
      if (o.type === 'url') { actual = String(await o.page.url()); ok = actual.includes(o.expected!); }
      else if (o.type === 'text') {
        const loc = o.locator ?? o.page.locator('body');
        // innerText 排除隐藏 DOM；有定位器时要求该区域本身可见。
        actual = await loc.innerText({ timeout: Math.max(1, Math.min(200, end - Date.now())) });
        ok = (!o.locator || await loc.isVisible()) && actual.includes(o.expected!);
      } else {
        const visible = await o.locator.isVisible();
        ok = o.type === 'visible' ? visible : !visible;
      }
      if (ok) return;
    } catch { /* 等待挂载或异步导航；所有轮询共用总预算 */ }
    if (Date.now() >= end) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(100, end - Date.now())));
  } while (true);
  throw new Error(`断言未通过（${o.type}）：期望 ${o.expected ?? o.type}，实际 ${actual.slice(0, 160) || '不满足'}`);
}
