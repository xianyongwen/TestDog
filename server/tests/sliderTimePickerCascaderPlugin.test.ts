import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { browserLaunchOptions } from '../src/browser';
import { buildPluginInitScript } from '../src/services/pluginRuntime';
import { BUILTIN_PLUGIN_DEFS, BUILTIN_PRESET_MEMBERS } from '../src/services/componentPlugins/builtin';

// 按预设成员顺序注入（= 页内注册顺序 = resolveChain 优先级）：select 系先试、专职插件兜底
const PLUGIN_DEFS = BUILTIN_PRESET_MEMBERS.map((n) => BUILTIN_PLUGIN_DEFS.find((d) => d.name === n)!);
const SCRIPTS = PLUGIN_DEFS.map((d) => ({ id: d.name, code: d.entryFile }));

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch(browserLaunchOptions({ headless: true }));
});

afterAll(async () => {
  await browser?.close();
});

async function fixturePage(name: string): Promise<Page> {
  const page = await browser.newPage();
  await page.addInitScript(buildPluginInitScript(SCRIPTS));
  await page.goto(`file://${import.meta.dirname}/fixtures/${name}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  return page;
}

interface InvokeResult {
  status: string;
  message: string;
  chainIds: string[];
}

/** 直调语义动作（invokeAction 内含插件后验 verify）。 */
async function invoke(page: Page, pluginId: string, selector: string, action: string, args: Record<string, string>): Promise<InvokeResult> {
  return page.evaluate(async ([pid, css, act, a]: any[]) => {
    const reg = (globalThis as any).__ttPluginRegistry__;
    const el = document.querySelector(css);
    if (!el) return { status: 'failed', message: '找不到 ' + css, chainIds: [] };
    const chainIds = reg.resolveChain(el, act).map((c: any) => c.id);
    const r = await reg.invokeAction(pid, act, el, a);
    return { status: r.status, message: r.message, chainIds };
  }, [pluginId, selector, action, args] as any) as Promise<InvokeResult>;
}

/** 平台同款链式执行：resolveChain 按序 invokeAction，failed 落下一个。 */
async function runChain(page: Page, selector: string, action: string, value: string): Promise<InvokeResult & { winner: string | null }> {
  return page.evaluate(async ([css, act, val]: any[]) => {
    const reg = (globalThis as any).__ttPluginRegistry__;
    const el = document.querySelector(css);
    const chain = reg.resolveChain(el, act);
    const attempted: string[] = [];
    let last = '';
    for (const hit of chain) {
      attempted.push(hit.id);
      const r = await reg.invokeAction(hit.id, act, el, { value: val });
      if (r.status !== 'failed') return { winner: hit.id, status: r.status, message: r.message, chainIds: chain.map((c: any) => c.id) };
      last = r.message;
    }
    return { winner: null, status: 'failed', message: last, chainIds: chain.map((c: any) => c.id) };
  }, [selector, action, value] as any) as Promise<InvokeResult & { winner: string | null }>;
}

/** 直调插件源码求值出的 verify（不经 invokeAction，单独验证后验判定本身）。
 *  verify 可能为 async（如 time-picker 的轮询等提交落定），必须 await 后再取布尔。 */
async function callVerify(page: Page, name: string, action: string, selector: string, args: Record<string, string>): Promise<boolean> {
  const code = BUILTIN_PLUGIN_DEFS.find((d) => d.name === name)!.entryFile;
  return page.evaluate(async ([c, act, css, a]: any[]) => {
    const def = eval(c);
    const el = document.querySelector(css);
    return !!(await def.actions[act].verify(el, a));
  }, [code, action, selector, args] as any) as Promise<boolean>;
}

/**
 * 注册「假成功」变体：fn 原样返回成功但什么都不做，verify 用真实现——
 * 用于证明平台外壳 invokeAction 会真实执行后验并把假成功降级为 failed。
 */
async function registerFake(page: Page, name: string, action: string): Promise<string> {
  const code = BUILTIN_PLUGIN_DEFS.find((d) => d.name === name)!.entryFile;
  const fakeId = `fake-${name}`;
  await page.evaluate(([c, act, fid]: any[]) => {
    const def = eval(c);
    def.actions[act].fn = async () => '假成功（未真正操作）';
    (globalThis as any).__ttPluginRegistry__.register(Object.assign(def, { id: fid }));
  }, [code, action, fakeId] as any);
  return fakeId;
}

/** 后验三件套：错参 verify 必须 false；假成功必须被降级 failed；坏参防御必须 false。
 *  resetArgs：假成功用例前先用真插件把状态改到别处——否则「fn 未操作 + 终态恰等于 args」
 *  会让假成功穿透测试失真（verify 判是不是因为放水，而是因为状态真的对）。 */
async function expectVerifyGuards(
  page: Page,
  name: string,
  action: string,
  selector: string,
  realArgs: Record<string, string>,
  wrongArgs: Record<string, string>,
  resetArgs: Record<string, string>,
) {
  // 1) 错参：真实终态已是 realArgs，用 wrongArgs 调 verify 必须判否
  expect(await callVerify(page, name, action, selector, wrongArgs)).toBe(false);
  // 2) 对参：真实终态下 verify 必须判是（反向用例的对照组）
  expect(await callVerify(page, name, action, selector, realArgs)).toBe(true);
  // 3) 坏参防御：解析不了的 args 必须判否
  expect(await callVerify(page, name, action, selector, { value: '___不存在的值___' })).toBe(false);
  // 4) 假成功穿透：先把状态重置到别处，fn 只报成功不操作的变体必须被 verify 降级 failed
  const reset = await invoke(page, name, selector, action, resetArgs);
  expect(reset.status).toBe('success');
  const fakeId = await registerFake(page, name, action);
  const r = await invoke(page, fakeId, selector, action, realArgs);
  expect(r.status).toBe('failed');
  expect(r.message).toContain('后验未通过');
}

describe('slider / time-picker / cascader 系内置插件', () => {
  it('ant-slider：单值拖拽+键盘微调命中 87', async () => {
    const page = await fixturePage('antd-extra.html');
    const r = await invoke(page, 'ant-slider', '#volSlider', 'set_value', { value: '87' });
    expect(r.status).toBe('success');
    const now = await page.evaluate(() => document.querySelector('#volSlider .ant-slider-handle')?.getAttribute('aria-valuenow'));
    expect(now).toBe('87');
    await page.close();
  }, 90000);

  it('ant-slider：范围 "35,85" 设两端', async () => {
    const page = await fixturePage('antd-extra.html');
    const r = await invoke(page, 'ant-slider', '#rangeSlider', 'set_value', { value: '35,85' });
    expect(r.status).toBe('success');
    const vals = await page.evaluate(() => Array.from(document.querySelectorAll('#rangeSlider .ant-slider-handle:not([aria-hidden="true"])')).map((h) => h.getAttribute('aria-valuenow')));
    expect(vals).toEqual(['35', '85']);
    await page.close();
  }, 90000);

  it('el-slider：单值 set_value 命中 64', async () => {
    const page = await fixturePage('element-plus-extra.html');
    const r = await invoke(page, 'el-slider', '#volSlider', 'set_value', { value: '64' });
    expect(r.status).toBe('success');
    const now = await page.evaluate(() => document.querySelector('#volSlider')?.getAttribute('aria-valuenow'));
    expect(now).toBe('64');
    await page.close();
  }, 90000);

  it('ant-time-picker：面板点格 + input 聚焦 Enter 提交', async () => {
    const page = await fixturePage('antd-extra.html');
    const r = await invoke(page, 'ant-time-picker', '#timePicker', 'set_time', { value: '08:05:10' });
    expect(r.status).toBe('success');
    const val = await page.evaluate(() => (document.querySelector('#timePicker') as HTMLInputElement)?.value);
    expect(val).toBe('08:05:10');
    await page.close();
  }, 90000);

  it('el-time-picker：面板点滚轮 + 确定按钮提交', async () => {
    const page = await fixturePage('element-plus-extra.html');
    const r = await invoke(page, 'el-time-picker', '#workTimePicker', 'set_time', { value: '08:40:20' });
    expect(r.status).toBe('success');
    const val = await page.evaluate(() => (document.querySelector('#workTimePicker') as HTMLInputElement)?.value);
    expect(val).toBe('08:40:20');
    await page.close();
  }, 90000);

  it('ant-cascader：select 链上 ant-select 快速失败后兜底，全路径选中', async () => {
    const page = await fixturePage('antd-extra.html');
    const r = await runChain(page, '#regionCascader', 'select', '浙江 / 杭州 / 西湖区');
    expect(r.chainIds).toEqual(['ant-select', 'ant-cascader']);
    expect(r.winner).toBe('ant-cascader');
    expect(r.status).toBe('success');
    const display = await page.evaluate(() => document.querySelector('#regionCascader')?.closest('.ant-select')?.querySelector('.ant-select-selection-item')?.textContent ?? '');
    expect(display).toBe('浙江 / 杭州 / 西湖区');
    await page.close();
  }, 120000);

  it('ant-cascader：多选勾叶子并自动收起弹层', async () => {
    const page = await fixturePage('antd-extra.html');
    const r = await invoke(page, 'ant-cascader', '#tagCascader', 'select', { value: '前端 / React' });
    expect(r.status).toBe('success');
    const tag = await page.evaluate(() => Array.from(document.querySelectorAll('.block:nth-of-type(5) .ant-select-selection-item')).some((n) => n.textContent === 'React'));
    expect(tag).toBe(true);
    const open = await page.evaluate(() => Array.from(document.querySelectorAll('.ant-cascader-dropdown')).some((d) => d.getClientRects().length > 0));
    expect(open).toBe(false);
    await page.close();
  }, 120000);

  it('el-cascader：全路径选中后 input 回显完整路径', async () => {
    const page = await fixturePage('element-plus-extra.html');
    const r = await invoke(page, 'el-cascader', 'div.block:nth-of-type(4) .el-cascader', 'select', { value: '浙江 / 杭州 / 西湖区' });
    expect(r.status).toBe('success');
    const val = await page.evaluate(() => (document.querySelector('div.block:nth-of-type(4) .el-cascader input') as HTMLInputElement)?.value);
    expect(val).toBe('浙江 / 杭州 / 西湖区');
    await page.close();
  }, 120000);

  it('el-cascader：多选勾叶子（点 checkbox）并自动收起弹层', async () => {
    const page = await fixturePage('element-plus-extra.html');
    const r = await invoke(page, 'el-cascader', 'div.block:nth-of-type(5) .el-cascader', 'select', { value: '前端 / React' });
    expect(r.status).toBe('success');
    const tag = await page.evaluate(() => Array.from(document.querySelectorAll('div.block:nth-of-type(5) .el-cascader__tags .el-tag')).some((t) => (t.textContent || '').includes('React')));
    expect(tag).toBe(true);
    const open = await page.evaluate(() => Array.from(document.querySelectorAll('.el-cascader__dropdown')).some((d) => d.getClientRects().length > 0 && d.getAttribute('aria-hidden') !== 'true'));
    expect(open).toBe(false);
    await page.close();
  }, 120000);

  it('判别排除：时间选择器不再被日期选择器插件标注误导', async () => {
    const antdPage = await fixturePage('antd-extra.html');
    const a1 = await antdPage.evaluate(() => (globalThis as any).__ttPluginRegistry__.annotateFor(document.querySelector('#timePicker')?.closest('.ant-picker')));
    expect(a1).not.toContain('[ant-date-picker]');
    expect(a1).toContain('[ant-time-picker]');
    await antdPage.close();

    const elPage = await fixturePage('element-plus-extra.html');
    const a2 = await elPage.evaluate(() => (globalThis as any).__ttPluginRegistry__.annotateFor(document.querySelector('#workTimePicker')?.closest('.el-date-editor')));
    expect(a2).not.toContain('[el-date-picker]');
    expect(a2).toContain('[el-time-picker]');
    await elPage.close();
  }, 120000);
});

describe('页内后验 verify 真实生效（假成功必须被拦截降级）', () => {
  it('ant-slider：错参判否 / 对参判是 / 坏参防御 / 假成功降级 failed', async () => {
    const page = await fixturePage('antd-extra.html');
    const r = await invoke(page, 'ant-slider', '#volSlider', 'set_value', { value: '87' });
    expect(r.status).toBe('success');
    await expectVerifyGuards(page, 'ant-slider', 'set_value', '#volSlider', { value: '87' }, { value: '30' }, { value: '30' });
    await page.close();
  }, 90000);

  it('el-slider：同款后验三件套 + 假成功降级', async () => {
    const page = await fixturePage('element-plus-extra.html');
    const r = await invoke(page, 'el-slider', '#volSlider', 'set_value', { value: '64' });
    expect(r.status).toBe('success');
    await expectVerifyGuards(page, 'el-slider', 'set_value', '#volSlider', { value: '64' }, { value: '30' }, { value: '30' });
    await page.close();
  }, 90000);

  it('ant-time-picker：输入框回显比对生效，假成功降级 failed', async () => {
    const page = await fixturePage('antd-extra.html');
    const r = await invoke(page, 'ant-time-picker', '#timePicker', 'set_time', { value: '08:05:10' });
    expect(r.status).toBe('success');
    await expectVerifyGuards(page, 'ant-time-picker', 'set_time', '#timePicker', { value: '08:05:10' }, { value: '09:30:00' }, { value: '07:00:00' });
    await page.close();
  }, 120000);

  it('el-time-picker：输入框回显比对生效，假成功降级 failed', async () => {
    const page = await fixturePage('element-plus-extra.html');
    const r = await invoke(page, 'el-time-picker', '#workTimePicker', 'set_time', { value: '08:40:20' });
    expect(r.status).toBe('success');
    await expectVerifyGuards(page, 'el-time-picker', 'set_time', '#workTimePicker', { value: '08:40:20' }, { value: '09:00:00' }, { value: '07:00:00' });
    await page.close();
  }, 120000);

  it('ant-cascader：回显比对生效，假成功降级 failed', async () => {
    const page = await fixturePage('antd-extra.html');
    const r = await invoke(page, 'ant-cascader', '#regionCascader', 'select', { value: '浙江 / 杭州 / 西湖区' });
    expect(r.status).toBe('success');
    await expectVerifyGuards(page, 'ant-cascader', 'select', '#regionCascader', { value: '浙江 / 杭州 / 西湖区' }, { value: '江苏 / 南京 / 玄武区' }, { value: '江苏 / 南京 / 玄武区' });
    await page.close();
  }, 120000);

  it('el-cascader：回显比对生效，假成功降级 failed', async () => {
    const page = await fixturePage('element-plus-extra.html');
    const r = await invoke(page, 'el-cascader', 'div.block:nth-of-type(4) .el-cascader', 'select', { value: '浙江 / 杭州 / 西湖区' });
    expect(r.status).toBe('success');
    await expectVerifyGuards(page, 'el-cascader', 'select', 'div.block:nth-of-type(4) .el-cascader', { value: '浙江 / 杭州 / 西湖区' }, { value: '江苏 / 苏州 / 姑苏区' }, { value: '江苏 / 苏州 / 姑苏区' });
    await page.close();
  }, 120000);
});
