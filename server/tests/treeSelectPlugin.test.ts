import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { browserLaunchOptions } from '../src/browser';
import { buildPluginInitScript } from '../src/services/pluginRuntime';
import { BUILTIN_PLUGIN_DEFS } from '../src/services/componentPlugins/builtin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

// 模拟存量库的成员顺序（appendBuiltinMembers 把 tree-select 系列追加在尾部）：
// 注入顺序 = 页内注册顺序 = resolveChain 优先级（select 系列先试，tree-select 系列树形兜底）
const ENTRY_ORDER = ['ant-select', 'el-select', 'ant-date-picker', 'el-date-picker', 'ant-tree-select', 'el-tree-select'];
const PLUGIN_DEFS = ENTRY_ORDER.map(
  (n) => BUILTIN_PLUGIN_DEFS.find((d) => d.name === n)!,
);
// 新源码契约：求值「插件定义对象」的表达式，注入时由平台封装 register 并注入 id（= 插件名）
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
  await page.goto(`file://${FIXTURES}/${name}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  return page;
}

interface ChainResult {
  winner: string | null;
  status: string;
  message: string;
  attempted: string[];
  chainIds: string[];
}

/** 平台同款链式执行（生成分发器/回放同语义）：resolveChain 按序 invokeAction，failed 落下一个。 */
async function runChain(page: Page, triggerCss: string, value: string): Promise<ChainResult> {
  return page.evaluate(async ([css, val]: any[]) => {
    const reg = (globalThis as any).__ttPluginRegistry__;
    const el = document.querySelector(css as string);
    const chain = reg.resolveChain(el, 'select');
    const attempted: string[] = [];
    let last = '';
    for (const hit of chain) {
      attempted.push(hit.id);
      const r = await reg.invokeAction(hit.id, 'select', el, { value: val });
      if (r.status !== 'failed') {
        return { winner: hit.id, status: r.status, message: r.message, attempted, chainIds: chain.map((c: any) => c.id) };
      }
      last = r.message;
    }
    return { winner: null, status: 'failed', message: last, attempted, chainIds: chain.map((c: any) => c.id) };
  }, [triggerCss, value] as any) as Promise<ChainResult>;
}

/** 读取页面最后一个 .el-select 的回显（全部选中项文本 + input 值，规避多 span 占位结构差异）。 */
async function displayOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const sels = Array.from(document.querySelectorAll('.el-select'));
    const sel = sels[sels.length - 1];
    if (!sel) return '';
    const parts = Array.from(sel.querySelectorAll('.el-select__selected-item')).map((n) => (n.textContent || '').trim());
    for (const inp of Array.from(sel.querySelectorAll('input'))) parts.push((inp as HTMLInputElement).value ?? '');
    return parts.filter(Boolean).join('|');
  });
}

/** 折叠「研发部」节点（antd 点 switcher / element 点展开 icon），使深层叶子不可见。 */
async function collapseDevNode(page: Page, lib: 'antd' | 'element') {
  if (lib === 'antd') {
    await page.locator('.ant-tree-select .ant-select-selector').click();
    await page.waitForTimeout(500);
    await page.locator('.ant-select-tree-treenode', { hasText: '研发部' }).locator('.ant-select-tree-switcher').first().click();
  } else {
    const last = page.locator('.el-select').last();
    const wrap = last.locator('.el-select__wrapper');
    if (await wrap.count()) {
      await wrap.first().click();
    } else {
      await last.locator('input').first().click();
    }
    await page.waitForTimeout(500);
    await page.locator('.el-select-dropdown .el-tree-node__content', { hasText: '研发部' }).last().locator('.el-tree-node__expand-icon').first().click();
  }
  await page.waitForTimeout(300);
  // clickoutside 关闭弹层（icon 点击后焦点不在 select 上，Escape 是 no-op，会让后续 input.click() 变成 toggle）
  await page.locator('h3').first().click();
  await page.waitForTimeout(400);
}

describe('tree-select 系内置插件（select 动作树形兜底）', () => {
  it('antd TreeSelect：ant-select 先试失败后由 ant-tree-select 选中深层叶子', async () => {
    const page = await fixturePage('antd.html');
    const r = await runChain(page, '#deptTreeSelect', '前端组');
    expect(r.chainIds).toEqual(['ant-select', 'ant-tree-select']);
    expect(r.winner).toBe('ant-tree-select');
    expect(r.status).toBe('success');
    const display = await page.evaluate(() => document.querySelector('.ant-tree-select .ant-select-selection-item')?.textContent ?? '');
    expect(display).toBe('前端组');
    await page.close();
  }, 90000);

  it('antd TreeSelect：折叠祖先时展开闭环后选中深层叶子', async () => {
    const page = await fixturePage('antd.html');
    await collapseDevNode(page, 'antd');
    const r = await runChain(page, '#deptTreeSelect', '前端组');
    expect(r.winner).toBe('ant-tree-select');
    const display = await page.evaluate(() => document.querySelector('.ant-tree-select .ant-select-selection-item')?.textContent ?? '');
    expect(display).toBe('前端组');
    await page.close();
  }, 90000);

  it('antd TreeSelect：不存在的节点 failed 且诊断含当前可见项', async () => {
    const page = await fixturePage('antd.html');
    const r = await runChain(page, '#deptTreeSelect', '不存在的组');
    expect(r.winner).toBeNull();
    expect(r.status).toBe('failed');
    expect(r.message).toContain('树节点未找到');
    expect(r.message).toContain('总公司');
    await page.close();
  }, 90000);

  it('element-ui 组合树形选择：el-select 先试失败后由 el-tree-select 选中', async () => {
    const page = await fixturePage('element-ui.html');
    const r = await runChain(page, 'div.block:nth-of-type(2) .el-select', '后端组');
    expect(r.chainIds).toEqual(['el-select', 'el-tree-select']);
    expect(r.winner).toBe('el-tree-select');
    const inputVal = await page.evaluate(() => {
      const sels = Array.from(document.querySelectorAll('.el-select'));
      return (sels[sels.length - 1].querySelector('.el-input__inner') as HTMLInputElement)?.value ?? '';
    });
    expect(inputVal).toBe('后端组');
    await page.close();
  }, 120000);

  it('element-ui 组合树形选择：折叠祖先时展开闭环后选中', async () => {
    const page = await fixturePage('element-ui.html');
    await collapseDevNode(page, 'element');
    const r = await runChain(page, 'div.block:nth-of-type(2) .el-select', '前端组');
    expect(r.winner).toBe('el-tree-select');
    const inputVal = await page.evaluate(() => {
      const sels = Array.from(document.querySelectorAll('.el-select'));
      return (sels[sels.length - 1].querySelector('.el-input__inner') as HTMLInputElement)?.value ?? '';
    });
    expect(inputVal).toBe('前端组');
    await page.close();
  }, 120000);

  it('element-plus el-tree-select：跳过隐藏选项后由树形插件展开并选中', async () => {
    const page = await fixturePage('element-plus.html');
    await collapseDevNode(page, 'element');
    const r = await runChain(page, 'div.block:nth-of-type(2) .el-select', '前端组');
    expect(r.chainIds).toEqual(['el-select', 'el-tree-select']);
    expect(r.attempted).toEqual(['el-select', 'el-tree-select']);
    expect(r.winner).toBe('el-tree-select');
    expect(r.status).toBe('success');
    expect(await displayOf(page)).toContain('前端组');
    await page.close();
  }, 120000);

  it('element-plus el-tree-select：直接调用 el-tree-select 展开闭环选中折叠叶子', async () => {
    const page = await fixturePage('element-plus.html');
    await collapseDevNode(page, 'element');
    const status = await page.evaluate(async () => {
      const sels = Array.from(document.querySelectorAll('.el-select'));
      const reg = (globalThis as any).__ttPluginRegistry__;
      const r = await reg.invokeAction('el-tree-select', 'select', sels[sels.length - 1], { value: '前端组' });
      return r.status + ':' + r.message;
    });
    expect(status).toContain('success');
    expect(await displayOf(page)).toContain('前端组');
    await page.close();
  }, 120000);

  it('element-plus el-tree-select：常规选中由 el-select 先试成功（平铺 li 存在）', async () => {
    const page = await fixturePage('element-plus.html');
    const r = await runChain(page, 'div.block:nth-of-type(2) .el-select', '市场部');
    expect(r.winner).toBe('el-select');
    expect(await displayOf(page)).toContain('市场部');
    await page.close();
  }, 90000);

  it('常规下拉无回归：antd 城市下拉与 element-ui 城市下拉仍由 select 系插件处理', async () => {
    const antdPage = await fixturePage('antd.html');
    const r1 = await runChain(antdPage, '#citySelect', '上海');
    expect(r1.chainIds).toEqual(['ant-select']);
    expect(r1.winner).toBe('ant-select');
    await antdPage.close();

    const elPage = await fixturePage('element-ui.html');
    const r2 = await runChain(elPage, 'div.block:nth-of-type(1) .el-select', '广州');
    expect(r2.chainIds).toEqual(['el-select', 'el-tree-select']);
    expect(r2.winner).toBe('el-select');
    await elPage.close();
  }, 120000);

  it('标注：antd 树形触发器有 ant-tree-select 标注；element-ui 组合方案触发器侧无 aria 关联时不标注', async () => {
    const antdPage = await fixturePage('antd.html');
    const a1 = await antdPage.evaluate(() => (globalThis as any).__ttPluginRegistry__.annotateFor(document.querySelector('.ant-tree-select')));
    expect(a1).toContain('[ant-tree-select]');
    expect(a1).toContain('树形选择器');
    await antdPage.close();

    const elPage = await fixturePage('element-ui.html');
    const a2 = await elPage.evaluate(() => {
      const sels = Array.from(document.querySelectorAll('.el-select'));
      return (globalThis as any).__ttPluginRegistry__.annotateFor(sels[sels.length - 1]);
    });
    // element-ui 组合方案无 aria 关联（触发器侧无法区分树形/普通），标注降级省略、动作仍可兜底
    expect(a2).not.toContain('[el-tree-select]');

    const plusPage = await fixturePage('element-plus.html');
    const a3 = await plusPage.evaluate(() => {
      const sels = Array.from(document.querySelectorAll('.el-select'));
      return (globalThis as any).__ttPluginRegistry__.annotateFor(sels[sels.length - 1]);
    });
    // element-plus 经 aria-controls 可关联到 .el-tree 弹层，标注生效
    expect(a3).toContain('[el-tree-select]');
    await Promise.all([elPage.close(), plusPage.close()]);
  }, 120000);
});
