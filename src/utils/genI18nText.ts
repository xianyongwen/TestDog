import type { TFunction } from 'i18next';

/** 服务端固定文案的 i18n 载荷（WS 事件的 i18n 字段 / 生成记录 args.i18n），与 server/src/ws/hub.ts 的 GenMsgI18n 对应。 */
export interface GenMsgI18n {
  key: string;
  params?: Record<string, string | number>;
}

/** 服务端固定文案展示：优先按 i18n key 取词条，缺词条或旧事件回退原始文案。
 *  与 genToolLabel 同套路：服务端只发 key+参数，展示语言由前端 i18n 决定。 */
export function genI18nText(t: TFunction, i18n: GenMsgI18n | null | undefined, fallback: string): string {
  if (!i18n?.key) return fallback;
  return t(i18n.key, { ...(i18n.params ?? {}), defaultValue: fallback });
}

/** 从生成记录 step 的 args 里取 i18n 载荷（logBridge 落库时写入），无则 null。 */
export function stepArgsI18n(args: unknown): GenMsgI18n | null {
  const v = (args as any)?.i18n;
  return v && typeof v === 'object' && typeof v.key === 'string' ? (v as GenMsgI18n) : null;
}
