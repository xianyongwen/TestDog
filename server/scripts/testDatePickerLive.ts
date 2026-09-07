/**
 * 一次性实测脚本（验证 ant-date-picker 插件「日期时间形态自动补 00:00:00」）：
 * 按生成记录 cmtma30mw000dlvbwil0frwoc 还原现场（智能体平台 / 创建服务商路由弹窗 / 失效时间字段），
 * 注入运行时 polyfill + 内置日期插件源码，登录后开弹窗，对失效时间 .ant-picker 调 set_date 并回读提交值。
 * 用法：npx tsx scripts/testDatePickerLive.ts [value]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// —— 内嵌 polyfill（与 pluginHarness.ts 保持同步）——
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
        const p = { id: String(def.id), detect: typeof def.detect === 'function' ? def.detect : null, annotate: typeof def.annotate === 'function' ? def.annotate : null, actions: def.actions && typeof def.actions === 'object' ? def.actions : {} };
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
const value = process.argv[2] || '2026-06-03';

const browser = await chromium.launch({ headless: false, slowMo: 200 });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(PLUGIN_RUNTIME_SCRIPT);
  for (const id of ['ant-date-picker', 'el-date-picker']) {
    const code = fs.readFileSync(path.join(SRC, `${id}.js`), 'utf-8');
    const idLiteral = JSON.stringify(id);
    await ctx.addInitScript(`window.__ttPluginId__ = ${idLiteral};`);
    await ctx.addInitScript(`window.__ttPluginRegistry__.register(Object.assign((\n${code}\n) || {}, { id: ${idLiteral} }));`);
  }
  // 登录态：LoginConfig cmse1hy970002onbwn7szklm6（localStorage token 注入）。
  // token 从环境变量读取并在 Node 侧拼成字面量——addInitScript 回调运行在浏览器，取不到 process.env
  const token = process.env.TT_DATEPICKER_TOKEN || '';
  await ctx.addInitScript(`(() => {
    try {
      localStorage.setItem('platform_isDark', 'false');
      localStorage.setItem('platform_isLogin', '1');
      localStorage.setItem('platform_UUR_INFO', '1');
      const token = ${JSON.stringify(token)};
      if (token) localStorage.setItem('platform_access_token', token);
      localStorage.setItem('platform_loginType', '');
    } catch { /* 忽略 */ }
  })();`);

  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto('http://192.168.4.17:3001/platform/manageapi', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // 诊断：页面状态 + 全部可见按钮文本
  await page.screenshot({ path: path.join(__dirname, 'tmp-datepicker-page.png') });
  const btns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a')).map((b) => (b.textContent || '').trim()).filter((t) => t && t.length < 20),
  );
  console.log('当前 URL：', page.url());
  console.log('可见按钮/链接：', JSON.stringify(btns.slice(0, 60)));

  // 开弹窗：点「创建」按钮（生成记录第 3 步的点击）
  const openBtn = page.locator('button', { hasText: /^创建$/ }).first();
  console.log('开弹窗按钮：', await openBtn.textContent().catch(() => '（未找到）'));
  await openBtn.click();
  await page.waitForTimeout(1500);

  // 找失效时间的 .ant-picker（弹窗内，form-item label 含「失效」）
  const info = await page.evaluate(() => {
    const out: any[] = [];
    for (const picker of Array.from(document.querySelectorAll('.ant-picker'))) {
      const item = picker.closest('.ant-form-item');
      const label = item ? (item.querySelector('.ant-form-item-label')?.textContent || '').trim() : '';
      out.push({ label, cls: picker.className.slice(0, 80), placeholder: picker.querySelector('input')?.placeholder || '' });
    }
    return out;
  });
  console.log('页面 .ant-picker 清单：', JSON.stringify(info, null, 2));

  const handle = await page.evaluateHandle(() => {
    for (const picker of Array.from(document.querySelectorAll('.ant-picker'))) {
      const item = picker.closest('.ant-form-item');
      const label = item ? (item.querySelector('.ant-form-item-label')?.textContent || '').trim() : '';
      if (label.includes('失效')) return picker;
    }
    return document.querySelectorAll('.ant-picker')[document.querySelectorAll('.ant-picker').length - 1] || null;
  });
  const el = handle.asElement();
  if (!el) { console.log('未找到目标 picker'); process.exit(2); }

  // 面板形态预判：开面板看有无时间列（模拟诊断信息，随后由动作本体闭环）
  const before = await el.evaluate((n: any) => n.querySelector('input')?.value || '');
  console.log(`动作前输入框值：「${before}」`);

  console.log(`\n>>> invokeAction set_date value=${value}`);
  const result = await page.evaluate(async ({ value }: any) => {
    const reg = (window as any).__ttPluginRegistry__;
    let target: Element | null = null;
    for (const picker of Array.from(document.querySelectorAll('.ant-picker'))) {
      const item = picker.closest('.ant-form-item');
      const label = item ? (item.querySelector('.ant-form-item-label')?.textContent || '').trim() : '';
      if (label.includes('失效')) { target = picker as Element; break; }
    }
    if (!target) return { status: 'failed', message: '页面内未找到失效时间 picker' };
    const r = await reg.invokeAction('ant-date-picker', 'set_date', target, { value });
    const input = (target as HTMLElement).querySelector('input');
    return { ...r, inputValue: input ? input.value : null };
  }, { value });
  console.log('动作结果：', JSON.stringify(result, null, 2));

  // 覆盖场景：预置非零时间（真实 fill 完整格式+Enter），再以 date-only 覆盖，期望时间重置为 00:00:00
  const editorInput = page.locator('.ant-form-item').filter({ hasText: '失效时间' }).locator('.ant-picker input').first();
  await editorInput.fill('2026-10-04 08:30:00');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const result2 = await page.evaluate(async ({ value }: any) => {
    const reg = (window as any).__ttPluginRegistry__;
    let target: Element | null = null;
    for (const picker of Array.from(document.querySelectorAll('.ant-picker'))) {
      const item = picker.closest('.ant-form-item');
      const label = item ? (item.querySelector('.ant-form-item-label')?.textContent || '').trim() : '';
      if (label.includes('失效')) { target = picker as Element; break; }
    }
    if (!target) return { status: 'failed', message: '页面内未找到失效时间 picker' };
    const input = (target as HTMLElement).querySelector('input');
    const r = await reg.invokeAction('ant-date-picker', 'set_date', target, { value });
    return { ...r, inputValue: input ? input.value : null };
  }, { value: '2026-10-05' });
  console.log('覆盖(预置08:30:00) 结果：', JSON.stringify(result2, null, 2));

  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'tmp-datepicker-result.png'), fullPage: false });
  console.log('截图：tmp-datepicker-result.png');
  await page.waitForTimeout(2000);
} catch (e) {
  console.error('失败：', e);
  process.exitCode = 1;
} finally {
  try { await browser.close(); } catch { /* 忽略 */ }
}
