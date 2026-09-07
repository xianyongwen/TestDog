/**
 * 内置插件：Ant Design 时间选择器（TimePicker）适配。
 *
 * 槽位：detect（.ant-picker 触发器，以 suffix 的 clock-circle 图标与日期选择器区分）/
 * candidates（placeholder + 表单行 label + input id 收敛）/ annotate（fill 优先提示）/
 * actions.set_time（fill 优先；面板兜底：逐列点格 → input 聚焦后 Enter 提交）。
 *
 * 行为真值（antd 5.x 实测）：面板无 footer/确定按钮；点格仅更新待定值（点外部直接丢弃回退），
 * 裸 Enter 不提交——焦点落在 .ant-picker-panel 上；必须让 input 重新持有焦点再 Enter 才提交。
 * 因此唯一可靠提交路径是 fill+Enter（平台外壳 preferFill 先走），面板路径点完格子后
 * 显式聚焦 input 按真实 Enter（合成 keydown 补 keyCode 13 兜底，无桥环境同样可提交）。
 * 12 小时制（use12Hours）面板含 meridiem 列，24 小时值无法匹配时如实报错。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  const pad = (n) => String(n).padStart(2, '0');

  // 时间选择器判别：antd DatePicker（含 showTime）suffix 均为日历图标，仅 TimePicker 是时钟
  function isTimeEditor(editor) {
    return !!editor.querySelector('.ant-picker-suffix .anticon-clock-circle');
  }

  // 面板可见判定（关闭后 DOM 常驻，必须查渲染框）
  function findOpenPanel() {
    for (const p of document.querySelectorAll('.ant-picker-panel')) {
      if (p.getClientRects().length > 0 && p.querySelector('.ant-picker-time-panel')) return p;
    }
    return null;
  }

  // Enter 提交：真实键盘优先；合成 keydown 补 legacy keyCode（焦点须在 input 上）
  async function pressEnter(input) {
    input.focus();
    if (typeof window.__ttPwRpc === 'function') {
      await window.__ttPw.page.keyboard.press('Enter');
      return;
    }
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: () => 13 });
    input.dispatchEvent(ev);
  }

  async function setTime(el, h, mi, s) {
    const editor = el.closest('.ant-picker') || el;
    const input = editor.querySelector('input');
    if (!input) throw new Error('时间选择器触发器中未找到输入框');
    if (input.disabled || editor.classList.contains('ant-picker-disabled')) throw new Error('时间选择器处于禁用状态，无法设置');
    // 已持有焦点时（如刚 fill+Enter 提交过）focus 不再触发开面板、click 被 toggle 抵消——先失焦重置
    if (document.activeElement === input && typeof input.blur === 'function') input.blur();
    input.focus();
    input.click();
    const panel = await window.__ttPickWait(findOpenPanel, 5000);
    // 逐列点目标格：按 data-type 映射时/分/秒，元素级 .click() 规避列表滚动导致的坐标漂移
    const cols = { hour: h, minute: mi, second: s };
    for (const type of ['hour', 'minute', 'second']) {
      const col = panel.querySelector(`.ant-picker-time-panel-column[data-type="${type}"]`);
      if (!col) throw new Error(`面板中未找到 ${type} 列（当前列类型：${Array.from(panel.querySelectorAll('.ant-picker-time-panel-column')).map((c) => c.dataset.type).join('/') || '无'}；12 小时制面板请改用 fill 输入完整时间）`);
      let hit = null;
      for (const li of col.querySelectorAll('li')) {
        // data-value 为非补零数字串（"8" 而非 "08"），按数值比对
        if (Number(li.dataset.value) === cols[type] && !li.classList.contains('ant-picker-time-panel-cell-disabled')) { hit = li; break; }
      }
      if (!hit) {
        const dis = Array.from(col.querySelectorAll('li')).some((li) => Number(li.dataset.value) === cols[type]);
        throw new Error(dis ? `时间 ${pad(h)}:${pad(mi)}:${pad(s)} 的 ${type} 部分在面板中处于禁用状态（应用 disabledHours/disabledMinutes 规则限制），请改用可用时间` : `面板中未找到 ${type} 值 ${cols[type]}`);
      }
      (hit.querySelector('.ant-picker-time-panel-cell-inner') || hit).click();
      await sleep(60);
    }
    // 提交：input 重新持有焦点后 Enter（面板点格会把焦点移到 panel，裸 Enter 无效）
    await pressEnter(input);
    await sleep(150);
    return `已设置时间：${pad(h)}:${pad(mi)}:${pad(s)}`;
  }

  return {
    detect(el) {
      const editor = el.closest('.ant-picker');
      return !!editor && isTimeEditor(editor);
    },
    candidates(el) {
      const editor = el.closest('.ant-picker');
      if (!editor || !isTimeEditor(editor)) return [];
      const out = [];
      const input = editor.querySelector('input');
      // 表单行 label 收割（组件范围内）
      const item = el.closest('.ant-form-item');
      const labelEl = item && (item.querySelector('.ant-form-item-label label') || item.querySelector('.ant-form-item-label'));
      const text = ((labelEl && labelEl.textContent) || '').replace(/[:：\s]+$/g, '').replace(/\s+/g, '').trim();
      const ph = input ? input.getAttribute('placeholder') : null;
      if (ph) out.push({ strategy: 'placeholder', value: ph });
      if (input && input.id) out.push({ strategy: 'css', value: `#${input.id}` });
      if (text) out.push({ strategy: 'label', value: text });
      return out;
    },
    annotate(el) {
      const editor = el.closest('.ant-picker');
      if (editor && isTimeEditor(editor)) {
        const input = editor.querySelector('input');
        return `Ant Design 时间选择器（请直接 fill 完整时间 HH:mm:ss 后按 Enter 提交；面板点选不会自动提交）；也可用 set_time 动作，当前值: ${(input && input.value) || '(空)'}`;
      }
      return '';
    },
    actions: {
      set_time: {
        doc: '设置 Ant Design 时间选择器（fill 优先；面板兜底自动点格并按 Enter 提交；12 小时制面板请直接 fill 完整时间）。args.value=HH:mm(:ss)',
        label: '设置时间',
        preferFill: true,
        async fn(el, args) {
          const text = String(args?.value || '').trim();
          const m = text.match(/^(\d{1,2}):(\d{2})(?::(\d{1,2}))?$/);
          if (!m) throw new Error(`set_time 需要 HH:mm(:ss) 格式时间，收到：${text}`);
          const h = Number(m[1]); const mi = Number(m[2]); const s = m[3] != null ? Number(m[3]) : 0;
          if (h > 23 || mi > 59 || s > 59) throw new Error(`时间数值越界：${text}（时 0-23、分/秒 0-59）`);
          if (!el.closest('.ant-picker')) throw new Error('set_time 目标元素不属于 Ant Design 时间选择器（.ant-picker）');
          return await setTime(el, h, mi, s);
        },
        // 页内后验：面板已关 且 输入框回显与期望一致（按段数值比对容忍格式差异）
        async verify(el, args) {
          const text = String(args?.value || '').trim();
          const want = text.match(/^(\d{1,2}):(\d{2})(?::(\d{1,2}))?$/);
          if (!want) return false;
          const editor = el.closest('.ant-picker');
          if (!editor) return false;
          const input = editor.querySelector('input');
          for (let i = 0; i < 5; i++) {
            if (!findOpenPanel()) {
              const got = ((input && input.value) || '').match(/^(\d{1,2}):(\d{2})(?::(\d{1,2}))?/);
              if (got && Number(got[1]) === Number(want[1]) && Number(got[2]) === Number(want[2]) && Number(got[3] ?? 0) === Number(want[3] ?? 0)) return true;
            }
            await sleep(200);
          }
          return false;
        },
      },
    },
  };
})()
