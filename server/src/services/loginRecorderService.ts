import { chromium } from 'playwright';
import { publish } from '../ws/hub';
import { browserLaunchOptions, DEFAULT_VIEWPORT } from '../browser';
import type { ViewportSize } from '../shared/viewport';

/**
 * 登录配置录制：打开有头浏览器让用户手动完成登录，停止时通过 context.storageState()
 * 捕获浏览器状态（Cookie + localStorage）。运行脚本时用该状态创建上下文，即以已登录状态启动。
 *
 * 不复用 recorderService 的 codegen 方案：codegen --save-storage 在 SIGTERM 停止时
 * 不保证落盘；这里由我们主动调用 storageState()，确定性强。
 */
interface LoginSession {
  browser: any;
  context: any;
  /** 正常停止标记：区分「用户点停止」与「用户直接关浏览器」。 */
  stopped: boolean;
}
const sessions = new Map<string, LoginSession>();

/** 启动登录录制：打开有头浏览器并导航到 url，等待用户手动登录。viewport 为项目配置的窗口尺寸（未配置 null = 默认）。 */
export async function startLoginRecording(jobId: string, url: string, viewport?: ViewportSize | null): Promise<void> {
  // 窗口与视口同尺寸：launch 的 --window-size 由 browserLaunchOptions 按 viewport 生成
  const browser = await chromium.launch(browserLaunchOptions({ headless: false, viewport: viewport ?? undefined }));
  const context = await browser.newContext({ viewport: viewport ?? DEFAULT_VIEWPORT });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    // goto 失败（非标准 URL / 网络问题）不致命，用户仍可在弹出的浏览器里手动导航
    publish({ type: 'loginconfig:status', jobId, status: 'warning', message: `打开页面失败：${String(e)}，请在浏览器中手动导航` });
  }
  sessions.set(jobId, { browser, context, stopped: false });
  publish({ type: 'loginconfig:status', jobId, status: 'recording', message: '请在弹出的浏览器中完成登录，完成后点「停止并保存」' });

  // 用户直接关闭浏览器 -> 无法再捕获 storageState，提示并清理（正常停止流程已置 stopped，跳过）
  browser.on('disconnected', () => {
    const s = sessions.get(jobId);
    if (!s || s.stopped) return;
    sessions.delete(jobId);
    publish({ type: 'loginconfig:error', jobId, message: '浏览器已关闭，未保存登录状态。请重新录制，并在保存前不要关闭浏览器。' });
  });
}

/** 取消录制：关闭浏览器并丢弃会话，不捕获 storageState。幂等：会话已结束（如浏览器被直接关闭）时静默返回。 */
export async function cancelLoginRecording(jobId: string): Promise<void> {
  const s = sessions.get(jobId);
  if (!s) return;
  s.stopped = true; // 主动取消，避免 disconnected 处理器误报「浏览器已关闭」错误
  sessions.delete(jobId);
  try {
    await s.browser.close();
  } catch {
    /* 忽略 */
  }
}

/** 停止录制并返回捕获的 storageState（cookies + origins.localStorage）。 */
export async function stopLoginRecording(jobId: string): Promise<{ storageState: unknown }> {
  const s = sessions.get(jobId);
  if (!s) throw new Error('录制会话不存在或已结束（可能浏览器已被关闭）');
  s.stopped = true;
  let storageState: unknown;
  try {
    storageState = await s.context.storageState();
  } finally {
    sessions.delete(jobId);
    try {
      await s.browser.close();
    } catch {
      /* 忽略 */
    }
  }
  return { storageState };
}
