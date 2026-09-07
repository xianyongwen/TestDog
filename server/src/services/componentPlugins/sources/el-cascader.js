/**
 * 内置插件：Element（element-ui / element-plus）级联选择器（Cascader）适配。
 *
 * 槽位：detect（.el-cascader 根）/ candidates（placeholder + 表单行 label 收割；el-cascader
 * 不透传 id）/ annotate（级联操作指引）/ actions.select（复用 select 词表）。
 *
 * select 闭环：先收起所有残留弹层再全新打开（可见弹层是全局的，多控件页面会撞别处残留）→
 * 按列下标逐级导航（节点语义实测：父节点 aria-haspopup=true、展开态 = in-active-path 类 +
 * aria-expanded=true）→ 末级：单选点节点即选中并自动收起；多选须点节点内 label.el-checkbox
 * （点节点文字不勾选——实测；勾父级 = 全选子级），勾选后面板保持打开，动作内派发 document
 * mousedown/mouseup 收起。args.value=完整路径「A / B / C」（与回显格式一致）或第一级选项文本。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  function cascaderRoot(el) {
    return el.closest('.el-cascader');
  }

  // 可见弹层：el-popper 关闭时带 aria-hidden="true"（过渡动画期间仍有渲染框，靠它兜住）
  function visibleDropdown() {
    for (const d of document.querySelectorAll('.el-cascader__dropdown')) {
      if (d.getClientRects().length > 0 && d.closest('[aria-hidden="true"]') == null) return d;
    }
    return null;
  }

  function columns(dropdown) {
    return Array.from(dropdown.querySelectorAll('.el-cascader-menu'));
  }

  function findNode(col, label) {
    for (const node of col.querySelectorAll('.el-cascader-node')) {
      if (((node.querySelector('.el-cascader-node__label') || node).textContent || '').trim() === label) return node;
    }
    return null;
  }

  function columnLabels(col) {
    return Array.from(col.querySelectorAll('.el-cascader-node'))
      .map((node) => ((node.querySelector('.el-cascader-node__label') || node).textContent || '').trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  // 关闭其他残留弹层（document 级 mousedown/mouseup 命中 clickoutside）
  async function closeLeftovers() {
    for (let i = 0; i < 3 && visibleDropdown(); i++) {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await sleep(150);
    }
  }

  async function openDropdown(editor) {
    await closeLeftovers();
    const input = editor.querySelector('input') || editor;
    // 已持有焦点时（如刚提交过）focus 不再触发开面板、click 被 toggle 抵消——先失焦重置
    if (document.activeElement === input && typeof input.blur === 'function') input.blur();
    input.focus();
    input.click();
    return window.__ttPickWait(visibleDropdown, 5000);
  }

  async function selectPath(el, labels) {
    const editor = cascaderRoot(el) || el;
    const dropdown = await openDropdown(editor);
    // 按列下标导航：第 i 段在第 i 列匹配。展开态 = in-active-path 类 / aria-expanded=true——
    // 只点「不在激活路径」的节点，等它进入激活路径且第 i+1 列渲染完成（轮询内重新查询防节点替换）
    for (let i = 0; i < labels.length; i++) {
      const isLast = i === labels.length - 1;
      const col = columns(dropdown)[i];
      if (!col) throw new Error(`级联弹层缺少第 ${i + 1} 列（前置层级未展开）`);
      const node = findNode(col, labels[i]);
      if (!node) {
        throw new Error(`级联第 ${i + 1} 级未找到「${labels[i]}」（当前层可选：${columnLabels(col).join(' / ') || '无'}）。请从当前层级选取或修正完整路径`);
      }
      if (isLast) {
        // 末级：多选须点节点内 checkbox（点文字不勾选），面板保持打开由收尾统一收起；
        // 单选点节点即选中并自动收起
        const multiple = !!col.querySelector('.el-cascader-node label.el-checkbox');
        const cb = node.querySelector('label.el-checkbox');
        (multiple && cb ? cb : node).click();
        await sleep(180);
        return { dropdown, multiple, node };
      }
      if (!node.classList.contains('in-active-path')) {
        node.click();
        const ready = await window.__ttPickWait(() => {
          const col0 = columns(dropdown)[i];
          const it = col0 && findNode(col0, labels[i]);
          return it && it.classList.contains('in-active-path') && columns(dropdown)[i + 1] ? columns(dropdown)[i + 1] : null;
        }, 5000).catch(() => null);
        if (!ready) throw new Error(`展开「${labels[i]}」的子级超时（可能为异步加载失败或该节点无子级）`);
      }
    }
    throw new Error('级联路径为空');
  }

  return {
    detect(el) {
      return !!el.closest('.el-cascader');
    },
    candidates(el) {
      const root = el.closest('.el-cascader');
      if (!root) return [];
      const out = [];
      const input = root.querySelector('input');
      // 表单行 label 收割（组件范围内）
      const item = el.closest('.el-form-item');
      const labelEl = item && (item.querySelector('.el-form-item__label label') || item.querySelector('.el-form-item__label'));
      const text = ((labelEl && labelEl.textContent) || '').replace(/[:：\s]+$/g, '').replace(/\s+/g, '').trim();
      const ph = input ? input.getAttribute('placeholder') : null;
      if (ph) out.push({ strategy: 'placeholder', value: ph });
      if (text) out.push({ strategy: 'label', value: text });
      return out;
    },
    annotate(el) {
      const root = el.closest('.el-cascader');
      if (!root) return '';
      const input = root.querySelector('input');
      return `Element 级联选择器（非原生 select 勿 fill；用 select 动作，value 传完整路径「A / B / C」），当前值: ${(input && input.value) || '(空)'}`;
    },
    actions: {
      select: {
        doc: '在 Element（element-ui / element-plus）级联选择器中选择选项（自动开弹层并逐级展开、点选目标路径；多选模式勾选后自动收起弹层）。args.value=完整路径「A / B / C」（与回显格式一致）或第一级选项文本',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) throw new Error('级联选择缺少 args.value（完整路径「A / B / C」）');
          const root = cascaderRoot(el);
          if (!root) throw new Error('目标元素不属于 Element 级联选择器（.el-cascader）');
          if (root.classList.contains('is-disabled')) throw new Error('级联选择器处于禁用状态，无法选择');
          const labels = want.split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
          if (!labels.length) throw new Error(`无法解析 args.value：${want}（请传完整路径「A / B / C」）`);
          const { dropdown, multiple, node } = await selectPath(root, labels);
          const multipleMode = multiple || !!dropdown.querySelector('.el-cascader-node label.el-checkbox');
          if (multipleMode) {
            // 轮询内重新查询勾选态（Vue 重渲染会替换节点，捕获引用会失联）
            const checked = await window.__ttPickWait(() => {
              const col0 = columns(dropdown)[labels.length - 1];
              const it = col0 && findNode(col0, labels[labels.length - 1]);
              const c = it && it.querySelector('label.el-checkbox');
              return c && c.querySelector('.el-checkbox__input.is-checked, .el-checkbox__input.is-indeterminate') ? c : null;
            }, 1500).catch(() => null);
            if (!checked) {
              throw new Error(`「${labels[labels.length - 1]}」勾选未生效（可能被禁用），请检查选项状态`);
            }
            // 多选勾选后面板不自动收起：派发外部点击收起（动作内闭环），并等真正收起
            // （离场动画期间渲染框仍在，返回过快会被后验/后续步骤当成弹层残留）
            for (let i = 0; i < 3 && visibleDropdown(); i++) {
              document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              await sleep(200);
            }
            return `已在级联中勾选：${labels.join(' / ')}（多选模式已收起弹层）`;
          }
          // 单选：等面板收起（离场动画期间渲染框仍在），仍未关说明中间层级未被提交
          let closed = false;
          for (let i = 0; i < 8; i++) {
            if (!visibleDropdown()) { closed = true; break; }
            await sleep(150);
          }
          if (!closed) {
            throw new Error(`「${labels[labels.length - 1]}」是中间层级且组件未开启 changeOnSelect，无法作为最终选中项；请传到叶子层级的完整路径（如 A / B / C）`);
          }
          return `已在级联中选择：${labels.join(' / ')}`;
        },
        // 页内后验：回显与期望一致（单选 input 回显完整路径「A / B / C」；多选 input 为空，
        // 路径显示在 .el-cascader__tags 的 tag 内，tag 文本为完整路径——按末级或全路径任一命中）
        verify(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) return false;
          const root = cascaderRoot(el);
          if (!root) return false;
          const lastLabel = want.split(/\s+\/\s+/).pop();
          const hit = (t) => t === want || t === lastLabel || t.split(/\s*\/\s*/).includes(lastLabel);
          const input = root.querySelector('input');
          if (hit(((input && input.value) || '').trim())) return true;
          for (const tag of root.querySelectorAll('.el-cascader__tags .el-tag')) {
            if (hit(((tag.querySelector('.el-tag__content') || tag).textContent || '').trim())) return true;
          }
          return false;
        },
      },
    },
  };
})()
