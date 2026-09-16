import { chromium, type Browser, type BrowserContext } from 'playwright';
import { publish } from '../ws/hub';
import { browserLaunchOptions, DEFAULT_VIEWPORT } from '../browser';
import type { ViewportSize } from '../shared/viewport';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
interface LoginSession {
  browser: Browser;
  context: BrowserContext;
  stopped: boolean;
  closed: boolean;
  storageState?: StorageState;
  capture?: Promise<void>;
  timer?: ReturnType<typeof setInterval>;
  expiry?: ReturnType<typeof setTimeout>;
}
const sessions = new Map<string, LoginSession>();

// storageState() 会为已离开的 origin 创建临时页面，有头录制时会闪窗。
// 仅从已有页面/iframe 采集 localStorage，并保留已离开站点的最近快照。
async function readState(s: LoginSession): Promise<StorageState> {
  const cookies = await s.context.cookies();
  const origins = new Map((s.storageState?.origins ?? []).map((origin) => [origin.origin, origin]));
  const frames = s.context.pages().filter((page) => !page.isClosed()).flatMap((page) => page.frames());
  await Promise.all(frames.map(async (frame) => {
    try {
      const state = await frame.evaluate<StorageState['origins'][number] | null>(`(() => {
        if (!/^https?:$/.test(location.protocol)) return null;
        return {
          origin: location.origin,
          localStorage: Object.keys(localStorage).map(name => ({ name, value: localStorage.getItem(name) }))
        };
      })()`);
      if (state) origins.set(state.origin, state);
    } catch {
      // 页面导航或关闭时保留该站点的最近快照。
    }
  }));
  return { cookies, origins: [...origins.values()] };
}

// 浏览器关闭后无法再读取 Cookie/localStorage，因此录制时持续保留最近一次成功快照。
function capture(s: LoginSession): Promise<void> {
  if (s.capture) return s.capture;
  if (s.closed) return Promise.resolve();
  s.capture = readState(s).then((state) => {
    s.storageState = state;
  }).catch(() => {
    // 导航或关闭期间读取可能失败，保留上一次成功状态。
  }).finally(() => { s.capture = undefined; });
  return s.capture;
}

function clearSession(jobId: string, s: LoginSession) {
  clearInterval(s.timer);
  clearTimeout(s.expiry);
  sessions.delete(jobId);
}

/** 启动登录录制；closed 用于补偿启动响应前浏览器关闭导致前端错过的通知。 */
export async function startLoginRecording(jobId: string, url: string, viewport?: ViewportSize | null): Promise<{ closed: boolean }> {
  const browser = await chromium.launch(browserLaunchOptions({ headless: false, viewport: viewport ?? undefined }));
  let context: BrowserContext;
  try {
    context = await browser.newContext({ viewport: viewport ?? DEFAULT_VIEWPORT });
  } catch (e) {
    await browser.close().catch(() => {});
    throw e;
  }
  const s: LoginSession = { browser, context, stopped: false, closed: false };
  sessions.set(jobId, s);
  const onClosed = () => {
    if (s.closed) return;
    s.closed = true;
    clearInterval(s.timer);
    if (s.stopped) return;
    // 只发送通知，凭据继续通过 stop 接口领取，避免 WebSocket 广播登录凭据。
    publish({ type: 'loginconfig:closed', jobId });
    // 客户端断线时也不能无限保留凭据。
    s.expiry = setTimeout(() => clearSession(jobId, s), 10 * 60_000);
    s.expiry.unref();
  };
  context.on('close', onClosed);
  browser.on('disconnected', onClosed);
  await capture(s);
  if (!s.closed) {
    s.timer = setInterval(() => { void capture(s); }, 250);
    s.timer.unref();
    context.on('page', (page) => {
      page.on('domcontentloaded', () => { if (!s.stopped) void capture(s); });
      page.on('close', () => {
        if (context.pages().every((openPage) => openPage.isClosed())) onClosed();
      });
    });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await capture(s);
    } catch (e) {
      if (!s.closed) publish({ type: 'loginconfig:status', jobId, status: 'warning', message: `打开页面失败：${String(e)}，请在浏览器中手动导航` });
    }
  }
  if (!s.closed) publish({ type: 'loginconfig:status', jobId, status: 'recording', message: '请在弹出的浏览器中完成登录，完成后关闭浏览器或点「停止并保存」' });
  return { closed: s.closed };
}

/** 主动取消仍然丢弃状态，不触发自动保存。 */
export async function cancelLoginRecording(jobId: string): Promise<void> {
  const s = sessions.get(jobId);
  if (!s) return;
  s.stopped = true;
  clearSession(jobId, s);
  await s.browser.close().catch(() => {});
}

/** 正常停止读取最新状态；浏览器已关闭时使用关闭前最近一次成功快照。 */
export async function stopLoginRecording(jobId: string): Promise<{ storageState: StorageState }> {
  const s = sessions.get(jobId);
  if (!s || s.stopped) throw new Error('录制会话不存在或已结束');
  s.stopped = true;
  clearInterval(s.timer);
  try {
    await s.capture;
    if (!s.closed) {
      try {
        s.storageState = await readState(s);
      } catch (e) {
        if (!s.closed && s.browser.isConnected()) throw e;
      }
    }
    if (!s.storageState) throw new Error('浏览器关闭前未能捕获登录状态，请重新录制');
    return { storageState: s.storageState };
  } finally {
    clearSession(jobId, s);
    await s.browser.close().catch(() => {});
  }
}
