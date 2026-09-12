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
async function invoke(page: Page, pluginId: string, selector: string, action: string, args: Record<string, unknown>): Promise<InvokeResult> {
  return page.evaluate(async ([pid, css, act, a]: any[]) => {
    const reg = (globalThis as any).__ttPluginRegistry__;
    const el = document.querySelector(css);
    if (!el) return { status: 'failed', message: '找不到 ' + css, chainIds: [] };
    const chainIds = reg.resolveChain(el, act).map((c: any) => c.id);
    const r = await reg.invokeAction(pid, act, el, a);
    return { status: r.status, message: r.message, chainIds };
  }, [pluginId, selector, action, args] as any) as Promise<InvokeResult>;
}

/** 按可见文本找 wrapper（antd / element 通用：在指定容器内按文本收敛）。 */
async function wrapperByText(page: Page, css: string, text: string): Promise<string | null> {
  return page.evaluate(([sel, t]: any[]) => {
    const norm = (s: string) => (s || '').replace(/\s+/g, '').trim();
    const hit = Array.from(document.querySelectorAll(sel)).find((el) => norm(el.textContent) === norm(t));
    if (!hit) return null;
    // 用序号表达式表示：同款元素列表中的下标
    const list = Array.from(document.querySelectorAll(sel));
    return `${sel}:nth-of-type(${list.indexOf(hit) + 1})`;
  }, [css, text] as any) as Promise<string | null>;
}

describe('ant-checkbox（antd v5）', () => {
  it('check：勾选未选中的单项（受控状态联动 .val）', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-checkbox', '.block:nth-of-type(1) .ant-checkbox-wrapper', 'check', { value: 'true' });
    expect(r.chainIds).toEqual(['ant-checkbox']);
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已勾选');
    const val = await page.locator('.block:nth-of-type(1)').textContent();
    expect(val).toContain('已勾选');
    await page.close();
  }, 60000);

  it('check：取消勾选组内已选项（受控 uncheck 落定）', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-checkbox', '.block:nth-of-type(2) .ant-checkbox-wrapper', 'check', { value: 'false' });
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已取消勾选');
    const input = page.locator('.block:nth-of-type(2) .ant-checkbox-wrapper').first().locator('input');
    expect(await input.isChecked()).toBe(false);
    const val = await page.locator('.block:nth-of-type(2)').textContent();
    expect(val).toContain('(空)');
    await page.close();
  }, 60000);

  it('check：幂等（已勾选再勾选报已处于）', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-checkbox', '.block:nth-of-type(2) .ant-checkbox-wrapper', 'check', {});
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已处于');
    await page.close();
  }, 60000);

  it('check：args.checked=false 与 value 别名「取消」等价', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    // 组内苹果已选 → args.checked=false 取消
    const r1 = await invoke(page, 'ant-checkbox', '.block:nth-of-type(2) .ant-checkbox-wrapper', 'check', { checked: false });
    expect(r1.status, r1.message).toBe('success');
    // 按钮形态组内苹果已选 → value='取消'
    const r2 = await invoke(page, 'ant-checkbox', '.block:nth-of-type(4) .ant-checkbox-wrapper', 'check', { value: '取消' });
    expect(r2.status, r2.message).toBe('success');
    const val = await page.locator('.block:nth-of-type(4)').textContent();
    expect(val).toContain('(空)');
    await page.close();
  }, 60000);

  it('check：禁用项 failed 且说明原因', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-checkbox', '.block:nth-of-type(2) .ant-checkbox-wrapper.ant-checkbox-wrapper-disabled', 'check', {});
    expect(r.status).toBe('failed');
    expect(r.message).toContain('禁用');
    expect(r.message).toContain('梨');
    await page.close();
  }, 60000);

  it('check：半选全选勾选后组全联动（indeterminate）', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-checkbox', '.block:nth-of-type(3) .ant-checkbox-wrapper', 'check', {});
    expect(r.status, r.message).toBe('success');
    const val = await page.locator('.block:nth-of-type(3)').textContent();
    expect(val).toContain('a');
    expect(val).toContain('b');
    await page.close();
  }, 60000);

  it('check：无法识别的状态别名 failed', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-checkbox', '.block:nth-of-type(7) .ant-checkbox-wrapper', 'check', { value: '____未知____' });
    expect(r.status).toBe('failed');
    expect(r.message).toContain('无法识别的目标状态');
    await page.close();
  }, 60000);

  it('role 候选真实定位唯一（getByRole checkbox + name）', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    expect(await page.getByRole('checkbox', { name: '我已阅读并同意用户协议' }).count()).toBe(1);
    // 香蕉/梨在普通组与按钮组各出现一次（跨组歧义由平台唯一性验证丢弃），这里验证页面唯一文本
    expect(await page.getByRole('checkbox', { name: '订阅周报' }).count()).toBe(1);
    expect(await page.getByRole('checkbox', { name: '选项乙' }).count()).toBe(1);
    await page.close();
  }, 60000);

  it('resolveChain 精确：radio/switch 等 set_value/check 不命中', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const chains = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      const ids = (sel: string, act: string) => reg.resolveChain(document.querySelector(sel), act).map((c: any) => c.id);
      return {
        checkboxCheck: ids('.block:nth-of-type(1) .ant-checkbox-wrapper', 'check'),
        radioCheck: ids('.block:nth-of-type(5) .ant-radio-wrapper', 'check'),
        checkboxSelect: ids('.block:nth-of-type(1) .ant-checkbox-wrapper', 'select'),
      };
    });
    expect(chains.checkboxCheck).toEqual(['ant-checkbox']);
    expect(chains.radioCheck).toEqual([]);
    expect(chains.checkboxSelect).toEqual([]);
    await page.close();
  }, 60000);
});

