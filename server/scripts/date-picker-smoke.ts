/**
 * 日期选择插件冒烟（真实浏览器）：对内置 ant/el 日期插件跑「纯日期 + 日期时间」双形态，
 * 覆盖三类链路——插件面板路径（invokeAction）、页内后验（invokeVerify）、
 * fill 优先路径的失败拦截与自愈（fill 只填日期到日期时间控件 → verify 必须判 false → 动作本体恢复成功）。
 * 页面为 tests/fixtures/*.html（CDN 资源需联网）。
 * 用法：npx tsx scripts/date-picker-smoke.ts（--keep 结束后不关浏览器便于排查）
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildPluginInitScript } from '../src/services/pluginRuntime';

const FIXTURES = path.resolve(process.cwd(), 'tests', 'fixtures');
const SOURCES = path.resolve(process.cwd(), 'src', 'services', 'componentPlugins', 'sources');
const DATE = '2026-12-31';

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve(dir: string): Promise<{ base: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const name = decodeURIComponent((req.url || '/').split('?')[0].replace(/^\//, '')) || 'antd.html';
      try {
        const data = fs.readFileSync(path.join(dir, name));
        res.writeHead(200, { 'content-type': MIME[path.extname(name)] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve({ base: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

const initScript = buildPluginInitScript([
  { id: 'ant-date-picker', code: fs.readFileSync(path.join(SOURCES, 'ant-date-picker.js'), 'utf-8') },
  { id: 'el-date-picker', code: fs.readFileSync(path.join(SOURCES, 'el-date-picker.js'), 'utf-8') },
]);

/** 正例：插件动作本体 + 后验 + 终值复核 + 面板已关 */
async function casePanelPath(
  page: any,
  base: string,
  c: { label: string; fixture: string; target: string; pid: string },
): Promise<void> {
  await page.goto(`${base}/${c.fixture}`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const el = await page.$(c.target);
  if (!el) throw new Error(`${c.label}: 定位器未命中 ${c.target}`);

  const res = await page.evaluate(
    ([pid, handle, args]: any[]) => (globalThis as any).__ttPluginRegistry__.invokeAction(pid, 'set_date', handle, args),
    [c.pid, el, { value: DATE }],
  );
  if (res.status !== 'success') throw new Error(`${c.label}: 动作未成功 → ${res.message}`);
  const ok = await page.evaluate(
    ([pid, handle, args]: any[]) => (globalThis as any).__ttPluginRegistry__.invokeVerify(pid, 'set_date', handle, args),
    [c.pid, el, { value: DATE }],
  );
  if (ok !== true) throw new Error(`${c.label}: 后验未通过`);
  const shown = await page.$eval(c.target, (i: HTMLInputElement) => i.value || '');
  const m = shown.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m || Number(m[1]) !== 2026 || Number(m[2]) !== 12 || Number(m[3]) !== 31) {
    throw new Error(`${c.label}: 终值不符 → "${shown}"`);
  }
  // 注意：evaluate 回调会被序列化进浏览器执行——内部不能引用 tsx keep-names 注入的 __name
  //（具名 const 箭头会被包装），此处一律内联匿名箭头。判定口径与插件 panelVisible 一致（含 aria-hidden）。
  const panelsOpen = await page.evaluate(() => ({
    antOpen: [...document.querySelectorAll('.ant-picker-dropdown')].filter((d) => d.getClientRects().length > 0 && !d.classList.contains('ant-picker-dropdown-hidden')).length > 0,
    elOpen: [...document.querySelectorAll('.el-picker-panel')].filter((p) => !(p.closest('.el-popper, .el-picker__popper')?.getAttribute('aria-hidden') === 'true') && p.getClientRects().length > 0).length > 0,
  }));
  if (panelsOpen.antOpen || panelsOpen.elOpen) throw new Error(`${c.label}: 面板未关闭 ${JSON.stringify(panelsOpen)}`);
  console.log(`PASS  ${c.label}（${res.message}）`);
}

