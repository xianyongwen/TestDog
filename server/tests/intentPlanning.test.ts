import { afterEach, describe, expect, it, vi } from 'vitest';
const published = vi.hoisted(() => vi.fn());
vi.mock('../src/db', () => ({ prisma: {} }));
vi.mock('../src/ws/hub', () => ({ registerCancel: vi.fn(), unregisterCancel: vi.fn() }));
vi.mock('../src/services/stagehandManager', () => ({ closeSession: vi.fn() }));
vi.mock('../src/services/pluginStore', () => ({ enabledActionVocabulary: async () => [] }));
vi.mock('../src/services/generation/logBridge', () => ({ pub: published, activeLogIds: new Map() }));
vi.mock('../src/services/generationLogService', () => ({ appendStep: vi.fn(), STEP_TYPE: {} }));
import { preSplit } from '../src/services/generation/preSplit';
import { awaitPlanConfirm, confirmPlan, releaseJob } from '../src/services/generation/jobControl';
import { setGenerationEnvironment, clearGenerationEnvironment } from '../src/services/generation/privacy';
import type { TestIntent } from '../src/shared/testIntent';
import type { PlanStep } from '../src/services/generation/types';

const job = 'intent-planning';
const intent: TestIntent = { version: 1, scenario: 'negative', objective: '错误输入不新增', preconditions: [], data: [], cleanup: [],
  criteria: [{ id: 'C1', description: '没有新记录', target: '本次客户记录', source: '用户要求', required: true, assertion: { type: 'count', expected: '0' } }] };
const steps: PlanStep[] = [{ kind: 'assert', criterionId: 'C1', instruction: '本次客户记录数量为零', assertion: { type: 'count', expected: '0' } }];
const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 };
afterEach(() => { releaseJob(job, false); clearGenerationEnvironment(job); vi.clearAllMocks(); });

describe('意图生成与原有计划确认流程', () => {
  it('自定义旧提示词也附加意图协议，保留完整目标关联并脱敏', async () => {
    setGenerationEnvironment(job, { password: 'test-only-secret' });
    const create = vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify({ intent: { ...intent, objective: 'test-only-secret' }, steps }) } }] }));
    const result = await preSplit({ chat: { completions: { create } } } as any, 'mock', '旧版仅输出 steps', 'test-only-secret', '', '', null, job);
    expect(result.intent?.objective).toBe('{{password}}');
    expect(result.steps?.[0].criterionId).toBe('C1');
    expect(JSON.stringify(create.mock.calls)).toContain('criterionId');
    expect(JSON.stringify(create.mock.calls)).not.toContain('test-only-secret');
  });

  it('缺少意图时明确失败，不能静默退回弱完成门槛', async () => {
    const client: any = { chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify({ steps }) } }] }) } } };
    await expect(preSplit(client, 'mock', '', '', '', '', null, job)).rejects.toThrow('测试意图格式不完整');
  });

  it('拒绝缺失/弱化的必验断言，等待保持有效，修正后在同一轮确认', async () => {
    const waiting = awaitPlanConfirm(job, steps, usage, intent);
    expect(published).toHaveBeenCalledWith(expect.objectContaining({ type: 'gen:plan', intent }));
    expect(confirmPlan(job, [{ ...steps[0], assertion: { type: 'visible' } }])).toContain('必验目标');
    expect(confirmPlan(job, steps, { ...intent, criteria: [] })).toContain('测试意图无效');
    expect(confirmPlan(job, steps)).toBe(true);
    expect(await waiting).toEqual({ intent, steps });
    expect(confirmPlan(job, steps)).toBe(false);
  });

  it('用户修改预期时必须同步关联断言；旧的等待任务仍可确认', async () => {
    const waiting = awaitPlanConfirm(job, steps, usage, intent);
    const edited = { ...intent, criteria: intent.criteria.map(c => ({ ...c, assertion: { ...c.assertion, expected: '1' } })) };
    expect(confirmPlan(job, steps, edited)).toContain('不一致');
    const editedSteps = [{ ...steps[0], assertion: { type: 'count', expected: '1' } }];
    expect(confirmPlan(job, editedSteps, edited)).toBe(true);
    expect((await waiting)?.intent).toEqual(edited);
    const legacy = awaitPlanConfirm(job, steps, usage);
    expect(confirmPlan(job, steps)).toBe(true);
    expect((await legacy)?.steps).toEqual(steps);
  });
});