describe('ant-checkbox（antd v6 回归）', () => {
  it('check：勾选 + 取消（v6 触发器 DOM）', async () => {
    const page = await fixturePage('antd-v6-checkbox-radio.html');
    const r1 = await invoke(page, 'ant-checkbox', '.block:nth-of-type(1) .ant-checkbox-wrapper', 'check', {});
    expect(r1.status, r1.message).toBe('success');
    expect(await page.locator('.block:nth-of-type(1) input').first().isChecked()).toBe(true);
    const r2 = await invoke(page, 'ant-checkbox', '.block:nth-of-type(2) .ant-checkbox-wrapper', 'check', { value: 'false' });
    expect(r2.status, r2.message).toBe('success');
    expect(await page.locator('.block:nth-of-type(2) input').first().isChecked()).toBe(false);
    await page.close();
  }, 60000);
});

/** 后验三件套 + 假成功穿透降级（平台外壳口径）。 */
async function expectVerifyGuards(
  page: Page,
  name: string,
  action: string,
  selector: string,
  realArgs: Record<string, unknown>,
  wrongArgs: Record<string, unknown>,
  resetArgs: Record<string, unknown>,
) {
  const code = BUILTIN_PLUGIN_DEFS.find((d) => d.name === name)!.entryFile;
  const callVerify = async (a: Record<string, unknown>) => page.evaluate(async ([c, act, css, args]: any[]) => {
    const def = eval(c);
    const el = document.querySelector(css);
    return !!(await def.actions[act].verify(el, args));
  }, [code, action, selector, a] as any);
  expect(await callVerify(wrongArgs)).toBe(false);
  expect(await callVerify(realArgs)).toBe(true);
  expect(await callVerify({ value: '___不存在的值___' })).toBe(false);
  const reset = await invoke(page, name, selector, action, resetArgs);
  expect(reset.status, reset.message).toBe('success');
  const fakeId = `fake-${name}`;
  await page.evaluate(([c, act, fid]: any[]) => {
    const def = eval(c);
    def.actions[act].fn = async () => '假成功（未真正操作）';
    (globalThis as any).__ttPluginRegistry__.register(Object.assign(def, { id: fid }));
  }, [code, action, fakeId] as any);
  const r = await invoke(page, fakeId, selector, action, realArgs);
  expect(r.status, r.message).toBe('failed');
  expect(r.message).toContain('后验未通过');
}