/** fill 优先路径：只填日期到日期时间控件 → 后验必须判 false（面板未关/未提交）→ 动作本体自愈成功 */
async function caseFillThenRecover(
  page: any,
  base: string,
  c: { label: string; fixture: string; target: string; pid: string },
): Promise<void> {
  await page.goto(`${base}/${c.fixture}`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.fill(c.target, DATE);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);

  const el = await page.$(c.target);
  const verifyAfterFill = await page.evaluate(
    ([pid, handle, args]: any[]) => (globalThis as any).__ttPluginRegistry__.invokeVerify(pid, 'set_date', handle, args),
    [c.pid, el, { value: DATE }],
  );
  if (verifyAfterFill !== false) throw new Error(`${c.label}: fill 后验应判 false（未提交），实得 ${verifyAfterFill}`);

  const res = await page.evaluate(
    ([pid, handle, args]: any[]) => (globalThis as any).__ttPluginRegistry__.invokeAction(pid, 'set_date', handle, args),
    [c.pid, el, { value: DATE }],
  );
  if (res.status !== 'success') throw new Error(`${c.label}: 自愈动作未成功 → ${res.message}`);
  const ok = await page.evaluate(
    ([pid, handle, args]: any[]) => (globalThis as any).__ttPluginRegistry__.invokeVerify(pid, 'set_date', handle, args),
    [c.pid, el, { value: DATE }],
  );
  if (ok !== true) throw new Error(`${c.label}: 自愈后验未通过`);
  console.log(`PASS  ${c.label}（fill 后验拦截 → 动作自愈成功）`);
}

async function main(): Promise<void> {
  const { base, close } = await serve(FIXTURES);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(initScript);

  const failures: string[] = [];
  const run = async (fn: (page: any) => Promise<void>, name: string) => {
    const page = await context.newPage();
    try {
      await fn(page);
    } catch (e) {
      failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await page.close().catch(() => {});
    }
  };

  // 面板路径：纯日期 + 日期时间，三套组件库（antd 的 id 直接落在 input 上）
  await run((p) => casePanelPath(p, base, { label: 'antd 纯日期', fixture: 'antd.html', target: '#datePicker', pid: 'ant-date-picker' }), 'antd 纯日期');
  await run((p) => casePanelPath(p, base, { label: 'antd 日期时间(showTime)', fixture: 'antd.html', target: '#dateTimePicker', pid: 'ant-date-picker' }), 'antd 日期时间(showTime)');
  await run((p) => casePanelPath(p, base, { label: 'element-plus 纯日期', fixture: 'element-plus.html', target: '.el-date-editor--date input', pid: 'el-date-picker' }), 'element-plus 纯日期');
  await run((p) => casePanelPath(p, base, { label: 'element-plus 日期时间(datetime)', fixture: 'element-plus.html', target: '.el-date-editor--datetime input', pid: 'el-date-picker' }), 'element-plus 日期时间(datetime)');
  await run((p) => casePanelPath(p, base, { label: 'element-ui 纯日期', fixture: 'element-ui.html', target: '.el-date-editor--date input', pid: 'el-date-picker' }), 'element-ui 纯日期');
  await run((p) => casePanelPath(p, base, { label: 'element-ui 日期时间(datetime)', fixture: 'element-ui.html', target: '.el-date-editor--datetime input', pid: 'el-date-picker' }), 'element-ui 日期时间(datetime)');

  // fill 优先路径拦截 + 自愈（本次事故场景）
  await run((p) => caseFillThenRecover(p, base, { label: 'antd 日期时间 fill 拦截+自愈', fixture: 'antd.html', target: '#dateTimePicker', pid: 'ant-date-picker' }), 'antd 日期时间 fill 拦截+自愈');
  await run((p) => caseFillThenRecover(p, base, { label: 'element-plus 日期时间 fill 拦截+自愈', fixture: 'element-plus.html', target: '.el-date-editor--datetime input', pid: 'el-date-picker' }), 'element-plus 日期时间 fill 拦截+自愈');

  await browser.close();
  close();
  console.log(failures.length ? `\n${failures.length} 项失败` : '\n全部通过');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
