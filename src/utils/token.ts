export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
}

/** 千分位格式化，如 1234567 -> "1,234,567"。undefined / null 视为 0。 */
export const fmtToken = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');
