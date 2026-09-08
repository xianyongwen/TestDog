/**
 * 内置插件：Element（element-ui / element-plus）下拉适配。
 *
 * 槽位：detect（.el-select 触发器，排除弹层）/ candidates（combobox 语义候选 + 表单行
 * label 收割）/ annotate（「勿 fill」标注）/ actions.select（click 展开 + 可见弹层内
 * 文本匹配点击；多选模式选中后自动收起弹层）。
 *
 * 树形下拉（el-tree-select / el-select+el-tree 组合，触发器侧同根类名）也由本插件
 * detect 命中以获得候选与标注；平铺 option 弹层由本插件先试，含 .el-tree 的树形弹层
 * 由排在其后的 el-tree-select 插件兜底闭环。原生 <select> 不经过插件（分发器原生层兜底）。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // el 的弹层实例常驻 body（display 控制显隐），须取当前可见且含选项的那一个
  function itemDropdown() {
    for (const d of document.querySelectorAll('.el-select-dropdown')) {
      if (d.style.display !== 'none' && d.offsetParent !== null && d.querySelector('.el-select-dropdown__item')) return d;
    }
    return null;
  }

  async function selectOption(el, want, index) {
    const editor = el.closest('.el-select') || el;
    const input = editor.querySelector('input') || editor;
    // 弹层已开则复用（重复点击会先收起，导致等待弹层超时）
    let dropdown = itemDropdown();
    if (!dropdown) {
      input.click();
      dropdown = await window.__ttPickWait(itemDropdown, 5000);
    }
    if (index != null) {
      const scroller = dropdown.querySelector('.el-select-dropdown__wrap');
      if (scroller && scroller.scrollTop) { scroller.scrollTop = 0; scroller.dispatchEvent(new Event('scroll')); await sleep(150); }
    }
    let target = null;
    let availableIndex = 0;
    for (const it of dropdown.querySelectorAll('.el-select-dropdown__item')) {
      const r = it.getBoundingClientRect();
      if ((index != null || (it.textContent || '').trim() === want) && !it.classList.contains('hidden')
        && !it.classList.contains('is-disabled') && it.getAttribute('aria-disabled') !== 'true'
        && r.width > 0 && r.height > 0 && getComputedStyle(it).visibility !== 'hidden') {
        if (index == null || availableIndex++ === index) { target = it; break; }
      }
    }
    if (index != null && target) want = (target.textContent || '').trim();
    if (!target) {
      const all = Array.from(dropdown.querySelectorAll('.el-select-dropdown__item'))
        .slice(0, 10)
        .map((it) => (it.textContent || '').trim())
        .filter(Boolean);
      throw new Error(`下拉选项未找到：${index != null ? "index=" + index : want}（当前可选：${all.join(' / ') || '无'}）。请从当前可选列表中选取，或修正选项文本。`);
    }
    if (!want) throw new Error('选项文本为空，无法保存可回放的选择动作');
    target.click();
    await sleep(150);
    // 多选模式（选中项以 el-tag 展示）选中后弹层不自动收起：再点一次输入框收起（单选 el 无 el-tag，不受影响）
    if (editor.querySelector('.el-tag')) {
      input.click();
      await sleep(150);
      return index != null ? { status: 'success', message: `已选择下拉选项：${want}（多选模式已收起弹层）`, resolvedValue: want } : `已选择下拉选项：${want}（多选模式已收起弹层）`;
    }
    return index != null ? { status: 'success', message: `已选择下拉选项：${want}`, resolvedValue: want } : `已选择下拉选项：${want}`;
  }

  return {
    // element-ui 与 element-plus 共用 .el- 前缀类名，统一适配；
    // 触发器与选项弹层共享前缀类名，排除弹层避免对 option 元素误命中
    detect(el) {
      return !!(el.closest('.el-select') && !el.closest('.el-select-dropdown'));
    },
    candidates(el) {
      const out = [];
      // 1) 表单行 label 收割（组件范围内）：下拉控件缺可访问名时，从所在表单行取 label 文本
      const item = el.closest('.el-form-item');
      const labelEl = item && item.querySelector('.el-form-item__label');
      const text = ((labelEl && labelEl.textContent) || '').replace(/[:：\s]+$/g, '').replace(/\s+/g, '').trim();
      // 2) combobox 语义候选（假控件无法原生 selectOption，语义定位优先）
      if (el.closest('.el-select') && !el.closest('.el-select-dropdown')) {
        out.push({ strategy: 'role', value: 'combobox', role: 'combobox', ...(text ? { name: text } : {}) });
      }
      if (text) out.push({ strategy: 'label', value: text });
      return out;
    },
    annotate(el) {
      if (el.closest('.el-select') && !el.closest('.el-select-dropdown')) {
        return 'Element 下拉（非原生 select，勿对其 fill/selectOption；选项弹层 .el-select-dropdown 常驻 body 靠 display 控制显隐；用 select 动作）';
      }
      return '';
    },
    actions: {
      // select：统一选择动作。分发器按优先级候选：插件链（本插件，preset 序）→ 原生 selectOption 兜底
      select: {
        doc: '在 Element（element-ui / element-plus）下拉中选择选项（自动打开弹层并点击文本匹配项）。args.value=选项可见文本；或 args.index（0 起）选择当前可见且未禁用的第 N 项',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          if (!want && args?.index == null) throw new Error('下拉选择缺少 args.value（选项文本），按序选择请传 args.index（0 起）');
          if (args?.index != null && (!Number.isInteger(args.index) || args.index < 0)) throw new Error('args.index 必须为非负整数（0 起）');
          if (!el.closest('.el-select')) throw new Error('目标元素不属于 Element 下拉（.el-select）');
          return await selectOption(el, want, args?.index);
        },
        // 页内后验：选中标签（element-plus 回显 label）或 input.value（element-ui）与期望一致
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