describe('el-checkbox（element-plus）', () => {
  it('check：勾选未选中的单项（受控状态联动 .val）', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-checkbox', '.block:nth-of-type(1) .el-checkbox', 'check', { value: 'true' });
    expect(r.chainIds).toEqual(['el-checkbox']);
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已勾选');
    const val = await page.locator('.block:nth-of-type(1)').textContent();
    expect(val).toContain('已勾选');
    await page.close();
  }, 60000);

  it('check：取消勾选组内已选项', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-checkbox', '.block:nth-of-type(2) .el-checkbox', 'check', { value: 'false' });
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已取消勾选');
    const val = await page.locator('.block:nth-of-type(2)').textContent();
    expect(val).toContain('(空)');
    await page.close();
  }, 60000);

  it('check：幂等（已勾选再勾选报已处于）', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-checkbox', '.block:nth-of-type(2) .el-checkbox', 'check', {});
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已处于');
    await page.close();
  }, 60000);

  it('check：args.checked=false 与 value 别名「取消」等价', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r1 = await invoke(page, 'el-checkbox', '.block:nth-of-type(2) .el-checkbox', 'check', { checked: false });
    expect(r1.status, r1.message).toBe('success');
    const r2 = await invoke(page, 'el-checkbox', '.block:nth-of-type(4) .el-checkbox-button', 'check', { value: '取消' });
    expect(r2.status, r2.message).toBe('success');
    const val = await page.locator('.block:nth-of-type(4)').textContent();
    expect(val).toContain('(空)');
    await page.close();
  }, 60000);

  it('check：禁用项 failed 且说明原因', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-checkbox', '.block:nth-of-type(2) .el-checkbox.is-disabled', 'check', {});
    expect(r.status).toBe('failed');
    expect(r.message).toContain('禁用');
    expect(r.message).toContain('梨');
    await page.close();
  }, 60000);

  it('check：半选全选勾选后组全联动（indeterminate）', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-checkbox', '.block:nth-of-type(3) .el-checkbox', 'check', {});
    expect(r.status, r.message).toBe('success');
    const val = await page.locator('.block:nth-of-type(3)').textContent();
    expect(val).toContain('a');
    expect(val).toContain('b');
    await page.close();
  }, 60000);

  it('check：无法识别的状态别名 failed', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-checkbox', '.block:nth-of-type(7) .el-checkbox', 'check', { value: '____未知____' });
    expect(r.status).toBe('failed');
    expect(r.message).toContain('无法识别的目标状态');
    await page.close();
  }, 60000);

  it('resolveChain 精确：组容器与非 checkbox 不命中', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const chains = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      const ids = (sel: string, act: string) => reg.resolveChain(document.querySelector(sel), act).map((c: any) => c.id);
      return {
        checkbox: ids('.block:nth-of-type(1) .el-checkbox', 'check'),
        group: ids('.block:nth-of-type(2) .el-checkbox-group', 'check'),
        radio: ids('.block:nth-of-type(5) .el-radio', 'check'),
      };
    });
    expect(chains.checkbox).toEqual(['el-checkbox']);
    expect(chains.group).toEqual([]);
    expect(chains.radio).toEqual([]);
    await page.close();
  }, 60000);

  it('页内后验：错参判否 / 对参判是 / 坏参防御 / 假成功降级 failed', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-checkbox', '.block:nth-of-type(1) .el-checkbox', 'check', {});
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'el-checkbox', 'check', '.block:nth-of-type(1) .el-checkbox', { value: 'true' }, { value: 'false' }, { value: 'false' });
    await page.close();
  }, 120000);
});

describe('el-checkbox（element-ui 回归）', () => {
  it('check：勾选 + 取消（vue2 DOM）', async () => {
    const page = await fixturePage('element-ui-checkbox-radio.html');
    const r1 = await invoke(page, 'el-checkbox', '.block:nth-of-type(1) .el-checkbox', 'check', {});
    expect(r1.status, r1.message).toBe('success');
    expect(await page.locator('.block:nth-of-type(1) input').first().isChecked()).toBe(true);
    const r2 = await invoke(page, 'el-checkbox', '.block:nth-of-type(2) .el-checkbox', 'check', { value: 'false' });
    expect(r2.status, r2.message).toBe('success');
    expect(await page.locator('.block:nth-of-type(2) input').first().isChecked()).toBe(false);
    // 按钮形态
    const r3 = await invoke(page, 'el-checkbox', '.block:nth-of-type(4) .el-checkbox-button', 'check', {});
    expect(r3.status, r3.message).toBe('success');
    await page.close();
  }, 60000);
});

