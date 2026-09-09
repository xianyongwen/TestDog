import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { z } from 'zod';
import { testStepSchema } from '../shared/testScript';
import { testIntentSchema } from '../shared/testIntent';
const scriptBody = z.object({ steps: z.array(testStepSchema).optional(), rawCode: z.string().optional(), intent: testIntentSchema.nullish().transform(value => value ?? undefined) });

export default async function scriptRoutes(app: FastifyInstance) {
  app.get('/api/test-cases/:testCaseId/scripts', async (req) =>
    prisma.testScript.findMany({
      where: { testCaseId: (req.params as { testCaseId: string }).testCaseId },
      orderBy: { version: 'desc' },
    }),
  );

  app.get('/api/scripts/:id', async (req, reply) => {
    const script = await prisma.testScript.findUnique({
      where: { id: (req.params as { id: string }).id },
    });
    if (!script) return reply.code(404).send({ error: '脚本不存在' });
    return script;
  });

  /** 保存脚本为新版本（version 自动递增）。 */
  app.post('/api/test-cases/:testCaseId/scripts', async (req, reply) => {
    const testCaseId = (req.params as { testCaseId: string }).testCaseId;
    const parsed = scriptBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues.map(i => i.message).join('；') });
    const { steps, rawCode, intent } = parsed.data;
    if (!Array.isArray(steps)) return reply.code(400).send({ error: '缺少 steps' });
    const last = await prisma.testScript.findFirst({
      where: { testCaseId },
      orderBy: { version: 'desc' },
    });
    const version = (last?.version ?? 0) + 1;
    return prisma.testScript.create({
      data: { testCaseId, version, steps, rawCode, intent },
    });
  });

  /** 原地更新脚本步骤（不增加版本号）。 */
  app.put('/api/scripts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = scriptBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues.map(i => i.message).join('；') });
    const { steps, rawCode, intent } = parsed.data;
    const existing = await prisma.testScript.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: '脚本不存在' });
    return prisma.testScript.update({ where: { id }, data: { steps, rawCode, intent } });
  });

  app.delete('/api/scripts/:id', async (req) => {
    const { id } = req.params as { id: string };
    await prisma.testScript.delete({ where: { id } });
    return { ok: true };
  });
}
