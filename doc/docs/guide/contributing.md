# 贡献指南

感谢关注 TestDog！无论是修 Bug、加功能、改进文档，还是编写组件插件，都欢迎参与贡献。本页介绍从搭建环境到提交 PR 的完整流程。

## 环境准备

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20 | 前端与后端共用，建议 LTS 版本 |
| Git | 任意近期版本 | — |
| 操作系统 | macOS / Windows | 打包验证按目标平台进行 |

克隆并启动：

```bash
git clone https://github.com/xianyongwen/TestDog.git
cd test-tool

# 1. 安装依赖（根 + 后端）
npm install
npm --prefix server install

# 2. 初始化数据库（仅首次）
npm --prefix server run prisma:generate
npm --prefix server run prisma:migrate -- --name init

# 3. 下载 Chromium（Playwright / Stagehand 执行浏览器，仅首次）
npm --prefix server exec -- playwright install chromium

# 4. 启动桌面应用
npm run tauri dev
```

不装 Tauri 环境也可以只跑 Web 调试：`npm run dev`，浏览器打开 `http://localhost:1420`（后端 4123 端口）。

::: warning 数据库初始化只做一次
`prisma migrate dev` 仅用于生成 dev.db。此后**不要再**对已有 dev.db 跑 `migrate dev` 或 `db push` —— Prisma 会把项目自建的 `_app_migrations` 追踪表判定为迁移漂移，直接 reset（删表）。后续 schema 变更一律走下文[数据库 Schema 变更](#数据库-schema-变更)流程。
:::

## 项目结构

```text
test-tool/
├─ src/                # React 前端（pages/ components/ i18n/ api/）
├─ server/             # Node 后端（Fastify + Prisma + Stagehand + Playwright）
│  ├─ src/routes/      # REST + WS 路由
│  ├─ src/services/    # 生成 / 回放 / 录制 / 插件等核心服务
│  ├─ src/toolLoop.ts  # 通用 LLM 工具调用循环
│  ├─ src/migrate.ts   # 生产库幂等迁移
│  └─ tests/           # vitest 单测
├─ scripts/            # 打包脚本（dist.mjs / prepare-sidecar.mjs …）
├─ src-tauri/          # Tauri 外壳（Rust + resources/ sidecar 产物）
└─ doc/                # VitePress 文档站（本站）
```

各模块职责详见仓库根目录 README 的「架构」与「目录结构」。

## 分支模型

- **`master`**：稳定发布分支，出安装包时从这里打包
- **`develop`**：开发主线，所有功能最终合并到这里
- 功能分支从 `develop` 切出，建议命名 `feat/xxx`、`fix/xxx`、`docs/xxx`，完成后提 PR 合回 `develop`

## 提交规范

采用 Conventional Commits + gitmoji，格式 `type(scope): 中文描述`：

```text
✨ feat(settings): 新增字体大小调节与测试报告导出功能
♻️ refactor(server): 移除langchain依赖，精简附件文本提取
chore(deps): 添加 i18next 与 react-i18next 依赖并优化 Prisma 打包
```

| type | emoji | 用途 |
| --- | --- | --- |
| feat | ✨ | 新功能 |
| fix | 🐛 | 缺陷修复 |
| refactor | ♻️ | 重构（不改变外部行为） |
| docs | 📝 | 文档 |
| test | ✅ | 测试 |
| perf | ⚡ | 性能优化 |
| chore | 🔧 | 构建 / 依赖 / 杂项 |

- 一次提交只做一件事，描述用中文祈使句、结尾不加句号
- `scope` 可选，写模块名（`server` / `settings` / `插件管理` 等）
- 提交前通过下文「测试与自查」的检查项

## 数据库 Schema 变更

这是本项目**最容易踩坑**的流程，改 `server/prisma/schema.prisma` 后必须完整走完四步：

1. 修改 `server/prisma/schema.prisma` 模型
2. `npm --prefix server run prisma:generate` 重新生成 Prisma client
3. **本地 dev.db 对齐**：用 better-sqlite3 写幂等 SQL 把开发库补齐（建表用 `CREATE TABLE IF NOT EXISTS`，加列先查 `PRAGMA table_info` 再 `ALTER TABLE ADD COLUMN`，可参考 `server/src/migrate.ts` 里现成的 `addColumn` 等工具函数）
4. **生产迁移条目**：在 `server/src/migrate.ts` 的 `MIGRATIONS` 数组追加同名幂等条目 —— 升级安装时旧库靠它自动补列

::: danger 不要跑 migrate dev / db push
已有 dev.db 后再执行 `prisma migrate dev` 或 `prisma db push`，Prisma 会判定迁移漂移并 reset 数据库。
:::

::: warning 改完 schema 必须重跑 sidecar 准备并提交产物
`scripts/prepare-sidecar.mjs` 负责把后端打包进 `src-tauri/resources/`。改完 schema 必须重跑：

```bash
node scripts/prepare-sidecar.mjs
```

并把产物 `src-tauri/resources/server/index.js` 与 `src-tauri/resources/app.db.template` 一并提交，否则安装包运行时直接报 `Unknown field`。
:::

## 测试与自查

提交前请依次通过：

```bash
npm --prefix server run typecheck   # 后端类型检查
npm --prefix server run test        # vitest 单测（server/tests/）
npm run build                       # 前端类型检查（tsc -b）+ 构建
```

- 新增后端逻辑尽量补 vitest 用例；涉及生成 / 回放行为的改动，在真实应用里跑通一次相关流程再提交
- 新增组件插件请按[插件开发](/guide/plugin-dev)用真实页面验证三态结果与页内后验校验

## 代码约定

- **前端**：React 18 + Ant Design 5 + Tailwind CSS 4；所有用户可见文案走 i18n，`src/i18n/locales/zh-CN.ts` 与 `en-US.ts` **必须成对更新**
- **主题**：颜色不要写死 —— `src/tailwind.css` 的 `--tk-*` token 与 `src/theme.ts` 的 `PALETTES` 是双表镜像，改色需两处同步
- **后端**：TS ESM；REST 路由放 `server/src/routes/`，业务逻辑放 `server/src/services/`，实时进度沿用现有 WebSocket 推送模式
- **浏览器注入脚本**：生成 / 回放注入页面的 `page.evaluate` 回调一律用**匿名函数** —— 构建器具名包装会在浏览器端报 ReferenceError
- **组件插件**：`server/src/services/componentPlugins/sources/` 下单文件 `.js` 表达式直传，无构建层，开发方法见[插件开发](/guide/plugin-dev)

## 文档贡献

文档站位于 `doc/`（VitePress）：

```bash
npm --prefix doc install
npm --prefix doc run dev
```

- 页面在 `doc/docs/guide/` 与 `doc/docs/menus/`，英文镜像在 `doc/docs/en/`，**两份必须同步修改**
- 新增页面需在 `doc/docs/.vitepress/config.mts` 的中 / 英 sidebar 注册

## 提交 PR

1. 使分支基于最新 `develop`：`git fetch origin && git rebase origin/develop`
2. 推送到你的 fork 或仓库分支，在 GitHub 上发起 PR，**目标分支选 `develop`**
3. PR 描述写清：改了什么 / 为什么 / 怎么验证的（附测试输出或运行记录截图）
4. 小步 PR 优先，审查通过后合并

首次贡献可以从 `docs` 类小改动入手熟悉流程。

## 反馈问题

提 Issue 时请附上：

- TestDog 版本与操作系统
- 最小化复现步骤（从新建项目开始）
- 最小被测试页面：能复现问题的最小 HTML 页面即可，CodePen、JSFiddle、CodeSandbox 等在线复现页面均可
- 期望行为与实际行为
- 回放失败时「运行记录」里自动留存的失败截图与 console / network 采集
- 生成类问题附「生成记录」日志

::: danger 安全问题
安全漏洞请勿提公开 Issue，请使用 GitHub 的私下漏洞报告（仓库 **Security** 页 → **Report a vulnerability**）。
:::
