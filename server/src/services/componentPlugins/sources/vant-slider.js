/**
 * 内置插件：Vant 滑块（van-slider）适配。
 *
 * 槽位：detect（.van-slider 根）/ candidates（role=slider + 根 id 收敛 css + label）/
 * annotate（当前值/禁用态）/ actions.set_value。
 *
 * 与 ant/element 滑块的关键差异（vant 4.10 源码核对）：
 * - 手柄包装层带完整 ARIA（role=slider、aria-valuemin/max/now/orientation、tabindex=0），
 *   aria-valuenow 可作唯一真值
 * - vant 只绑 touch 事件（touchstart 在手柄包装层、touchmove 也绑在包装层）+ 根节点 click
 *   （点轨道设值；range 模式按「点击值与当前区间中点比较」决定动哪个手柄）——无 mousedown、
 *   无键盘处理：轨道点击走真实鼠标（pw 优先），手柄级操作走合成 TouchEvent 拖拽
 * - range 无法用轨道点击表达任意目标（中点判别会振荡），必须按手柄拖拽
 * 范围滑块 args.value 传 "a,b" 设两端（自动升序）；单值直接点轨道。勿 fill（非输入框）。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  function sliderRoot(el) {
    return el.closest('.van-slider');
  }

  function wrappersOf(root) {
    return Array.from(root.querySelectorAll('.van-slider__button-wrapper'));
  }

  function numAttr(el, name) {
    const v = el.getAttribute(name);
    return v == null ? NaN : Number(v);
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // 轨道上目标值对应的坐标（水平沿 x / 垂直沿 y，方向以 aria-orientation 为准）
  function trackPoint(root, wrapper, value) {
    const r = root.getBoundingClientRect();
    const vertical = wrapper.getAttribute('aria-orientation') === 'vertical' || root.classList.contains('van-slider--vertical');
    const min = numAttr(wrapper, 'aria-valuemin');
    const max = numAttr(wrapper, 'aria-valuemax');
    const ratio = (Math.min(Math.max(value, min), max) - min) / (max - min);
    return vertical
      ? { x: centerOf(root).x, y: r.top + ratio * r.height }
      : { x: r.left + ratio * r.width, y: centerOf(root).y };
  }

  // 轨道点击设值（单值/就近语义）：pw 真实鼠标优先，桥未注入退化合成 MouseEvent
  async function clickTrack(root, x, y) {
    if (typeof window.__ttPwRpc === 'function') {
      await window.__ttPw.page.mouse.click(x, y);
      return;
    }
    root.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }

  // 按手柄拖拽（vant 只认 touch 事件；touchmove 绑定在手柄包装层上）：
  // 合成 TouchEvent 序列 touchstart → touchmove → touchend，坐标逐步逼近目标
  async function touchDragHandle(wrapper, point) {
    const mk = (x, y) => new Touch({ identifier: Date.now() % 1000, target: wrapper, clientX: x, clientY: y });
    const from = centerOf(wrapper);
    wrapper.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [mk(from.x, from.y)] }));
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((point.x - from.x) * i) / steps;
      const y = from.y + ((point.y - from.y) * i) / steps;
      wrapper.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [mk(x, y)] }));
      await sleep(20);
    }
    wrapper.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [mk(point.x, point.y)] }));
  }

  // 设置单个手柄到目标值（一次到位 + 单轮重试）
  async function setHandle(root, wrapper, target) {
    const cur = numAttr(wrapper, 'aria-valuenow');
    if (cur === target) return;
    for (let round = 0; round < 2 && numAttr(wrapper, 'aria-valuenow') !== target; round++) {
      const pt = trackPoint(root, wrapper, target);
      await touchDragHandle(wrapper, pt);
      await sleep(150);
    }
  }

  return {
    detect(el) {
      return !!el.closest('.van-slider');
    },
    candidates(el) {
      const root = sliderRoot(el);
      if (!root) return [];
      const out = [];
      // role=slider 语义候选（ARIA 挂在手柄包装层上）
      const wrapper = el.classList.contains('van-slider__button-wrapper') ? el : wrappersOf(root)[0];
      if (wrapper) out.push({ strategy: 'role', value: 'slider', role: 'slider' });
      // 根 id 收敛的手柄 css 候选（vant 滑块 id 透传落在根节点）
      if (root.id && wrapper) out.push({ strategy: 'css', value: '#' + root.id + ' .van-slider__button-wrapper' });
      return out;
    },
    annotate(el) {
      const root = sliderRoot(el);
      if (!root) return '';
      const now = wrappersOf(root).map((h) => h.getAttribute('aria-valuenow')).join('~');
      const disabled = root.classList.contains('van-slider--disabled');
      return 'Vant 滑块（非输入框勿 fill；当前值 ' + (now || '?') + (disabled ? '，已禁用' : '') + '；用 set_value 动作设置数值，范围滑块传 "a,b" 设两端）';
    },
    actions: {
      set_value: {
        doc: '设置 Vant 滑块数值（range 按手柄 touch 拖拽，单值可点轨道；受步长限制请传步长整数倍的值）。args.value=数值或"a,b"',
        label: '滑块设置',
        preferFill: false,
        async fn(el, args) {
          const root = sliderRoot(el);
          if (!root) throw new Error('目标元素不属于 Vant 滑块（.van-slider）');
          if (root.classList.contains('van-slider--disabled')) throw new Error('滑块处于禁用状态，无法设置');
          const raw = String(args?.value ?? '').trim();
          if (!raw) throw new Error('set_value 缺少 args.value（数值，范围滑块传 "a,b"）');
          const wrappers = wrappersOf(root);
          if (!wrappers.length) throw new Error('滑块中未找到手柄（.van-slider__button-wrapper）');
          let targets;
          if (wrappers.length > 1) {
            const parts = raw.split(',').map((s) => Number(s.trim()));
            if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
              targets = parts[0] <= parts[1] ? parts : [parts[1], parts[0]];
            } else if (Number.isFinite(parts[0])) {
              // 单值打在范围滑块：按就近原则选一个手柄设置，另一端保持
              const cur = wrappers.map((h) => numAttr(h, 'aria-valuenow'));
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
            if (wrappers.length === 1) {
              // 单值：轨道点击直接设值（vant onClick 按点击坐标算值；pw 真实鼠标优先，
              // 合成 MouseEvent 兜底）；点击未生效（点到手柄被 stopPropagation 吞掉）再拖拽重试
              const pt = trackPoint(root, wrappers[0], targets[0]);
              await clickTrack(root, pt.x, pt.y);
              await sleep(150);
              if (numAttr(wrappers[0], 'aria-valuenow') !== targets[0]) {
                await setHandle(root, wrappers[0], targets[0]);
              }
            } else {
              // range：轨道点击按「与区间中点比较」选手柄，无法表达任意目标——按手柄拖拽
              await setHandle(root, wrappers[i], targets[i]);
            }
          }
          const achieved = wrappers.map((h) => numAttr(h, 'aria-valuenow'));
          const ok = targets.every((t, i) => achieved[i] === t);
          if (!ok) throw new Error('滑块终态 ' + achieved.join('~') + ' 与目标 ' + targets.join('~') + ' 不符（可能受步长限制，请传步长整数倍的值）');
          return '已设置滑块值：' + achieved.join('~');
        },
        // 页内后验：aria-valuenow 与期望一致（范围传 "a,b" 比对两端；单值对范围只要求有一端命中）
        verify(el, args) {
          const root = sliderRoot(el);
          if (!root) return false;
          const wrappers = wrappersOf(root);
          if (!wrappers.length) return false;
          const parts = String(args?.value ?? '').trim().split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
          if (!parts.length) return false;
          if (wrappers.length > 1 && parts.length === 2) {
            const ab = parts[0] <= parts[1] ? parts : [parts[1], parts[0]];
            return numAttr(wrappers[0], 'aria-valuenow') === ab[0] && numAttr(wrappers[1], 'aria-valuenow') === ab[1];
          }
          return wrappers.some((h) => numAttr(h, 'aria-valuenow') === parts[0]);
        },
      },
    },
  };
})()
