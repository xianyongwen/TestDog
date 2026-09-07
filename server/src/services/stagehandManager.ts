import { Stagehand, localBrowser } from '@browserbasehq/stagehand';
import OpenAI from 'openai';
import { chromium, type Browser } from 'playwright-core';
import { createServer } from 'node:net';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfig } from '../config';
import { browserLaunchOptions, detectSystemChrome, DEFAULT_VIEWPORT } from '../browser';
import type { ViewportSize } from '../shared/viewport';
import { addUsage, getUsage } from './tokenUsage';

/** 按 jobId 隔离的 Stagehand 会话（生成/智能体各自一个干净浏览器，结束即关）。 */
interface Session {
  stagehand: Stagehand;
  browser: any; // localBrowser.launch 的浏览器，closeSession 负责关闭
  userDataDir?: string; // 显式分配的 profile 目录（realpath 解析），closeSession 负责清理
  cdpPort?: number; // 浏览器 CDP 端口：供 playwright connectOverCDP 附加做精确验证/回放
  /** 浏览器异常关闭（用户手动关窗口等）时的回调；正常 closeSession 前会先清空，避免误触发。 */
  onClosed?: () => void;
  /** 关闭监听连接：playwright connectOverCDP 到 cdpPort，借其 disconnected 事件感知浏览器被手动关闭。 */
  monitor?: Browser;
  monitorClosed?: boolean;
}
const sessions = new Map<string, Session>();

/**
 * 注册浏览器异常关闭回调：当用户手动关闭该会话的浏览器窗口时触发（用于取消生成/智能体流程）。
 * 正常 closeSession 主动关闭不会触发。返回取消注册函数。重复注册会覆盖之前的回调。
 */
export function onSessionBrowserClosed(jobId: string, handler: () => void): () => void {
  const s = sessions.get(jobId);
  if (!s) return () => {};
  s.onClosed = handler;
  void ensureCloseMonitor(jobId);
  return () => {
    if (sessions.get(jobId) === s) s.onClosed = undefined;
  };
}

/**
 * 建立/复用关闭监听连接：用 playwright connectOverCDP 连到会话浏览器的 CDP 端口，
 * 浏览器被手动关闭时该连接会触发 disconnected，据此回调 onClosed。
 * 连接失败（浏览器尚未就绪等）静默忽略，避免影响主流程。
 */
async function ensureCloseMonitor(jobId: string): Promise<void> {
  const s = sessions.get(jobId);
  if (!s || !s.cdpPort || s.monitor || s.monitorClosed) return;
  try {
    const monitor = await chromium.connectOverCDP(`http://127.0.0.1:${s.cdpPort}`);
    s.monitor = monitor;
    monitor.on('disconnected', () => {
      s.monitorClosed = true;
      s.onClosed?.();
    });
  } catch {
    /* 监听连接失败不致命，忽略 */
  }
}

/** 包装 OpenAI 客户端：拦截 chat.completions.create，把每次返回的 usage 计入 jobId 账户。 */
function wrapOpenAIWithUsage(client: OpenAI, jobId: string): OpenAI {
  const origCreate = client.chat.completions.create.bind(client.chat.completions);
  (client.chat.completions as any).create = (...args: any[]) => {
    const ret = (origCreate as any)(...args);
    // Stagehand 走 stream:false，返回 Promise<ChatCompletion>；流式返回 Stream，无 usage。
    if (ret && typeof ret.then === 'function') {
      return ret.then((res: any) => {
        const u = res?.usage;
        if (u) {
          addUsage(jobId, {
            inputTokens: u.prompt_tokens ?? 0,
            outputTokens: u.completion_tokens ?? 0,
            totalTokens: u.total_tokens ?? 0,
            cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
          });
          if (process.env.TT_USAGE_DEBUG) {
            console.log(`[usage] +${u.total_tokens}（缓存 ${u.prompt_tokens_details?.cached_tokens ?? 0}）job=${jobId} 累计=${getUsage(jobId).totalTokens}`);
          }
        }
        return res;
      });
    }
    return ret;
  };
  return client;
}

