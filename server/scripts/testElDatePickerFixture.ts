/**
 * el-date-picker 插件 fixture 实测：element-plus / element-ui 的 datetime 形态，
 * date-only value 调 set_date，回读输入框值与 Vue v-model 值。
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_RUNTIME_SCRIPT = String.raw`(() => {
  if (window.__ttPluginRuntimeInstalled__) return;
  window.__ttPluginRuntimeInstalled__ = true;
  window.__ttPickWait = function (fn, timeout, interval) {
    return new Promise(function (resolve, reject) {
      const started = Date.now();
      const step = parseInt(interval, 10) > 0 ? parseInt(interval, 10) : 100;
      const t = setInterval(function () {
        let v = null;
        try { v = fn(); } catch (e) { v = null; }
        if (v) { clearInterval(t); resolve(v); return; }
        if (Date.now() - started > (parseInt(timeout, 10) || 5000)) { clearInterval(t); reject(new Error('等待超时')); }
      }, step);
    });
  };
  const plugins = [];
  const byId = new Map();
  const registry = {
    register(def) {
      try {
        if (!def || typeof def !== 'object' || !def.id || byId.has(def.id)) return;
        const p = { id: String(def.id), detect: typeof def.detect === 'function' ? def.detect : null, actions: def.actions && typeof def.actions === 'object' ? def.actions : {} };
        plugins.push(p); byId.set(def.id, p);
      } catch (e) { console.warn('[tt-plugin] register failed:', e); }
    },
    async invokeAction(pluginId, action, el, args) {
      const p = byId.get(pluginId);
      if (!p) return { status: 'failed', message: '插件未注入：' + pluginId };
      const def = p.actions ? p.actions[action] : null;
      const impl = typeof def === 'function' ? def : def && typeof def.fn === 'function' ? def.fn : null;
      if (!impl) return { status: 'failed', message: '插件 ' + pluginId + ' 未注册动作：' + action };
      let out;
      try {
        const raw = await impl(el, args);
        if (raw && typeof raw === 'object' && typeof raw.status === 'string') {
          const st = raw.status === 'success' || raw.status === 'failed' ? raw.status : 'uncertain';
          out = { status: st, message: raw.message == null ? '' : String(raw.message) };
        } else out = { status: 'success', message: raw == null ? '' : String(raw) };
      } catch (e) { return { status: 'failed', message: String((e && e.message) || e) }; }
      if (out.status === 'success' && def && typeof def === 'object' && typeof def.verify === 'function') {
        try { if (!(await def.verify(el, args))) out = { status: 'failed', message: out.message + '；动作后验未通过' }; }
        catch (ve) { out = { status: 'uncertain', message: out.message + '；后验异常：' + String((ve && ve.message) || ve) }; }
      }
      return out;
    },
  };
  window.__ttPluginRegistry__ = registry;
})();`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src', 'services', 'componentPlugins', 'sources');
const fixtureDir = path.join(__dirname, '..', 'tests', 'fixtures');
const value = process.argv[2] || '2026-06-03';

const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? '/').replace(/^\//, '')) || 'index.html';
  const file = path.join(fixtureDir, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

const browser = await chromium.launch({ headless: true });
try {
  for (const fixture of ['element-plus.html', 'element-ui.html']) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(PLUGIN_RUNTIME_SCRIPT);
    const code = fs.readFileSync(path.join(SRC, 'el-date-picker.js'), 'utf-8');
    await ctx.addInitScript(`window.__ttPluginId__ = "el-date-picker";`);
    await ctx.addInitScript(`window.__ttPluginRegistry__.register(Object.assign((\n${code}\n) || {}, { id: "el-date-picker" }));`);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`[${fixture}][pageerror]`, String(e).slice(0, 160)));
    await page.goto(`${base}/${fixture}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const result = await page.evaluate(async ({ value }: any) => {
      const reg = (window as any).__ttPluginRegistry__;
      const target = Array.from(document.querySelectorAll('.el-date-editor')).find((e) => (e.querySelector('input')?.placeholder || '').includes('日期时间')) || null;
      if (!target) return { status: 'failed', message: '未找到 datetime 编辑器' };
      const input = target.querySelector('input');
      const before = input?.value || '';
      const r = await reg.invokeAction('el-date-picker', 'set_date', target, { value });
      return { before, ...r, inputValue: input?.value };
    }, { value });
    console.log(`\n[${fixture}] 全新设置 value=${value} →`, JSON.stringify(result, null, 2));

    // 覆盖场景：预置非零时间（真实 fill 完整格式），再以 date-only 覆盖，期望时间被重置为 00:00:00
    const editor = page.locator('.el-date-editor input[placeholder="选择日期时间"]').first();
    await editor.fill('2026-07-04 08:30:00');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const result2 = await page.evaluate(async ({ value }: any) => {
      const reg = (window as any).__ttPluginRegistry__;
      const editors = Array.from(document.querySelectorAll('.el-date-editor'));
      const target = editors.find((e) => (e.querySelector('input')?.placeholder || '').includes('日期时间'));
      const input = target?.querySelector('input');
      const r = await reg.invokeAction('el-date-picker', 'set_date', target, { value });
      return { ...r, inputValue: input?.value };
    }, { value });
    console.log(`[${fixture}] 覆盖(预置08:30:00) value=${value} →`, JSON.stringify(result2, null, 2));
    await ctx.close();
  }
} catch (e) {
  console.error('失败：', e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
