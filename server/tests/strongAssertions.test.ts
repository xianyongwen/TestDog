/// <reference lib="dom" />
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { browserLaunchOptions } from '../src/browser';
import { waitForBrowserAssertion } from '../src/services/browserExecution';
import { buildGenTools, type GenToolContext } from '../src/services/generationToolHost';
import { resolveQuery } from '../src/services/locatorVerifier';
import type { TestStep } from '../src/shared/testScript';
import type { TestIntent } from '../src/shared/testIntent';

let browser: Browser;
let page: Page;
beforeAll(async () => { browser = await chromium.launch(browserLaunchOptions({ headless: true })); });
afterAll(async () => { await browser?.close(); });
beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page?.close(); });

function host(intent?: TestIntent) {
  const steps: TestStep[] = [];
  const passed: TestStep[] = [];
  const ctx = { jobId: 'strong-assertions', usageKey: 'strong-assertions', pwPage: page, page, pluginActions: [], modelVision: false, intent,
    envMap: {}, sub: (s?: string | null) => s?.replace('{{name}}', '客户_123'), note: () => {}, stepCount: () => steps.length,
    emit: async (s: TestStep) => { steps.push(s); return { index: steps.length }; }, onAssertionPassed: (s: TestStep) => passed.push(s),
  } as unknown as GenToolContext;
  return { steps, passed, assert: buildGenTools(ctx).find(t => t.name === 'assert')! };
}
const verify = (type: string, selector: string, expected?: string, timeoutMs = 300) => waitForBrowserAssertion({ page, type, locator: page.locator(selector), expected, timeoutMs });

