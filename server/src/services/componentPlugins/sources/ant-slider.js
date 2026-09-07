/**
 * 内置插件：Ant Design 滑块（Slider）适配。
 *
 * 槽位：detect（.ant-slider 根）/ candidates（handle 的 role=slider 语义候选 + 根 id 收敛的
 * css 候选 + 表单行 label 收割）/ annotate（当前值/范围/禁用态）/ actions.set_value。
 *
 * set_value：手柄拖拽（pw 桥真实鼠标优先，桥未注入退化页内合成拖拽）+ 键盘微调闭环对齐
 * 目标值（拖拽落点受像素取整/步长吸附影响，以 aria-valuenow 为唯一真值逐步逼近）。
 * range 双滑块：args.value 传 "a,b" 设两端（自动升序排列）；单值移动最近手柄（与组件
 * 点轨道就近行为一致）。垂直滑块按 aria-orientation 走 y 轴。
 * 平台原生交互对滑块只能点中手柄、无法拖到指定值——数值设置统一走本动作（勿 fill）。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  function sliderRoot(el) {
    return el.closest('.ant-slider');
  }

  function handlesOf(root) {
    // 过滤拖拽/悬停后出现的 tooltip 锚点 ghost handle（aria-hidden="true"、无 aria-valuenow）
    return Array.from(root.querySelectorAll('.ant-slider-handle')).filter((h) => h.getAttribute('aria-hidden') !== 'true');
  }

  function numAttr(el, name) {
    const v = el.getAttribute(name);
    return v == null ? NaN : Number(v);
  }

  // 轨道几何：水平沿 x（rail 宽），垂直沿 y（rail 高）；方向以手柄 aria-orientation 为准
  function axisInfo(root, handle) {
    const rail = root.querySelector('.ant-slider-rail') || root;
    const r = rail.getBoundingClientRect();
    const vertical = handle.getAttribute('aria-orientation') === 'vertical' || root.classList.contains('ant-slider-vertical');
    return vertical ? { vertical: true, min: r.top, size: r.height } : { vertical: false, min: r.left, size: r.width };
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // 拖拽手柄到目标坐标：pw 桥真实鼠标优先（auto-wait/真实事件链），桥未注入退化页内合成事件
  // （rc-slider 在 mousedown 后把 mousemove/mouseup 挂到 document，合成事件冒泡可达）
  async function dragHandle(handle, tx, ty) {
    if (typeof window.__ttPwRpc === 'function') {
      const pw = window.__ttPw;
      const from = centerOf(handle);
      await pw.page.mouse.move(from.x, from.y);
      await pw.page.mouse.down();
      await pw.page.mouse.move(tx, ty, { steps: 8 });
      await pw.page.mouse.up();
      return;
    }
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: tx, clientY: ty }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: tx, clientY: ty }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: tx, clientY: ty }));
  }

  const KEY_CODES = { ArrowRight: 39, ArrowUp: 38, ArrowLeft: 37, ArrowDown: 40 };

  // 单次步进：真实键盘优先；合成 keydown 补 legacy keyCode（rc-slider 按 keyCode 计步）
  async function pressArrow(handle, key) {
    handle.focus();
    if (typeof window.__ttPwRpc === 'function') {
      await window.__ttPw.page.keyboard.press(key);
      return;
    }
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: () => KEY_CODES[key] || 0 });
    handle.dispatchEvent(ev);
  }

  // 键盘微调闭环：试探单步增量 → 按差值补按 → 复核（≤3 轮；aria-valuenow 为唯一真值）
  async function nudgeTo(handle, target, upKey, downKey) {
    for (let round = 0; round < 3; round++) {
      const cur = numAttr(handle, 'aria-valuenow');
      if (cur === target) return;
      const diff = target - cur;
      if (!Number.isFinite(diff)) return;
      const key = diff > 0 ? upKey : downKey;
      const before = cur;
      await pressArrow(handle, key);
      await sleep(30);
      const after = numAttr(handle, 'aria-valuenow');
      const delta = Math.abs(after - before);
      if (!delta || !Number.isFinite(delta)) return; // 键盘步进不可用，交由复核如实报错
      let need = Math.round(Math.abs(target - after) / delta);
      if (need > 0) {
        if (need > 300) need = 300;
        for (let k = 0; k < need; k++) {
          await pressArrow(handle, key);
          if (k % 20 === 19) await sleep(10);
        }
        await sleep(30);
      }
    }
  }

  // 设置单个手柄：拖到目标坐标 + 键盘微调对齐
  async function setHandle(root, handle, target) {
    const min = numAttr(handle, 'aria-valuemin');
    const max = numAttr(handle, 'aria-valuemax');
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('手柄缺少 aria-valuemin/aria-valuemax，无法定位范围');
    const v = Math.min(Math.max(target, min), max);
    const info = axisInfo(root, handle);
    const ratio = (v - min) / (max - min);
    const from = centerOf(handle);
    const tx = info.vertical ? from.x : info.min + ratio * info.size;
    const ty = info.vertical ? info.min + ratio * info.size : from.y;
    await dragHandle(handle, tx, ty);
    await sleep(120);
    await nudgeTo(handle, v, info.vertical ? 'ArrowUp' : 'ArrowRight', info.vertical ? 'ArrowDown' : 'ArrowLeft');
  }

  return {
    detect(el) {
      return !!el.closest('.ant-slider');
    },
    candidates(el) {
      const root = el.closest('.ant-slider');
      if (!root) return [];
      const out = [];
      const handles = handlesOf(root);
      // 表单行 label 收割（组件范围内）：滑块缺可访问名时从所在表单行取 label 文本
      const item = el.closest('.ant-form-item');
      const labelEl = item && (item.querySelector('.ant-form-item-label label') || item.querySelector('.ant-form-item-label'));
      const text = ((labelEl && labelEl.textContent) || '').replace(/[:：\s]+$/g, '').replace(/\s+/g, '').trim();
      const handle = el.classList.contains('ant-slider-handle') ? el : handles[0];
      if (handle) {
        const name = handle.getAttribute('aria-label') || text;
        out.push({ strategy: 'role', value: 'slider', role: 'slider', ...(name ? { name } : {}) });
      }
      // 根有 id 且单手柄时产出唯一性强的收敛候选
      if (root.id && handles.length === 1) out.push({ strategy: 'css', value: `#${root.id} .ant-slider-handle` });
      if (text) out.push({ strategy: 'label', value: text });
      return out;
    },
    annotate(el) {
      const root = el.closest('.ant-slider');
      if (!root) return '';
      const now = handlesOf(root).map((h) => h.getAttribute('aria-valuenow')).join('~');
      const disabled = root.classList.contains('ant-slider-disabled');
      return `Ant Design 滑块（非输入框勿 fill；当前值 ${now || '?'}${disabled ? '，已禁用' : ''}；用 set_value 动作设置数值，范围滑块传 "a,b" 设两端）`;
    },
    actions: {
      set_value: {
        doc: '设置 Ant Design 滑块数值（拖拽手柄+键盘微调；范围滑块 args.value 传 "a,b" 设两端，单值移动最近手柄；受步长限制请传步长整数倍的值）。args.value=数值或"a,b"',
        label: '滑块设置',
        preferFill: false,
        async fn(el, args) {
          const root = sliderRoot(el);
          if (!root) throw new Error('目标元素不属于 Ant Design 滑块（.ant-slider）');
          if (root.classList.contains('ant-slider-disabled')) throw new Error('滑块处于禁用状态（ant-slider-disabled），无法设置');
          const raw = String(args?.value ?? '').trim();
          if (!raw) throw new Error('set_value 缺少 args.value（数值，范围滑块传 "a,b"）');
          const handles = handlesOf(root);
          if (!handles.length) throw new Error('滑块中未找到手柄（.ant-slider-handle）');
          let targets;
          if (handles.length > 1) {
            const parts = raw.split(',').map((s) => Number(s.trim()));
            if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
              targets = parts[0] <= parts[1] ? parts : [parts[1], parts[0]];
            } else if (Number.isFinite(parts[0])) {
              // 单值：按就近原则选择手柄（与组件点轨道的就近行为一致）
              const cur = handles.map((h) => numAttr(h, 'aria-valuenow'));
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
            await setHandle(root, handles[i], targets[i]);
          }
          const achieved = handles.map((h) => numAttr(h, 'aria-valuenow'));
          const ok = targets.every((t, i) => achieved[i] === t);
          if (!ok) throw new Error(`滑块终态 ${achieved.join('~')} 与目标 ${targets.join('~')} 不符（可能受步长限制，请传步长整数倍的值）`);
          return `已设置滑块值：${achieved.join('~')}`;
        },
        // 页内后验：aria-valuenow 与期望一致（范围传 "a,b" 比对两端；单值对范围只要求有一端命中）
        verify(el, args) {
          const root = sliderRoot(el);
          if (!root) return false;
          const handles = handlesOf(root);
          if (!handles.length) return false;
          const parts = String(args?.value ?? '').trim().split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
          if (!parts.length) return false;
          if (handles.length > 1 && parts.length === 2) {
            const [a, b] = parts[0] <= parts[1] ? parts : [parts[1], parts[0]];
            return numAttr(handles[0], 'aria-valuenow') === a && numAttr(handles[1], 'aria-valuenow') === b;
          }
          return handles.some((h) => numAttr(h, 'aria-valuenow') === parts[0]);
        },
      },
    },
  };
})()