export function createGatewayClient(usageKey: string): OpenAI {
  const c = getConfig();
  return wrapOpenAIWithUsage(new OpenAI({ apiKey: c.openaiApiKey, baseURL: c.openaiBaseUrl }), usageKey);
}

// ---- Stagehand v4 ClientLLM：把浏览器 worker 的 LLM 请求转发到 OpenAI 兼容网关 ----
// v4 不再有 v3 的 CustomOpenAIClient / getLanguageModel；本地 LLM 走 model: { generate }，
// 请求/响应是「内容块」格式（text/image/tool_use/tool_result），此处双向翻译为 Chat Completions。

function contentBlocks(content: unknown): any[] {
  if (Array.isArray(content)) return content;
  return content ? [content] : [];
}

/** 把 Stagehand 的消息数组翻译为 OpenAI messages（tool_result 拆成 role:'tool'，tool_use 并入 assistant.tool_calls）。 */
function buildOpenAIMessages(req: any, systemPrompt?: string): OpenAI.ChatCompletionMessageParam[] {
  const out: OpenAI.ChatCompletionMessageParam[] = [];
  for (const m of req.messages ?? []) {
    const blocks = contentBlocks(m.content);
    if (m.role === 'assistant') {
      const textParts = blocks.filter((b) => b.type === 'text').map((b) => ({ type: 'text' as const, text: String(b.text) }));
      const toolUses = blocks.filter((b) => b.type === 'tool_use');
      const assistantMsg: any = { role: 'assistant', content: textParts.length ? textParts : null };
      if (toolUses.length) {
        assistantMsg.tool_calls = toolUses.map((b) => ({
          id: b.id,
          type: 'function',
          function: {
            name: b.name,
            arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? {}),
          },
        }));
      }
      out.push(assistantMsg);
    } else {
      const toolResults = blocks.filter((b) => b.type === 'tool_result');
      const others = blocks.filter((b) => b.type !== 'tool_result');
      if (others.length) {
        out.push({
          role: 'user',
          content: others.map((b) =>
            b.type === 'image'
              ? { type: 'image_url' as const, image_url: { url: `data:${b.mimeType};base64,${b.data}` } }
              : { type: 'text' as const, text: String(b.text) },
          ),
        });
      }
      for (const tr of toolResults) {
        const text = contentBlocks(tr.content)
          .map((c: any) => (c.type === 'text' ? String(c.text) : '[图片]'))
          .join('\n');
        out.push({ role: 'tool', tool_call_id: tr.toolUseId, content: text });
      }
    }
  }
  if (systemPrompt) out.unshift({ role: 'system', content: String(systemPrompt) });
  return out;
}

function buildOpenAITools(tools: any[]): any[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
}

function mapStopReason(finishReason: string | undefined): string {
  switch (finishReason) {
    case 'tool_calls': return 'tool_use';
    case 'length': return 'max_tokens';
    case 'content_filter': return 'content_filter';
    default: return finishReason || 'stop';
  }
}

/**
 * 把单个 elementId 归一化为 Stagehand 要求的 ^\d+-\d+$（帧序号-节点ID）：
 * - 去掉方括号："[0-18372]" -> "0-18372"
 * - 纯数字补帧序号："18372" -> "0-18372"（帧序号恒为 0 的场景，比直接报错可用）
 * - 混入其他文本时尝试提取 "数字-数字" 片段
 * 无法修复则原样返回（Stagehand 校验会拒绝，但至少不静默改错）。
 */
function normalizeElementId(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const s = v.trim().replace(/^\[|\]$/g, '');
  if (/^\d+-\d+$/.test(s)) return s;
  const m = s.match(/(\d+)-(\d+)/);
  if (m) return `${m[1]}-${m[2]}`;
  if (/^\d+$/.test(s)) return `0-${s}`;
  return v;
}