describe('ant-radio（antd v5）', () => {
  it('select：对单选项调用按文本选中「女」（组内互斥联动）', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-radio', '.block:nth-of-type(5) .ant-radio-wrapper:nth-of-type(2)', 'select', { value: '女' });
    expect(r.chainIds).toEqual(['ant-radio']);
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已选中：女');
    const val = await page.locator('.block:nth-of-type(5)').textContent();
    expect(val).toContain('当前值：female');
    await page.close();
  }, 60000);

  it('select：对组容器调用按文本选中（组级入口）', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-radio', '.block:nth-of-type(5) .ant-radio-group', 'select', { value: '女' });
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已选中：女');
    await page.close();
  }, 60000);

  it('select：幂等（已选中再选报已处于）', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-radio', '.block:nth-of-type(5) .ant-radio-group', 'select', { value: '男' });
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已处于');
    await page.close();
  }, 60000);

  it('select：禁用项 failed 且说明原因', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-radio', '.block:nth-of-type(5) .ant-radio-group', 'select', { value: '保密' });
    expect(r.status).toBe('failed');
    expect(r.message).toContain('禁用');
    expect(r.message).toContain('保密');
    await page.close();
  }, 60000);

  it('select：选项不存在 failed 且列出当前可选', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-radio', '.block:nth-of-type(5) .ant-radio-group', 'select', { value: '不限' });
    expect(r.status).toBe('failed');
    expect(r.message).toContain('未找到选项');
    expect(r.message).toContain('男');
    expect(r.message).toContain('女');
    await page.close();
  }, 60000);

  it('select：组容器缺 value failed 且列出当前可选', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-radio', '.block:nth-of-type(5) .ant-radio-group', 'select', {});
    expect(r.status).toBe('failed');
    expect(r.message).toContain('缺少 args.value');
    expect(r.message).toContain('男');
    await page.close();
  }, 60000);

  it('select：按钮形态（Radio.Button）按文本选中', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-radio', '.block:nth-of-type(6) .ant-radio-group', 'select', { value: '大型' });
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已选中：大型');
    const val = await page.locator('.block:nth-of-type(6)').textContent();
    expect(val).toContain('当前值：l');
    await page.close();
  }, 60000);

  it('select：传入 el 与 value 不一致时以 value 为准（组内定位）', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    // el 定位到「男」但 value=女：动作应选中「女」而非点击 el
    const r = await invoke(page, 'ant-radio', '.block:nth-of-type(5) .ant-radio-wrapper:nth-of-type(1)', 'select', { value: '女' });
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已选中：女');
    const male = await page.locator('.block:nth-of-type(5) .ant-radio-wrapper').first().locator('input').isChecked();
    expect(male).toBe(false);
    await page.close();
  }, 60000);

  it('role 候选真实定位唯一（getByRole radio + name）', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    expect(await page.getByRole('radio', { name: '男' }).count()).toBe(1);
    expect(await page.getByRole('radio', { name: '大型' }).count()).toBe(1);
    // antd v5 组容器无 role=radiogroup 属性（v6 才有），组容器 role 候选在 v5 由管线丢弃
    expect(await page.getByRole('radiogroup').count()).toBe(0);
    await page.close();
  }, 60000);

  it('页内后验：错参判否 / 对参判是 / 坏参防御 / 假成功降级 failed', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-radio', '.block:nth-of-type(5) .ant-radio-group', 'select', { value: '女' });
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'ant-radio', 'select', '.block:nth-of-type(5) .ant-radio-group', { value: '女' }, { value: '男' }, { value: '男' });
    await page.close();
  }, 120000);
});

describe('ant-radio（antd v6 回归）', () => {
  it('select：组容器按文本选中 + 按钮形态（v6 DOM）', async () => {
    const page = await fixturePage('antd-v6-checkbox-radio.html');
    const r1 = await invoke(page, 'ant-radio', '.block:nth-of-type(3) .ant-radio-group', 'select', { value: '女' });
    expect(r1.status, r1.message).toBe('success');
    expect(await page.locator('.block:nth-of-type(3)').textContent()).toContain('当前值：female');
    const r2 = await invoke(page, 'ant-radio', '.block:nth-of-type(4) .ant-radio-group', 'select', { value: '小型' });
    expect(r2.status, r2.message).toBe('success');
    expect(await page.locator('.block:nth-of-type(4)').textContent()).toContain('当前值：s');
    // v6 组容器带 role=radiogroup，组容器 role 候选可定位
    expect(await page.getByRole('radiogroup').count()).toBe(2);
    await page.close();
  }, 60000);
});

