import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ launch: vi.fn(), publish: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launch: mocks.launch } }));
vi.mock('../src/ws/hub', () => ({ publish: mocks.publish }));
vi.mock('../src/browser', () => ({ browserLaunchOptions: () => ({}), DEFAULT_VIEWPORT: { width: 1280, height: 720 } }));
import { startLoginRecording, stopLoginRecording, cancelLoginRecording } from '../src/services/loginRecorderService';

describe('login recording browser closure', () => {
  let browser: EventEmitter & { close: ReturnType<typeof vi.fn>; isConnected: ReturnType<typeof vi.fn> };
  let context: EventEmitter & { cookies: ReturnType<typeof vi.fn>; storageState: ReturnType<typeof vi.fn>; newPage: ReturnType<typeof vi.fn>; pages: ReturnType<typeof vi.fn> };
  let page: EventEmitter & { evaluate: ReturnType<typeof vi.fn>; isClosed: ReturnType<typeof vi.fn> };
  const initial = { cookies: [], origins: [] };
  const loggedIn = { cookies: [{ name: 'session', value: 'logged-in' }], origins: [{ origin: 'https://example.com', localStorage: [{ name: 'token', value: 'latest' }] }] };
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.publish.mockClear();
    browser = Object.assign(new EventEmitter(), { close: vi.fn(async () => { browser.emit('disconnected'); }), isConnected: vi.fn(() => true) });
    page = Object.assign(new EventEmitter(), { goto: vi.fn(async () => {}), evaluate: vi.fn().mockResolvedValue(null), isClosed: vi.fn(() => false), frames: () => [page] });
    context = Object.assign(new EventEmitter(), {
      cookies: vi.fn().mockResolvedValue([]),
      storageState: vi.fn(() => { throw new Error('Must not open storage-state pages'); }),
      pages: vi.fn(() => [page]),
      newPage: vi.fn(async () => { context.emit('page', page); return page; }),
    });
    mocks.launch.mockResolvedValue(Object.assign(browser, { newContext: vi.fn().mockResolvedValue(context) }));
  });
  afterEach(async () => {
    await cancelLoginRecording('job');
    vi.useRealTimers();
  });

  it('saves the last successful snapshot after browser closure, including localStorage', async () => {
    await startLoginRecording('job', 'https://example.com');
    context.cookies.mockResolvedValue(loggedIn.cookies);
    page.evaluate.mockResolvedValue(loggedIn.origins[0]);
    await vi.advanceTimersByTimeAsync(250);
    context.cookies.mockRejectedValue(new Error('closed'));
    await vi.advanceTimersByTimeAsync(250);
    context.emit('close');
    browser.emit('disconnected');
    expect(mocks.publish.mock.calls.filter(([msg]) => msg.type === 'loginconfig:closed')).toHaveLength(1);
    expect(await stopLoginRecording('job')).toEqual({ storageState: loggedIn });
  });

  it('normal stop captures the current state and does not auto-save twice', async () => {
    await startLoginRecording('job', 'https://example.com');
    context.cookies.mockResolvedValue(loggedIn.cookies);
    page.evaluate.mockResolvedValue(loggedIn.origins[0]);
    expect(await stopLoginRecording('job')).toEqual({ storageState: loggedIn });
    expect(mocks.publish).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'loginconfig:closed' }));
  });

  it('cancel discards snapshots and stops polling', async () => {
    await startLoginRecording('job', 'https://example.com');
    await cancelLoginRecording('job');
    const calls = context.cookies.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(context.cookies).toHaveBeenCalledTimes(calls);
    await expect(stopLoginRecording('job')).rejects.toThrow('录制会话不存在');
    expect(mocks.publish).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'loginconfig:closed' }));
  });

  it('reports closure during startup so the client can recover a missed event', async () => {
    context.newPage.mockImplementation(async () => { context.emit('close'); throw new Error('closed'); });
    expect(await startLoginRecording('job', 'https://example.com')).toEqual({ closed: true });
    expect(await stopLoginRecording('job')).toEqual({ storageState: initial });
  });

  it('uses the snapshot when closure races with manual stop', async () => {
    await startLoginRecording('job', 'https://example.com');
    context.cookies.mockImplementation(async () => { context.emit('close'); throw new Error('closed'); });
    expect(await stopLoginRecording('job')).toEqual({ storageState: initial });
  });

  it('never creates extra pages while polling, and stops when the last page closes', async () => {
    await startLoginRecording('job', 'https://example.com');
    context.cookies.mockResolvedValue(loggedIn.cookies);
    page.evaluate.mockResolvedValue(loggedIn.origins[0]);
    await vi.advanceTimersByTimeAsync(1000);
    // 已离开的站点也保留缓存，无须重新打开页面。
    page.evaluate.mockResolvedValue({ origin: 'https://other.example', localStorage: [] });
    await vi.advanceTimersByTimeAsync(250);
    page.isClosed.mockReturnValue(true);
    page.emit('close');
    const calls = context.cookies.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(context.cookies).toHaveBeenCalledTimes(calls);
    expect(context.storageState).not.toHaveBeenCalled();
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(mocks.publish).toHaveBeenCalledWith({ type: 'loginconfig:closed', jobId: 'job' });
    const saved = await stopLoginRecording('job');
    expect(saved.storageState.origins).toContainEqual(loggedIn.origins[0]);
  });

  it('closing one of multiple pages keeps recording', async () => {
    await startLoginRecording('job', 'https://example.com');
    context.pages.mockReturnValue([{ isClosed: () => false, frames: () => [] }]);
    page.emit('close');
    expect(mocks.publish).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'loginconfig:closed' }));
  });

  it('fails without a successful snapshot instead of inventing an empty state', async () => {
    context.cookies.mockRejectedValue(new Error('unavailable'));
    await startLoginRecording('job', 'https://example.com');
    browser.emit('disconnected');
    await expect(stopLoginRecording('job')).rejects.toThrow('未能捕获登录状态');
  });

  it('real Chromium: cross-origin navigation and last-page closure create no extra windows', async () => {
    vi.useRealTimers();
    const { chromium } = await vi.importActual<typeof import('playwright')>('playwright');
    const realBrowser = await chromium.launch({ headless: true });
    mocks.launch.mockResolvedValue(realBrowser);
    const createdPages: unknown[] = [];
    const originalNewContext = realBrowser.newContext.bind(realBrowser);
    vi.spyOn(realBrowser, 'newContext').mockImplementation(async (options) => {
      const realContext = await originalNewContext(options);
      realContext.on('page', (p) => createdPages.push(p));
      await realContext.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: '<html>Login</html>' }));
      return realContext;
    });
    try {
      await startLoginRecording('job', 'https://login.example');
      const realContext = realBrowser.contexts()[0];
      const realPage = realContext.pages()[0];
      await realPage.evaluate('localStorage.setItem("token", "saved-token")');
      await realContext.addCookies([{ name: 'session', value: 'saved-cookie', url: 'https://login.example' }]);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await realPage.goto('https://app.example');
      await new Promise((resolve) => setTimeout(resolve, 600));
      await realPage.close();
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(createdPages).toHaveLength(1);
      expect(mocks.publish).toHaveBeenCalledWith({ type: 'loginconfig:closed', jobId: 'job' });
      const { storageState } = await stopLoginRecording('job');
      expect(storageState.origins).toContainEqual({ origin: 'https://login.example', localStorage: [{ name: 'token', value: 'saved-token' }] });
      expect(storageState.cookies).toContainEqual(expect.objectContaining({ name: 'session', value: 'saved-cookie' }));
    } finally {
      await realBrowser.close();
    }
  }, 15_000);

});
