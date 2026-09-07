#!/usr/bin/env node
/**
 * 打包前准备 Tauri sidecar 资源到 src-tauri/resources/：
 *   resources/
 *     node(.exe)        # 随包的 node 运行时（本机架构；Windows 为 node.exe）
 *     app.db.template      # 带表结构、无数据的 SQLite 模板
 *     server/
 *       index.js           # tsup 打包的后端单文件
 *       package.json
 *       node_modules/      # 生产依赖（裁剪掉 devDeps，保留 better-sqlite3 原生构建产物）
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'server');
const resDir = path.join(root, 'src-tauri', 'resources');
const resServerDir = path.join(resDir, 'server');
const stagingDir = path.join(root, '.sidecar-staging');

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}
// Windows 上杀软/索引器常对大型 node_modules 树瞬时加锁，rmSync 默认不重试
// EPERM（maxRetries=0）会直接失败；加退避重试让递归删除更稳。
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 });

/** 递归计算目录总字节数（跨平台替代 `du -sh`）。 */
function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(p);
    else {
      try { total += fs.statSync(p).size; } catch { /* 忽略软链断开等 */ }
    }
  }
  return total;
}

// 1. 重新生成 Prisma 客户端，再打包后端单文件
//    tsup 把 generated/prisma 内联进 bundle：若客户端是旧的（schema 改后没重跑 generate），
//    bundle 运行时会因 schema 元数据缺字段而报 "Unknown field xxx"（如 loginConfigs）。
console.log('\n--- [1/5] 生成 Prisma 客户端 + 打包后端 (tsup) ---');
run('npm run prisma:generate', { cwd: serverDir });
run('npm run build', { cwd: serverDir });

// 2. 准备 resources 目录骨架
console.log('\n--- [2/5] 准备 resources 目录 ---');
rmrf(resDir);
rmrf(stagingDir);
fs.mkdirSync(resServerDir, { recursive: true });
fs.copyFileSync(path.join(serverDir, 'dist', 'index.js'), path.join(resServerDir, 'index.js'));
fs.copyFileSync(path.join(serverDir, 'package.json'), path.join(resServerDir, 'package.json'));
// 内置插件源码：builtin.ts 运行时按「本模块目录/sources」读取，tsup 已拷到 dist/sources，
// 须随产物分发（缺失会导致启动 seed 时「内置插件源码缺失」报错）
fs.cpSync(path.join(serverDir, 'dist', 'sources'), path.join(resServerDir, 'sources'), { recursive: true });

// 3. 暂存并裁剪生产 node_modules（保留原生构建产物，删除 devDeps）
console.log('\n--- [3/5] 裁剪生产 node_modules ---');
const stageServer = path.join(stagingDir, 'server');
fs.mkdirSync(stageServer, { recursive: true });
// 暂存用的 package.json：与 server/package.json 一致（未使用的依赖已从源头移除）
const stagePkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf-8'));
fs.writeFileSync(path.join(stageServer, 'package.json'), JSON.stringify(stagePkg, null, 2));
fs.copyFileSync(path.join(serverDir, 'package-lock.json'), path.join(stageServer, 'package-lock.json'));
// 把 server/.npmrc（legacy-peer-deps=true）也带进 staging：否则 npm prune 会用
// 默认严格 peer 解析，@langchain/community@1.1.29（peer stagehand ^1.0.0）与
// 项目实际装的 stagehand 4.0.0 冲突，ERESOLVE 直接失败 -> 走 catch 保留完整
// node_modules -> devDeps 全部被打进包（体积膨胀约 200MB）。
const serverNpmrc = path.join(serverDir, '.npmrc');
if (fs.existsSync(serverNpmrc)) {
  fs.copyFileSync(serverNpmrc, path.join(stageServer, '.npmrc'));
}
// 忠实复制现有 node_modules（保留 better-sqlite3 等已编译的原生模块）
// 用 fs.cpSync 而非 cp -R，跨平台（Windows 无 cp）
fs.cpSync(path.join(serverDir, 'node_modules'), path.join(stageServer, 'node_modules'), { recursive: true });
// 裁剪 devDeps：仅删除非生产包，不重装/不触碰原生二进制
try {
  run('npm prune --production --no-audit --no-fund', { cwd: stageServer });
} catch (e) {
  console.warn('npm prune 失败，保留完整 node_modules：', e.message);
}
// 移到 resources
rmrf(path.join(resServerDir, 'node_modules'));
fs.renameSync(path.join(stageServer, 'node_modules'), path.join(resServerDir, 'node_modules'));
// .bin 全是相对软链，运行时用不到（后端直接调 node_modules/<pkg>）；移除以减小体积、避免打包软链问题
rmrf(path.join(resServerDir, 'node_modules', '.bin'));

