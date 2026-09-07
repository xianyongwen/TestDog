/**
 * 测试工具「组件适配插件」开发模板 —— 自研可搜索下拉 demo-select
 *
 * 这是什么：
 *   一个「插件定义对象」——本文件是求值为该对象的表达式，让 AI 生成测试步骤时能
 *   准确理解并操作页面里的自研组件。四插槽：detect（归属判定）/ candidates
 *   （候选定位器）/ annotate（语义标注）/ actions（语义动作）。
 *   无需 IIFE 外壳、无需调用 register、无需指定 id——平台注入时自动封装 register
 *   并写入 id（= 平台插件名）。需要内部辅助函数/共享状态时，改为 IIFE 表达式
 *   返回对象即可：(() => { ...辅助...; return {...}; })
 *   语法可直接使用 ES6+（const / 箭头函数 / 可选链等）：插件只在被测网站的
 *   Playwright Chromium 里执行（evergreen 内核），无兼容性降级诉求，无需构建。
 *   动作与后验 fn 的第三参 pw 是「Playwright 桥」：可在动作内调用真实 Playwright API
 *   （如 await pw.page.keyboard.press('Escape')、await pw(el).locator('.item').click()），
 *   仅在平台外壳与本 harness 内可用；完整契约见 references/plugin-api.md，硬性红线见 references/red-lines.md。
 *
 * 开箱验收（解压后在本目录执行，会弹出浏览器窗口）：
 *   npm install && npx playwright install chromium
 *   改造 index.js 前请先阅读本注释与 TODO(改造点) 标记。
 */
