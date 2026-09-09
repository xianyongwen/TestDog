#!/usr/bin/env node
// Headless DMG fallback: verify only the exact output, and stage only the app.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildDmg({ appPath, dmgPath, productName, run = execFileSync }) {
  if (!fs.existsSync(appPath)) throw new Error(`找不到 .app，请先构建应用：${appPath}`);
  fs.mkdirSync(path.dirname(dmgPath), { recursive: true });
  if (fs.existsSync(dmgPath)) {
    try {
      run('hdiutil', ['verify', dmgPath], { stdio: 'pipe' });
      console.log(`✓ 已有 dmg 校验通过：${dmgPath}`);
      return;
    } catch {
      console.log('! dmg 校验失败，重新生成…');
      fs.rmSync(dmgPath, { force: true });
    }
  }

  // macos also contains updater archives/signatures; do not include those in the DMG.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'testdog-dmg-'));
  try {
    run('ditto', [appPath, path.join(staging, `${productName}.app`)], { stdio: 'inherit' });
    fs.symlinkSync('/Applications', path.join(staging, 'Applications'));
    console.log(`创建 dmg：${dmgPath}`);
    run('hdiutil', [
      'create', '-volname', productName, '-srcfolder', staging,
      '-ov', '-format', 'UDZO', '-fs', 'HFS+', dmgPath,
    ], { stdio: 'inherit' });
    run('hdiutil', ['verify', dmgPath], { stdio: 'inherit' });
    console.log(`✓ dmg 创建并校验成功：${dmgPath}`);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') {
    console.log('非 macOS 平台，跳过 dmg 生成');
  } else {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const { productName } = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
    const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const bundle = path.join(root, 'src-tauri/target/release/bundle');
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    buildDmg({
      productName,
      appPath: path.join(bundle, 'macos', `${productName}.app`),
      dmgPath: path.join(bundle, 'dmg', `${productName}_${version}_${arch}.dmg`),
    });
  }
}
