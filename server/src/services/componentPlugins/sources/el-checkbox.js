/**
 * 内置插件：Element（element-ui / element-plus）复选框（el-checkbox / el-checkbox-button /
 * el-checkbox-group 中的项）适配。
 *
 * 槽位：detect（.el-checkbox / .el-checkbox-button，组容器 .el-checkbox-group 不命中）/
 * candidates（role=checkbox 语义候选，可访问名来自包裹 label 文本）/
 * annotate（「勿 fill」+ 动作引导）/ actions.check（勾选/取消勾选，幂等）。
 *
 * DOM 契约（源码 + fixture 实测，element-ui 2.15 / element-plus 2.8 一致）：
 *   label.el-checkbox[.is-checked][.is-disabled][.is-bordered]（el-plus 在 form-item 关联时根可为 span）
 *     └ span.el-checkbox__input[.is-checked][.is-disabled][.is-indeterminate]
 *         ├ input.el-checkbox__original[type=checkbox]（原生 input，@change/@focus 绑于此）
 *         └ span.el-checkbox__inner（视觉方块）
 *     └ span.el-checkbox__label（文本）
 *   按钮形态：label.el-checkbox-button > input.el-checkbox-button__original + span.el-checkbox-button__inner
 * 状态真值是 input.checked（is- 类是渲染结果）；Vue v-model 在 change 时读 target.checked，
 * 受控回写可能异步落定，点击后须轮询确认。element-ui 的 el-checkbox-button 在 label 上带
 * role="checkbox"（原生 input 之上多一层语义元素，role 候选两者都能定位）。
 */
(() => {
  if (!window.__ttPluginRuntimeInstalled__) return null; // 未注入运行时框架时无槽位可注册（平台封装层兜底空对象）

  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // 归一化到根节点（el 可能是根 / 内层 .el-checkbox__input span / input 本身）
  function rootOf(el) {
    return el.closest('.el-checkbox, .el-checkbox-button');
  }

  // 可见文本（压缩空白，作为可访问名与诊断展示）
  function textOf(root) {
    return ((root && root.textContent) || '').replace(/\s+/g, ' ').trim();
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

  // 点击后受控回写可能异步落定（Vue nextTick），轮询确认而非即读
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
      return !!el.closest('.el-checkbox, .el-checkbox-button');
    },
    candidates(el) {
      const root = rootOf(el);
      if (!root) return [];
      const out = [];
      const text = textOf(root);
      // role=checkbox 命中隐藏的原生 input（element-ui 按钮形态则命中带 role 的根 label）
      if (text) out.push({ strategy: 'role', value: 'checkbox', role: 'checkbox', name: text });
      return out;
    },
    annotate(el) {
      if (!rootOf(el)) return '';
      return 'Element 复选框（原生 checkbox 隐藏在 label 内，勿对其 fill；点击方块或文字切换；用 check 动作勾选/取消勾选）';
    },
    actions: {
      check: {
        doc: '勾选或取消勾选 Element（element-ui / element-plus）复选框（单个或 el-checkbox-group 中的项，含按钮形态与全选半选联动）。args.value=「true」勾选（缺省）/「false」取消勾选，也接受 args.checked 布尔值；已处于目标状态时幂等成功',
        preferFill: false,
        async fn(el, args) {
          const root = rootOf(el);
          if (!root) throw new Error('目标元素不属于 Element 复选框（.el-checkbox / .el-checkbox-button）');
          const input = root.querySelector('input[type=checkbox]');
          if (!input) throw new Error('未找到复选框原生 input（.el-checkbox__original / .el-checkbox-button__original），组件 DOM 不符合预期');
          const want = targetState(args);
          const text = textOf(root);
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
          const root = rootOf(el);
          if (!root) return false;
          const input = root.querySelector('input[type=checkbox]');
          if (!input) return false;
          let want = false;
          try { want = targetState(args); } catch { return false; }
          return await settle(input, want, 500);
        },
      },
    },
  };
})()
