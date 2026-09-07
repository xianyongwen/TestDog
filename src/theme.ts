import { useEffect, useState } from 'react';
import { theme as antdTheme, type ThemeConfig } from 'antd';

/** 主题三态：跟随系统 / 强制浅色 / 强制深色 */
export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme-mode';

/** 读 localStorage 记忆，缺省跟随系统 */
export function getStoredMode(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** 三态 → 实际明暗；system 时读系统外观（WKWebView 支持 prefers-color-scheme） */
export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 把解析结果写到 <html data-theme>，驱动 tailwind.css 的 :root[data-theme='dark'] 覆盖表 */
export function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.dataset.theme = resolved;
}

/** React hook：AppInner 调用，返回 [模式, 实际明暗, 切换]。system 下系统外观变化会触发重渲染 */
export function useThemeMode(): [ThemeMode, 'light' | 'dark', (m: ThemeMode) => void] {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveMode(getStoredMode()));

  useEffect(() => {
    const next = resolveMode(mode);
    setResolved(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, mode);
    // system 模式下监听系统外观变化，实时跟随
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const r = resolveMode('system');
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = (m: ThemeMode) => setModeState(m);
  return [mode, resolved, setMode];
}

/** 字号三档：小（默认，Finder 尺度）/ 中 / 大。小 = 现有尺寸 */
export type FontSizeScale = 'small' | 'medium' | 'large';

const FONT_SCALE_STORAGE_KEY = 'font-size-scale';

/** 档位 → antd 基准字号；tailwind.css 侧由 data-font-scale 驱动 --tk-font-scale 同步缩放 */
export const FONT_SCALE_BASE_SIZE: Record<FontSizeScale, number> = { small: 13, medium: 14, large: 15 };

/** 读 localStorage 记忆，缺省小（= 现有尺寸） */
export function getStoredFontScale(): FontSizeScale {
  const v = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
  return v === 'medium' || v === 'large' ? v : 'small';
}

/** 把档位写到 <html data-font-scale>，驱动 tailwind.css 的 --tk-font-scale 覆盖表 */
export function applyFontScale(scale: FontSizeScale) {
  document.documentElement.dataset.fontScale = scale;
}

/** React hook：AppInner 调用，返回 [档位, 切换] */
export function useFontSizeScale(): [FontSizeScale, (s: FontSizeScale) => void] {
  const [scale, setScaleState] = useState<FontSizeScale>(getStoredFontScale);

  useEffect(() => {
    applyFontScale(scale);
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, scale);
  }, [scale]);

  const setScale = (s: FontSizeScale) => setScaleState(s);
  return [scale, setScale];
}

/** antd token 字面量表 —— tailwind.css --tk-* 的镜像，改值时两表对照更新。
 *  取值源自 TestDog 设计稿（testdog_light_mode.html / testdog_dark_mode.html） */
