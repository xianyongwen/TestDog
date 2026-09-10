import { latestReleaseManifestUrl, parseReleaseManifest } from './releases.mjs'

// Runs in Node during VitePress build/dev, since GitHub release downloads do
// not allow cross-origin browser fetches. Rebuild docs after each new release.
export default {
  async load() {
    try {
      const response = await fetch(latestReleaseManifestUrl, {
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return parseReleaseManifest(await response.json())
    } catch (error) {
      console.warn(`[downloads] Could not load ${latestReleaseManifestUrl}: ${error.message}`)
      return null
    }
  },
}
