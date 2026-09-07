/**
 * 内置插件：Element 树形下拉适配（element-plus 原生 el-tree-select / element-ui 组合 el-select+el-tree）。
 *
 * 槽位：detect（.el-select 触发器，排除弹层——树形触发器与普通下拉同根类名，触发器侧
 * 无法区分）/ annotate（仅当触发器可经 aria-controls 关联到含 .el-tree 的弹层时标注树形语义）/
 * actions.select（仅接受含 .el-tree 的可见弹层，与 el-select 的平铺 option 弹层区分；
 * 展开祖先闭环后点选节点）。
 *
 * 注册在 el-select 之后作为 select 动作的树形兜底（平铺 option 弹层由 el-select 先试）。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  const visible = (el) => !!(el && el.offsetParent !== null);

  // 仅接受含 .el-tree 的可见弹层（与 el-select 插件的平铺 option 弹层区分）
  function visibleTreeDropdown() {
    for (const d of document.querySelectorAll('.el-select-dropdown')) {
      if (d.style.display !== 'none' && d.offsetParent !== null && d.querySelector('.el-tree')) return d;
    }
    return null;
  }

  async function treeSelect(el, want) {
    const editor = el.closest('.el-select') || el;
    let dropdown = visibleTreeDropdown();
    if (!dropdown) {
      const input = editor.querySelector('input') || editor;
      input.click();
      dropdown = await window.__ttPickWait(visibleTreeDropdown, 5000);
    }
    let target = null;
    for (let i = 0; i < 60; i++) {
      target = null;
      for (const node of dropdown.querySelectorAll('.el-tree-node__content')) {
        if (!visible(node)) continue;
        const label = node.querySelector('.el-tree-node__label');
        const text = ((label ? label.textContent : node.textContent) || '').trim();
        if (text === want) { target = node; break; }
      }
      if (target) break;
      // 折叠父节点 icon 无 expanded 且非 is-leaf；点击仅展开不选中
      let expanded = false;
      for (const ic of dropdown.querySelectorAll('.el-tree-node__expand-icon')) {
        if (!ic.classList.contains('is-leaf') && !ic.classList.contains('expanded') && visible(ic)) { ic.click(); expanded = true; break; }
      }
      if (!expanded) break;
      await sleep(100);
    }
    if (!target) {
      const all = Array.from(dropdown.querySelectorAll('.el-tree-node__content'))
        .filter((n) => visible(n))
        .slice(0, 10)
        .map((n) => {
          const l = n.querySelector('.el-tree-node__label');
          return ((l ? l.textContent : n.textContent) || '').trim();
        })
        .filter(Boolean);
      throw new Error(`树节点未找到：${want}（当前可见：${all.join(' / ') || '无'}）。深层节点需先展开其祖先，或修正节点文本。`);
    }
    target.click();
    await sleep(150);
    return `已选择树节点：${want}`;
  }

  // 触发器侧能否可靠关联到含 .el-tree 的弹层（element-plus 经 aria-controls 指向弹层内 listbox）；
  // element-ui 组合方案无 aria 关联，返回 false（标注降级省略，动作仍可兜底闭环）
  function treeSignal(el) {
    const sel = el.closest('.el-select');
    if (!sel) return false;
    const inp = sel.querySelector('input[aria-controls], input[aria-owns]');
    const refId = inp ? (inp.getAttribute('aria-controls') || inp.getAttribute('aria-owns')) : null;
    if (!refId) return false;
    const ref = document.getElementById(refId);
    const dd = ref ? (ref.classList.contains('el-select-dropdown') ? ref : ref.closest('.el-select-dropdown')) : null;
    return !!(dd && (dd.querySelector('.el-tree') || dd.classList.contains('el-tree-select__popper')));
  }

  return {
    // 树形触发器与普通下拉同根类名 .el-select：注册为 el-select 之后的兜底位，动作内自辨 .el-tree 弹层
    detect(el) {
      return !!(el.closest('.el-select') && !el.closest('.el-select-dropdown'));
    },
    annotate(el) {
      if (el.closest('.el-select') && !el.closest('.el-select-dropdown') && treeSignal(el)) {
        return 'Element 树形下拉（弹层为 .el-tree 树形节点，深层节点需先展开祖先；用 select 动作，args.value=节点可见文本）';
      }
      return '';
    },
    actions: {
      // select：与 el-select 同名动作，链上排其之后作为树形弹层兜底（平铺 option 由 el-select 先试）
      select: {
        doc: '选择 Element 树形下拉的节点（自动展开弹层并逐层展开折叠祖先，点击文本匹配的树节点；支持 element-plus el-tree-select 与 element-ui 组合方案）。args.value=目标节点可见文本',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) throw new Error('树形选择缺少 args.value（节点可见文本）');
          if (!el.closest('.el-select')) throw new Error('目标元素不属于 Element 树形选择器（.el-select）');
          return await treeSelect(el, want);
        },
        // 页内后验：选中标签（element-plus 回显 label）或 input.value（element-ui 组合方案）与期望一致
        verify(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) return false;
          const sel = el.closest('.el-select');
          if (!sel) return false;
          for (const it of sel.querySelectorAll('.el-select__selected-item')) {
            if ((it.textContent || '').trim() === want) return true;
          }
          for (const inp of sel.querySelectorAll('input')) {
            if ((inp.value || '').trim() === want) return true;
          }
          return false;
        },
      },
    },
  };
})()
