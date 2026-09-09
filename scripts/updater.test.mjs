import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createUpdateController } from '../src/utils/updateController.ts';
import { updaterBuildConfig } from './configure-updater.mjs';
import { mergeRelease, platforms, stageRelease } from './updater-release.mjs';

function fixture(overrides = {}) {
  const calls = [];
  const update = {
    version: '0.2.0', body: 'Release notes',
    async download(progress) {
      calls.push('download');
      progress({ event: 'Started', data: { contentLength: 100 } });
      progress({ event: 'Progress', data: { chunkLength: 50 } });
      progress({ event: 'Finished' });
    },
    async install() { calls.push('install'); },
    async close() { calls.push('close'); },
  };
  const adapter = {
    enabled: async () => true,
    check: async () => { calls.push('check'); return update; },
    prepare: async () => { calls.push('prepare'); },
    recover: async () => { calls.push('recover'); },
    restart: async () => { calls.push('restart'); },
    ...overrides,
  };
  return { controller: createUpdateController(adapter), calls, update, adapter };
}

test('automatically downloads, but only installs after explicit action', async () => {
  const { controller, calls } = fixture();
  await controller.check();
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(controller.getSnapshot().downloaded, 50);
  assert.deepEqual(calls, ['check', 'download']);
  await controller.check();
  assert.deepEqual(calls, ['check', 'download']);
  await controller.install();
  assert.deepEqual(calls, ['check', 'download', 'prepare', 'install', 'close', 'restart']);
});

test('disabled builds and latest versions never download or stop backend', async () => {
  const disabled = fixture({ enabled: async () => false });
  await disabled.controller.check();
  assert.equal(disabled.controller.getSnapshot().phase, 'disabled');
  assert.deepEqual(disabled.calls, []);
  const latest = fixture({ check: async () => null });
  await latest.controller.check();
  assert.equal(latest.controller.getSnapshot().phase, 'latest');
  assert.deepEqual(latest.calls, []);
});

test('concurrent checks share one download and concurrent installs are ignored', async () => {
  const { controller, calls, update } = fixture();
  let release;
  update.download = () => new Promise((resolve) => { calls.push('download'); release = resolve; });
  const first = controller.check();
  await new Promise((resolve) => setImmediate(resolve));
  await controller.check();
  assert.deepEqual(calls, ['check', 'download']);
  release();
  await first;
  await Promise.all([controller.install(), controller.install()]);
  assert.equal(calls.filter((call) => call === 'install').length, 1);
});

test('download Finished does not bypass signature validation; failure allows retry', async () => {
  const { controller, calls, update } = fixture();
  update.download = async (progress) => {
    progress({ event: 'Finished' });
    assert.equal(controller.getSnapshot().phase, 'downloading');
    throw new Error('Invalid signature');
  };
  await controller.check();
  await controller.install();
  assert.equal(controller.getSnapshot().phase, 'error');
  assert.equal(controller.getSnapshot().error, 'Invalid signature');
  assert.deepEqual(calls, ['check', 'close']);
  update.download = async () => {};
  await controller.check();
  assert.equal(controller.getSnapshot().phase, 'ready');
});

test('network failure can be retried without leaving controller busy', async () => {
  let attempts = 0;
  const { controller } = fixture({ check: async () => {
    if (++attempts === 1) throw new Error('Offline');
    return null;
  } });
  await controller.check();
  assert.equal(controller.getSnapshot().phase, 'error');
  await controller.check();
  assert.equal(controller.getSnapshot().phase, 'latest');
});

test('installer failure restores backend and requires a fresh download', async () => {
  const { controller, calls, update } = fixture();
  update.install = async () => { throw new Error('Installer cancelled'); };
  await controller.check();
  await controller.install();
  assert.equal(controller.getSnapshot().phase, 'error');
  assert.deepEqual(calls, ['check', 'download', 'prepare', 'recover', 'close']);
  await controller.check();
  assert.equal(controller.getSnapshot().phase, 'ready');
});

