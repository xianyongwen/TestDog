import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const platforms = {
  'macos-arm64': { target: 'darwin-aarch64', folder: 'macos', suffix: '.app.tar.gz' },
  'macos-x64': { target: 'darwin-x86_64', folder: 'macos', suffix: '.app.tar.gz' },
  'windows-x64': { target: 'windows-x86_64', folder: 'nsis', suffix: '-setup.exe' },
};

function exactlyOne(folder, suffix) {
  const files = fs.readdirSync(folder).filter((name) => name.endsWith(suffix));
  if (files.length !== 1) throw new Error(`Expected one ${suffix} in ${folder}, found ${files.length}`);
  return path.join(folder, files[0]);
}

export function stageRelease({ bundle, out, platform, version }) {
  const config = platforms[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);
  const archive = exactlyOne(path.join(bundle, config.folder), config.suffix);
  const signature = fs.readFileSync(`${archive}.sig`, 'utf8').trim();
  if (!signature) throw new Error(`Empty signature for ${platform}`);
  const name = `TestDog_${version}_${platform}${config.suffix}`;
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(archive, path.join(out, name));
  fs.copyFileSync(`${archive}.sig`, path.join(out, `${name}.sig`));
  if (platform.startsWith('macos')) {
    fs.copyFileSync(exactlyOne(path.join(bundle, 'dmg'), '.dmg'), path.join(out, `TestDog_${version}_${platform}.dmg`));
  }
  fs.writeFileSync(path.join(out, `${platform}.json`), JSON.stringify({ version, target: config.target, name, signature }));
}

export function mergeRelease({ folder, repository, version, notes = '', date = new Date().toISOString() }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GitHub repository');
  const result = { version, notes, pub_date: date, platforms: {} };
  for (const [platform, config] of Object.entries(platforms)) {
    const entry = JSON.parse(fs.readFileSync(path.join(folder, `${platform}.json`), 'utf8'));
    if (entry.version !== version || entry.target !== config.target || !entry.signature) throw new Error(`Invalid release metadata for ${platform}`);
    const expectedName = `TestDog_${version}_${platform}${config.suffix}`;
    if (entry.name !== expectedName || !fs.existsSync(path.join(folder, entry.name))) throw new Error(`Missing update package for ${platform}`);
    if (fs.readFileSync(path.join(folder, `${entry.name}.sig`), 'utf8').trim() !== entry.signature) throw new Error(`Signature mismatch for ${platform}`);
    result.platforms[config.target] = {
      url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(entry.name)}`,
      signature: entry.signature,
    };
  }
  fs.writeFileSync(path.join(folder, 'latest.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const folder = path.join(root, 'updater-artifacts');
  if (process.argv[2] === 'stage') {
    stageRelease({ bundle: path.join(root, 'src-tauri/target/release/bundle'), out: folder, platform: process.argv[3], version });
  } else if (process.argv[2] === 'merge') {
    mergeRelease({ folder, repository: process.env.GITHUB_REPOSITORY, version, notes: `TestDog v${version}` });
  } else throw new Error('Usage: node scripts/updater-release.mjs stage <platform> | merge');
}
