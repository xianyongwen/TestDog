/**
 * 内置插件：Material-UI 滑块（Slider）适配。
 *
 * 槽位：detect（.MuiSlider-root）/ candidates（根 id 收敛的手柄 css）/ annotate（当前值/
 * 禁用态）/ actions.set_value。
 *
 * 与 ant/element/vant 滑块的关键差异（mui 5.16 源码+实测核对）：
 * - ARIA 全部挂在每个手柄内的 input[type=range] 上（aria-valuenow/min/max/orientation），
 *   thumb span 与 input 均无 role=slider——真值读 input 的 aria-valuenow
 * - mousedown 绑在根上（按点击坐标即时设值+绑 document 监听），拖拽用 mousemove/mouseup；
 *   合成 mousemove 必须带 buttons:1，否则被「漏发 mouseup」守卫取消拖拽
 * - 轨道点击按「就近手柄」设值，无法表达任意 range 目标（会振荡）——统一走手柄拖拽
 * - 无键盘步进可用（合成 keydown 实测无效），精度靠「坐标计算 + 终态校验 + 一轮重试」
 * 范围滑块 args.value 传 "a,b" 设两端（自动升序）；单值移动最近手柄。勿 fill（非输入框）。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  function sliderRoot(el) {
    return el.closest('.MuiSlider-root');
  }

  function thumbsOf(root) {
    return Array.from(root.querySelectorAll('.MuiSlider-thumb'));
  }

  function nowOf(thumb) {
    const input = thumb.querySelector('input');
    const v = input ? input.getAttribute('aria-valuenow') : null;
    return v == null ? NaN : Number(v);
  }

  function numAttr(thumb, name) {
    const input = thumb.querySelector('input');
    const v = input ? input.getAttribute(name) : null;
    return v == null ? NaN : Number(v);
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // 目标值在手柄轨道上的坐标（水平沿 x / 垂直沿 y，方向以 input 的 aria-orientation 为准）
  function trackPoint(root, thumb, value) {
    const r = root.getBoundingClientRect();
    const input = thumb.querySelector('input');
    const vertical = input?.getAttribute('aria-orientation') === 'vertical' || root.className.includes('vertical');
    const min = numAttr(thumb, 'aria-valuemin');
    const max = numAttr(thumb, 'aria-valuemax');
    const ratio = (Math.min(Math.max(value, min), max) - min) / (max - min);
    return vertical
      ? { x: centerOf(root).x, y: r.top + ratio * r.height }
      : { x: r.left + ratio * r.width, y: centerOf(root).y };
  }

  // 手柄拖拽到目标坐标：pw 真实鼠标优先；桥未注入退化合成事件。
  // ⚠️ 合成 mousemove 必须带 buttons:1——mui 的 handleTouchMove 把 buttons=0 的 mousemove
  // 视为「mouseup 被吞」并取消拖拽；mousedown 派发在手柄上（自身位置即最近手柄，选中自身）
  async function dragThumb(thumb, point) {
    const from = centerOf(thumb);
    if (typeof window.__ttPwRpc === 'function') {
      const pw = window.__ttPw;
      await pw.page.mouse.move(from.x, from.y);
      await pw.page.mouse.down();
      await pw.page.mouse.move(point.x, point.y, { steps: 8 });
      await pw.page.mouse.up();
      return;
    }
    thumb.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: from.x, clientY: from.y }));
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((point.x - from.x) * i) / steps;
      const y = from.y + ((point.y - from.y) * i) / steps;
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, button: 0, buttons: 1, clientX: x, clientY: y }));
      await sleep(25);
    }
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0, clientX: point.x, clientY: point.y }));
  }

  // 设置单个手柄：坐标到位 + 终态不符时一轮重试（mui 无键盘步进，精度靠坐标计算）
  async function setHandle(root, thumb, target) {
    const min = numAttr(thumb, 'aria-valuemin');
    const max = numAttr(thumb, 'aria-valuemax');
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('手柄缺少 aria-valuemin/aria-valuemax，无法定位范围');
    for (let round = 0; round < 2 && nowOf(thumb) !== target; round++) {
      const pt = trackPoint(root, thumb, target);
      await dragThumb(thumb, pt);
      await sleep(120);
    }
  }

  return {
    detect(el) {
      return !!el.closest('.MuiSlider-root');
    },
    candidates(el) {
      const root = sliderRoot(el);
      if (!root) return [];
      const out = [];
      // 根 id 收敛的手柄候选（mui Slider id 透传落在根节点；ARIA 在手柄内 input 上，
      // 无 role=slider 可用）
      if (root.id) out.push({ strategy: 'css', value: '#' + root.id + ' .MuiSlider-thumb' });
      return out;
    },
    annotate(el) {
      const root = sliderRoot(el);
      if (!root) return '';
      const now = thumbsOf(root).map((t) => numAttr(t, 'aria-valuenow')).join('~');
      const disabled = root.className.includes('Mui-disabled');
      return 'MUI 滑块（非输入框勿 fill；当前值 ' + (now || '?') + (disabled ? '，已禁用' : '') + '；用 set_value 动作设置数值，范围滑块传 "a,b" 设两端）';
    },
    actions: {
      set_value: {
        doc: '设置 MUI 滑块数值（手柄拖拽定位；范围滑块 args.value 传 "a,b" 设两端，单值移动最近手柄；受步长限制请传步长整数倍的值）。args.value=数值或"a,b"',
        label: '滑块设置',
        preferFill: false,
        async fn(el, args) {
          const root = sliderRoot(el);
          if (!root) throw new Error('目标元素不属于 MUI 滑块（.MuiSlider-root）');
          if (root.className.includes('Mui-disabled')) throw new Error('滑块处于禁用状态，无法设置');
          const raw = String(args?.value ?? '').trim();
          if (!raw) throw new Error('set_value 缺少 args.value（数值，范围滑块传 "a,b"）');
          const thumbs = thumbsOf(root);
          if (!thumbs.length) throw new Error('滑块中未找到手柄（.MuiSlider-thumb）');
          let targets;
          if (thumbs.length > 1) {
            const parts = raw.split(',').map((s) => Number(s.trim()));
            if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
              targets = parts[0] <= parts[1] ? parts : [parts[1], parts[0]];
            } else if (Number.isFinite(parts[0])) {
              // 单值：按就近原则选择手柄（与组件轨道点击的就近行为一致）
              const cur = thumbs.map((t) => nowOf(t));
              const idx = Math.abs(cur[0] - parts[0]) <= Math.abs(cur[1] - parts[0]) ? 0 : 1;
              targets = idx === 0 ? [parts[0], cur[1]] : [cur[0], parts[0]];
            } else {
              throw new Error('无法解析 args.value：' + raw + '（范围滑块请传 "a,b" 或数值）');
            }
          } else {
            const n = Number(raw);
            if (!Number.isFinite(n)) throw new Error('无法解析 args.value：' + raw + '（请传数值）');
            targets = [n];
          }
          for (let i = 0; i < targets.length; i++) {
            await setHandle(root, thumbs[i], targets[i]);
          }
          const achieved = thumbs.map((t) => nowOf(t));
          const ok = targets.every((t, i) => achieved[i] === t);
          if (!ok) throw new Error('滑块终态 ' + achieved.join('~') + ' 与目标 ' + targets.join('~') + ' 不符（可能受步长限制，请传步长整数倍的值）');
          return '已设置滑块值：' + achieved.join('~');
        },
        // 页内后验：手柄内 input 的 aria-valuenow 与期望一致（范围传 "a,b" 比对两端；单值对范围只要求有一端命中）
        verify(el, args) {
          const root = sliderRoot(el);
          if (!root) return false;
          const thumbs = thumbsOf(root);
          if (!thumbs.length) return false;
          const parts = String(args?.value ?? '').trim().split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
          if (!parts.length) return false;
          if (thumbs.length > 1 && parts.length === 2) {
            const ab = parts[0] <= parts[1] ? parts : [parts[1], parts[0]];
            return nowOf(thumbs[0]) === ab[0] && nowOf(thumbs[1]) === ab[1];
          }
          return thumbs.some((t) => nowOf(t) === parts[0]);
        },
      },
    },
  };
})()
