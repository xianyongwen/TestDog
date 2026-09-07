/** 按 jobId 累计一次生成中所有 LLM 调用的 token 用量（拆步 + Stagehand act/observe）。 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number; // 命中缓存的输入 token（cacheRead）
}

const EMPTY: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 };
const store = new Map<string, TokenUsage>();

export function initUsage(jobId: string): void {
  store.set(jobId, { ...EMPTY });
}

/** 仅当该 job 尚无累计记录时初始化；用于「暂停后继续」等复用同一 jobId 的场景，保留已有累计。 */
export function ensureUsage(jobId: string): void {
  if (!store.has(jobId)) store.set(jobId, { ...EMPTY });
}

export function addUsage(jobId: string, u: Partial<TokenUsage>): void {
  const cur = store.get(jobId);
  if (!cur) return;
  cur.inputTokens += u.inputTokens ?? 0;
  cur.outputTokens += u.outputTokens ?? 0;
  cur.totalTokens += u.totalTokens ?? 0;
  cur.cachedTokens += u.cachedTokens ?? 0;
}

export function getUsage(jobId: string): TokenUsage {
  return store.get(jobId) ?? { ...EMPTY };
}

export function clearUsage(jobId: string): void {
  store.delete(jobId);
}
