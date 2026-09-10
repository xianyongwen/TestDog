import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { latestReleaseManifestUrl, parseReleaseManifest } from '../docs/.vitepress/theme/releases.mjs'
import loader from '../docs/.vitepress/theme/releases.data.js'

const base = 'https://github.com/xianyongwen/TestDog/releases/download/v0.2.0/'
const manifest = () => ({
  version: '0.2.0',
  platforms: {
    'darwin-aarch64': { url: `${base}TestDog_0.2.0_macos-arm64.app.tar.gz`, signature: 'signed' },
    'darwin-x86_64': { url: `${base}TestDog_0.2.0_macos-x64.app.tar.gz`, signature: 'signed' },
    'windows-x86_64': { url: `${base}TestDog_0.2.0_windows-x64-setup.exe`, signature: 'signed' },
  },
})

test('uses the same manifest endpoint as the desktop app', async () => {
  const config = JSON.parse(await readFile(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
  assert.equal(latestReleaseManifestUrl, config.plugins.updater.endpoints[0])
})

test('converts updater archives to native installers for all architectures', () => {
  const release = parseReleaseManifest(manifest())
  assert.equal(release.version, '0.2.0')
  for (const platform of ['macos-arm64', 'macos-x64', 'windows-x64']) {
    const name = `TestDog_0.2.0_${platform}${platform.startsWith('macos') ? '.dmg' : '-setup.exe'}`
    assert.deepEqual(release.installers[platform], { name, url: `${base}${name}` })
  }
})

test('rejects invalid manifests and the old REST API format', () => {
  for (const value of [null, {}, { tag_name: 'v0.2.0', assets: [] }, { version: '0.2.0' },
    { version: '../../bad', platforms: {} }, { version: '0.2.0', platforms: [] }]) {
    assert.throws(() => parseReleaseManifest(value), /Invalid update manifest/)
  }
})

test('missing platforms leave other installers available', () => {
  const data = manifest()
  delete data.platforms['darwin-aarch64']
  data.platforms['darwin-x86_64'] = null
  assert.deepEqual(Object.keys(parseReleaseManifest(data).installers), ['windows-x64'])
})

test('untrusted, wrong-version and wrong-architecture URLs cannot become installer links', () => {
  for (const url of [
    'javascript:alert(1)',
    'https://example.com/TestDog_0.2.0_macos-arm64.app.tar.gz',
    'https://github.com/other/repo/releases/download/v0.2.0/TestDog_0.2.0_macos-arm64.app.tar.gz',
    `${base}TestDog_0.2.0_macos-x64.app.tar.gz`,
    `${base}TestDog_0.1.0_macos-arm64.app.tar.gz`,
  ]) {
    const data = manifest()
    data.platforms['darwin-aarch64'].url = url
    assert.equal(parseReleaseManifest(data).installers['macos-arm64'], undefined)
  }
})

test('build loader fetches the updater manifest and exposes installer data', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, latestReleaseManifestUrl)
    assert.ok(options.signal instanceof AbortSignal)
    return new Response(JSON.stringify(manifest()))
  })
  assert.deepEqual(await loader.load(), parseReleaseManifest(manifest()))
})

test('HTTP errors, invalid JSON and network failures preserve the release-page fallback', async (t) => {
  const warning = t.mock.method(console, 'warn', () => {})
  const fetchMock = t.mock.method(globalThis, 'fetch')
  for (const response of [new Response('', { status: 403 }), new Response('not JSON'), new Response('{}'), null]) {
    fetchMock.mock.mockImplementation(async () => {
      if (!response) throw new Error('Network unavailable')
      return response
    })
    assert.equal(await loader.load(), null)
  }
  assert.equal(warning.mock.callCount(), 4)
})
