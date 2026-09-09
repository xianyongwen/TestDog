# 桌面自动更新

桌面版启动 5 秒后、之后每 4 小时以及网络恢复时检查 GitHub Releases 的最新正式版本，发现新版后自动下载。签名验证成功才显示“重启并安装”；用户可以稍后安装，避免中断编辑、生成、录制或测试任务。侧栏“软件更新”可手动检查、查看下载进度及更新说明，也可关闭自动检查。关闭开关不取消已经开始的下载。下载暂存在当前进程内，退出后下次启动会重新检查下载。

浏览器版不显示更新入口，开发模式不进行自动检查。未配置公钥的本地构建仍可正常打包，但不会启用自动更新。更新使用 [Tauri 官方更新器](https://v2.tauri.app/plugin/updater/)，只接受通过公钥签名校验的更新包，不支持降级。

## 首次启用（发布维护者）

1. 在安全位置生成并备份签名密钥，不要把私钥放进仓库：

   ```sh
   npm run tauri signer generate -- -w ~/.tauri/testdog-updater.key
   ```

2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 设置：

   | 类型 | 名称 | 内容 |
   | --- | --- | --- |
   | Variable | `TAURI_UPDATER_PUBLIC_KEY` | `.pub` 文件的完整内容，不能是路径 |
   | Secret | `TAURI_SIGNING_PRIVATE_KEY` | 私钥文件的完整内容 |
   | Secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 密钥密码，无密码则留空 |

3. 同步修改 `package.json` 和 `src-tauri/tauri.conf.json` 的版本号，再推送对应的 `v<版本号>` 标签。例如两处均为 `0.1.3` 时，标签必须为 `v0.1.3`。版本或签名配置缺失会阻止发布构建。
4. 工作流构建 macOS Apple Silicon、macOS Intel、Windows x64，生成签名包、安装器和包含三平台的 `latest.json`，上传到 **草稿 Release**。确认产物后手动发布 Release，已安装的客户端即可发现更新。预发布版本应标记为 prerelease，不应作为正式 latest 发布。

已经公开发布的同版本 Release 不允许覆盖，修复时必须提高版本号。首次支持更新的版本需要用户手动安装一次；不含更新器的旧版无法自动获得此功能。后续版本必须继续使用同一签名密钥。密钥配置和真正的 Release 发布需要仓库维护者完成。

默认更新地址是 `https://github.com/xianyongwen/TestDog/releases/latest/download/latest.json`。仓库或分发位置改变时，在 `src-tauri/tauri.conf.json` 中设置新的 HTTPS 地址；发布清单中的包地址由构建仓库决定。客户端必须能够无认证访问清单与下载包。

## 本地签名打包

将上述公钥、私钥及密码设置为当前终端的环境变量，然后运行：

```sh
npm run updater:configure
npm run dist -- --updater
```

配置脚本生成被 Git 忽略的 `src-tauri/tauri.updater.conf.json`，其中仅包含公钥与打包配置，不写入私钥。普通 `npm run dist` 仍支持不带更新的本地打包。CI 的 macOS 构建保留原有 ad-hoc 签名；更新签名与 Apple Developer ID 签名、公证是独立机制。

## 数据与验证

安装前会终止打包的 Node 后端并等待退出，释放文件和 4123 端口；安装失败则尝试重新启动当前后端。macOS 安装完成后重启应用，Windows 由安装器负责重新启动。现有数据库与配置保存在 Tauri 的应用数据目录，更新不覆盖它们；数据库升级沿用现有启动迁移流程。

运行 `npm run test:updater` 验证重复检查、签名失败、网络恢复重试、安装失败恢复、重启失败重试以及三平台清单完整性。运行 `npm run build` 和 `cargo check --manifest-path src-tauri/Cargo.toml` 检查编译。

正式上线前需要用两个连续的签名版本，在三个平台分别验证下载、重启、版本变化和已有项目/配置保留；同时验证断网、错误签名、取消安装以及安装失败后的应用恢复。仅编译与模拟测试不能替代真实安装验收。
