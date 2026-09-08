---
outline: false
---

<script setup>
import ReleaseDownloads from '../.vitepress/theme/ReleaseDownloads.vue'
</script>

# Download TestDog

Choose the installer for your device. These links automatically follow the latest stable release on GitHub.

<ReleaseDownloads lang="en" />

## Installation and first launch

- **M-series Macs**: choose Apple Silicon. **Intel Macs**: choose Intel. Check your chip in the Apple menu under **About This Mac**.
- **macOS**: open the `.dmg` and drag TestDog into **Applications**. The app uses ad-hoc signing and is not notarized by Apple. If blocked on first launch, verify the source and allow it in **System Settings → Privacy & Security**.
- **Windows x64**: run the `.exe` installer. The unsigned installer may show an unknown-publisher warning.
- If you downloaded a `.zip`, extract it before opening the installer inside.

Node.js is bundled; no separate installation is needed. Browser automation uses system Chrome by default. Install Chrome or set a compatible browser path in Settings.

Once installed, follow [Getting Started](/en/guide/getting-started) to configure your model service and run your first test case.
