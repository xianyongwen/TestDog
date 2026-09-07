/**
 * 插件离线验证 harness（自包含 CLI）——脱离测试平台单独验证插件。
 * 仅依赖 playwright + Node 标准库，可整文件复制到你自己的项目：
 *   npm i -D playwright && npx playwright install chromium
 *   npx tsx pluginHarness.ts element-plus ./my-plugin.js --probe
 * 页面来源：<fixture名|url>；fixture 快捷名自动 serve tests/fixtures/（内置静态服务器，
 * 规避 file:// 的 CDN 模块加载限制）；--list 列出可用页面；--probe 追加标注与动作清单；
 * --hold 报告后保持浏览器打开（在页面控制台用 window.__ttPluginRegistry__.invokeAction
 * 自测动作，回车或关闭浏览器窗口结束）；--json out.json 另存报告。验收标准：目标组件候选中存在 count===1（页内唯一）的条目，
 * 且 --probe 下 actions 清单包含预期动作。
 * 注意：内嵌 polyfill 与平台 src/services/pluginRuntime.ts 的 PLUGIN_RUNTIME_SCRIPT 保持同步；
 * Playwright 桥（插件动作第三参 pw）引用同目录 pluginPwBridge.ts——单独复制本文件时需一并复制。
 */
import { chromium } from 'playwright';
import { installPluginPwBridge } from './pluginPwBridge';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// —— 内嵌 polyfill（与 PLUGIN_RUNTIME_SCRIPT 同步维护）——
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
        const p = {
          id: String(def.id),
          detect: typeof def.detect === 'function' ? def.detect : null,
          candidates: typeof def.candidates === 'function' ? def.candidates : null,
          annotate: typeof def.annotate === 'function' ? def.annotate : null,
          actions: def.actions && typeof def.actions === 'object' ? def.actions : {},
        };
        plugins.push(p);
        byId.set(def.id, p);
      } catch (e) { console.warn('[tt-plugin] register failed:', def && def.id, e); }
    },
    detectAll(el) {
      const hits = [];
      for (const p of plugins) {
        if (!p.detect) continue;
        try { const r = p.detect(el); if (r) hits.push({ id: p.id, version: r && typeof r === 'object' ? r.version : undefined }); } catch (e) {}
      }
      return hits;
    },
    candidatesFor(el) {
      const out = [];
      for (const p of plugins) {
        if (!p.candidates) continue;
        try {
          const cs = p.candidates(el);
          if (Array.isArray(cs)) for (const c of cs) if (c && c.strategy && typeof c.value === 'string') out.push(Object.assign({}, c, { pluginId: p.id }));
        } catch (e) {}
      }
      return out;
    },
    annotateFor(el) {
      const parts = [];
      for (const p of plugins) {
        if (!p.annotate) continue;
        try { const t = p.annotate(el); if (t) parts.push('[' + p.id + '] ' + t); } catch (e) {}
      }
      return parts.join(' ');
    },
    resolveChain(el, action) {
      const out = [];
      if (!action || typeof action !== 'string') return out;
      for (const p of plugins) {
        if (!p.detect) continue;
        const def = p.actions ? p.actions[action] : null;
        const hasFn = typeof def === 'function' || (def && typeof def.fn === 'function');
        if (!hasFn) continue;
        try {
          const r = p.detect(el);
          if (r === true || (r && typeof r === 'object' && r.matched)) out.push({ id: p.id, variant: r && typeof r === 'object' ? r.variant : undefined });
        } catch (e) {}
      }
      return out;
    },
    async invokeAction(pluginId, action, el, args) {
      const p = byId.get(pluginId);
      if (!p) return { status: 'failed', message: '插件未注入：' + pluginId };
      const def = p.actions ? p.actions[action] : null;
      const impl = typeof def === 'function' ? def : def && typeof def.fn === 'function' ? def.fn : null;
      if (!impl) return { status: 'failed', message: '插件 ' + pluginId + ' 未注册动作：' + action };
      let out;
      try {
        const raw = await impl(el, args, window.__ttPw);
        if (raw && typeof raw === 'object' && typeof raw.status === 'string') {
          const st = raw.status === 'success' || raw.status === 'failed' ? raw.status : 'uncertain';
          out = { status: st, message: raw.message == null ? '' : String(raw.message) };
        } else {
          out = { status: 'success', message: raw == null ? '' : String(raw) };
        }
      } catch (e) {
        return { status: 'failed', message: String((e && e.message) || e) };
      }
      if (out.status === 'success' && def && typeof def === 'object' && typeof def.verify === 'function') {
        try {
          if (!(await def.verify(el, args, window.__ttPw))) out = { status: 'failed', message: (out.message ? out.message + '；' : '') + '动作后验未通过（终态与预期不符）' };
        } catch (ve) {
          out = { status: 'uncertain', message: (out.message ? out.message + '；' : '') + '后验执行异常：' + String((ve && ve.message) || ve) };
        }
      }
      return out;
    },
    listActions() {
      const out = [];
      for (const p of plugins) {
        const names = p.actions ? Object.keys(p.actions) : [];
        if (!names.length) continue;
        const metas = names.map(function (name) {
          const def = p.actions ? p.actions[name] : null;
          if (!def || typeof def !== 'object') return { name: name };
          const meta = { name: name };
          if (typeof def.doc === 'string' && def.doc) meta.doc = def.doc;
          if (typeof def.label === 'string' && def.label) meta.label = def.label;
          if (def.preferFill) meta.preferFill = true;
          return meta;
        });
        out.push({ id: p.id, actions: metas });
      }
      return out;
    },
    count() { return plugins.length; },
  };
  window.__ttPluginRegistry__ = registry;
  // —— Playwright 桥（页内代理）：与 Node 侧 pluginPwBridge.ts 的绑定配对（与平台 pluginRuntime.ts 同步维护）——
  function __ttPwIsHandle(r) {
    return !!(r && typeof r === 'object' && typeof r.__ttHandle === 'number');
  }
  // 句柄的「就绪视图」：可继续链式调用；刻意不响应 then/catch/finally——Promise 适配
  // 以「结果是否 thenable」终止，若把节点本身作为 fulfillment 值会被再次适配，
  // 每次又产出新节点 → 微任务无限递归（页面假死）。await 视图得到视图自身。
  function __ttPwHandleView(r) {
    return new Proxy({}, {
      get(t, prop) {
        if (typeof prop !== 'string' || prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
        return __ttPwNode(Promise.resolve(r), [prop], Promise.resolve(r));
      },
    });
  }
  function __ttPwNode(wire, path, baseWire) {
    const fn = function (...args) {
      let exec;
      if (!path.length && args.length === 1 && args[0] instanceof Element) {
        if (typeof window.__ttPwRpc !== 'function') throw new Error('Playwright 桥未注入（__ttPwRpc 缺失）：pw 仅在平台外壳（生成/回放/插件试运行/harness）内可用');
        const token = 'ttpw' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        try {
          args[0].setAttribute('data-__tt-pw', token);
        } catch (e) {
          throw new Error('pw(el) 元素注册失败：元素不支持打标（须为主 frame 内的 Element）');
        }
        exec = window.__ttPwRpc({ elToken: token });
      } else {
        exec = (async function () {
          let bid = null;
          if (baseWire) {
            const b = await baseWire;
            if (b !== undefined) {
              if (__ttPwIsHandle(b)) bid = b.__ttHandle;
              else throw new Error('pw 链式调用中断：前一步返回的是原始值/纯对象，其上无法继续链式调用方法');
            }
          }
          if (typeof window.__ttPwRpc !== 'function') throw new Error('Playwright 桥未注入（__ttPwRpc 缺失）：pw 仅在平台外壳（生成/回放/插件试运行/harness）内可用');
          return window.__ttPwRpc({ p: path, a: args, b: bid });
        })();
      }
      return __ttPwNode(exec, [], exec);
    };
    return new Proxy(fn, {
      get(target, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'then') {
          return function (res, rej) {
            return Promise.resolve(wire).then(function (r) {
              return __ttPwIsHandle(r) ? __ttPwHandleView(r) : r;
            }).then(res, rej);
          };
        }
        if (prop === 'catch') return function (rej) { return Promise.resolve(wire).catch(rej); };
        if (prop === 'finally') return function (f) { return Promise.resolve(wire).finally(f); };
        if (prop === 'toJSON') return undefined;
        return __ttPwNode(wire, path.concat(prop), baseWire);
      },
    });
  }
  window.__ttPw = __ttPwNode(Promise.resolve(undefined), [], Promise.resolve(undefined));
})();`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function fixturesDir(): string {
  const candidates = [path.join(process.cwd(), 'tests', 'fixtures'), path.join(__dirname, '..', 'tests', 'fixtures')];
  return candidates.find((d) => fs.existsSync(d)) ?? candidates[0];
}
function listFixtures(): string[] {
  const dir = fixturesDir();
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort() : [];
}
function serveFixtures(dir: string): Promise<{ url: string; close: () => void }> {
  const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url ?? '/').replace(/^\//, '')) || 'index.html';
      const file = path.join(dir, rel);
      if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

const args = process.argv.slice(2);
const probe = args.includes('--probe');
const hold = args.includes('--hold');
const unknownFlags = args.filter((a) => a.startsWith('--') && !['--probe', '--hold', '--json', '--list'].includes(a));
if (unknownFlags.length) console.warn(`⚠️ 忽略未知选项：${unknownFlags.join(' ')}（若是你期望生效的选项，说明本 harness 副本过旧，请重新下载模板/技能包）`);
if (args.includes('--list')) {
  console.log('可用 fixture 页面：', listFixtures().join(', ') || '（未找到 tests/fixtures）');
  process.exit(0);
}
const [target, pluginPath] = args.filter((a) => !a.startsWith('--'));
if (!target || !pluginPath) {
  console.log('用法：npx tsx pluginHarness.ts <fixture名|url> <plugin.js> [--probe] [--hold] [--json out.json]\n      npx tsx pluginHarness.ts --list');
  process.exit(1);
}
const pluginFile = path.resolve(pluginPath);
if (!fs.existsSync(pluginFile)) { console.error(`插件文件不存在：${pluginFile}`); process.exit(1); }
if (pluginFile.toLowerCase().endsWith('.zip')) { console.error('离线模式请直接使用入口 .js 文件（zip 请先解包）'); process.exit(1); }
const pluginCode = fs.readFileSync(pluginFile, 'utf-8');

let closeServer: (() => void) | null = null;
let url: string;
if (/^https?:\/\//.test(target)) {
  url = target;
} else {
  const name = target.endsWith('.html') ? target : `${target}.html`;
  const dir = fixturesDir();
  if (!fs.existsSync(path.join(dir, name))) { console.error(`fixture 不存在：${name}（可用：${listFixtures().join(', ') || '无'}）`); process.exit(1); }
  const served = await serveFixtures(dir);
  closeServer = served.close;
  url = `${served.url}/${name}`;
}

const browser = await chromium.launch({ headless: false });
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  // Playwright 桥（Node 侧绑定）：--hold 控制台自测或动作内 pw.* 均可调真实 Playwright API
  await installPluginPwBridge(page);
  await page.addInitScript(PLUGIN_RUNTIME_SCRIPT);
  // 与平台一致：注入前写入 window.__ttPluginId__（harness 下取插件文件名去扩展名）
  const idLiteral = JSON.stringify(path.basename(pluginFile).replace(/\.[^.]+$/, ''));
  await page.addInitScript(`window.__ttPluginId__ = ${idLiteral};`);
  // 与平台 buildPluginInitScript 一致：源码约定为求值「插件定义对象」的表达式，
  // harness 封装 register 并注入 id（平台注入时同样如此）
  await page.addInitScript(
    `window.__ttPluginRegistry__.register(Object.assign((\n${pluginCode}\n) || {}, { id: ${idLiteral} }));`,
  );
  await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const report = await page.evaluate((probe: boolean) => {
    const reg = (globalThis as any).__ttPluginRegistry__;
    if (!reg) return { error: '运行时未注入（polyfill 缺失？）' } as any;
    const els = Array.from(document.body ? document.body.querySelectorAll('*') : []).slice(0, 3000);
    const rows: { tag: string; cls: string; uniqueCount: number; candidates: string }[] = [];
    let detectCount = 0;
    let candidatesTotal = 0;
    let uniqueTotal = 0;
    for (const el of els) {
      if (!reg.detectAll(el).length) continue;
      detectCount++;
      const cs = reg.candidatesFor(el);
      if (!cs.length) continue;
      candidatesTotal += cs.length;
      const info = cs.map((c: any) => {
        let count = -1;
        try {
          if (c.strategy === 'css') count = document.querySelectorAll(c.value).length;
          else if (c.strategy === 'testid') count = document.querySelectorAll(`[data-testid="${c.value}"]`).length;
          else if (c.strategy === 'placeholder') count = document.querySelectorAll(`[placeholder="${c.value}"]`).length;
          else if (c.strategy === 'title') count = document.querySelectorAll(`[title="${c.value}"]`).length;
        } catch { /* 忽略 */ }
        return `${c.strategy}=${String(c.value).slice(0, 60)}${count >= 0 ? (count === 1 ? ' ✓唯一' : ` ✗${count}处`) : ' ?'}`;
      });
      const uniq = info.filter((s: string) => s.includes('✓唯一')).length;
      uniqueTotal += uniq;
      rows.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').split(' ').slice(0, 3).join('.').slice(0, 50), uniqueCount: uniq, candidates: info.join('  |  ') });
    }
    const actions = reg.listActions();
    const annotations = probe ? rows.slice(0, 10).map((r) => r.candidates) : undefined;
    return { url: location.href, detectCount, candidatesTotal, uniqueTotal, actions, rows, annotations } as any;
  }, probe);

  console.log('\n===== 插件验证报告 =====');
  console.log(`页面：${report.url ?? url}`);
  console.log(`detect 命中元素：${report.detectCount} | 候选总数：${report.candidatesTotal} | 页内唯一候选：${report.uniqueTotal}`);
  console.log(`已注册动作：${JSON.stringify(report.actions)}`);
  if (report.rows?.length) console.table(report.rows.slice(0, 40));
  const ok = report.uniqueTotal > 0;
  console.log(ok ? '\n✅ 验收通过：存在页内唯一的候选定位器' : '\n⚠️ 验收未通过：没有任何页内唯一的候选（请增强 candidates 精确度）');
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
  if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2)); console.log(`报告已写入：${jsonOut}`); }
  if (!ok) process.exitCode = 2;
  if (hold) {
    console.log('\n浏览器保持打开中——可在页面控制台自测动作，例如：\n  await window.__ttPluginRegistry__.invokeAction("<插件id>", "<动作名>", document.querySelector("<组件选择器>"), { value: "…" })\n动作内用的 Playwright 桥在控制台同样可用，例如：\n  await window.__ttPw.page.title()\n按回车或关闭浏览器窗口结束…');
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      browser.on('disconnected', finish);
      if (process.stdin.isTTY) { process.stdin.resume(); process.stdin.once('data', finish); }
    });
    process.stdin.pause();
  }
} catch (e) {
  console.error('验证失败：', e);
  process.exitCode = 1;
} finally {
  try { await browser.close(); } catch { /* 忽略 */ }
  closeServer?.();
}
