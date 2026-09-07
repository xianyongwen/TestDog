# 贡献指南

感谢关注 TestDog（测试用例管理工具）！完整贡献文档见文档站《贡献指南》页（<https://softwing.top/testdog-doc/guide/contributing.html>，仓库内为 `doc/docs/guide/contributing.md`），本文件是速查版。

## 快速上手

```bash
npm install
npm --prefix server install

# 首次：初始化数据库 + 下载执行浏览器
npm --prefix server run prisma:generate
npm --prefix server run prisma:migrate -- --name init
npm --prefix server exec -- playwright install chromium

# 启动桌面应用（或 npm run dev 仅跑 Web 调试）
npm run tauri dev
```

> `prisma migrate dev` 仅用于首次生成 dev.db，此后不要再对已有 dev.db 跑 `migrate dev` / `db push`（会被判定漂移导致 reset 删库）。

## 分支与提交

- `master` 为稳定发布分支，`develop` 为开发主线；功能分支从 `develop` 切出（`feat/xxx`、`fix/xxx`、`docs/xxx`），PR 目标分支选 **`develop`**
- 提交信息采用 Conventional Commits + gitmoji：`✨ feat(scope): 中文描述`，常用 type 见 [doc/docs/guide/contributing.md](doc/docs/guide/contributing.md)

## 提交前自查

```bash
npm --prefix server run typecheck   # 后端类型检查
npm --prefix server run test        # vitest 单测
npm run build                       # 前端类型检查 + 构建
```

## ⚠️ 数据库 Schema 变更（最易踩坑）

改 `server/prisma/schema.prisma` 后必须：

1. `npm --prefix server run prisma:generate`
2. 用 better-sqlite3 写幂等 SQL 把本地 dev.db 补齐（参考 `server/src/migrate.ts` 的 `addColumn` 工具）
3. 在 `server/src/migrate.ts` 的 `MIGRATIONS` 追加同名幂等条目
4. 重跑 `node scripts/prepare-sidecar.mjs`，并提交产物 `src-tauri/resources/server/index.js` 与 `app.db.template`

**不要**跑 `prisma migrate dev` / `db push`（漂移判定会 reset 删库）；跳过第 4 步会导致安装包运行时报 `Unknown field`。

## 反馈问题

提 Issue 请附：应用版本与操作系统、最小复现步骤、最小被测试页面（能复现问题的最小 HTML 页面即可，CodePen、JSFiddle、CodeSandbox 等复现页面均可）、期望 vs 实际行为、运行记录中的失败截图与 console/network 采集（生成类问题附生成记录日志）。安全漏洞勿提公开 Issue，请使用 GitHub 私下漏洞报告（仓库 Security 页 → Report a vulnerability）。
