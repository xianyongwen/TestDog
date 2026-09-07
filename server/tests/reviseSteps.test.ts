/**
 * applyReviseOps 单测：模型 revise 工具的纯逻辑内核。
 * - update：改 value/key/instruction（description 同步）/expected（仅断言步）
 * - delete：区间（含端点）/单步；省略 to = 只删 from
 * - 顺序语义：ops 按数组顺序应用，先删后改会使序号移位
 * - 面向模型的错误文案：空 ops、越界序号、ops 超限、非断言步改 expected、update 无待改字段
 *
 * absorbProbeClick 单测：侦察性 click 吸收（组件语义动作落库前移除尾部同 locator 的点击步）。
 */
import { describe, it, expect } from 'vitest';
import { applyReviseOps, revokeStepRange, absorbProbeClick, type TestStep, type ReviseOp } from '../src/shared/testScript';

/** 构造动作步（instruction 与 description 恒等，与落库口径一致）。 */
function act(instruction: string, extra: Partial<TestStep> = {}): TestStep {
  return { kind: 'action', action: 'fill', instruction, description: instruction, ...extra };
}

/** 构造断言步。 */
function assertStep(instruction: string, expected: string): TestStep {
  return { kind: 'assert', action: 'assert', instruction, description: instruction, assertion: { type: 'text', expected } };
}

describe('applyReviseOps', () => {
  const base: TestStep[] = [
    act('打开起始页', { kind: 'navigate', action: 'goto', url: 'http://a' }),
    act('填账号', { value: 'u1' }),
    act('填手机号', { value: '13800001234' }),
    act('点确定', { action: 'click' }),
    assertStep('断言成功', '成功'),
  ];

  it('update 改 value 与 instruction（description 同步）', () => {
    const r = applyReviseOps(base, [{ op: 'update', step: 3, value: '13900005678', instruction: '在「手机号码」输入框输入新手机号' }]);
    expect(typeof r).toBe('object');
    if (typeof r === 'string') return;
    expect(r.updated).toBe(1);
    expect(r.deleted).toBe(0);
    expect(r.steps[2].value).toBe('13900005678');
    expect(r.steps[2].instruction).toBe('在「手机号码」输入框输入新手机号');
    expect(r.steps[2].description).toBe('在「手机号码」输入框输入新手机号');
  });

  it('update 只改给出的字段，其余保留；expected 仅断言步生效', () => {
    const r = applyReviseOps(base, [
      { op: 'update', step: 2, value: 'u2' },
      { op: 'update', step: 5, expected: '创建成功' },
    ]);
    expect(typeof r).toBe('object');
    if (typeof r === 'string') return;
    expect(r.steps[1].value).toBe('u2');
    expect(r.steps[1].instruction).toBe('填账号');
    expect(r.steps[4].assertion?.expected).toBe('创建成功');
  });

  it('非断言步给 expected 报错；update 无待改字段报错', () => {
    expect(applyReviseOps(base, [{ op: 'update', step: 2, expected: 'x' }])).toMatch(/expected 仅用于断言步/);
    expect(applyReviseOps(base, [{ op: 'update', step: 2 }])).toMatch(/至少给出 value\/key\/instruction\/expected/);
  });

  it('delete 区间（含端点）与单步（省略 to）', () => {
    const r1 = applyReviseOps(base, [{ op: 'delete', from: 2, to: 4 }]);
    expect(typeof r1).toBe('object');
    if (typeof r1 === 'string') return;
    expect(r1.deleted).toBe(3);
    expect(r1.steps).toHaveLength(2);
    expect(r1.steps[0].instruction).toBe('打开起始页');
    expect(r1.steps[1].instruction).toBe('断言成功');

    const r2 = applyReviseOps(base, [{ op: 'delete', from: 3 }]);
    expect(typeof r2).toBe('object');
    if (typeof r2 === 'string') return;
    expect(r2.deleted).toBe(1);
    expect(r2.steps).toHaveLength(4);
    expect(r2.steps[2].instruction).toBe('点确定');
  });

  it('顺序语义：先删后改按前一步结果的新序号计算', () => {
    // 删第 1 步后，原第 2 步变为第 1 步
    const r = applyReviseOps(base, [
      { op: 'delete', from: 1 },
      { op: 'update', step: 1, value: 'u9' },
    ]);
    expect(typeof r).toBe('object');
    if (typeof r === 'string') return;
    expect(r.steps).toHaveLength(4);
    expect(r.steps[0].instruction).toBe('填账号');
    expect(r.steps[0].value).toBe('u9');
  });

  it('非法入参返回错误文案', () => {
    expect(applyReviseOps(base, [])).toMatch(/ops 不能为空/);
    expect(applyReviseOps(base, [{ op: 'update', step: 99, value: 'x' }])).toMatch(/第 99 步不存在/);
    expect(applyReviseOps(base, [{ op: 'delete', from: 4, to: 99 }])).toMatch(/无效/);
    expect(applyReviseOps(base, [{ op: 'bogus' } as unknown as ReviseOp])).toMatch(/未知操作类型/);
    expect(applyReviseOps(base, Array.from({ length: 21 }, () => ({ op: 'delete', from: 1 })))).toMatch(/ops 过多/);
  });
});

