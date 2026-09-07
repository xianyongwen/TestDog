import type { TestStep } from '../shared/testScript';

/** 探测超时（固定常量，不做成配置）：整个 GET（含重定向跳转）超过此时长即视为不可达。 */
const PROBE_TIMEOUT_MS = 10_000;

/** 取脚本里第一个 goto 步骤的 URL 作为探测目标（steps 须已完成 {{var}} 环境变量替换）；无则 undefined。 */
export function resolveProbeTarget(steps: TestStep[]): string | undefined {
  return steps.find((s) => s.action === 'goto' && s.url)?.url;
}

/** 是否需要探测：仅 http(s)、可被 URL 解析、且不含未解析占位符（{{var}} / 旧写法 ${var}，留给运行期按原逻辑报错）。 */
function probeable(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (url.includes('{{') || url.includes('${')) return false;
  try {
    new URL(url);
  } catch {
    return false;
  }
  return true;
}

/** 把 fetch 失败原因归类为面向用户的中文提示（Node fetch 的底层错误在 e.cause 里，code/name 取自 cause，外层只是笼统的 "fetch failed"）。 */
function classifyProbeError(e: unknown): string {
  const cause = (e as any)?.cause ?? e;
  const code: string = cause?.code ?? (e as any)?.code ?? '';
  // 外层错误 name 恒为 'Error'，超时的 TimeoutError/AbortError 标记在 cause 上——跳过泛化名取真实标记
  const name: string = [(e as any)?.name, (cause as any)?.name].find((n) => n && n !== 'Error') ?? '';
  if (name === 'TimeoutError' || name === 'AbortError' || code === 'ABORT_ERR' || /timeout|timed?\s*out/i.test(String(cause?.message ?? ''))) {
    return `连接超时（${PROBE_TIMEOUT_MS / 1000} 秒无响应）`;
  }
  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return '域名解析失败（请检查域名拼写或 DNS 配置）';
    case 'ECONNREFUSED':
      return '连接被拒绝（目标服务可能未启动）';
    case 'ECONNRESET':
      return '连接被重置';
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return '网络不可达（请检查网络或代理配置）';
    default:
      if (/CERT|SSL|TLS/i.test(code)) return `证书校验失败（${code}）`;
      return String(cause?.message || code || e);
  }
}

/**
 * 运行前连通性探测：对脚本首个 goto 的 URL 发一次 Node 侧 GET（不经浏览器，避免不可达时
 * 白等浏览器启动 + 30s 导航超时）。任何 HTTP 响应（2xx/3xx/4xx/5xx）都算可达——探测只关心
 * 「网络通不通」，不关心业务状态码；请求本身失败（拒绝连接/DNS 失败/超时/证书错误等）才抛错。
 * 无需探测时静默返回 undefined（非 http(s)、URL 不可解析、含未解析占位符）；
 * 成功返回最终（跟随重定向后）HTTP 状态码，供运行日志记录。
 */
export async function probeConnectivity(url: string): Promise<number | undefined> {
  if (!probeable(url)) return undefined;
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`连通性探测失败：无法访问 ${url}（${classifyProbeError(e)}）`);
  }
  // 只取状态码：不消费 body（直接取消流），避免大响应拖慢探测
  try {
    await res.body?.cancel();
  } catch {
    /* 忽略 */
  }
  return res.status;
}
