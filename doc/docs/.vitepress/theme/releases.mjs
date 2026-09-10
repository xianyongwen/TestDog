export const latestReleaseUrl = 'https://github.com/xianyongwen/TestDog/releases/latest'
export const latestReleaseManifestUrl = `${latestReleaseUrl}/download/latest.json`

const targets = {
  'macos-arm64': 'darwin-aarch64',
  'macos-x64': 'darwin-x86_64',
  'windows-x64': 'windows-x86_64',
}

export function parseReleaseManifest(manifest) {
  if (!manifest || typeof manifest.version !== 'string' ||
      !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(manifest.version) ||
      !manifest.platforms || typeof manifest.platforms !== 'object' || Array.isArray(manifest.platforms)) {
    throw new Error('Invalid update manifest')
  }

  const installers = {}
  for (const [platform, target] of Object.entries(targets)) {
    const entry = manifest.platforms[target]
    if (typeof entry?.url !== 'string') continue
    // Keep this naming in sync with scripts/updater-release.mjs stageRelease.
    const stem = `TestDog_${manifest.version}_${platform}`
    const mac = platform.startsWith('macos')
    const updateName = `${stem}${mac ? '.app.tar.gz' : '-setup.exe'}`
    const base = `https://github.com/xianyongwen/TestDog/releases/download/v${manifest.version}/`
    if (entry.url !== `${base}${encodeURIComponent(updateName)}`) continue

    // macOS updates contain an app archive; first-time users need the sibling DMG.
    const name = mac ? `${stem}.dmg` : updateName
    installers[platform] = { name, url: `${base}${encodeURIComponent(name)}` }
  }
  return { version: manifest.version, installers }
}
