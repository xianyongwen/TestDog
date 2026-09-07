/**
 * 网络捕获服务测试：
 * - 入库筛选：xhr/fetch 全收，document 200 不收，document 4xx 收（文档级错误可见）
 * - body 异步回填：提交后立刻 getBody 短等回填；无 body 提示不报错
 * - list：keyword 过滤、空提示、超预算截断保留最新
 * - getBody：头尾保留截断、search 命中片段与未命中提示
 * - searchInBodies：多条命中片段、按 URL keyword 过滤
 * - 新标签覆盖：context 'page' 事件新页面响应也被捕获
 * - dispose：幂等，移除监听后不再捕获
 */
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { NetworkCapture } from '../src/services/networkCaptureService';

/** 伪造 playwright page/context（仅监听能力）。 */
function fakePage() {
  const page: any = new EventEmitter();
  const context: any = new EventEmitter();
  page.context = () => context;
  return { page, context };
}

/** 伪造 playwright response（runnerService 同款字段口径）。 */
function fakeResponse(o: {
  url: string;
  status: number;
  method?: string;
  type?: string;
  ct?: string;
  body?: string;
  textDelayMs?: number;
}) {
  return {
    url: () => o.url,
    status: () => o.status,
    statusText: () => '',
    request: () => ({
      method: () => o.method ?? 'GET',
      resourceType: () => o.type ?? 'xhr',
    }),
    headers: () => ({ 'content-type': o.ct ?? 'application/json' }),
    text: async () => {
      if (o.textDelayMs) await new Promise((r) => setTimeout(r, o.textDelayMs));
      return o.body ?? '';
    },
  };
}

function emit(page: any, res: any) {
  page.emit('response', res);
}

/** 等待 body 异步回填的微任务跑完（真实场景 LLM 查询距响应至少数百 ms，无需此步）。 */
const flush = () => new Promise((r) => setTimeout(r, 5));

describe('NetworkCapture 入库筛选', () => {
  it('xhr 200 收，document 200 不收，document 404 收', () => {
    const { page } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    emit(page, fakeResponse({ url: 'http://a/api/list', status: 200 }));
    emit(page, fakeResponse({ url: 'http://a/index.js', status: 200, type: 'script', ct: 'application/javascript' }));
    emit(page, fakeResponse({ url: 'http://a/login', status: 404, type: 'document', ct: 'text/html' }));
    // 被过滤的静态资源不占 id：编号只对应入库条目
    expect(cap.list()).toBe('#1 GET 200 http://a/api/list\n#2 GET 404 http://a/login');
    cap.dispose();
  });
});

describe('NetworkCapture body 回填', () => {
  it('提交后立刻 getBody 短等回填到响应体', async () => {
    const { page } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    emit(page, fakeResponse({ url: 'http://a/api/user', status: 200, method: 'POST', body: '{"ok":true}', textDelayMs: 100 }));
    const out = await cap.getBody(1);
    expect(out).toContain('POST 200');
    expect(out).toContain('{"ok":true}');
    cap.dispose();
  });

  it('非文本类响应无 body 时给出提示而非报错', async () => {
    const { page } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    emit(page, fakeResponse({ url: 'http://a/api/bin', status: 200, ct: 'application/octet-stream' }));
    const out = await cap.getBody(1);
    expect(out).toContain('无响应体或读取失败');
    cap.dispose();
  });

  it('未存在的 id 返回引导提示', async () => {
    const { page } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    expect(await cap.getBody(99)).toContain('未找到条目 #99');
    cap.dispose();
  });
});

