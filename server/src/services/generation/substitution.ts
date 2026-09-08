import { collectSystemKeys, resolveSystemKeys, substituteAll } from '../../shared/envVars';

export interface SubstitutionState {
  startedAt: number;
  resolvedSystemVars: Record<string, string>;
}

/** 同一会话跨暂停复用惰性求值缓存，落库参数仍使用占位符。 */
export function createSubstituter(envMap: Record<string, string>, now: number, saved?: SubstitutionState) {
  const state: SubstitutionState = {
    startedAt: saved?.startedAt ?? now,
    resolvedSystemVars: { ...saved?.resolvedSystemVars },
  };
  const sub = (text: string | undefined | null): string | undefined => {
    const missing = collectSystemKeys(text ? [text] : []).filter((key) => !Object.hasOwn(state.resolvedSystemVars, key));
    if (missing.length) Object.assign(state.resolvedSystemVars, resolveSystemKeys(missing, state.startedAt));
    return substituteAll(text, envMap, state.resolvedSystemVars);
  };
  return { sub, state };
}
