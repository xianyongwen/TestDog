/**
 * viewport 共享模块单测：项目级浏览器窗口尺寸的解析/校验/DB 宽容读取。
 * - parseViewport：null→null（显式恢复默认）；数字对象规整（floor + clamp）；类型错误→undefined（API 应 400）
 * - readViewport：历史字符串 JSON 兼容；任何脏数据回落 null，不阻断浏览器启动
 * - 预设清单：key 唯一、尺寸在允许范围内
 */
import { describe, it, expect } from 'vitest';
import { parseViewport, readViewport, VIEWPORT_PRESETS, VIEWPORT_MIN, VIEWPORT_MAX } from '../src/shared/viewport';

describe('parseViewport（API 输入校验）', () => {
  it('null / undefined → null（显式恢复默认尺寸）', () => {
    expect(parseViewport(null)).toBeNull();
    expect(parseViewport(undefined)).toBeNull();
  });

  it('合法数字对象原样返回', () => {
    expect(parseViewport({ width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 });
    expect(parseViewport({ width: 390, height: 844 })).toEqual({ width: 390, height: 844 });
  });

  it('越界值 clamp 到 [MIN, MAX]，小数向下取整', () => {
    expect(parseViewport({ width: 10, height: 720 })).toEqual({ width: VIEWPORT_MIN, height: 720 });
    expect(parseViewport({ width: 99999, height: 720 })).toEqual({ width: VIEWPORT_MAX, height: 720 });
    expect(parseViewport({ width: 1280, height: 99999 })).toEqual({ width: 1280, height: VIEWPORT_MAX });
    expect(parseViewport({ width: 1280.9, height: 719.9 })).toEqual({ width: 1280, height: 719 });
  });

  it('类型错误返回 undefined（调用方应回 400，而非静默清空）', () => {
    expect(parseViewport('1280x720')).toBeUndefined();
    expect(parseViewport(42)).toBeUndefined();
    expect(parseViewport([1280, 720])).toBeUndefined();
    expect(parseViewport({ width: '1280', height: 720 })).toBeUndefined();
    expect(parseViewport({ width: 1280 })).toBeUndefined();
    expect(parseViewport({ width: NaN, height: 720 })).toBeUndefined();
    expect(parseViewport({ width: Infinity, height: 720 })).toBeUndefined();
  });
});

describe('readViewport（DB Json 宽容读取）', () => {
  it('null / 合法对象 / 历史字符串 JSON 均可读', () => {
    expect(readViewport(null)).toBeNull();
    expect(readViewport({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
    expect(readViewport('{"width":390,"height":844}')).toEqual({ width: 390, height: 844 });
  });

  it('脏数据一律回落 null（= 默认尺寸），不抛异常', () => {
    expect(readViewport('not json')).toBeNull();
    expect(readViewport('{"width":"a"}')).toBeNull();
    expect(readViewport(123)).toBeNull();
    expect(readViewport([1, 2])).toBeNull();
    expect(readViewport({})).toBeNull();
  });
});

describe('VIEWPORT_PRESETS（预设清单）', () => {
  it('key 唯一且与尺寸一致', () => {
    const keys = VIEWPORT_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of VIEWPORT_PRESETS) expect(p.key).toBe(`${p.width}x${p.height}`);
  });

  it('所有尺寸在允许范围内', () => {
    for (const p of VIEWPORT_PRESETS) {
      expect(p.width).toBeGreaterThanOrEqual(VIEWPORT_MIN);
      expect(p.width).toBeLessThanOrEqual(VIEWPORT_MAX);
      expect(p.height).toBeGreaterThanOrEqual(VIEWPORT_MIN);
      expect(p.height).toBeLessThanOrEqual(VIEWPORT_MAX);
    }
  });
});
