-- 组件适配插件与预设（Project.presetId 关联，删除预设置空）。
-- 本文件仅作仓库记录（dev/prod 实际迁移见 src/migrate.ts 的 MIGRATIONS 幂等条目）。

-- CreateTable
CREATE TABLE "Plugin" (
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

-- CreateTable
CREATE TABLE "PluginPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PluginPresetItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presetId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    CONSTRAINT "PluginPresetItem_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PluginPreset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PluginPresetItem_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "Plugin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Plugin_name_key" ON "Plugin"("name");

-- CreateIndex
CREATE INDEX "Plugin_source_idx" ON "Plugin"("source");

-- CreateIndex
CREATE UNIQUE INDEX "PluginPreset_name_key" ON "PluginPreset"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PluginPresetItem_presetId_pluginId_key" ON "PluginPresetItem"("presetId", "pluginId");

-- CreateIndex
CREATE INDEX "PluginPresetItem_presetId_priority_idx" ON "PluginPresetItem"("presetId", "priority");

-- AlterTable（老库 Project 已存在，SQLite 无法 ALTER 补外键，置空由应用层兜底）
ALTER TABLE "Project" ADD COLUMN "presetId" TEXT;
