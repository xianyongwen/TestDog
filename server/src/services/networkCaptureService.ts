/**
 * 生成期网络捕获服务：
 * - 挂在生成会话的 CDP 桥 playwright 视图上 page.on('response')，收集 xhr/fetch 与 4xx+ 响应
 * - 供生成循环 api 工具查询接口请求列表/响应体，定位「页面看不出、接口已报错」的失败
 *   （如提交表单后接口返回「手机号码重复」但 UI 无提示，模型只能反复点击）
 * - 与回放采集（runnerService 整轮累积 + 失败步骤落库）互不影响；纯观察，不落脚本步骤
 */

export interface NetworkEntry {
  /** 单调递增，api 工具用 id 引用条目。 */
  id: number;
  url: string;
  method: string;
  status: number;
  statusText: string;
  ts: number;
  /** 异步回填的响应体（仅文本类，截断 20KB，与回放采集同口径）。 */
  body?: string;
  /** body 读取中的 promise（getBody 短等，避免提交后立刻查询读不到 body）。 */
  pending?: Promise<void>;
}

const MAX_ENTRIES = 200; // 有界缓冲，溢出移除最旧（内存上限约 4MB，会话级）
const URL_MAX = 120; // 列表行内 url 截断
const LIST_MAX = 60; // 列表最多展示条数
const LIST_CHARS = 2500; // 列表整体字符预算
const BODY_HEAD = 3000; // 响应体查看：头保留
const BODY_TAIL = 800; // 响应体查看：尾保留（错误可能在任一端）
const BODY_PENDING_MS = 2000; // getBody 等待 body 回填的上限

/** 生成会话的网络捕获：attach 后被动收集，dispose 移除全部监听（幂等）。 */
export class NetworkCapture {
  private entries: NetworkEntry[] = [];
  private nextId = 1;
  private responseHandlers: Array<[page: any, h: (res: any) => void]> = [];
  private contextHandlers: Array<[context: any, h: (p: any) => void]> = [];
  private disposed = false;

  /** 挂载到页面；同时订阅 context 的 page 事件，弹窗/新标签自动覆盖。可多次调用。 */
  attach(page: any): void {
    if (this.disposed) return;
    const onResponse = (res: any) => this.onResponse(res);
    page.on('response', onResponse);
    this.responseHandlers.push([page, onResponse]);
    let context: any = null;
    try {
      context = page.context();
    } catch {
      /* 页面已关闭则不订阅新标签 */
    }
    if (context && !this.contextHandlers.some(([c]) => c === context)) {
      const onPage = (p: any) => {
        try {
          this.attach(p);
        } catch {
          /* 新页面不可用则忽略 */
        }
      };
      context.on('page', onPage);
      this.contextHandlers.push([context, onPage]);
    }
  }

  private onResponse(res: any): void {
    try {
      const req = res.request();
      let type = '';
      try {
        type = String(req.resourceType() ?? '');
      } catch {
        /* 类型取不到时按状态码决定去留 */
      }
      const status = Number(res.status?.() ?? 0);
      // 只收接口流量（xhr/fetch）与异常状态（文档级错误也可见），静态资源不入缓冲
      if (type !== 'xhr' && type !== 'fetch' && status < 400) return;
      const entry: NetworkEntry = {
        id: this.nextId++,
        url: String(res.url?.() ?? ''),
        method: String(req.method?.() ?? ''),
        status,
        statusText: String(res.statusText?.() ?? ''),
        ts: Date.now(),
      };
      this.entries.push(entry);
      if (this.entries.length > MAX_ENTRIES) this.entries.shift();
      // 异步读取响应体回填（仅文本类；body 只能读一次，失败静默）——与 runnerService 回放采集同口径
      const ct = String(res.headers?.()['content-type'] ?? '');
      if (ct === '' || /(json|text|html|xml|javascript|form-urlencoded)/i.test(ct)) {
        entry.pending = res
          .text()
          .then((body: string) => {
            entry.body = body.length > 20000 ? body.slice(0, 20000) + '…[截断]' : body;
          })
          .catch(() => {
            /* 无 body 或连接已关闭 */
          });
      }
    } catch {
      /* 忽略已关闭的请求 */
    }
  }