const PALETTES = {
  light: {
    accent: '#1677FF',
    link: '#1677FF',
    textPrimary: '#263241',
    menuTextColor: '#344050',
    textSecondary: '#697382',
    textTertiary: '#B6C0CF',
    line: '#D2DBE5',
    lineSubtle: '#E6ECF4',
    base: '#FFFFFF',
    container: '#FFFFFF',
    elevated: '#FFFFFF',
    subtle: '#F2F6FB',
    // 与 --tk-bg-hover 保持一致；必须不透明，否则表格 fixed 列 hover 时透出底下滚动内容
    hoverBg: '#EEF2F8',
    // 设计稿按钮：半透明白磨砂填充 + 柔和投影（明暗取值来自两稿 button 规则）。
    // 半透明对按钮是安全的：按钮的直接背景是容器的实色（表格 fixed 列单元格 /
    // 渐变页面），不像单元格 hover 底那样直接叠在滚动内容上
    btnBg: 'rgba(255, 255, 255, 0.82)',
    btnBgHover: 'rgba(241, 245, 250, 0.95)',
    btnBgActive: 'rgba(233, 238, 246, 0.95)',
    // 设计稿 button 的 border 原值（半透明），同时镜像到 --tk-border-btn；
    // variant-solid 的描边由 style.scss 补（antd 5.21+ 实心变体不读此 token）
    btnBorder: 'rgba(205, 214, 226, 0.9)',
    btnText: '#465262',
    btnShadow: '0 2px 7px rgba(70, 95, 130, 0.045)',
    // 表格选中行：强调色 10%/14% 叠加在底色（#FFFFFF）上的实色，
    // 替代 antd 默认的 colorPrimaryBg（饱和度过高、与整体违和）
    selectedBg: '#E8F1FF',
    selectedBgHover: '#DDEAFF',
    // 设计稿状态徽标（通过/失败），只注入 Tag 作用域，
    // 不动全局 colorError/colorSuccess，避免影响 danger 按钮的可读性
    success: '#2C9B4B',
    successBg: '#F0FFF1',
    successBorder: '#A8E783',
    danger: '#FF5B55',
    dangerBg: '#FFF4F3',
    dangerBorder: '#FFB7B2',
  },
  dark: {
    accent: '#1677FF',
    link: '#1677FF',
    textPrimary: '#DCE4F0',
    menuTextColor: '#C1CCDA',
    textSecondary: '#9EACC0',
    textTertiary: '#5F6B80',
    line: '#2F3948',
    lineSubtle: '#262F3F',
    base: '#131826',
    container: '#1A2130',
    elevated: '#222B3D',
    subtle: '#232C3B',
    hoverBg: '#2B3548',
    btnBg: 'rgba(255, 255, 255, 0.055)',
    btnBgHover: 'rgba(255, 255, 255, 0.10)',
    btnBgActive: 'rgba(255, 255, 255, 0.15)',
    // 暗色底上仅靠填充对比不足，补一条发丝边框保证可辨识（设计稿 button border 原值）
    btnBorder: 'rgba(130, 148, 177, 0.24)',
    btnText: '#CBD6E5',
    btnShadow: '0 3px 10px rgba(0, 0, 0, 0.10)',
    // 同上：强调色 22%/26% 叠加在容器底（#1A2130）上的实色，避免 antd 默认选中蓝过于突兀
    selectedBg: '#19345D',
    selectedBgHover: '#1B3A68',
    success: '#72E39A',
    successBg: 'rgba(61, 180, 91, 0.10)',
    successBorder: 'rgba(100, 221, 129, 0.38)',
    danger: '#FF817C',
    dangerBg: 'rgba(255, 92, 87, 0.09)',
    dangerBorder: 'rgba(255, 112, 106, 0.34)',
  },
} as const;

