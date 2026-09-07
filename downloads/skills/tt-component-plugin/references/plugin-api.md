# 插件 API 参考

## 插件源码形态与 register(def)

插件源码是**一个求值为插件定义对象的表达式**（对象字面量；需要辅助函数/共享状态时用 IIFE 表达式返回对象）。
平台注入时自动封装注册与 id：`window.__ttPluginRegistry__.register(Object.assign((源码) || {}, { id: 平台插件名 }))`——
无需 IIFE 外壳、无需调用 register、无需指定 id。需要内部辅助函数/共享状态时用 IIFE 表达式返回对象。

```ts
// 平台封装后的实际调用（作者无需编写）：
window.__ttPluginRegistry__.register({
  id: string,                       // 平台注入（= 平台插件名，全库唯一；重复注册被忽略）
  detect?: (el: Element) => boolean | { matched: boolean; version?: string; variant?: string },
  candidates?: (el: Element) => PluginCandidate[],
  annotate?: (el: Element) => string,
  actions?: Record<string, PluginActionDef>,
});
```

## 插槽一：detect — 组件归属判定

平台会对页面元素逐个调用（含 hover/快照/候选生成）。要**宽进**：所有你负责的组件都应命中。

```js
detect(el) {
  return !!el.closest('.my-widget, .my-widget-popup');
}
```

返回 `{ matched: true, version: '2.3.1' }` 可携带版本（框架版本探测时有用）；多框架适配插件可用 `variant` 标记变体（如 `'antd'` / `'element'`），供日志与内部分发。

> **注意**：注册了 actions 的插件，detect 是语义动作的**分发依据**（`resolveChain` 按其过滤匹配链），必须**精确命中你负责的组件**（如 `.my-select`，而非宽泛的类名前缀通配），避免动作被误派到错误插件；只写 candidates/annotate 的插件宽进无妨（候选有唯一性验证兜底，annotate 误命中无害）。

## 插槽二：candidates — 候选定位器增强（核心）

返回候选数组，平台会**逐一验证**（页内唯一性 + 真实定位 count===1 且命中同一节点），只有验证通过的才进入生成与落库。因此：

- **少而准胜过多而全**：不唯一的候选会被自动丢弃，不会误点
- 优先产出 `role`（带 name）、`placeholder`、`testid` 类结构性候选；`text` 类仅当文本在本组件内唯一
- 弹层内容（下拉/日期面板 portal 到 body 下）用 `scope` 先锚定容器

```js
candidates(el) {
  const out = [];
  const item = el.closest('.my-form-row');
  const label = item?.querySelector('.my-form-row__label')?.textContent?.trim();
  if (el.closest('.my-select') && !el.closest('.my-select-popup')) {
    out.push({ strategy: 'role', value: 'combobox', role: 'combobox', ...(label ? { name: label } : {}) });
  }
  const input = el.tagName === 'INPUT' ? el : el.querySelector('input');
  const ph = input?.getAttribute('placeholder');
  if (ph && input === el) out.push({ strategy: 'placeholder', value: ph });
  if (label) out.push({ strategy: 'label', value: label });
  // 弹层内元素：scope 锚定可见弹层容器
  const popup = el.closest('.my-select-popup');
  if (popup && el.classList.contains('my-select-option')) {
    out.push({ strategy: 'text', value: el.textContent.trim(), scope: { strategy: 'css', value: '.my-select-popup' } });
  }
  return out;
}
```

候选形状（与平台 Locator 同构）：

| 字段 | 说明 |
|---|---|
| strategy | testid / role / label / placeholder / text / alt / title / css / xpath |
| value | 表达式（css 选择器、文本、testid 值…） |
| role / name | strategy=role 时的角色与可访问名 |
| scope | 可选：先定位容器，再在容器内定位主元素 |

## 插槽三：annotate — 语义标注

返回一句话（拼接进页面快照，直接喂给 AI）。写「AI 需要知道的操作事实」：

```js
annotate(el) {
  if (el.closest('.my-select')) return '我的下拉（非原生 select，请勿对其 fill；选项容器为 .my-select-popup）';
  return '';
}
```

## 插槽四：actions — 注册组件语义动作

页内异步函数。动作进入项目「动作词表」（预拆分 prompt 与生成期统一 `component_action` 工具共用）。
执行外壳（三级降级）：
1. `preferFill: true` 的动作先尝试 Playwright 真实 fill+Enter（画面有变化即成功），失败才进匹配链
2. 平台按「`detect(el)` 命中 && actions 含该动作」过滤插件组成匹配链（`resolveChain`，preset 优先级序），逐个调用 fn：`success` 即成、`failed` 落链上下一个、`uncertain` 由平台以页面效果哈希兜底判定
3. 匹配链全败回落原生交互 tier，仍失败才回灌 LLM

成功后平台 emit 带 `pluginAction` 的步骤（`action` 为语义动作名，`pluginId` 为命中提示）；回放按语义动作链重匹配（`pluginId` 仅作优先尝试）。

```js
actions: {
  set_date: {
    doc: '设置日期（args.value=YYYY-MM-DD）。fill 优先，失败走面板导航翻页点击。',
    // 可选展示名：动作下拉/步骤标签优先显示（缺省显示动作名 set_date 本身）
    label: '设置日期',
    preferFill: true,
    async fn(el, args, pw) {
      const text = String(args?.value || '').trim();
      // ...点击打开面板、循环翻页、等待 DOM 刷新、点击目标单元格...
      // 等待用平台提供的轮询辅助：
      const panel = await window.__ttPickWait(() => document.querySelector('.my-date-panel:not([hidden])'), 5000);
      // ...点击目标格...
      return '已设置日期：' + text;   // 返回人类可读结果，会回灌给模型
    },
    // 可选页内后验：校验终态（如输入框回显），拦截"点了但没设上"的假成功。
    // verify 可为 async（如需轮询等提交落定），平台外壳会 await 其结果
    verify(el, args) {
      const input = el.closest('.my-date-editor')?.querySelector('input');
      return !!input && input.value === String(args?.value || '');
    },
  },
}
```

