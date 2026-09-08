import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findInstaller } from '../docs/.vitepress/theme/releases.mjs'

const asset = name => ({ name, browser_download_url: `https://github.com/xianyongwen/TestDog/releases/download/v0.2.0/${name}` })

test('selects native installers by architecture, regardless of release version', () => {
  const assets = [asset('TestDog_0.2.0_aarch64.dmg'), asset('TestDog_0.2.0_x86_64.dmg'), asset('TestDog_0.2.0_x64-setup.exe'), asset('TestDog_0.2.0_arm64-setup.exe')]
  assert.equal(findInstaller(assets, 'macos-arm64'), assets[0])
  assert.equal(findInstaller(assets, 'macos-x64'), assets[1])
  assert.equal(findInstaller(assets, 'windows-x64'), assets[2])
})

test('accepts Actions ZIPs attached to Releases and prefers native installers', () => {
  for (const platform of ['macos-arm64', 'macos-x64', 'windows-x64']) {
    const zip = asset(`TestDog-${platform}-v0.2.0.zip`)
    assert.equal(findInstaller([zip], platform), zip)
  }
  const zip = asset('TestDog-macos-arm64-v0.2.0.zip')
  const dmg = asset('TestDog_0.2.0_aarch64.dmg')
  assert.equal(findInstaller([zip, dmg], 'macos-arm64'), dmg)
})

test('missing, malformed, wrong-platform and non-release assets cannot produce download links', () => {
  assert.equal(findInstaller(undefined, 'macos-arm64'), null)
  assert.equal(findInstaller([null, {}, asset('Source-code.zip'), asset('TestDog_0.2.0_x86_64.dmg')], 'macos-arm64'), null)
  for (const url of ['javascript:alert(1)', 'https://example.com/TestDog_0.2.0_aarch64.dmg', 'https://github.com/other/repo/releases/download/v1/TestDog_0.2.0_aarch64.dmg']) {
    assert.equal(findInstaller([{ name: 'TestDog_0.2.0_aarch64.dmg', browser_download_url: url }], 'macos-arm64'), null)
  }
})
