/**
 * 内置插件：Element（element-ui / element-plus）时间选择器（TimePicker）适配。
 *
 * 槽位：detect（.el-date-editor--time / --timerange 触发器，与日期选择器共享 .el-date-editor
 * 根类，靠类型修饰符区分）/ candidates（placeholder + 表单行 label + input id 收敛）/
 * annotate（引导用 set_time）/ actions.set_time（面板闭环：开面板 → 逐列点滚轮项 → 点
 * footer 确定按钮提交）。
 *
 * 行为真值（element-plus 2.8 实测）：fill+Enter 不可靠——输入值被忽略、提交的是面板默认的
 * 当前时刻，故 preferFill: false，统一走面板路径。面板滚轮列按序为时/分/秒（格式无秒时仅
 * 2 列），li 文本补零、按数值比对（element-ui/element-plus 结构同构，与 el-date-picker 的
 * 时间滚轮设值同款）。范围时间选择器（--timerange）暂不支持，如实报错引导。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  const TIME_TRIGGER = '.el-date-editor--time, .el-date-editor--timerange';

  function findOpenPanel() {
    for (const p of document.querySelectorAll('.el-time-panel')) {
      if (p.isConnected && p.getClientRects().length > 0 && p.querySelector('.el-time-spinner__wrapper')) return p;
    }
    return null;
  }

  // 时间滚轮列设值：逐列点击目标项（跳过禁用项）；列数少于 3 时忽略缺失的尾段
  async function setTimeSpinners(panel, h, mi, s) {
    const cols = panel.querySelectorAll('.el-time-spinner__wrapper');
    if (!cols.length) throw new Error('时间面板中未找到滚轮列（.el-time-spinner__wrapper）');
    const vals = [h, mi, s];
    for (let i = 0; i < Math.min(cols.length, 3); i++) {
      let hit = null;
      for (const li of cols[i].querySelectorAll('.el-time-spinner__list li')) {
        if (!/disabled/.test(li.className) && parseInt((li.textContent || '').trim(), 10) === vals[i]) { hit = li; break; }
      }
      if (!hit) throw new Error(`时间第 ${i + 1} 列中未找到可选值 ${vals[i]}（可能被禁用）`);
      hit.click();
      await sleep(80);
    }
  }

  async function setTime(el, h, mi, s) {
    const editor = el.closest(TIME_TRIGGER) || el;
    if (/el-date-editor--timerange/.test(editor.className)) {
      throw new Error('范围时间选择器（--timerange）暂不支持 set_time 动作，请分别对起止时间操作或改用平台 fill 步骤');
    }
    const input = editor.querySelector('input');
    if (!input) throw new Error('时间选择器触发器中未找到输入框');
    if (input.disabled || editor.classList.contains('is-disabled')) throw new Error('时间选择器处于禁用状态，无法设置');
    // 已持有焦点时（如刚提交过）focus 不再触发开面板、click 被 toggle 抵消——先失焦重置
    if (document.activeElement === input && typeof input.blur === 'function') input.blur();
    input.focus();
    input.click();
    const panel = await window.__ttPickWait(findOpenPanel, 5000);
    await setTimeSpinners(panel, h, mi, s);
    // footer 确定按钮提交（element-plus = is-plain/confirm 类，element-ui = confirm 类；按结构匹配不依赖 locale 文案）
    const okBtn = panel.querySelector('.el-time-panel__btn.confirm')
      || Array.from(panel.querySelectorAll('.el-time-panel__btn, button')).filter((b) => !/cancel|取消/.test(`${b.className} ${b.textContent}`)).pop();
    if (!okBtn) throw new Error('时间面板未找到确定按钮');
    okBtn.click();
    await sleep(150);
    return `已设置时间：${[h, mi, s].map((n) => String(n).padStart(2, '0')).join(':')}`;
  }

  return {
    detect(el) {
      return !!el.closest(TIME_TRIGGER);
    },
    candidates(el) {
      const editor = el.closest(TIME_TRIGGER);
      if (!editor) return [];
      const out = [];
      const input = editor.querySelector('input');
      // 表单行 label 收割（组件范围内）
      const item = el.closest('.el-form-item');
      const labelEl = item && (item.querySelector('.el-form-item__label label') || item.querySelector('.el-form-item__label'));
      const text = ((labelEl && labelEl.textContent) || '').replace(/[:：\s]+$/g, '').replace(/\s+/g, '').trim();
      const ph = input ? input.getAttribute('placeholder') : null;
      if (ph) out.push({ strategy: 'placeholder', value: ph });
      if (input && input.id) out.push({ strategy: 'css', value: `#${input.id}` });
      if (text) out.push({ strategy: 'label', value: text });
      return out;
    },
    annotate(el) {
      const editor = el.closest(TIME_TRIGGER);
      if (editor) {
        const input = editor.querySelector('input');
        return `Element 时间选择器（直接 fill 可能不生效，请用 set_time 动作设置），当前值: ${(input && input.value) || '(空)'}`;
      }
      return '';
    },
    actions: {
      set_time: {
        doc: '设置 Element（element-ui / element-plus）时间选择器（面板点选滚轮并点确定按钮提交；范围时间选择器暂不支持）。args.value=HH:mm(:ss)',
        label: '设置时间',
        preferFill: false,
        async fn(el, args) {
          const text = String(args?.value || '').trim();
          const m = text.match(/^(\d{1,2}):(\d{2})(?::(\d{1,2}))?$/);
          if (!m) throw new Error(`set_time 需要 HH:mm(:ss) 格式时间，收到：${text}`);
          const h = Number(m[1]); const mi = Number(m[2]); const s = m[3] != null ? Number(m[3]) : 0;
          if (h > 23 || mi > 59 || s > 59) throw new Error(`时间数值越界：${text}（时 0-23、分/秒 0-59）`);
          if (!el.closest(TIME_TRIGGER)) throw new Error('set_time 目标元素不属于 Element 时间选择器（.el-date-editor--time）');
          return await setTime(el, h, mi, s);
        },
        // 页内后验：面板已关 且 输入框回显与期望一致（时/分必比；秒仅两侧都明确时比对——应用格式可能无秒段）
        async verify(el, args) {
          const text = String(args?.value || '').trim();
          const want = text.match(/^(\d{1,2}):(\d{2})(?::(\d{1,2}))?$/);
          if (!want) return false;
          const editor = el.closest(TIME_TRIGGER);
          if (!editor) return false;
          const input = editor.querySelector('input');
          for (let i = 0; i < 5; i++) {
            if (!findOpenPanel()) {
              const got = ((input && input.value) || '').match(/(\d{1,2}):(\d{2})(?::(\d{1,2}))?/);
              if (got && Number(got[1]) === Number(want[1]) && Number(got[2]) === Number(want[2])
                && (got[3] == null || want[3] == null || Number(got[3]) === Number(want[3]))) return true;
            }
            await sleep(200);
          }
          return false;
        },
      },
    },
  };
})()
