import Database from 'better-sqlite3';

/**
 * 生产环境 SQLite 迁移（在 Prisma 客户端创建前运行）。
 *
 * 背景：打包后 app.db 由 app.db.template 首次复制生成（见 src-tauri/src/lib.rs），
 * 升级安装时旧库不会被覆盖，而 Prisma 在运行时不会自动迁移，导致旧库缺列、
 * 查询报 P2022（如 StepResult.consoleLog does not exist）。
 *
 * 这里用 better-sqlite3 直接把库迁到最新。每条迁移体必须幂等——
 * 重复运行、或在已迁移的库（开发库被 prisma migrate dev 迁过、新装库从模板复制）
 * 上运行都不报错。追踪表 _app_migrations 仅用于避免每次启动重复执行。
 *
 * 新增 schema 变更流程：
 *   1. server 目录执行 `npx prisma migrate dev --name xxx` 生成迁移文件；
 *   2. 在下方 MIGRATIONS 追加同名条目，写成幂等语句；
 *   3. 重新打包。
 */
type Migration = { name: string; run: (db: Database.Database) => void };

/** 标识符转义（保留字/防注入）。 */
function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

/** 判断列是否存在。 */
function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

/** 幂等加列：已存在则跳过。 */
function addColumn(db: Database.Database, table: string, column: string, def: string): void {
  if (columnExists(db, table, column)) return;
  db.exec(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(column)} ${def};`);
}

const MIGRATIONS: Migration[] = [
  {
    name: '20260721022429_add_step_result_logs',
    run: (db) => {
      addColumn(db, 'StepResult', 'consoleLog', 'TEXT');
      addColumn(db, 'StepResult', 'networkLog', 'TEXT');
    },
  },
  {
    name: '20260723100000_add_env_vars',
    run: (db) => {
      // 项目级环境变量表（脚本 {{key}} 占位符运行时替换）。CREATE IF NOT EXISTS 幂等。
      db.exec(`
        CREATE TABLE IF NOT EXISTS "EnvVar" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "projectId" TEXT NOT NULL,
            "key" TEXT NOT NULL,
            "value" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "EnvVar_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "EnvVar_projectId_key_key" ON "EnvVar"("projectId", "key");
        CREATE INDEX IF NOT EXISTS "EnvVar_projectId_idx" ON "EnvVar"("projectId");
      `);
    },
  },
  {
    name: '20260727000000_add_step_result_healed_locator',
    run: (db) => {
      // 自愈步骤找到的新定位器（Json 存为 TEXT），采纳时覆盖回原脚本对应步骤。
      addColumn(db, 'StepResult', 'healedLocator', 'TEXT');
    },
  },
  {
    name: '20260811000000_add_test_case_sort_order',
    run: (db) => {
      // 用例列表拖拽排序：sortOrder 小的在前；默认 0，已有数据保持 createdAt desc 兜底排序。
      addColumn(db, 'TestCase', 'sortOrder', 'INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    name: '20260804000000_add_login_configs',
    run: (db) => {
      // 项目级登录配置表（录制登录后的浏览器状态 storageState，Json 存为 TEXT）。CREATE IF NOT EXISTS 幂等。
      db.exec(`
        CREATE TABLE IF NOT EXISTS "LoginConfig" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "projectId" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "storageState" TEXT NOT NULL,
            "isDefault" BOOLEAN NOT NULL DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "LoginConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "LoginConfig_projectId_idx" ON "LoginConfig"("projectId");
      `);
    },
  },
  {
    name: '20260820000000_add_test_case_default_script',
    run: (db) => {
      // 用例的批量默认脚本版本（用例列表「批量版本」列选择后保存；未设置时批量取最新）。
      // SQLite 不支持 ALTER TABLE ADD CONSTRAINT，故不建外键：脚本删除后引用失效，
      // 批量运行时 find 不到会自动回退最新版本；应用层也校验脚本必须属于该用例。
      addColumn(db, 'TestCase', 'defaultScriptId', 'TEXT');
      // 一个用例只允许一个默认版本：为可空列建唯一索引（SQLite 允许多个 NULL）。
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "TestCase_defaultScriptId_key" ON "TestCase"("defaultScriptId");`);
    },
  },
  {
    name: '20260901000000_add_plugin_presets',
    run: (db) => {
      // 组件适配插件与预设（Project.presetId 关联，删除预设置空）。CREATE IF NOT EXISTS 幂等。
      db.exec(`
        CREATE TABLE IF NOT EXISTS "Plugin" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "version" TEXT NOT NULL DEFAULT '1.0.0',
            "description" TEXT,
            "kind" TEXT NOT NULL DEFAULT 'inpage',
            "entryFile" TEXT NOT NULL,
            "source" TEXT NOT NULL DEFAULT 'upload',
            "builtin" BOOLEAN NOT NULL DEFAULT false,
            "actions" JSONB,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "Plugin_name_key" ON "Plugin"("name");
        CREATE INDEX IF NOT EXISTS "Plugin_source_idx" ON "Plugin"("source");

        CREATE TABLE IF NOT EXISTS "PluginPreset" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "description" TEXT,
            "builtin" BOOLEAN NOT NULL DEFAULT false,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "PluginPreset_name_key" ON "PluginPreset"("name");

        CREATE TABLE IF NOT EXISTS "PluginPresetItem" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "presetId" TEXT NOT NULL,
            "pluginId" TEXT NOT NULL,
            "priority" INTEGER NOT NULL,
            CONSTRAINT "PluginPresetItem_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PluginPreset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "PluginPresetItem_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "Plugin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "PluginPresetItem_presetId_pluginId_key" ON "PluginPresetItem"("presetId", "pluginId");
        CREATE INDEX IF NOT EXISTS "PluginPresetItem_presetId_priority_idx" ON "PluginPresetItem"("presetId", "priority");
      `);
      // ⚠️ SQLite 不支持 ALTER TABLE ADD CONSTRAINT，老库 Project 已存在，加列时无法带上
      //    指向 PluginPreset 的外键（新装库从模板复制则自带）。删预设时的置空由应用层
      //    （plugins.ts DELETE /api/plugin-presets/:id）显式 updateMany 兜底，不依赖物理外键。
      addColumn(db, 'Project', 'presetId', 'TEXT');
    },
  },
  {
    name: '20260817000000_add_generation_logs',
    run: (db) => {
      // 生成脚本流程的会话与步骤记录。Prisma 把 Json 存为 TEXT（含 NULL）；CREATE IF NOT EXISTS 幂等。
      db.exec(`
        CREATE TABLE IF NOT EXISTS "GenerationLog" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "jobId" TEXT NOT NULL,
            "projectId" TEXT,
            "testCaseId" TEXT,
            "status" TEXT NOT NULL DEFAULT 'RUNNING',
            "nl" TEXT NOT NULL,
            "startUrl" TEXT,
            "finishedAt" DATETIME,
            "totalUsage" TEXT,
            "scriptSteps" TEXT,
            "error" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "GenerationLog_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "GenerationLog_jobId_key" ON "GenerationLog"("jobId");
        CREATE INDEX IF NOT EXISTS "GenerationLog_testCaseId_idx" ON "GenerationLog"("testCaseId");
        CREATE INDEX IF NOT EXISTS "GenerationLog_projectId_idx" ON "GenerationLog"("projectId");
        CREATE INDEX IF NOT EXISTS "GenerationLog_createdAt_idx" ON "GenerationLog"("createdAt");

        CREATE TABLE IF NOT EXISTS "GenerationStep" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "logId" TEXT NOT NULL,
            "type" TEXT NOT NULL,
            "stepIndex" INTEGER,
            "message" TEXT,
            "system" TEXT,
            "user" TEXT,
            "assistant" TEXT,
            "tool" TEXT,
            "args" TEXT,
            "result" TEXT,
            "error" TEXT,
            "usage" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "GenerationStep_logId_fkey" FOREIGN KEY ("logId") REFERENCES "GenerationLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "GenerationStep_logId_createdAt_idx" ON "GenerationStep"("logId", "createdAt");
      `);
      // ⚠️ 不要试图用 ALTER TABLE 给已存在的表补外键：SQLite 不支持 ADD CONSTRAINT，
      //    会报 near "FOREIGN": syntax error，后端启动即崩（前端表现为 "Load failed"）。
      //    外键只能在 CREATE TABLE 时定义——上面建表语句里已带上 testCaseId 的外键。
      //    老库（该迁移早已记录为 applied、表里无外键）就让它缺着：Prisma 关系查询不依赖
      //    物理外键；删除用例后日志的 testCaseId 悬空只是无害孤儿数据。
    },
  },
  {
    name: '20260901010000_add_generation_log_loop_state',
    run: (db) => {
      // 暂停时的循环状态快照（Json 存为 TEXT），供「继续生成」读回续跑。
      // 新装库从模板复制已带该列，addColumn 幂等跳过；升级安装的旧库在此补上。
      addColumn(db, 'GenerationLog', 'loopState', 'JSONB');
    },
  },
  {
    name: '20260903000000_add_project_viewport',
    run: (db) => {
      // 项目级浏览器窗口尺寸（Json 存为 TEXT），运行/生成脚本启动浏览器时生效；NULL = 默认 1920×1080。
      // 新装库从模板复制已带该列，addColumn 幂等跳过；升级安装的旧库在此补上。
      addColumn(db, 'Project', 'viewport', 'JSONB');
    },
  },
];

/** 从 Prisma 的 DATABASE_URL 解析出 SQLite 文件路径（file:./dev.db 或 file:/abs/app.db）。 */
function resolveDbPath(url: string): string {
  let p = url.startsWith('file:') ? url.slice('file:'.length) : url;
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q); // 去掉查询串（如 ?connection_limit=1）
  return p;
}

/** 启动前调用：把 SQLite 库迁到最新。 */
export function runMigrations(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 未设置，无法迁移 SQLite 库');
  const dbPath = resolveDbPath(url);

  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS "_app_migrations" (
        "name" TEXT NOT NULL PRIMARY KEY,
        "applied_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const applied = new Set(
      (db.prepare(`SELECT name FROM "_app_migrations"`).all() as { name: string }[]).map((r) => r.name),
    );

    for (const m of MIGRATIONS) {
      if (applied.has(m.name)) continue;
      const tx = db.transaction(() => {
        m.run(db);
        db.prepare(`INSERT INTO "_app_migrations" ("name") VALUES (?)`).run(m.name);
      });
      tx();
    }
  } finally {
    db.close();
  }
}