describe('el-radio（element-plus）', () => {
  it('select：对单选项调用按文本选中「女」（组内互斥联动）', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-radio', '.block:nth-of-type(5) .el-radio:nth-of-type(2)', 'select', { value: '女' });
    expect(r.chainIds).toEqual(['el-radio']);
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已选中：女');
    const val = await page.locator('.block:nth-of-type(5)').textContent();
    expect(val).toContain('当前值：female');
    await page.close();
  }, 60000);

  it('select：对组容器调用按文本选中（组级入口）', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-radio', '.block:nth-of-type(5) .el-radio-group', 'select', { value: '女' });
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已选中：女');
    await page.close();
  }, 60000);

  it('select：幂等（已选中再选报已处于）', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-radio', '.block:nth-of-type(5) .el-radio-group', 'select', { value: '男' });
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已处于');
    await page.close();
  }, 60000);

  it('select：禁用项 failed 且说明原因', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-radio', '.block:nth-of-type(5) .el-radio-group', 'select', { value: '保密' });
    expect(r.status).toBe('failed');
    expect(r.message).toContain('禁用');
    expect(r.message).toContain('保密');
    await page.close();
  }, 60000);

  it('select：选项不存在 failed 且列出当前可选', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-radio', '.block:nth-of-type(5) .el-radio-group', 'select', { value: '不限' });
    expect(r.status).toBe('failed');
    expect(r.message).toContain('未找到选项');
    expect(r.message).toContain('男');
    expect(r.message).toContain('女');
    await page.close();
  }, 60000);

  it('select：按钮形态（el-radio-button）按文本选中', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-radio', '.block:nth-of-type(6) .el-radio-group', 'select', { value: '大型' });
    expect(r.status, r.message).toBe('success');
    expect(r.message).toContain('已选中：大型');
    const val = await page.locator('.block:nth-of-type(6)').textContent();
    expect(val).toContain('当前值：l');
    await page.close();
  }, 60000);

  it('select：组容器缺 value failed 且列出当前可选', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-radio', '.block:nth-of-type(5) .el-radio-group', 'select', {});
    expect(r.status).toBe('failed');
    expect(r.message).toContain('缺少 args.value');
    expect(r.message).toContain('男');
    await page.close();
  }, 60000);

  it('页内后验：错参判否 / 对参判是 / 坏参防御 / 假成功降级 failed', async () => {
    const page = await fixturePage('element-plus-checkbox-radio.html');
    const r = await invoke(page, 'el-radio', '.block:nth-of-type(5) .el-radio-group', 'select', { value: '女' });
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(page, 'el-radio', 'select', '.block:nth-of-type(5) .el-radio-group', { value: '女' }, { value: '男' }, { value: '男' });
    await page.close();
  }, 120000);
});

describe('el-radio（element-ui 回归）', () => {
  it('select：组容器按文本选中 + 按钮形态（vue2 DOM）', async () => {
    const page = await fixturePage('element-ui-checkbox-radio.html');
    const r1 = await invoke(page, 'el-radio', '.block:nth-of-type(5) .el-radio-group', 'select', { value: '女' });
    expect(r1.status, r1.message).toBe('success');
    expect(await page.locator('.block:nth-of-type(5)').textContent()).toContain('当前值：female');
    const r2 = await invoke(page, 'el-radio', '.block:nth-of-type(6) .el-radio-group', 'select', { value: '小型' });
    expect(r2.status, r2.message).toBe('success');
    expect(await page.locator('.block:nth-of-type(6)').textContent()).toContain('当前值：s');
    await page.close();
  }, 60000);
});

describe('ant-checkbox 页内后验（假成功必须被拦截降级）', () => {
  it('错参判否 / 对参判是 / 坏参防御 / 假成功降级 failed', async () => {
    const page = await fixturePage('antd-checkbox-radio.html');
    const r = await invoke(page, 'ant-checkbox', '.block:nth-of-type(1) .ant-checkbox-wrapper', 'check', {});
    expect(r.status, r.message).toBe('success');
    await expectVerifyGuards(
      page,
      'ant-checkbox',
      'check',
      '.block:nth-of-type(1) .ant-checkbox-wrapper',
      { value: 'true' },
      { value: 'false' },
      { value: 'false' },
    );
    await page.close();
  }, 120000);
});