// 3b. 清理运行时绝不加载的整包 + 非运行时文件。
//     背景：resources 体积曾达 551MB，`tauri build --bundles nsis` 报
//     `Internal compiler error #12345: error creating mmap the size of N`——makensis
//     要把整个数据块一次性 mmap，超 32 位 makensis 的连续地址空间上限。
//     npm prune --production 删不掉 prisma CLI / typescript（@prisma/client 把它们
//     声明为 optional peerDep），而 prisma CLI 又拉入 Prisma Studio
//     （@prisma/studio-core -> react-dom/chart.js/@radix-ui）、@prisma/engines
//     （schema-engine-*.exe，仅迁移用）等纯前端/开发工具。
//     后端走 driver-adapter（@prisma/adapter-better-sqlite3）+ WASM query compiler：
//     @prisma/client 运行时只 require @prisma/client-runtime-utils + node 内建模块，
//     index.js 外部依赖里也没有这些包，整棵 CLI/Studio/引擎树 + 类型声明文件运行时
//     用不到，安全删除（~200MB）。
//     另：附件服务已改为 pdf-parse@1（仅文本提取）+ mammoth，@langchain 全家桶、
//     js-tiktoken、langsmith、@napi-rs/canvas、pdfjs-dist 均不再安装；死名单里
//     仍保留它们，防止 lockfile 漂移/传递引入时悄悄膨胀。
console.log('\n--- [3b/5] 清理运行时无关依赖与文件 ---');
const nmDir = path.join(resServerDir, 'node_modules');
const deadPkgs = [
  'prisma',                                       // CLI（仅开发/迁移用）
  '@prisma/studio-core', '@prisma/dev',           // Prisma Studio（React 前端 UI）
  '@prisma/engines',                              // schema-engine-*.exe，仅迁移用
  '@prisma/query-plan-executor',                  // 仅 CLI/原生引擎路径用
  '@electric-sql/pglite', '@electric-sql/pglite-socket', '@electric-sql/pglite-tools',
  'typescript', '@types',                         // 编译期类型，运行时用不到
  'react', 'react-dom', 'chart.js', '@radix-ui',  // 前端 UI，仅 Studio 拉入
  '@langchain',                                   // 附件文本提取已改直连 pdf-parse/mammoth
  'js-tiktoken', 'langsmith',                     // langchain 传递依赖（token 计数/tracing）
  'handlebars', 'uglify-js',                      // langchain 模板引擎链
  '@napi-rs',                                     // pdfjs 渲染用 canvas，纯文本提取不需要
  'pdfjs-dist',                                   // pdf-parse@1 内置旧版 pdf.js，无此依赖
  // ⚠️ 不要删 '@opentelemetry'：stagehand 直接依赖 api/core，不只是 langsmith 的传递依赖。
  //    整包删除会让打包后后端一启动就 ERR_MODULE_NOT_FOUND（prune 后 vitest/prisma CLI
  //    等其他引用方已不在，剩下的 api/core/semantic-conventions 都是 stagehand 链上的）。
  '@ant-design',                                  // 前端图标库，后端未使用（历史残留）
  '@ai-sdk', 'ai',                                // LLM SDK，后端直连 openai 兼容网关，未使用
];
let removedPkgs = 0;
for (const pkg of deadPkgs) {
  const p = path.join(nmDir, ...pkg.split('/'));
  if (fs.existsSync(p)) { rmrf(p); removedPkgs++; }
}
// 再剥离所有包里的非运行时文件：类型声明 / sourcemap / 文档 / 示例目录。
// 历史踩坑：不删名为 'test' 的子目录——playwright 1.61+ 把运行时源码
// （lib/mcp/test/testBackend.js、lib/transform/test、lib/cli/test 等）放在
// `lib/**/test/` 下，整目录 rmrf 后 codegen 子进程一加载就
// `Cannot find module './mcp/test/testBackend'`，UI 点"录制"报
// "读取录制文件失败: ENOENT"。改成按文件后缀删 `*.test.js` / `*.spec.js`，
// 对运行时 'test' 目录零侵入；同时给 playwright 链整包加白名单——任何文件类型
// 都不动（避免 .node / .dll 等原生产物被误删）。
const stripDirs = new Set(['docs', 'doc', 'examples', 'example', '.github', 'coverage', 'benchmark', 'benchmarks']);
const stripFileSuffixes = ['.d.ts', '.map', '.md', '.markdown', '.flow'];
const stripFileNames = new Set(['license', 'licence', 'license.txt', 'licence.txt', 'notice']);
const stripTestFileRe = /\.(test|spec)\.[mc]?[jt]sx?$/i;
const skipStripPkgs = new Set(['playwright', 'playwright-core']);
let strippedFiles = 0, strippedDirs = 0;
// 从 <node_modules>/<pkg 或 @scope/pkg>/<sub>... 反推出包名。包内嵌 'node_modules'
// 时（嵌套依赖）lastIndexOf 拿到的是最近的，所以始终是当前正在 stripTree 的
// 那个包——正是我们想要的语义。
function inferPkgName(dir) {
  const marker = `${path.sep}node_modules${path.sep}`;
  const i = dir.lastIndexOf(marker);
  if (i < 0) return null;
  const rest = dir.slice(i + marker.length);
  const parts = rest.split(path.sep);
  return parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}
