import { collectSystemKeys, resolveSystemKeys, substituteAll } from '../../shared/envVars';

export interface SubstitutionState {
  startedAt: number;
  resolvedSystemVars: Record<string, string>;
}

/** 生成会话的占位符解析器：惰性求值缓存（同一会话跨暂停复用，落库参数仍使用占位符）
 *  + 值绑定出口（valueBinding 反向绑定/再生成写回同一缓存，fill 与断言在此汇合同值）。 */
export interface Substituter {
  sub: (text: string | undefined | null) => string | undefined;
  state: SubstitutionState;
  /** 键是否已求值（含被反向绑定）。 */
  has(key: string): boolean;
  /** 写入绑定值（valueBinding 把实际写入值登记为占位符的实例化）。 */
  bind(key: string, value: string): void;
  /** 对一组键重新求值并覆盖缓存（regenerate 换值重试；写后 sub 即取新值）。 */
  regenerateKeys(keys: string[]): void;
}

export function createSubstituter(envMap: Record<string, string>, now: number, saved?: SubstitutionState): Substituter {
  const state: SubstitutionState = {
    startedAt: saved?.startedAt ?? now,
    resolvedSystemVars: { ...saved?.resolvedSystemVars },
  };
  const sub = (text: string | undefined | null): string | undefined => {
    const missing = collectSystemKeys(text ? [text] : []).filter((key) => !Object.hasOwn(state.resolvedSystemVars, key));
    if (missing.length) Object.assign(state.resolvedSystemVars, resolveSystemKeys(missing, state.startedAt));
    return substituteAll(text, envMap, state.resolvedSystemVars);
  };
  return {
    sub,
    state,
    has: (key) => Object.hasOwn(state.resolvedSystemVars, key),
    bind: (key, value) => { state.resolvedSystemVars[key] = value; },
    regenerateKeys: (keys) => { if (keys.length) Object.assign(state.resolvedSystemVars, resolveSystemKeys(keys, Date.now())); },
  };
}
