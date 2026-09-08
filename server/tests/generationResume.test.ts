import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pub: vi.fn(), update: vi.fn(async (_args: any) => ({})), find: vi.fn(async () => null),
  run: vi.fn(), finalize: vi.fn(async () => {}),
}));
vi.mock('../src/db', () => ({ prisma: { generationLog: { update: mocks.update, findUnique: mocks.find } } }));
vi.mock('../src/config', () => ({ getConfig: () => ({ openaiModel: 'mock', openaiModelVision: false }), isConfigured: () => true, DEFAULT_SPLIT_SYSTEM_PROMPT: '' }));
vi.mock('../src/ws/hub', () => ({ registerCancel: vi.fn(), unregisterCancel: vi.fn() }));
vi.mock('../src/services/stagehandManager', () => ({
  createSession: async () => ({}), createSessionWithStorageState: async () => ({}),
  getSession: () => ({}), sessionPage: async () => ({ title: async () => 'test', url: async () => 'https://example.test' }),
  createGatewayClient: () => ({}), onSessionBrowserClosed: vi.fn(), closeSession: vi.fn(async () => {}),
}));
vi.mock('../src/services/generationLogService', () => ({ appendStep: vi.fn(), upsertLog: async () => 'log', STEP_TYPE: {} }));
vi.mock('../src/services/generation/logBridge', () => ({ pub: mocks.pub, activeLogIds: new Map() }));
vi.mock('../src/services/generation/generationLoop', () => ({ runGenerationLoop: mocks.run }));
vi.mock('../src/services/generation/preSplit', () => ({ preSplit: async () => ({ steps: [{kind: 'assert', instruction: '验证'}], usage: {} }), splitSystemWithVocab: async () => '' }));
vi.mock('../src/services/generation/sessionSetup', async () => {
  const { createSubstituter } = await import('../src/services/generation/substitution');
  return {
    createSubstituter, buildEnvVarHint: () => '', loadGenAttachments: () => ({ text: '', images: [] }),
    loadProjectViewport: async () => null, setupGenPage: async () => ({pwBrowser: {}, pwPage: {}}),
    finalizeGenJob: mocks.finalize,
    createStepEmitter: (_job: string, steps: any[]) => async (step: any) => { steps.push(step); },
  };
});

import { generate, continueGenerate } from '../src/services/generationService';
import { confirmPlan, pauseJob, isJobRunning, releaseJob } from '../src/services/generation/jobControl';
import { clearCheckpoint, loadCheckpoint, saveCheckpoint } from '../src/services/generation/checkpoint';
import { setGenerationEnvironment, clearGenerationEnvironment } from '../src/services/generation/privacy';

const JOB = 'resume-regression';
afterEach(() => {
  releaseJob(JOB, false); clearCheckpoint(JOB); clearGenerationEnvironment(JOB);
  vi.clearAllMocks(); mocks.run.mockReset();
});

function confirmAutomatically() {
  mocks.pub.mockImplementation((msg: any) => {
    // 与 UI 一样，在计划进入等待状态后确认。
    if (msg.type === 'gen:plan') queueMicrotask(() => confirmPlan(msg.jobId, msg.steps));
  });
}

describe('生成检查点与续跑', () => {
  it('首次暂停、直接续跑暂停、常规继续暂停都保存最新消息、步骤和变量', async () => {
    confirmAutomatically();
    const values: string[] = [];
    let round = 0;
    mocks.run.mockImplementation(async (options: any) => {
      values.push(options.sub('{{randomEmail}}'));
      await options.emit({ kind: 'action', action: 'fill', value: '{{randomEmail}}', instruction: `round-${++round}` });
      options.onCheckpoint([{ role: 'user', content: `round-${round}` }]);
      expect(pauseJob(JOB)).toBe(true);
      expect(isJobRunning(JOB)).toBe(true);
      return { ok: false, messages: [] };
    });
    await generate(JOB, { nl: '生成测试' });
    const first = (await loadCheckpoint(JOB))!;
    expect(first.steps).toHaveLength(1);
    expect(first.messages[0].content).toBe('round-1');
    expect(isJobRunning(JOB)).toBe(false);
    await continueGenerate(JOB, { nl: '继续', baseSteps: first.steps, resumeLoop: true });
    const second = (await loadCheckpoint(JOB))!;
    expect(second.steps).toHaveLength(2);
    expect(second.messages[0].content).toBe('round-2');
    expect(mocks.run.mock.calls[1][0].resumeMessages.at(-1).content).toContain('round-1');
    await continueGenerate(JOB, { nl: '追加测试', baseSteps: second.steps });
    const third = (await loadCheckpoint(JOB))!;
    expect(third.steps).toHaveLength(3);
    expect(third.messages[0].content).toBe('round-3');
    expect(values[1]).toBe(values[0]);
    expect(values[2]).toBe(values[0]);
    expect(third.substitution.startedAt).toBe(first.substitution.startedAt);
    expect(mocks.update).toHaveBeenCalledTimes(3);
  });

  it('保存和清理完成后才广播已暂停；收尾期间拒绝第二个循环', async () => {
    confirmAutomatically();
    let resolveCleanup!: () => void;
    mocks.finalize.mockImplementationOnce(() => new Promise<void>(resolve => { resolveCleanup = resolve; }));
    mocks.run.mockImplementation(async (options: any) => {
      options.onCheckpoint([{ role: 'user', content: '最新状态' }]);
      pauseJob(JOB);
      return {ok: false};
    });
    const pending = generate(JOB, {nl: 'test'});
    await vi.waitFor(() => expect(resolveCleanup).toBeTypeOf('function'));
    expect(mocks.pub.mock.calls.some(([msg]) => msg.type === 'gen:paused')).toBe(false);
    await expect(continueGenerate(JOB, {nl: '继续', baseSteps: []})).rejects.toThrow('暂停收尾');
    resolveCleanup();
    await pending;
    expect(isJobRunning(JOB)).toBe(false);
    const pausedIndex = mocks.pub.mock.calls.findIndex(([msg]) => msg.type === 'gen:paused');
    expect(pausedIndex).toBeGreaterThan(-1);
    expect(mocks.pub.mock.invocationCallOrder[pausedIndex]).toBeGreaterThan(mocks.update.mock.invocationCallOrder[0]);
  });

  it('数据库写失败仍可从内存恢复，检查点不与运行数组共享引用且脱敏', async () => {
    setGenerationEnvironment(JOB, {password: 'fake-secret'});
    mocks.update.mockRejectedValueOnce(new Error('disk full'));
    const checkpoint: any = {messages: [{role: 'user', content: 'fake-secret'}], steps: [], goalText: 'fake-secret', outline: [], substitution: {startedAt: 1000, resolvedSystemVars: {randomEmail: 'a@example.test'}}};
    await expect(saveCheckpoint(JOB, checkpoint)).rejects.toThrow('disk full');
    checkpoint.messages[0].content = 'changed';
    const restored = (await loadCheckpoint(JOB))!;
    expect(restored.messages[0].content).toBe('{{password}}');
    expect(restored.goalText).toBe('{{password}}');
    expect(restored.substitution.resolvedSystemVars.randomEmail).toBe('a@example.test');
  });
});
