/**
 * 内置插件：Vant 滚轮选择弹层（van-picker 家族）适配。
 *
 * 覆盖「只读 van-field 触发器 + van-popup 滚轮弹层」的标准 Vant 形态：
 * 纯选项 picker（select）、日期滚轮（set_date，年/月/日列，文本补零）、时间滚轮（set_time）。
 * vant 4.10 三种变体共享同一 .van-picker 根类（无 date/time 区分类名），弹层侧靠列结构判别，
 * 触发器侧（弹层未开）无判别信息 → 依赖动作内结构探测：结构不符即 failed 落匹配链下一个
 * （如日历/级联触发器同为只读 van-field，由 vant-calendar 等兜底）。
 *
 * 槽位：detect（.van-picker 弹层侧 + 只读 van-field 触发器侧）/ candidates（触发器
 * placeholder + 表单 label）/ annotate（只读触发器「勿 fill」）/ actions（select/set_date/set_time）。
 *
 * DOM 契约（vant 4.10 实测+源码核对）：点列项即滚动选中（动画中点击被忽略，须等
 .van-picker-column__item--selected 落定再点下一列/确认）；确认按钮 .van-picker__confirm；
 弹层 lazyRender 且实例常驻，取可见者操作。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
  const digits = (s) => (s || '').replace(/\D+/g, '');

  // 可见的滚轮弹层（实例常驻，取当前展开者）
  function visiblePicker() {
    for (const p of document.querySelectorAll('.van-picker')) {
      if (p.getBoundingClientRect().height > 0 && p.closest('.van-popup')?.getBoundingClientRect().height > 0) return p;
    }
    return null;
  }

  // el（触发器或弹层内元素）→ 打开并返回可见 .van-picker。
  // 幂等：已有滚轮弹层复用（链上前一插件可能已为当前元素打开）；
  // 已有「非滚轮」弹层（日历/级联）时不点击（再点触发器会 toggle 收起），直接结构化报错落链。
  async function openPicker(el) {
    const opened = visiblePicker();
    if (opened) return opened;
    const anyPopupVisible = () => {
      for (const p of document.querySelectorAll('.van-popup')) {
        if (p.getBoundingClientRect().height > 0) return p;
      }
      return null;
    };
    if (anyPopupVisible()) throw new Error('页面已有非滚轮弹层展开（日历/级联等），请由对应弹层插件处理');
    const field = el.closest('.van-field');
    const trigger = (el.tagName === 'INPUT' ? el : field?.querySelector('input')) || field;
    if (!trigger) throw new Error('找不到滚轮选择器触发器（只读 van-field 或已展开弹层）');
    trigger.click();
    await window.__ttPickWait(anyPopupVisible, 5000);
    const picker = await window.__ttPickWait(visiblePicker, 1500).catch(() => null);
    if (!picker) throw new Error('展开的弹层不含滚轮（非 picker 形态），请由对应弹层插件处理');
    return picker;
  }

  // 点列项并等滚轮落定（动画中点击被 vant 忽略）；返回 false 表示该列无匹配项
  async function clickColumnItem(picker, colIndex, matcher) {
    const col = picker.querySelectorAll('.van-picker-column')[colIndex];
    if (!col) return false;
    const items = Array.from(col.querySelectorAll('.van-picker-column__item'));
    const target = items.find(matcher);
    if (!target) return false;
    target.click();
    // 严格等待选中态落定：点击被动画吞掉（vant 在 moving 期间忽略点击）时重试一次，
    // 再不落定即报错，绝不静默带错值点确认
    try {
      await window.__ttPickWait(() => target.classList.contains('van-picker-column__item--selected'), 1500);
    } catch (e) {
      target.click();
      await window.__ttPickWait(() => target.classList.contains('van-picker-column__item--selected'), 3000);
    }
    return true;
  }

  async function confirmPicker(picker) {
    const btn = picker.querySelector('.van-picker__confirm');
    if (!btn) throw new Error('未找到滚轮弹层确认按钮（.van-picker__confirm）');
    btn.click();
    await sleep(200);
  }

  function listColumnSamples(picker) {
    const cols = Array.from(picker.querySelectorAll('.van-picker-column'));
    return cols.map((c) => Array.from(c.querySelectorAll('.van-picker-column__item'))
      .slice(0, 6).map((i) => (i.textContent || '').trim()).filter(Boolean).join('|')).join(' ; ');
  }

  // 列结构判别：首列含 4 位年份 → 日期滚轮；各列全为 ≤2 位数字 → 时间滚轮
  function columnTexts(picker, idx) {
    const col = picker.querySelectorAll('.van-picker-column')[idx];
    return col ? Array.from(col.querySelectorAll('.van-picker-column__item')).map((i) => (i.textContent || '').trim()) : [];
  }
  function isDateWheel(picker) {
    return columnTexts(picker, 0).some((t) => /^(19|20)\d{2}$/.test(t));
  }
  function isTimeWheel(picker) {
    if (isDateWheel(picker)) return false;
    const colCount = picker.querySelectorAll('.van-picker-column').length;
    if (colCount < 2 || colCount > 3) return false;
    for (let i = 0; i < colCount; i++) {
      const ts = columnTexts(picker, i);
      if (!ts.length || !ts.every((t) => /^\d{1,2}$/.test(t))) return false;
    }
    return true;
  }

  // 数字列点选（日期/时间）：按数值匹配（文本补零归一为数值比对）
  async function clickNumericColumns(picker, values) {
    for (let i = 0; i < values.length; i++) {
      const want = values[i];
      const ok = await clickColumnItem(picker, i, (it) => {
        const d = parseInt(digits(it.textContent), 10);
        return !Number.isNaN(d) && d === want;
      });
      if (!ok) throw new Error(`滚轮第 ${i + 1} 列无可选值：${want}（当前样例：${listColumnSamples(picker)}）`);
    }
  }

  return {
    // 弹层侧命中任意 .van-picker（date/time 变体同根类名）；触发器侧命中只读 van-field
    //（滚轮/日历/级联等弹层选择器的标准形态）——动作内结构探测负责细分，不符即 failed 落链
    detect(el) {
      if (el.closest('.van-picker')) return true;
      const field = el.closest('.van-field');
      return !!(field && field.querySelector('input[readonly]'));
    },
    candidates(el) {
      const out = [];
      if (el.closest('.van-picker')) return out; // 弹层内容不产出候选（实例常驻破坏唯一性）
      const field = el.closest('.van-field');
      if (!field || !field.querySelector('input[readonly]')) return out;
      const input = field.querySelector('input');
      // 1) placeholder 候选（「请选择xx」类触发器语义最稳）
      const ph = input?.getAttribute('placeholder');
      if (ph) out.push({ strategy: 'placeholder', value: ph });
      // 2) 表单字段 label 文本
      const label = field.querySelector('.van-field__label');
      const text = ((label && label.textContent) || '').replace(/[:：\s]+$/g, '').trim();
      if (text) out.push({ strategy: 'label', value: text });
      return out;
    },
    annotate(el) {
      if (el.closest('.van-picker')) {
        return 'Vant 滚轮选择弹层（列项点击滚动选中，选完点「确认」提交）';
      }
      const field = el.closest('.van-field');
      if (field && field.querySelector('input[readonly]')) {
        return 'Vant 只读选择触发器（弹层滚轮/日历/级联形态，勿对其 fill；选项用 select、日期用 set_date、时间用 set_time）';
      }
      return '';
    },
    actions: {
      select: {
        doc: '在 Vant 滚轮选择弹层中选择选项（打开弹层并点击文本匹配列项，自动点确认提交；纯选项/单列滚轮适用）。args.value=选项可见文本',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) throw new Error('滚轮选择缺少 args.value（选项文本）');
          const picker = await openPicker(el);
          const cols = picker.querySelectorAll('.van-picker-column').length;
          for (let i = 0; i < cols; i++) {
            const hit = await clickColumnItem(picker, i, (it) => (it.textContent || '').trim() === want);
            if (hit) { await confirmPicker(picker); return `已选择滚轮选项：${want}`; }
          }
          throw new Error(`滚轮选项未找到：${want}（当前可选样例：${listColumnSamples(picker)}）`);
        },
        // 后验：触发器回显与期望一致（文本精确匹配）
        async verify(el, args) {
          const want = String(args?.value || '').trim();
          if (!want) return false;
          const field = el.closest('.van-field');
          const input = (el.tagName === 'INPUT' ? el : field?.querySelector('input'));
          if (!input) return false;
          try {
            await window.__ttPickWait(() => (input.value || '').trim() === want, 1500, 200);
            return true;
          } catch (e) { return false; }
        },
      },
      set_date: {
        doc: '设置 Vant 日期滚轮（年/月/日列，弹层内逐列点选后确认提交）。args.value=YYYY-MM-DD',
        preferFill: false, // 触发器为只读输入框，fill 不可行
        async fn(el, args) {
          const m = String(args?.value || '').trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/);
          if (!m) throw new Error('日期格式应为 YYYY-MM-DD：' + (args?.value || '(空)'));
          const picker = await openPicker(el);
          if (!isDateWheel(picker)) {
            throw new Error(`该弹层不是日期滚轮（列样例：${listColumnSamples(picker)}）；若为日历面板请由日历插件处理，纯选项请用 select`);
          }
          await clickNumericColumns(picker, [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]);
          await confirmPicker(picker);
          return `已设置日期：${m[1]}-${m[2]}-${m[3]}`;
        },
        // 后验：回显的年月日数值比对（文本补零/分隔符差异归一）
        async verify(el, args) {
          const m = String(args?.value || '').trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/);
          if (!m) return false;
          const field = el.closest('.van-field');
          const input = (el.tagName === 'INPUT' ? el : field?.querySelector('input'));
          const v = input ? input.value : '';
          const g = v.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
          if (!g) return false;
          return parseInt(g[1], 10) === parseInt(m[1], 10)
            && parseInt(g[2], 10) === parseInt(m[2], 10)
            && parseInt(g[3], 10) === parseInt(m[3], 10);
        },
      },
      set_time: {
        doc: '设置 Vant 时间滚轮（时/分(/秒)列，弹层内逐列点选后确认提交）。args.value=HH:mm(:ss)',
        label: '设置时间',
        preferFill: false, // 触发器为只读输入框，fill 不可行
        async fn(el, args) {
          const parts = String(args?.value || '').trim().split(':').map((s) => parseInt(s, 10));
          if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) {
            throw new Error('时间格式应为 HH:mm 或 HH:mm:ss：' + (args?.value || '(空)'));
          }
          const picker = await openPicker(el);
          if (!isTimeWheel(picker)) {
            throw new Error(`该弹层不是时间滚轮（列样例：${listColumnSamples(picker)}）；日期滚轮请用 set_date，纯选项请用 select`);
          }
          await clickNumericColumns(picker, parts);
          await confirmPicker(picker);
          return `已设置时间：${parts.join(':')}`;
        },
        // 后验：回显的时分秒数值比对（缺省秒按 0 计）
        async verify(el, args) {
          const parts = String(args?.value || '').trim().split(':').map((s) => parseInt(s, 10));
          if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return false;
          const field = el.closest('.van-field');
          const input = (el.tagName === 'INPUT' ? el : field?.querySelector('input'));
          const v = input ? input.value : '';
          const g = v.match(/(\d{1,2})\D(\d{1,2})(?:\D(\d{1,2}))?/);
          if (!g) return false;
          const got = [parseInt(g[1], 10), parseInt(g[2], 10), g[3] ? parseInt(g[3], 10) : 0];
          const want = [parts[0], parts[1], parts[2] || 0];
          return got[0] === want[0] && got[1] === want[1] && got[2] === want[2];
        },
      },
    },
  };
})()