function stripTree(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  const pkgName = inferPkgName(dir);
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (pkgName && skipStripPkgs.has(pkgName)) continue;
      if (stripDirs.has(e.name)) { rmrf(p); strippedDirs++; }
      else stripTree(p);
    } else if (e.isFile()) {
      if (pkgName && skipStripPkgs.has(pkgName)) continue;
      const ln = e.name.toLowerCase();
      if (stripFileSuffixes.some((s) => ln.endsWith(s)) || stripFileNames.has(ln)) {
        fs.rmSync(p, { force: true }); strippedFiles++;
      } else if (stripTestFileRe.test(e.name)) {
        fs.rmSync(p, { force: true }); strippedFiles++;
      }
    }
  }
}
stripTree(nmDir);
console.log(`  删除整包 ${removedPkgs} 个；剥离目录 ${strippedDirs} 个、文件 ${strippedFiles} 个`);

// 3b-2. 精简 @prisma/client 的 WASM query compiler。
//       后端仅 SQLite（driver-adapter + WASM query compiler），Prisma 7 的
//       query compiler 按 provider × (fast/small) × (js/mjs/wasm-base64.js/wasm-base64.mjs)
//       打包了 5 个数据库共 40 个文件（约 65MB）。但生成后的运行时
//       （generated class.ts 的 config.compilerWasm）只动态 import 两个 sqlite fast 的 .mjs：
//         query_compiler_fast_bg.sqlite.mjs
//         query_compiler_fast_bg.sqlite.wasm-base64.mjs
//       其余（postgresql/mysql/sqlserver/cockroachdb 全部、sqlite 的 small 档、以及 .js 冗余副本）
//       运行时永远加载不到，安全删除。
const prismaRuntime = path.join(nmDir, '@prisma', 'client', 'runtime');
const keepQueryCompiler = new Set([
  'query_compiler_fast_bg.sqlite.mjs',
  'query_compiler_fast_bg.sqlite.wasm-base64.mjs',
]);
let removedWasms = 0;
if (fs.existsSync(prismaRuntime)) {
  for (const f of fs.readdirSync(prismaRuntime)) {
    if (f.startsWith('query_compiler_') && !keepQueryCompiler.has(f)) {
      fs.rmSync(path.join(prismaRuntime, f), { force: true });
      removedWasms++;
    }
  }
}
console.log(`  删除冗余 query compiler ${removedWasms} 个文件`);