/** 递归遍历结构化输出，把所有 elementId 字段归一化为 ^\d+-\d+$（模型常漏帧序号/带括号导致 Stagehand schema 校验失败）。 */
function normalizeStructuredOutput(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeStructuredOutput);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = k === 'elementId' ? normalizeElementId(v) : normalizeStructuredOutput(v);
    }
    return out;
  }
  return node;
}

/** 构造 Stagehand v4 的本地 LLM：model: { generate }。所有 act/observe 的模型调用经此转发到网关。 */
function createClientLLM(usageKey: string) {
  const client = createGatewayClient(usageKey);
  return {
    generate: async (req: any): Promise<any> => {
      const cfg = getConfig();
      // 兼容网关（如 deepseek）只支持 response_format=json_object、不支持 json_schema：
      // 把目标 schema 写进 system 提示约束结构，返回后客户端按 schema 解析。
      const structured = req.responseFormat?.type === 'json_schema';
      const schema = structured ? (req.responseFormat?.schema as any) : undefined;
      let systemPrompt = req.systemPrompt;
      if (structured && schema && typeof schema === 'object') {
        systemPrompt = `${systemPrompt ? systemPrompt + '\n\n' : ''}输出必须是一个 JSON 对象且严格符合下面的 JSON Schema（顶层若是 object 就输出对象，不要输出裸数组）：\n${JSON.stringify(schema).slice(0, 4000)}\n\n特别注意：所有 "elementId" 字段必须是「帧序号-节点ID」格式（如 "0-18372"），只能包含数字和中间的连字符，不要带方括号，不要只写节点 ID（如 "18372"）。`;
      }
      const body: any = {
        model: cfg.openaiModel,
        messages: buildOpenAIMessages(req, systemPrompt),
      };
      const tools = req.tools?.length ? buildOpenAITools(req.tools) : undefined;
      if (tools) {
        body.tools = tools;
        if (req.toolChoice?.mode) body.tool_choice = req.toolChoice.mode;
      }
      if (structured) body.response_format = { type: 'json_object' };
      if (req.temperature != null) body.temperature = req.temperature;
      if (req.stopSequences?.length) body.stop = req.stopSequences;
      // 思考口径与主循环一致（见 toolLoop）：low/high/max 透传 reasoning_effort；
      // '' 发 thinking disabled 真关闭（DeepSeek 思考模式默认打开且 effort=high，不发送≠关闭）
      if (cfg.reasoningEffort) body.reasoning_effort = cfg.reasoningEffort;
      else {
        body.thinking = { type: 'disabled' };
        if (body.temperature == null) body.temperature = 0;
      }

      const completion = await client.chat.completions.create(body);
      const choice = completion.choices?.[0];
      const msg = choice?.message ?? {};
      const usage = completion.usage;
      const u = usage
        ? {
            inputTokens: usage.prompt_tokens ?? 0,
            outputTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
            reasoningTokens: (usage as any).completion_tokens_details?.reasoning_tokens ?? 0,
            cachedInputTokens: (usage as any).prompt_tokens_details?.cached_tokens ?? 0,
          }
        : undefined;

      const contentText = typeof msg.content === 'string' ? msg.content : '';
      const content: any[] = contentText ? [{ type: 'text', text: contentText }] : [];
      for (const tc of msg.tool_calls ?? []) {
        let input: any = {};
        try {
          input = JSON.parse(tc.function?.arguments ?? '{}');
        } catch {
          input = {};
        }
        content.push({ type: 'tool_use', id: tc.id, name: tc.function?.name ?? '', input });
      }

      const base = { role: 'assistant', content, stopReason: mapStopReason(choice?.finish_reason), usage: u };
      if (structured) {
        let parsed: any = {};
        try {
          const cleaned = contentText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          parsed = JSON.parse(cleaned);
        } catch {
          parsed = {};
        }
        // 归一化：schema 顶层要求 object 但模型返回了裸数组时，包成 schema 里唯一的数组属性
        // （Stagehand 的 observe 期望 { elements: [...] }，模型常直接输出 elements 数组）。
        if (Array.isArray(parsed) && schema?.type === 'object' && schema.properties) {
          const arrKey = Object.keys(schema.properties).find((k) => schema.properties[k]?.type === 'array');
          if (arrKey) parsed = { [arrKey]: parsed };
        }
        // elementId 格式兜底：模型常漏帧序号/带括号，Stagehand 的 zod 校验要求严格 ^\d+-\d+$，
        // 不修复会直接抛 invalid_format 导致 observe/act 整步失败。
        parsed = normalizeStructuredOutput(parsed);
        return { ...base, outputFormat: 'json_schema', structuredContent: parsed };
      }
      return { ...base, outputFormat: 'text' };
    },
  };
}

