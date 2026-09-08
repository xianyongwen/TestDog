/// <reference lib="dom" />
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createRequire } from 'node:module';
import path from 'node:path';
import { browserLaunchOptions } from '../src/browser';
import { buildGenTools, type GenToolContext } from '../src/services/generationToolHost';
import { captureObservation } from '../src/services/browserObservation';
import { buildPluginInitScript } from '../src/services/pluginRuntime';
import { BUILTIN_PLUGIN_DEFS } from '../src/services/componentPlugins/builtin';
import type { TestStep } from '../src/shared/testScript';

const require = createRequire(import.meta.url);
const plugins = BUILTIN_PLUGIN_DEFS.filter(p => ['ant-select', 'el-select'].includes(p.name));
let browser: Browser;
let page: Page;
beforeAll(async () => { browser = await chromium.launch(browserLaunchOptions({ headless: true })); });
afterAll(async () => { await browser?.close(); });
beforeEach(async () => {
  page = await browser.newPage();
  await page.evaluate(buildPluginInitScript(plugins.map(p => ({ id: p.name, code: p.entryFile }))));
});
afterEach(async () => { await page?.close(); });

function host() {
  const steps: TestStep[] = [];
  const ctx = { jobId: 'select-index-regression', usageKey: 'select-index-regression', pwPage: page, page,
    pluginActions: [{ name: 'select', doc: '选择下拉', preferFill: false }], envMap: {}, sub: (s: string) => s,
    note: () => {}, stepCount: () => steps.length,
    emit: async (s: TestStep) => { steps.push(s); return { index: steps.length }; },
  } as unknown as GenToolContext;
  const tool = buildGenTools(ctx).find(t => t.name === 'component_action')!;
  return { steps, select: (args: Record<string, unknown>) => tool.execute({ action: 'select', selector: '#customerId', instruction: '选择所属客户', ...args }) };
}

// 使用工作区已安装的真实 React/antd，无 CDN、网络或业务数据写入。
async function antForm() {
  await page.setContent('<div id="root"></div>');
  for (const [pkg, file] of [['react', 'umd/react.production.min.js'], ['react-dom', 'umd/react-dom.production.min.js'], ['dayjs', 'dayjs.min.js'], ['antd', 'dist/antd.min.js']]) {
    await page.addScriptTag({ path: path.join(path.dirname(require.resolve(`${pkg}/package.json`)), file) });
  }
  await page.evaluate(() => {
    const { React, ReactDOM, antd } = window as any;
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(antd.Modal, { open: true, title: '新建商机', footer: null },
      React.createElement(antd.Form, null, React.createElement(antd.Form.Item, { label: '所属客户', name: 'customerId' },
        React.createElement(antd.Select, { id: 'customerId', showSearch: true, virtual: true, style: { width: 260 }, options: [
          { value: 'disabled', label: '禁用客户', disabled: true },
          { value: 'cloud', label: '云启信息科技有限公司' },
          { value: 'second', label: '第二客户' },
        ] })))));
  });
  await page.locator('#customerId').waitFor({ state: 'visible' });
}