test('failed restart can be retried without installing consumed bytes again', async () => {
  const { controller, calls, adapter } = fixture({ restart: async () => { throw new Error('Restart failed'); } });
  await controller.check();
  await controller.install();
  assert.equal(controller.getSnapshot().phase, 'restart');
  assert.ok(calls.includes('recover'));
  adapter.restart = async () => { calls.push('restart'); };
  await controller.install();
  assert.equal(calls.filter((call) => call === 'install').length, 1);
  assert.equal(calls.at(-1), 'restart');
});

test('backend stop failure prevents installation and recovery failure remains visible', async () => {
  const { controller, calls } = fixture({
    prepare: async () => { throw new Error('Cannot stop backend'); },
    recover: async () => { throw new Error('Cannot recover backend'); },
  });
  await controller.check();
  await controller.install();
  assert.equal(controller.getSnapshot().phase, 'error');
  assert.match(controller.getSnapshot().error, /Cannot stop backend\nCannot recover backend/);
  assert.ok(!calls.includes('install'));
});

const publicKey = Buffer.from(`untrusted comment: test public key\n${Buffer.concat([Buffer.from('Ed'), Buffer.alloc(40)]).toString('base64')}\n`).toString('base64');
test('release build requires matching versions and signing credentials', () => {
  const base = { version: '0.2.0', tauriVersion: '0.2.0', tag: 'v0.2.0', publicKey, privateKey: 'fixture-private-key' };
  assert.equal(updaterBuildConfig(base).bundle.createUpdaterArtifacts, true);
  assert.throws(() => updaterBuildConfig({ ...base, tag: 'v0.3.0' }), /Release tag/);
  assert.throws(() => updaterBuildConfig({ ...base, tauriVersion: '0.1.0' }), /versions must match/);
  assert.throws(() => updaterBuildConfig({ ...base, publicKey: '' }), /PUBLIC_KEY/);
  assert.throws(() => updaterBuildConfig({ ...base, privateKey: '' }), /PRIVATE_KEY/);
  assert.throws(() => updaterBuildConfig({ ...base, publicKey: '/path/to/key.pub' }), /complete Tauri/);
  assert.equal(updaterBuildConfig({ version: '0.2.0', tauriVersion: '0.2.0' }).bundle.createUpdaterArtifacts, false);
});

test('release manifest contains signed, unique assets for all three platforms', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'testdog-updater-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const out = path.join(temp, 'out');
  for (const [platform, config] of Object.entries(platforms)) {
    const bundle = path.join(temp, platform);
    fs.mkdirSync(path.join(bundle, config.folder), { recursive: true });
    const archive = path.join(bundle, config.folder, `TestDog${config.suffix}`);
    fs.writeFileSync(archive, platform);
    fs.writeFileSync(`${archive}.sig`, `signature-${platform}\n`);
    if (platform.startsWith('macos')) {
      fs.mkdirSync(path.join(bundle, 'dmg'));
      fs.writeFileSync(path.join(bundle, 'dmg/TestDog.dmg'), 'installer');
    }
    stageRelease({ bundle, out, platform, version: '0.2.0' });
  }
  const manifest = mergeRelease({ folder: out, repository: 'xianyongwen/TestDog', version: '0.2.0' });
  assert.deepEqual(Object.keys(manifest.platforms), ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']);
  assert.equal(new Set(Object.values(manifest.platforms).map((item) => item.url)).size, 3);
  assert.match(manifest.platforms['darwin-aarch64'].url, /\/v0\.2\.0\/TestDog_0\.2\.0_macos-arm64\.app\.tar\.gz$/);
  assert.equal(manifest.platforms['windows-x86_64'].signature, 'signature-windows-x64');
  assert.throws(() => mergeRelease({ folder: out, repository: 'xianyongwen/TestDog', version: '0.3.0' }), /Invalid release metadata/);
  fs.unlinkSync(path.join(out, 'windows-x64.json'));
  assert.throws(() => mergeRelease({ folder: out, repository: 'xianyongwen/TestDog', version: '0.2.0' }), /ENOENT/);
});
