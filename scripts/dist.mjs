#!/usr/bin/env node
/**
 * 跨平台打包入口（`npm run dist`）。
 * - macOS：`tauri build`（产出 .app/.dmg）后跑 build-dmg.mjs 做去重/兜底，
 *   保留原 `tauri build; node build-dmg.mjs` 语义--tauri 失败仍尝试补 dmg。
 * - Windows：`tauri build --bundles nsis` 产出 NSIS 安装包（dmg 脚本本身在非 darwin 上 no-op）。
 *
 * 注：targets 仍在 tauri.conf.json 里保持 ["app","dmg"]（mac 专用），
 * Windows 通过 --bundles 覆盖为 nsis，不动 mac 配置。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isMac = process.platform === 'darwin';

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root });
}

if (isMac) {
  try {
    run('tauri build');
  } catch (e) {
    // 保留原分号语义：tauri build 失败也继续跑 dmg 兜底（复用已有 .app 或上次的 dmg）
    console.warn('! tauri build 失败，仍尝试生成 dmg：', e.message);
  }
  run('node scripts/build-dmg.mjs');
} else {
  // Windows/Linux：用 nsis 出安装包；其它目标（app/dmg）由 Tauri 按平台自动跳过
  // Windows：NSIS solid 压缩会在 TEMP 创建大临时文件（≈数据块大小，上百 MB）。
  // 系统盘 C: 若空间不足会报 "Internal compiler error #12345: error creating mmap
  // the size of N"——根因是磁盘空间，不是 makensis 地址空间。把 TEMP/TMP 重定向到
  // 项目所在盘（通常 D: 等有富余空间）规避。
  if (process.platform === 'win32') {
    const buildTmp = path.join(root, '.build-tmp');
    fs.mkdirSync(buildTmp, { recursive: true });
    process.env.TEMP = buildTmp;
    process.env.TMP = buildTmp;
    process.env.TMPDIR = buildTmp;
  }
  run('tauri build --bundles nsis');
}
