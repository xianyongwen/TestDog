/**
 * 语义动作工具构建：
 * - parseActionMeta：从 Plugin.actions JSON 解析动作元数据（动作词表 / 管理页共用）；
 * - componentActionParameters：统一 component_action 工具参数 schema（action 限词表枚举）；
 * - buildPluginActionStep：构造语义动作步骤（action='plugin'，pluginId 为生成期命中提示，
 *   回放按语义动作链重匹配）。
 * 执行外壳（三级降级分发器）在 generationToolHost；Node 侧只有通用转发，不含任何插件代码（安全边界）。
 */
import type { TestStep } from '../shared/testScript';

export interface PluginActionMeta {
  name: string;
  doc?: string;
  /** 界面展示名（插件声明，如「选择收货地址」）；缺省回退平台标签表/动作名。 */
  label?: string;
  preferFill?: boolean;
}

/** LLM 工具清单/词表条目（由 pluginStore.enabledActionVocabulary 按语义动作名去重产出）。 */

/** 从 Plugin.actions JSON 解析动作元数据（用户插件在试运行后回写；内置插件随定义维护）。 */
export function parseActionMeta(raw: unknown): PluginActionMeta[] {
  if (!Array.isArray(raw)) return [];
  const out: PluginActionMeta[] = [];
  for (const it of raw) {
    if (it && typeof (it as any).name === 'string') {
      out.push({
        name: (it as any).name,
        doc: typeof (it as any).doc === 'string' ? (it as any).doc : undefined,
        label: typeof (it as any).label === 'string' ? (it as any).label : undefined,
        preferFill: Boolean((it as any).preferFill),
      });
    }
  }
  return out;
}

// ---- 插件源码 actions 声明的静态词法扫描（纯函数，无 DB 依赖；上传/重传 label 一致性检测用）----

/** 跳过字符串/模板字符串/注释，返回 openIdx 处 '{' 配平的 '}' 下标；配平失败返回 -1。 */
function matchBraceSkipLiterals(s: string, openIdx: number): number {
  let depth = 0;
  let inStr: string | null = null;
  let i = openIdx;
  while (i < s.length) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      inStr = c;
      i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '/') {
      const nl = s.indexOf('\n', i);
      i = nl < 0 ? s.length : nl + 1;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? s.length : end + 2;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** 在对象体内按顶层扫描 `key: {` 块（跳过字符串/注释，配平后整块消费，避免误读 fn 内部嵌套）。 */
function scanTopLevelBracedKeys(body: string): { name: string; defBody: string }[] {
  const out: { name: string; defBody: string }[] = [];
  let i = 0;
  let depth = 0;
  let inStr: string | null = null;
  let identStart = -1;
  while (i < body.length) {
    const c = body[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      inStr = c;
      i++;
      continue;
    }
    if (c === '/' && body[i + 1] === '/') {
      const nl = body.indexOf('\n', i);
      i = nl < 0 ? body.length : nl + 1;
      continue;
    }
    if (c === '/' && body[i + 1] === '*') {
      const end = body.indexOf('*/', i + 2);
      i = end < 0 ? body.length : end + 2;
      continue;
    }
    if (c === '{') {
      depth++;
      identStart = -1;
      i++;
      continue;
    }
    if (c === '}') {
      depth--;
      identStart = -1;
      i++;
      continue;
    }
    if (depth === 0) {
      if (identStart < 0 && /[A-Za-z_$]/.test(c)) {
        identStart = i;
        i++;
        continue;
      }
      if (identStart >= 0 && /[\w$]/.test(c)) {
        i++;
        continue;
      }
      if (identStart >= 0 && c === ':') {
        const name = body.slice(identStart, i).trim();
        let j = i + 1;
        while (j < body.length && /\s/.test(body[j])) j++;
        if (body[j] === '{') {
          const end = matchBraceSkipLiterals(body, j);
          if (end > 0) {
            out.push({ name, defBody: body.slice(j + 1, end) });
            i = end + 1;
            identStart = -1;
            continue;
          }
        }
      }
      if (!/[\w$]/.test(c)) identStart = -1;
    }
    i++;
  }
  return out;
}

/** 读取 openIdx 处引号开头的字符串字面量值（处理常见转义）；非字符串返回 undefined。 */
function readStringLiteral(s: string, openIdx: number): string | undefined {
  const q = s[openIdx];
  if (q !== '\'' && q !== '"' && q !== '`') return undefined;
  let val = '';
  let i = openIdx + 1;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      val += n === 'n' ? '\n' : n === 't' ? '\t' : (n ?? '');
      i += 2;
      continue;
    }
    if (c === q) return val.trim() || undefined;
    val += c;
    i++;
  }
  return undefined;
}

