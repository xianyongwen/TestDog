/**
 * 内置插件：Ant Design 树形选择器（TreeSelect）适配。
 *
 * 槽位：detect（.ant-tree-select 触发器，排除弹层）/ annotate（树形语义标注与当前值）/
 * actions.select（展开弹层——已开则复用 + 折叠祖先逐个展开闭环 + 节点内容点击）。
 *
 * 注册在 ant-select 之后作为 select 动作的树形兜底（ant-select 先试：树形弹层无
 * .ant-select-item 选项，等待超时 failed 后落到本插件）。
 *
 * antd v5/v6 双版本兼容：v6 重构了触发器 DOM——选中回显由 .ant-select-selection-item
 * 改为 .ant-select-content（选中态含 ant-select-content-has-value），读值处一律双类名并取。
 * 弹层归属：复用已开弹层（含 ant-select 先试失败的合法跨插件复用）前经
 * aria-controls/aria-owns 校验弹层属于当前触发器，他人残留先收起再全新打开。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // 可见性过滤：antd 度量用隐藏节点（aria-hidden/height 0）与折叠后仍留 DOM 的子节点都须排除
  const visible = (el) => !!(el && el.offsetParent !== null);

  function visibleTreeDropdown() {
    for (const d of document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')) {
      if (d.querySelector('.ant-select-tree') && visible(d)) return d;
    }
    return null;
  }

  // 弹层归属：触发器 input 的 aria-controls/aria-owns 指向弹层内 listbox（rc-select 展开时
  // 才设置，antd v5/v6 同机制）。同 ant-select 的 dropdownOwned 口径：他人残留弹层不能复用。
  function dropdownOwned(editor, dropdown) {
    const input = editor.querySelector('input');
    const ac = input && (input.getAttribute('aria-controls') || input.getAttribute('aria-owns'));
    if (!ac) return false;
    const esc = (window.CSS && CSS.escape) ? CSS.escape(ac) : ac.replace(/([^\w-])/g, '\\$1');
    return !!dropdown.querySelector('#' + esc);
  }

  async function treeSelect(el, want) {
    const editor = el.closest('.ant-tree-select') || el;
    // 弹层已开且归属本控件则复用（含 ant-select 先试失败的合法跨插件复用——同一触发器，
    // 归属校验通过），避免再点一次触发器收起；他人残留先收起再全新打开（收起策略同
    // ant-select：定位弹层归属触发器 toggle，document 级 clickoutside 对 antd 弹层不可靠）
    let dropdown = visibleTreeDropdown();
    if (dropdown && !dropdownOwned(editor, dropdown)) {
      for (let i = 0; i < 3; i++) {
        const d = visibleTreeDropdown();
        if (!d) break;
        const listEl = d.querySelector('[id]');
        let ownerInput = null;
        if (listEl && listEl.id) {
          for (const inp of document.querySelectorAll('input')) {
            if (inp.getAttribute('aria-controls') === listEl.id || inp.getAttribute('aria-owns') === listEl.id) {
              ownerInput = inp;
              break;
            }
          }
        }
        const ownerSel = ownerInput && ownerInput.closest('.ant-select');
        const trigger = ownerSel && (ownerSel.querySelector('.ant-select-selector') || ownerSel);
        if (trigger) {
          trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          trigger.click();
        } else {
          document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
        await sleep(200);
      }
      dropdown = null;
    }
    if (!dropdown) {
      const selectorEl = editor.querySelector('.ant-select-selector') || editor;
      selectorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      selectorEl.click();
      dropdown = await window.__ttPickWait(visibleTreeDropdown, 5000);
    }
    let target = null;
    for (let i = 0; i < 60; i++) {
      target = null;
      for (const node of dropdown.querySelectorAll('.ant-select-tree-treenode')) {
        if (!visible(node)) continue;
        const title = node.querySelector('.ant-select-tree-title');
        if (title && (title.textContent || '').trim() === want) { target = node; break; }
      }
      if (target) break;
      // 展开闭环：点击第一个折叠 switcher（_close 非 noop）后重搜（状态相关，轮数不定，上限 60 防死循环）
      let expanded = false;
      for (const sw of dropdown.querySelectorAll('.ant-select-tree-switcher.ant-select-tree-switcher_close')) {
        if (visible(sw)) { sw.click(); expanded = true; break; }
      }
      if (!expanded) break;
      await sleep(100);
    }
    if (!target) {
      const all = Array.from(dropdown.querySelectorAll('.ant-select-tree-treenode'))
        .filter((n) => visible(n) && n.querySelector('.ant-select-tree-title'))
        .slice(0, 10)
        .map((n) => (n.querySelector('.ant-select-tree-title').textContent || '').trim())
        .filter(Boolean);
      throw new Error(`树节点未找到：${want}（当前可见：${all.join(' / ') || '无'}）。深层节点需先展开其祖先，或修正节点文本。`);
    }
    const clickEl = target.querySelector('.ant-select-tree-node-content-wrapper') || target.querySelector('.ant-select-tree-title') || target;
    clickEl.click();
    await sleep(150);
    return `已选择树节点：${want}`;
  }

  return {
    // 触发器根节点自带 ant-tree-select 标记类（排除弹层内的树节点误命中）
    detect(el) {
      return !!(el.closest('.ant-tree-select') && !el.closest('.ant-select-dropdown'));
    },
    annotate(el) {
      const sel = el.closest('.ant-tree-select');
      if (sel && !el.closest('.ant-select-dropdown')) {
        // 选中回显读值 v5/v6 双类名（同 ant-select）
        const value = sel.querySelector('.ant-select-selection-item, .ant-select-content.ant-select-content-has-value');
        return `Ant Design 树形选择器（TreeSelect，非原生 select，勿对其 fill/selectOption；弹层为 .ant-select-tree 树形节点，深层节点需先展开祖先；用 select 动作，args.value=节点可见文本），当前值: ${(value && value.textContent) || '(空)'}`;
      }
      return '';
    },
    actions: {
      // select：与 ant-select 同名动作，链上排其之后作为树形弹层兜底（平铺 option 由 ant-select 先试）
      select: {
        doc: '选择 Ant Design TreeSelect 的节点（自动展开弹层并逐层展开折叠祖先，点击文本匹配的树节点）。args.value=目标节点可见文本',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) throw new Error('树形选择缺少 args.value（节点可见文本）');
          if (!el.closest('.ant-tree-select')) throw new Error('目标元素不属于 Ant Design 树形选择器（.ant-tree-select）');
          return await treeSelect(el, want);
        },
        // 页内后验：选中标签与期望一致（v5/v6 双类名，同 ant-select）
        verify(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) return false;
          const sel = el.closest('.ant-tree-select');
          if (!sel) return false;
          for (const it of sel.querySelectorAll('.ant-select-selection-item, .ant-select-content.ant-select-content-has-value')) {
            if ((it.textContent || '').trim() === want) return true;
          }
          return false;
        },
      },
    },
  };
})()
