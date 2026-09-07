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
 *  verify 可为 async（如 vant-picker 的回显轮询），必须 await 后再取布尔。 */
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

describe('vant-select（van-dropdown-menu）', () => {
  it('select 动作：点标题展开 overlay 并选中「上海」，链上仅有 vant 插件', async () => {
    const page = await fixturePage('vant.html');
    const r = await invoke(page, 'vant-select', '#cityDropdown .van-dropdown-menu__title', 'select', { value: '上海' });
    expect(r.chainIds).toEqual(['vant-select']);
    expect(r.status).toBe('success');
    expect(r.message).toContain('上海');
    // fixture 侧效应：当前值展示为选中 value
    const val = await page.locator('.block', { has: page.locator('#cityDropdown') }).locator('.val').textContent();
    expect(val).toContain('shanghai');
    await page.close();
  }, 60000);

  it('选项不存在：failed 且列出当前可选', async () => {
    const page = await fixturePage('vant.html');
    const r = await invoke(page, 'vant-select', '#cityDropdown .van-dropdown-menu__title', 'select', { value: '杭州' });
    expect(r.status).toBe('failed');
    expect(r.message).toContain('当前可选');
    expect(r.message).toContain('北京');
    await page.close();
  }, 60000);

  it('链式执行（平台同款）成功且命中 vant-select', async () => {
    const page = await fixturePage('vant.html');
    const r = await runChain(page, '#cityDropdown .van-dropdown-menu__title', 'select', '广州');
    expect(r.winner).toBe('vant-select');
    expect(r.status).toBe('success');
    await page.close();
  }, 60000);

  it('select 幂等：弹层已被打开时复用不重复点击', async () => {
    const page = await fixturePage('vant.html');
    // 先手动展开弹层（模拟链上前一插件已打开）
    await page.click('#cityDropdown .van-dropdown-menu__title');
    await page.waitForTimeout(400);
    const r = await invoke(page, 'vant-select', '#cityDropdown .van-dropdown-menu__title', 'select', { value: '深圳' });
    expect(r.status).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#cityDropdown') }).locator('.val').textContent();
    expect(val).toContain('shenzhen');
    await page.close();
  }, 60000);
});

describe('vant-picker（滚轮弹层家族）', () => {
  it('select：城市滚轮单列点选+确认，回显与 fixture 值联动', async () => {
    const page = await fixturePage('vant.html');
    const r = await invoke(page, 'vant-picker', '#cityPickerField', 'select', { value: '广州' });
    expect(r.chainIds).toEqual(['vant-picker']);
    expect(r.status).toBe('success');
    expect(r.message).toContain('广州');
    const val = await page.locator('.block', { has: page.locator('#cityPickerField') }).locator('.val').textContent();
    expect(val).toContain('广州');
    await page.close();
  }, 60000);

  it('set_date：年/月/日三列数值归一点选+确认', async () => {
    const page = await fixturePage('vant.html');
    const r = await invoke(page, 'vant-picker', '#datePickerField', 'set_date', { value: '2026-3-15' });
    expect(r.status).toBe('success');
    expect(r.message).toContain('2026-3-15');
    const val = await page.locator('.block', { has: page.locator('#datePickerField') }).locator('.val').textContent();
    expect(val).toContain('2026-03-15');
    await page.close();
  }, 60000);

  it('set_time：时/分/秒三列点选+确认（vant-extra）', async () => {
    const page = await fixturePage('vant-extra.html');
    const r = await invoke(page, 'vant-picker', '#timePickerField', 'set_time', { value: '08:05:09' });
    expect(r.status).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#timePickerField') }).locator('.val').textContent();
    expect(val).toContain('08:05:09');
    await page.close();
  }, 60000);

  it('结构探测：set_date 打到日历触发器时 failed 并引导换插件', async () => {
    const page = await fixturePage('vant.html');
    const r = await invoke(page, 'vant-picker', '#calendarField', 'set_date', { value: '2026-09-15' });
    expect(r.status).toBe('failed');
    expect(r.message).toContain('滚轮');
    await page.close();
  }, 60000);

  it('select 幂等：弹层已开时复用不重复点触发器', async () => {
    const page = await fixturePage('vant.html');
    await page.click('#cityPickerField');
    await page.waitForTimeout(500);
    const r = await invoke(page, 'vant-picker', '#cityPickerField', 'select', { value: '深圳' });
    expect(r.status).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#cityPickerField') }).locator('.val').textContent();
    expect(val).toContain('深圳');
    await page.close();
  }, 60000);
});

