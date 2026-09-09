import { testIntentSchema } from '../shared/testIntent';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { testStepSchema } from '../shared/testScript';
import { cleanupScreenshots } from './runs';

export default async function testCaseRoutes(app: FastifyInstance) {
  app.get('/api/projects/:projectId/test-cases', async (req) =>
    prisma.testCase.findMany({
      where: { projectId: (req.params as { projectId: string }).projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { scripts: true, runs: true } } },
    }),
  );

  app.post('/api/projects/:projectId/test-cases', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const { title, description, naturalLanguage } = (req.body ?? {}) as {
      title?: string;
      description?: string;
      naturalLanguage?: string;
    };
    if (!title) return reply.code(400).send({ error: '缺少用例标题' });
    return prisma.testCase.create({
      data: { projectId, title, description, naturalLanguage },
    });
  });

  /** 导入 .testcase 文件：创建用例并写入首个脚本版本（原子事务）。 */
  app.post('/api/projects/:projectId/test-cases/import', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = (req.body ?? {}) as {
      title?: string;
      description?: string;
      naturalLanguage?: string;
      intent?: unknown;
      steps?: unknown;
      rawCode?: string;
    };
    if (!body.title) return reply.code(400).send({ error: '缺少用例标题' });
    const stepsResult = z.array(testStepSchema).safeParse(body.steps);
    if (!stepsResult.success) return reply.code(400).send({ error: '步骤数据格式不正确' });
    const intentResult = testIntentSchema.nullish().transform(value => value ?? undefined).safeParse(body.intent);
    if (!intentResult.success) return reply.code(400).send({ error: '测试意图格式不正确' });
    return prisma.$transaction(async (tx) => {
      const tc = await tx.testCase.create({
        data: { projectId, title: body.title!, description: body.description ?? null, naturalLanguage: body.naturalLanguage ?? null },
      });
      await tx.testScript.create({
        data: { testCaseId: tc.id, version: 1, steps: stepsResult.data, intent: intentResult.data, rawCode: body.rawCode ?? null },
      });
      return tc;
    });
  });

  app.get('/api/test-cases/:id', async (req, reply) => {
    const tc = await prisma.testCase.findUnique({
      where: { id: (req.params as { id: string }).id },
      include: {
        // 仅取环境变量键（值属敏感数据，步骤编辑器只需键做 {{var}} 校验）
        project: {
          include: {
            envVars: { select: { key: true } },
            loginConfigs: { select: { id: true, name: true, isDefault: true }, orderBy: { createdAt: 'desc' } },
          },
        },
        scripts: { orderBy: { version: 'desc' } },
        runs: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!tc) return reply.code(404).send({ error: '用例不存在' });
    return tc;
  });

  app.put('/api/test-cases/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { title, description, naturalLanguage, status, defaultScriptId } = body;

    // 保存「批量默认版本」：null/空串 清除；否则校验脚本必须属于该用例。
    let defaultScript: string | null | undefined = undefined;
    if ('defaultScriptId' in body) {
      const sid = (defaultScriptId as string | null | undefined) ?? null;
      if (sid) {
        const owned = await prisma.testScript.findFirst({ where: { id: sid, testCaseId: id }, select: { id: true } });
        if (!owned) return reply.code(400).send({ error: '脚本不属于该用例' });
      }
      defaultScript = sid;
    }

    return prisma.testCase.update({
      where: { id },
      data: { title, description, naturalLanguage, status, defaultScriptId: defaultScript } as Record<string, unknown>,
    });
  });

  app.delete('/api/test-cases/:id', async (req) => {
    const { id } = req.params as { id: string };
    // DB 行由外键级联删除，但截图 PNG 文件需手动清理（与删除运行记录的路由一致）。
    const runs = await prisma.testRun.findMany({ where: { testCaseId: id }, select: { id: true } });
    await cleanupScreenshots(runs.map((r) => r.id));
    await prisma.testCase.delete({ where: { id } });
    return { ok: true };
  });

  /** 保存用例列表拖拽后的顺序：ids 为完整有序列表，sortOrder 按数组下标赋值（事务）。 */
  app.put('/api/projects/:projectId/test-cases/order', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = (req.body ?? {}) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
    if (!ids.length) return reply.code(400).send({ error: '缺少 ids' });
    const owned = new Set(
      (await prisma.testCase.findMany({ where: { projectId }, select: { id: true } })).map((t) => t.id),
    );
    if (ids.some((id) => !owned.has(id))) return reply.code(400).send({ error: '包含不属于该项目的用例' });
    await prisma.$transaction(
      ids.map((id, index) => prisma.testCase.update({ where: { id }, data: { sortOrder: index } })),
    );
    return { ok: true };
  });

  /** 批量删除用例：请求体携带 ids 数组，使用 deleteMany 一次完成（关联脚本/运行通过级联自动删除）。 */
  app.delete('/api/test-cases', async (req, reply) => {
    const body = (req.body ?? {}) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
    if (!ids.length) return reply.code(400).send({ error: '缺少 ids' });
    // DB 行由外键级联删除，但截图 PNG 文件需手动清理（与删除运行记录的路由一致）。
    const runs = await prisma.testRun.findMany({ where: { testCaseId: { in: ids } }, select: { id: true } });
    await cleanupScreenshots(runs.map((r) => r.id));
    const { count } = await prisma.testCase.deleteMany({ where: { id: { in: ids } } });
    return { ok: true, count };
  });
}