/** 对象体内顶层 key 对应的字符串值（跳过字符串/注释，仅匹配 depth 0 的 `key: '…'`，fn 体嵌套不误读）。 */
function topLevelStringValue(body: string, key: string): string | undefined {
  let i = 0;
  let depth = 0;
  let inStr: string | null = null;
  let identStart = -1;
  while (i < body.length) {
    const c = body[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      inStr = c;
      i++;
      continue;
    }
    if (c === '/' && body[i + 1] === '/') {
      const nl = body.indexOf('\n', i);
      i = nl < 0 ? body.length : nl + 1;
      continue;
    }
    if (c === '/' && body[i + 1] === '*') {
      const end = body.indexOf('*/', i + 2);
      i = end < 0 ? body.length : end + 2;
      continue;
    }
    if (c === '{') {
      depth++;
      identStart = -1;
      i++;
      continue;
    }
    if (c === '}') {
      depth--;
      identStart = -1;
      i++;
      continue;
    }
    if (depth === 0) {
      if (identStart < 0 && /[A-Za-z_$]/.test(c)) {
        identStart = i;
        i++;
        continue;
      }
      if (identStart >= 0 && /[\w$]/.test(c)) {
        i++;
        continue;
      }
      if (identStart >= 0 && c === ':' && body.slice(identStart, i).trim() === key) {
        let j = i + 1;
        while (j < body.length && /\s/.test(body[j])) j++;
        const val = readStringLiteral(body, j);
        if (val !== undefined) return val;
      }
      if (!/[\w$]/.test(c)) identStart = -1;
    }
    i++;
  }
  return undefined;
}

/** 全码扫描（跳过字符串/注释）定位 `actions: {` 块，返回各块内部源码。 */
function findActionsBlocks(code: string): string[] {
  const blocks: string[] = [];
  let i = 0;
  let inStr: string | null = null;
  let identStart = -1;
  while (i < code.length) {
    const c = code[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      inStr = c;
      i++;
      continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i);
      i = nl < 0 ? code.length : nl + 1;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end < 0 ? code.length : end + 2;
      continue;
    }
    if (/[A-Za-z_$]/.test(c) && identStart < 0) {
      identStart = i;
      i++;
      continue;
    }
    if (identStart >= 0 && /[\w$]/.test(c)) {
      i++;
      continue;
    }
    if (identStart >= 0 && c === ':' && code.slice(identStart, i) === 'actions') {
      let j = i + 1;
      while (j < code.length && /\s/.test(code[j])) j++;
      if (code[j] === '{') {
        const end = matchBraceSkipLiterals(code, j);
        if (end > 0) {
          blocks.push(code.slice(j + 1, end));
          i = end + 1;
          identStart = -1;
          continue;
        }
      }
    }
    if (!/[\w$]/.test(c)) identStart = -1;
    i++;
  }
  return blocks;
}

/**
 * 静态提取插件源码 actions 声明中的动作名与展示名（label）：跳过字符串/注释定位 `actions: {`，
 * 取顶层 `key: {` 动作块解析顶层 label（fn 体嵌套不误读）。尽力而为（变量引用/计算键等
 * 动态形态不识别），解析不出时返回空数组，调用方按「未声明」跳过检测。
 */
export function extractDeclaredActionLabels(code: string): { name: string; label?: string }[] {
  const out: { name: string; label?: string }[] = [];
  const seen = new Set<string>();
  try {
    for (const block of findActionsBlocks(code)) {
      for (const b of scanTopLevelBracedKeys(block)) {
        if (seen.has(b.name)) continue;
        seen.add(b.name);
        const label = topLevelStringValue(b.defBody, 'label');
        out.push({ name: b.name, ...(label ? { label } : {}) });
      }
    }
  } catch {
    /* 尽力而为：扫描异常按未声明处理 */
  }
  return out;
}

/** 统一语义动作工具（component_action）参数 schema：action 限词表枚举 + selector + value + args + instruction。 */
export function componentActionParameters(validActions: string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      action: { type: 'string', enum: validActions, description: '语义动作名（限工具说明中的可用动作词表）' },
      selector: { type: 'string', description: '目标控件：snapshot 里的元素编号，或 css/xpath 定位表达式' },
      value: { type: 'string', description: '主要参数（如选项文本、日期 YYYY-MM-DD）' },
      args: { type: 'object', description: '附加参数（动作自定义）；select 必须传 value 或 args.index（二选一）',
        properties: { index: { type: 'integer', minimum: 0, description: 'select：按当前可见且未禁用选项的顺序选择，0=第一项、1=第二项；仅支持 Ant Design、Element 普通下拉和原生 select；无需先展开，不能同时传 value' } },
        additionalProperties: true },
      instruction: { type: 'string', description: '本步的自然语言描述（必填，用于落库与回放自愈）' },
    },
    required: ['action', 'selector', 'instruction'],
  };
}

/** 构造 emit 用的语义动作步骤（action='plugin'，回放期按语义动作链重匹配；pluginId 为命中提示；
 *  label 为插件声明的展示名，随步骤落库供状态标签等展示点直接取用）。 */
export function buildPluginActionStep(
  action: string,
  locator: NonNullable<TestStep['locator']>,
  instruction: string,
  opts?: { pluginId?: string; value?: string; args?: Record<string, unknown>; label?: string },
): TestStep {
  return {
    kind: 'action',
    action: 'plugin',
    pluginAction: {
      ...(opts?.pluginId ? { pluginId: opts.pluginId } : {}),
      action,
      ...(opts?.label ? { label: opts.label } : {}),
      args: { ...(opts?.args ?? {}), ...(opts?.value != null ? { value: opts.value } : {}) },
    },
    locator,
    ...(opts?.value != null ? { value: opts.value } : {}),
    instruction,
    description: instruction,
  };
}