describe('revokeStepRange', () => {
  /** 三步一段的辅助构造。 */
  const mk = (names: string[]): TestStep[] => names.map((n) => act(n));

  it('单段内删除区间（含端点）', () => {
    const seg = mk(['a', 'b', 'c', 'd', 'e']);
    expect(revokeStepRange([seg], 2, 4)).toBeNull();
    expect(seg.map((s) => s.instruction)).toEqual(['a', 'e']);
  });

  it('跨段删除：前段尾部 + 后段头部', () => {
    const base = mk(['b1', 'b2', 'b3']);
    const loop = mk(['l1', 'l2', 'l3']);
    expect(revokeStepRange([base, loop], 2, 5)).toBeNull();
    expect(base.map((s) => s.instruction)).toEqual(['b1']);
    expect(loop.map((s) => s.instruction)).toEqual(['l3']);
  });

  it('范围整体落在后段（续跑撤销本轮步骤）', () => {
    const base = mk(['b1', 'b2']);
    const loop = mk(['l1', 'l2', 'l3']);
    expect(revokeStepRange([base, loop], 3, 4)).toBeNull();
    expect(base.map((s) => s.instruction)).toEqual(['b1', 'b2']);
    expect(loop.map((s) => s.instruction)).toEqual(['l3']);
  });

  it('junction 边界：恰好删完前段尾部到后段开头', () => {
    const base = mk(['b1', 'b2', 'b3']);
    const loop = mk(['l1', 'l2']);
    expect(revokeStepRange([base, loop], 3, 4)).toBeNull();
    expect(base.map((s) => s.instruction)).toEqual(['b1', 'b2']);
    expect(loop.map((s) => s.instruction)).toEqual(['l2']);
  });

  it('非法范围返回错误文案（不改动数组）', () => {
    const seg = mk(['a', 'b', 'c']);
    expect(revokeStepRange([seg], 0, 2)).toMatch(/无效/);
    expect(revokeStepRange([seg], 2, 1)).toMatch(/无效/);
    expect(revokeStepRange([seg], 1, 4)).toMatch(/无效/);
    expect(seg.map((s) => s.instruction)).toEqual(['a', 'b', 'c']);
  });
});

describe('absorbProbeClick', () => {
  /** 下拉触发器定位器（本案例形态：css + dialog scope）。 */
  const dropdownLoc = {
    strategy: 'css' as const,
    value: 'div.ant-select.ant-tree-select',
    scope: { strategy: 'role' as const, value: 'dialog', role: 'dialog' },
  };

  /** 构造组件语义动作步（buildPluginActionStep 的落库形状）；locator 省略 = 无定位器。 */
  const pluginStep = (locator?: TestStep['locator']): TestStep => ({
    kind: 'action',
    action: 'plugin',
    pluginAction: { pluginId: 'tree-select', action: 'select', args: { value: '智能体平台' } },
    ...(locator ? { locator } : {}),
    instruction: '在所属部门下拉框选择智能体平台',
    description: '在所属部门下拉框选择智能体平台',
  });

  it('吸收尾部紧邻的同 locator click 步，返回被删步序号', () => {
    const steps: TestStep[] = [
      act('点击创建按钮', { action: 'click' }),
      act('点击所属部门下拉框', { action: 'click', locator: dropdownLoc }),
    ];
    expect(absorbProbeClick(steps, pluginStep(dropdownLoc))).toBe(2);
    expect(steps).toHaveLength(1);
    expect(steps[0].instruction).toBe('点击创建按钮');
  });

  it('locator 指向不同控件（css 值不同 / scope 不同 / 缺 locator）不吸收', () => {
    const mk = (): TestStep[] => [act('点击所属部门下拉框', { action: 'click', locator: dropdownLoc })];
    const otherCss = mk();
    expect(absorbProbeClick(otherCss, pluginStep({ ...dropdownLoc, value: 'div.ant-input' }))).toBeNull();
    const otherScope = mk();
    expect(absorbProbeClick(otherScope, pluginStep({ ...dropdownLoc, scope: undefined }))).toBeNull();
    const noLoc = mk();
    expect(absorbProbeClick(noLoc, pluginStep(undefined))).toBeNull(); // plugin 步无 locator（防御）
    expect(otherCss).toHaveLength(1); // 不满足条件时不动数组
  });

  it('尾部不是 click（fill / plugin / 断言）不吸收', () => {
    const fillTail: TestStep[] = [act('填账号', { locator: dropdownLoc })];
    expect(absorbProbeClick(fillTail, pluginStep(dropdownLoc))).toBeNull();
    const pluginTail: TestStep[] = [pluginStep(dropdownLoc)];
    expect(absorbProbeClick(pluginTail, pluginStep(dropdownLoc))).toBeNull();
    const assertTail: TestStep[] = [assertStep('断言', 'ok')];
    expect(absorbProbeClick(assertTail, pluginStep(dropdownLoc))).toBeNull();
  });

  it('click 与组件动作之间隔了其他落库步骤（非紧邻）不吸收', () => {
    const steps: TestStep[] = [
      act('点击所属部门下拉框', { action: 'click', locator: dropdownLoc }),
      act('填账号', { value: 'u1' }),
    ];
    expect(absorbProbeClick(steps, pluginStep(dropdownLoc))).toBeNull();
    expect(steps).toHaveLength(2);
  });

  it('非 plugin 步落库不触发吸收；空数组返回 null', () => {
    const steps: TestStep[] = [act('点击所属部门下拉框', { action: 'click', locator: dropdownLoc })];
    expect(absorbProbeClick(steps, act('在账号输入框输入账号', { action: 'fill', locator: dropdownLoc }))).toBeNull();
    expect(absorbProbeClick([], pluginStep(dropdownLoc))).toBeNull();
  });
});
