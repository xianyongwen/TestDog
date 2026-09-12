/**
 * 内置插件：Ant Design 复选框（Checkbox / Checkbox.Group，兼容 antd v5/v6）适配。
 *
 * 槽位：detect（.ant-checkbox-wrapper，组容器 .ant-checkbox-group 不命中）/
 * candidates（role=checkbox 语义候选，可访问名来自包裹 label 文本）/
 * annotate（「勿 fill」+ 动作引导）/ actions.check（勾选/取消勾选，幂等）。
 *
 * DOM 契约（antd 源码 + fixture 实测，5.25.0 / 6.4.5 一致）：
 *   label.ant-checkbox-wrapper[-wrapper-checked][-wrapper-disabled][-group-item]
 *     └ span.ant-checkbox[-checked][-disabled][-indeterminate]
 *         ├ input.ant-checkbox-input[type=checkbox]（原生 input，React onChange 绑于此）
 *         └ span.ant-checkbox-inner（视觉方块）
 *     └ span.ant-checkbox-label（文本）
 * 状态真值是 input.checked（状态类是渲染结果）；受控回写可能异步落定，点击后须轮询确认。
 * 交互：合成 click 点原生 input（或经 label 转发）→ change 事件 → React onChange 更新状态。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // 归一化到 wrapper（el 可能是 wrapper / 内层 .ant-checkbox span / input 本身）
  function wrapperOf(el) {
    return el.closest('.ant-checkbox-wrapper');
  }

  // 可见文本（压缩空白，作为可访问名与诊断展示）
  function textOf(wrap) {
    return ((wrap && wrap.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  // 解析目标状态：args.checked 布尔优先，其次 args.value 别名，缺省勾选（true）
  function targetState(args) {
    const checked = args && args.checked;
    if (typeof checked === 'boolean') return checked;
    if (checked === 'true') return true;
    if (checked === 'false') return false;
    const raw = String((args && args.value) != null ? args.value : '').trim().toLowerCase();
    if (!raw) return true;
    if (['true', '1', 'yes', 'checked', '是', '勾选', '选中', '打勾'].includes(raw)) return true;
    if (['false', '0', 'no', 'unchecked', 'uncheck', '否', '取消', '取消勾选', '取消选中'].includes(raw)) return false;
    throw new Error(`无法识别的目标状态：args.value="${raw}"（传「true」勾选 /「false」取消勾选，或 args.checked 布尔值）`);
  }

  // 点击后受控回写可能异步落定（React 批处理），轮询确认而非即读
  async function settle(input, want, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (input.checked === want) return true;
      await sleep(80);
    }
    return input.checked === want;
  }

  return {
    detect(el) {
      return !!el.closest('.ant-checkbox-wrapper');
    },
    candidates(el) {
      const wrap = wrapperOf(el);
      if (!wrap) return [];
      const out = [];
      const text = textOf(wrap);
      // role=checkbox 命中隐藏的原生 input（包裹 label 提供可访问名）
      if (text) out.push({ strategy: 'role', value: 'checkbox', role: 'checkbox', name: text });
      return out;
    },
    annotate(el) {
      if (!wrapperOf(el)) return '';
      return 'Ant Design 复选框（原生 checkbox 隐藏在 label 内，勿对其 fill；点击方块或文字切换；用 check 动作勾选/取消勾选）';
    },
    actions: {
      check: {
        doc: '勾选或取消勾选 Ant Design 复选框（单个或 Checkbox.Group 中的项，含半选联动）。args.value=「true」勾选（缺省）/「false」取消勾选，也接受 args.checked 布尔值；已处于目标状态时幂等成功',
        preferFill: false,
        async fn(el, args) {
          const wrap = wrapperOf(el);
          if (!wrap) throw new Error('目标元素不属于 Ant Design 复选框（.ant-checkbox-wrapper）');
          const input = wrap.querySelector('input[type=checkbox]');
          if (!input) throw new Error('未找到复选框原生 input（.ant-checkbox-input），组件 DOM 不符合预期');
          const want = targetState(args);
          const text = textOf(wrap);
          if (input.disabled) throw new Error(`复选框「${text}」处于禁用状态，无法${want ? '勾选' : '取消勾选'}`);
          if (input.checked === want) return `已处于${want ? '勾选' : '未勾选'}状态：${text}（无需操作）`;
          input.click();
          if (!(await settle(input, want, 1200))) {
            // 受控组件可能吞掉首次合成事件：重试一次
            input.click();
            if (!(await settle(input, want, 1200))) {
              throw new Error(`${want ? '勾选' : '取消勾选'}「${text}」后验失败（input.checked=${input.checked}）。请确认组件是否受外部状态控制或存在联动限制`);
            }
          }
          return `${want ? '已勾选' : '已取消勾选'}：${text}`;
        },
        // 页内后验：轮询 input.checked 与目标状态一致，拦截「点了但没勾上」的假成功
        async verify(el, args) {
          const wrap = wrapperOf(el);
          if (!wrap) return false;
          const input = wrap.querySelector('input[type=checkbox]');
          if (!input) return false;
          let want = false;
          try { want = targetState(args); } catch { return false; }
          return await settle(input, want, 500);
        },
      },
    },
  };
})()
