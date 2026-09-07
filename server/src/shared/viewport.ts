/**
 * 项目级浏览器窗口尺寸（viewport）：运行脚本与生成脚本启动浏览器时生效。
 * 前后端共用：前端弹窗渲染预设列表，后端做输入校验与 DB 宽容读取。
 */

export interface ViewportSize {
  width: number;
  height: number;
}

/** 单边（宽/高）允许范围：下限保证窗口可用，上限 8K 封顶。 */
export const VIEWPORT_MIN = 100;
export const VIEWPORT_MAX = 7680;

export interface ViewportPreset {
  /** 稳定 key：`${width}x${height}`（预设尺寸互不重复）。 */
  key: string;
  /** 设备名（语言中立，如 "iPhone 14 Pro Max"）；桌面预设为空串（直接展示尺寸）。 */
  label: string;
  group: 'desktop' | 'phone' | 'tablet';
  width: number;
  height: number;
}

const preset = (group: ViewportPreset['group'], label: string, width: number, height: number): ViewportPreset => ({
  key: `${width}x${height}`,
  label,
  group,
  width,
  height,
});

/**
 * 常用尺寸预设，分组参考 Chrome DevTools 设备工具栏：
 * 桌面为常见分辨率；手机/平板为 DevTools 默认设备列表中的代表机型。
 * 注意：仅设置窗口/视口尺寸，不做移动端模拟（UA、触摸、DPR 不变）。
 */
export const VIEWPORT_PRESETS: ViewportPreset[] = [
  // 常用桌面分辨率
  preset('desktop', '', 1280, 720),
  preset('desktop', '', 1366, 768),
  preset('desktop', '', 1440, 900),
  preset('desktop', '', 1536, 864),
  preset('desktop', '', 1680, 1050),
  preset('desktop', '', 1920, 1080),
  preset('desktop', '', 2560, 1440),
  // 手机（尺寸为 CSS 像素）
  preset('phone', 'iPhone SE', 375, 667),
  preset('phone', 'iPhone 13 / 14', 390, 844),
  preset('phone', 'iPhone 15 / 16', 393, 852),
  preset('phone', 'iPhone 14 Pro Max', 430, 932),
  preset('phone', 'iPhone 16 Pro Max', 440, 956),
  preset('phone', 'Pixel 7', 412, 915),
  preset('phone', 'Galaxy S8+', 360, 740),
  // 平板
  preset('tablet', 'iPad Mini', 768, 1024),
  preset('tablet', 'iPad Air', 820, 1180),
  preset('tablet', 'iPad Pro 11', 834, 1194),
  preset('tablet', 'iPad Pro 12.9', 1024, 1366),
  preset('tablet', 'Surface Pro 7', 912, 1368),
];

function clampSide(v: number): number {
  return Math.min(VIEWPORT_MAX, Math.max(VIEWPORT_MIN, Math.floor(v)));
}

/**
 * 严格解析用户输入（API 落库前）：
 * - null/undefined → null（显式恢复默认尺寸）；
 * - {width, height} 均为有限数字 → 规整（取整 + clamp 到 [100, 7680]）；
 * - 其它（类型错误）→ undefined，调用方应回 400。
 */
export function parseViewport(v: unknown): ViewportSize | null | undefined {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return undefined;
  const { width, height } = v as { width?: unknown; height?: unknown };
  if (typeof width !== 'number' || !Number.isFinite(width)) return undefined;
  if (typeof height !== 'number' || !Number.isFinite(height)) return undefined;
  return { width: clampSide(width), height: clampSide(height) };
}

/**
 * 从 DB Json 字段宽容读取：历史字符串 JSON 兼容解析，任何异常回落 null（= 默认尺寸），
 * 保证脏数据不会阻断浏览器启动。
 */
export function readViewport(v: unknown): ViewportSize | null {
  let val = v;
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val);
    } catch {
      return null;
    }
  }
  const parsed = parseViewport(val);
  return parsed === undefined ? null : parsed;
}
