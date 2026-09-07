#!/usr/bin/env node
/**
 * 保证产出 .dmg（兜底）。
 * tauri build 的 dmg 步骤偶发 "hdiutil detach: 资源忙" 失败（Spotlight 索引占用临时卷），
 * 且 tauri 每次会重新生成 bundle_dmg.sh，无法持久打补丁。
 *
 * 策略：tauri build 之后运行本脚本——
 *  - 若 tauri 已生成有效 dmg（hdiutil verify 通过）-> 跳过；
 *  - 否则用 `hdiutil create -srcfolder` 直接生成（不挂载/不卸载，规避资源忙）。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 非 macOS 无 hdiutil，直接跳过（Windows 走 nsis，见 scripts/dist.mjs）
if (process.platform !== 'darwin') {
  console.log('非 macOS 平台，跳过 dmg 生成');
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle');
const macosDir = path.join(bundleDir, 'macos');
// 应用名以 tauri.conf.json 的 productName 为准（重命名只改一处）
const tauriConf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf-8'));
const productName = tauriConf.productName;
const appPath = path.join(macosDir, `${productName}.app`);
const dmgDir = path.join(bundleDir, 'dmg');
fs.mkdirSync(dmgDir, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const dmgPath = path.join(dmgDir, `${productName}_${pkg.version}_${arch}.dmg`);

if (!fs.existsSync(appPath)) {
  console.error('✗ 找不到 .app，请先确保 tauri build 已构建出 app：', appPath);
  process.exit(1);
}

// 1. 若 tauri 已生成有效 dmg，跳过
if (fs.existsSync(dmgPath)) {
  try {
    execSync(`hdiutil verify "${dmgPath}"`, { stdio: 'pipe' });
    console.log(`✓ tauri 已生成有效 dmg，跳过：${dmgPath}`);
    process.exit(0);
  } catch {
    console.log('! tauri 生成的 dmg 校验失败，重新生成…');
    fs.rmSync(dmgPath, { force: true });
  }
}

// 2. 兜底：hdiutil create -srcfolder（无需挂载，不会资源忙）
//    清理 tauri 失败时残留的 rw.*.dmg，避免被打进新 dmg
for (const f of fs.readdirSync(macosDir)) {
  if (f.startsWith('rw.') && f.endsWith('.dmg')) {
    fs.rmSync(path.join(macosDir, f), { force: true });
  }
}
// 临时放一个 /Applications 软链，连同 .app 一起作为 dmg 源
const appsLink = path.join(macosDir, 'Applications');
try { fs.rmSync(appsLink, { recursive: true, force: true }); } catch {}
fs.symlinkSync('/Applications', appsLink);

try {
  console.log(`创建 dmg：${dmgPath}`);
  execSync(
    `hdiutil create -volname "${productName}" -srcfolder "${macosDir}" -ov -format UDZO -fs HFS+ "${dmgPath}"`,
    { stdio: 'inherit' },
  );
  console.log(`✓ dmg 创建成功：${dmgPath}`);
} finally {
  try { fs.rmSync(appsLink, { recursive: true, force: true }); } catch {}
}