// 4. 生成空库模板（带表结构、无数据）
console.log('\n--- [4/5] 生成 SQLite 空库模板 ---');
const templateAbs = path.join(resDir, 'app.db.template');
if (fs.existsSync(templateAbs)) fs.rmSync(templateAbs);
run(
  `npx prisma db push --url="file:${templateAbs}" --accept-data-loss`,
  { cwd: serverDir },
);

// 5. 拷贝 node 运行时（必须与 dev 端 better-sqlite3 原生模块的 ABI 一致，
//    故下载与当前 process.versions.node 完全一致的官方独立二进制；
//    homebrew 的 node 是依赖 libnode.dylib 的 68KB 桩，不能直接拷贝）
console.log('\n--- [5/5] 准备 node 运行时 ---');
const nodeDest = path.join(resDir, process.platform === 'win32' ? 'node.exe' : 'node');

function ensureNodeBinary(dest) {
  const ver = process.versions.node;
  const plat = process.platform;
  const arch = process.arch;
  // Node 官方产物命名：darwin/linux 为 .tar.gz，windows 为 .zip 且平台名是 win（非 win32）
  const platLabel = plat === 'win32' ? 'win' : plat;
  const ext = plat === 'win32' ? 'zip' : 'tar.gz';
  const cacheDir = path.join(root, '.sidecar-cache');
  const extractedDir = path.join(cacheDir, `node-v${ver}-${platLabel}-${arch}`);
  // 二进制在产物中的位置：unix 在 bin/node，windows 在根目录 node.exe
  const cachedNode = plat === 'win32'
    ? path.join(extractedDir, 'node.exe')
    : path.join(extractedDir, 'bin', 'node');
  if (!fs.existsSync(cachedNode)) {
    const url = `https://nodejs.org/dist/v${ver}/node-v${ver}-${platLabel}-${arch}.${ext}`;
    fs.mkdirSync(cacheDir, { recursive: true });
    const archive = path.join(cacheDir, `node-v${ver}-${platLabel}-${arch}.${ext}`);
    console.log(`下载 node: ${url}`);
    run(`curl -fL --retry 3 -o "${archive}" "${url}"`);
    // tar -xf 自动识别格式：mac/linux 解 .tar.gz，Windows 自带 bsdtar 解 .zip
    run(`tar -xf "${archive}" -C "${cacheDir}"`);
    if (!fs.existsSync(cachedNode)) throw new Error(`解压后未找到 node 二进制: ${cachedNode}`);
  } else {
    console.log(`使用缓存 node: ${cachedNode}`);
  }
  fs.copyFileSync(cachedNode, dest);
  // Windows 无需 chmod；unix 确保可执行（资源拷贝有时丢权限）
  if (plat !== 'win32') fs.chmodSync(dest, 0o755);
}

ensureNodeBinary(nodeDest);

rmrf(stagingDir);

console.log('\n--- resources 体积 ---');
try {
  const bytes = dirSize(resDir);
  console.log(`${(bytes / 1024 / 1024).toFixed(1)} MB`);
} catch (e) {
  console.warn('统计体积失败:', e.message);
}

