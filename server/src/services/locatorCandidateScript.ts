/**
 * 页内「定位器候选生成」共享脚本：手动拾取、自动生成（stabilizeSelector）、自愈语义化三处共用同一份候选逻辑。
 *
 * 候选优先级（与文档一致）：testid > role > label > placeholder > text > alt > title > css > xpath。
 * 弹层内元素自动附 scope（先命中容器再在容器内定位），css 相对容器生成。
 * testid/role/label 等语义候选可穿透 shadow DOM；css/xpath 只在主文档元素上生成。
 *
 * 页内 API（window 上，守卫 __ttCandidatesInstalled__）：
 * - __ttResolve(raw) -> Element|null：按原始选择器（XPath/CSS/xpath= 前缀）解析元素
 * - __ttAnalyze(el) -> { candidates, counts, bestIndex }：生成候选 + 页内唯一性计数
 * - __ttDescribe(cands, counts) -> string：人类可读的候选摘要
 * - __ttPickCss(el) -> { css, scope }：按当前页面状态实时重算 CSS（兜底）
 *
 * 不依赖模块级可变状态（原 pickerScript 的 lastScopeContainer 已改为显式传参），
 * 两个 IIFE 可安全拼接注入。Node 侧通过 injectCandidates / analyzeElement 桥接。
 */
import type { Locator } from '../shared/testScript';
import { PLUGIN_RUNTIME_SCRIPT } from './pluginRuntime';

/** 作用域定位器描述（弹层容器等；scope.strategy 不含 xpath）。 */
export interface PickScope {
  strategy: string;
  value: string;
  role?: string;
  name?: string;
}

/** 单个候选定位器（页内产物，未经唯一性验证）。 */
export interface PickCandidate {
  strategy: string;
  value: string;
  role?: string;
  name?: string;
  scope?: PickScope | null;
}

/** __ttAnalyze 的返回：候选列表 + 每候选的页内重复数（1=唯一）+ 首个唯一候选下标。 */
export interface AnalyzeResult {
  candidates: PickCandidate[];
  counts: number[];
  bestIndex: number;
}

/** __ttPickCss 的返回：实时重算的 CSS 与作用域。 */
export interface CssRecompute {
  css?: string;
  scope?: PickScope | null;
}

