import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(async (args: any) => args.data), update: vi.fn(async (args: any) => args.data), caseCreate: vi.fn(async () => ({ id: 'case' })) }));
vi.mock('../src/db', () => ({ prisma: {
  testScript: { create: mocks.create, update: mocks.update, findFirst: async () => ({ version: 1 }), findUnique: async () => ({ id: 'script' }) },
  $transaction: (fn: any) => fn({ testCase: { create: mocks.caseCreate }, testScript: { create: mocks.create } }),
} }));
import scriptRoutes from '../src/routes/scripts';
import caseRoutes from '../src/routes/testCases';
const intent = { version: 1, scenario: 'positive', objective: '正确结果', preconditions: [], data: [], cleanup: [], criteria: [
  { id: 'C1', description: '字段准确', target: '名称字段', source: '用户要求', required: true, assertion: { type: 'value', expected: '' } },
] };
const steps = [{ kind: 'assert', action: 'assert', criterionId: 'C1', locator: { strategy: 'testid', value: 'name' }, assertion: { type: 'value', expected: '' } }];
afterEach(() => vi.clearAllMocks());

describe('验收约定随脚本持久化', () => {
  it('新版本保存意图和强断言，更新步骤时不覆盖已有意图', async () => {
    const app = Fastify();
    await app.register(scriptRoutes);
    try {
      const saved = await app.inject({ method: 'POST', url: '/api/test-cases/case/scripts', payload: { steps, intent } });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ version: 2, intent, steps });
      const updated = await app.inject({ method: 'PUT', url: '/api/scripts/script', payload: { steps } });
      expect(updated.statusCode).toBe(200);
      expect(mocks.update.mock.calls[0][0].data.intent).toBeUndefined();
      const invalid = await app.inject({ method: 'POST', url: '/api/test-cases/case/scripts', payload: { steps, intent: { ...intent, criteria: [] } } });
      expect(invalid.statusCode).toBe(400);
      expect(mocks.create).toHaveBeenCalledTimes(1);
    } finally { await app.close(); }
  });

  it('导入保留意图和目标关联；旧脚本 intent=null 仍可导入和另存', async () => {
    const app = Fastify();
    await app.register(scriptRoutes);
    await app.register(caseRoutes);
    try {
      const imported = await app.inject({ method: 'POST', url: '/api/projects/project/test-cases/import', payload: { title: '测试', steps, intent } });
      expect(imported.statusCode).toBe(200);
      expect(mocks.create.mock.calls[0][0].data).toMatchObject({ steps, intent });
      for (const url of ['/api/projects/project/test-cases/import', '/api/test-cases/case/scripts']) {
        const legacy = await app.inject({ method: 'POST', url, payload: { title: '旧测试', steps, intent: null } });
        expect(legacy.statusCode).toBe(200);
      }
    } finally { await app.close(); }
  });
});