// 6. 防回归 smoke test：直接 require 关键运行时入口，MODULE_NOT_FOUND 立即挂掉。
//    背景：之前 prepare-sidecar 误删 playwright 的 'test' 子目录导致 codegen
//    启动崩、UI 报 ENOENT；保留端到端 require 自检避免重蹈覆辙。仅检当前平台
//    路径（Linux/Mac 打包不会跑 Windows 分支也无所谓，反正文件在）。
console.log('\n--- [6/5] smoke test: 关键 require 链路 ---');
const smokeTargets = [
  'playwright/cli.js',
  'playwright/lib/mcp/test/testBackend.js',  // 历史踩坑点（曾被 stripDirs 误删）
  'playwright-core/lib/coreBundle.js',  // playwright 程序里 require('playwright-core/lib/coreBundle')
  '@prisma/client/index.js',
  'pdf-parse/lib/pdf-parse.js',   // 附件 PDF 文本提取（v1 内置 pdf.js，无 canvas 依赖）
  'mammoth/lib/index.js',         // 附件 DOCX 文本提取
  'csv-parse/lib/sync.js',        // 附件 CSV 解析（exports 把 csv-parse/sync 映射到此真实文件）
];
let smokeOk = 0, smokeFail = 0;
for (const rel of smokeTargets) {
  const target = path.join(resServerDir, 'node_modules', rel);
  if (!fs.existsSync(target)) {
    console.warn(`  ✗ ${rel}  (路径不存在: ${target})`);
    smokeFail++;
    continue;
  }
  // cli.js 是入口脚本，其余用 module 方式 resolve。直接在 child_process 跑 node
  // --check 确认语法可解析（最快且不引入真实副作用，例如浏览器启动）。
  try {
    execSync(
      `node --check "${target}"`,
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    console.log(`  ✓ ${rel}`);
    smokeOk++;
  } catch (e) {
    console.error(`  ✗ ${rel}  解析失败`);
    console.error('    ' + String(e.stderr || e.message).split('\n')[0]);
    smokeFail++;
  }
}
// 6b. 额外验证：Prisma SQLite query compiler（wasm）能被 import 并实例化。
//     背景：3b-2 精简删除了冗余的跨数据库 query_compiler_*，只保留 sqlite fast 的 .mjs。
//     若误删所需文件或保留格式错误，此处会立即失败（比 node --check 更强的运行时验证）。
console.log('\n--- [6b] smoke test: Prisma SQLite query compiler (wasm) ---');
try {
  execSync(
    `node --input-type=module -e "import { wasm } from '@prisma/client/runtime/query_compiler_fast_bg.sqlite.wasm-base64.mjs'; import { Buffer } from 'node:buffer'; new WebAssembly.Module(Buffer.from(wasm, 'base64'));"`,
    { cwd: resServerDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  console.log('  ✓ query_compiler_fast_bg.sqlite.wasm-base64.mjs 可加载并实例化');
} catch (e) {
  console.error('  ✗ query compiler wasm 加载失败');
  console.error('    ' + String(e.stderr || e.message).split('\n').slice(0, 4).join('\n'));
  smokeFail++;
}

// 6c. 额外验证：stagehand 能完成全链路模块解析并加载。
//     背景：死名单曾把 '@opentelemetry' 整包删除（误以为是 langsmith 专用），但
//     stagehand 直接依赖它，打包后后端启动即 ERR_MODULE_NOT_FOUND，前端表现为
//     "加载项目失败: TypeError: Load failed"。上面 6 的 node --check 只查单文件
//     语法、查不出传递依赖缺失；这里用真实动态 import 走完整解析。
console.log('\n--- [6c] smoke test: stagehand 全链路模块解析 ---');
try {
  execSync(
    `node -e "import('@browserbasehq/stagehand').then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); })"`,
    { cwd: resServerDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  console.log('  ✓ @browserbasehq/stagehand 可加载');
} catch (e) {
  console.error('  ✗ @browserbasehq/stagehand 加载失败（传递依赖被裁过头？）');
  console.error('    ' + String(e.stderr || e.message).split('\n').slice(0, 4).join('\n'));
  smokeFail++;
}

if (smokeFail > 0) {
  console.error(`\n❌ smoke test 失败 (${smokeFail}/${smokeTargets.length})，sidecar 资源可能被裁剪过头！`);
  process.exit(1);
}
console.log(`  smoke test 全过 (${smokeOk}/${smokeTargets.length})`);

console.log('\n✅ sidecar 资源准备完成');