// 头部拼接页内插件运行时框架：任何注入 CANDIDATE_SCRIPT 的会话自动具备插件注册表能力
export const CANDIDATE_SCRIPT = PLUGIN_RUNTIME_SCRIPT + String.raw`(() => {
  if (window.__ttCandidatesInstalled__ === 3) return;
  window.__ttCandidatesInstalled__ = 3;
  for (const el of document.querySelectorAll('[data-tt-idx]')) el.removeAttribute('data-tt-idx');

  const textOf = (node) => (node.textContent || '').replace(/\s+/g, ' ').trim();

  // —— 可见文本：无障碍播报类隐藏节点不入文本值 ——
  // textContent 会把 aria-live/sr-only 播报文本一并计入（如 antd select 交互后插入的
  // <span aria-live="polite" style="width:0;height:0;position:absolute;overflow:hidden;opacity:0">，
  // 与可见选中项拼成「XX」翻倍），且播报节点随交互瞬态出现/消失，据此生成的 text 候选与
  // 快照 label 在回放（静态 DOM）必不命中。计数（analyzeCounts）仍用 textOf——与 Playwright
  // getByText 匹配隐藏文本的语义保持一致，被污染的候选会因 count>1 被自然拒绝。
  // styleCache：同一次批量调用（如 __ttCollectInteractive 遍历全量元素）内缓存隐藏判定，避免重复 getComputedStyle。
  const isHiddenEl = (el, styleCache) => {
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;
    let st = styleCache && styleCache.get(el);
    if (!st) {
      st = getComputedStyle(el);
      if (styleCache) styleCache.set(el, st);
    }
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return true;
    // sr-only 常规写法：零尺寸 + overflow 裁剪（antd 播报节点带 opacity:0，已在上行命中；此行兜底其余 sr-only 变体）
    return el.offsetWidth === 0 && el.offsetHeight === 0 && (st.overflow === 'hidden' || st.overflow === 'clip');
  };
  const visibleTextOf = (node, styleCache) => {
    const cache = styleCache || new WeakMap();
    const isHidden = (el) => isHiddenEl(el, cache);
    const parts = [];
    const walk = (n) => {
      const kids = n.childNodes;
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i];
        if (c.nodeType === 3) parts.push(c.nodeValue || '');
        else if (c.nodeType === 1 && !isHidden(c)) walk(c);
      }
    };
    walk(node);
    return parts.join('').replace(/\s+/g, ' ').trim();
  };
  const cssEsc = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'));

  // 瞬态状态类剔除：open（展开）/focused（聚焦）/active/expanded（展开）/checked（勾选）/
  // selected（选中）/loading（加载中）/status-*（表单校验态）/ element-plus 的 is-* 交互态
  // 均随交互实时变化，编入 CSS 会导致回放（页面初始态）必不命中或命中错误元素。
  // 与 Node 侧 locatorVerifier.ts 的 TRANSIENT_CLASS_RE 保持一致。
  const TRANSIENT_CLASS_RE = /(^|-)(focused|open|active|expanded|checked|selected|loading)$|(^|-)status-(success|error|warning|validating)$|^is-(focus|focused|active|open|expanded|checked|selected|error)/;
  const stableClasses = (el) => Array.prototype.slice.call(el.classList || []).filter((c) => !TRANSIENT_CLASS_RE.test(c));

  // Playwright getByRole 只接受标准 ARIA role，非标准 role 会直接抛 "Unknown role"（无法执行）。
  // 显式 role 属性不在集合内时不生成 role 候选，回落其他策略。
  const KNOWN_ROLES = new Set(['alert','alertdialog','application','article','banner','button','cell','checkbox','columnheader','combobox','complementary','contentinfo','definition','dialog','directory','document','feed','figure','form','grid','gridcell','group','heading','img','link','list','listbox','listitem','log','main','marquee','math','menu','menubar','menuitem','menuitemcheckbox','menuitemradio','meter','navigation','none','note','option','presentation','progressbar','radio','radiogroup','region','row','rowgroup','rowheader','scrollbar','search','searchbox','separator','slider','spinbutton','status','switch','tab','table','tablist','tabpanel','term','textbox','timer','toolbar','tooltip','tree','treegrid','treeitem']);

  function computeRole(el) {
    const explicit = el.getAttribute && el.getAttribute('role');
    if (explicit) {
      const r = explicit.trim().toLowerCase();
      if (r === 'presentation' || r === 'none') return '';
      if (KNOWN_ROLES.has(r)) return r;
      return ''; // 非标准 role：Playwright getByRole 无法执行，不作为 role 候选
    }
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' || tag === 'area') return el.hasAttribute('href') ? 'link' : '';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'img') return 'img';
    if (tag === 'nav') return 'navigation';
    if (tag === 'main') return 'main';
    if (tag === 'aside') return 'complementary';
    if (tag === 'article') return 'article';
    if (tag === 'dialog') return 'dialog';
    if (tag === 'table') return 'table';
    if (tag === 'tr') return 'row';
    if (tag === 'ul' || tag === 'ol') return 'list';
    if (tag === 'li') return 'listitem';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset'].includes(type)) return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      return 'textbox';
    }
    return '';
  }

  /** 元素的可见标签：aria-label > aria-labelledby > 关联 label > 包裹 label。labelList 供批量分析时复用。 */
  function computeLabelText(el, labelList) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(textOf).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    const id = el.getAttribute('id');
    if (id) {
      const labels = labelList || document.querySelectorAll('label');
      for (let k = 0; k < labels.length; k++) {
        if (labels[k].htmlFor === id) {
          const t = textOf(labels[k]);
          if (t) return t;
        }
      }
    }
    let p = el.parentElement;
    while (p) {
      if (p.tagName && p.tagName.toLowerCase() === 'label') {
        const t = textOf(p);
        if (t) return t;
      }
      p = p.parentElement;
    }
    return '';
  }

  /** 可访问名近似：label/aria 优先，表单控件回退 placeholder，内容型角色取文本，最后 title。 */
  function computeName(el, labelList, styleCache) {
    const label = computeLabelText(el, labelList);
    if (label) return label;
    const tag = el.tagName.toLowerCase();
    const isForm = tag === 'input' || tag === 'select' || tag === 'textarea' || el.isContentEditable;
    if (isForm) {
      const ph = el.getAttribute('placeholder');
      return ph && ph.trim() ? ph.trim() : '';
    }
    const role = computeRole(el);
    const contentRoles = ['button', 'link', 'heading', 'navigation', 'region', 'article', 'complementary', 'banner', 'contentinfo', 'main', 'dialog', 'tab', 'menuitem', 'option', 'listitem', 'form', 'search', 'alert', 'status', 'checkbox', 'radio', 'tabpanel', 'tooltip'];
    if (contentRoles.includes(role)) {
      // 可见文本：aria-live/sr-only 播报节点会使 textContent 瞬态翻倍（回放必不命中），同 text 候选策略
      const t = visibleTextOf(el, styleCache);
      if (t) return t;
    }
    const title = el.getAttribute('title');
    return title && title.trim() ? title.trim() : '';
  }

  /** 祖先特征：id > tag+全部class > tag（供 CSS 前缀拼接用）。class 剔除瞬态状态类。 */
  function ancestorFeature(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute('id');
    if (id) return '#' + cssEsc(id);
    const classes = stableClasses(el);
    if (classes.length) return tag + classes.map((c) => '.' + cssEsc(c)).join('');
    return tag;
  }

  /**
   * 向上找模态框类容器（弹层内容经 portal 渲染到 body 下，定位锚定到容器内可避免顶层弹层序号漂移）。
   * 容器描述优先 role=dialog，其次容器自身唯一的 class css / #id；找不到唯一描述则不生成作用域。
   */
  function findModalScope(el) {
    if (!el.closest) return null;
    const container = el.closest('[role="dialog"], dialog, [aria-modal="true"], .ant-modal, .modal, .el-dialog');
    if (!container || container === el || container === document.body || container === document.documentElement) return null;
    const roleAttr = container.getAttribute('role');
    if (roleAttr === 'dialog' || container.tagName.toLowerCase() === 'dialog') {
      return { scope: { strategy: 'role', value: 'dialog', role: 'dialog' }, container: container };
    }
    const tag = container.tagName.toLowerCase();
    const classes = Array.prototype.slice.call(container.classList || []);
    if (classes.length) {
      const sel = tag + classes.map((c) => '.' + cssEsc(c)).join('');
      try {
        if (document.querySelectorAll(sel).length === 1) return { scope: { strategy: 'css', value: sel }, container: container };
      } catch { /* 忽略 */ }
    }
    if (container.id) {
      try {
        if (document.getElementById(container.id) === container) return { scope: { strategy: 'css', value: '#' + cssEsc(container.id) }, container: container };
      } catch { /* 忽略 */ }
    }
    return null;
  }

  /**
   * 生成 CSS 定位器：自身特征（#id、tag.allClasses、tag.firstClass、tag）首个唯一的直接返回；
   * 仍重复时沿祖先链由近到远收集 id/class 特征逐级加前缀；结构性完全相同的兜底才用 nth-of-type 路径。
   * anchor：作用域容器 -- 唯一性按容器内判定、路径相对容器生成。
   */
  function computeCss(el, anchor) {
    const scopeRoot = anchor || document;
    const unique = (sel) => {
      try {
        return scopeRoot.querySelectorAll(sel).length === 1;
      } catch {
        return false;
      }
    };
    const stopAt = anchor || document.body;
    const tag = el.tagName.toLowerCase();
    const classes = stableClasses(el);
    const id = el.getAttribute('id');
    if (id) {
      try {
        if (document.getElementById(id) === el && document.querySelectorAll('#' + cssEsc(id)).length === 1) return '#' + cssEsc(id);
      } catch { /* 忽略 */ }
    }
    const own = [];
    if (classes.length) {
      own.push(tag + classes.map((c) => '.' + cssEsc(c)).join(''));
      own.push(tag + '.' + cssEsc(classes[0]));
    }
    own.push(tag);
    for (const s of own) if (unique(s)) return s;

    const base = own[0] || tag;
    const chain = [];
    let cur = el.parentElement;
    while (cur && cur.nodeType === 1 && cur !== stopAt && cur !== document.body && cur !== document.documentElement) {
      chain.unshift(ancestorFeature(cur));
      const outer = chain[0] + ' ' + base;
      if (unique(outer)) return outer;
      const full = chain.join(' ') + ' ' + base;
      if (unique(full)) return full;
      cur = cur.parentElement;
    }

    const parts = [];
    let c2 = el;
    while (c2 && c2.nodeType === 1) {
      if (anchor && c2 === anchor) break;
      const pTag = c2.tagName.toLowerCase();
      let nth = 1;
      let sameTag = 0;
      let sib = c2.previousElementSibling;
      while (sib) {
        if (sib.tagName.toLowerCase() === pTag) {
          nth++;
          sameTag++;
        }
        sib = sib.previousElementSibling;
      }
      let nxt = c2.nextElementSibling;
      while (nxt) {
        if (nxt.tagName.toLowerCase() === pTag) sameTag++;
        nxt = nxt.nextElementSibling;
      }
      parts.unshift(sameTag > 0 ? pTag + ':nth-of-type(' + nth + ')' : pTag);
      if (!anchor && (c2 === document.body || c2 === document.documentElement)) break;
      c2 = c2.parentElement;
    }
    return parts.join(' > ');
  }

  function computeXPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const tag = cur.tagName.toLowerCase();
      let idx = 1;
      let sameTag = 0;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName.toLowerCase() === tag) {
          idx++;
          sameTag++;
        }
        sib = sib.previousElementSibling;
      }
      let nxt = cur.nextElementSibling;
      while (nxt) {
        if (nxt.tagName.toLowerCase() === tag) sameTag++;
        nxt = nxt.nextElementSibling;
      }
      parts.unshift(sameTag > 0 ? tag + '[' + idx + ']' : tag);
      if (cur === document.documentElement) break;
      cur = cur.parentElement;
    }
    return '/' + parts.join('/');
  }

  /**
   * 按定位器优先级生成候选：testid > role > label > placeholder > text > alt > title > css > xpath。
   * 元素在弹层容器内时，所有候选附 scope，css 相对容器生成，且不再生成绝对 xpath。
   * 返回 { candidates, container }：container 为弹层容器元素（analyzeCounts 用作统计根），无弹层时为 null。
   */
  function computeCandidates(el) {
    const out = [];
    // 插件候选增强：各成员插件经运行时框架贡献的候选（已带 pluginId），插在通用候选之前——
    // 组件感知候选通常质量更高；全部候选仍统一走 verifyCandidates（count===1+同节点）验证。
    try {
      const reg = window.__ttPluginRegistry__;
      if (reg) {
        const pcs = reg.candidatesFor(el);
        for (const c of pcs) out.push(c);
      }
    } catch (e) {
      /* 插件候选异常不影响通用候选生成 */
    }
    const inMainDoc = el.getRootNode && el.getRootNode() === document;
    const ms = inMainDoc ? findModalScope(el) : null;
    const scope = ms ? ms.scope : null;
    const container = ms ? ms.container : null;
    const testid = el.getAttribute('data-testid');
    if (testid) out.push({ strategy: 'testid', value: testid, scope: scope });
    const role = computeRole(el);
    const name = computeName(el);
    if (role && name) out.push({ strategy: 'role', value: role, role: role, name: name, scope: scope });
    // label 包裹的可勾选控件（antd/element-plus 的 checkbox/radio wrapper）：可点击命中面是包裹层
    // 本身（computeRole 对 label 无映射），role 候选缺失会落到 css 并把动作后状态类编入定位器
    // （实测「选择«智能体平台»」步自愈即此因）。从内层唯一 input 取 role + 可访问名补一个
    // role 候选——与回放自愈实际采用的定位一致；无文本的图标式勾选框不生成（iname 为空）。
    if (!(role && name)) {
      const tagName = (el.tagName || '').toLowerCase();
      const lbl = tagName === 'label' ? el : (el.closest ? el.closest('label') : null);
      const inputs = lbl && lbl.querySelectorAll ? lbl.querySelectorAll('input[type="checkbox"],input[type="radio"]') : [];
      if (inputs.length === 1) {
        const innerRole = inputs[0].getAttribute('type') === 'radio' ? 'radio' : 'checkbox';
        const innerName = computeName(inputs[0]);
        if (innerName) out.push({ strategy: 'role', value: innerRole, role: innerRole, name: innerName, scope: scope });
      }
    }
    const label = computeLabelText(el);
    if (label) out.push({ strategy: 'label', value: label, scope: scope });
    const ph = el.getAttribute('placeholder');
    if (ph && ph.trim()) out.push({ strategy: 'placeholder', value: ph.trim(), scope: scope });
    const t = visibleTextOf(el); // 可见文本：aria-live 播报节点会使 textContent 瞬态翻倍（如「XX」），回放必不命中
    if (t && t.length <= 80) out.push({ strategy: 'text', value: t, scope: scope });
    const alt = el.getAttribute('alt');
    if (alt) out.push({ strategy: 'alt', value: alt, scope: scope });
    const title = el.getAttribute('title');
    if (title && title.trim()) out.push({ strategy: 'title', value: title.trim(), scope: scope });
    if (inMainDoc) {
      if (ms) {
        const css = computeCss(el, ms.container);
        if (css) out.push({ strategy: 'css', value: css, scope: scope });
      } else {
        const css = computeCss(el);
        if (css) out.push({ strategy: 'css', value: css });
        out.push({ strategy: 'xpath', value: computeXPath(el) });
      }
    }
    return { candidates: out, container: container };
  }

  function candidateLabel(c) {
    if (!c) return '（无可用定位器）';
    return c.strategy === 'role'
      ? c.strategy + '=' + (c.role || '') + ' name=' + (c.name || '')
      : c.strategy + '=' + c.value;
  }

  /** 页内重复检测：估算每个候选的匹配数量（1=唯一，>1=有重复，0/-1=无法判定）。scopeRoot 为弹层容器时在容器内统计。 */
  function attrVal(v) {
    return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function analyzeCounts(cands, scopeRoot) {
    const counts = [];
    const needRole = [];
    const needLabel = [];
    const needText = [];
    const root = scopeRoot || document;
    const qsa = (sel) => root.querySelectorAll(sel).length;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      try {
        switch (c.strategy) {
          case 'testid': counts[i] = qsa('[data-testid="' + attrVal(c.value) + '"]'); break;
          case 'placeholder': counts[i] = qsa('[placeholder="' + attrVal(c.value) + '"]'); break;
          case 'alt': counts[i] = qsa('[alt="' + attrVal(c.value) + '"]'); break;
          case 'title': counts[i] = qsa('[title="' + attrVal(c.value) + '"]'); break;
          case 'css': counts[i] = qsa(c.value); break;
          case 'xpath': {
            const r = document.evaluate(c.value, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            counts[i] = r.snapshotLength;
            break;
          }
          case 'role': needRole.push(i); break;
          case 'label': needLabel.push(i); break;
          case 'text': needText.push(i); break;
          default: counts[i] = -1;
        }
      } catch {
        counts[i] = -1;
      }
    }

    if (needRole.length || needLabel.length || needText.length) {
      const labelList = Array.prototype.slice.call(root.querySelectorAll('label'));
      // Playwright 的 getByRole/getByLabel/getByText 匹配均大小写不敏感、空白归一；
      // 计数也按小写比较，避免页内估算唯一而 Playwright 严格模式多匹配。
      const wantRole = {};
      const wantLabel = {};
      const wantText = {};
      for (const i of needRole) wantRole[((cands[i].role || '') + '|' + (cands[i].name || '')).toLowerCase()] = true;
      for (const i of needLabel) wantLabel[(cands[i].value || '').toLowerCase()] = true;
      for (const i of needText) wantText[(cands[i].value || '').toLowerCase()] = true;
      const roleCount = {};
      const labelCount = {};
      const textCount = {};
      const all = scopeRoot ? scopeRoot.querySelectorAll('*') : document.body ? document.querySelectorAll('body *') : [];
      const styleCache = new WeakMap(); // 本轮计数复用隐藏判定（computeName 的 visibleTextOf 逐元素 getComputedStyle 开销收拢）
      for (let k = 0; k < all.length; k++) {
        const el = all[k];
        if (needRole.length) {
          const r = computeRole(el);
          if (r) {
            const n = computeName(el, labelList, styleCache);
            if (n) {
              const key = (r + '|' + n).toLowerCase();
              if (wantRole[key]) roleCount[key] = (roleCount[key] || 0) + 1;
            }
          }
        }
        if (needLabel.length) {
          const l = computeLabelText(el, labelList);
          if (l) {
            const lk = l.toLowerCase();
            if (wantLabel[lk]) labelCount[lk] = (labelCount[lk] || 0) + 1;
          }
        }
        if (needText.length) {
          const t = textOf(el);
          if (t) {
            const tl = t.toLowerCase();
            for (const tv in wantText) {
              if (tl.indexOf(tv) >= 0) textCount[tv] = (textCount[tv] || 0) + 1;
            }
          }
        }
      }
      for (const i of needRole) {
        const key = ((cands[i].role || '') + '|' + (cands[i].name || '')).toLowerCase();
        counts[i] = roleCount[key] || 0;
      }
      for (const i of needLabel) counts[i] = labelCount[(cands[i].value || '').toLowerCase()] || 0;
      for (const i of needText) counts[i] = textCount[(cands[i].value || '').toLowerCase()] || 0;
    }
    return counts;
  }

  function findBestIndex(cands, counts) {
    for (let i = 0; i < cands.length; i++) if (counts[i] === 1) return i;
    return -1;
  }

  /** 预览/确认栏描述：优先展示唯一候选；顶部候选有重复时说明将改用哪个。 */
  function describeCandidates(cands, counts) {
    const best = findBestIndex(cands, counts);
    const first = counts[0];
    const dupNote = typeof first === 'number' && first > 1 ? candidateLabel(cands[0]) + '（匹配 ' + first + ' 处）' : null;
    if (best >= 0) {
      const bestLabel = candidateLabel(cands[best]) + '（唯一）';
      return dupNote && best !== 0 ? dupNote + ' -> 将用 ' + bestLabel : bestLabel;
    }
    return dupNote ? dupNote + ' -> 无唯一匹配，将回退 css/xpath' : '无唯一匹配，将回退 css/xpath';
  }

  /** 按原始选择器解析元素：/ 或 xpath= 前缀走 XPath，否则 CSS。 */
  window.__ttResolve = function (raw) {
    if (typeof raw !== 'string' || !raw) return null;
    let sel = raw;
    let asXPath = sel.startsWith('/') || /^xpath=/i.test(sel);
    if (/^xpath=/i.test(sel)) sel = sel.replace(/^xpath=/i, '');
    if (asXPath) {
      try {
        return document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      } catch {
        return null;
      }
    }
    try {
      return document.querySelector(sel);
    } catch {
      return null;
    }
  };

  /** 一次调用内完成候选生成 + 页内计数（container 与 counts 天然一致；无弹层容器时为 null，按整页统计）。pluginNotes 为各插件语义标注拼接（snapshot 增注用）。 */
  window.__ttAnalyze = function (el) {
    if (!el || el.nodeType !== 1) return null;
    const { candidates, container } = computeCandidates(el);
    const counts = analyzeCounts(candidates, container);
    let pluginNotes = '';
    try {
      pluginNotes = window.__ttPluginRegistry__ ? window.__ttPluginRegistry__.annotateFor(el) : '';
    } catch (e) {
      pluginNotes = '';
    }
    return { candidates: candidates, counts: counts, bestIndex: findBestIndex(candidates, counts), pluginNotes: pluginNotes };
  };

  // —— 可交互元素编号与视觉标注（视觉双通道：截图标注序号与快照编号同源）——
  // 标注样式参数（3px 边框 + 白底蓝字序号块）按 384-token 固定计价的低分辨率重采样保守设定，
  // 待真网关 1080p 表格页读字基线实测后可调大（参数集中在此，便于调整）。
  // 组件库自定义复选框/单选（.el-checkbox 等）：真实 input 隐藏会被下方可见性过滤，不加则该控件永远没有编号，
  // 模型只能按相邻元素编号瞎猜（实测把编号 124 的所属部门下拉当成用户类型复选框点击）→ 编号落在可点击的包裹层上
  var INTERACTIVE_SEL = 'a[href],button,input,select,textarea,[role="button"],[role="combobox"],[role="checkbox"],[role="radio"],[role="tab"],[role="link"],[role="textbox"],[role="option"],[role="menuitem"],[role="switch"],[contenteditable="true"],[tabindex]:not([tabindex="-1"]),.ant-select,.ant-select-item-option,.el-select-dropdown__item,.ant-picker,.el-select,.el-date-editor,.el-checkbox,.el-radio,.el-checkbox-button,.el-radio-button,.ant-checkbox-wrapper,.ant-radio-wrapper';
  // 自定义点击卡片扫描（仅扫描不直接采集）：列表记录卡片普遍是 div/span onClick（React 合成事件无
  // onclick 属性，按 cursor:pointer 判定），无 ARIA 语义不在 INTERACTIVE_SEL 内。不采集则整块内容对
  // 模型不可见——记录已渲染但快照/断言全盲，验收必假阴性（案例 cmtxyqp86 C9：CRM 事件时间轴卡片）。
  // 只扫文本型标签（input 等原生交互已在上面的选择器内），开销是每元素一次 getComputedStyle（缓存）。
  var CLICKABLE_SCAN_SEL = 'div,span,li,tr,td,th,section,article,header,footer,label,dd,dt,p,h1,h2,h3,h4,h5,h6';
  window.__ttIndexedEls__ = { byIndex: {}, ids: new WeakMap(), next: 0, documentId: Math.random().toString(36).slice(2), version: 0, signature: '', rows: [] };

  /** 元素 → 页内唯一 css 路径（id 优先，其余 nth-of-type 链）。 */
  window.__ttCssPath = function (el) {
    if (el.id) return '#' + el.id;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      let sel = node.tagName.toLowerCase();
      const p = node.parentNode;
      if (p) {
        const sibs = Array.prototype.filter.call(p.children, function (c) { return c.tagName === node.tagName; });
        if (sibs.length > 1) sel += ':nth-of-type(' + (Array.prototype.indexOf.call(sibs, node) + 1) + ')';
      }
      parts.unshift(sel);
      node = p;
    }
    return 'body ' + parts.join(' > ');
  };

  function shortStateText(value, max) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max || 100);
  }
  function isShown(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const st = getComputedStyle(n);
      if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) return false;
      // rc-select 虚拟列表把 aria option 放在零尺寸、overflow:hidden 的无障碍容器中。
      // 它们可能有文本尺寸，但不是可点击的可见选项；采集实际的 option div。
      if (n !== el) {
        const box = n.getBoundingClientRect();
        if (box.width < 4 && /hidden|clip/.test(st.overflowX) || box.height < 4 && /hidden|clip/.test(st.overflowY)) return false;
      }
    }
    return true;
  }
  function controlState(el) {
    const input = el.matches('input,select,textarea') ? el : el.querySelector('input,select,textarea');
    const target = input || el;
    const parts = [];
    if (target.type === 'password') parts.push('filled=' + Boolean(target.value));
    else if ('value' in target) parts.push('value=' + shortStateText(target.value));
    if (target.type === 'checkbox' || target.type === 'radio') parts.push('checked=' + target.checked);
    for (const name of ['checked', 'selected', 'expanded', 'invalid', 'required']) {
      const val = el.getAttribute('aria-' + name);
      if (val != null) parts.push(name + '=' + val);
    }
    if (target.tagName === 'SELECT') parts.push('selected=' + shortStateText(Array.from(target.selectedOptions).map(o => o.textContent).join(',')));
    if (target.required) parts.push('required=true');
    if (target.validity && !target.validity.valid) parts.push('invalid=true');
    return parts.join(' ');
  }

  /** 文档内身份单调递增；SPA 路由改变不重置。byIndex 只保留当前可见存活节点。 */
  window.__ttCollectInteractive = function () {
    const state = window.__ttIndexedEls__;
    const previous = state.byIndex;
    const current = {};
    const rows = [];
    const styleCache = new WeakMap();
    let clickableAncestor = null; // 已采集的指针卡片；cursor 会被子元素继承，后代全部跳过，避免一张卡炸出几十行
    const els = document.body ? document.body.querySelectorAll(INTERACTIVE_SEL + ',' + CLICKABLE_SCAN_SEL) : [];
    for (const el of els) {
      const isNative = el.matches(INTERACTIVE_SEL);
      if (!isNative) {
        // 便宜的判定放前面，避免对海量非候选节点跑 isShown 的逐级祖先 getComputedStyle。
        let clickable = el.hasAttribute('onclick');
        if (!clickable) {
          let st = styleCache.get(el);
          if (!st) { st = getComputedStyle(el); styleCache.set(el, st); }
          clickable = st.cursor === 'pointer';
        }
        if (!clickable) continue;
        if (clickableAncestor && clickableAncestor.contains(el)) continue;
        if (el.closest(INTERACTIVE_SEL)) continue;    // 原生交互元素内部的指针 span（按钮文字层等）不重复占号
        if (!visibleTextOf(el, styleCache)) continue; // 无可见文本的指针容器不占号（纯图标点击区采不到，维持现状）
        clickableAncestor = el;
      }
      if (!isShown(el)) continue;
      let idx = state.ids.get(el);
      const isNew = !idx || !previous[idx];
      if (!idx) { idx = ++state.next; state.ids.set(el, idx); }
      if (el.getAttribute('data-tt-idx') !== String(idx)) el.setAttribute('data-tt-idx', String(idx));
      current[idx] = el;
      const labels = el.labels ? Array.from(el.labels).map(l => visibleTextOf(l, styleCache)).join(' ') : '';
      const labelled = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(l => visibleTextOf(l, styleCache)).join(' ');
      const labelMax = isNative ? 64 : 120; // 点击卡片靠 label 承载记录文本（标题/摘要），放宽到 120 便于关键词命中
      const label = shortStateText(el.getAttribute('aria-label') || labelled || labels || el.getAttribute('placeholder') || el.getAttribute('title') || visibleTextOf(el, styleCache), labelMax);
      const role = computeRole(el) || el.tagName.toLowerCase();
      const value = controlState(el);
      const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true' || el.matches('.ant-select-item-option-disabled,.el-select-dropdown__item.is-disabled');
      const container = el.closest('[role="dialog"],dialog,form,[role="row"],tr,fieldset');
      const context = container ? shortStateText(container.getAttribute('aria-label') || container.getAttribute('aria-labelledby') && document.getElementById(container.getAttribute('aria-labelledby'))?.textContent || (container.matches('tr,[role="row"]') ? visibleTextOf(container, styleCache) : ''), 64) : '';
      let notes = '';
      try { notes = shortStateText(window.__ttPluginRegistry__?.annotateFor(el), 180); } catch (_) {}
      rows.push({ id: String(idx), role, label, value, disabled: Boolean(disabled), context, notes, isNew });
    }
    for (const k of Object.keys(previous)) if (!current[k] && previous[k]?.isConnected) previous[k].removeAttribute('data-tt-idx');
    state.byIndex = current;
    state.rows = rows;
    const signature = location.href + JSON.stringify(rows.map(({ isNew, ...row }) => row));
    if (signature !== state.signature) { state.version++; state.signature = signature; }
    return rows.map(row => '[' + row.id + ']' + (row.isNew ? '*' : '') + '<' + row.role + (row.label ? ' ' + row.label : '') + '>' + (row.value ? ' ' + row.value : '') + (row.disabled ? ' [disabled]' : '') + (row.context ? ' in=' + row.context : '') + (row.notes ? ' ' + row.notes : ''));
  };

  /** 服务器侧持有完整基线；给模型的快照有范围、分页和字符预算。 */
  window.__ttSnapshot = function (options) {
    options = options || {};
    const lines = window.__ttCollectInteractive();
    const state = window.__ttIndexedEls__;
    const roots = Array.from(document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],[role="listbox"],.el-dialog,.el-drawer,.ant-modal,.ant-drawer,.el-select-dropdown,.ant-select-dropdown,.el-picker-panel,.ant-picker-dropdown')).filter(isShown);
    let root = null;
    if (options.scope && !['auto', 'page', 'viewport'].includes(options.scope)) {
      root = document.querySelector(options.scope);
      if (!root) throw new Error('快照范围不存在：' + options.scope);
    }
    const activeRoots = roots.filter(el => !roots.some(other => other !== el && el.contains(other)));
    const scope = options.scope || 'auto';
    const query = String(options.query || '').toLowerCase();
    const selected = state.rows.map((row, i) => ({ row, line: lines[i] })).filter(({row, line}) => {
      const el = state.byIndex[row.id];
      if (root && el !== root && !root.contains(el)) return false;
      if (scope === 'auto' && activeRoots.length && !activeRoots.some(r => el === r || r.contains(el))) return false;
      if (scope === 'viewport' || scope === 'auto' && !activeRoots.length) {
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
      }
      return !query || line.toLowerCase().includes(query);
    });
    const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
    const limit = Math.min(150, Math.max(1, Math.floor(Number(options.limit) || 80)));
    const maxChars = Math.min(16000, Math.max(500, Number(options.maxChars) || 10000));
    const output = [];
    let size = 0;
    for (const item of selected.slice(offset, offset + limit)) {
      if (size + item.line.length > maxChars && output.length) break;
      output.push(item.line); size += item.line.length + 1;
    }
    const values = Object.fromEntries(state.rows.map(r => [r.id, r.value]));
    const structure = JSON.stringify(state.rows.map(r => [r.id, r.role, r.label, r.disabled, r.context, state.byIndex[r.id].getAttribute('aria-expanded')]));
    const textRoot = root || (activeRoots.length ? activeRoots[activeRoots.length - 1] : document.body);
    const alerts = Array.from(document.querySelectorAll('[role="alert"],.el-form-item__error,.ant-form-item-explain-error')).filter(isShown).map(el => shortStateText(el.innerText, 180)).slice(0, 8);
    const pageText = shortStateText(document.body?.innerText, 12000);
    // query 文本兜底：快照只含交互元素，内容渲染在非交互容器（列表卡片/纯文本区）时交互元素 0 命中。
    // 用 body.innerText 二次判定，给模型「内容其实在页面上」的信号与上下文片段，避免把假阴性当记录缺失。
    let queryTextHit = null; let queryTextSnippet = '';
    if (query) {
      const at = pageText.toLowerCase().indexOf(query);
      queryTextHit = at >= 0;
      if (at >= 0) queryTextSnippet = shortStateText(pageText.slice(Math.max(0, at - 60), at + query.length + 80), 200);
    }
    return { version: state.documentId + ':' + state.version, documentId: state.documentId, url: location.href,
      lines: output, total: selected.length, allCount: state.rows.length, offset,
      nextOffset: offset + output.length < selected.length ? offset + output.length : null,
      scope: root ? options.scope : scope === 'auto' && activeRoots.length ? 'active-overlay' : scope,
      values, structure, pageText, alerts, queryTextHit, queryTextSnippet,
      context: shortStateText(textRoot?.getAttribute('aria-label') || textRoot?.getAttribute('role') || '', 80) };
  };

  /** 给编号元素绘制标注框（截图前调用；粗边框 + 白底蓝字序号块，适配低分辨率重采样）。 */
  window.__ttDrawOverlays = function () {
    window.__ttClearOverlays();
    const state = window.__ttIndexedEls__;
    for (const idx of Object.keys(state.byIndex)) {
      const el = state.byIndex[idx];
      if (!el || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > (window.innerHeight || 900)) continue;
      const box = document.createElement('div');
      box.setAttribute('data-tt-overlay', '1');
      box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:3px solid #1677FF;background:rgba(22,119,255,0.10);left:' + (r.left - 1) + 'px;top:' + (r.top - 1) + 'px;width:' + (r.width + 2) + 'px;height:' + (r.height + 2) + 'px;';
      const tag = document.createElement('div');
      tag.setAttribute('data-tt-overlay', '1');
      tag.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:#1677FF;color:#fff;font:bold 14px/1.1 monospace;padding:2px 5px;border:1px solid #fff;border-radius:2px;left:' + r.left + 'px;top:' + Math.max(0, r.top - 18) + 'px;';
      tag.textContent = String(idx);
      document.body.appendChild(box);
      document.body.appendChild(tag);
    }
  };

  /** 清除标注（截图后恢复原始画面）。 */
  window.__ttClearOverlays = function () {
    for (const n of document.querySelectorAll('[data-tt-overlay="1"]')) n.remove();
  };

  window.__ttDescribe = function (cands, counts) {
    return describeCandidates(cands || [], counts || []);
  };

  /** 格式化一个已验证的 Locator（后端回写）为人类可读描述，供预览栏展示。 */
  window.__ttLocDesc = function (loc) {
    if (!loc) return '（无可用定位器）';
    return loc.strategy === 'role'
      ? 'role=' + (loc.role || loc.value) + ' name=' + (loc.name || '')
      : loc.strategy + '=' + loc.value;
  };

  /** 供后端对「仍存活」的目标元素按当前页面状态实时重算 CSS 兜底。 */
  window.__ttPickCss = function (el) {
    const ms = el && el.closest ? findModalScope(el) : null;
    return {
      css: ms ? computeCss(el, ms.container) : computeCss(el),
      scope: ms ? ms.scope : null,
    };
  };
})();`;

