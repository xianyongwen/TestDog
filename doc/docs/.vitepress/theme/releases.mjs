export const latestReleaseUrl = 'https://github.com/xianyongwen/TestDog/releases/latest'
export const latestReleaseApi = 'https://api.github.com/repos/xianyongwen/TestDog/releases/latest'

// Prefer the installer itself, but also accept uploaded Actions artifact ZIPs.
export function findInstaller(assets, platform) {
  const patterns = {
    'macos-arm64': [/(?:aarch64|arm64).*\.dmg$/i, /macos[-_]arm64.*\.zip$/i],
    'macos-x64': [/(?:x86_64|x64).*\.dmg$/i, /macos[-_]x64.*\.zip$/i],
    'windows-x64': [/x64[-_]setup\.exe$/i, /windows[-_]x64.*\.zip$/i],
  }
  const valid = (Array.isArray(assets) ? assets : []).filter(asset => {
    if (typeof asset?.name !== 'string' || typeof asset.browser_download_url !== 'string') return false
    try {
      const url = new URL(asset.browser_download_url)
      return url.origin === 'https://github.com' &&
        url.pathname.startsWith('/xianyongwen/TestDog/releases/download/')
    } catch { return false }
  })
  for (const pattern of patterns[platform] || []) {
    const asset = valid.find(asset => pattern.test(asset.name))
    if (asset) return asset
  }
  return null
}
