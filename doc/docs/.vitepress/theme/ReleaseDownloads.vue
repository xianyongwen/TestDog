<script setup>
import { computed } from 'vue'
import { latestReleaseUrl } from './releases.mjs'
import { data as release } from './releases.data.js'

const props = defineProps({ lang: { type: String, default: 'zh' } })
const en = computed(() => props.lang === 'en')
const platforms = ['macos-arm64', 'macos-x64', 'windows-x64']
const labels = { 'macos-arm64': 'macOS · Apple Silicon', 'macos-x64': 'macOS · Intel', 'windows-x64': 'Windows · x64' }

const downloads = computed(() => platforms.map(platform => ({
  platform,
  label: labels[platform],
  asset: release?.installers[platform],
})))
</script>

<template>
  <section class="release-downloads" :aria-label="en ? 'Download TestDog' : '下载 TestDog'">
    <p role="status" class="release-status">
      <template v-if="release">{{ en ? 'Latest release:' : '最新版本：' }} <strong>v{{ release.version }}</strong></template>
      <template v-else>{{ en ? 'Download links are temporarily unavailable. Please visit GitHub Releases below.' : '暂时无法获取下载链接，请通过下方入口前往 GitHub Releases。' }}</template>
    </p>
    <div class="download-grid">
      <article v-for="item in downloads" :key="item.platform" class="download-card">
        <h2>{{ item.label }}</h2>
        <template v-if="item.asset">
          <p class="asset-name">{{ item.asset.name }}</p>
          <a class="download-button" :href="item.asset.url">{{ en ? 'Download' : '下载安装包' }}</a>
        </template>
        <template v-else>
          <p>{{ release ? (en ? 'No installer attached for this platform yet.' : '此版本暂未附带该平台安装包。') : (en ? 'Find installers on GitHub.' : '可前往 GitHub 查看安装包。') }}</p>
          <a :href="latestReleaseUrl">{{ en ? 'View latest release' : '查看最新发布' }}</a>
        </template>
      </article>
    </div>
    <p><a :href="latestReleaseUrl">{{ en ? 'Release notes and all downloads on GitHub →' : '前往 GitHub 查看发布说明和全部下载 →' }}</a></p>
  </section>
</template>

<style scoped>
.release-status { color: var(--vp-c-text-2); }
.download-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.download-card { padding: 20px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg-soft); display: flex; flex-direction: column; align-items: flex-start; }
.download-card h2 { border: 0; margin: 0; padding: 0; font-size: 17px; }
.download-card p { font-size: 13px; color: var(--vp-c-text-2); line-height: 1.6; }
.asset-name { overflow-wrap: anywhere; }
.download-card a { margin-top: auto; }
.download-button { display: inline-block; padding: 8px 16px; border-radius: 8px; background: var(--vp-c-brand-1); color: var(--vp-c-white); text-decoration: none; }
.download-button:hover { background: var(--vp-c-brand-2); color: var(--vp-c-white); }
.download-card a:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 4px; }
@media (max-width: 720px) { .download-grid { grid-template-columns: 1fr; } }
</style>
