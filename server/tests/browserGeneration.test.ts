/// <reference lib="dom" />
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { browserLaunchOptions } from '../src/browser';
import { buildGenTools, type GenToolContext } from '../src/services/generationToolHost';
import { captureObservation } from '../src/services/browserObservation';
import { executeLocatorAction, waitForBrowserAssertion } from '../src/services/browserExecution';
import { clearGenerationEnvironment, setGenerationEnvironment } from '../src/services/generation/privacy';
import type { TestStep } from '../src/shared/testScript';

let browser: Browser;
let page: Page;
const JOB = 'browser-generation-regression';
beforeAll(async () => { browser = await chromium.launch(browserLaunchOptions({ headless: true })); });
afterAll(async () => { await browser?.close(); });
beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page.close(); clearGenerationEnvironment(JOB); });

function host(env: Record<string, string> = {}) {
  const steps: TestStep[] = [];
  setGenerationEnvironment(JOB, env);
  const stagehand = { act: vi.fn(), observe: vi.fn() };
  const ctx = { jobId: JOB, usageKey: JOB, pwPage: page, page, stagehand, pluginActions: [], modelVision: false,
    envMap: env, sub: (s?: string | null) => s?.replace(/\{\{(.*?)\}\}/g, (_, k) => env[k] ?? `{{${k}}}`),
    note: () => {}, stepCount: () => steps.length,
    emit: async (s: TestStep) => { steps.push(s); return { index: steps.length }; },
  } as unknown as GenToolContext;
  const tools = buildGenTools(ctx);
  return { ctx, steps, stagehand, get: (name: string) => tools.find(t => t.name === name)! };
}

describe('稳定编号和有预算的状态快照', () => {
  it('pushState 保留节点时不重号，移除节点会释放强引用', async () => {
    await page.route('https://audit.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<button id="keep">保留</button><input id="remove">' }));
    await page.goto('https://audit.test/a');
    const first = await captureObservation(page);
    const id = await page.locator('#keep').getAttribute('data-tt-idx');
    await page.evaluate(() => { history.pushState({}, '', '/b'); document.querySelector('#remove')!.remove(); document.body.insertAdjacentHTML('beforeend', '<button id="new">新增</button>'); });
    const next = await captureObservation(page);
    expect(await page.locator('#keep').getAttribute('data-tt-idx')).toBe(id);
    expect(await page.locator(`[data-tt-idx="${id}"]`).count()).toBe(1);
    expect(await page.locator('#new').getAttribute('data-tt-idx')).not.toBe(id);
    expect(next.version).not.toBe(first.version);
    expect(await page.evaluate(() => Object.keys((window as any).__ttIndexedEls__.byIndex).length)).toBe(2);
    expect((await captureObservation(page)).version).toBe(next.version);
  });

  it('状态、关联 label、校验、密码隐藏和环境值脱敏', async () => {
    await page.setContent('<label for="name">姓名</label><input id="name" value="secret-name"><input type="password" value="never-send"><input aria-label="启用" type="checkbox" checked><input required aria-label="必填">');
    const { get } = host({ user: 'secret-name' });
    const result: any = await get('snapshot').execute({ scope: 'page' });
    expect(result.text).toContain('姓名');
    expect(result.text).toContain('value={{user}}');
    expect(result.text).toContain('checked=true');
    expect(result.text).toContain('invalid=true');
    expect(result.text).toContain('filled=true');
    expect(JSON.stringify(result)).not.toContain('never-send');
  });

  it('优先活动弹窗，整页可检索分页，输出受预算约束', async () => {
    await page.setContent(Array.from({ length: 200 }, (_, i) => `<button>背景${i}</button>`).join('') + '<div role="dialog" aria-label="编辑"><input placeholder="姓名"><button>保存</button></div>');
    const auto = await captureObservation(page);
    expect(auto.scope).toBe('active-overlay');
    expect(auto.lines.join('')).not.toContain('背景');
    expect(auto.lines.join('')).toContain('保存');
    const first = await captureObservation(page, { scope: 'page', limit: 30 });
    expect(first.lines).toHaveLength(30);
    expect(first.nextOffset).toBe(30);
    const second = await captureObservation(page, { scope: 'page', limit: 30, offset: 30 });
    expect(second.lines).not.toEqual(first.lines);
    const found = await captureObservation(page, { scope: 'page', query: '背景199' });
    expect(found.lines).toHaveLength(1);
    expect(first.lines.join('\n').length).toBeLessThan(10000);
  });

  it('过期版本拒绝执行；观察自动附带最新版本', async () => {
    await page.setContent('<input id="name" aria-label="姓名"><button id="save">保存</button>');
    const { ctx, get, steps } = host();
    await get('snapshot').execute({});
    const old = ctx.snapshotVersion;
    const id = await page.locator('#name').getAttribute('data-tt-idx');
    const result: any = await get('fill').execute({ selector: id, snapshotVersion: old, value: '张三', instruction: '填写姓名' });
    expect(result.progressed).toBe(true);
    expect(result.observation).toContain('value=张三');
    await expect(get('click').execute({ selector: '2', snapshotVersion: old, instruction: '保存' })).rejects.toThrow('过期');
    expect(steps).toHaveLength(1);
  });
});

