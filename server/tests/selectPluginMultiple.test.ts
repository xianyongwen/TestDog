/**
 * select 内置插件 v1.2.0 行为测试（真实浏览器 + 页内注入，无需 DB）：
 * - 弹层已开时复用（修复前：重复 mousedown 先收起弹层 → 等待超时失败）
 * - 多选模式（antd .ant-select-multiple / element 选中项含 .el-tag）选中后自动收起弹层，避免遮挡后续表单操作
 * - 单选回归：成功路径与消息不变（antd 单选选中即自动收起）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { browserLaunchOptions } from '../src/browser';
import { buildPluginInitScript } from '../src/services/pluginRuntime';
import { BUILTIN_PLUGIN_DEFS } from '../src/services/componentPlugins/builtin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

// 与「默认组合」同序：ant-select → el-select → ant-tree-select → el-tree-select → ant/el-date-picker
const PLUGIN_DEFS = [
  'ant-select',
  'el-select',
  'ant-tree-select',
  'el-tree-select',
  'ant-date-picker',
  'el-date-picker',
].map((n) => BUILTIN_PLUGIN_DEFS.find((d) => d.name === n)!);
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
}

/** 平台同款链式执行：resolveChain 按序 invokeAction，failed 落下一个。 */
async function runChain(page: Page, triggerCss: string, value: string): Promise<ChainResult> {
  return page.evaluate(async ([css, val]: any[]) => {
    const reg = (globalThis as any).__ttPluginRegistry__;
    const el = document.querySelector(css as string);
    const chain = reg.resolveChain(el, 'select');
    let last = '';
    for (const hit of chain) {
      const r = await reg.invokeAction(hit.id, 'select', el, { value: val });
      if (r.status !== 'failed') {
        return { winner: hit.id, status: r.status, message: r.message };
      }
      last = r.message;
    }
    return { winner: null, status: 'failed', message: last };
  }, [triggerCss, value] as any) as Promise<ChainResult>;
}

/** antd 弹层是否开着（存在未隐藏且含选项的 dropdown）。 */
function antdDropdownOpen(page: Page) {
  return page.evaluate(() =>
    Boolean(document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')),
  );
}

/** element 弹层是否开着（可见且含选项）。 */
function elementDropdownOpen(page: Page) {
  return page.evaluate(() => {
    for (const d of Array.from(document.querySelectorAll<HTMLElement>('.el-select-dropdown'))) {
      if (d.style.display !== 'none' && d.offsetParent !== null && d.querySelector('.el-select-dropdown__item')) return true;
    }
    return false;
  });
}

/** 轮询等待弹层关闭（关闭动画下 hidden 类/display 延迟生效）。 */
async function waitClosed(page: Page, probe: (p: Page) => Promise<boolean>, timeoutMs = 2500): Promise<boolean> {
  for (let i = 0; i < timeoutMs / 100; i++) {
    if (!(await probe(page))) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

describe('select 内置插件（弹层复用 + 多选自动收起）', () => {
  it('antd 多选：选中后自动收起弹层，标签回显；连续两次调用选两个选项', async () => {
    const page = await fixturePage('antd.html');
    const r1 = await runChain(page, '#multiTagSelect', '标签一');
    expect(r1.winner).toBe('ant-select');
    expect(r1.status).toBe('success');
    expect(r1.message).toContain('已收起弹层');
    expect(await waitClosed(page, antdDropdownOpen)).toBe(true);
    // 第二次调用重新展开弹层再选（连续多选场景）
    const r2 = await runChain(page, '#multiTagSelect', '标签二');
    expect(r2.status).toBe('success');
    expect(await waitClosed(page, antdDropdownOpen)).toBe(true);
    const tags = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ant-select-multiple .ant-select-selection-item')).map((n) => (n.textContent || '').trim()),
    );
    expect(tags).toEqual(['标签一', '标签二']);
    await page.close();
  }, 90000);

  it('antd 单选回归：仍成功且弹层收起（消息不加「已收起」后缀）', async () => {
    const page = await fixturePage('antd.html');
    const r = await runChain(page, '#citySelect', '上海');
    expect(r.winner).toBe('ant-select');
    expect(r.message).not.toContain('已收起弹层');
    expect(await waitClosed(page, antdDropdownOpen)).toBe(true);
    const v = await page.evaluate(
      () => document.querySelector('.ant-select-single:not(.ant-tree-select) .ant-select-selection-item')?.textContent ?? '',
    );
    expect(v).toBe('上海');
    await page.close();
  }, 90000);

  it('antd 弹层已开时复用：手动展开后调用插件仍成功（不再因 mousedown 先收起而超时失败）', async () => {
    const page = await fixturePage('antd.html');
    await page.locator('.ant-select-single').first().click();
    await page.waitForTimeout(600);
    expect(await antdDropdownOpen(page)).toBe(true);
    const r = await runChain(page, '#citySelect', '上海');
    expect(r.winner).toBe('ant-select');
    expect(r.status).toBe('success');
    await page.close();
  }, 90000);

  it('element-plus 多选：选中后自动收起弹层，el-tag 回显', async () => {
    const page = await fixturePage('element-plus-multiple.html');
    const r = await runChain(page, '.el-select', '标签一');
    expect(r.winner).toBe('el-select');
    expect(r.status).toBe('success');
    expect(r.message).toContain('已收起弹层');
    expect(await waitClosed(page, elementDropdownOpen)).toBe(true);
    const tags = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.el-select .el-tag')).map((n) => (n.textContent || '').trim()),
    );
    expect(tags.join('|')).toContain('标签一');
    await page.close();
  }, 90000);

  it('element-plus 单选回归：普通下拉仍由 select 成功且弹层收起', async () => {
    const page = await fixturePage('element-plus.html');
    const r = await runChain(page, 'div.block:nth-of-type(1) .el-select', '上海');
    expect(r.winner).toBe('el-select');
    expect(await waitClosed(page, elementDropdownOpen)).toBe(true);
    await page.close();
  }, 90000);
});
