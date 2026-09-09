import { createHash } from 'node:crypto';
import type { TestIntent, AcceptanceCriterion } from '../../shared/testIntent';
import type { TestStep } from '../../shared/testScript';

/** 仅宿主在断言实际通过后写入，随检查点保存；不接受模型/客户端提供的通过声明。 */
export interface AssertionEvidence {
  criterionId: string;
  signature: string;
  verifiedAt: string;
}

export function evidenceSignature(steps: TestStep[], index: number, criterion: AcceptanceCriterion): string {
  // 忽略说明文字和之前的断言；前序动作、定位、数据、顺序以及当前断言任一变化都会使证据失效。
  const executable = (s: TestStep) => ({ kind: s.kind, action: s.action, locator: s.locator, url: s.url,
    value: s.value, key: s.key, checked: s.checked, pluginAction: s.pluginAction, code: s.code,
    assertion: s.assertion, criterionId: s.criterionId });
  const prefix = steps.slice(0, index).filter(s => s.kind !== 'assert').map(executable);
  return createHash('sha256').update(JSON.stringify({ criterion, prefix, step: executable(steps[index]) })).digest('hex');
}

export function assertionContractError(criterion: AcceptanceCriterion, step: Pick<TestStep, 'assertion' | 'locator'>,
  sub: (value?: string | null) => string | undefined): string | null {
  if (step.assertion?.type !== criterion.assertion.type || sub(step.assertion?.expected) !== sub(criterion.assertion.expected))
    return `目标 ${criterion.id} 必须使用已确认的断言 ${JSON.stringify(criterion.assertion)}，不能替换或弱化预期`;
  if (!criterion.assertion.type.startsWith('url') && !step.locator)
    return `目标 ${criterion.id} 必须定位到指定范围「${criterion.target}」，不能以整页文本代替`;
  return null;
}

export function coverageStatus(intent: TestIntent, steps: TestStep[], evidence: AssertionEvidence[]) {
  return intent.criteria.map(criterion => ({ id: criterion.id, description: criterion.description, required: criterion.required,
    passed: steps.some((step, index) => step.kind === 'assert' && step.criterionId === criterion.id &&
      evidence.some(e => e.criterionId === criterion.id && e.signature === evidenceSignature(steps, index, criterion))) }));
}

export function completionError(intent: TestIntent | undefined, steps: TestStep[], evidence: AssertionEvidence[]): string | null {
  if (steps.at(-1)?.kind !== 'assert') return '脚本必须以断言步骤结尾，请先验证测试结果。';
  if (!intent) return null; // 兼容已有的暂停任务；新计划必须提供结构化意图。
  const missing = coverageStatus(intent, steps, evidence).filter(c => c.required && !c.passed);
  return missing.length ? `尚未完成必验目标：${missing.map(c => `${c.id}（${c.description}）`).join('、')}。请按已确认的类型、预期和目标范围调用 assert，并携带 criterionId。修订前序动作或删除断言后，旧证据不能用于完成校验。` : null;
}
