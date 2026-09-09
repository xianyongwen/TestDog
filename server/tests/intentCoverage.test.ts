import { describe, expect, it } from 'vitest';
import { testIntentSchema, type TestIntent } from '../src/shared/testIntent';
import { testStepSchema, type TestStep } from '../src/shared/testScript';
import { completionError, coverageStatus, evidenceSignature, type AssertionEvidence } from '../src/services/generation/intentCoverage';

const intent: TestIntent = { version: 1, scenario: 'negative', objective: '重复手机号拒绝新增', preconditions: ['手机号已存在'],
  data: [{ name: '手机号', value: '{{phone}}', policy: 'fixed' }], cleanup: [], criteria: [
    { id: 'C1', description: '显示重复错误', target: '手机号字段错误提示', source: '用户要求验证重复手机号', required: true, assertion: { type: 'text_exact', expected: '手机号已存在' } },
    { id: 'C2', description: '没有新增记录', target: '本次客户名对应记录', source: '重复输入不得新增', required: true, assertion: { type: 'count', expected: '0' } },
  ] };
const action: TestStep = { kind: 'action', action: 'fill', value: '{{phone}}', locator: { strategy: 'label', value: '手机号' } };
function assertion(i: number): TestStep { return { kind: 'assert', action: 'assert', criterionId: intent.criteria[i].id,
  assertion: intent.criteria[i].assertion, locator: { strategy: 'testid', value: `target-${i}` } }; }
function evidence(steps: TestStep[], index: number): AssertionEvidence {
  const criterion = intent.criteria.find(c => c.id === steps[index].criterionId)!;
  return { criterionId: criterion.id, signature: evidenceSignature(steps, index, criterion), verifiedAt: '2026-09-09T00:00:00Z' };
}

describe('测试意图与完成证据', () => {
  it('拒绝空目标、重复 ID、无必验目标和不完整断言；允许空字段值/零数量', () => {
    expect(testIntentSchema.safeParse(intent).success).toBe(true);
    expect(testIntentSchema.safeParse({ ...intent, criteria: [] }).success).toBe(false);
    expect(testIntentSchema.safeParse({ ...intent, criteria: [intent.criteria[0], intent.criteria[0]] }).success).toBe(false);
    expect(testIntentSchema.safeParse({ ...intent, criteria: intent.criteria.map(c => ({ ...c, required: false })) }).success).toBe(false);
    for (const expected of ['', '-1', '1.5', 'NaN']) {
      expect(testIntentSchema.safeParse({ ...intent, criteria: [{ ...intent.criteria[1], assertion: { type: 'count', expected } }] }).success).toBe(false);
    }
    expect(testIntentSchema.safeParse({ ...intent, criteria: [{ ...intent.criteria[0], assertion: { type: 'value', expected: '' } }] }).success).toBe(true);
  });

  it('末步断言和模型的 criterionId 声明不能替代真实通过证据', () => {
    const steps = [action, assertion(0), assertion(1)];
    expect(completionError(intent, steps, [])).toContain('C1');
    expect(completionError(intent, steps, [evidence(steps, 1)])).toContain('C2');
    const records = [evidence(steps, 1), evidence(steps, 2)];
    expect(completionError(intent, steps, records)).toBeNull();
    expect(completionError(intent, [...steps, action], records)).toContain('结尾');
  });

  it('修订值/定位/前序操作、删除断言以及修改契约均使旧证据失效', () => {
    const steps = [action, assertion(0), assertion(1)];
    const records = [evidence(steps, 1), evidence(steps, 2)];
    expect(completionError(intent, [{ ...action, value: '改成合法手机号' }, ...steps.slice(1)], records)).toContain('C1');
    expect(completionError(intent, [action, { ...assertion(0), assertion: { type: 'text', expected: '存在' } }, assertion(1)], records)).toContain('C1');
    expect(completionError(intent, [action, assertion(1)], records)).toContain('C1');
    expect(completionError({ ...intent, criteria: intent.criteria.map(c => ({ ...c, target: '另一个字段' })) }, steps, records)).toContain('C1');
    // 仅更改说明文案不改变已验证的执行行为。
    expect(completionError(intent, [{ ...action, instruction: '填写固定手机号' }, ...steps.slice(1)], records)).toBeNull();
  });

  it('JSON 持久化后恢复完整证据，人工修改步骤仍会失效', () => {
    const steps = [action, assertion(0), assertion(1)];
    const saved = JSON.parse(JSON.stringify({ intent, steps, evidence: [evidence(steps, 1), evidence(steps, 2)] }));
    const parsedSteps = saved.steps.map((s: unknown) => testStepSchema.parse(s));
    expect(completionError(saved.intent, parsedSteps, saved.evidence)).toBeNull();
    expect(coverageStatus(intent, steps, saved.evidence).every(c => c.passed)).toBe(true);
    parsedSteps[1].locator = { strategy: 'css', value: 'body' };
    expect(completionError(saved.intent, parsedSteps, saved.evidence)).toContain('C1');
  });
});
