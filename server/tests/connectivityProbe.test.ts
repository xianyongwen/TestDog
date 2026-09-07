/**
 * connectivityProbe 单测：运行前连通性探测（首个 goto URL 的一次 GET 预检）。
 * - resolveProbeTarget：取首个 action='goto' 步骤的 url，无则 undefined
 * - probeConnectivity 跳过分支：非 http(s)、不可解析 URL、含未解析占位符 → undefined 且不发请求
 * - 成功分支：任何 HTTP 状态码（含 4xx/5xx）都算可达，返回状态码并取消响应体
 * - 失败分类：errno/超时映射为面向用户的中文提示，消息里带原始 URL
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveProbeTarget, probeConnectivity } from '../src/services/connectivityProbe';
import type { TestStep } from '../src/shared/testScript';

const goto = (url: string): TestStep => ({ kind: 'navigate', action: 'goto', instruction: '打开页面', url } as TestStep);
const click: TestStep = { kind: 'action', action: 'click', instruction: '点一下' } as TestStep;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveProbeTarget（首个 goto URL）', () => {
  it('取首个 goto 步骤的 url', () => {
    expect(resolveProbeTarget([click, goto('http://a.example/'), goto('http://b.example/')])).toBe('http://a.example/');
  });

  it('无 goto 步骤返回 undefined', () => {
    expect(resolveProbeTarget([click, { kind: 'assert', action: 'assert', instruction: '断言' } as TestStep])).toBeUndefined();
    expect(resolveProbeTarget([])).toBeUndefined();
  });
});

describe('probeConnectivity 跳过分支（不发请求）', () => {
  it('非 http(s) / 不可解析 URL / 含未解析占位符 → undefined', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const url of ['about:blank', '/relative/path', 'file:///tmp/a.html', 'http://a b/', 'http://x.example/{{baseUrl}}/login', 'http://x.example/${systemTime}']) {
      await expect(probeConnectivity(url)).resolves.toBeUndefined();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('probeConnectivity 成功分支（任意状态码都算可达）', () => {
  it('返回状态码并取消响应体', async () => {
    let cancelCalled = false;
    const fetchMock = vi.fn().mockResolvedValue({ status: 503, body: { cancel: async () => { cancelCalled = true; } } });
    vi.stubGlobal('fetch', fetchMock);
    await expect(probeConnectivity('http://ok.example/x')).resolves.toBe(503);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cancelCalled).toBe(true);
  });
});

describe('probeConnectivity 失败分类', () => {
  const rejectWith = (cause: unknown) => {
    const err = new Error('fetch failed');
    (err as any).cause = cause;
    return vi.fn().mockRejectedValue(err);
  };

  it('ECONNREFUSED → 连接被拒绝，消息带 URL', async () => {
    vi.stubGlobal('fetch', rejectWith(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:59999'), { code: 'ECONNREFUSED' })));
    await expect(probeConnectivity('http://127.0.0.1:59999/')).rejects.toThrow(/连通性探测失败：无法访问 http:\/\/127\.0\.0\.1:59999\/（连接被拒绝/);
  });

  it('ENOTFOUND → 域名解析失败', async () => {
    vi.stubGlobal('fetch', rejectWith(Object.assign(new Error('getaddrinfo ENOTFOUND no-such-host'), { code: 'ENOTFOUND' })));
    await expect(probeConnectivity('http://no-such-host.invalid/')).rejects.toThrow('域名解析失败');
  });

  it('超时（TimeoutError）→ 连接超时', async () => {
    vi.stubGlobal('fetch', rejectWith(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })));
    await expect(probeConnectivity('http://slow.example/')).rejects.toThrow('连接超时');
  });
});
