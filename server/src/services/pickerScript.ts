/**
 * 注入到被测页面的「定位器拾取」脚本（addInitScript，每次导航后重跑）。
 *
 * 交互（Alt+点击拾取，普通点击穿透）：
 * - 悬停：高亮元素并预览最高优先级定位器。
 * - 普通点击：完全穿透到页面（用于展开菜单/弹层、触发页面逻辑），不选中任何元素。
 * - Alt+点击元素：在捕获阶段拦截该点击（页面无副作用），把元素置为「待确认」，
 *   顶部状态栏出现候选定位器预览与「确认拾取 / 取消」按钮。
 * - 点「确认拾取」：才算完成拾取——把元素引用写入 window.__testToolPickEl__、
 *   候选定位器写入 window.__testToolPick__，后端轮询到后关闭浏览器。
 * - Esc：有待确认元素时仅撤销待确认；否则取消整个拾取。
 *
 * 候选生成（优先级与唯一性估算）复用共享脚本 CANDIDATE_SCRIPT 的
 * window.__ttAnalyze / __ttDescribe / __ttPickCss，本文件只负责 UI 与交互。
 * 后端用真实 Playwright 按优先级逐一验证候选唯一性（count===1 且命中元素与
 * __testToolPickEl__ 为同一节点），返回首个通过的候选作为 Locator。
 * 全程不改动原页面 DOM：仅追加一个 position:fixed、pointer-events:none 的悬浮覆盖层
 * （仅顶部状态栏在有待确认元素时临时可点击，用于确认/取消按钮），不包裹/移动/修改任何已有节点。
 *
 * iframe 内元素直接提示不支持；css/xpath 只在主文档元素上生成（selector 无法跨 shadow root/iframe）。
 */
import { CANDIDATE_SCRIPT } from './locatorCandidateScript';