要点：
- `fn(el, args)` 的 el 可能与打开面板前的元素失联（重渲染），必要时重新 `document.querySelector`
- **步数状态相关的操作（如「翻页到目标月」）必须做成页内闭环**，绝不返回「需要点 N 次」让外壳拆步
- 页内事件为合成事件（isTrusted=false），对自家组件的监听器通常有效；平台外壳已优先走真实交互
- **动作内别持有元素引用跨越重渲染**：React/Vue 更新会替换 DOM 节点，点击后等待/校验时要在轮询内**重新查询**目标（如 `__ttPickWait(() => { const it = …重新 querySelector…; return …; })`），持有旧引用会拿到已失联的节点
- **结果三态协议**：返回字符串 = success（向后兼容）、throw = failed、返回 `{ status: 'success'|'failed'|'uncertain', message }` = 显式三态（uncertain 交由平台效果校验兜底）
- **动作要幂等/副作用安全**：匹配链上前一个插件失败后，下一个插件可能重试同一操作（弹层可能已被上一个打开一半）

## pw — Playwright 桥（动作/后验的第三参数）

`fn(el, args, pw)` / `verify(el, args, pw)` 的第三参 `pw` 是平台注入的 **Playwright 桥**：
在页内插件中调用**真实 Playwright API**（Node 侧执行，跨进程 RPC）。适合页内 DOM 操作做不到的事：
真实键盘/鼠标事件（auto-wait、hover、拖拽）、等待网络空闲、读取页面 URL/标题、操作 Locator 链等。

```js
async fn(el, args, pw) {
  // 1) 根对象：page / context，属性链按方法调用转发（链式，auto-wait）
  await pw.page.keyboard.press('Escape');                       // 真实键盘事件
  await pw.page.locator('.my-select-popup .option', { hasText: '上海' }).click({ timeout: 3000 });
  await pw.page.waitForLoadState('networkidle');                // 等网络空闲
  const url = await pw.page.url();                              // 读页面状态

  // 2) pw(el)：页内元素 → 作用域限定在该元素的 Locator（可继续链式调用）
  const root = await pw(el);                                    // el 是动作拿到的页内元素
  await root.locator('input').fill('上海');                      // auto-wait 真实 fill
  await root.waitFor({ state: 'visible' });

  // 3) 返回值：原始值/纯对象直接返回；Locator/Page 等复杂对象回传为可续链视图；
  //    Playwright 超时等错误以 rejected promise 抛出（写进 failed message，指导换路径）
  const count = await pw.page.locator('.my-option').count();
}
```

规则与边界：

- **可用性**：仅平台外壳（生成 / 回放 / 插件试运行 / harness 离线验收与 `--hold` 自测）内注入；
  不在平台外壳内运行（如把插件拷进任意网页控制台）时调用 pw 会报「桥未注入」。
  detect/candidates/annotate 是同步页内插槽，**拿不到 pw**（不需要跨进程调用的逻辑仍留在页内做，更快）
- **性能**：每次 pw 调用是跨进程往返（毫秒级），**不要放进高频轮询循环**；等待类需求交给
  Playwright auto-wait 或传 `{ timeout }`，页内等待用 `__ttPickWait`
- **元素参数**：DOM 节点不能作为 pw 方法的普通参数传递（序列化不了）；需要把 `el` 交给
  Playwright 时用 `pw(el)` 注册为作用域 Locator 再续链；**仅支持主 frame 内元素**（iframe 内暂不支持）。
  函数也不能跨桥传递——`evaluate` 请传字符串表达式（如 `pw.page.evaluate('document.title')`）
- **超时**：Playwright 默认 30s/操作，会撑爆外壳 15s 动作兜底——给每个 pw 动作调用显式传 `{ timeout }`，
  保证单次动作总耗时 ≤ 10s
- **降级**：桥注入失败（罕见）或不在平台外壳内时，动作内 pw 调用会抛「桥未注入」；
  动作应能靠页内 DOM 路径完成主要闭环，pw 是增强而非唯一路径

## 辅助 API

| 全局 | 说明 |
|---|---|
| `window.__ttPluginId__` | 平台在注入每个插件源码前写入的当前插件标识（= 平台插件名，全库唯一；harness 下为插件文件名去扩展名）。对象形态无需自行使用（平台自动注入 id）；仅当插件代码需要展示自身标识时读取 |
| `window.__ttPickWait(fn, timeoutMs, intervalMs)` | 轮询直到 fn 返回真值；超时 reject（等弹层出现/DOM 刷新） |
| `window.__ttPw`（动作内即第三参 `pw`） | Playwright 桥代理：动作/后验内经它调用真实 Playwright API（见上文「pw — Playwright 桥」） |
| `window.__ttPluginRegistry__.resolveChain(el, action)` | 语义动作匹配链解析（detect 命中且注册了该动作的插件，按注册顺序=preset 优先级） |
| `window.__ttPluginRegistry__.invokeAction(pluginId, action, el, args)` | 平台外壳执行/重放入口，结果归一化为 `{status, message}` 三态，插件一般不直接调用 |
| `window.__ttPluginRegistry__.detectAll / candidatesFor / annotateFor / listActions` | 平台与 harness 收集用 |
