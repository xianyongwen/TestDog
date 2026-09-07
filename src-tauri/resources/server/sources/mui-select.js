/**
 * 内置插件：Material-UI 下拉选择适配（Select 非原生下拉 + Autocomplete 自动补全）。
 *
 * 槽位：detect（[role=combobox]——Select 根与 Autocomplete 输入框同锚，NativeSelect 是
 * 原生 <select> 无此 role 天然排除，由分发器原生层兜底）/ candidates（role=combobox 带
 * InputLabel 可访问名 + placeholder + 根 id css）/ annotate（变体区分 + 「勿 fill」）/
 * actions.select（Select：点开 listbox 点匹配项；Autocomplete：输入过滤后点匹配项）。
 *
 * DOM 契约（mui 5.16 实测）：Select 菜单 portal 到 body（MuiMenu-paper > ul[role=listbox] >
 * li[role=option] 带 data-value），关闭即卸载；选中值回显在 .MuiSelect-select 文本（及表单
 * 隐藏 input）；Autocomplete 弹层 ul.MuiAutocomplete-listbox，输入过滤后选项匹配。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // el 是否 MUI Select（role=combobox 落在 .MuiSelect-select 展示层自身，id 同落于此）
  function selectRoot(el) {
    const root = el.closest('[role="combobox"]');
    if (!root) return null;
    return (root.matches('.MuiSelect-select') || root.querySelector('.MuiSelect-select')) ? root : null;
  }
  // el 是否 Autocomplete（其输入框也带 role=combobox）
  function autoCompleteRoot(el) {
    return el.closest('.MuiAutocomplete-root');
  }
  function comboboxEl(el) {
    return el.matches?.('[role="combobox"]') ? el : el.closest('[role="combobox"]');
  }

  // 可见的 listbox（Select 菜单与 Autocomplete 弹层共用 role=listbox；portal 到 body，
  // 关闭即卸载，取可见者）
  function visibleListbox() {
    for (const ul of document.querySelectorAll('ul[role="listbox"]')) {
      if (ul.getBoundingClientRect().height > 0) return ul;
    }
    return null;
  }

  // 打开 Select 弹层：MUI SelectInput 在 onMouseDown 开菜单——真实点击优先（pw 桥），
  // 桥未注入退化合成事件（须发 mousedown 序列，仅 click 不触发 React onMouseDown）
  async function openSelectMenu(root) {
    if (typeof window.__ttPwRpc === 'function') {
      const r = root.getBoundingClientRect();
      await window.__ttPw.page.mouse.click(r.left + r.width / 2, r.top + r.height / 2, { timeout: 3000 });
      return;
    }
    root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    root.click();
  }

  // React 受控输入赋值：直接改 value 会被 React 的 value tracker 吞掉 onChange，
  // 须用原生 setter 写值后再派发 input 事件（testing-library 同款手法）
  function setNativeValue(input, value) {
    const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 在可见 listbox 中找文本/值匹配的选项
  function findOption(ul, want) {
    return Array.from(ul.querySelectorAll('li[role="option"]'))
      .find((li) => (li.textContent || '').trim() === want || li.getAttribute('data-value') === want);
  }

  return {
    // Select 根与 Autocomplete 输入框都锚 [role=combobox]；NativeSelect 无此 role 天然排除
    detect(el) {
      if (selectRoot(el)) return true;
      const ac = autoCompleteRoot(el);
      return !!(ac && comboboxEl(el));
    },
    candidates(el) {
      const out = [];
      const root = selectRoot(el);
      if (root) {
        // 1) combobox 语义候选：可访问名取 InputLabel（aria-labelledby 关联）文本
        const labelledby = root.getAttribute('aria-labelledby');
        const label = labelledby ? document.getElementById(labelledby) : null;
        const name = ((label && label.textContent) || '').trim();
        out.push({ strategy: 'role', value: 'combobox', role: 'combobox', ...(name ? { name } : {}) });
        // 2) 根 id css 候选
        if (root.id) out.push({ strategy: 'css', value: '#' + root.id });
        return out;
      }
      const ac = autoCompleteRoot(el);
      if (ac) {
        const input = ac.querySelector('input');
        // 1) placeholder 候选（Autocomplete 输入框）
        const ph = input?.getAttribute('placeholder');
        if (ph) out.push({ strategy: 'placeholder', value: ph });
        // 2) MuiInputLabel 文本
        const label = ac.querySelector('.MuiFormLabel-root, .MuiInputLabel-root');
        const text = ((label && label.textContent) || '').replace(/[:：\s]+$/g, '').trim();
        if (text) out.push({ strategy: 'label', value: text });
      }
      return out;
    },
    annotate(el) {
      if (selectRoot(el)) {
        return 'MUI Select 下拉（非原生 select，勿对其 fill；点开 listbox 选项弹层；用 select 动作）';
      }
      if (autoCompleteRoot(el) && comboboxEl(el)) {
        return 'MUI Autocomplete 自动补全（可输入过滤；用 select 动作输入并选中匹配项）';
      }
      return '';
    },
    actions: {
      select: {
        doc: '在 MUI Select 下拉或 Autocomplete 中选择选项（Select 点开弹层点匹配项；Autocomplete 输入过滤后选中）。args.value=选项可见文本',
        preferFill: false, // Select 根非输入框 fill 不可行；Autocomplete 的输入由动作内闭环
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) throw new Error('下拉选择缺少 args.value（选项文本）');
          const ac = autoCompleteRoot(el);
          if (ac) {
            // Autocomplete：输入过滤 → 等匹配项出现 → 点击选中
            const input = ac.querySelector('input[role="combobox"]') || ac.querySelector('input');
            if (!input) throw new Error('未找到 Autocomplete 输入框');
            input.focus();
            setNativeValue(input, want);
            let option = null;
            try {
              await window.__ttPickWait(() => {
                const ul = visibleListbox();
                option = ul ? findOption(ul, want) : null;
                return !!option;
              }, 4000);
            } catch (e) {
              const ul = visibleListbox();
              const opts = ul ? Array.from(ul.querySelectorAll('li[role="option"]')).map((li) => (li.textContent || '').trim()) : [];
              throw new Error('Autocomplete 选项未找到：' + want + '（当前可选：' + opts.join(' / ') + '）');
            }
            option.click();
            await sleep(150);
            return '已在 Autocomplete 中选择：' + want;
          }
          const root = selectRoot(el);
          if (!root) throw new Error('目标元素不属于 MUI Select / Autocomplete（role=combobox）');
          // Select：已展开（aria-expanded=true）复用，否则点击展开
          if (root.getAttribute('aria-expanded') !== 'true') {
            await openSelectMenu(root);
            await window.__ttPickWait(visibleListbox, 5000);
          }
          const ul = visibleListbox();
          if (!ul) throw new Error('Select 弹层未展开（listbox 不可见）');
          const option = findOption(ul, want);
          if (!option) {
            const opts = Array.from(ul.querySelectorAll('li[role="option"]')).map((li) => (li.textContent || '').trim());
            throw new Error('下拉选项未找到：' + want + '（当前可选：' + opts.join(' / ') + '）。请从当前可选列表中选取，或修正选项文本。');
          }
          option.click();
          await sleep(150);
          return '已选择下拉选项：' + want;
        },
        // 后验：Select 校验回显文本/表单隐藏值；Autocomplete 校验输入框值
        verify(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) return false;
          const ac = autoCompleteRoot(el);
          if (ac) {
            const input = ac.querySelector('input');
            return !!input && (input.value || '').trim() === want;
          }
          const root = selectRoot(el);
          if (!root) return false;
          const display = root.matches('.MuiSelect-select') ? root : root.querySelector('.MuiSelect-select');
          if (display && (display.textContent || '').trim() === want) return true;
          for (const inp of root.querySelectorAll('input[type="hidden"]')) {
            if ((inp.value || '') === want) return true;
          }
          return false;
        },
      },
    },
  };
})()