describe('确定性动作和可回放的 observe 兜底', () => {
  it('observe 候选只选一个，点击使节点消失前保存语义定位', async () => {
    await page.setContent('<button data-testid="close" onclick="this.remove()">关闭</button><input id="other">');
    const { stagehand, get, steps } = host();
    stagehand.observe.mockResolvedValue({ data: [{ selector: '[data-testid="close"]', method: 'click', arguments: [] }, { selector: '#other', method: 'fill', arguments: ['不应执行'] }] });
    await get('act').execute({ instruction: '关闭弹窗' });
    expect(stagehand.act).not.toHaveBeenCalled();
    expect(steps).toHaveLength(1);
    expect(steps[0].locator).toEqual({ strategy: 'testid', value: 'close' });
    expect(await page.locator('#other').inputValue()).toBe('');
    expect(await page.locator('[data-testid="close"]').count()).toBe(0);
  });

  it('未知 observe method 不转换成 click', async () => {
    await page.setContent('<button id="x" onclick="this.textContent=\'clicked\'">原始</button>');
    const { stagehand, get, steps } = host();
    stagehand.observe.mockResolvedValue({ data: [{ selector: '#x', method: 'unsupported', arguments: [] }] });
    expect(await get('act').execute({ instruction: '操作' })).toMatchObject({ status: 'failed' });
    expect(steps).toHaveLength(0);
    expect(await page.locator('#x').innerText()).toBe('原始');
  });

  it('取消勾选保存 false，回放不会重新勾选；旧脚本默认 true', async () => {
    await page.setContent('<input id="x" type="checkbox" aria-label="启用" checked>');
    const { get, steps } = host();
    await get('check').execute({ selector: '#x', checked: false, instruction: '取消勾选' });
    expect(steps[0].checked).toBe(false);
    expect(await page.locator('#x').isChecked()).toBe(false);
    await page.locator('#x').check();
    await executeLocatorAction(page.locator('#x'), steps[0]);
    expect(await page.locator('#x').isChecked()).toBe(false);
    await executeLocatorAction(page.locator('#x'), { action: 'check' });
    expect(await page.locator('#x').isChecked()).toBe(true);
  });

  it('press 聚焦按键不额外点击，重复无效 click 被记录但不算进展', async () => {
    await page.setContent('<input id="x" aria-label="姓名" onclick="window.clicked=true"><button id="noop">无效操作</button>');
    const { get, steps } = host();
    await get('press').execute({ selector: '#x', key: 'A', instruction: '输入 A' });
    expect(await page.evaluate(() => (window as any).clicked)).toBeUndefined();
    expect(await page.locator('#x').inputValue()).toBe('A');
    const result: any = await get('click').execute({ selector: '#noop', instruction: '点击' });
    expect(result.progressed).toBe(false);
    expect(result.recordedStep).toBe(2);
    expect(steps).toHaveLength(2);
  });
});

