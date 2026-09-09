/** 生成任务的文本出口：已知环境变量值还原为占位符。图片内容不在文本脱敏范围内。 */
const environments = new Map<string, Record<string, string>>();

export function setGenerationEnvironment(jobId: string, env: Record<string, string>): void {
  environments.set(jobId, { ...env });
}

export function clearGenerationEnvironment(jobId: string): void {
  environments.delete(jobId);
}

export function redactGenerationText(jobId: string, text: string): string {
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(environments.get(jobId) ?? {})) {
    if (value && !values.has(value)) values.set(value, `{{${key}}}`);
  }
  if (!values.size) return text;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 一次替换、最长值优先；已有占位符原样保留，避免替换产生的文本被再次匹配。
  const pattern = new RegExp(`\\{\\{[^{}]+\\}\\}|${[...values.keys()].sort((a, b) => b.length - a.length).map(escape).join('|')}`, 'g');
  return text.replace(pattern, (match) => match.startsWith('{{') ? match : values.get(match)!);
}

/** 保留协议字段/标识符，只处理载荷里的文本；不修改二进制图片、工具调用 ID 等。 */
const structuralKeys = new Set(['role', 'type', 'kind', 'action', 'strategy', 'status', 'jobId', 'tool_call_id', 'id', 'model', 'pluginId', 'pluginAction', '__ttSlotKind', '__ttStateKind', 'observationKind', 'stateFingerprint', 'snapshotVersion', 'criterionId', 'signature', 'scenario', 'policy', 'verifiedAt']);
export function redactGenerationData<T>(jobId: string, data: T): T {
  const visit = (value: any, key = '', parent = ''): any => {
    if (typeof value === 'string') {
      if (structuralKeys.has(key) || (parent === 'function' && key === 'name') || key === 'image' || value.startsWith('data:image/')) return value;
      if (key === 'arguments') {
        try { return JSON.stringify(visit(JSON.parse(value))); } catch { /* 普通文本按原方式脱敏 */ }
      }
      return redactGenerationText(jobId, value);
    }
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v, k, key)]));
    return value;
  };
  return visit(data);
}
