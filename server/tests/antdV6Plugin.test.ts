import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { browserLaunchOptions } from '../src/browser';
import { buildPluginInitScript } from '../src/services/pluginRuntime';
import { BUILTIN_PLUGIN_DEFS } from '../src/services/componentPlugins/builtin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

// antd v5/v6 双版本回归：v6 重构了 Select 触发器 DOM（无 .ant-select-selector、回显改
// .ant-select-content），曾致 verify 后验永远失败、select 动作整链失败（生成记录
// cmtpw2omm000ionbwwnobmutg）。本文件用 antd@6.4.5 CDN fixture 锁定 v6 行为，v5 由
// antd.html 各既有测试覆盖。
const ENTRY_ORDER = ['ant-select', 'ant-tree-select'];
const PLUGIN_DEFS = ENTRY_ORDER.map((n) => BUILTIN_PLUGIN_DEFS.find((d) => d.name === n)!);
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
        return { winner: hit.id, status: r.status, message: r.message, attempted };
      }
      last = r.message;
    }
    return { winner: null, status: 'failed', message: last, attempted };
  }, [triggerCss, value] as any) as Promise<ChainResult>;
}

/** v6 选中回显读值（与插件 verify 同款双类名口径）：
 *  单选为 .ant-select-content（-has-value），多选 tag 仍为 .ant-select-selection-item。
 *  注意 antd v6 的 id 落在触发器 input 上，须经 closest 爬到 .ant-select 根再查回显。 */
function displayOf(page: Page, css: string): Promise<string> {
  return page.evaluate((sel: any) => {
    const el = document.querySelector(sel as string);
    const root = el?.closest('.ant-select');
    const v = root?.querySelector('.ant-select-selection-item, .ant-select-content.ant-select-content-has-value');
    return (v?.textContent ?? '').trim();
  }, css) as Promise<string>;
}

/** 与插件同款合成事件打开指定触发器的弹层并保持展开（制造他人残留弹层）。 */
async function openPopupAndLeave(page: Page, triggerCss: string) {
  await page.evaluate((css: any) => {
    const editor = document.querySelector(css as string)!.closest('.ant-select');
    const selectorEl = (editor!.querySelector('.ant-select-selector') || editor) as HTMLElement;
    selectorEl!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selectorEl!.click();
  }, triggerCss);
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item', { timeout: 8000 });
}

describe('ant 系内置插件在 antd v6 下（触发器 DOM 重构回归）', () => {
  it('v6 单选：select 动作成功且 verify 后验通过', async () => {
    const page = await fixturePage('antd-v6.html');
    const r = await runChain(page, '#citySelect', '上海');
    expect(r.attempted).toEqual(['ant-select']);
    expect(r.winner).toBe('ant-select');
    expect(r.status).toBe('success');
    expect(await displayOf(page, '#citySelect')).toBe('上海');
    await page.close();
  }, 90000);

  it('v6 他人弹层残留：归属校验先收起再打开，值落到正确字段', async () => {
    const page = await fixturePage('antd-v6.html');
    // 打开第一字段（城市）的弹层并残留（复现生成记录中「规模弹层未关，状态下拉读到规模选项」的链路）
    await openPopupAndLeave(page, '#citySelect');
    // 对第二字段（规模）发起 select：旧逻辑会复用城市弹层并报「中型未找到（当前可选：城市列表）」
    const r = await runChain(page, '#sizeSelect', '中型');
    expect(r.winner).toBe('ant-select');
    expect(r.status).toBe('success');
    expect(await displayOf(page, '#sizeSelect')).toBe('中型');
    // 城市字段未被误选
    expect(await displayOf(page, '#citySelect')).toBe('');
    await page.close();
  }, 90000);

  it('v6 多选：选中后收起弹层，verify 通过', async () => {
    const page = await fixturePage('antd-v6.html');
    const r = await runChain(page, '#multiTagSelect', '标签二');
    expect(r.winner).toBe('ant-select');
    expect(r.status).toBe('success');
    const display = await displayOf(page, '#multiTagSelect');
    expect(display).toContain('标签二');
    await page.close();
  }, 90000);

  it('v6 TreeSelect：ant-select 先试失败后由 ant-tree-select 兜底，verify 通过', async () => {
    const page = await fixturePage('antd-v6.html');
    const r = await runChain(page, '#deptTreeSelect', '研发部');
    expect(r.winner).toBe('ant-tree-select');
    expect(r.status).toBe('success');
    expect(await displayOf(page, '#deptTreeSelect')).toBe('研发部');
    await page.close();
  }, 90000);

  it('v6 annotate：当前值经 .ant-select-content 读出', async () => {
    const page = await fixturePage('antd-v6.html');
    await runChain(page, '#citySelect', '上海');
    const note = await page.evaluate(() => {
      const reg = (globalThis as any).__ttPluginRegistry__;
      const el = document.querySelector('#citySelect')!;
      return reg.annotateFor(el);
    });
    expect(note).toContain('当前值: 上海');
    await page.close();
  }, 90000);
});

describe('ant-select 残留弹层归属校验在 antd v5 下（同机制回归）', () => {
  it('v5 他人弹层残留：归属触发器 toggle 收起后正常选择', async () => {
    const page = await fixturePage('antd.html');
    // 打开城市弹层并残留（fixture 无 Modal，clickoutside 亦应收起——两种收起路径都不得误选）
    await openPopupAndLeave(page, '#citySelect');
    const r = await runChain(page, '#sizeSelect', '中型');
    expect(r.winner).toBe('ant-select');
    expect(r.status).toBe('success');
    expect(await displayOf(page, '#sizeSelect')).toBe('中型');
    expect(await displayOf(page, '#citySelect')).toBe('');
    await page.close();
  }, 90000);
});