  private filtered(keyword?: string): NetworkEntry[] {
    const kw = keyword?.trim().toLowerCase();
    return kw ? this.entries.filter((e) => e.url.toLowerCase().includes(kw)) : this.entries;
  }

  private line(e: NetworkEntry): string {
    const st = e.statusText ? ` ${e.statusText}` : '';
    const url = e.url.length > URL_MAX ? e.url.slice(0, URL_MAX) + '…' : e.url;
    return `#${e.id} ${e.method} ${e.status}${st} ${url}`;
  }

  /** 列出最近捕获的请求（keyword 为 URL 子串过滤，大小写不敏感），最新在后。 */
  list(keyword?: string): string {
    const rows = this.filtered(keyword);
    if (!rows.length) return keyword?.trim() ? `（未捕获 URL 含「${keyword.trim()}」的请求）` : '（暂无捕获的网络请求）';
    const lines: string[] = [];
    let used = 0;
    for (let i = rows.length - 1; i >= 0 && lines.length < LIST_MAX; i--) {
      const l = this.line(rows[i]);
      if (used + l.length + 1 > LIST_CHARS && lines.length > 0) break;
      lines.unshift(l);
      used += l.length + 1;
    }
    const omitted = rows.length - lines.length;
    return (omitted > 0 ? `（更早 ${omitted} 条已省略，可用 keyword 过滤）\n` : '') + lines.join('\n');
  }

  /** 查看条目响应体（body 未回填时短等 2s）；search 在响应体内找关键字并展示片段。 */
  async getBody(id: number, search?: string): Promise<string> {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return `（未找到条目 #${id}：可能尚未捕获或已被移出缓冲，可先调用列表查看现有条目）`;
    if (e.body == null && e.pending) {
      await Promise.race([e.pending, new Promise<void>((r) => setTimeout(r, BODY_PENDING_MS))]);
    }
    const head = this.line(e);
    if (e.body == null) return `${head}\n（无响应体或读取失败：非文本类响应，或浏览器已丢弃该响应）`;
    const kw = search?.trim();
    if (kw) {
      const idx = e.body.indexOf(kw);
      if (idx < 0) return `${head}\n（响应体内未找到「${kw}」，body 长度 ${e.body.length} 字符）`;
      const from = Math.max(0, idx - 200);
      const to = Math.min(e.body.length, idx + kw.length + 200);
      const frag = (from > 0 ? '…' : '') + e.body.slice(from, to) + (to < e.body.length ? '…' : '');
      return `${head}\n响应体命中「${kw}」片段：\n${frag}`;
    }
    const body =
      e.body.length > BODY_HEAD + BODY_TAIL
        ? e.body.slice(0, BODY_HEAD) + '\n…(中间省略)…\n' + e.body.slice(-BODY_TAIL)
        : e.body;
    return `${head}\n${body}`;
  }

  /** 在过滤后条目的响应体内搜关键字（最多 5 条命中，各带片段）。 */
  searchInBodies(urlKeyword: string | undefined, text: string): string {
    const kw = text.trim();
    if (!kw) return '（缺少搜索关键字）';
    const rows = this.filtered(urlKeyword);
    const hits: string[] = [];
    for (const e of rows) {
      if (!e.body) continue;
      const idx = e.body.indexOf(kw);
      if (idx < 0) continue;
      const from = Math.max(0, idx - 100);
      const to = Math.min(e.body.length, idx + kw.length + 100);
      hits.push(`${this.line(e)}\n  ${(from > 0 ? '…' : '') + e.body.slice(from, to) + (to < e.body.length ? '…' : '')}`);
      if (hits.length >= 5) break;
    }
    if (!hits.length) {
      const reading = rows.filter((e) => e.pending && e.body == null).length;
      return `（未在响应体中找到「${kw}」${reading ? `；${reading} 条响应体仍在读取中，可稍后重试` : ''}）`;
    }
    return hits.join('\n');
  }

  /** 移除全部监听（幂等）；缓冲随实例回收。 */
  dispose(): void {
    this.disposed = true;
    for (const [page, h] of this.responseHandlers.splice(0)) {
      try {
        page.off('response', h);
      } catch {
        /* 连接已断开 */
      }
    }
    for (const [context, h] of this.contextHandlers.splice(0)) {
      try {
        context.off('page', h);
      } catch {
        /* 连接已断开 */
      }
    }
  }
}
