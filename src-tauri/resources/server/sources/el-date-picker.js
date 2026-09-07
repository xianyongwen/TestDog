/**
 * 内置插件：Element（element-ui / element-plus）日期选择器适配（日期 / 日期时间统一，自动确认）。
 *
 * 槽位：detect（.el-date-editor 触发器）/ annotate（fill 优先提示）/ actions.set_date
 * （点击展开 + 头部年/月 label 对齐翻页闭环 + 当月日期格点击；datetime 形态点日期格后面板
 * 保持打开等待确认（footerVisible = showTime），自动点击 footer 确定按钮提交）。
 * 日期时间形态自动补时间：value 只传日期时按 00:00:00 提交（点时间滚轮落值，不用应用默认的当前时刻），
 * value 也可显式带 HH:mm(:ss)。平台外壳按 preferFill 先尝试 Playwright fill+Enter（日期时间控件
 * 要求完整格式含时间部分，只填日期不会提交——由 verify 拦截后转本动作），失败才进本动作。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // element-ui 靠 input 的 focus 事件开面板（click 不触发），antd/element-plus 两者兼收——统一 focus+click。
  // 输入框已持有焦点时（如刚 fill+Enter 提交过）focus 事件不会再触发开面板、click 又被 toggle 语义抵消，
  // 先失焦重置再开，保证重开场景面板必定弹出
  function openEditor(editor) {
    const input = editor.querySelector('input') || editor;
    if (document.activeElement === input && typeof input.blur === 'function') input.blur();
    if (typeof input.focus === 'function') input.focus();
    input.click();
    return input;
  }

  // 头部月 label 解析：中文「9 月」/「09月」、英文全称与缩写（September/Sep）、纯数字，按数值归一
  const MONTH_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function parseMonthLabel(text) {
    const t = String(text || '').trim().toLowerCase();
    const zh = t.match(/^(\d{1,2})\s*月/);
    if (zh) return Number(zh[1]);
    const i = MONTH_EN.findIndex((name) => name === t || name.slice(0, 3) === t.slice(0, 3));
    if (i >= 0) return i + 1;
    return parseInt(t, 10) || NaN;
  }

  // 面板可见判定：el-plus popper 关闭时祖先带 aria-hidden="true"；element-ui v-show 关闭时无渲染框。
  // display:none（v-show 关闭）时 getClientRects 为空；过渡动画期间仍有渲染框，靠 aria-hidden 兜住。
  function panelVisible(p) {
    if (!p.isConnected || p.getClientRects().length === 0) return false;
    const popper = p.closest('.el-popper, .el-picker__popper');
    return !(popper && popper.getAttribute('aria-hidden') === 'true');
  }

  // 当前打开的日期面板（其余 picker 面板点开本控件时因外部点击收起，先到先得）
  function findOpenPanel() {
    for (const p of document.querySelectorAll('.el-picker-panel')) {
      if (panelVisible(p) && p.querySelector('.el-date-table')) return p;
    }
    return null;
  }

  // 确定按钮：datetime 形态 footer 才渲染；element-plus 确定 = plain（is-plain），
  // element-ui = primary——按结构匹配不依赖 locale 文案。footer/button 隐藏（v-show）或 disabled 时视为不可用。
  function findConfirmButton(panel) {
    const footer = panel.querySelector('.el-picker-panel__footer');
    if (!footer || footer.getClientRects().length === 0) return null;
    const btn = footer.querySelector('.el-button.is-plain, .el-button--primary');
    return btn && !btn.disabled && btn.getClientRects().length > 0 ? btn : null;
  }

  // 时间滚轮设值：滚轮列按序为时/分/秒（格式无秒时仅 2 列，按列数取前缀），逐列点击目标项（跳过禁用项）；
  // 容器既可为 element-ui 内嵌 .el-time-panel，也可为 element-plus 点头部时间框弹出的滚轮弹层（结构同构）
  async function setTimeSpinners(container, time) {
    const vals = [time.h, time.mi, time.s];
    const cols = container.querySelectorAll('.el-time-spinner__wrapper');
    for (let i = 0; i < Math.min(cols.length, 3); i++) {
      let hit = null;
      for (const li of cols[i].querySelectorAll('.el-time-spinner__list li')) {
        const v = parseInt((li.textContent || '').trim(), 10);
        if (!/disabled/.test(li.className) && v === vals[i]) { hit = li; break; }
      }
      if (!hit) throw new Error(`时间第 ${i + 1} 列中未找到可选值 ${vals[i]}（可能被禁用）`);
      hit.click();
      await sleep(80);
    }
  }

  // 时间落值分流（均在日期格点选后调用——头部时间框须已有选中值才弹滚轮）：
  // element-plus / element-ui 的 datetime 时间都在面板头部输入框（.el-date-picker__time-header）里，
  // 点击弹出 .el-time-panel 滚轮弹层（teleport 到 body），点列后按弹层确定按钮（.el-time-panel__btn.confirm）
  // 闭环提交；弹层未弹出时兜底直接点面板内滚轮列表（element-ui 隐藏面板下点击仍可生效）
  async function setTimeValue(panel, time) {
    const headerInputs = panel.querySelectorAll('.el-date-picker__time-header input');
    const timeInput = headerInputs[headerInputs.length - 1];
    if (timeInput) {
      if (document.activeElement === timeInput && typeof timeInput.blur === 'function') timeInput.blur();
      if (typeof timeInput.focus === 'function') timeInput.focus();
      timeInput.click();
      const popper = await window.__ttPickWait(() => {
        for (const t of document.querySelectorAll('.el-time-panel')) {
          if (t.getClientRects().length > 0 && t.querySelector('.el-time-spinner__wrapper')) return t;
        }
        return null;
      }, 3000, 100).catch(() => null);
      if (popper) {
        await setTimeSpinners(popper, time);
        const okBtn = popper.querySelector('.el-time-panel__btn.confirm')
          || Array.from(popper.querySelectorAll('.el-time-panel__btn, button')).filter((b) => !/cancel|取消/.test(`${b.className} ${b.textContent}`)).pop();
        if (!okBtn) throw new Error('时间弹层未找到确定按钮');
        okBtn.click();
        await sleep(100);
        return;
      }
    }
    await setTimeSpinners(panel, time);
  }

  async function setDate(el, year, month, day, dateText, time) {
    const editor = el.closest('.el-date-editor') || el;
    openEditor(editor);
    const panel = await window.__ttPickWait(findOpenPanel, 5000);
    // 日期时间形态判定：内嵌时间滚轮（element-ui datetime）或头部时间输入框（element-plus datetime，
    // 纯日期形态无此头部）；显式传了时间但为纯日期形态则如实报错
    const isDatetime = !!panel.querySelector('.el-time-panel, .el-date-picker__time-header');
    if (time && !isDatetime) throw new Error('目标为纯日期选择器，无法设置时间部分');
    // 翻页按钮：按箭头类名子串匹配（el-plus 为 d-arrow-left/arrow-left 纯类名，element-ui 为
    // el-icon-d-arrow-left/el-icon-arrow-left——[class*=] 子串 + not(d-arrow) 区分单双箭头，两库通吃）
    function flipButtons() {
      const q = (sel) => panel.querySelector(`.el-picker-panel__icon-btn${sel}`);
      const btns = {
        yearPrev: q('[class*="d-arrow-left"]'),
        monthPrev: q('[class*="arrow-left"]:not([class*="d-arrow"])'),
        monthNext: q('[class*="arrow-right"]:not([class*="d-arrow"])'),
        yearNext: q('[class*="d-arrow-right"]'),
      };
      if (!btns.yearPrev || !btns.monthPrev || !btns.monthNext || !btns.yearNext) throw new Error('找不到翻页按钮');
      return btns;
    }
    // 翻页闭环：读头部年/月 label（中文「2026 年」「9 月」，英文「2026」「September」），对齐后点击当月目标日
    for (let i = 0; i < 400; i++) {
      const labels = panel.querySelectorAll('.el-date-picker__header-label');
      const cy = labels[0] ? parseInt(labels[0].textContent, 10) : NaN;
      const cm = labels[1] ? parseMonthLabel(labels[1].textContent) : NaN;
      if (cy === year && cm === month) break;
      if (isNaN(cy) || isNaN(cm)) break;
      const { yearPrev, monthPrev, monthNext, yearNext } = flipButtons();
      if (cy !== year) {
        (cy > year ? yearPrev : yearNext).click();
      } else {
        (cm > month ? monthPrev : monthNext).click();
      }
      await sleep(60);
    }
    // 目标日：仅当月单元格（排除前后月溢出日期）。element-plus 的日文本在
    // .el-date-table-cell__text 内，element-ui 2.15+ 直接是 td 文本（无包裹层）——textContent 兜底。
    // 区分「被禁用」（应用 disabledDate 规则拒绝该值，需回灌模型换值重试）与「未找到」（翻页未对齐等插件侧异常）
    let target = null;
    let disabledHit = false;
    for (const td of panel.querySelectorAll('.el-date-table td')) {
      if (td.classList.contains('prev-month') || td.classList.contains('next-month')) continue;
      const cellText = (td.querySelector('.el-date-table-cell__text') || td).textContent || '';
      if (parseInt(cellText.trim(), 10) !== day) continue;
      if (td.classList.contains('disabled')) { disabledHit = true; continue; }
      target = td;
      break;
    }
    if (!target && disabledHit) {
      throw new Error(`日期 ${dateText} 在面板中处于禁用状态（应用 disabledDate 规则限制，常见为不可早于今天），请改选可用日期`);
    }
    if (!target) throw new Error(`面板中未找到日期：${dateText}（可能超出可选范围或翻页未对齐）`);
    target.click();
    // 日期时间形态：日期格点选后把时间部分落到确定值——日期值缺省自动补 00:00:00（显式时间则用显式值），
    // 覆盖已有值时应用默认/原时间不再透传，提交结果为确定性时间
    if (isDatetime) await setTimeValue(panel, time || { h: 0, mi: 0, s: 0 });
    // datetime 形态 footer 有确定按钮：点日期格只更新选中态不提交，等确定可用后点击闭环；
    // 纯日期形态 footer 不渲染（footerVisible=false），点日期格即提交并关闭面板——按结构即时分流，不空等超时
    const footer = panel.querySelector('.el-picker-panel__footer');
    if (footer && footer.getClientRects().length > 0) {
      const confirmBtn = await window.__ttPickWait(() => findConfirmButton(panel), 2000, 100).catch(() => null);
      if (!confirmBtn) throw new Error('确定按钮不可用（面板判定当前输入无效）');
      confirmBtn.click();
    }
    await sleep(150);
    const t = time || (isDatetime ? { h: 0, mi: 0, s: 0 } : null);
    const pad = (n) => String(n).padStart(2, '0');
    const echo = t ? `${dateText} ${pad(t.h)}:${pad(t.mi)}:${pad(t.s)}` : dateText;
    return `已设置日期：${echo}${footer && footer.getClientRects().length > 0 ? '（含时间确认）' : ''}`;
  }

  return {
    // element 时间选择器触发器同为 .el-date-editor（带 --time/--timerange 修饰符），排除以免
    // 标注/候选误导；日期/日期时间/范围等形态（--date/--datetime/--daterange 等）不受影响
    detect(el) {
      const editor = el.closest('.el-date-editor');
      return !!editor && !/(^|\s)el-date-editor--time/.test(editor.className);
    },
    annotate(el) {
      const editor = el.closest('.el-date-editor');
      if (editor && !/(^|\s)el-date-editor--time/.test(editor.className)) return 'Element 日期选择器：优先直接 fill 日期文本 + Enter（日期时间控件需填完整格式含时间部分）；也可用 set_date 动作';
      return '';
    },
    actions: {
      set_date: {
        doc: '设置 Element（element-ui / element-plus）日期选择器（fill 优先，失败走面板翻页与日期格点击；datetime 形态自动点击确定按钮提交）。args.value=YYYY-MM-DD（日期时间选择器自动补 00:00:00，也可显式带 HH:mm(:ss)）',
        preferFill: true,
        async fn(el, args) {
          const dateText = String(args?.value || '').trim();
          const m = dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
          if (!m) throw new Error(`set_date 需要 YYYY-MM-DD 格式日期（可选 HH:mm(:ss) 时间部分），收到：${dateText}`);
          if (!el.closest('.el-date-editor')) throw new Error('set_date 目标元素不属于 Element 日期选择器（.el-date-editor）');
          // 误派保护：时间选择器触发器同为 .el-date-editor（--time 修饰符判别），如实引导换动作
          const editor = el.closest('.el-date-editor');
          if (/(^|\s)el-date-editor--time/.test(editor.className)) throw new Error('目标元素是 Element 时间选择器（TimePicker），请改用 set_time 动作');
          const time = m[4] != null ? { h: Number(m[4]), mi: Number(m[5]), s: m[6] != null ? Number(m[6]) : 0 } : null;
          // 仅日期部分下传：setDate 的当月日期格匹配只认日文本，时间部分经时间滚轮单独落值
          return await setDate(el, Number(m[1]), Number(m[2]), Number(m[3]), m[0].split(/\s+/)[0], time);
        },
        // 页内后验（轮询等提交落定）：面板已关闭 且 输入框回显日期与期望一致（兼容 / 分隔，按数值比对容忍前导零差异；
        // value 带时间部分时仅锚定日期前缀比对，时间格式因应用而异不逐字比对）。
        // 输入框回显单独不足为凭——datetime 形态点选后 pending 值即回显（emitInput 在面板打开时已更新显示值），未点确定时不可算提交。
        async verify(el, args) {
          const dateText = String(args?.value || '').trim();
          const want = dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
          if (!want) return false;
          const editor = el.closest('.el-date-editor');
          if (!editor) return false;
          for (let i = 0; i < 5; i++) {
            if (!findOpenPanel()) {
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
