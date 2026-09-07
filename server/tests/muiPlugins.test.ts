import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { browserLaunchOptions } from '../src/browser';
import { buildPluginInitScript } from '../src/services/pluginRuntime';
import { BUILTIN_PLUGIN_DEFS, BUILTIN_PRESET_MEMBERS } from '../src/services/componentPlugins/builtin';

// 按预设成员顺序注入（= 页内注册顺序 = resolveChain 优先级）
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
    let last = '';
    for (const hit of chain) {
      const r = await reg.invokeAction(hit.id, act, el, { value: val });
      if (r.status !== 'failed') return { winner: hit.id, status: r.status, message: r.message, chainIds: chain.map((c: any) => c.id) };
      last = r.message;
    }
    return { winner: null, status: 'failed', message: last, chainIds: chain.map((c: any) => c.id) };
  }, [selector, action, value] as any) as Promise<InvokeResult & { winner: string | null }>;
}


/** 直调插件源码求值出的 verify（不经 invokeAction，单独验证后验判定本身）。 */
async function callVerify(page: Page, name: string, action: string, selector: string, args: Record<string, string>): Promise<boolean> {
  const code = BUILTIN_PLUGIN_DEFS.find((d) => d.name === name)!.entryFile;
  return page.evaluate(async ([c, act, css, a]: any[]) => {
    const def = eval(c);
    const el = document.querySelector(css);
    return !!(await def.actions[act].verify(el, a));
  }, [code, action, selector, args] as any) as Promise<boolean>;
}

/** 注册「假成功」变体：fn 原样返回成功但什么都不做，verify 用真实现——
 *  用于证明平台外壳 invokeAction 会真实执行后验并把假成功降级为 failed。 */
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

/** 后验三件套：错参 verify 必须 false；对参必须 true；坏参防御必须 false；
 *  假成功穿透：先把状态重置到别处，fn 只报成功不操作的变体必须被 verify 降级 failed。 */
async function expectVerifyGuards(
  page: Page,
  name: string,
  action: string,
  selector: string,
  realArgs: Record<string, string>,
  wrongArgs: Record<string, string>,
  resetArgs: Record<string, string>,
) {
  expect(await callVerify(page, name, action, selector, wrongArgs)).toBe(false);
  expect(await callVerify(page, name, action, selector, realArgs)).toBe(true);
  expect(await callVerify(page, name, action, selector, { value: '___不存在的值___' })).toBe(false);
  const reset = await invoke(page, name, selector, action, resetArgs);
  expect(reset.status, reset.message).toBe('success');
  const fakeId = await registerFake(page, name, action);
  const r = await invoke(page, fakeId, selector, action, realArgs);
  expect(r.status, r.message).toBe('failed');
  expect(r.message).toContain('后验未通过');
}

describe('mui-select（Select / Autocomplete）', () => {
  it('Select：点开 listbox 选中「上海」，回显与 fixture 值联动', async () => {
    const page = await fixturePage('mui.html');
    const r = await invoke(page, 'mui-select', '#citySelect', 'select', { value: '上海' });
    expect(r.chainIds).toEqual(['mui-select']);
    expect(r.status).toBe('success');
    expect(r.message).toContain('上海');
    const val = await page.locator('.block', { has: page.locator('#citySelect') }).locator('.val').textContent();
    expect(val).toContain('shanghai');
    await page.close();
  }, 60000);

  it('Autocomplete：输入过滤后选中「广州」', async () => {
    const page = await fixturePage('mui.html');
    const r = await invoke(page, 'mui-select', '#cityAutocomplete', 'select', { value: '广州' });
    expect(r.status).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#cityAutocomplete') }).locator('.val').textContent();
    expect(val).toContain('广州');
    await page.close();
  }, 60000);

  it('选项不存在：failed 且列出当前可选', async () => {
    const page = await fixturePage('mui.html');
    const r = await invoke(page, 'mui-select', '#citySelect', 'select', { value: '杭州' });
    expect(r.status).toBe('failed');
    expect(r.message).toContain('当前可选');
    expect(r.message).toContain('北京');
    await page.close();
  }, 60000);

  it('NativeSelect（原生 select）不被 detect 命中，由分发器原生层兜底', async () => {
    const page = await fixturePage('mui.html');
    const chainIds = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      return reg.resolveChain(document.querySelector('#nativeCitySelect'), 'select').map((c: any) => c.id);
    });
    expect(chainIds).toEqual([]);
    await page.close();
  }, 60000);

  it('链式执行（平台同款）成功且命中 mui-select', async () => {
    const page = await fixturePage('mui.html');
    const r = await runChain(page, '#citySelect', 'select', '广州');
    expect(r.winner).toBe('mui-select');
    expect(r.status).toBe('success');
    await page.close();
  }, 60000);
});

