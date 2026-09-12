import { describe, expect, it } from 'vitest';
import { createSubstituter } from '../src/services/generation/substitution';
import { createValueBinder } from '../src/services/generation/valueBinding';
import type { TestIntent } from '../src/shared/testIntent';
import type { TestStep } from '../src/shared/testScript';

const intent: TestIntent = {
  version: 1,
  scenario: 'positive',
  objective: '新增用户并验证列表出现',
  preconditions: [],
  data: [
    { name: '账号', value: 'test${randomNumber[:6]}', policy: 'generated' },
    { name: '手机号', value: '{{randomPhone}}', policy: 'generated' },
    { name: '部门', value: '研发部', policy: 'fixed' },
  ],
  cleanup: [],
  criteria: [
    { id: 'C1', description: '新增用户出现在列表', target: '用户列表账号列', source: '需求', required: true, assertion: { type: 'text_exact', expected: 'test${randomNumber[:6]}' } },
  ],
};

describe('值绑定：fill 实例值与断言占位符在宿主内汇合', () => {
  it('fill 编了字面值：命中 generated 模板 → 反绑键值，落库值改写回模板', () => {
    const substitution = createSubstituter({}, Date.now());
    const binder = createValueBinder(substitution, intent, []);
    // 模型没传占位符，自己编了 test829401（cmtwr6hlf 案例）
    const canonical = binder.onWrite('在「账号」输入框输入 test829401', 'test829401', 'test829401');
    expect(canonical).toBe('test{{randomNumber[:6]}}');
    // 断言 expected（旧写法占位符）解析到实际写入值——不再是重新随机
    expect(substitution.sub('test${randomNumber[:6]}')).toBe('test829401');
    expect(substitution.sub('test{{randomNumber[:6]}}')).toBe('test829401');
  });

  it('手机号模板（{{}} 形态）同样反绑；fixed 数据绝不参与匹配', () => {
    const substitution = createSubstituter({}, Date.now());
    const binder = createValueBinder(substitution, intent, []);
    const canonical = binder.onWrite('输入手机号', '13958271046', '13958271046');
    expect(canonical).toBe('{{randomPhone}}');
    expect(substitution.sub('{{randomPhone}}')).toBe('13958271046');
    // fixed 值「研发部」不匹配任何模板，原样保留
    expect(binder.onWrite('选择部门', '研发部', '研发部')).toBe('研发部');
  });

  it('模型直填占位符：缓存惰性求值，登记 实例→模板 供 revise 规范化', () => {
    const substitution = createSubstituter({}, Date.now());
    const binder = createValueBinder(substitution, intent, []);
    const raw = 'test${randomNumber[:6]}';
    const canonical = binder.onWrite('输入账号', raw, substitution.sub(raw)!);
    expect(canonical).toBe(raw);
    const resolved = substitution.sub(raw)!;
    expect(binder.canonicalizeText(`重新输入 ${resolved}`)).toBe(`重新输入 test{{randomNumber[:6]}}`);
  });

  it('改值重试=重绑：重填后断言与 revise 规范化都看到新值（最新写入生效）', () => {
    const substitution = createSubstituter({}, Date.now());
    const binder = createValueBinder(substitution, intent, []);
    binder.onWrite('首次填写', '13911112222', '13911112222');
    binder.onWrite('校验拒绝后换值重填', '13958271046', '13958271046');
    expect(substitution.sub('{{randomPhone}}')).toBe('13958271046');
    expect(binder.canonicalizeText('13958271046')).toBe('{{randomPhone}}');
  });

  it('tryBind：断言前从写入历史反查未求值的键（fill 在先、断言在后跨会话缓存缺失场景）', () => {
    // 模拟缓存被清（如续跑未带状态）：历史有 13958271046，expected 引用 {{randomPhone}}
    const substitution = createSubstituter({}, Date.now());
    const binder = createValueBinder(substitution, intent, []);
    binder.onWrite('输入手机号', '13958271046', '13958271046');
    delete substitution.state.resolvedSystemVars['randomPhone'];
    expect(substitution.has('randomPhone')).toBe(false);
    binder.tryBind('{{randomPhone}}');
    expect(substitution.sub('{{randomPhone}}')).toBe('13958271046');
  });

  it('regenerate：占位符键重新求值并覆盖缓存，同轮后续引用拿到新值', () => {
    const substitution = createSubstituter({}, Date.now());
    const binder = createValueBinder(substitution, intent, []);
    const first = substitution.sub('{{randomPhone}}')!;
    binder.regenerate('{{randomPhone}}');
    const second = substitution.sub('{{randomPhone}}')!;
    expect(second).not.toBe(first);
    expect(second).toMatch(/^1[3-9]\d{9}$/);
  });

  it('种子步骤：续跑时从已落库字面值重建绑定（跨暂停一致性）', () => {
    const substitution = createSubstituter({}, Date.now());
    const steps: TestStep[] = [{ kind: 'action', action: 'fill', value: 'test829401', instruction: '输入账号' }];
    createValueBinder(substitution, intent, steps);
    expect(substitution.sub('test${randomNumber[:6]}')).toBe('test829401');
  });

  it('无解析器（测试桩）时退化为 no-op：原样返回、不绑定', () => {
    const binder = createValueBinder(undefined, intent, []);
    expect(binder.onWrite('输入', 'test829401', 'test829401')).toBe('test829401');
    expect(binder.canonicalizeText('test829401')).toBe('test829401');
    expect(() => binder.tryBind('test${randomNumber[:6]}')).not.toThrow();
  });

  it('值形态不符模板时不动：长度不符的实例不误绑', () => {
    const substitution = createSubstituter({}, Date.now());
    const binder = createValueBinder(substitution, intent, []);
    // 账号模板要求 test+6位数字；7 位数字不匹配
    expect(binder.onWrite('输入账号', 'test1234567', 'test1234567')).toBe('test1234567');
    expect(substitution.has('randomNumber:6')).toBe(false);
  });
});
