import fs from 'node:fs';
import { chromium } from 'playwright';
import { getConfig } from './config';
import { readViewport } from './shared/viewport';

/**
 * 浏览器启动策略：
 * - 生产（Tauri 注入 BROWSER_MODE=system）：用系统已装的 Chrome，避免打包 Chromium。
 * - 开发：沿用 playwright 自带 Chromium（现状不变）。
 * - 用户可在「设置」页指定 browserPath 覆盖。
 */

/** 目标页面默认视口/窗口尺寸：保证按 1920×1080 渲染，避免窗口过小导致部分元素不可见。 */
export const DEFAULT_VIEWPORT = { width: 1920, height: 1080 } as const;

const MAC_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];

const WIN_CANDIDATES = [
  String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
  String.raw`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
  String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
];

/** 检测系统已安装的 Chrome 类浏览器可执行路径。 */
export function detectSystemChrome(): string | undefined {
  const candidates =
    process.platform === 'darwin' ? MAC_CANDIDATES
    : process.platform === 'win32' ? WIN_CANDIDATES
    : [];
  return candidates.find((p) => fs.existsSync(p));
}

/** 是否运行在打包后的 Tauri 环境里。 */
export function isSystemBrowserMode(): boolean {
  return process.env.BROWSER_MODE === 'system';
}

/**
 * 生成 playwright `launch` 用的浏览器选项（含 executablePath 或 channel）。
 * extra 透传 headless/args 等其它选项；extra.viewport（项目配置的窗口尺寸）仅用于生成
 * 对应的 --window-size 启动参数（launch 本身不接受 viewport 选项，会先剔除），
 * 有头窗口按它开窗；调用方需自行把同一尺寸传给 newContext 的 viewport，保持窗口与视口一致。
 */
export function browserLaunchOptions(extra: Record<string, any> = {}): Record<string, any> {
  const cfg = getConfig();
  // 脏数据宽容回落默认（readViewport 对非对象/非法值返回 null）
  const vp = readViewport(extra.viewport) ?? DEFAULT_VIEWPORT;
  const { viewport: _viewportOpt, ...rest } = extra;
  // 所有有头窗口统一 --window-size（无头场景忽略 window-size，无副作用）
  const opts = { ...rest, args: [...(rest.args ?? []), `--window-size=${vp.width},${vp.height}`] };

  if (cfg.browserPath) {
    return { executablePath: cfg.browserPath, ...opts };
  }

  if (isSystemBrowserMode()) {
    const detected = detectSystemChrome();
    if (detected) return { executablePath: detected, ...opts };
    // 让 playwright 自行定位 Chrome 通道
    return { channel: 'chrome', ...opts };
  }

  // 开发：playwright 自带 Chromium
  let bundled: string | undefined;
  try {
    bundled = chromium.executablePath();
  } catch {
    bundled = undefined;
  }
  return bundled ? { executablePath: bundled, ...opts } : { ...opts };
}

/**
 * codegen CLI 的浏览器参数。
 * 注意：`playwright codegen` 只支持 `-b/--browser` 和 `--channel`，**不支持** --executable-path。
 * 生产用系统 Chrome（--channel=chrome）；开发用自带 Chromium（不加参数）。
 * （browserPath 自定义路径无法传给 codegen，CLI 限制；运行仍会用它。）
 */
export function codegenBrowserArgs(): string[] {
  if (isSystemBrowserMode()) return ['--channel=chrome'];
  return [];
}