describe('vant-calendar（日历面板）', () => {
  it('链式协作：set_date 先经 vant-picker 探测失败，落链 vant-calendar 成功', async () => {
    const page = await fixturePage('vant.html');
    const r = await runChain(page, '#calendarField', 'set_date', '2026-09-15');
    expect(r.winner).toBe('vant-calendar');
    expect(r.chainIds).toEqual(['vant-picker', 'vant-calendar']);
    expect(r.status).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#calendarField') }).locator('.val').textContent();
    expect(val).toContain('2026-09-15');
    await page.close();
  }, 120000);

  it('set_date：向前滚动到 2024 年（初始位之后多月回滚）', async () => {
    const page = await fixturePage('vant.html');
    const r = await invoke(page, 'vant-calendar', '#calendarField', 'set_date', { value: '2024-2-15' });
    expect(r.status, r.message).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#calendarField') }).locator('.val').textContent();
    expect(val).toContain('2024-02-15');
    await page.close();
  }, 120000);

  it('set_date：超出日历范围时 failed（stall 检测）', async () => {
    const page = await fixturePage('vant.html');
    const r = await invoke(page, 'vant-calendar', '#calendarField', 'set_date', { value: '2035-01-01' });
    expect(r.status).toBe('failed');
    expect(r.message).toContain('未能定位');
    await page.close();
  }, 120000);
});

describe('vant-slider（滑块）', () => {
  it('set_value：单值轨道点击设 65', async () => {
    const page = await fixturePage('vant-extra.html');
    const r = await invoke(page, 'vant-slider', '#volSlider', 'set_value', { value: '65' });
    expect(r.chainIds).toEqual(['vant-slider']);
    expect(r.status).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#volSlider') }).locator('.val').textContent();
    expect(val).toContain('65');
    await page.close();
  }, 60000);

  it('set_value：范围滑块 "10,85" 按手柄拖拽设两端', async () => {
    const page = await fixturePage('vant-extra.html');
    const r = await invoke(page, 'vant-slider', '#rangeSlider', 'set_value', { value: '10,85' });
    expect(r.status).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#rangeSlider') }).locator('.val').textContent();
    expect(val).toContain('10 - 85');
    await page.close();
  }, 60000);

  it('set_value：单值打在范围滑块按就近手柄移动', async () => {
    const page = await fixturePage('vant-extra.html');
    const r = await invoke(page, 'vant-slider', '#rangeSlider', 'set_value', { value: '30' });
    expect(r.status).toBe('success');
    const val = await page.locator('.block', { has: page.locator('#rangeSlider') }).locator('.val').textContent();
    expect(val).toContain('30 - 70');
    await page.close();
  }, 60000);
});

describe('页内后验 verify 真实生效（假成功必须被拦截降级）', () => {
  it('vant-select：错参判否 / 对参判是 / 坏参防御 / 假成功降级 failed', async () => {
    const page = await fixturePage('vant.html');
    const r = await invoke(page, 'vant-select', '#cityDropdown .van-dropdown-menu__title', 'select', { value: '上海' });
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'vant-select', 'select', '#cityDropdown .van-dropdown-menu__title', { value: '上海' }, { value: '北京' }, { value: '深圳' });
    await page.close();
  }, 120000);

  it('vant-picker select：后验三件套 + 假成功降级', async () => {
    const page = await fixturePage('vant.html');
    const r = await invoke(page, 'vant-picker', '#cityPickerField', 'select', { value: '广州' });
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'vant-picker', 'select', '#cityPickerField', { value: '广州' }, { value: '上海' }, { value: '北京' });
    await page.close();
  }, 120000);

  it('vant-picker set_date：后验三件套 + 假成功降级', async () => {
    const page = await fixturePage('vant.html');
    const r = await invoke(page, 'vant-picker', '#datePickerField', 'set_date', { value: '2026-3-15' });
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'vant-picker', 'set_date', '#datePickerField', { value: '2026-3-15' }, { value: '2027-1-1' }, { value: '2025-6-20' });
    await page.close();
  }, 120000);

  it('vant-picker set_time：后验三件套 + 假成功降级（vant-extra）', async () => {
    const page = await fixturePage('vant-extra.html');
    const r = await invoke(page, 'vant-picker', '#timePickerField', 'set_time', { value: '08:05:09' });
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'vant-picker', 'set_time', '#timePickerField', { value: '08:05:09' }, { value: '09:00:00' }, { value: '10:10:10' });
    await page.close();
  }, 120000);

  it('vant-calendar set_date：后验三件套 + 假成功降级', async () => {
    const page = await fixturePage('vant.html');
    const r = await invoke(page, 'vant-calendar', '#calendarField', 'set_date', { value: '2026-9-15' });
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'vant-calendar', 'set_date', '#calendarField', { value: '2026-9-15' }, { value: '2024-2-15' }, { value: '2025-1-10' });
    await page.close();
  }, 120000);

  it('vant-slider set_value：后验三件套 + 假成功降级（vant-extra）', async () => {
    const page = await fixturePage('vant-extra.html');
    const r = await invoke(page, 'vant-slider', '#volSlider', 'set_value', { value: '65' });
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'vant-slider', 'set_value', '#volSlider', { value: '65' }, { value: '20' }, { value: '40' });
    await page.close();
  }, 120000);
});

