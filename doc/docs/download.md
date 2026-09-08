---
outline: false
---

<script setup>
import ReleaseDownloads from './.vitepress/theme/ReleaseDownloads.vue'
</script>

# 下载 TestDog

选择适合你设备的安装包。下方链接自动跟随 GitHub 最新正式版本更新。

<ReleaseDownloads />

## 安装与首次启动

- **Mac M 系列芯片**：选择 Apple Silicon；**Intel Mac**：选择 Intel。可在苹果菜单的「关于本机」中查看芯片类型。
- **macOS**：打开 `.dmg`，将 TestDog 拖入「应用程序」。应用使用 ad-hoc 签名，未经过 Apple 公证；首次打开如被拦截，确认来源可信后，在「系统设置 → 隐私与安全性」中手动允许打开。
- **Windows x64**：运行 `.exe` 安装程序。安装包未签名，可能显示未知发布者提示。
- 下载的是 `.zip` 文件时，请先解压，再打开其中的安装包。

安装包内置 Node.js，无需单独安装。浏览器自动化默认使用系统 Chrome，请先安装 Chrome，或在设置中指定兼容的浏览器路径。

安装完成后，按照[快速开始](/guide/getting-started)配置模型服务并运行第一条用例。