/** 分配一个 realpath 解析后的临时 profile 目录。
 *  chrome-launcher 默认用 mktemp 在 macOS 的 /var/folders（软链到 /private/var）下建目录，
 *  Chrome 的 SingletonLock 按 realpath 检测会与软链路径对不上，触发「个人资料打开失败」提示，
 *  故这里显式分配并解析真实路径。 */
function makeUserDataDir(): string {
  const raw = mkdtempSync(join(tmpdir(), 'testtool-chrome-'));
  try {
    return realpathSync(raw);
  } catch {
    return raw;
  }
}

/** v4 本地浏览器 launch 选项：把 browserLaunchOptions 的 channel 转为 executablePath（v4 只认 executablePath），
 *  并分配显式 profile 目录（realpath 解析，避免 macOS 软链路径导致的 profile 锁误判）。
 *  chrome-launcher 默认带 --password-store=basic --use-mock-keychain，会强制在临时 profile 里开
 *  SQLite 密码库/历史库失败，进而弹「打开个人资料时出问题」——这里去掉。 */
function launchOptions(headless = false, viewport?: ViewportSize | null): { opts: Record<string, any>; userDataDir: string } {
  const base = browserLaunchOptions();
  const userDataDir = makeUserDataDir();
  const opts: Record<string, any> = {
    headless,
    userDataDir,
    // localBrowser 按 viewport 生成 --window-size=W,H（有头=窗口大小，无头=视口大小）；未配置时回落全局默认
    viewport: viewport ?? DEFAULT_VIEWPORT,
    // 只去掉 --password-store=basic：它会强制在临时 profile 里开 SQLite 密码库失败，触发「打开个人资料出问题」；
    // 保留 --use-mock-keychain：让 Chrome 用模拟钥匙串，避免弹真实 macOS 钥匙串的「Chromium Safe Storage」授权框。
    ignoreDefaultArgs: ['--password-store=basic'],
  };
  if (base.executablePath) opts.executablePath = base.executablePath;
  else if (base.channel) {
    const detected = detectSystemChrome();
    if (detected) opts.executablePath = detected;
  }
  return { opts, userDataDir };
}

/** 取一个本地空闲端口（用于给 Stagehand 启动的回放浏览器当 CDP 端口，避免并发冲突）。 */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * 探测 127.0.0.1:port 上是否已有进程在监听（TCP 层）。
 * chrome-launcher 在传入显式 port 时，会先 `isDebuggerReady()` 探测该端口，
 * 一旦发现有进程监听就直接复用（不再启动新 Chrome）。这会导致：
 *   - 复用到一个「非本工具按正确参数启动」的 Chrome（如用户日常浏览器/残留实例）；
 *   - 该实例不支持 Extensions.loadUnpacked，最终报 `Method not available`。
 * 故这里在 launch 前主动探测，若端口已被占用则换端口，避免复用旧实例。
 */
function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(true)); // 端口被占用
    srv.once('listening', () => srv.close(() => resolve(false)));
    srv.listen(port, '127.0.0.1');
  });
}

/**
 * 取一个「TCP 层真正空闲」的 CDP 端口：
 * getFreePort 的 close→listen 之间存在竞态（close 后可能被其它进程抢占），
 * 这里拿到端口后额外做一次占用探测，被占用则重试，最多 10 次。
 */
async function getFreeCdpPort(): Promise<number> {
  for (let i = 0; i < 10; i++) {
    const port = await getFreePort();
    if (!(await isPortListening(port))) return port;
  }
  // 极端情况下仍可能被抢占，返回最后一次的值，由 launch 的失败路径兜底
  return getFreePort();
}

