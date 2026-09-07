/**
 * 定位器候选验证框架（Node 侧）。三条路径共用：
 * - 手动拾取 / 回放自愈：宿主是真实 playwright Page（有 getBy* / elementHandle）→ verifyCandidates 精确验证。
 * - 自动生成：宿主是 Stagehand v4 Page（无 getBy* / elementHandle）→ verifyCandidatesHybrid 页内验证。
 *
 * 统一入口 semanticizeLocator(page, raw, { mode })：把 act/observe 返回的原始选择器
 * 转换为「页内唯一 + 命中同一节点」的语义 Locator；无法满足时回退原始选择器（xpath/css）。
 */
import type { Locator } from '../shared/testScript';
import { analyzeElement, rawLocatorOf, type PickCandidate, type PickScope, type CssRecompute } from './locatorCandidateScript';

/** runner 与 picker 共用的一份语义查询解析（role/testid/label/.../css/xpath，支持 scope 根）。 */
export interface QueryLike {
  strategy: string;
  value: string;
  role?: string;
  name?: string;
}

export function resolveQuery(root: any, loc: QueryLike): any {
  switch (loc.strategy) {
    case 'role':
      return root.getByRole(loc.role as any, loc.name ? { name: loc.name } : undefined);
    case 'label':
      return root.getByLabel(loc.value);
    case 'text':
      return root.getByText(loc.value);
    case 'placeholder':
      return root.getByPlaceholder(loc.value);
    case 'testid':
      return root.getByTestId(loc.value);
    case 'alt':
      return root.getByAltText(loc.value);
    case 'title':
      return root.getByTitle(loc.value);
    case 'css':
      // 防御：历史/手写步骤可能把 xpath 存成 css（单斜杠 /html…），按 xpath 前缀解析
      return root.locator(/^\//.test(loc.value) ? `xpath=${loc.value}` : loc.value);
    case 'xpath':
      // Stagehand 解析出的 xpath 为单斜杠绝对路径（/html[1]/…），Playwright 仅对 // 或 xpath= 前缀识别为 XPath，
      // 故凡以 / 开头都显式加 xpath= 前缀，否则会被当 CSS 解析报错。
      return root.locator(/^\//.test(loc.value) ? `xpath=${loc.value}` : loc.value);
    default:
      return root.locator(loc.value);
  }
}

/**
 * 瞬态状态类（Node 侧）：生成期 CSS 兜底可能把交互瞬态类（open 展开/focused 聚焦/active/
 * expanded/checked 勾选/selected 选中/loading 加载中/status-* 校验态/element-plus 的 is-* 交互态）
 * 编入选择器，回放初始态必不命中或命中错误元素。
 * 与页内 locatorCandidateScript.ts 的 TRANSIENT_CLASS_RE 保持一致。
 */
const TRANSIENT_CLASS_RE = /(^|-)(focused|open|active|expanded|checked|selected|loading)$|(^|-)status-(success|error|warning|validating)$|^is-(focus|focused|active|open|expanded|checked|selected|error)/;

/** 从 CSS 选择器字符串中剔除瞬态状态类（`.foo` 类 token 级删除，其余部分原样保留）。 */
export function stripTransientStateCss(css: string): string {
  return css.replace(/\.((?:\\.|[-\w])+)/g, (m: string, cls: string) =>
    TRANSIENT_CLASS_RE.test(cls.replace(/\\/g, '')) ? '' : m,
  );
}

/** 候选 → Locator（role 补全 value/role/name，附 scope）。 */
export function buildLocatorFromCandidate(c: PickCandidate): Locator {
  const loc: Locator =
    c.strategy === 'role'
      ? { strategy: 'role', value: c.role ?? c.value, role: c.role, name: c.name }
      : { strategy: c.strategy as Locator['strategy'], value: c.value };
  if (c.scope) loc.scope = c.scope as NonNullable<Locator['scope']>;
  return loc;
}

export interface VerifyResult {
  locator?: Locator;
  /** 每个候选的检查摘要（strategy=value×匹配数），供失败时给出可诊断的提示。 */
  tried: string[];
}

export interface VerifyOpts {
  /** 目标已脱离文档且 URL 未变时，仅按唯一性采信（SPA 重渲染降级）。 */
  fallback?: boolean;
  /** 全失败且目标仍存活时，调页内 __ttPickCss 实时重算 CSS 兜底。 */
  enableRecompute?: boolean;
  tried?: string[];
}

/** semanticizeLocator 选项（noRawFallback 见重载注释）。 */
interface SemanticizeOpts {
  mode?: 'playwright' | 'stagehand';
  tried?: string[];
  noRawFallback?: boolean;
}

/**
 * playwright 完整验证：count===1 且命中元素与 target 是同一节点。
 * 自 picker 的 verifyLocators 抽取，行为一致（含实时重算 CSS 兜底）。
 */
export async function verifyCandidates(
  page: any,
  target: any,
  candidates: PickCandidate[],
  opts: VerifyOpts = {},
): Promise<VerifyResult> {
  const tried = opts.tried ?? [];
  const fallback = opts.fallback ?? false;
  const sameNode = (a: any, b: any): Promise<boolean> =>
    page
      .evaluate(([x, y]: any[]) => !!x && !!y && (x === y || x.isSameNode(y)), [a, b])
      .catch(() => false);

  for (const c of candidates) {
    let loc: any;
    try {
      const root: any = c.scope ? resolveQuery(page, c.scope) : page;
      loc = resolveQuery(root, c);
    } catch {
      tried.push(`${c.strategy}=${c.value}（构造失败）`);
      continue;
    }
    let count: number;
    try {
      count = await loc.count();
    } catch {
      tried.push(`${c.strategy}=${c.value}（查询失败）`);
      continue;
    }
    tried.push(`${c.strategy}=${c.value}×${count}`);
    if (count !== 1) continue;

    let ok = false;
    if (fallback) {
      // 目标已被重渲染替换：唯一性已满足、URL 未变，采信该候选
      ok = true;
    } else {
      const handle = await loc.first().elementHandle().catch(() => null);
      if (!handle) continue;
      try {
        ok = await sameNode(handle, target);
      } catch {
        ok = false;
      }
      // label 包裹的可勾选控件：候选命中内层 input，target 是包裹层 label（或其内部元素）——
      // 点击语义等价（label 原生转发到控件），放行；其余仍要求严格同节点。
      if (!ok && (c.role === 'checkbox' || c.role === 'radio')) {
        ok = await page
          .evaluate(([x, y]: any[]) => {
            if (!x || !y || y.nodeType !== 1) return false;
            const lbl = y.tagName === 'LABEL' ? y : y.closest && y.closest('label');
            return !!lbl && !!lbl.contains && lbl.contains(x);
          }, [handle, target])
          .catch(() => false);
      }
      await handle.dispose().catch(() => {});
    }
    if (!ok) continue;

    return { locator: buildLocatorFromCandidate(c), tried };
  }

  // 目标仍存活但全部候选未通过（点击与确认之间页面变化导致缓存候选失效），
  // 用当前页面状态对该元素实时重算 CSS 作为兜底（仍要求唯一且命中同一节点；弹层内按作用域相对路径）。
  if (!fallback && opts.enableRecompute) {
    try {
      const fresh = (await page.evaluate((el: any) => (globalThis as any).__ttPickCss?.(el) ?? null, target)) as
        | CssRecompute
        | null;
      if (fresh?.css) {
        const freshRoot: any = fresh.scope ? resolveQuery(page, fresh.scope) : page;
        const loc = freshRoot.locator(fresh.css);
        const count = await loc.count();
        tried.push(`css(实时重算)=${fresh.css}×${count}${fresh.scope ? `@${fresh.scope.strategy}=${fresh.scope.value}` : ''}`);
        if (count === 1) {
          const handle = await loc.first().elementHandle().catch(() => null);
          const same = handle ? await sameNode(handle, target) : false;
          if (handle) await handle.dispose().catch(() => {});
          if (same) {
            const locator: Locator = { strategy: 'css', value: fresh.css };
            if (fresh.scope) locator.scope = fresh.scope as NonNullable<Locator['scope']>;
            return { locator, tried };
          }
        }
      }
    } catch {
      /* 忽略：重算失败维持原错误 */
    }
  }

  return { tried };
}

/** stagehand 页内候选的 CSS 表达式（供 querySelector / 属性选择器用）。 */
function candidateSelectorExpr(c: PickCandidate): string | null {
  const escAttr = (v: string) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  switch (c.strategy) {
    case 'testid': return `[data-testid="${escAttr(c.value)}"]`;
    case 'placeholder': return `[placeholder="${escAttr(c.value)}"]`;
    case 'alt': return `[alt="${escAttr(c.value)}"]`;
    case 'title': return `[title="${escAttr(c.value)}"]`;
    case 'css': return c.value;
    default: return null; // xpath 单独处理
  }
}

/**
 * stagehand 混合验证（生成侧；页面无 getBy* / elementHandle）：
 * 在页内一次性完成——css/testid/placeholder/alt/title/xpath 候选做「唯一 + 同节点」交叉校验，
 * role/label/text 候选直接采信页内 analyzeCounts 的唯一性近似（getBy* 语义的近似）。
 * 返回首个通过的候选。
 */
export async function verifyCandidatesHybrid(
  page: any,
  raw: string,
  candidates: PickCandidate[],
  counts: number[],
  opts: { tried?: string[] } = {},
): Promise<VerifyResult> {
  const tried = opts.tried ?? [];
  // 页内回调在浏览器环境执行（无 DOM lib，全部以 any 访问全局）
  const res = await page
    .evaluate(
      (args: unknown) => {
        const win = globalThis as any;
        const doc = win.document;
        const XR = win.XPathResult;
        const [rawS, cands, cnts] = args as [string, PickCandidate[], number[]];
        const target = win.__ttResolve?.(rawS);
        if (!target || target.nodeType !== 1) return { idx: -1, tried: [] };
        const out: string[] = [];
        const same = (a: any, b: any) => !!a && !!b && (a === b || a.isSameNode(b));
        const scopeRootOf = (scope: PickScope | null | undefined): any => {
          if (!scope) return doc;
          if (scope.strategy === 'role') {
            try {
              const els = doc.querySelectorAll('[role="' + scope.value.replace(/"/g, '\\"') + '"]');
              return els.length === 1 ? els[0] : null;
            } catch {
              return null;
            }
          }
          if (scope.strategy === 'css') {
            try {
              return doc.querySelector(scope.value);
            } catch {
              return null;
            }
          }
          return null;
        };
        const label = (c: PickCandidate) =>
          c.strategy === 'role' ? `${c.role} name=${c.name}` : `${c.strategy}=${c.value}`;
        const queryNode = (c: PickCandidate): any => {
          const root = scopeRootOf(c.scope);
          if (c.scope && !root) return null;
          const q = (sel: string): any => {
            try {
              return root.querySelector(sel);
            } catch {
              return null;
            }
          };
          const escAttr = (v: string) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          switch (c.strategy) {
            case 'testid': return q(`[data-testid="${escAttr(c.value)}"]`);
            case 'placeholder': return q(`[placeholder="${escAttr(c.value)}"]`);
            case 'alt': return q(`[alt="${escAttr(c.value)}"]`);
            case 'title': return q(`[title="${escAttr(c.value)}"]`);
            case 'css': return q(c.value);
            case 'xpath': {
              try {
                return doc.evaluate(c.value, root || doc, null, XR.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
              } catch {
                return null;
              }
            }
            default: return null;
          }
        };
        const EXACT = ['css', 'testid', 'placeholder', 'alt', 'title', 'xpath'];
        for (let i = 0; i < cands.length; i++) {
          const c = cands[i];
          const cnt = cnts[i];
          if (cnt === 1) {
            if (EXACT.includes(c.strategy)) {
              const node = queryNode(c);
              if (node && same(node, target)) {
                out.push(label(c) + '×1');
                return { idx: i, tried: out };
              }
              out.push(label(c) + '×1(同节点不符)');
            } else {
              // role/label/text：页内近似采信
              out.push(label(c) + '×1(页内近似)');
              return { idx: i, tried: out };
            }
          } else {
            out.push(label(c) + '×' + cnt);
          }
        }
        return { idx: -1, tried: out };
      },
      [raw, candidates, counts],
    )
    .catch(() => null);

  const r = res as { idx: number; tried: string[] } | null;
  if (r?.tried) tried.push(...r.tried);
  if (r && r.idx >= 0 && candidates[r.idx]) {
    return { locator: buildLocatorFromCandidate(candidates[r.idx]), tried };
  }
  return { tried };
}

/**
 * 统一语义化入口：raw（act/observe 等产物）→ 唯一校验过的语义 Locator。
 * - mode='playwright'（回放自愈）：精确验证（count===1 + 同节点 + 实时重算 CSS 兜底）。
 * - mode='stagehand'（自动生成）：页内混合验证。
 * 无法语义化（元素已移除 / 无唯一候选）时回退原始选择器；noRawFallback 时返回 undefined
 * （动作前预采集用：调用方据此决定是否在动作后补采，避免把预采集失败误当成有效定位）。
 */
export async function semanticizeLocator(page: any, raw: string, opts: SemanticizeOpts & { noRawFallback: true }): Promise<Locator | undefined>;
export async function semanticizeLocator(page: any, raw: string, opts?: SemanticizeOpts): Promise<Locator>;
export async function semanticizeLocator(
  page: any,
  raw: string,
  opts: SemanticizeOpts = {},
): Promise<Locator | undefined> {
  const mode = opts.mode ?? 'stagehand';
  try {
    const analyzed = await analyzeElement(page, raw);
    if (analyzed && analyzed.candidates.length) {
      if (mode === 'playwright') {
        const target = await page
          .evaluateHandle((sel: string) => (globalThis as any).__ttResolve?.(sel), raw)
          .catch(() => null);
        if (target) {
          try {
            const r = await verifyCandidates(page, target, analyzed.candidates, {
              enableRecompute: true,
              tried: opts.tried,
            });
            if (r.locator) return r.locator;
          } finally {
            await target.dispose().catch(() => {});
          }
        }
      } else {
        const r = await verifyCandidatesHybrid(page, raw, analyzed.candidates, analyzed.counts, { tried: opts.tried });
        if (r.locator) return r.locator;
      }
    }
  } catch {
    /* 任何异常都回退原始选择器 */
  }
  return opts.noRawFallback ? undefined : rawLocatorOf(raw);
}