/** antd ConfigProvider theme：明暗算法 + Finder 风格组件 token；fontScale 决定基准字号 */
export function getThemeConfig(resolved: 'light' | 'dark', fontScale: FontSizeScale = 'small'): ThemeConfig {
  const p = PALETTES[resolved];
  // 字号档位比例（相对小档 13px）：除基准字号外，表格单元格内边距也按此缩放，
  // 档位切换时表格行高/密度与字号同步变化，而不是只放大文字
  const fontRatio = FONT_SCALE_BASE_SIZE[fontScale] / FONT_SCALE_BASE_SIZE.small;
  return {
    algorithm: resolved === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: p.accent,
      colorLink: p.link,
      colorTextBase: p.textPrimary,
      colorBgBase: p.base,
      colorBgContainer: p.container,
      colorBgElevated: p.elevated,
      colorBorder: p.line,
      colorBorderSecondary: p.lineSubtle,
      colorTextSecondary: p.textSecondary,
      colorTextTertiary: p.textTertiary,
      // 控件圆角与高度对齐设计稿按钮（9px / 38px），输入框、下拉等与按钮成同一族；
      // 小尺寸控件走 controlHeightSM/borderRadiusSM，不受影响
      borderRadius: 9,
      controlHeight: 38,
      fontSize: FONT_SCALE_BASE_SIZE[fontScale],
      fontFamily:
        "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', sans-serif",
    },
    components: {
      // 状态徽标（通过/失败）按设计稿配色；只作用于 Tag，
      // 不动全局 colorError/colorSuccess，danger 按钮保持 antd 默认红
      Tag: {
        colorSuccess: p.success,
        colorSuccessBg: p.successBg,
        colorSuccessBorder: p.successBorder,
        colorError: p.danger,
        colorErrorBg: p.dangerBg,
        colorErrorBorder: p.dangerBorder,
      },
      // 侧栏菜单：选中项为渐变胶囊（style.scss 覆盖实现），这里给 token 兜底单色，
      // 折叠态弹出菜单渲染在 portal 里不在 .ant-layout-sider 内，就靠这份兜底
      Menu: {
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        popupBg: p.elevated,
        itemColor: p.menuTextColor,
        itemHoverBg: resolved === 'light' ? 'rgba(255, 255, 255, 0.46)' : 'rgba(255, 255, 255, 0.055)',
        itemActiveBg: resolved === 'light' ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.10)',
        itemSelectedBg: resolved === 'light' ? 'rgba(210, 229, 255, 0.72)' : 'rgba(75, 139, 255, 0.25)',
        itemSelectedColor: p.accent,
        itemBorderRadius: 10,
        itemHeight: 46,
        itemMarginInline: 8,
        activeBarBorderWidth: 0, // 去掉 antd 默认右侧竖条
      },
      Table: {
        headerBg: p.subtle,
        headerColor: p.textSecondary,
        headerSplitColor: 'transparent',
        borderColor: p.lineSubtle,
        rowHoverBg: p.hoverBg,
        // 选中行用弱化的强调色底，而非 antd 默认的 colorPrimaryBg（暗色下是一大块饱和蓝）
        rowSelectedBg: p.selectedBg,
        rowSelectedHoverBg: p.selectedBgHover,
        // 单元格内边距随字号档位同比例缩放（fontRatio = 1 / 1.0769 / 1.1538），
        // 档位切换时表格行高密度与字号同步变化；SM 供 size="small"（SortableTable），MD 供 middle
        cellPaddingBlock: 16 * fontRatio,
        cellPaddingInline: 16 * fontRatio,
        cellPaddingBlockMD: 12 * fontRatio,
        cellPaddingInlineMD: 8 * fontRatio,
        cellPaddingBlockSM: 8 * fontRatio,
        cellPaddingInlineSM: 8 * fontRatio,
      },
      Collapse: { headerBg: p.subtle },
      // 全站按钮统一为设计稿按钮风格：38px 高、9px 圆角、磨砂填充 + 柔和投影，
      // primary 与 default 同款中性填充，danger（红）保留用于破坏性操作。
      // primary 的填充走 colorPrimary 别名 token，这里在 Button 作用域内覆盖为中性色
      Button: {
        fontWeight: 400,
        controlHeight: 38,
        borderRadius: 9,
        primaryShadow: p.btnShadow,
        defaultShadow: p.btnShadow,
        dangerShadow: p.btnShadow,
        colorPrimary: p.btnBg,
        colorPrimaryHover: p.btnBgHover,
        colorPrimaryActive: p.btnBgActive,
        solidTextColor: p.btnText,
        primaryColor: p.btnText,
        defaultBg: p.btnBg,
        defaultHoverBg: p.btnBgHover,
        defaultActiveBg: p.btnBgActive,
        defaultBorderColor: p.btnBorder,
        defaultHoverBorderColor: p.btnBorder,
        defaultActiveBorderColor: p.btnBorder,
        defaultColor: p.btnText,
        defaultHoverColor: p.btnText,
        defaultActiveColor: p.btnText,
      },
      // bodyBg 透明：antd 会给每层 .ant-layout（含包 Content 的内层）刷不透明底，
      // 会盖住根 Layout 的 bg-page 渐变，全部放透明让根节点渐变透出
      Layout: { bodyBg: 'transparent', siderBg: 'transparent', triggerBg: p.subtle, triggerColor: p.textSecondary },
    },
  };
}
