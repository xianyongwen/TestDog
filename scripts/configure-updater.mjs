import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function updaterBuildConfig({ version, tauriVersion, tag, publicKey, privateKey, ciMac }) {
  if (version !== tauriVersion) throw new Error('package.json and tauri.conf.json versions must match');
  if (tag && tag !== `v${version}`) throw new Error(`Release tag must be v${version}; update both version files first`);
  const enabled = Boolean(publicKey?.trim());
  if (tag && !enabled) throw new Error('Tag releases require TAURI_UPDATER_PUBLIC_KEY');
  if (enabled && !privateKey) throw new Error('Signed updater builds require TAURI_SIGNING_PRIVATE_KEY');
  if (privateKey && !enabled) throw new Error('TAURI_SIGNING_PRIVATE_KEY requires TAURI_UPDATER_PUBLIC_KEY');
  if (enabled) {
    const decoded = Buffer.from(publicKey.trim(), 'base64').toString('utf8');
    const keyBytes = Buffer.from(decoded.trim().split('\n').at(-1), 'base64');
    if (!decoded.startsWith('untrusted comment:') || keyBytes.length !== 42 || keyBytes.subarray(0, 2).toString() !== 'Ed') {
      throw new Error('TAURI_UPDATER_PUBLIC_KEY must contain the complete Tauri .pub file contents');
    }
  }
  return {
    bundle: { createUpdaterArtifacts: enabled, ...(ciMac ? { macOS: { signingIdentity: '-' } } : {}) },
    plugins: { updater: { pubkey: publicKey?.trim() || '' } },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const tauri = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const config = updaterBuildConfig({
    version: pkg.version,
    tauriVersion: tauri.version,
    tag: process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined,
    publicKey: process.env.TAURI_UPDATER_PUBLIC_KEY,
    privateKey: process.env.TAURI_SIGNING_PRIVATE_KEY,
    ciMac: process.env.GITHUB_ACTIONS === 'true' && process.platform === 'darwin',
  });
  fs.writeFileSync(path.join(root, 'src-tauri/tauri.updater.conf.json'), `${JSON.stringify(config, null, 2)}\n`);
  console.log(config.bundle.createUpdaterArtifacts ? 'Signed updates enabled' : 'Unsigned build: automatic updates disabled');
}
