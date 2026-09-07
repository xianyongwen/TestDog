/**
 * 示例：Element Plus 日期选择器适配插件（对平台 fixtures/element-plus.html 验收）。
 * 能力：候选增强 + set_date 步骤动作（fill 优先，失败走面板导航翻页点击）。
 * 验收：npx tsx scripts/pluginHarness.ts element-plus ./element-plus-datepicker.js --probe
 */
(() => {
  return {
    detect(el) {
      return !!el.closest('.el-date-editor, .el-picker-panel');
    },
    candidates(el) {
      const out = [];
      const item = el.closest('.el-form-item');
      const labelEl = item && item.querySelector('.el-form-item__label');
      const text = ((labelEl && labelEl.textContent) || '').replace(/[:：\s]+$/g, '').replace(/\s+/g, '').trim();
      const input = el.tagName === 'INPUT' ? el : null;
      const ph = input && input.getAttribute('placeholder');
      if (ph) out.push({ strategy: 'placeholder', value: ph });
      if (text) out.push({ strategy: 'label', value: text });
      return out;
    },
    annotate(el) {
      if (el.closest('.el-date-editor')) return 'Element Plus 日期选择器：优先直接 fill 日期文本 + Enter';
      return '';
    },
    actions: {
      set_date: {
        doc: '设置 Element Plus 日期。args.value=YYYY-MM-DD（如 2026-05-04）。fill 优先，失败走面板导航翻页点击对应日期格。',
        preferFill: true,
        async fn(el, args) {
          const dateText = String(args?.value || '').trim();
          const m = dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
          if (!m) throw new Error('set_date 需要 YYYY-MM-DD 格式日期，收到：' + dateText);
          const year = Number(m[1]);
          const month = Number(m[2]);
          const day = Number(m[3]);
          const editor = el.closest('.el-date-editor') || el;
          const input = editor.querySelector('input') || editor;
          input.click();
          const panel = await window.__ttPickWait(() => {
            for (const p of document.querySelectorAll('.el-picker-panel')) {
              if (p.offsetParent !== null && p.querySelector('.el-date-table')) return p;
            }
            return null;
          }, 5000);
          // 翻页闭环（步数与「今天」相关，必须页内解决）：对齐头部年/月
          for (let i = 0; i < 400; i++) {
            const labels = panel.querySelectorAll('.el-date-picker__header-label');
            const cy = labels[0] ? parseInt(labels[0].textContent, 10) : NaN;
            const cm = labels[1] ? parseInt(labels[1].textContent, 10) : NaN;
            if (cy === year && cm === month) break;
            if (isNaN(cy) || isNaN(cm)) break;
            const btn = panel.querySelector(
              cy !== year
                ? (cy > year ? '.el-date-picker__prev-btn.d-arrow-left' : '.el-date-picker__next-btn.d-arrow-right')
                : (cm > month ? '.el-date-picker__prev-btn.arrow-left' : '.el-date-picker__next-btn.arrow-right'),
            );
            if (!btn) throw new Error('找不到翻页按钮');
            btn.click();
            await new Promise((r) => setTimeout(r, 60));
          }
          // 点击当月目标日（排除前后月溢出格）
          let target = null;
          for (const td of panel.querySelectorAll('.el-date-table td.available')) {
            if (td.classList.contains('prev-month') || td.classList.contains('next-month')) continue;
            const cell = td.querySelector('.el-date-table-cell__text');
            if (cell && parseInt(cell.textContent, 10) === day) { target = td; break; }
          }
          if (!target) throw new Error('面板中未找到日期：' + dateText);
          (target.querySelector('.el-date-table-cell__text') || target).click();
          await new Promise((r) => setTimeout(r, 150));
          return '已设置日期：' + dateText;
        },
      },
    },
  };
})()
