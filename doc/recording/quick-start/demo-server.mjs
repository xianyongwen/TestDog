#!/usr/bin/env node
// 45s 演示视频录制用 demo 服务器：静态伺服 doc/docs/public/demo/，
// 并提供内存态版本接口 /__demo/version（模拟改版状态由服务端记忆，
// 这样录制浏览器、回放时全新 profile 的浏览器都能读到同一版本）。
//
// 用法：node doc/recording/quick-start/demo-server.mjs
// 页面：http://localhost:4173/demo/order-admin/
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(__dirname, '../../docs/public/demo');
const PORT = Number(process.env.PORT || 4173);

// 版本状态：默认 v1。POST /__demo/version {"version":2} 切到 v2。
let version = 1;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}

function serveStatic(res, urlPath) {
  // 路径清洗：限制在 DEMO_DIR 内；目录请求回退 index.html
  const rel = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(DEMO_DIR, rel);
  if (!file.startsWith(DEMO_DIR)) return send(res, 403, 'forbidden');
  if (!path.extname(file)) file = path.join(file, 'index.html');
  const ext = path.extname(file).toLowerCase();
  readFile(file)
    .then((buf) => send(res, 200, buf, { 'content-type': MIME[ext] || 'application/octet-stream' }))
    .catch(() => send(res, 404, 'not found: ' + urlPath));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/__demo/version') {
    if (req.method === 'GET') {
      return send(res, 200, JSON.stringify({ version }));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const j = JSON.parse(body || '{}');
          version = j.version === 2 ? 2 : 1;
          console.log(`[demo] 版本已切换 -> v${version}`);
          send(res, 200, JSON.stringify({ version }));
        } catch {
          send(res, 400, JSON.stringify({ error: 'bad json' }));
        }
      });
      return;
    }
    return send(res, 405, 'method not allowed');
  }

  if (url.pathname === '/' || url.pathname === '/demo') {
    res.writeHead(302, { location: '/demo/order-admin/' });
    return res.end();
  }
  // URL /demo/<rest> 映射到 DEMO_DIR/<rest>
  const rest = url.pathname.startsWith('/demo/') ? url.pathname.slice('/demo/'.length) : url.pathname;
  serveStatic(res, rest === '' ? '/' : rest);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[demo] 已启动: http://localhost:${PORT}/demo/order-admin/`);
  console.log(`[demo] 版本接口: GET/POST http://localhost:${PORT}/__demo/version (当前 v${version})`);
});