const PICKER_UI_SCRIPT = String.raw`(() => {
  if (window.__testToolPickInstalled__) return;
  window.__testToolPickInstalled__ = true;

  // ---- 覆盖层 UI（默认 pointer-events:none，不拦截页面交互）----
  const host = document.createElement('div');
  host.setAttribute('data-tt-picker-host', '');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

  // 顶部状态栏：始终 pointer-events:auto（鼠标事件不穿透到底层元素，避免底层显示悬停选框），可拖动移动、可展开显示完整信息
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#7c3aed;color:#fff;padding:6px 12px;border-radius:6px;font-size:13px;box-shadow:0 2px 12px rgba(0,0,0,.25);display:flex;align-items:center;gap:8px;white-space:nowrap;pointer-events:auto;user-select:none;cursor:grab;max-width:80%;';
  const barHint = document.createElement('span');
  barHint.textContent = '拾取元素：普通点击可正常展开页面；按住 Alt 点击要拾取的元素，再点「确认拾取」完成 · Esc 取消';
  const barPick = document.createElement('span');
  barPick.style.cssText = 'display:none;align-items:center;gap:6px;';
  const barCandidate = document.createElement('span');
  barCandidate.style.cssText = 'max-width:420px;overflow:hidden;text-overflow:ellipsis;';
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '确认拾取';
  confirmBtn.style.cssText = 'background:#22c55e;color:#fff;border:none;border-radius:4px;padding:2px 10px;font-size:12px;cursor:pointer;';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = 'background:rgba(255,255,255,.25);color:#fff;border:none;border-radius:4px;padding:2px 10px;font-size:12px;cursor:pointer;';
  const expandBtn = document.createElement('button');
  expandBtn.textContent = '▾';
  expandBtn.title = '展开/收起完整信息';
  expandBtn.style.cssText = 'background:transparent;color:#fff;border:none;border-radius:4px;padding:2px 4px;font-size:12px;cursor:pointer;';
  barPick.appendChild(barCandidate);
  barPick.appendChild(confirmBtn);
  barPick.appendChild(cancelBtn);
  bar.appendChild(barHint);
  bar.appendChild(barPick);
  bar.appendChild(expandBtn);
  host.appendChild(bar);

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:2px solid #7c3aed;background:rgba(124,58,237,.12);display:none;';
  host.appendChild(box);

  const tag = document.createElement('div');
  tag.style.cssText = 'position:fixed;top:0;left:0;display:none;background:#111827;color:#e5e7eb;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;padding:4px 8px;border-radius:4px;max-width:460px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  host.appendChild(tag);

  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;top:52px;left:50%;transform:translateX(-50%);background:#dc2626;color:#fff;padding:5px 12px;border-radius:6px;font-size:12px;display:none;box-shadow:0 2px 12px rgba(0,0,0,.25);';
  host.appendChild(hint);

  // addInitScript 在 document_start 执行，此时 documentElement/body 尚不存在，延迟挂载覆盖层
  function ensureHost() {
    if (host.parentNode) return;
    const root = document.documentElement || document.body || document.head;
    if (root) root.appendChild(host);
    else setTimeout(ensureHost, 0);
  }
  ensureHost();

  function showHint(text, ms) {
    hint.textContent = text;
    hint.style.display = 'block';
    clearTimeout(showHint._t);
    showHint._t = setTimeout(function () { hint.style.display = 'none'; }, ms || 2500);
  }

  let pendingEl = null;
  let pendingCands = null; // 点击选中时缓存的候选（此时元素未脱离文档，css/xpath 候选才有效）
  let lastAnalyzedEl = null; // 悬停预览按元素变化才重算重复数，避免反复遍历

  function showPending(el) {
    pendingEl = el;
    const r = window.__ttAnalyze(el);
    pendingCands = r ? r.candidates : [];
    // 请求后端用真实 Playwright 验证候选（预览即所见：预览展示的就是最终会落库的定位器）
    window.__testToolPickEl__ = el;
    window.__testToolPickUrl__ = location.href;
    window.__testToolPick__ = { type: 'preview', candidates: pendingCands };
    barCandidate.textContent = '验证中…';
    barHint.style.display = 'none';
    barPick.style.display = 'inline-flex';
  }

  // 轮询后端回写的 Playwright 验证结果，更新预览栏（与最终落库一致）
  setInterval(function () {
    if (!pendingEl) return;
    const res = window.__testToolPickResult__;
    if (!res || typeof res !== 'object') return;
    window.__testToolPickResult__ = null;
    barCandidate.textContent = res.locator
      ? '将拾取：' + window.__ttLocDesc(res.locator) + '（Playwright 验证通过）'
      : '无唯一可用定位器，将回退 css/xpath';
  }, 200);

  function clearPending() {
    pendingEl = null;
    pendingCands = null;
    barPick.style.display = 'none';
    barHint.style.display = '';
  }

  function confirmPick() {
    if (!pendingEl) return;
    const el = pendingEl;
    const cands = pendingCands && pendingCands.length ? pendingCands : (window.__ttAnalyze(el) || {}).candidates || [];
    clearPending();
    // 不改动原元素 DOM：把元素引用存入 window，后端经 Playwright handle 用 isSameNode 比对命中元素。
    // 同时记录当前 URL：SPA 重渲染可能替换该元素导致引用脱离，后端据此判断是否仍可采信唯一性结果。
    window.__testToolPickEl__ = el;
    window.__testToolPickUrl__ = location.href;
    window.__testToolPick__ = { type: 'pick', candidates: cands };
  }

  confirmBtn.addEventListener('click', function (e) { e.stopPropagation(); confirmPick(); });
  cancelBtn.addEventListener('click', function (e) { e.stopPropagation(); clearPending(); });

  // ---- 状态栏拖动 / 展开 ----
  let expanded = false;
  function applyExpand() {
    expandBtn.textContent = expanded ? '▴' : '▾';
    barCandidate.style.maxWidth = expanded ? 'none' : '420px';
    barCandidate.style.whiteSpace = expanded ? 'normal' : 'nowrap';
    bar.style.whiteSpace = expanded ? 'normal' : 'nowrap';
    bar.style.maxWidth = expanded ? '80vw' : '80%';
  }
  expandBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    expanded = !expanded;
    applyExpand();
  });

  let dragging = null; // {dx, dy} 鼠标相对状态栏左上角的偏移
  bar.addEventListener('mousedown', function (e) {
    if (e.target === confirmBtn || e.target === cancelBtn || e.target === expandBtn) return;
    const r = bar.getBoundingClientRect();
    // 从「top:10px + translateX(-50%)」的居中定位切换为显式 left/top，之后按增量更新
    bar.style.transform = 'none';
    bar.style.left = r.left + 'px';
    bar.style.top = r.top + 'px';
    dragging = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    bar.style.cursor = 'grabbing';
    e.preventDefault();
    e.stopPropagation();
  });
  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    const r = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - dragging.dx, window.innerWidth - r.width));
    const y = Math.max(0, Math.min(e.clientY - dragging.dy, window.innerHeight - r.height));
    bar.style.left = x + 'px';
    bar.style.top = y + 'px';
  });
  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = null;
    bar.style.cursor = 'grab';
  });

  function onMouseOver(e) {
    let el = e.target;
    if (e.composedPath && e.composedPath()[0]) el = e.composedPath()[0];
    if (!el || el.nodeType !== 1) return;
    if (el === host || host.contains(el)) {
      // 鼠标在覆盖层（如状态栏）上：事件不穿透，隐藏对底层元素的预览选框与标签
      box.style.display = 'none';
      tag.style.display = 'none';
      lastAnalyzedEl = null;
      return;
    }
    if (el.ownerDocument !== document) return; // iframe 内不预览
    const r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = Math.max(r.width, 2) + 'px';
    box.style.height = Math.max(r.height, 2) + 'px';
    let ty = r.top - 24;
    if (ty < 0) ty = r.bottom + 4;
    tag.style.left = Math.max(4, r.left) + 'px';
    tag.style.top = ty + 'px';
    if (el === lastAnalyzedEl) return; // 同一元素只重算一次重复数
    lastAnalyzedEl = el;
    const a = window.__ttAnalyze(el);
    tag.textContent = '将拾取：' + (a ? window.__ttDescribe(a.candidates, a.counts) : '（无可用定位器）');
    tag.style.display = 'block';
  }

  function onClick(e) {
    let el = e.target;
    if (e.composedPath && e.composedPath()[0]) el = e.composedPath()[0];
    if (!el || el.nodeType !== 1) return;
    if (el === host || host.contains(el)) return; // 覆盖层自身（含确认/取消按钮），不当作页面元素
    // 普通点击完全穿透（用于展开菜单/弹层、触发页面逻辑），不选中任何元素；
    // 仅 Alt+点击表示拾取意图：拦截该点击（页面收不到、无副作用）并把元素置为待确认。
    if (!e.altKey) return;
    if (el.ownerDocument !== document) {
      showHint('暂不支持拾取 iframe 内的元素，请在主文档中选择');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    showPending(el);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (pendingEl) clearPending();
      else window.__testToolPick__ = { type: 'cancel' };
    }
  }

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
})();`;

/** 共享候选脚本 + 拾取 UI：保持单一 addInitScript，通信协议（__testToolPick__）不变。 */
export const PICKER_SCRIPT = CANDIDATE_SCRIPT + PICKER_UI_SCRIPT;
