# Contributing

Thanks for your interest in TestDog! Whether it's fixing bugs, adding features, improving docs, or writing component plugins — contributions are welcome. This page walks through the full flow from environment setup to submitting a PR.

## Environment Setup

| Dependency | Requirement | Notes |
| --- | --- | --- |
| Node.js | ≥ 20 | Shared by frontend and backend; LTS recommended |
| Git | any recent version | — |
| OS | macOS / Windows | Verify packaging on the target platform |

Clone and start:

```bash
git clone https://github.com/xianyongwen/TestDog.git
cd test-tool

# 1. Install dependencies (root + backend)
npm install
npm --prefix server install

# 2. Initialize the database (first time only)
npm --prefix server run prisma:generate
npm --prefix server run prisma:migrate -- --name init

# 3. Download Chromium (Playwright / Stagehand browser, first time only)
npm --prefix server exec -- playwright install chromium

# 4. Start the desktop app
npm run tauri dev
```

Without the Tauri toolchain you can run web-only debugging: `npm run dev`, then open `http://localhost:1420` in a browser (backend on port 4123).

::: warning Initialize the database once
`prisma migrate dev` is only for creating dev.db. Afterwards, do **not** run `migrate dev` or `db push` against the existing dev.db — Prisma treats the project-managed `_app_migrations` tracking table as drift and resets (drops) the database. All later schema changes go through [Database Schema Changes](#database-schema-changes) below.
:::

## Project Structure

```text
test-tool/
├─ src/                # React frontend (pages/ components/ i18n/ api/)
├─ server/             # Node backend (Fastify + Prisma + Stagehand + Playwright)
│  ├─ src/routes/      # REST + WS routes
│  ├─ src/services/    # Generation / replay / recording / plugin services
│  ├─ src/toolLoop.ts  # Shared LLM tool-calling loop
│  ├─ src/migrate.ts   # Idempotent production-DB migration
│  └─ tests/           # vitest unit tests
├─ scripts/            # Packaging scripts (dist.mjs / prepare-sidecar.mjs …)
├─ src-tauri/          # Tauri shell (Rust + resources/ sidecar artifacts)
└─ doc/                # VitePress docs site (this site)
```

See the root README ("Architecture" and "Directory Structure") for module details.

## Branching Model

- **`master`**: stable release branch; installers are built from it
- **`develop`**: main development line; all features land here
- Cut feature branches from `develop`, named `feat/xxx`, `fix/xxx`, `docs/xxx`; open PRs back into `develop` when done

## Commit Convention

We use Conventional Commits + gitmoji, in the form `type(scope): Chinese subject`:

```text
✨ feat(settings): 新增字体大小调节与测试报告导出功能
♻️ refactor(server): 移除langchain依赖，精简附件文本提取
chore(deps): 添加 i18next 与 react-i18next 依赖并优化 Prisma 打包
```

| type | emoji | Use for |
| --- | --- | --- |
| feat | ✨ | New features |
| fix | 🐛 | Bug fixes |
| refactor | ♻️ | Refactoring (no behavior change) |
| docs | 📝 | Documentation |
| test | ✅ | Tests |
| perf | ⚡ | Performance |
| chore | 🔧 | Build / deps / misc |

- One logical change per commit; subject is an imperative Chinese sentence without a trailing period
- `scope` is optional — use the module name (`server` / `settings` / `插件管理` …)
- Pass the checks under "Testing & Self-check" before committing

## Database Schema Changes

The **most error-prone** workflow in this repo. After editing `server/prisma/schema.prisma`, complete all four steps:

1. Edit the models in `server/prisma/schema.prisma`
2. `npm --prefix server run prisma:generate` to regenerate the Prisma client
3. **Align local dev.db**: write idempotent SQL with better-sqlite3 to patch the dev database (`CREATE TABLE IF NOT EXISTS` for tables; check `PRAGMA table_info` before `ALTER TABLE ADD COLUMN` for columns — see the `addColumn` helpers in `server/src/migrate.ts`)
4. **Production migration entry**: append a same-named idempotent entry to `MIGRATIONS` in `server/src/migrate.ts` — old databases rely on it when upgrading in place

::: danger Never run migrate dev / db push
Running `prisma migrate dev` or `prisma db push` against an existing dev.db makes Prisma detect migration drift and reset the database.
:::

::: warning Re-run the sidecar prep and commit its artifacts
`scripts/prepare-sidecar.mjs` bundles the backend into `src-tauri/resources/`. After any schema change, re-run:

```bash
node scripts/prepare-sidecar.mjs
```

and commit the artifacts `src-tauri/resources/server/index.js` and `src-tauri/resources/app.db.template`, or the installed app will fail at runtime with `Unknown field`.
:::

## Testing & Self-check

Run these before committing:

```bash
npm --prefix server run typecheck   # backend type check
npm --prefix server run test        # vitest unit tests (server/tests/)
npm run build                       # frontend type check (tsc -b) + build
```

- Add vitest cases for new backend logic; for changes touching generation / replay behavior, run the real flow in the app before submitting
- New component plugins: verify the tri-state result and in-page post-validation on a real page per [Plugin Development](/en/guide/plugin-dev)

## Code Conventions

- **Frontend**: React 18 + Ant Design 5 + Tailwind CSS 4; all user-facing strings go through i18n — always update `src/i18n/locales/zh-CN.ts` and `en-US.ts` **as a pair**
- **Theme**: never hard-code colors — the `--tk-*` tokens in `src/tailwind.css` and the `PALETTES` in `src/theme.ts` mirror each other; change both together
- **Backend**: TS ESM; REST routes live in `server/src/routes/`, business logic in `server/src/services/`, real-time progress follows the existing WebSocket push pattern
- **Injected browser scripts**: `page.evaluate` callbacks used by generation / replay must be **anonymous functions** — build-tool named-function wrapping breaks them with a ReferenceError in the browser
- **Component plugins**: single-file `.js` expression under `server/src/services/componentPlugins/sources/`, no build step; see [Plugin Development](/en/guide/plugin-dev)

## Docs Contributions

The docs site lives in `doc/` (VitePress):

```bash
npm --prefix doc install
npm --prefix doc run dev
```

- Pages are under `doc/docs/guide/` and `doc/docs/menus/`, with English mirrors in `doc/docs/en/` — **keep both in sync**
- Register new pages in the Chinese / English sidebars in `doc/docs/.vitepress/config.mts`

## Submitting a PR

1. Rebase onto latest `develop`: `git fetch origin && git rebase origin/develop`
2. Push to your fork or repo branch and open a PR on GitHub, **targeting `develop`**
3. Describe in the PR: what changed / why / how you verified it (test output or run-record screenshots)
4. Small PRs are preferred; merge after review

A `docs`-only change is a good first contribution.

## Reporting Issues

When filing an issue, please include:

- TestDog version and operating system
- Minimal reproduction steps (starting from creating a project)
- A minimal page under test: the smallest HTML page that reproduces the issue — a CodePen, JSFiddle or CodeSandbox reproduction works fine
- Expected vs. actual behavior
- The failed-step screenshot and captured console / network from "Run Records" (saved automatically on replay failure)
- For generation issues: the "Generation Logs"

::: danger Security Issues
Do not open public issues for security vulnerabilities. Use GitHub's private vulnerability reporting instead (repo **Security** tab → **Report a vulnerability**).
:::