({
    // —— 插槽一 detect：组件归属判定 ——
    // 宽进：所有你负责的组件都应命中；但注册了 actions 的插件必须精确命中
    //（它是语义动作分发的依据，宽泛类名会把动作误派给其他组件，详见 references/plugin-api.md）
    detect: (el) => {
      // TODO(改造点 1/2)：替换为你的组件根类名与弹层类名
      return !!el.closest('.demo-select, .demo-select-popup');
    },

    // —— 插槽二 candidates：候选定位器 ——
    // 平台会逐个验证「页内唯一 + 真实定位 count===1 且同节点」，不唯一的会被静默丢弃——宁可少而准。
    candidates: (el) => {
      const out = [];

      // 触发器部分（不在弹层内）
      const trigger = el.closest('.demo-select');
      if (trigger && !el.closest('.demo-select-popup')) {
        if (el === trigger) {
          out.push({ strategy: 'css', value: '.demo-select' });
          // 表单 label 收割：同表单行的 <label> 文本作为 label 候选
          const label = el.closest('.form-row')?.querySelector('label');
          if (label) out.push({ strategy: 'label', value: label.textContent.trim() });
        }
        // 输入框
        if (el.tagName === 'INPUT') {
          const ph = el.getAttribute('placeholder');
          if (ph) out.push({ strategy: 'placeholder', value: ph });
        }
      }

      // 弹层部分：portal 到 body 下且实例常驻——只对可见弹层产候选
      //（隐藏弹层的候选会被唯一性校验淘汰，等于白写，见 references/red-lines.md 第 6 条）
      const popup = el.closest('.demo-select-popup');
      if (popup?.classList.contains('is-open')) {
        if (el === popup) {
          out.push({ strategy: 'css', value: '.demo-select-popup' });
        }
        if (el.classList.contains('demo-select-option')) {
          const text = el.textContent.trim();
          if (text) {
            // 弹层内容必须 scope 锚定弹层容器，否则命中常驻的隐藏实例
            out.push({ strategy: 'text', value: text, scope: { strategy: 'css', value: '.demo-select-popup' } });
          }
          const dv = el.getAttribute('data-value');
          if (dv) out.push({ strategy: 'css', value: `.demo-select-popup [data-value="${dv}"]` });
        }
      }

      return out;
    },

    // —— 插槽三 annotate：一句话语义标注（拼进页面快照直接喂给 AI，写「AI 需要知道的操作事实」）——
    annotate: (el) => {
      if (el.closest('.demo-select-popup')) return 'demo-select 的选项弹层（点击选项即选中并回显到输入框）';
      if (el.closest('.demo-select')) return '自研可搜索下拉 demo-select：输入可过滤，Enter 或点击选项选择（非原生 select，平台原生 select 步骤不适用）';
      return '';
    },

    // —— 插槽四 actions：语义动作 ——
    // 进入动作词表，LLM 会把组件操作拆成一个语义动作步；结果三态：
    // 返回字符串 = success / throw = failed / 返回 {status, message} = 显式三态（uncertain 交平台效果哈希兜底）
    actions: {
      select: {
        doc: '选择下拉选项（args.value=选项文本，如 上海）。真实 fill+Enter 优先，失败走页内点击选项。',
        // 可选展示名：动作下拉/步骤标签优先显示（缺省显示动作名 select 本身）
        label: '选择选项',
        // 可输入控件一律 preferFill: true：平台先试 Playwright fill+Enter（画面有变化即成功），失败才进本 fn
        preferFill: true,
        async fn(el, args, pw) {
          const value = String(args?.value || '').trim();
          if (!value) throw new Error('缺少参数 value（要选中的选项文本）');

          // el 可能因重渲染失联，必要时重新查找
          const root = el?.closest?.('.demo-select') || document.querySelector('.demo-select');
          if (!root) throw new Error('页面上未找到 .demo-select 组件');
          const input = root.querySelector('input');

          // 幂等：已是目标终态则直接返回（匹配链上前一个插件可能已把操作做了一半）
          if (input && input.value === value && root.classList.contains('is-selected')) return `已选择：${value}`;

          // TODO(改造点 2/2)：把「打开弹层 → 定位选项 → 选中 → 等回显」替换为你组件的交互闭环
          //（状态相关的多步操作必须在 fn 内闭环，禁止返回「需要点 N 次」让外壳拆步）

          // 1) 打开弹层（已开则跳过，幂等）
          let popup = document.querySelector('.demo-select-popup');
          if (!popup?.classList.contains('is-open')) {
            root.click(); // 页内合成点击用于页内闭环（平台外壳已优先 Playwright 真实交互）
          }
          popup = await window.__ttPickWait(() => {
            const p = document.querySelector('.demo-select-popup');
            return p?.classList.contains('is-open') ? p : null;
          }, 5000);

          // 2) 填入目标文本触发过滤，等待匹配选项出现
          if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const option = await window.__ttPickWait(
            () => [...popup.querySelectorAll('.demo-select-option')].find(
              (o) => o.textContent.trim() === value && o.style.display !== 'none',
            ),
            3000,
          );

          // 3) 点击选项选中。页内合成 click 已够用；需要真实键盘/鼠标事件、auto-wait 定位等
          //    Playwright 能力时用第三参 pw 桥（跨进程调用，勿放高频循环；详见 references/plugin-api.md）：
          //    const rootHandle = await pw(root);            // 页内元素 → Node 侧句柄
          //    await rootHandle.locator('input').fill(value); // auto-wait 真实 fill
          //    await pw.page.keyboard.press('Escape');        // 真实键盘事件
          //    想改走真实点击时：取消下一行注释、注释掉 option.click() 即可
          // await pw(option).click();
          option.click();

          // 4) 等待真终态：组件选中标记 + 输入框回显
          //（注意不能只看回显——第 2 步已把筛选文本填进输入框，只查回显会把「筛选了但没点上」误判成 success）
          await window.__ttPickWait(
            () => root.classList.contains('is-selected') && (!input || input.value === value),
            3000,
          );
          return `已选择：${value}`;
        },
        // 可选页内后验：校验终态（拦截「点了但没选上」的假成功；后验不过视同 failed）
        verify: (el, args) => {
          const value = String(args?.value || '').trim();
          const root = el?.closest?.('.demo-select') || document.querySelector('.demo-select');
          const input = root?.querySelector('input');
          return !!root && root.classList.contains('is-selected') && !!input && input.value === value;
        },
      },
    },
})
