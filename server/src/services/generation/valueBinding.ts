import { collectSystemKeys, KNOWN_SYSTEM_NAMES, legacyToUnifiedSystemVars, systemKey, VAR_PATTERN, LEGACY_SYSTEM_VAR_PATTERN } from '../../shared/envVars';
import type { TestIntent } from '../../shared/testIntent';
import type { TestStep } from '../../shared/testScript';
import type { Substituter } from './substitution';

/**
 * 生成会话的值绑定：把「实际写入页面的值」登记为占位符的实例化，fill 与断言在宿主内汇合同值，
 * 不再依赖模型自觉传占位符（cmtwr6hlf 案例：模型 fill 编了 test829401，断言占位符才首次求值成
 * test442434，两侧永不相遇）。也覆盖改值重试：重填即重绑，断言与护栏自动看到新值。
 *
 * 三个入口：
 * - onWrite（fill/select/组件动作成功后）：resolved 实例值命中 generated 模板 → 反绑键值并返回
 *   模板作为落库规范值（脚本存模式不存实例，回放时重新求值保持唯一）。
 * - tryBind（断言执行前）：expected/locator 引用的键尚未在缓存中时，从写入历史按模式反查绑定。
 * - regenerate（fill args.regenerate）：对占位符键重新求值并覆盖缓存——缓存保证「同轮同值」，
 *   再生成提供「换值」出口，两者正交。
 */

/** 模板来源：意图 data 中 policy=generated 的值 + 验收标准 expected。fixed 数据绝不参与匹配。 */
function collectTemplates(intent: TestIntent | undefined): string[] {
  if (!intent) return [];
  const out: string[] = [];
  for (const d of intent.data ?? []) if (d.policy === 'generated' && d.value) out.push(d.value);
  for (const c of intent.criteria ?? []) if (c.assertion?.expected) out.push(c.assertion.expected);
  return [...new Set(out.map((t) => legacyToUnifiedSystemVars(t)!))];
}

