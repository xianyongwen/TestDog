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
 *
 * antd v5/v6 双版本兼容：v6 重构了触发器 DOM——无 .ant-select-selector（开弹层回退根节点）、
 * 选中回显由 .ant-select-selection-item 改为 .ant-select-content（选中态含
 * ant-select-content-has-value，placeholder 独立为 .ant-select-placeholder）。
 * 弹层归属：复用已开弹层前经 aria-controls/aria-owns 校验弹层属于当前触发器，他人残留
 * 先经 clickoutside 收起再全新打开（避免读到其它字段的选项清单并点错值）。
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

  // 弹层归属：触发器 input 的 aria-controls/aria-owns 指向弹层内 listbox（rc-select 展开时
  // 才设置，antd v5/v6 同机制）。不归属的弹层是其它字段的残留——复用会让选项清单/点选落到
  // 错误字段上（真实案例：规模弹层未关，状态下拉的 select 读到规模选项清单并误报）。
  function dropdownOwned(editor, dropdown) {
    const input = editor.querySelector('input');
    const ac = input && (input.getAttribute('aria-controls') || input.getAttribute('aria-owns'));
    if (!ac) return false;
    const esc = (window.CSS && CSS.escape) ? CSS.escape(ac) : ac.replace(/([^\w-])/g, '\\$1');
    return !!dropdown.querySelector('#' + esc);
  }

  // 残留他人弹层收起：document 级合成 mousedown 的 clickoutside 对 antd 弹层不可靠
  // （Modal 内实测收不掉，Escape 合成键亦无效），改为定位弹层归属的触发器——弹层内
  // listbox 的 id 必与其归属 input 的 aria-controls/aria-owns 一致（仅展开时设置）——
  // 对归属触发器再 mousedown 一次，借 rc-select toggle 语义收起它自己的弹层。
  async function closeForeignDropdowns() {
    for (let i = 0; i < 3; i++) {
      const dropdown = itemDropdown();
      if (!dropdown) return;
      const listEl = dropdown.querySelector('[id]');
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
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); // 无归属信息时 clickoutside 兜底
      }
      await sleep(200);
    }
  }

  async function selectOption(el, want, index) {
    const editor = el.closest('.ant-select') || el.closest('.ant-select-selector') || el;
    const selectorEl = editor.querySelector('.ant-select-selector') || editor;
    // 弹层已开且归属本控件则复用（重复 mousedown 会先收起，导致等待弹层超时）；
    // 他人残留先收起再全新打开
    let dropdown = itemDropdown();
    if (dropdown && !dropdownOwned(editor, dropdown)) {
      await closeForeignDropdowns();
      dropdown = null;
    }
    if (!dropdown) {
      selectorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      selectorEl.click();
      dropdown = await window.__ttPickWait(itemDropdown, 5000);
    }
    const selectable = (it) => {
      const r = it.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(it).visibility !== 'hidden'
        && !it.classList.contains('ant-select-item-option-disabled') && it.getAttribute('aria-disabled') !== 'true';
    };
    const options = Array.from(dropdown.querySelectorAll('.ant-select-item-option')).filter(selectable);
    // 虚拟列表恢复滚动位置时先回顶部，避免把当前视窗首项误当作列表第一项。
    if (index != null) {
      const scroller = dropdown.querySelector('.rc-virtual-list-holder');
      if (scroller && scroller.scrollTop) { scroller.scrollTop = 0; scroller.dispatchEvent(new Event('scroll')); await sleep(150); }
    }
    let target = index != null
      ? Array.from(dropdown.querySelectorAll('.ant-select-item-option')).filter(selectable)[index]
      : options.find(it => it.getAttribute('title') === want || (it.textContent || '').trim() === want);
    if (index != null && target) want = (target.textContent || '').trim();
    if (!target) {
      const all = Array.from(dropdown.querySelectorAll('.ant-select-item-option'))
        .slice(0, 10)
        .map((it) => (it.textContent || '').trim())
        .filter(Boolean);
      throw new Error(`下拉选项未找到：${index != null ? "index=" + index : want}（当前可选：${all.join(' / ') || '无'}）。请从当前可选列表中选取，或修正选项文本。`);
    }
    if (!want) throw new Error('选项文本为空，无法保存可回放的选择动作');
    target.click();
    await sleep(150);
    // 多选模式选中后弹层不自动收起：再点一次触发器收起，避免遮挡后续表单操作（下次调用会重新展开）
    if (editor.classList.contains('ant-select-multiple')) {
      selectorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      selectorEl.click();
      await sleep(150);
      return index != null ? { status: 'success', message: `已选择下拉选项：${want}（多选模式已收起弹层）`, resolvedValue: want } : `已选择下拉选项：${want}（多选模式已收起弹层）`;
    }
    return index != null ? { status: 'success', message: `已选择下拉选项：${want}`, resolvedValue: want } : `已选择下拉选项：${want}`;
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
        // 选中回显读值 v5/v6 双类名：v5 为 .ant-select-selection-item，v6 为 .ant-select-content（选中态含 -has-value）
        const value = sel.querySelector('.ant-select-selection-item, .ant-select-content.ant-select-content-has-value');
        return `Ant Design 下拉（非原生 select，勿对其 fill/selectOption；选项弹层为 .ant-select-dropdown；用 select 动作），当前值: ${(value && value.textContent) || '(空)'}`;
      }
      return '';
    },
    actions: {
      // select：统一选择动作。分发器按优先级候选：插件链（本插件，preset 序）→ 原生 selectOption 兜底
      select: {
        doc: '在 Ant Design 下拉中选择选项（自动打开弹层并点击文本/标题匹配项）。args.value=选项可见文本；或 args.index（0 起）选择当前可见且未禁用的第 N 项',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          if (!want && args?.index == null) throw new Error('下拉选择缺少 args.value（选项文本），按序选择请传 args.index（0 起）');
          if (args?.index != null && (!Number.isInteger(args.index) || args.index < 0)) throw new Error('args.index 必须为非负整数（0 起）');
          if (!el.closest('.ant-select')) throw new Error('目标元素不属于 Ant Design 下拉（.ant-select）');
          // 误派保护：树形/级联触发器同为 .ant-select，快速失败交给专职插件的 select 动作
          // （省去打开弹层后发现无选项而等待超时的 5s 链路损耗）
          if (el.closest('.ant-cascader')) throw new Error('目标是 Ant Design 级联选择器（.ant-cascader），由 ant-cascader 插件的 select 动作处理');
          if (el.closest('.ant-tree-select')) throw new Error('目标是 Ant Design 树形选择器（.ant-tree-select），由 ant-tree-select 插件的 select 动作处理');
          return await selectOption(el, want, args?.index);
        },
        // 页内后验：选中标签与期望一致（单选/多选的选中项均为 .ant-select-selection-item；
        // v6 重构为 .ant-select-content，选中态含 -has-value，文本直挂 content div）
        verify(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) return false;
          const sel = el.closest('.ant-select');
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
