/**
 * 示例：Ant Design 下拉适配插件（对平台 fixtures/antd.html 验收）。
 * 能力：候选增强（Select 语义 + 表单 label 收割）+ select 步骤动作。
 * 验收：npx tsx scripts/pluginHarness.ts antd ./antd-select.js --probe
 */
(() => {
  return {
    detect(el) {
      return !!el.closest('.ant-select, .ant-select-dropdown');
    },
    candidates(el) {
      const out = [];
      const item = el.closest('.ant-form-item');
      const labelEl = item && (item.querySelector('.ant-form-item-label label') || item.querySelector('.ant-form-item-label'));
      const text = ((labelEl && labelEl.textContent) || '').replace(/\s+/g, '').trim();
      const inSelect = el.closest('.ant-select') && !el.closest('.ant-select-dropdown');
      if (inSelect) out.push({ strategy: 'role', value: 'combobox', role: 'combobox', ...(text ? { name: text } : {}) });
      const input = el.tagName === 'INPUT' ? el : null;
      const ph = input && input.getAttribute('placeholder');
      if (ph) out.push({ strategy: 'placeholder', value: ph });
      if (text) out.push({ strategy: 'label', value: text });
      // 弹层内选项：scope 锚定可见弹层
      if (el.closest('.ant-select-dropdown') && el.classList.contains('ant-select-item-option')) {
        out.push({ strategy: 'text', value: (el.textContent || '').trim(), scope: { strategy: 'css', value: '.ant-select-dropdown:not(.ant-select-dropdown-hidden)' } });
      }
      return out;
    },
    annotate(el) {
      const sel = el.closest('.ant-select');
      if (sel) {
        const v = sel.querySelector('.ant-select-selection-item');
        return 'Ant Design 下拉（非原生 select），当前值: ' + ((v && v.textContent) || '(空)');
      }
      return '';
    },
    actions: {
      select: {
        doc: '在 Ant Design 下拉中选择选项。args.value=选项可见文本（如 "已删除"）',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) throw new Error('select 缺少 args.value');
          const editor = el.closest('.ant-select') || el;
          const trigger = editor.querySelector('.ant-select-selector') || editor;
          trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          trigger.click();
          const dropdown = await window.__ttPickWait(() => {
            for (const d of document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')) {
              if (d.querySelector('.ant-select-item')) return d;
            }
            return null;
          }, 5000);
          let target = dropdown.querySelector('.ant-select-item-option[title="' + want.replace(/"/g, '\\"') + '"]');
          if (!target) {
            for (const it of dropdown.querySelectorAll('.ant-select-item-option')) {
              if ((it.textContent || '').trim() === want) { target = it; break; }
            }
          }
          if (!target) throw new Error('下拉选项未找到：' + want);
          target.click();
          await new Promise((r) => setTimeout(r, 150));
          return '已选择下拉选项：' + want;
        },
      },
    },
  };
})()
