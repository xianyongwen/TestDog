/**
 * 示例：自研组件适配插件（custom-badge：用户项目里的特色标签选择器）。
 * 演示：非标准组件库的 detect/candidates 写法 + 一个自定义动作（toggle 全部选中）。
 * 验收：先在 server/tests/fixtures/ 放一个含 .custom-badge-group 的最小页面，再跑
 *   npx tsx scripts/pluginHarness.ts custom-badge ./custom-badge.js --probe
 */
(() => {
  return {
    detect(el) {
      return !!el.closest('.custom-badge-group, .custom-badge');
    },
    candidates(el) {
      const out = [];
      // 徽章组：以组内文本定位单个徽章（组本身用 css 锚定）
      if (el.classList.contains('custom-badge')) {
        const text = (el.textContent || '').trim();
        if (text) {
          out.push({
            strategy: 'text',
            value: text,
            scope: { strategy: 'css', value: '.custom-badge-group' },
          });
        }
      }
      // 组容器：如需对整组操作（清空等），给容器一个可定位候选
      if (el.classList.contains('custom-badge-group') && el.dataset.field) {
        out.push({ strategy: 'css', value: '.custom-badge-group[data-field="' + el.dataset.field + '"]' });
      }
      return out;
    },
    annotate(el) {
      if (el.classList.contains('custom-badge')) {
        const active = el.classList.contains('is-active');
        return '自定义徽章选项「' + (el.textContent || '').trim() + '」，当前' + (active ? '已选中' : '未选中') + '（点击切换）';
      }
      return '';
    },
    actions: {
      // 演示：一次动作完成「按文本选中徽章」——比让模型自己 click 更稳
      pick_badge: {
        doc: '点击选中指定徽章。args.value=徽章文本（如 "紧急"）',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          const group = (el && el.closest('.custom-badge-group')) || document.querySelector('.custom-badge-group');
          if (!group) throw new Error('页面未找到 .custom-badge-group');
          let target = null;
          for (const b of group.querySelectorAll('.custom-badge')) {
            if ((b.textContent || '').trim() === want) { target = b; break; }
          }
          if (!target) {
            const all = Array.from(group.querySelectorAll('.custom-badge')).map((b) => (b.textContent || '').trim());
            throw new Error('徽章未找到：' + want + '（当前可选：' + all.join('/') + '）');
          }
          target.click();
          await new Promise((r) => setTimeout(r, 100));
          return '已选中徽章：' + want;
        },
      },
    },
  };
})()
