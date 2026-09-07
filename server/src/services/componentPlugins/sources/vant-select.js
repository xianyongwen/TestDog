/**
 * 内置插件：Vant 下拉菜单（van-dropdown-menu）适配。
 *
 * 槽位：detect（.van-dropdown-menu，排除弹层内容）/ candidates（标题文本 + 结构 css）/
 * annotate（「勿 fill」标注）/ actions.select（点标题展开 overlay 选项，文本匹配点击，
 * 选中后弹层自动收起）。
 *
 * DOM 契约（vant 4.10 实测）：弹层 .van-dropdown-item__content 就地渲染在菜单根内部
 * （非 body teleport），实例常驻靠显隐控制；选中态标记为选项格上的
 * .van-dropdown-item__option--active（标题恒显 title prop 文本（若设置），不能作回显依据）。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // 可见的弹层内容（实例常驻，须取当前展开的那一个；多菜单页可能有多个实例）
  function openContent() {
    for (const c of document.querySelectorAll('.van-dropdown-item__content')) {
      if (c.offsetParent !== null && c.getBoundingClientRect().height > 0) return c;
    }
    return null;
  }

  // 标题 → 其所属菜单（vant 将弹层渲染在菜单根内部，内容按 .van-dropdown-item 分组）
  function menus() {
    return Array.from(document.querySelectorAll('.van-dropdown-menu'));
  }

  async function selectOption(el, want) {
    const menu = el.closest('.van-dropdown-menu') || menus()[0];
    if (!menu) throw new Error('目标元素不属于 Vant 下拉菜单（.van-dropdown-menu）');

    // 1) 已有展开的弹层且含目标项 → 直接点（幂等：链上前一个插件可能已打开）
    let content = openContent();
    if (content) {
      const hit = Array.from(content.querySelectorAll('.van-dropdown-item__option'))
        .find((o) => (o.textContent || '').trim() === want);
      if (hit) {
        hit.click();
        await sleep(150);
        return `已选择下拉选项：${want}`;
      }
    }

    // 2) 未展开：点标题展开后再找（弹层 lazyRender，未打开过时选项不在 DOM，不能只查常驻节点）
    //    优先展开 el 所属菜单；目标项不在该菜单时也以其选项列表做诊断输出
    const title = menu.querySelector('.van-dropdown-menu__title');
    if (!title) throw new Error('未找到下拉菜单标题（.van-dropdown-menu__title）');
    title.click();
    content = await window.__ttPickWait(openContent, 5000);
    const opts = Array.from(content.querySelectorAll('.van-dropdown-item__option'));
    const target = opts.find((o) => (o.textContent || '').trim() === want);
    if (!target) {
      const all = opts.map((o) => (o.textContent || '').trim()).filter(Boolean);
      throw new Error(`下拉选项未找到：${want}（当前可选：${all.join(' / ') || '无'}）。请从当前可选列表中选取，或修正选项文本。`);
    }
    target.click();
    await sleep(150);
    return `已选择下拉选项：${want}`;
  }

  return {
    // 触发器侧命中；排除弹层内容（选项格共享前缀类名，避免误命中）
    detect(el) {
      return !!(el.closest('.van-dropdown-menu') && !el.closest('.van-dropdown-item__content'));
    },
    candidates(el) {
      const out = [];
      const menu = el.closest('.van-dropdown-menu');
      if (!menu) return out;
      // 1) 标题文本候选（title prop 或当前选中项文本）
      const title = menu.querySelector('.van-dropdown-menu__title');
      const text = ((title && title.textContent) || '').trim();
      if (text) out.push({ strategy: 'text', value: text });
      // 2) 结构候选：菜单标题（单菜单页面唯一）
      if (title) out.push({ strategy: 'css', value: '.van-dropdown-menu__title' });
      return out;
    },
    annotate(el) {
      if (el.closest('.van-dropdown-menu') && !el.closest('.van-dropdown-item__content')) {
        return 'Vant 下拉菜单（非原生 select，勿对其 fill；点标题展开 overlay 选项，选中后弹层自动收起；用 select 动作）';
      }
      return '';
    },
    actions: {
      select: {
        doc: '在 Vant 下拉菜单中选择选项（点标题展开 overlay 并点击文本匹配项，选中后自动收起）。args.value=选项可见文本',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) throw new Error('下拉选择缺少 args.value（选项文本）');
          return await selectOption(el, want);
        },
        // 页内后验：选中态标记（--active 选项格）与期望一致；标题恒显 title prop，不作回显依据
        verify(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) return false;
          for (const o of document.querySelectorAll('.van-dropdown-item__option--active')) {
            if ((o.textContent || '').trim() === want) return true;
          }
          return false;
        },
      },
    },
  };
})()
