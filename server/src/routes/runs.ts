import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../db';
import { runBatch, runScript } from '../services/runnerService';
import { publish } from '../ws/hub';
import { getScreenshotDir } from '../config';
import type { TestStep, Locator } from '../shared/testScript';

/** 删除指定 run 列表在 screenshots/ 目录下关联的 PNG（命名规则 `${runId}_${stepIndex}.png`）。 */
export async function cleanupScreenshots(runIds: string[]): Promise<number> {
  if (!runIds.length) return 0;
  const dir = getScreenshotDir();
  const escaped = new Set(runIds.map((id) => `${id}_`));
  let entries: string[];
  try {
    entries = await fs.promises.readdir(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of entries) {
    if (!name.endsWith('.png')) continue;
    if (![...escaped].some((prefix) => name.startsWith(prefix))) continue;
    try {
      await fs.promises.unlink(path.join(dir, name));
      removed++;
    } catch (e) {
      console.warn(`[runs] 删除截图失败 ${name}:`, e);
    }
  }
  return removed;
}

export default async function runRoutes(app: FastifyInstance) {
  /** 全部运行记录（最近 100 条，含用例标题）。 */
  app.get('/api/runs', async () =>
    prisma.testRun.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: { testCase: { select: { id: true, title: true } } },
    }),
  );

  /** 启动回放：立即返回 jobId，进度经 WS 推送（run:start / run:step / run:done）。headless=true 无头运行。 */
  app.post('/api/runs', async (req) => {
    const { testCaseId, scriptId, steps, selfHeal, headless, loginConfigId } = (req.body ?? {}) as {
      testCaseId?: string;
      scriptId?: string;
      steps?: TestStep[];
      selfHeal?: boolean;
      headless?: boolean;
      loginConfigId?: string;
    };
    if (!testCaseId || !Array.isArray(steps)) return { error: '缺少 testCaseId 或 steps' };
    const jobId = randomUUID();
    runScript(jobId, { testCaseId, scriptId, steps, selfHeal, headless, loginConfigId }).catch((e) =>
      publish({ type: 'run:done', jobId, status: 'ERROR', message: String(e) }),
    );
    return { jobId };
  });

  /** 批量运行：逐个用例回放（默认最新版本），进度经 WS 推送（batch:case / run:step / batch:done）。
   *  scriptIds 为可选的对象映射 testCaseId -> scriptId，指定用例应运行的脚本版本；未指定的用例取最新版本。 */
  app.post('/api/runs/batch', async (req) => {
    const { testCaseIds, selfHeal, loginConfigId, scriptIds } = (req.body ?? {}) as {
      testCaseIds?: string[];
      selfHeal?: boolean;
      loginConfigId?: string;
      scriptIds?: Record<string, string>;
    };
    if (!Array.isArray(testCaseIds) || !testCaseIds.length) return { error: '缺少 testCaseIds' };
    const jobId = randomUUID();
    runBatch(jobId, testCaseIds, { selfHeal, loginConfigId, scriptIds }).catch((e) =>
      publish({ type: 'batch:done', jobId, status: 'ERROR', message: String(e) }),
    );
    return { jobId };
  });

  app.get('/api/test-cases/:testCaseId/runs', async (req) =>
    prisma.testRun.findMany({
      where: { testCaseId: (req.params as { testCaseId: string }).testCaseId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { stepResults: true } } },
    }),
  );

  app.get('/api/runs/:id', async (req, reply) => {
    const run = await prisma.testRun.findUnique({
      where: { id: (req.params as { id: string }).id },
      include: { stepResults: { orderBy: { stepIndex: 'asc' } }, script: true, testCase: true },
    });
    if (!run) return reply.code(404).send({ error: '运行记录不存在' });
    return run;
  });

  /**
   * 采纳某自愈步骤的新定位器：把自愈找到的定位器原地覆盖回原脚本对应步骤的 locator。
   * 仅更新 run.scriptId 指向的脚本（不新增版本）；若脚本已变更导致步骤不再对应则拒绝。
   */
  app.post('/api/runs/:id/adopt', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { stepIndex } = (req.body ?? {}) as { stepIndex?: number };
    if (stepIndex == null || !Number.isInteger(stepIndex) || stepIndex < 0) {
      return reply.code(400).send({ error: '缺少有效的 stepIndex' });
    }
    const run = await prisma.testRun.findUnique({
      where: { id },
      include: { stepResults: { where: { stepIndex } } },
    });
    if (!run) return reply.code(404).send({ error: '运行记录不存在' });
    const sr = run.stepResults[0];
    if (!sr) return reply.code(404).send({ error: '步骤结果不存在' });
    if (!sr.healed || !sr.healedLocator) {
      return reply.code(400).send({ error: '该步骤未自愈或无新定位器，无法采纳' });
    }
    if (!run.scriptId) return reply.code(400).send({ error: '该运行未关联脚本，无法采纳' });
    const script = await prisma.testScript.findUnique({ where: { id: run.scriptId } });
    if (!script) return reply.code(404).send({ error: '关联脚本不存在' });
    const steps = ((script.steps as TestStep[]) ?? []).map((s) => ({ ...s }));
    if (stepIndex >= steps.length) return reply.code(400).send({ error: '步骤索引越界，脚本已变更' });
    if (steps[stepIndex].action !== sr.action) {
      return reply.code(409).send({ error: '脚本已变更，该步骤不再对应，无法采纳（请重新运行）' });
    }
    steps[stepIndex] = { ...steps[stepIndex], locator: sr.healedLocator as Locator };
    await prisma.testScript.update({ where: { id: script.id }, data: { steps } });
    return { ok: true, scriptId: script.id, version: script.version, stepIndex };
  });

  /** 提供截图文件（仅允许 PNG 文件名，防止路径穿越）。 */
  app.get('/api/screenshots/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    if (!/^[a-zA-Z0-9_\-]+\.png$/.test(filename)) {
      return reply.code(400).send({ error: '无效的文件名' });
    }
    const filePath = path.join(getScreenshotDir(), filename);
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: '截图不存在' });
    const data = await fs.promises.readFile(filePath);
    return reply.type('image/png').send(data);
  });

  app.delete('/api/runs/:id', async (req) => {
    const { id } = req.params as { id: string };
    await cleanupScreenshots([id]);
    await prisma.testRun.delete({ where: { id } });
    return { ok: true };
  });

  /** 清除所有运行记录。 */
  app.delete('/api/runs', async () => {
    const ids = await prisma.testRun.findMany({ select: { id: true } });
    const files = await cleanupScreenshots(ids.map((r) => r.id));
    const { count } = await prisma.testRun.deleteMany();
    return { ok: true, count, files };
  });

  /** 清除指定用例的所有运行记录（连带 stepResults + 截图文件）。 */
  app.delete('/api/test-cases/:testCaseId/runs', async (req) => {
    const { testCaseId } = req.params as { testCaseId: string };
    const ids = await prisma.testRun.findMany({ where: { testCaseId }, select: { id: true } });
    const files = await cleanupScreenshots(ids.map((r) => r.id));
    const { count } = await prisma.testRun.deleteMany({ where: { testCaseId } });
    return { ok: true, count, files };
  });
}
