/**
 * 内置插件：Ant Design 日期选择器适配（日期 / 日期时间统一，showTime 自动确认）。
 *
 * 槽位：detect（.ant-picker 触发器）/ annotate（fill 优先提示）/ actions.set_date
 * （点击展开 + 面板头部年/月对齐翻页闭环 + 当月日期格点击；showTime/日期时间形态面板
 * 点日期格后保持打开等待确认（rc-picker needConfirm），自动点击 footer 确认按钮提交）。
 * 日期时间形态自动补时间：value 只传日期时按 00:00:00 提交（点时间列落值，不用应用默认的当前时刻），
 * value 也可显式带 HH:mm(:ss)。平台外壳按 preferFill 先尝试 Playwright fill+Enter（日期时间控件
 * 要求完整格式含时间部分，只填日期不会提交——由 verify 拦截后转本动作），失败才进本动作。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // 头部月按钮文本解析：中文「9月」、英文缩写/全称（Sep/September）、纯数字，按数值归一
  const MONTH_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function parseMonthText(text) {
    const t = String(text || '').trim().toLowerCase();
    const zh = t.match(/^(\d{1,2})\s*月/);
    if (zh) return Number(zh[1]);
    const i = MONTH_EN.findIndex((name) => name === t || name.slice(0, 3) === t.slice(0, 3));
    if (i >= 0) return i + 1;
    return parseInt(t, 10) || NaN;
  }

  // dropdown 可见判定：hidden 类（classList 参数不能带点）+ 渲染框双检（display:none 时无框）
  function dropdownVisible(d) {
    return !d.classList.contains('ant-picker-dropdown-hidden') && d.getClientRects().length > 0;
  }

  // 当前打开的下拉（点开本控件时其余 picker 面板因外部点击收起，先到先得）
  function findOpenDropdown() {
    for (const d of document.querySelectorAll('.ant-picker-dropdown')) {
      if (dropdownVisible(d) && d.querySelector('.ant-picker-panel')) return d;
    }
    return null;
  }

  // 时间列设值：showTime 面板的时间列按序为时/分/秒（格式无秒时仅 2 列，按列数取前缀），
  // 逐列点击目标单元格（跳过禁用项）；rc-picker 点日期格后时间默认落在当前时刻，需显式点列改值
  async function setTimeCells(dropdown, time) {
    const vals = [time.h, time.mi, time.s];
    const cols = dropdown.querySelectorAll('.ant-picker-time-panel-column');
    for (let i = 0; i < Math.min(cols.length, 3); i++) {
      let hit = null;
      for (const c of cols[i].querySelectorAll('.ant-picker-time-panel-cell')) {
        const inner = c.querySelector('.ant-picker-time-panel-cell-inner');
        if (!c.classList.contains('ant-picker-time-panel-cell-disabled') && inner && Number(inner.textContent) === vals[i]) { hit = inner; break; }
      }
      if (!hit) throw new Error(`时间第 ${i + 1} 列中未找到可选值 ${vals[i]}（可能被禁用或 12 小时制面板）`);
      hit.click();
      await sleep(60);
    }
  }

  async function setDate(el, year, month, day, dateText, time) {
    const editor = el.closest('.ant-picker') || el;
    const open = editor.querySelector('input') || editor;
    // 已持有焦点时（如刚 fill+Enter 提交过）focus 事件不再触发开面板、click 可能被 toggle 抵消——先失焦重置
    if (document.activeElement === open && typeof open.blur === 'function') open.blur();
    // focus 与 click 均可触发 rc-picker 开面板（onSelectorFocus/onSelectorClick），双保险
    if (typeof open.focus === 'function') open.focus();
    open.click();
    const dropdown = await window.__ttPickWait(findOpenDropdown, 5000);
    const panel = dropdown.querySelector('.ant-picker-panel');
    // 日期时间形态判定：showTime 才渲染时间列面板；显式传了时间但为纯日期形态则如实报错
    const isDatetime = !!dropdown.querySelector('.ant-picker-time-panel');
    if (time && !isDatetime) throw new Error('目标为纯日期选择器（无 showTime），无法设置时间部分');
    // 翻页闭环：对齐面板头部年/月（状态相关，步数不定），上限 400 次防死循环
    for (let i = 0; i < 400; i++) {
      const yb = panel.querySelector('.ant-picker-year-btn');
      const mb = panel.querySelector('.ant-picker-month-btn');
      const cy = yb ? parseInt(yb.textContent, 10) : NaN;
      const cm = mb ? parseMonthText(mb.textContent) : NaN;
      if (cy === year && cm === month) break;
      if (isNaN(cy) || isNaN(cm)) break;
      if (cy !== year) {
        const btn = panel.querySelector(cy > year ? '.ant-picker-header-super-prev-btn' : '.ant-picker-header-super-next-btn');
        if (!btn) throw new Error('找不到年份翻页按钮');
        btn.click();
      } else {
        const btn = panel.querySelector(cm > month ? '.ant-picker-header-prev-btn' : '.ant-picker-header-next-btn');
        if (!btn) throw new Error('找不到月份翻页按钮');
        btn.click();
      }
      await sleep(60);
    }
    // 日期格 title 为补零格式（2026-9-5 → 2026-09-05）；区分「被禁用」（应用 disabledDate 规则拒绝该值，
    // 需回灌模型换值重试）与「未找到」（超出可选范围或翻页未对齐，属插件侧异常）
    const title = dateText.replace(/-(\d)-/, '-0$1').replace(/-(\d)$/, '-0$1');
    const cellAny = panel.querySelector(`td[title="${title}"]`);
    if (cellAny && cellAny.classList.contains('ant-picker-cell-disabled')) {
      throw new Error(`日期 ${title} 在面板中处于禁用状态（应用 disabledDate 规则限制，常见为不可早于今天），请改选可用日期`);
    }
    const cell = cellAny && !cellAny.classList.contains('ant-picker-cell-disabled') ? cellAny : null;
    if (!cell) throw new Error(`面板中未找到日期：${title}（可能超出可选范围或翻页未对齐）`);
    // 日期时间形态：先点时间列落时间（缺省 00:00:00，显式时间则用显式值）再点日期格——
    // rc-picker 时间列选择与面板视图日期（pickerValue=当前月视图锚点）合并，若先点日期格再点时间列，
    // 日期会被视图锚点（而非已选日期）覆盖回今天；而日期格点击会保留已选时间，顺序不可颠倒
    if (isDatetime) await setTimeCells(dropdown, time || { h: 0, mi: 0, s: 0 });
    const inner = cell.querySelector('.ant-picker-cell-inner') || cell;
    inner.click();
    // 日期时间形态（showTime）：点日期格只更新选中态不提交，footer 有确认按钮则等其可用后点击闭环；
    // 纯日期形态无 .ant-picker-ok（needConfirm 才渲染），点日期格即提交并关闭面板——按结构即时分流，不空等超时
    const okLi = dropdown.querySelector('.ant-picker-footer .ant-picker-ok');
    if (okLi) {
      const ok = await window.__ttPickWait(() => {
        const btn = okLi.querySelector('button');
        return btn && !btn.disabled ? btn : null;
      }, 2000, 100).catch(() => null);
      if (!ok) throw new Error('确认按钮不可用（面板判定当前输入无效）');
      ok.click();
    }
    await sleep(150);
    const t = time || (isDatetime ? { h: 0, mi: 0, s: 0 } : null);
    const pad = (n) => String(n).padStart(2, '0');
    const echo = t ? `${title} ${pad(t.h)}:${pad(t.mi)}:${pad(t.s)}` : title;
    return `已设置日期：${echo}${okLi ? '（含时间确认）' : ''}`;
  }

  return {
    // 时间选择器（TimePicker）触发器同为 .ant-picker（suffix 为时钟图标），排除以免
    // 标注/候选误导（日期选择器含 showTime 时 suffix 仍是日历图标，不受影响）
    detect(el) {
      const editor = el.closest('.ant-picker');
      return !!editor && !editor.querySelector('.ant-picker-suffix .anticon-clock-circle');
    },
    annotate(el) {
      const editor = el.closest('.ant-picker');
      if (editor && !editor.querySelector('.ant-picker-suffix .anticon-clock-circle')) return 'Ant Design 日期选择器：优先直接 fill 日期文本 + Enter（日期时间控件需填完整格式含时间部分）；也可用 set_date 动作';
      return '';
    },
    actions: {
      set_date: {
        doc: '设置 Ant Design 日期选择器（fill 优先，失败走面板翻页与日期格点击；showTime/日期时间形态自动点击确认按钮提交）。args.value=YYYY-MM-DD（日期时间选择器自动补 00:00:00，也可显式带 HH:mm(:ss)）',
        preferFill: true,
        async fn(el, args) {
          const dateText = String(args?.value || '').trim();
          const m = dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
          if (!m) throw new Error(`set_date 需要 YYYY-MM-DD 格式日期（可选 HH:mm(:ss) 时间部分），收到：${dateText}`);
          if (!el.closest('.ant-picker')) throw new Error('set_date 目标元素不属于 Ant Design 日期选择器（.ant-picker）');
          // 误派保护：时间选择器触发器同为 .ant-picker（时钟图标判别），如实引导换动作
          const editor = el.closest('.ant-picker');
          if (editor.querySelector('.ant-picker-suffix .anticon-clock-circle')) throw new Error('目标元素是 Ant Design 时间选择器（TimePicker），请改用 set_time 动作');
          const time = m[4] != null ? { h: Number(m[4]), mi: Number(m[5]), s: m[6] != null ? Number(m[6]) : 0 } : null;
          // 仅日期部分下传：setDate 的日期格补零匹配（title）只认日期串，时间部分经时间列单独落值
          return await setDate(el, Number(m[1]), Number(m[2]), Number(m[3]), m[0].split(/\s+/)[0], time);
        },
        // 页内后验（轮询等提交落定）：面板已关闭 且 输入框回显日期与期望一致（兼容 / 分隔，按数值比对容忍前导零差异；
        // value 带时间部分时仅锚定日期前缀比对，时间格式因应用而异不逐字比对）。
        // 输入框回显单独不足为凭——日期时间形态点选后 pending 值即回显，未点确认时面板仍开着，不可算提交。
        async verify(el, args) {
          const dateText = String(args?.value || '').trim();
          const want = dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
          if (!want) return false;
          const editor = el.closest('.ant-picker');
          if (!editor) return false;
          for (let i = 0; i < 5; i++) {
            if (!findOpenDropdown()) {
              const input = editor.querySelector('input');
              const got = ((input && input.value) || '').match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
              if (got && Number(got[1]) === Number(want[1]) && Number(got[2]) === Number(want[2]) && Number(got[3]) === Number(want[3])) return true;
            }
            await sleep(200);
          }
          return false;
        },
      },
    },
  };
})()