describe('语义 select 按序选择与虚拟下拉快照', () => {
  it.each([0, 1])('真实 antd Modal + 虚拟 Select：index=%i 一次完成并保存实际文本', async index => {
    await antForm();
    const { select, steps } = host();
    const result: any = await select({ args: { index } });
    const expected = index === 0 ? '云启信息科技有限公司' : '第二客户';
    expect(result.status, result.text).toBe('success');
    expect(steps).toHaveLength(1);
    expect(steps[0].pluginAction?.args).toEqual({ value: expected });
    expect(steps[0].value).toBe(expected);
    expect(await page.locator('.ant-select-selection-item').innerText()).toBe(expected);
    // 保存的参数独立回放，无需索引或预先展开。
    const replay = await page.evaluate(async args => (window as any).__ttPluginRegistry__.invokeAction('ant-select', 'select', document.getElementById('customerId'), args), steps[0].pluginAction!.args);
    expect(replay.status, replay.message).toBe('success');
  });

  it('真实虚拟选项可进入快照、可用编号点击；隐藏的无障碍副本不会获得编号', async () => {
    await antForm();
    await page.locator('#customerId').click();
    await page.locator('.ant-select-item-option[title="第二客户"]').waitFor({ state: 'visible' });
    const state = await captureObservation(page);
    const option = page.locator('.ant-select-item-option[title="第二客户"]');
    const id = await option.getAttribute('data-tt-idx');
    expect(id).toBeTruthy();
    expect(state.lines.some(l => l.includes(`[${id}]`) && l.includes('第二客户'))).toBe(true);
    expect(state.lines.some(l => l.includes('禁用客户') && l.includes('[disabled]'))).toBe(true);
    expect(await page.locator('[role="listbox"] [role="option"][data-tt-idx]').count()).toBe(0);
    await page.locator(`[data-tt-idx="${id}"]`).click();
    expect(await page.locator('.ant-select-selection-item').innerText()).toBe('第二客户');
  });

  it('索引越界保留可选清单、不落库；修正索引后复用已打开的弹层', async () => {
    await antForm();
    const { select, steps } = host();
    const bad: any = await select({ args: { index: 20 } });
    expect(bad.status).toBe('failed');
    expect(bad.text).toContain('index=20');
    expect(bad.text).toContain('当前可选');
    expect(steps).toHaveLength(0);
    const good: any = await select({ args: { index: 1 } });
    expect(good.status, good.text).toBe('success');
    expect(steps).toHaveLength(1);
  });

  it('原生 select 按可用项排序，排除占位、隐藏、禁用 option 和 optgroup，保存真实 value', async () => {
    await page.setContent('<select id="customerId" aria-label="所属客户"><option value="">请选择</option><option disabled value="bad">禁用</option><optgroup disabled><option value="group">组禁用</option></optgroup><option hidden value="hidden">隐藏</option><option value="a">客户甲</option><option value="b">客户乙</option></select>');
    const { select, steps } = host();
    const result: any = await select({ args: { index: 1 } });
    expect(result.status, result.text).toBe('success');
    expect(await page.locator('#customerId').inputValue()).toBe('b');
    expect(steps[0].value).toBe('b');
    expect(steps[0].pluginAction?.args).toEqual({ value: 'b' });
    const bad: any = await select({ args: { index: 9 } });
    expect(bad.status).toBe('failed');
    expect(steps).toHaveLength(1);
    const byValue: any = await select({ value: 'a' });
    expect(byValue.status, byValue.text).toBe('success');
    expect(await page.locator('#customerId').inputValue()).toBe('a');
  });

  it('Element DOM：第二个可用项跳过隐藏/禁用项，后验失败不保存', async () => {
    await page.setContent(`<div class="el-select"><input id="customerId" aria-label="所属客户" onclick="document.querySelector('.el-select-dropdown').style.display='block'"></div>
      <div class="el-select-dropdown" style="display:none"><div class="el-select-dropdown__item is-disabled">禁用</div><div class="el-select-dropdown__item" style="display:none">隐藏</div>
      <div class="el-select-dropdown__item" onclick="document.querySelector('input').value=this.textContent;this.parentElement.style.display='none'">客户甲</div>
      <div class="el-select-dropdown__item" onclick="document.querySelector('input').value=this.textContent;this.parentElement.style.display='none'">客户乙</div></div>`);
    const { select, steps } = host();
    const result: any = await select({ args: { index: 1 } });
    expect(result.status, result.text).toBe('success');
    expect(steps[0].value).toBe('客户乙');
    await page.locator('.el-select-dropdown__item').nth(2).evaluate(el => el.removeAttribute('onclick'));
    const failed: any = await select({ args: { index: 0 } });
    expect(failed.status).toBe('failed');
    expect(failed.text).toContain('后验未通过');
    expect(steps).toHaveLength(1);
  });
});
