/**
 * 内置插件：Vant 日历（van-calendar）适配。
 *
 * 覆盖「只读 van-field 触发器 + van-calendar 月面板弹层」形态，set_date 动作：
 * 解析目标日期 → 定位目标月容器并滚入视口（月容器/标题全量渲染，日格按月惰性渲染，
 * 进入视口才挂载）→ 点目标日格 → 点确认按钮提交。
 *
 * 与 vant-picker 的链式协作：vant-picker 的 set_date 会先探测「弹层是否滚轮形态」，
 * 日历弹层无滚轮 → failed 落链到此插件，此时日历弹层已被 vant-picker 打开，直接复用。
 * 触发器侧候选（placeholder/label）由 vant-picker 统一产出，本插件不重复产出。
 *
 * DOM 契约（vant 4.10 实测+源码核对）：日历根 .van-calendar 在 .van-popup 内；月标题
 * 「YYYY年M月」（.van-calendar__month-title）；日格 .van-calendar__day（文本=日号，选中态
 * --selected）；默认 show-confirm，选格后须点 .van-calendar__confirm 提交。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // 可见的日历弹层根
  function visibleCalendar() {
    for (const c of document.querySelectorAll('.van-calendar')) {
      if (c.getBoundingClientRect().height > 0 && c.closest('.van-popup')?.getBoundingClientRect().height > 0) return c;
    }
    return null;
  }

  // el（触发器或日历内元素）→ 打开并返回可见 .van-calendar；幂等同型复用/异型报错落链
  async function openCalendar(el) {
    const opened = visibleCalendar();
    if (opened) return opened;
    // 已有非日历弹层 → 结构化报错落链，绝不点触发器（toggle 语义会收掉别人的弹层）
    const anyPopupVisible = () => {
      for (const p of document.querySelectorAll('.van-popup')) {
        if (p.getBoundingClientRect().height > 0) return p;
      }
      return null;
    };
    if (anyPopupVisible()) throw new Error('页面已有非日历弹层展开（滚轮/级联等），请由对应弹层插件处理');
    const field = el.closest('.van-field');
    const trigger = (el.tagName === 'INPUT' ? el : field?.querySelector('input')) || field;
    if (!trigger) throw new Error('找不到日历触发器（只读 van-field 或已展开日历弹层）');
    trigger.click();
    await window.__ttPickWait(visibleCalendar, 5000);
    return visibleCalendar();
  }

  // 在日历 body 内滚动直到目标月渲染；返回目标月容器，找不到/滚到头抛错
  async function scrollToMonth(cal, y, m) {
    const body = cal.querySelector('.van-calendar__body');
    if (!body) throw new Error('未找到日历滚动容器（.van-calendar__body）');
    const titleRe = new RegExp('^' + y + '年' + m + '月$');
    let lastWindow = '';
    for (let i = 0; i < 60; i++) {
      // 目标月已渲染 → 滚入视口并等日格惰性渲染完成（月容器/标题全量渲染，
      // 日格按月惰性渲染：进入视口才挂载 .van-calendar__day）
      for (const t of cal.querySelectorAll('.van-calendar__month-title')) {
        if (titleRe.test((t.textContent || '').trim())) {
          const monthEl = t.parentElement;
          monthEl.scrollIntoView({ block: 'center' });
          await window.__ttPickWait(() => monthEl.querySelectorAll('.van-calendar__day').length > 0, 3000);
          return monthEl;
        }
      }
      // 依据当前渲染窗口与目标月的比较决定滚动方向（月索引 = y*12 + m-1）
      const titles = Array.from(cal.querySelectorAll('.van-calendar__month-title'))
        .map((t) => {
          const g = (t.textContent || '').trim().match(/^(\d{4})年(\d{1,2})月$/);
          return g ? parseInt(g[1], 10) * 12 + (parseInt(g[2], 10) - 1) : null;
        })
        .filter((v) => v !== null);
      if (!titles.length) throw new Error('日历中未找到任何月份标题（.van-calendar__month-title）');
      const targetIdx = y * 12 + (m - 1);
      const first = Math.min(...titles);
      const last = Math.max(...titles);
      if (targetIdx > last) {
        body.scrollBy(0, body.clientHeight);
      } else if (targetIdx < first) {
        body.scrollBy(0, -body.clientHeight);
      } else {
        // 目标月在渲染窗口之内却未见标题（窗口化渲染间隙）——小幅滚动触发渲染
        body.scrollBy(0, 120);
        await sleep(120);
        continue;
      }
      await sleep(150);
      // stall 检测：滚动后渲染窗口无变化 → 已到边界仍未见目标月
      const win = titles.join(',');
      if (win === lastWindow) break;
      lastWindow = win;
    }
    throw new Error('日历中未能定位到 ' + y + '年' + m + '月（可能超出日历可选范围）');
  }

  // 解析目标日期为 {y, m, d}（容忍 2026-9-6 / 2026-09-06）
  function parseDate(v) {
    const g = String(v || '').trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/);
    return g ? { y: parseInt(g[1], 10), m: parseInt(g[2], 10), d: parseInt(g[3], 10) } : null;
  }

  return {
    // 弹层侧命中 .van-calendar；触发器侧命中只读 van-field（同 vant-picker 的宽进启发式，
    // 链上 vant-picker 在前，其结构探测失败后落链到此，已开的日历弹层直接复用）
    detect(el) {
      if (el.closest('.van-calendar')) return true;
      const field = el.closest('.van-field');
      return !!(field && field.querySelector('input[readonly]'));
    },
    // 触发器侧候选由 vant-picker 统一产出，本插件不重复产出；弹层内容不产出候选（实例常驻破坏唯一性）
    candidates(el) {
      return [];
    },
    annotate(el) {
      if (el.closest('.van-calendar')) {
        return 'Vant 日历面板（点日格选中，选完点「确认」提交；目标月自动滚动定位）';
      }
      return '';
    },
    actions: {
      set_date: {
        doc: '设置 Vant 日历（点目标日格选中，点确认按钮提交；目标月自动滚动定位）。args.value=YYYY-MM-DD',
        preferFill: false, // 触发器为只读输入框，fill 不可行
        async fn(el, args) {
          const want = parseDate(args?.value);
          if (!want) throw new Error('日期格式应为 YYYY-MM-DD：' + (args?.value || '(空)'));
          const cal = await openCalendar(el);
          const monthEl = await scrollToMonth(cal, want.y, want.m);
          // 目标日格：文本精确等于日号，过滤禁用格
          const target = Array.from(monthEl.querySelectorAll('.van-calendar__day'))
            .find((c) => (c.textContent || '').trim() === String(want.d) && !c.className.includes('disabled'));
          if (!target) throw new Error(want.y + '年' + want.m + '月中未找到可选的 ' + want.d + ' 日格');
          target.click();
          await window.__ttPickWait(() => target.classList.contains('van-calendar__day--selected'), 3000);
          // vant 默认 show-confirm：选格只选中，须点确认按钮提交
          const btn = cal.querySelector('.van-calendar__confirm');
          if (!btn) throw new Error('未找到日历确认按钮（.van-calendar__confirm）');
          btn.click();
          await sleep(200);
          return '已设置日期：' + want.y + '-' + String(want.m).padStart(2, '0') + '-' + String(want.d).padStart(2, '0');
        },
        // 后验：回显年月日数值比对（补零/分隔符归一）
        async verify(el, args) {
          const want = parseDate(args?.value);
          if (!want) return false;
          const field = el.closest('.van-field');
          const input = (el.tagName === 'INPUT' ? el : field?.querySelector('input'));
          const v = input ? input.value : '';
          const g = v.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
          if (!g) return false;
          return parseInt(g[1], 10) === want.y && parseInt(g[2], 10) === want.m && parseInt(g[3], 10) === want.d;
        },
      },
    },
  };
})()
