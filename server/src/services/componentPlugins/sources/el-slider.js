/**
 * 内置插件：Element（element-ui / element-plus）滑块（Slider）适配。
 *
 * 槽位：detect（.el-slider 根）/ candidates（wrapper 的 role=slider 语义候选 + wrapper id
 * 收敛的 css 候选 + 表单行 label 收割）/ annotate（当前值/禁用态）/ actions.set_value。
 *
 * set_value：手柄包装层拖拽（pw 桥真实鼠标优先，桥未注入退化页内合成拖拽）+ 键盘微调闭环
 * 对齐目标值（以 aria-valuenow 为唯一真值逐步逼近）。与 antd 版的差异：
 * - role/aria-* 属性挂在 .el-slider__button-wrapper 上（.el-slider__button 只是视觉钮）
 * - 组件点轨道为「就近手柄」语义（useSlide.getButtonRefByPercent），指定手柄必须从手柄自身拖拽
 * - 拖拽 mousemove/mouseup 监听挂在 window（合成事件从 document 冒泡可达）
 * - 禁用态为根节点 is-disabled；垂直为 is-vertical
 * 范围滑块 args.value 传 "a,b" 设两端（自动升序）；单值移动最近手柄。勿 fill（非输入框）。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  function sliderRoot(el) {
    return el.closest('.el-slider');
  }

  function wrappersOf(root) {
    return Array.from(root.querySelectorAll('.el-slider__button-wrapper'));
  }

  function numAttr(el, name) {
    const v = el.getAttribute(name);
    return v == null ? NaN : Number(v);
  }

  // 轨道几何：水平沿 x，垂直沿 y（方向以 wrapper aria-orientation / 根 is-vertical 为准）
  function axisInfo(root, wrapper) {
    const runway = root.querySelector('.el-slider__runway') || root;
    const r = runway.getBoundingClientRect();
    const vertical = wrapper.getAttribute('aria-orientation') === 'vertical' || root.classList.contains('is-vertical');
    return vertical ? { vertical: true, min: r.top, size: r.height } : { vertical: false, min: r.left, size: r.width };
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // 拖拽手柄包装层到目标坐标：pw 桥真实鼠标优先；桥未注入退化页内合成事件
  // （element-plus/element-ui 的 button 在 mousedown 后把 mousemove/mouseup 挂到 window，
  // 合成事件从 document 冒泡可达 window；先落中心再拖到目标，避免 mousedown 即改值）
  async function dragHandle(wrapper, tx, ty) {
    if (typeof window.__ttPwRpc === 'function') {
      const pw = window.__ttPw;
      const from = centerOf(wrapper);
      await pw.page.mouse.move(from.x, from.y);
      await pw.page.mouse.down();
      await pw.page.mouse.move(tx, ty, { steps: 8 });
      await pw.page.mouse.up();
      return;
    }
    const from = centerOf(wrapper);
    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: from.x, clientY: from.y }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: tx, clientY: ty }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: tx, clientY: ty }));
  }

  const KEY_CODES = { ArrowRight: 39, ArrowUp: 38, ArrowLeft: 37, ArrowDown: 40 };

  // 单次步进：真实键盘优先；合成 keydown 补 legacy keyCode
  async function pressArrow(wrapper, key) {
    wrapper.focus();
    if (typeof window.__ttPwRpc === 'function') {
      await window.__ttPw.page.keyboard.press(key);
      return;
    }
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: () => KEY_CODES[key] || 0 });
    wrapper.dispatchEvent(ev);
  }

  // 键盘微调闭环：试探单步增量 → 按差值补按 → 复核（≤3 轮；aria-valuenow 为唯一真值）
  async function nudgeTo(wrapper, target, upKey, downKey) {
    for (let round = 0; round < 3; round++) {
      const cur = numAttr(wrapper, 'aria-valuenow');
      if (cur === target) return;
      const diff = target - cur;
      if (!Number.isFinite(diff)) return;
      const key = diff > 0 ? upKey : downKey;
      const before = cur;
      await pressArrow(wrapper, key);
      await sleep(30);
      const after = numAttr(wrapper, 'aria-valuenow');
      const delta = Math.abs(after - before);
      if (!delta || !Number.isFinite(delta)) return; // 键盘步进不可用，交由复核如实报错
      let need = Math.round(Math.abs(target - after) / delta);
      if (need > 0) {
        if (need > 300) need = 300;
        for (let k = 0; k < need; k++) {
          await pressArrow(wrapper, key);
          if (k % 20 === 19) await sleep(10);
        }
        await sleep(30);
      }
    }
  }

  // 设置单个手柄：拖到目标坐标 + 键盘微调对齐
  async function setHandle(root, wrapper, target) {
    const min = numAttr(wrapper, 'aria-valuemin');
    const max = numAttr(wrapper, 'aria-valuemax');
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('手柄缺少 aria-valuemin/aria-valuemax，无法定位范围');
    const v = Math.min(Math.max(target, min), max);
    const info = axisInfo(root, wrapper);
    const ratio = (v - min) / (max - min);
    const from = centerOf(wrapper);
    const tx = info.vertical ? from.x : info.min + ratio * info.size;
    const ty = info.vertical ? info.min + ratio * info.size : from.y;
    await dragHandle(wrapper, tx, ty);
    await sleep(120);
    await nudgeTo(wrapper, v, info.vertical ? 'ArrowUp' : 'ArrowRight', info.vertical ? 'ArrowDown' : 'ArrowLeft');
  }

  return {
    detect(el) {
      return !!el.closest('.el-slider');
    },
    candidates(el) {
      const root = el.closest('.el-slider');
      if (!root) return [];
      const out = [];
      const wrappers = wrappersOf(root);
      // 表单行 label 收割（组件范围内）
      const item = el.closest('.el-form-item');
      const labelEl = item && (item.querySelector('.el-form-item__label label') || item.querySelector('.el-form-item__label'));
      const text = ((labelEl && labelEl.textContent) || '').replace(/[:：\s]+$/g, '').replace(/\s+/g, '').trim();
      const wrapper = el.classList.contains('el-slider__button-wrapper') ? el : wrappers[0];
      if (wrapper) {
        const name = wrapper.getAttribute('aria-label') || text;
        out.push({ strategy: 'role', value: 'slider', role: 'slider', ...(name ? { name } : {}) });
      }
      // id 透传位置随形态不同：单值落在手柄包装层上、范围落在根节点上——两处都收敛成候选
      if (wrapper && wrapper.id) out.push({ strategy: 'css', value: `#${wrapper.id}` });
      if (root.id && !wrapper?.id && wrappers.length === 1) out.push({ strategy: 'css', value: `#${root.id} .el-slider__button-wrapper` });
      if (text) out.push({ strategy: 'label', value: text });
      return out;
    },
    annotate(el) {
      const root = el.closest('.el-slider');
      if (!root) return '';
      const now = wrappersOf(root).map((h) => h.getAttribute('aria-valuenow')).join('~');
      const disabled = root.classList.contains('is-disabled');
      return `Element 滑块（非输入框勿 fill；当前值 ${now || '?'}${disabled ? '，已禁用' : ''}；用 set_value 动作设置数值，范围滑块传 "a,b" 设两端）`;
    },
    actions: {
      set_value: {
        doc: '设置 Element（element-ui / element-plus）滑块数值（拖拽手柄+键盘微调；范围滑块 args.value 传 "a,b" 设两端，单值移动最近手柄；受步长限制请传步长整数倍的值）。args.value=数值或"a,b"',
        label: '滑块设置',
        preferFill: false,
        async fn(el, args) {
          const root = sliderRoot(el);
          if (!root) throw new Error('目标元素不属于 Element 滑块（.el-slider）');
          if (root.classList.contains('is-disabled')) throw new Error('滑块处于禁用状态（is-disabled），无法设置');
          const raw = String(args?.value ?? '').trim();
          if (!raw) throw new Error('set_value 缺少 args.value（数值，范围滑块传 "a,b"）');
          const wrappers = wrappersOf(root);
          if (!wrappers.length) throw new Error('滑块中未找到手柄（.el-slider__button-wrapper）');
          let targets;
          if (wrappers.length > 1) {
            const parts = raw.split(',').map((s) => Number(s.trim()));
            if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
              targets = parts[0] <= parts[1] ? parts : [parts[1], parts[0]];
            } else if (Number.isFinite(parts[0])) {
              // 单值：按就近原则选择手柄（与组件点轨道的就近行为一致）
              const cur = wrappers.map((h) => numAttr(h, 'aria-valuenow'));
              const idx = Math.abs(cur[0] - parts[0]) <= Math.abs(cur[1] - parts[0]) ? 0 : 1;
              targets = idx === 0 ? [parts[0], cur[1]] : [cur[0], parts[0]];
            } else {
              throw new Error(`无法解析 args.value：${raw}（范围滑块请传 "a,b" 或数值）`);
            }
          } else {
            const n = Number(raw);
            if (!Number.isFinite(n)) throw new Error(`无法解析 args.value：${raw}（请传数值）`);
            targets = [n];
          }
          for (let i = 0; i < targets.length; i++) {
            await setHandle(root, wrappers[i], targets[i]);
          }
          const achieved = wrappers.map((h) => numAttr(h, 'aria-valuenow'));
          const ok = targets.every((t, i) => achieved[i] === t);
          if (!ok) throw new Error(`滑块终态 ${achieved.join('~')} 与目标 ${targets.join('~')} 不符（可能受步长限制，请传步长整数倍的值）`);
          return `已设置滑块值：${achieved.join('~')}`;
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
            const [a, b] = parts[0] <= parts[1] ? parts : [parts[1], parts[0]];
            return numAttr(wrappers[0], 'aria-valuenow') === a && numAttr(wrappers[1], 'aria-valuenow') === b;
          }
          return wrappers.some((h) => numAttr(h, 'aria-valuenow') === parts[0]);
        },
      },
    },
  };
})()
