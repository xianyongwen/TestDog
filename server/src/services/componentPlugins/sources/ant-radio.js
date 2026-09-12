/**
 * 内置插件：Ant Design 单选按钮（Radio / Radio.Group / Radio.Button，兼容 antd v5/v6）适配。
 *
 * 槽位：detect（.ant-radio-wrapper / .ant-radio-button-wrapper / 组容器 .ant-radio-group）/
 * candidates（单选项 role=radio 语义候选、组容器 role=radiogroup）/
 * annotate（「勿 fill」+ 动作引导）/ actions.select（组内按可见文本选中，幂等）。
 *
 * DOM 契约（antd 源码 + fixture 实测，5.25.0 / 6.4.5 一致）：
 *   普通形态 label.ant-radio-wrapper[-wrapper-checked][-wrapper-disabled]
 *     └ span.ant-radio[-checked][-disabled] > input.ant-radio-input[type=radio] + span.ant-radio-inner
 *     └ span.ant-radio-label（文本）
 *   按钮形态 label.ant-radio-button-wrapper[-wrapper-checked] > span.ant-radio-button >
 *     input.ant-radio-button-input；组容器 div.ant-radio-group[role=radiogroup]
 * rc-radio 复用 rc-checkbox 引擎（type=radio）：状态真值是 input.checked；同组互斥由
 * 选中后 React 重渲染完成，受控回写可能异步落定，点击后须轮询确认。
 * select 语义：对组容器或组内任一单选项调用均可，按可见文本在组内定位目标项后点其原生 input。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  const ITEM_SEL = '.ant-radio-wrapper, .ant-radio-button-wrapper';
  const GROUP_SEL = '.ant-radio-group';

  // 单选项归一化（el 可能是 wrapper / 内层 span / input 本身），组容器返回 null
  function itemOf(el) {
    return el.closest(ITEM_SEL);
  }

  // 可见文本（压缩空白，作为可访问名、选项匹配与诊断展示）
  function textOf(item) {
    return ((item && item.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  // 文本归一比对（去全部空白，与 el-select 的 label 收割同口径）
  function norm(text) {
    return String(text || '').replace(/\s+/g, '');
  }

  // 选中范围：所在组容器；组外的独立单选以其自身 wrapper 为范围
  function scopeOf(el) {
    return el.closest(GROUP_SEL) || itemOf(el) || el;
  }

  // 在范围内按文本找目标单选项
  function findItem(scope, want) {
    const items = Array.from(scope.querySelectorAll(ITEM_SEL));
    return items.find((it) => norm(textOf(it)) === norm(want)) || null;
  }

  // 点击后受控回写可能异步落定（React 批处理），轮询确认而非即读
  async function settle(input, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (input.checked) return true;
      await sleep(80);
    }
    return input.checked;
  }

  // 选中目标项（幂等；受控组件可能吞掉首次合成事件，重试一次）
  async function pick(target) {
    const input = target.querySelector('input[type=radio]');
    if (!input) throw new Error(`单选项「${textOf(target)}」未找到原生 input（.ant-radio-input / .ant-radio-button-input），组件 DOM 不符合预期`);
    if (input.disabled) throw new Error(`单选项「${textOf(target)}」处于禁用状态，无法选中`);
    if (input.checked) return `已处于选中状态：${textOf(target)}（无需操作）`;
    input.click();
    if (!(await settle(input, 1200))) {
      input.click();
      if (!(await settle(input, 1200))) {
        throw new Error(`选中「${textOf(target)}」后验失败（input.checked=${input.checked}）。请确认组件是否受外部状态控制或存在联动限制`);
      }
    }
    return `已选中：${textOf(target)}`;
  }

  return {
    detect(el) {
      return !!el.closest(`${ITEM_SEL}, ${GROUP_SEL}`);
    },
    candidates(el) {
      const item = itemOf(el);
      const group = el.closest(GROUP_SEL);
      const out = [];
      if (item) {
        const text = textOf(item);
        // role=radio 命中隐藏的原生 input（包裹 label 提供可访问名）
        if (text) out.push({ strategy: 'role', value: 'radio', role: 'radio', name: text });
      } else if (group) {
        // 组容器候选：供对组整体调用 select 动作时定位
        out.push({ strategy: 'role', value: 'radiogroup', role: 'radiogroup' });
      }
      return out;
    },
    annotate(el) {
      const item = itemOf(el);
      if (item) {
        return 'Ant Design 单选按钮（原生 radio 隐藏在 label 内，勿对其 fill；组内点击选其一，选中后不可取消；用 select 动作按文本选中）';
      }
      if (el.closest(GROUP_SEL)) {
        return 'Ant Design 单选按钮组（对组容器调用 select 动作即可按可见文本选中对应项，无需先点开）';
      }
      return '';
    },
    actions: {
      select: {
        doc: '在 Ant Design 单选按钮组（Radio.Group，含 Radio.Button 按钮形态）中选择选项（按可见文本在组内定位并点击，幂等）。对组容器或组内任一单选项调用均可；args.value=目标单选项可见文本',
        preferFill: false,
        async fn(el, args) {
          const want = String(args?.value || '').trim();
          const item = itemOf(el);
          const group = el.closest(GROUP_SEL);
          if (!item && !group) throw new Error('目标元素不属于 Ant Design 单选按钮（.ant-radio-wrapper / .ant-radio-button-wrapper / .ant-radio-group）');
          if (!want && !item) {
            const scope = group;
            const items = Array.from(scope.querySelectorAll(ITEM_SEL)).map(textOf).filter(Boolean).slice(0, 10);
            throw new Error(`对单选组容器调用 select 缺少 args.value（目标单选项可见文本）。当前可选：${items.join(' / ') || '无'}`);
          }
          // 有 value：在组内按文本定位（传入的 el 是另一项时也以 value 为准）；无 value：点击传入项
          const target = want ? findItem(scopeOf(el), want) : item;
          if (!target) {
            const items = Array.from(scopeOf(el).querySelectorAll(ITEM_SEL)).map(textOf).filter(Boolean).slice(0, 10);
            throw new Error(`单选组中未找到选项：${want}（当前可选：${items.join(' / ') || '无'}）。请从当前可选列表中选取，或修正选项文本。`);
          }
          return await pick(target);
        },
        // 页内后验：目标单选项 input.checked 为真（轮询受控落定），拦截「点了但没选上」的假成功
        async verify(el, args) {
          const want = String(args?.value || '').trim();
          const item = itemOf(el);
          const group = el.closest(GROUP_SEL);
          if (!item && !group) return false;
          const target = want ? findItem(scopeOf(el), want) : item;
          if (!target) return false;
          const input = target.querySelector('input[type=radio]');
          if (!input) return false;
          return await settle(input, 500);
        },
      },
    },
  };
})()