describe('强断言的实际浏览器语义', () => {
  it('精确文本不能用前缀通过，规范化空白，文本范围严格限制于目标记录', async () => {
    await page.setContent('<div id="row">客户_123 <span>13800000000</span></div><div id="other">客户_999</div>');
    await verify('text_exact', '#row', '客户_123\n13800000000');
    await expect(verify('text_exact', '#row', '客户_')).rejects.toThrow('断言未通过');
    await expect(verify('text', '#row', '客户_999')).rejects.toThrow('断言未通过');
  });

  it('验证字段空值、勾选、禁用与异步恢复；缺失控件不能作为未选中/禁用通过', async () => {
    await page.setContent('<input id="name" value=""><input id="cb" type="checkbox"><button id="save" disabled>保存</button>');
    await verify('value', '#name', '');
    await verify('unchecked', '#cb');
    await page.locator('#cb').check();
    await verify('checked', '#cb');
    await verify('disabled', '#save');
    await page.evaluate(() => { setTimeout(() => document.querySelector('button')!.disabled = false, 120); });
    await verify('enabled', '#save', undefined, 1000);
    await expect(verify('unchecked', '#missing')).rejects.toThrow('断言未通过');
    await expect(verify('disabled', '#missing')).rejects.toThrow('断言未通过');
  });

  it('数量/隐藏支持零匹配，不吞掉多元素严格模式错误；拒绝无效数量', async () => {
    await page.setContent('<li>a</li><li>b</li>');
    await verify('count', 'li', '2');
    await verify('count', '#missing', '0');
    await verify('hidden', '#missing');
    await expect(verify('hidden', 'li')).rejects.toThrow('断言未通过');
    await expect(verify('count', 'li', '-1')).rejects.toThrow('非负整数');
    await expect(verify('count', '[', '0')).rejects.toThrow('断言未通过');
  });

  it('visible 失败区分 0 命中与多匹配，hidden 靠「从未命中」通过附空断言警告', async () => {
    await page.setContent('<button>新建互动事件</button><div class="modal-title">新建互动事件</div>');
    await expect(verify('visible', '.no-such-element', undefined, 300)).rejects.toThrow('0 命中');
    await expect(verify('visible', 'button, .modal-title', undefined, 300)).rejects.toThrow('命中 2 个元素');
    await page.setContent('<div id="gone" style="display:none">x</div>');
    expect(await verify('hidden', '#gone')).toBeUndefined(); // 匹配但隐藏：正常通过，无警告
    expect(await verify('hidden', '#missing')).toContain('0 命中'); // 从未命中：提示可能是恒真假通过
  });

  it('URL 精确匹配不会接受仅包含目标地址的页面', async () => {
    await waitForBrowserAssertion({ page: { url: () => 'https://example.test/done?next=evil' }, type: 'url', expected: '/done', timeoutMs: 0 });
    await expect(waitForBrowserAssertion({ page: { url: () => 'https://example.test/done?next=evil' }, type: 'url_exact', expected: 'https://example.test/done', timeoutMs: 0 })).rejects.toThrow('断言未通过');
  });

  it('生成期绑定验收目标并保留占位符；弱化、换预期、整页替代及伪造目标均被拒绝', async () => {
    await page.setContent('<div data-testid="name">客户_123</div>');
    const intent: TestIntent = { version: 1, scenario: 'positive', objective: '新增客户', preconditions: [], data: [], cleanup: [], criteria: [
      { id: 'C1', description: '客户名正确', target: '本次客户名', source: '用户要求', required: true, assertion: { type: 'text_exact', expected: '{{name}}' } },
    ] };
    const { assert, steps, passed } = host(intent);
    const args = { criterionId: 'C1', type: 'text_exact', expected: '{{name}}', selector: '[data-testid="name"]', instruction: '验证客户名', timeoutMs: 500 };
    await expect(assert.execute({ ...args, type: 'text' })).rejects.toThrow('不能替换');
    await expect(assert.execute({ ...args, expected: '客户_' })).rejects.toThrow('不能替换');
    await expect(assert.execute({ ...args, selector: undefined })).rejects.toThrow('指定范围');
    await expect(assert.execute({ ...args, criterionId: 'fake' })).rejects.toThrow('未知验收目标');
    expect(steps).toHaveLength(0);
    expect(passed).toHaveLength(0);
    await assert.execute(args);
    expect(steps[0].criterionId).toBe('C1');
    expect(steps[0].assertion?.expected).toBe('{{name}}');
    expect(passed).toHaveLength(1);
  });

  it('集合和不存在目标使用稳定描述符保存并能回放，拒绝不存在的父范围', async () => {
    await page.setContent('<ul data-testid="list"><li>a</li><li>b</li></ul>');
    const { assert, steps } = host();
    await assert.execute({ type: 'count', expected: '2', locator: { strategy: 'css', value: 'li', scope: { strategy: 'testid', value: 'list' } }, instruction: '两条记录', timeoutMs: 0 });
    await assert.execute({ type: 'count', expected: '2', locator: { strategy: 'role', value: 'listitem' }, instruction: '语义集合', timeoutMs: 0 });
    expect(steps.at(-1)?.locator?.role).toBe('listitem');
    await assert.execute({ type: 'count', expected: '0', locator: { strategy: 'testid', value: 'deleted' }, instruction: '没有新增', timeoutMs: 0 });
    await assert.execute({ type: 'hidden', locator: { strategy: 'testid', value: 'dialog' }, instruction: '弹窗关闭', timeoutMs: 0 });
    for (const step of steps) {
      const root = step.locator!.scope ? resolveQuery(page, step.locator!.scope!) : page;
      await waitForBrowserAssertion({ page, locator: resolveQuery(root, step.locator!), ...step.assertion!, timeoutMs: 0 });
    }
    await expect(assert.execute({ type: 'count', expected: '0', locator: { strategy: 'css', value: 'li', scope: { strategy: 'testid', value: 'missing-list' } }, instruction: '不能假通过', timeoutMs: 0 })).rejects.toThrow('作用域');
    await expect(assert.execute({ type: 'hidden', selector: '1', instruction: '不能用临时编号', timeoutMs: 0 })).rejects.toThrow('临时编号');
  });
});