describe('set_value 误派保护（resolveChain 精确性）', () => {
  it('vant 滑块链精确为 [vant-slider]，ant/el/mui 滑块插件均不误命中', async () => {
    const page = await fixturePage('vant-extra.html');
    const chains = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      return {
        single: reg.resolveChain(document.querySelector('#volSlider'), 'set_value').map((c: any) => c.id),
        range: reg.resolveChain(document.querySelector('#rangeSlider'), 'set_value').map((c: any) => c.id),
      };
    });
    expect(chains.single).toEqual(['vant-slider']);
    expect(chains.range).toEqual(['vant-slider']);
    await page.close();
  }, 60000);

  it('vant 非滑块数值控件（步进器/评分/开关/复选/文本框/滚轮触发器）set_value 链为空', async () => {
    const page = await fixturePage('vant-extra.html');
    const chains = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      const ids = (sel: string) => reg.resolveChain(document.querySelector(sel), 'set_value').map((c: any) => c.id);
      return {
        stepper: ids('#countStepper'),
        rate: ids('#scoreRate'),
        switch: ids('#notifySwitch'),
        checkbox: ids('#fruitChecks'),
        textField: ids('#nameField'),
      };
    });
    for (const v of Object.values(chains)) expect(v).toEqual([]);
    await page.close();
  }, 60000);

  it('vant 滚轮/日历触发器不注册 set_value，链为空（原生 fill 层兜底）', async () => {
    const page = await fixturePage('vant.html');
    const chains = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      const ids = (sel: string) => reg.resolveChain(document.querySelector(sel), 'set_value').map((c: any) => c.id);
      return { pickerTrigger: ids('#cityPickerField'), dateTrigger: ids('#datePickerField'), calendarTrigger: ids('#calendarField') };
    });
    for (const v of Object.values(chains)) expect(v).toEqual([]);
    await page.close();
  }, 60000);

  it('反向回归：ant/el 滑块链不因新插件加入而污染', async () => {
    const antPage = await fixturePage('antd-extra.html');
    const antChain = await antPage.evaluate(() => (globalThis as any).__ttPluginRegistry__.resolveChain(document.querySelector('#volSlider'), 'set_value').map((c: any) => c.id));
    expect(antChain).toEqual(['ant-slider']);
    await antPage.close();
    const elPage = await fixturePage('element-plus-extra.html');
    const elChain = await elPage.evaluate(() => (globalThis as any).__ttPluginRegistry__.resolveChain(document.querySelector('#volSlider'), 'set_value').map((c: any) => c.id));
    expect(elChain).toEqual(['el-slider']);
    await elPage.close();
  }, 120000);
});

describe('set_value 动作 label（滑块设置）', () => {
  it('四个滑块插件：源码内声明与 actionsMeta 一致（上传一致性检测口径）', async () => {
    const { extractDeclaredActionLabels } = await import('../src/services/genToolsPlugin');
    for (const name of ['ant-slider', 'el-slider', 'vant-slider', 'mui-slider']) {
      const def = BUILTIN_PLUGIN_DEFS.find((d) => d.name === name)!;
      const declared = extractDeclaredActionLabels(def.entryFile).find((a) => a.name === 'set_value');
      expect(declared?.label, `${name} 源码 label`).toBe('滑块设置');
      const meta = def.actionsMeta?.find((a) => a.name === 'set_value');
      expect(meta?.label, `${name} actionsMeta label`).toBe('滑块设置');
    }
  }, 30000);

  it('页内 listActions 透出 label 滑块设置', async () => {
    const page = await fixturePage('vant-extra.html');
    const labels = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      const out: Record<string, string | undefined> = {};
      for (const p of reg.listActions()) {
        const sv = (p.actions || []).find((a: any) => a.name === 'set_value');
        if (sv) out[p.id] = sv.label;
      }
      return out;
    });
    expect(labels['vant-slider']).toBe('滑块设置');
    await page.close();
  }, 60000);
});

describe('set_time 动作 label（设置时间）', () => {
  it('三个 set_time 声明方：源码内声明与 actionsMeta 一致（上传一致性检测口径）', async () => {
    const { extractDeclaredActionLabels } = await import('../src/services/genToolsPlugin');
    for (const name of ['ant-time-picker', 'el-time-picker', 'vant-picker']) {
      const def = BUILTIN_PLUGIN_DEFS.find((d) => d.name === name)!;
      const declared = extractDeclaredActionLabels(def.entryFile).find((a) => a.name === 'set_time');
      expect(declared?.label, `${name} 源码 label`).toBe('设置时间');
      const meta = def.actionsMeta?.find((a) => a.name === 'set_time');
      expect(meta?.label, `${name} actionsMeta label`).toBe('设置时间');
    }
  }, 30000);

  it('页内 listActions 透出 label 设置时间（vant-picker）', async () => {
    const page = await fixturePage('vant-extra.html');
    const labels = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      const out: Record<string, string | undefined> = {};
      for (const p of reg.listActions()) {
        const st = (p.actions || []).find((a: any) => a.name === 'set_time');
        if (st) out[p.id] = st.label;
      }
      return out;
    });
    expect(labels['vant-picker']).toBe('设置时间');
    await page.close();
  }, 60000);
});