describe('mui-slider（滑块）', () => {
  it('set_value：单值拖拽设 70', async () => {
    const page = await fixturePage('mui-extra.html');
    const r = await invoke(page, 'mui-slider', '#volSlider', 'set_value', { value: '70' });
    expect(r.chainIds).toEqual(['mui-slider']);
    expect(r.status).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#volSlider') }).locator('.val').textContent();
    expect(val).toContain('70');
    await page.close();
  }, 60000);

  it('set_value：范围滑块 "10,85" 按手柄拖拽设两端', async () => {
    const page = await fixturePage('mui-extra.html');
    const r = await invoke(page, 'mui-slider', '#rangeSlider', 'set_value', { value: '10,85' });
    expect(r.status).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#rangeSlider') }).locator('.val').textContent();
    expect(val).toContain('10 - 85');
    await page.close();
  }, 60000);

  it('set_value：单值打在范围滑块按就近手柄移动', async () => {
    const page = await fixturePage('mui-extra.html');
    const r = await invoke(page, 'mui-slider', '#rangeSlider', 'set_value', { value: '30' });
    expect(r.status).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#rangeSlider') }).locator('.val').textContent();
    expect(val).toContain('30 - 70');
    await page.close();
  }, 60000);
});

describe('页内后验 verify 真实生效（假成功必须被拦截降级）', () => {
  it('mui-select（Select）：错参判否 / 对参判是 / 坏参防御 / 假成功降级 failed', async () => {
    const page = await fixturePage('mui.html');
    const r = await invoke(page, 'mui-select', '#citySelect', 'select', { value: '上海' });
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'mui-select', 'select', '#citySelect', { value: '上海' }, { value: '北京' }, { value: '深圳' });
    await page.close();
  }, 120000);

  it('mui-select（Autocomplete）：后验三件套 + 假成功降级', async () => {
    const page = await fixturePage('mui.html');
    const r = await invoke(page, 'mui-select', '#cityAutocomplete', 'select', { value: '广州' });
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'mui-select', 'select', '#cityAutocomplete', { value: '广州' }, { value: '北京' }, { value: '上海' });
    await page.close();
  }, 120000);

  it('mui-slider set_value：后验三件套 + 假成功降级（mui-extra）', async () => {
    const page = await fixturePage('mui-extra.html');
    const r = await invoke(page, 'mui-slider', '#volSlider', 'set_value', { value: '70' });
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'mui-slider', 'set_value', '#volSlider', { value: '70' }, { value: '20' }, { value: '40' });
    await page.close();
  }, 120000);
});

describe('set_value 误派保护（resolveChain 精确性）', () => {
  it('mui 滑块链精确为 [mui-slider]', async () => {
    const page = await fixturePage('mui-extra.html');
    const chains = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      return {
        single: reg.resolveChain(document.querySelector('#volSlider'), 'set_value').map((c: any) => c.id),
        range: reg.resolveChain(document.querySelector('#rangeSlider'), 'set_value').map((c: any) => c.id),
      };
    });
    expect(chains.single).toEqual(['mui-slider']);
    expect(chains.range).toEqual(['mui-slider']);
    await page.close();
  }, 60000);

  it('mui 非滑块控件（Switch/TextField/Select/Autocomplete）set_value 链为空', async () => {
    const page = await fixturePage('mui.html');
    const chains = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      const ids = (sel: string) => reg.resolveChain(document.querySelector(sel), 'set_value').map((c: any) => c.id);
      return { textField: ids('#nameField'), numberField: ids('#countField'), select: ids('#citySelect'), autocomplete: ids('#cityAutocomplete') };
    });
    for (const v of Object.values(chains)) expect(v).toEqual([]);
    await page.close();
  }, 60000);

  it('mui-extra 开关/复选/单选 set_value 链为空', async () => {
    const page = await fixturePage('mui-extra.html');
    const chains = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      const ids = (sel: string) => reg.resolveChain(document.querySelector(sel), 'set_value').map((c: any) => c.id);
      return { switch: ids('#notifySwitch'), checkbox: ids('#fruitChecks'), radio: ids('#genderRadios') };
    });
    for (const v of Object.values(chains)) expect(v).toEqual([]);
    await page.close();
  }, 60000);
});

describe('set_value 动作 label（滑块设置）', () => {
  it('页内 listActions 透出 label 滑块设置（mui-slider）', async () => {
    const page = await fixturePage('mui-extra.html');
    const labels = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      const out: Record<string, string | undefined> = {};
      for (const p of reg.listActions()) {
        const sv = (p.actions || []).find((a: any) => a.name === 'set_value');
        if (sv) out[p.id] = sv.label;
      }
      return out;
    });
    expect(labels['mui-slider']).toBe('滑块设置');
    await page.close();
  }, 60000);
});
