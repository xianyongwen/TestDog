import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ drive: vi.fn(), pub: vi.fn(), askUser: vi.fn() }));
vi.mock('../src/db', () => ({ prisma: {} }));
vi.mock('../src/services/pluginStore', () => ({ enabledActionVocabulary: async () => [] }));
vi.mock('../src/services/generation/logBridge', () => ({ pub: mocks.pub, pubToolWithUsage: vi.fn(), updateToolAssistant: vi.fn(), activeLogIds: new Map() }));
vi.mock('../src/services/toolLoop', () => ({ runToolLoop: (options: any) => mocks.drive(options), usageDelta: () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 }) }));
vi.mock('../src/services/networkCaptureService', () => ({ NetworkCapture: class { attach() {} dispose() {} } }));
vi.mock('../src/services/generation/jobControl', () => ({ revokeHandlers: new Map(), askUser: mocks.askUser }));
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

describe('断言失败计数与验收目标修订（cmtwv3up8 C4 死锁教训）', () => {
  const CONTRACT_ERR = 'AssertionContractError: 目标 C1 必须使用已确认的断言 {"type":"url_exact","expected":"https://test.local/done"}，不能替换或弱化预期';
  const REAL_FAIL = 'Error: 断言未通过（url）：期望 /nope，实际 https://test.local/done';

  it('合同错误不计数、不触发自动求助，回灌修订指引', async () => {
    const steps: TestStep[] = [];
    mocks.drive.mockImplementation(async (o: any) => {
      for (let i = 0; i < 3; i++) {
        const r = await o.onFailure('assert', { type: 'url_exact', expected: 'https://test.local/other', instruction: 'x' }, CONTRACT_ERR);
        expect(r).toContain('重试不可能通过');
      }
      expect(mocks.askUser).not.toHaveBeenCalled();
      return { finished: true, steps: 0 };
    });
    expect((await runGenerationLoop(options(steps, []))).ok).toBe(true);
  });

  it('真实断言失败 2 次触发求助；用户修订验收目标后按新标准放行', async () => {
    const steps: TestStep[] = [];
    // 独立 intent 副本：applyAmend 原地 Object.assign，避免污染模块级 fixture
    const myIntent: TestIntent = { ...intent, criteria: [{ ...intent.criteria[0] }] };
    const amended = { ...myIntent, criteria: [{ ...myIntent.criteria[0], assertion: { type: 'url_exact', expected: 'https://test.local/amended' } }] };
    mocks.askUser.mockResolvedValue({ decision: 'amend', intent: amended });
    const opts = { ...options(steps, []), intent: myIntent };
    mocks.drive.mockImplementation(async (o: any) => {
      // 真实失败（无 criterion 的 url 断言，timeoutMs 0 立即失败）：第 2 次触发自动求助
      await expect(o.onFailure('assert', { type: 'url', expected: '/nope', instruction: 'y' }, REAL_FAIL)).resolves.toBeNull();
      const override = await o.onFailure('assert', { type: 'url', expected: '/nope', instruction: 'y' }, REAL_FAIL);
      expect(override).toContain('验收目标已修订');
      expect(mocks.askUser).toHaveBeenCalledTimes(1);
      // 修订后护栏按新标准放行：模拟页面已呈现修订后的 URL（opts.page 与 ctx.page 同引用）
      (opts.page as any).url = () => 'https://test.local/amended';
      await o.tools.find((t: any) => t.name === 'assert').execute({ type: 'url_exact', expected: 'https://test.local/amended', criterionId: 'C1', instruction: '验证修订后结果页' });
      expect(await o.validateFinish()).toBeNull();
      return { finished: true, steps: 0 };
    });
    expect((await runGenerationLoop(opts)).ok).toBe(true);
    // amend 后广播 gen:coverage 携带最新意图，前端编辑器随之同步
    expect(mocks.pub).toHaveBeenCalledWith(expect.objectContaining({ type: 'gen:coverage', intent: expect.objectContaining({ criteria: [expect.objectContaining({ assertion: { type: 'url_exact', expected: 'https://test.local/amended' } })] }) }));
  });

  it('换定位策略的重试独立计数，不与「同目标重试」混计（cmty5gvbj 弹窗断言误求助）', async () => {
    const steps: TestStep[] = [];
    mocks.askUser.mockResolvedValue(null);
    mocks.drive.mockImplementation(async (o: any) => {
      const textLoc = { type: 'visible', locator: { strategy: 'text', value: '新建互动事件' }, instruction: '弹窗已打开' };
      const cssLoc = { type: 'visible', locator: { strategy: 'css', value: '.ant-modal-content' }, instruction: '弹窗已打开' };
      await expect(o.onFailure('assert', textLoc, REAL_FAIL)).resolves.toBeNull();
      await expect(o.onFailure('assert', cssLoc, REAL_FAIL)).resolves.toBeNull(); // 换定位器 = 自我纠正，独立计数不触发
      expect(mocks.askUser).not.toHaveBeenCalled();
      await expect(o.onFailure('assert', textLoc, REAL_FAIL)).resolves.toContain('人工协助超时'); // 同定位器第 2 次：触发求助
      expect(mocks.askUser).toHaveBeenCalledTimes(1);
      return { finished: true, steps: 0 };
    });
    expect((await runGenerationLoop(options(steps, []))).ok).toBe(true);
  });
});