/**
 * 启动全新浏览器会话（统一入口）：
 * 用 getFreeCdpPort 拿到「TCP 层真正空闲」的端口，避免 chrome-launcher 复用已存在、
 * 未按正确调试参数启动的 Chrome 实例（这正是 Windows 上 `Method not available` 的根因）。
 */
async function launchFreshBrowser(lo: Record<string, any>, cdpPort: number): Promise<any> {
  // 双重保险：launch 前再次确认端口未被占用；若被抢占则换端口重试
  for (let attempt = 0; attempt < 3; attempt++) {
    const port = attempt === 0 ? cdpPort : await getFreeCdpPort();
    if (await isPortListening(port)) continue;
    return await localBrowser.launch({ ...lo, port });
  }
  return await localBrowser.launch({ ...lo, port: cdpPort });
}

/**
 * 把浏览器启动错误转成对用户友好的中文提示。
 * 识别两类典型问题：
 *  1. Method not available / Method not found / -32601：
 *     Chrome 经 CDP 拒绝某个协议方法（如 Extensions.loadUnpacked），
 *     多为残留 Chrome 实例被复用、或浏览器进程冲突导致，提示用户清理进程后重试。
 *  2. 个人资料 / profile 相关：临时 profile 目录冲突。
 * 无法识别时原样返回原始错误文本。
 */
export function friendlyBrowserLaunchError(e: unknown): string {
  const raw = String(e);
  if (/method\s*not\s*available|method\s*not\s*found|-32601|Extensions\.loadUnpacked/i.test(raw)) {
    return `${raw}。这通常是浏览器实例冲突（残留的 Chrome 进程被复用）导致，请关闭所有 Chrome 窗口与后台进程后重试；若仍失败，请重启电脑后再试。`;
  }
  if (/profile|个人资料|打开个人资料|user[- ]data[- ]dir/i.test(raw)) {
    return `${raw}。这通常是浏览器临时配置目录冲突导致，请关闭所有 Chrome 窗口与后台进程后重试。`;
  }
  return raw;
}

/** 创建会话：localBrowser.launch 全新浏览器（本模块持有，closeSession 负责关闭）。自带 CDP 端口供精确验证。 */
export async function createSession(
  jobId: string,
  opts: { usageKey?: string; viewport?: ViewportSize | null } = {},
): Promise<Stagehand> {
  const usageKey = opts.usageKey ?? jobId;
  const cdpPort = await getFreeCdpPort();
  const { opts: lo, userDataDir } = launchOptions(false, opts.viewport);
  const browser = await launchFreshBrowser(lo, cdpPort);
  const stagehand = await Stagehand.create({
    browser,
    model: { generate: createClientLLM(usageKey).generate },
    logging: { level: 'warn' },
  } as any);
  sessions.set(jobId, { stagehand, browser, userDataDir, cdpPort });
  return stagehand;
}

/**
 * 为「回放」启动一个可被 playwright connectOverCDP 复用的浏览器：
 * Stagehand 自建浏览器（其页面扩展 world 完整，自愈可 act），并用随机空闲 CDP 端口
 * 让 playwright 连上去做确定性回放与 console/network/ws 事件采集。
 * 返回的 stagehand 已入 sessions，由 closeSession 负责关闭。
 */
export async function createRunBrowser(
  jobId: string,
  opts: { usageKey?: string; headless?: boolean; viewport?: ViewportSize | null } = {},
): Promise<{ stagehand: Stagehand; cdpPort: number }> {
  const usageKey = opts.usageKey ?? jobId;
  const cdpPort = await getFreeCdpPort();
  const { opts: lo, userDataDir } = launchOptions(opts.headless === true, opts.viewport);
  const browser = await launchFreshBrowser(lo, cdpPort);
  const stagehand = await Stagehand.create({
    browser,
    model: { generate: createClientLLM(usageKey).generate },
    logging: { level: 'warn' },
  } as any);
  sessions.set(jobId, { stagehand, browser, userDataDir, cdpPort });
  return { stagehand, cdpPort };
}