/** 键 → 实例值的字符类（从模板构造正则时用作捕获组）。 */
function valueClass(key: string): string {
  const [name, param] = key.split(':');
  const n = param ? Number(param) : undefined;
  switch (name) {
    case 'randomNumber': return `\\d{${n && n > 0 ? n : 6}}`;
    case 'randomPhone': return '1[3-9]\\d{9}';
    case 'randomEmail': return '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}';
    case 'randomChinese': return `[\\u4e00-\\u9fff]{${n && n > 0 ? n : 2}}`;
    case 'randomIdCard': return '\\d{17}[\\dXx]';
    case 'systemTime': return '\\d{13}';
    default: return '.+?';
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface TemplateMatcher {
  template: string;
  /** 锚定全串正则（^...$），占位符位置是捕获组。 */
  source: string;
  /** 捕获组顺序对应的归一化键。 */
  keys: string[];
}

function buildMatcher(template: string): TemplateMatcher | null {
  if (!collectSystemKeys([template]).length) return null;
  const matches: Array<{ start: number; end: number; key: string }> = [];
  for (const pattern of [VAR_PATTERN, LEGACY_SYSTEM_VAR_PATTERN]) {
    for (const m of template.matchAll(pattern)) {
      if (!KNOWN_SYSTEM_NAMES.has(m[1])) continue;
      matches.push({ start: m.index!, end: m.index! + m[0].length, key: systemKey(m[1], m[2]) });
    }
  }
  if (!matches.length) return null;
  matches.sort((a, b) => a.start - b.start);
  let source = '';
  const keys: string[] = [];
  let pos = 0;
  for (const m of matches) {
    source += escapeRegExp(template.slice(pos, m.start)) + `(${valueClass(m.key)})`;
    keys.push(m.key);
    pos = m.end;
  }
  source += escapeRegExp(template.slice(pos));
  return { template, source: `^(?:${source})$`, keys };
}

/** 模板匹配实例值：命中返回 键→捕获值；同键多处捕获不一致视为误配，不绑定。 */
function matchTemplate(m: TemplateMatcher, value: string): Record<string, string> | null {
  const hit = new RegExp(m.source).exec(value);
  if (!hit) return null;
  const binding: Record<string, string> = {};
  m.keys.forEach((key, i) => {
    const v = hit[i + 1];
    if (v == null) return;
    if (binding[key] != null && binding[key] !== v) return;
    binding[key] = v;
  });
  return Object.keys(binding).length ? binding : null;
}

/** 值写入记录（最新在后；重绑语义=同键取最新成功写入）。 */
interface ValueWriteRecord {
  instruction: string;
  /** 落库规范值（模板或原字面值）。 */
  raw: string;
  /** 实际写入页面的实例值。 */
  resolved: string;
}

/** 工具宿主使用的门面（生成循环注入 ctx；独立跑工具时可缺省）。 */
export interface ValueBindingFacade {
  onWrite(instruction: string, raw: string | undefined, resolved: string | undefined): string | undefined;
  canonicalizeText(text: string): string;
  tryBind(...texts: Array<string | null | undefined>): void;
  regenerate(text: string | undefined): void;
}

/** no-op 门面（无解析器的测试桩环境：登记/绑定全部退化为原样返回）。 */
const noopBinding: ValueBindingFacade = {
  onWrite: (_instruction, raw) => raw,
  canonicalizeText: (text) => text,
  tryBind: () => {},
  regenerate: () => {},
};

export function createValueBinder(substitution: Substituter | undefined, intent: TestIntent | undefined, seedSteps: TestStep[]): ValueBindingFacade {
  if (!substitution) return noopBinding;
  const matchers = collectTemplates(intent).map(buildMatcher).filter((m): m is TemplateMatcher => m != null);
  const history: ValueWriteRecord[] = [];
  /** 实例值 → 模板（仅登记本会话真实写入过的实例；revise/落库规范化只做精确替换，不做模式猜测）。 */
  const instanceToTemplate = new Map<string, string>();

  /** 字面实例值匹配模板：命中则反绑键值并登记实例→模板映射。 */
  const matchAndBind = (resolved: string): string | undefined => {
    if (!resolved || collectSystemKeys([resolved]).length) return undefined; // 本身含占位符，不是实例
    for (const m of matchers) {
      const binding = matchTemplate(m, resolved);
      if (!binding) continue;
      for (const [key, value] of Object.entries(binding)) substitution.bind(key, value);
      instanceToTemplate.set(resolved, m.template);
      return m.template;
    }
    return undefined;
  };

  // 种子：续跑时从已落库步骤重建历史（记录为字面值的步骤可能对应页面上仍在的值）。
  // 模板形态的步骤不需要历史——键值已随 SubstitutionState 持久化。
  for (const s of seedSteps) {
    if (s.kind !== 'action' || typeof s.value !== 'string' || !s.value.trim()) continue;
    if (collectSystemKeys([s.value]).length) continue;
    const template = matchAndBind(s.value);
    if (template) instanceToTemplate.set(s.value, template);
  }

  return {
    /** fill/select/组件动作成功后登记：返回落库规范值（实例命中模板 → 模板；否则原样）。
     *  模型直填占位符时同样登记 实例→模板（映射统一为 {{}} 形态，供 revise 规范化精确替换）。 */
    onWrite(instruction, raw, resolved) {
      if (resolved == null || !resolved) return raw;
      let canonical = raw;
      if (raw != null && collectSystemKeys([raw]).length) {
        instanceToTemplate.set(resolved, legacyToUnifiedSystemVars(raw)!);
      } else {
        const template = matchAndBind(resolved);
        if (template) canonical = template;
      }
      history.push({ instruction, raw: canonical ?? '', resolved });
      return canonical;
    },

    /** 保守规范化：仅精确替换已登记的实例 → 模板（修订 update / 指令文本用），不猜模式。 */
    canonicalizeText(text: string): string {
      if (!text || !instanceToTemplate.size) return text;
      let out = text;
      const entries = [...instanceToTemplate.entries()].sort((a, b) => b[0].length - a[0].length);
      for (const [instance, template] of entries) {
        if (out.includes(instance)) out = out.split(instance).join(template);
      }
      return out;
    },

    /** 断言前反向绑定：文本引用的键未在缓存中时，从写入历史按模板反查（最新优先=重绑后生效值）。 */
    tryBind(...texts: Array<string | null | undefined>) {
      const missing = collectSystemKeys(texts).filter((key) => !substitution.has(key));
      if (!missing.length) return;
      for (const key of missing) {
        const candidates = matchers.filter((m) => m.keys.includes(key));
        if (!candidates.length) continue;
        for (let i = history.length - 1; i >= 0; i--) {
          const rec = history[i];
          let bound = false;
          for (const m of candidates) {
            const binding = matchTemplate(m, rec.resolved);
            if (binding && binding[key] != null) {
              substitution.bind(key, binding[key]);
              instanceToTemplate.set(rec.resolved, m.template);
              bound = true;
              break;
            }
          }
          if (bound) break;
        }
      }
    },

    /** regenerate（fill args.regenerate）：对文本引用的系统变量键重新求值并覆盖缓存。
     *  写后 sub 即取新值；同轮后续 fill/断言引用同键自动拿到新值（重绑传播由 onWrite/缓存完成）。 */
    regenerate(text) {
      const keys = collectSystemKeys(text ? [text] : []);
      if (keys.length) substitution.regenerateKeys(keys);
    },
  };
}
