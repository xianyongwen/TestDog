import { createHash } from 'node:crypto';
import { injectCandidates } from './locatorCandidateScript';

export interface BrowserObservation {
  version: string;
  documentId: string;
  url: string;
  lines: string[];
  total: number;
  allCount: number;
  offset: number;
  nextOffset: number | null;
  scope: string;
  values: Record<string, string>;
  structure: string;
  pageText: string;
  alerts: string[];
  context: string;
  /** 带 query 且交互元素 0 命中时的文本兜底：关键词是否存在于 body.innerText 及其上下文片段 */
  queryTextHit?: boolean | null;
  queryTextSnippet?: string;
}

export async function captureObservation(page: any, options: Record<string, unknown> = {}): Promise<BrowserObservation> {
  await injectCandidates(page);
  const state = await page.evaluate((opts: any) => (globalThis as any).__ttSnapshot(opts), options);
  if (!state?.version || !Array.isArray(state.lines)) throw new Error('快照采集失败，请等待页面加载后重试');
  return state;
}

export function observationText(s: BrowserObservation): string {
  return `【当前快照 snapshotVersion=${s.version} scope=${s.scope} URL=${s.url}】\n` +
    (s.context ? `区域：${s.context}\n` : '') + s.lines.join('\n') +
    (s.alerts.length ? `\n校验提示：${s.alerts.join('；')}` : '') +
    `\n显示 ${s.offset + 1}~${s.offset + s.lines.length} / ${s.total} 项（全页 ${s.allCount} 项）` +
    (s.nextOffset != null ? `；继续 snapshot(offset=${s.nextOffset}, scope=${s.scope === 'active-overlay' ? 'auto' : s.scope})` : '') +
    (s.total === 0 && s.queryTextHit === true
      ? `\n文本兜底：交互元素未命中查询关键词，但页面文本中存在：「${s.queryTextSnippet}」。内容已渲染但不在可交互元素内，可用文本/容器定位断言，不要判定记录缺失。`
      : '') +
    (s.total === 0 && s.queryTextHit === false
      ? '\n页面文本中也未找到查询关键词，目标内容当前确实不存在于页面上。'
      : '') +
    '\n编号用于 selector；未找到目标可用 snapshot(scope="page",query="关键词") 扩大范围。';
}

export function stateFingerprint(s: BrowserObservation): string {
  return createHash('sha256').update(JSON.stringify([s.documentId, s.url, s.structure, s.values, s.pageText, s.alerts])).digest('hex');
}

/** 批处理只容忍当前目标值变化，结构、其他字段或校验变化都需要重新规划。 */
export function batchBoundary(before: BrowserObservation, after: BrowserObservation, targetId?: string): boolean {
  return before.documentId !== after.documentId || before.url !== after.url || before.structure !== after.structure ||
    JSON.stringify(before.alerts) !== JSON.stringify(after.alerts) ||
    Object.keys(before.values).some(id => id !== targetId && before.values[id] !== after.values[id]);
}