describe('受控批处理与自动等待', () => {
  it('独立字段串行完成并逐步保存', async () => {
    await page.setContent('<input id="a" aria-label="甲"><input id="b" aria-label="乙">');
    const { get, steps } = host();
    const result: any = await get('batch_actions').execute({ actions: [
      { action: 'fill', selector: '#a', value: 'A', instruction: '填写甲' },
      { action: 'fill', selector: '#b', value: 'B', instruction: '填写乙' },
    ] });
    expect(result.status).toBe('success');
    expect(steps.map(s => s.value)).toEqual(['A', 'B']);
    expect(result.observation).toContain('value=B');
  });

  it('字段联动立即中断，保留前半批次', async () => {
    await page.setContent('<input id="a" aria-label="甲" value="旧值"><input id="b" aria-label="乙" oninput="document.getElementById(\'a\').value=\'\'"><input id="c" aria-label="丙">');
    const { get, steps } = host();
    const result: any = await get('batch_actions').execute({ actions: [
      { action: 'fill', selector: '#b', value: 'B', instruction: '填写乙' },
      { action: 'fill', selector: '#c', value: 'C', instruction: '填写丙' },
    ] });
    expect(steps).toHaveLength(1);
    expect(await page.locator('#c').inputValue()).toBe('');
    expect(result.text).toContain('剩余 1 项未执行');
  });

  it('后续项目定位失败时保留已完成步骤', async () => {
    await page.setContent('<input id="a" aria-label="甲"><button id="bad">非输入框</button>');
    const { get, steps } = host();
    const result: any = await get('batch_actions').execute({ actions: [
      { action: 'fill', selector: '#a', value: 'A', instruction: '填写甲' },
      { action: 'fill', selector: '#bad', value: 'B', instruction: '填写乙' },
    ] });
    expect(result.status).toBe('failed');
    expect(steps).toHaveLength(1);
    expect(result.text).toContain('已完成 1 项');
  });

  it('批次完成一项后暂停，不执行剩余项', async () => {
    await page.setContent('<input id="a" aria-label="甲"><input id="b" aria-label="乙">');
    const { ctx, get, steps } = host();
    const abort = new AbortController();
    ctx.signal = abort.signal;
    const emit = ctx.emit;
    ctx.emit = async step => { const result = await emit(step); abort.abort(); return result; };
    const result: any = await get('batch_actions').execute({ actions: [
      { action: 'fill', selector: '#a', value: 'A', instruction: '填写甲' },
      { action: 'fill', selector: '#b', value: 'B', instruction: '填写乙' },
    ] });
    expect(result.status).toBe('uncertain');
    expect(steps).toHaveLength(1);
    expect(await page.locator('#b').inputValue()).toBe('');
  });

  it('异步挂载的新元素等待成功后才提取断言定位', async () => {
    await page.setContent('<main></main>');
    await page.evaluate(() => setTimeout(() => { document.querySelector('main')!.innerHTML = '<button data-testid="ready">就绪</button>'; }, 150));
    const { get, steps } = host();
    await get('assert').execute({ type: 'visible', selector: '[data-testid="ready"]', instruction: '等待按钮', timeoutMs: 1000 });
    expect(steps[0].locator).toEqual({ strategy: 'testid', value: 'ready' });
  });

  it('等待异步断言，隐藏文本不能让断言通过', async () => {
    await page.setContent('<div style="display:none">成功</div><div id="result"></div>');
    await expect(waitForBrowserAssertion({ page, type: 'text', expected: '成功', timeoutMs: 50 })).rejects.toThrow('断言未通过');
    await page.evaluate(() => setTimeout(() => { document.querySelector('#result')!.textContent = '成功'; }, 150));
    const { get, steps } = host();
    await get('assert').execute({ type: 'text', expected: '成功', instruction: '验证成功', timeoutMs: 1000 });
    expect(steps[0].kind).toBe('assert');
  });
});