describe('NetworkCapture list', () => {
  it('keyword 大小写不敏感过滤；无命中给提示', () => {
    const { page } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    emit(page, fakeResponse({ url: 'http://a/api/USER/list', status: 200 }));
    emit(page, fakeResponse({ url: 'http://a/api/order', status: 200 }));
    expect(cap.list('user')).toBe('#1 GET 200 http://a/api/USER/list');
    expect(cap.list('nope')).toBe('（未捕获 URL 含「nope」的请求）');
    cap.dispose();
  });

  it('空缓冲给空提示', () => {
    const { page } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    expect(cap.list()).toBe('（暂无捕获的网络请求）');
    cap.dispose();
  });

  it('超过条数上限只保留最新并提示省略', () => {
    const { page } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    for (let i = 0; i < 80; i++) emit(page, fakeResponse({ url: `http://a/api/item/${i}`, status: 200 }));
    const out = cap.list();
    expect(out.startsWith('（更早 20 条已省略')).toBe(true);
    expect(out).toContain('/api/item/79'); // 最新在
    expect(out).not.toContain('/api/item/19'); // 最旧的可见窗口外
    cap.dispose();
  });
});

describe('NetworkCapture getBody 截断与搜索', () => {
  it('长响应体头尾保留、中间省略', async () => {
    const { page } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    const body = 'HEAD'.repeat(1000) + 'TAIL'.repeat(300); // 5200 字符
    emit(page, fakeResponse({ url: 'http://a/api/big', status: 200, body }));
    await flush();
    const out = await cap.getBody(1);
    expect(out).toContain('…(中间省略)…');
    expect(out).toContain(body.slice(0, 100));
    expect(out).toContain(body.slice(-100));
    cap.dispose();
  });

  it('search 命中展示片段；未命中给提示', async () => {
    const { page } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    emit(page, fakeResponse({ url: 'http://a/api/user', status: 400, method: 'POST', body: 'x'.repeat(300) + '手机号码重复' + 'y'.repeat(300) }));
    await flush();
    const hit = await cap.getBody(1, '重复');
    expect(hit).toContain('命中「重复」片段');
    expect(hit).toContain('手机号码重复');
    const miss = await cap.getBody(1, '不存在');
    expect(miss).toContain('未找到「不存在」');
    cap.dispose();
  });
});

describe('NetworkCapture searchInBodies', () => {
  it('多条命中片段、按 URL keyword 过滤、无命中提示', async () => {
    const { page } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    emit(page, fakeResponse({ url: 'http://a/api/user', status: 400, body: '手机号码已存在' }));
    emit(page, fakeResponse({ url: 'http://a/api/order', status: 200, body: '库存手机配件' }));
    emit(page, fakeResponse({ url: 'http://a/api/other', status: 200, body: '' })); // body 空
    await flush();
    const out = cap.searchInBodies(undefined, '手机');
    expect(out).toContain('#1 GET 400 http://a/api/user');
    expect(out).toContain('手机号码已存在');
    expect(out).toContain('#2 GET 200 http://a/api/order');
    const filtered = cap.searchInBodies('user', '手机');
    expect(filtered).toContain('#1');
    expect(filtered).not.toContain('#2');
    expect(cap.searchInBodies(undefined, '没有的字')).toContain('未在响应体中找到');
    cap.dispose();
  });
});

describe('NetworkCapture 监听生命周期', () => {
  it('context page 事件的新标签响应也被捕获', () => {
    const { page, context } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    const popup: any = new EventEmitter();
    context.emit('page', popup);
    emit(popup, fakeResponse({ url: 'http://a/popup/api', status: 200 }));
    expect(cap.list()).toContain('http://a/popup/api');
    cap.dispose();
  });

  it('dispose 后不再捕获且可重复调用', async () => {
    const { page, context } = fakePage();
    const cap = new NetworkCapture();
    cap.attach(page);
    expect(page.listenerCount('response')).toBe(1);
    expect(context.listenerCount('page')).toBe(1);
    cap.dispose();
    cap.dispose();
    expect(page.listenerCount('response')).toBe(0);
    expect(context.listenerCount('page')).toBe(0);
    emit(page, fakeResponse({ url: 'http://a/after', status: 200 }));
    expect(cap.list()).toBe('（暂无捕获的网络请求）');
    // dispose 后再 attach 不复活
    cap.attach(page);
    emit(page, fakeResponse({ url: 'http://a/after2', status: 200 }));
    expect(cap.list()).toBe('（暂无捕获的网络请求）');
  });
});