/**
 * 以登录配置的 storageState 启动已登录会话。v4 只能操作 Stagehand 自建页面，故不复用
 * playwright 的 storageState context，改为：
 * 1. 起一个干净的 Stagehand 会话（自建页面可被 act/observe 操作）；
 * 2. 把 storageState.cookies 通过 context.addCookies 注入会话（新页面共享该会话 cookie）；
 * 3. localStorage（origins）通过 addInitScript 在每次导航后按 origin 回填。
 * 返回的 stagehand 由 closeSession 负责关闭。
 */
export async function createSessionWithStorageState(
  jobId: string,
  storageState: unknown,
  viewport?: ViewportSize | null,
): Promise<Stagehand> {
  const stagehand = await createSession(jobId, { viewport });
  const ss = storageState as { cookies?: { name: string; value: string; domain: string; path: string; secure?: boolean; httpOnly?: boolean; sameSite?: string; expires?: number }[]; origins?: { origin: string; localStorage?: { name: string; value: string }[] }[] };
  try {
    const ctx = stagehand.browser.context;
    if (ss?.cookies?.length) await ctx.addCookies(ss.cookies as any);
    // storageState 的 origins[].localStorage 是 [{ name, value }] 数组（非映射），同 runnerService 的注入。
    const origins: { origin: string; localStorage: { name: string; value: string }[] }[] = (ss?.origins ?? []).filter(
      (o): o is { origin: string; localStorage: { name: string; value: string }[] } => Boolean(o?.origin && Array.isArray(o?.localStorage) && o.localStorage.length),
    );
    if (origins.length) {
      await ctx.addInitScript(
        (data: { origin: string; localStorage: { name: string; value: string }[] }[]) => {
          const origin = (data ?? []).find((o) => (globalThis as any).location.origin === o.origin);
          if (origin?.localStorage) {
            for (const { name, value } of origin.localStorage) localStorage.setItem(name, String(value));
          }
        },
        origins,
      );
    }
    return stagehand;
  } catch (e) {
    await closeSession(jobId);
    throw e;
  }
}

export function getSession(jobId: string): Stagehand | undefined {
  return sessions.get(jobId)?.stagehand;
}

/** 会话浏览器暴露的 CDP 端口（供 playwright connectOverCDP 附加做精确验证）。 */
export function getCdpPort(jobId: string): number | undefined {
  return sessions.get(jobId)?.cdpPort;
}

export async function closeSession(jobId: string): Promise<void> {
  const s = sessions.get(jobId);
  if (s) {
    // 主动关闭前先解除异常关闭回调并断开监听连接，避免 closeSession 触发 disconnected 后误报「浏览器已关闭」
    s.onClosed = undefined;
    if (s.monitor) {
      try {
        await s.monitor.close();
      } catch {
        /* 忽略 */
      }
      s.monitor = undefined;
    }
    try {
      await s.stagehand.close();
    } catch {
      /* 忽略 */
    }
    if (s.browser) {
      try {
        await s.browser.close();
      } catch {
        /* 忽略 */
      }
    }
    if (s.userDataDir) {
      try {
        rmSync(s.userDataDir, { recursive: true, force: true });
      } catch {
        /* 忽略：Chrome 可能仍占用部分文件 */
      }
    }
    sessions.delete(jobId);
  }
}

/** 获取会话的当前页面（v4 的 context 挂在 browser 上，page 查询为异步）。
 *  CDP 附加到已运行浏览器时 activePage() 可能为 undefined，回退到第一个页面。
 *  注意：预置的页面无法 setActivePage（Stagehand 只对自建页面维护 active 状态），
 *  act/observe 需显式传 { page }。 */
export async function sessionPage(stagehand: Stagehand): Promise<any> {
  try {
    const ctx = stagehand.browser.context;
    const active = await ctx.activePage();
    if (active) return active;
    const pages = await ctx.pages();
    return pages[0];
  } catch {
    return undefined;
  }
}
