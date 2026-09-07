-- AlterTable
ALTER TABLE "TestCase" ADD COLUMN "defaultScriptId" TEXT;

-- 用例删除脚本时置空默认版本，批量运行自动退回最新版本
CREATE UNIQUE INDEX "TestCase_defaultScriptId_key" ON "TestCase"("defaultScriptId");
