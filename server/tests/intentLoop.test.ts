import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ drive: vi.fn(), pub: vi.fn() }));
vi.mock('../src/db', () => ({ prisma: {} }));
vi.mock('../src/services/pluginStore', () => ({ enabledActionVocabulary: async () => [] }));
vi.mock('../src/services/generation/logBridge', () => ({ pub: mocks.pub, pubToolWithUsage: vi.fn(), updateToolAssistant: vi.fn() }));
vi.mock('../src/services/toolLoop', () => ({ runToolLoop: (options: any) => mocks.drive(options), usageDelta: () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 }) }));
vi.mock('../src/services/networkCaptureService', () => ({ NetworkCapture: class { attach() {} dispose() {} } }));
vi.mock('../src/services/generation/jobControl', () => ({ revokeHandlers: new Map(), askUser: vi.fn() }));
vi.mock('../src/services/generation/manualCapture', () => ({ createManualCapture: () => vi.fn() }));
import { runGenerationLoop } from '../src/services/generation/generationLoop';
import type { TestIntent } from '../src/shared/testIntent';
import type { TestStep } from '../src/shared/testScript';
import type { AssertionEvidence } from '../src/services/generation/intentCoverage';

const intent: TestIntent = { version: 1, scenario: 'positive', objective: '完成后进入指定结果页', preconditions: [], data: [], cleanup: [], criteria: [
  { id: 'C1', description: '结果页正确', target: '浏览器 URL', source: '需求指定 URL', required: true, assertion: { type: 'url_exact', expected: 'https://test.local/done' } },
] };
function options(steps: TestStep[], evidence: AssertionEvidence[]) {
  return { jobId: 'intent-loop', pwPage: {}, page: { url: () => 'https://test.local/done' }, client: { chat: { completions: { create: vi.fn(async () => ({ choices: [{ message: { content: '{"ops":[]}' } }] })) } } },
    cfg: { openaiModel: 'mock', maxSteps: 20 }, stagehand: {}, modelVision: false, envMap: {}, envVarHint: '', sub: (s?: string) => s,
    emit: async (step: TestStep) => { steps.push(step); }, steps, goalText: intent.objective, intent, evidence, outline: [], logId: null,
    isCancelled: () => false, onCheckpoint: vi.fn(),
  } as any;
}
const invokeAssert = (o: any) => o.tools.find((t: any) => t.name === 'assert').execute({ type: 'url_exact', expected: 'https://test.local/done', criterionId: 'C1', instruction: '验证结果页' });
afterEach(() => { vi.clearAllMocks(); });

describe('完成门槛在生成循环内的集成', () => {
  it('finish 拒绝无证据声明；真实 assert 通过后才完成，并保存可续跑证据', async () => {
    const steps: TestStep[] = [];
    const evidence: AssertionEvidence[] = [];
    mocks.drive.mockImplementation(async o => {
      await expect(o.tools.find((t: any) => t.name === 'finish').execute({ message: '所有目标完成' })).rejects.toThrow('结尾');
      await invokeAssert(o);
      expect(await o.validateFinish()).toBeNull();
      return { finished: true, steps: 2 };
    });
    expect((await runGenerationLoop(options(steps, evidence))).ok).toBe(true);
    expect(evidence).toHaveLength(1);
    expect(mocks.pub).toHaveBeenCalledWith(expect.objectContaining({ type: 'gen:coverage', coverage: [expect.objectContaining({ id: 'C1', passed: true })] }));
    const saved = JSON.parse(JSON.stringify({ steps, evidence }));
    mocks.drive.mockImplementation(async o => {
      expect(await o.validateFinish()).toBeNull();
      return { finished: true, steps: 0 };
    });
    expect((await runGenerationLoop({ ...options([], saved.evidence), baseSteps: saved.steps })).ok).toBe(true);
  });

  it('全局审查删除已验证目标后再次校验，不能用审查前的成功放行', async () => {
    const steps: TestStep[] = [
      { kind: 'action', action: 'fill', value: 'a' },
      { kind: 'action', action: 'click' },
    ];
    const evidence: AssertionEvidence[] = [];
    const opts = options(steps, evidence);
    // 审查移除第 3 步关键断言，保留第 4 步不相关的断言。
    opts.client.chat.completions.create.mockResolvedValue({ choices: [{ message: { content: '{"ops":[{"op":"delete","from":3,"to":3}]}' } }] });
    mocks.drive.mockImplementation(async o => {
      await invokeAssert(o);
      await o.tools.find((t: any) => t.name === 'assert').execute({ type: 'url', expected: 'test.local', instruction: '其他断言' });
      expect(await o.validateFinish()).toContain('C1');
      await invokeAssert(o);
      expect(await o.validateFinish()).toBeNull();
      return { finished: true, steps: 4 };
    });
    expect((await runGenerationLoop(opts)).ok).toBe(true);
    expect(opts.client.chat.completions.create).toHaveBeenCalledTimes(1);
  });
});
