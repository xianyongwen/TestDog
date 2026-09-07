-- GenerationLog.loopState：暂停时的循环状态快照（messages + 大纲 + 目标文本），供「继续生成」读回续跑。
-- 本文件仅作仓库记录（dev/prod 实际迁移见 src/migrate.ts 的 MIGRATIONS 幂等条目）。

-- AlterTable
ALTER TABLE "GenerationLog" ADD COLUMN "loopState" JSONB;
