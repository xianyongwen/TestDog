/**
 * 内置插件：Ant Design 下拉（Select）适配。
 *
 * 槽位：detect（.ant-select 触发器，排除弹层）/ candidates（combobox 语义候选 + 表单行
 * label 收割）/ annotate（「勿 fill」标注与当前值）/ actions.select（mousedown 触发展开 +
 * 弹层内文本/标题匹配点击；多选模式选中后自动收起弹层）。
 *
 * 树形选择器（.ant-tree-select，根节点同样含 .ant-select 类）也由本插件 detect 命中，
 * 以获得候选与标注；其 select 动作先试失败（树形弹层无 .ant-select-item 选项）后
 * 由 ant-tree-select 插件兜底闭环。原生 <select> 不经过插件（分发器原生层兜底 selectOption）。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // 可见且含选项的 antd 弹层（未 hidden；同页多个弹层实例取含选项的那个）
  function itemDropdown() {
    for (const d of document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')) {
      if (d.querySelector('.ant-select-item')) return d;
    }
    return null;
  }

  async function selectOption(el, want) {
    const editor = el.closest('.ant-select') || el.closest('.ant-select-selector') || el;
    const selectorEl = editor.querySelector('.ant-select-selector') || editor;
    // 弹层已开则复用（重复 mousedown 会先收起，导致等待弹层超时）
    let dropdown = itemDropdown();
    if (!dropdown) {
      selectorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      selectorEl.click();
      dropdown = await window.__ttPickWait(itemDropdown, 5000);
    }
    let target = dropdown.querySelector(`.ant-select-item-option[title="${want.replace(/"/g, '\\"')}"]`);
    if (!target) {
      for (const it of dropdown.querySelectorAll('.ant-select-item-option')) {
        if ((it.textContent || '').trim() === want) { target = it; break; }
      }
    }
    if (!target) {
      const all = Array.from(dropdown.querySelectorAll('.ant-select-item-option'))
        .slice(0, 10)
        .map((it) => (it.textContent || '').trim())
        .filter(Boolean);
      throw new Error(`下拉选项未找到：${want}（当前可选：${all.join(' / ') || '无'}）。请从当前可选列表中选取，或修正选项文本。`);
    }
    target.click();
    await sleep(150);
    // 多选模式选中后弹层不自动收起：再点一次触发器收起，避免遮挡后续表单操作（下次调用会重新展开）
    if (editor.classList.contains('ant-select-multiple')) {
      selectorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      selectorEl.click();
      await sleep(150);
      return `已选择下拉选项：${want}（多选模式已收起弹层）`;
    }
    return `已选择下拉选项：${want}`;
  }

  return {
    // 触发器与选项弹层共享前缀类名，排除弹层避免对 option 元素误命中
    detect(el) {
      return !!(el.closest('.ant-select') && !el.closest('.ant-select-dropdown'));
    },
    candidates(el) {
      const out = [];
      // 1) 表单行 label 收割（组件范围内）：下拉控件缺可访问名时，从所在表单行取 label 文本
      const item = el.closest('.ant-form-item');
      const labelEl = item && (item.querySelector('.ant-form-item-label label') || item.querySelector('.ant-form-item-label'));
      const text = ((labelEl && labelEl.textContent) || '').replace(/[:：\s]+$/g, '').replace(/\s+/g, '').trim();
      // 2) combobox 语义候选（假控件无法原生 selectOption，语义定位优先）
      if (el.closest('.ant-select') && !el.closest('.ant-select-dropdown')) {
        out.push({ strategy: 'role', value: 'combobox', role: 'combobox', ...(text ? { name: text } : {}) });
      }
      if (text) out.push({ strategy: 'label', value: text });
      return out;
    },
    annotate(el) {
      const sel = el.closest('.ant-select');
      if (sel && !el.closest('.ant-select-dropdown')) {
        const value = sel.querySelector('.ant-select-selection-item');
        return `Ant Design 下拉（非原生 select，勿对其 fill/selectOption；选项弹层为 .ant-select-dropdown；用 select 动作），当前值: ${(value && value.textContent) || '(空)'}`;
      }
      return '';
    },
    actions: {
      // select：统一选择动作。分发器按优先级候选：插件链（本插件，preset 序）→ 原生 selectOption 兜底
      select: {
        doc: '在 Ant Design 下拉中选择选项（自动打开弹层并点击文本/标题匹配项）。args.value=选项可见文本',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) throw new Error('下拉选择缺少 args.value（选项文本）');
          if (!el.closest('.ant-select')) throw new Error('目标元素不属于 Ant Design 下拉（.ant-select）');
          // 误派保护：树形/级联触发器同为 .ant-select，快速失败交给专职插件的 select 动作
          // （省去打开弹层后发现无选项而等待超时的 5s 链路损耗）
          if (el.closest('.ant-cascader')) throw new Error('目标是 Ant Design 级联选择器（.ant-cascader），由 ant-cascader 插件的 select 动作处理');
          if (el.closest('.ant-tree-select')) throw new Error('目标是 Ant Design 树形选择器（.ant-tree-select），由 ant-tree-select 插件的 select 动作处理');
          return await selectOption(el, want);
        },
        // 页内后验：选中标签与期望一致（单选/多选的选中项均为 .ant-select-selection-item）
        verify(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) return false;
          const sel = el.closest('.ant-select');
          if (!sel) return false;
          for (const it of sel.querySelectorAll('.ant-select-selection-item')) {
            if ((it.textContent || '').trim() === want) return true;
          }
          return false;
        },
      },
    },
  };
})()
