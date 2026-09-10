import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  createStep: vi.fn(async () => ({})),
  updateStep: vi.fn(async () => ({})),
  findSteps: vi.fn(async () => []),
  findLog: vi.fn(async () => null),
  updateLog: vi.fn(async () => ({})),
}));

vi.mock('../src/db', () => ({
  prisma: {
    generationStep: {
      create: mocks.createStep,
      updateMany: mocks.updateStep,
      findMany: mocks.findSteps,
    },
    generationLog: {
      findUnique: mocks.findLog,
      update: mocks.updateLog,
    },
  },
}));
vi.mock('../src/ws/hub', () => ({
  publish: mocks.publish,
  registerCancel: vi.fn(),
  unregisterCancel: vi.fn(),
}));
vi.mock('../src/services/stagehandManager', () => ({ closeSession: vi.fn(async () => {}) }));

import { addUsage, clearUsage, initUsage } from '../src/services/tokenUsage';
import { flushGenerationLogWrites, reconcileTotalUsage } from '../src/services/generationLogService';
import { activeLogIds, pub } from '../src/services/generation/logBridge';
import { releaseJob } from '../src/services/generation/jobControl';

const JOB = 'cancel-usage-job';
const LOG = 'cancel-usage-log';

afterEach(() => {
  clearUsage(JOB);
  activeLogIds.clear();
  vi.clearAllMocks();
  mocks.createStep.mockResolvedValue({});
  mocks.updateStep.mockResolvedValue({});
  mocks.findSteps.mockResolvedValue([]);
  mocks.findLog.mockResolvedValue(null);
  mocks.updateLog.mockResolvedValue({});
});

describe('生成取消后的 usage 收尾', () => {
  it('对账会用仍在内存中的在途调用累计补齐头部', async () => {
    initUsage(JOB);
    addUsage(JOB, { inputTokens: 282402, outputTokens: 10472, totalTokens: 292874, cachedTokens: 241536 });
    mocks.findSteps.mockResolvedValue([
      { usage: { inputTokens: 282402, outputTokens: 10472, totalTokens: 292874, cachedTokens: 241536 } },
    ]);
    mocks.findLog.mockResolvedValue({
      jobId: JOB,
      totalUsage: { inputTokens: 282402, outputTokens: 10472, totalTokens: 292874, cachedTokens: 241536 },
    });

    // 模拟运行时累计已经包含最后一个在途请求。
    addUsage(JOB, { inputTokens: 16501, outputTokens: 840, totalTokens: 17341, cachedTokens: 14080 });
    await reconcileTotalUsage(LOG);

    expect(mocks.updateLog).toHaveBeenLastCalledWith({
      where: { id: LOG },
      data: { totalUsage: { inputTokens: 298903, outputTokens: 11312, totalTokens: 310215, cachedTokens: 255616 } },
    });
  });

  it('终态消息不会提前解绑日志，取消后返回的最后工具步骤仍会落库', async () => {
    activeLogIds.set(JOB, LOG);
    pub({
      type: 'gen:error',
      jobId: JOB,
      message: '已取消',
      usage: { inputTokens: 282402, outputTokens: 10472, totalTokens: 292874, cachedTokens: 241536 },
    });
    expect(activeLogIds.get(JOB)).toBe(LOG);

    pub({
      type: 'gen:tool',
      jobId: JOB,
      index: 31,
      step: { actionLabel: '点击', actionDetail: '取消期间已开始的操作', result: '已返回' },
      usage: { inputTokens: 16501, outputTokens: 840, totalTokens: 17341, cachedTokens: 14080 },
    });
    await flushGenerationLogWrites(LOG, JOB);

    const created = mocks.createStep.mock.calls.map(([arg]) => arg.data);
    expect(created.some((row) => row.type === 'error')).toBe(true);
    expect(created.some((row) => row.type === 'tool' && row.usage?.totalTokens === 17341)).toBe(true);

    releaseJob(JOB, false);
    expect(activeLogIds.has(JOB)).toBe(false);
  });
});