/** 把共享候选脚本注入页面（守卫使重复注入为 no-op；可安全跨导航重复调用）。 */
export async function injectCandidates(page: any): Promise<void> {
  try {
    await page.evaluate(CANDIDATE_SCRIPT);
  } catch {
    /* 页面已关闭/导航中，忽略 */
  }
}

/**
 * 解析原始选择器（XPath/CSS）对应元素，生成候选 + 页内计数。
 * 解析不到元素返回 null（由调用方回退原始选择器）。
 */
export async function analyzeElement(page: any, raw: string): Promise<AnalyzeResult | null> {
  await injectCandidates(page);
  const res = await page
    .evaluate((sel: string) => {
      const win = globalThis as any;
      const el = win.__ttResolve?.(sel);
      return el && el.nodeType === 1 ? (win.__ttAnalyze(el) ?? null) : null;
    }, raw)
    .catch(() => null);
  return (res as AnalyzeResult) ?? null;
}

/** 原始选择器 → Locator（/ 开头视为 xpath，否则 css）。 */
export function rawLocatorOf(selector: string): Locator {
  return selector.startsWith('/') || /^xpath=/i.test(selector)
    ? { strategy: 'xpath', value: selector.replace(/^xpath=/i, '') }
    : { strategy: 'css', value: selector };
}
