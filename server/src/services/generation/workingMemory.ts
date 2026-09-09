import type { TestStep } from '../../shared/testScript';

/** 步骤序号每次由当前脚本重建，撤销/修订后不会继续声称旧步骤存在。 */
export function buildWorkingMemory(steps: TestStep[], goal: string): string {
  const recent: unknown[] = [];
  let chars = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    const item = { criterionId: s.criterionId, assertionType: s.assertion?.type, step: i + 1, action: s.action, instruction: s.instruction?.slice(0, 160),
      value: s.value?.slice(0, 160), checked: s.checked, key: s.key, expected: s.assertion?.expected?.slice(0, 160),
      locator: s.locator ? `${s.locator.strategy}:${s.locator.value}`.slice(0, 180) : undefined };
    const size = JSON.stringify(item).length;
    if (chars + size > 7500) break;
    recent.unshift(item); chars += size;
  }
  return JSON.stringify({ goal: goal.slice(0, 1200), recordedSteps: steps.length, recentSteps: recent,
    omittedSteps: steps.length - recent.length, note: '已记录表示动作已执行；业务成功以断言为准。完整目标用 read_goal，完整脚本用 read_script。' });
}
