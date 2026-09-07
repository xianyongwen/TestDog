/**
 * 内置插件：Ant Design 级联选择器（Cascader）适配。
 *
 * 槽位：detect（.ant-cascader 根，触发器同时含 .ant-select，下拉/树形插件先试、本插件兜底）/
 * candidates（input id 收敛 + 表单行 label 收割；combobox 语义候选由 ant-select 插件产出，
 * 此处不重复）/ annotate（级联操作指引）/ actions.select（复用 select 词表）。
 *
 * select 闭环：开弹层 → 逐级按 title 精确匹配展开（每列点完等下一列渲染，天然兼容
 * loadData 异步加载）→ 末级点击（单选=选中并自动关面板；多选=勾选其 checkbox，父级勾选
 * 即全选子级）→ 多选勾选后面板保持打开，动作内再点触发器收起。rc-cascader 源码证实：
 * multiple 模式选择后面板永不自动关闭；单选叶子点击才 toggleOpen(false)。
 * args.value=完整路径「A / B / C」（与回显格式一致）或第一级选项文本；中间层级未开
 * changeOnSelect 时如实报错。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  function cascaderRoot(el) {
    return el.closest('.ant-cascader');
  }

  // 当前可见的级联弹层（关闭后 antd 会从 DOM 移除，隐藏类 + 渲染框双检）
  function visibleDropdown() {
    for (const d of document.querySelectorAll('.ant-cascader-dropdown')) {
      if (!d.classList.contains('ant-select-dropdown-hidden') && d.getClientRects().length > 0) return d;
    }
    return null;
  }

  function columns(dropdown) {
    return Array.from(dropdown.querySelectorAll('.ant-cascader-menu'));
  }

  function findItem(col, label) {
    for (const it of col.querySelectorAll('.ant-cascader-menu-item')) {
      if ((it.getAttribute('title') || '').trim() === label) return it;
    }
    return null;
  }

  function columnLabels(col) {
    return Array.from(col.querySelectorAll('.ant-cascader-menu-item'))
      .map((it) => (it.getAttribute('title') || '').trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  async function openDropdown(editor) {
    // 残留弹层（本控件此前未关的、或同页其他控件的）先统一收起再全新打开——
    // rc-cascader 列状态由当前激活路径派生，全新打开保证导航确定性；document 级
    // 合成 mousedown 命中 clickoutside 关闭（弹层无 id 可锚定，归属靠「先关后开」）
    for (let i = 0; i < 3 && visibleDropdown(); i++) {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await sleep(150);
    }
    const selectorEl = editor.querySelector('.ant-select-selector') || editor;
    selectorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selectorEl.click();
    return window.__ttPickWait(visibleDropdown, 5000);
  }

  async function closeDropdown(editor) {
    const selectorEl = editor.querySelector('.ant-select-selector') || editor;
    selectorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selectorEl.click();
    // 等真正收起（离场动画期间渲染框仍在，返回过快会被后验/后续步骤当成弹层残留）
    for (let i = 0; i < 10; i++) {
      if (!visibleDropdown()) return;
      await sleep(150);
    }
  }

  async function selectPath(el, labels) {
    const editor = cascaderRoot(el) || el;
    const dropdown = await openDropdown(editor);
    // 按列下标导航：第 i 段在第 i 列匹配。展开态以 -expand 类为真值——
    // 只点「未展开」的项（点已展开项会 toggle 收起），等它变为 -expand 即子列就绪
    // （同列兄弟切换、部分展开复用、fresh 打开三种场景统一；loadData 异步列同样被等待覆盖）
    for (let i = 0; i < labels.length; i++) {
      const isLast = i === labels.length - 1;
      const col = columns(dropdown)[i];
      if (!col) throw new Error(`级联弹层缺少第 ${i + 1} 列（前置层级未展开）`);
      const item = findItem(col, labels[i]);
      if (!item) {
        throw new Error(`级联第 ${i + 1} 级未找到「${labels[i]}」（当前层可选：${columnLabels(col).join(' / ') || '无'}）。请从当前层级选取或修正完整路径`);
      }
      if (isLast) {
        // 末级：单选点项即选中并关面板；多选勾其 checkbox（面板保持打开，收尾统一收起）
        const multiple = !!dropdown.querySelector('.ant-cascader-checkbox');
        const cb = item.querySelector('.ant-cascader-checkbox');
        (multiple && cb ? cb : item).click();
        await sleep(180);
        return { dropdown, multiple, item };
      }
      // 类名语义（实测）：-expand = 有子级（父项常驻，与是否展开无关）；-active = 当前激活路径
      if (!item.classList.contains('ant-cascader-menu-item-active')) {
        item.click();
        // 等待「项进入激活路径 && 第 i+1 列已渲染」双条件（-active 先于新列渲染一帧更新；
        // 轮询内重新查询，规避 React 重渲染替换节点导致引用失联）
        const ready = await window.__ttPickWait(() => {
          const col0 = columns(dropdown)[i];
          const it = col0 && findItem(col0, labels[i]);
          return it && it.classList.contains('ant-cascader-menu-item-active') && columns(dropdown)[i + 1] ? columns(dropdown)[i + 1] : null;
        }, 5000).catch(() => null);
        if (!ready) throw new Error(`展开「${labels[i]}」的子级超时（可能为异步加载失败或该节点无子级）`);
      }
    }
    throw new Error('级联路径为空');
  }

  return {
    detect(el) {
      return !!el.closest('.ant-cascader');
    },
    candidates(el) {
      const root = el.closest('.ant-cascader');
      if (!root) return [];
      const out = [];
      const input = root.querySelector('input');
      // 表单行 label 收割（组件范围内）
      const item = el.closest('.ant-form-item');
      const labelEl = item && (item.querySelector('.ant-form-item-label label') || item.querySelector('.ant-form-item-label'));
      const text = ((labelEl && labelEl.textContent) || '').replace(/[:：\s]+$/g, '').replace(/\s+/g, '').trim();
      if (input && input.id) out.push({ strategy: 'css', value: `#${input.id}` });
      if (text) out.push({ strategy: 'label', value: text });
      return out;
    },
    annotate(el) {
      const root = el.closest('.ant-cascader');
      if (!root) return '';
      // 选中回显读值 v5/v6 双类名（同 ant-select）
      const value = root.querySelector('.ant-select-selection-item, .ant-select-content.ant-select-content-has-value');
      const multiple = !!root.classList.contains('ant-select-multiple');
      return `Ant Design 级联选择器（非原生 select 勿 fill；用 select 动作，value 传完整路径「A / B / C」${multiple ? '；多选模式勾选后面板不自动收起' : ''}），当前值: ${(value && value.textContent) || '(空)'}`;
    },
    actions: {
      select: {
        doc: '在 Ant Design 级联选择器中选择选项（自动开弹层并逐级展开、点选目标路径；多选模式勾选后自动收起弹层）。args.value=完整路径「A / B / C」（与回显格式一致）或第一级选项文本',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) throw new Error('级联选择缺少 args.value（完整路径「A / B / C」）');
          const root = cascaderRoot(el);
          if (!root) throw new Error('目标元素不属于 Ant Design 级联选择器（.ant-cascader）');
          if (root.classList.contains('ant-select-disabled')) throw new Error('级联选择器处于禁用状态，无法选择');
          const labels = want.split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
          if (!labels.length) throw new Error(`无法解析 args.value：${want}（请传完整路径「A / B / C」）`);
          const { dropdown, multiple, item } = await selectPath(root, labels);
          const multipleMode = multiple || !!dropdown.querySelector('.ant-cascader-checkbox');
          if (multipleMode) {
            const cb = item.querySelector('.ant-cascader-checkbox');
            if (cb && !cb.classList.contains('ant-cascader-checkbox-checked')) {
              throw new Error(`「${labels[labels.length - 1]}」勾选未生效（可能被禁用），请检查选项状态`);
            }
            await closeDropdown(root); // 多选勾选后面板不自动收起（rc-cascader 行为），动作内闭环收起
            return `已在级联中勾选：${labels.join(' / ')}（多选模式已收起弹层）`;
          }
          // 单选：等面板收起（离场动画期间渲染框仍在），仍未关说明中间层级未被提交（未开
          // changeOnSelect），如实报错
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
        // 页内后验：回显与期望一致（单选 title 为「A / B / C」；多选 tag 文本为末级 label；
        // 读值 v5/v6 双类名——v6 回显重构为 .ant-select-content，选中态含 -has-value）
        verify(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) return false;
          const root = cascaderRoot(el);
          if (!root) return false;
          const lastLabel = want.split(/\s+\/\s+/).pop();
          for (const it of root.querySelectorAll('.ant-select-selection-item, .ant-select-content.ant-select-content-has-value')) {
            const t = (it.getAttribute('title') || it.textContent || '').trim();
            if (t === want || t === lastLabel) return true;
          }
          return false;
        },
      },
    },
  };
})()
