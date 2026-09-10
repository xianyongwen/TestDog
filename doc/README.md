# 帮助文档

在 `doc` 目录执行 `npm install`，然后使用 `npm run dev` 本地预览，或使用 `npm run build` 生成静态站点。部署目录为 `docs/.vitepress/dist`，站点路径前缀为 `/testdog-doc/`。

## 下载页的版本信息

中英文下载页与桌面 App 使用同一个更新清单：

https://github.com/xianyongwen/TestDog/releases/latest/download/latest.json

GitHub 发布附件的响应未开放浏览器跨域读取，因此由 VitePress 的 `releases.data.js` 在构建时获取清单，并把版本和下载链接写入静态页面。浏览器不再调用 GitHub REST API，也不需要访问令牌或代理服务。

发布新版本并上传 `latest.json` 和安装包之后，重新运行 `npm run build` 并部署文档，即可刷新下载页。本地开发时重启 `npm run dev` 以刷新数据。构建机器需要能够访问 GitHub 及其附件下载域名；获取超时、失败或清单无效时会输出构建警告，页面保留 GitHub Releases 入口。

下载链接遵循 `scripts/updater-release.mjs` 的发布文件命名：macOS 清单中的 `.app.tar.gz` 自动更新包转换为同目录、同名的 `.dmg` 安装包；Windows 直接使用清单中的 `-setup.exe`。修改发布文件命名时，需要同步修改 `releases.mjs` 中的解析规则。

运行下载页测试：`node --test scripts/releases.test.mjs`。
