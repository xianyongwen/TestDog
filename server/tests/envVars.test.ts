/**
 * envVars 共享模块单测：{{...}} 统一写法（环境变量 + 系统变量）的提取、求值与替换。
 * - 统一写法：{{name}} / {{name:N}} / {{name[:N]}} 两种参数形式等价
 * - 优先级：同名时环境变量覆盖系统变量
 * - 旧写法 ${name[:N]}：历史脚本兼容，运行时仍替换；legacyToUnifiedSystemVars 可归一化
 */
import { describe, it, expect } from 'vitest';
import {
  extractVars,
  extractSystemVars,
  collectSystemKeys,
  resolveSystemKeys,
  resolveSystemVars,
  substituteAll,
  substituteVars,
  legacyToUnifiedSystemVars,
} from '../src/shared/envVars';

describe('extractVars（{{...}} 名字提取）', () => {
  it('统一写法的系统变量带参数也能提取名字', () => {
    expect(extractVars('事项编码_{{randomNumber[:6]}}')).toEqual(['randomNumber']);
  });

  it('环境变量与系统变量混合，去重保序', () => {
    expect(extractVars('{{baseUrl}}/x {{randomChinese:4}} {{baseUrl}}')).toEqual(['baseUrl', 'randomChinese']);
  });

  it('中文名支持（历史行为保持）', () => {
    expect(extractVars('{{密码1}}')).toEqual(['密码1']);
  });
});

describe('extractSystemVars / collectSystemKeys（两种写法都识别）', () => {
  it('统一写法提取归一化键', () => {
    expect(extractSystemVars('a{{randomNumber[:6]}}b{{randomChinese:4}}c{{randomPhone}}')).toEqual([
      'randomNumber:6',
      'randomChinese:4',
      'randomPhone',
    ]);
  });

  it('旧写法 ${name:N} 仍被识别（历史脚本兼容）', () => {
    expect(extractSystemVars('user_${systemTime} sn-${randomNumber:8}')).toEqual(['systemTime', 'randomNumber:8']);
  });

  it('未知 ${...} / {{...}} 不计入', () => {
    expect(extractSystemVars('${notSystem} {{notSystem}}')).toEqual([]);
  });

  it('collectSystemKeys 跨多文本收集去重', () => {
    expect(collectSystemKeys(['{{randomPhone}}', null, undefined, '${randomPhone}'])).toEqual(['randomPhone']);
  });
});

describe('resolveSystemVars / resolveSystemKeys（求值）', () => {
  it('从统一写法文本求值，同键一次', () => {
    const vars = resolveSystemVars(['{{randomNumber[:6]}}'], 1700000000000);
    expect(vars['randomNumber:6']).toMatch(/^\d{6}$/);
  });

  it('resolveSystemKeys 直接按键求值', () => {
    const vars = resolveSystemKeys(['systemTime'], 1700000000000);
    expect(vars['systemTime']).toBe('1700000000000');
  });

  it('参数决定位数', () => {
    const vars = resolveSystemKeys(['randomNumber:8'], 1700000000000);
    expect(vars['randomNumber:8']).toMatch(/^\d{8}$/);
  });
});

describe('substituteAll（统一替换，环境变量优先）', () => {
  it('统一写法系统变量被替换', () => {
    const sys = { 'randomNumber:6': '123456' };
    expect(substituteAll('事项编码_{{randomNumber[:6]}}', {}, sys)).toBe('事项编码_123456');
    expect(substituteAll('事项编码_{{randomNumber:6}}', {}, sys)).toBe('事项编码_123456');
  });

  it('环境变量优先：同名时覆盖系统变量（参数形式同样生效）', () => {
    const sys = { randomNumber: '999999', 'randomNumber:6': '123456' };
    expect(substituteAll('x{{randomNumber}}y', { randomNumber: '自定义' }, sys)).toBe('x自定义y');
    expect(substituteAll('x{{randomNumber[:6]}}y', { randomNumber: '自定义' }, sys)).toBe('x自定义y');
  });

  it('旧写法 ${name} 作为历史脚本兼容仍被替换', () => {
    const sys = resolveSystemKeys(['systemTime', 'randomPhone'], 1700000000000);
    expect(substituteAll('user_${systemTime}', {}, sys)).toBe('user_1700000000000');
    expect(substituteAll('${randomPhone}', {}, sys)).toBe(sys['randomPhone']);
  });

  it('未定义变量保留字面量并计入 missing', () => {
    const missing = new Set<string>();
    expect(substituteAll('{{foo}}/{{randomNumber}}', {}, {}, missing)).toBe('{{foo}}/{{randomNumber}}');
    expect([...missing]).toEqual(['foo']);
  });

  it('已知系统变量名缺失求值时保留字面量但不误报 missing', () => {
    const missing = new Set<string>();
    expect(substituteAll('{{randomPhone}}', {}, {}, missing)).toBe('{{randomPhone}}');
    expect(missing.size).toBe(0);
  });

  it('null/undefined 原样返回', () => {
    expect(substituteAll(null, {}, {})).toBeUndefined();
    expect(substituteAll(undefined, {}, {})).toBeUndefined();
  });
});

describe('substituteVars（仅环境变量）', () => {
  it('系统变量写法保留字面量，不误报 missing', () => {
    const missing = new Set<string>();
    expect(substituteVars('a{{baseUrl}}b{{randomNumber[:6]}}c', { baseUrl: 'http://x' }, missing)).toBe(
      'ahttp://xb{{randomNumber[:6]}}c',
    );
    expect(missing.size).toBe(0);
  });
});

describe('legacyToUnifiedSystemVars（旧写法归一化入库）', () => {
  it('已知系统变量改写为 {{name[:N]}}', () => {
    expect(legacyToUnifiedSystemVars('公告_${randomNumber[:6]}')).toBe('公告_{{randomNumber[:6]}}');
    expect(legacyToUnifiedSystemVars('t_${randomNumber:8}')).toBe('t_{{randomNumber[:8]}}');
    expect(legacyToUnifiedSystemVars('user_${systemTime}')).toBe('user_{{systemTime}}');
  });

  it('未知名与其他 ${...} 文本原样保留', () => {
    expect(legacyToUnifiedSystemVars('${notSystem} ${a.b} $100')).toBe('${notSystem} ${a.b} $100');
  });

  it('null/undefined 原样返回', () => {
    expect(legacyToUnifiedSystemVars(null)).toBeUndefined();
  });
});
