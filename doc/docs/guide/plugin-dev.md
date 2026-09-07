# 插件开发

内置插件覆盖不了你的自研组件？写一个「组件适配插件」：让 AI 生成测试步骤时能准确理解并操作你的特色组件（自研下拉、级联、树选择、日期面板等）。本页带你从零写出一个可验收、可上传的插件。

## 插件是什么

插件是**纯页内 JS 脚本** —— 一个求值为「插件定义对象」的表达式：

- 只在**被测网站的浏览器环境**执行，平台 Node 侧不含任何插件代码；
- **无需 IIFE 外壳、无需调用 register、无需指定 id** —— 平台注入时自动封装；需要内部辅助函数时写成 IIFE 表达式返回对象即可：`(() => { …辅助…; return {…}; })`；
- 语法可直接用 **ES6+**（const / 箭头函数 / 可选链），插件只在被测网站的 Playwright Chromium 里执行，**无需构建降级**；
- 通过四个插槽接入平台：`detect`（归属判定）、`candidates`（候选定位器）、`annotate`（语义标注）、`actions`（语义动作）。

完整契约见插件模板内的 `references/plugin-api.md`，硬性红线见 `references/red-lines.md`。

## 快速开始：模板项目（约 2 分钟）

在「插件管理」页下载**插件模板**（zip），解压后：

```bash
npm install
npx playwright install chromium    # 首次下载浏览器，之后复用缓存
npm run harness -- sample-widget index.js --probe
```

会弹出浏览器自动扫描示例页面，期望输出：

- 触发器与输入框候选出现 **✓唯一** 标记（`css=.demo-select`、`placeholder=请选择`）
- `✅ 验收通过：存在页内唯一的候选定位器`
- `已注册动作` 含 `select`（插件 id 取文件名，如 `index -> ["select"]`）

harness 只验证候选唯一性与动作清单，**不执行动作**。自测动作加 `--hold` 保持浏览器打开，在页面控制台执行：

```js
await window.__ttPluginRegistry__.invokeAction('demo-select', 'select', document.querySelector('.demo-select'), { value: '上海' })
// 期望返回 { status: 'success', message: '已选择：上海' }，且页面下拉框回显「上海」
```

## 插件包格式

| 项 | 说明 |
| --- | --- |
| 单文件 | 推荐：直接上传入口 `.js` 文件（模板即 `index.js`） |
| zip 包 | `manifest.json` 只需 `{"entry": "index.js"}`；**名称/版本/说明走平台上传表单**，manifest 不需要这些字段 |
| 大小 | 单文件 ≤ 512KB |
| 平台兼容 | 常见单层目录包裹的 zip 也可直接上传（会把模板示例插件注册进去，可体验完整流程） |

## 插件定义对象：四大插槽

以下来自模板 `index.js`（示例：自研可搜索下拉 demo-select），改掉两处 `TODO(改造点)` 即可变成你自己的插件。

### 1. detect —— 组件归属判定

```js
detect: (el) => !!el.closest('.demo-select, .demo-select-popup')
```

**宽进**：所有你负责的组件都应命中；但**注册了 actions 的插件必须精确命中** —— detect 是语义动作分发的依据，宽泛类名会把动作误派给其他组件。

### 2. candidates —— 候选定位器

```js
candidates: (el) => {
  const out = [];
  // 触发器（不在弹层内）
  const trigger = el.closest('.demo-select');
  if (trigger && !el.closest('.demo-select-popup')) {
    if (el === trigger) out.push({ strategy: 'css', value: '.demo-select' });
    if (el.tagName === 'INPUT') {
      const ph = el.getAttribute('placeholder');
      if (ph) out.push({ strategy: 'placeholder', value: ph });
    }
  }
  // 弹层：只对可见弹层产候选（隐藏弹层的候选会被唯一性校验淘汰）
  const popup = el.closest('.demo-select-popup');
  if (popup?.classList.contains('is-open')) {
    if (el === popup) out.push({ strategy: 'css', value: '.demo-select-popup' });
    if (el.classList.contains('demo-select-option')) {
      const text = el.textContent.trim();
      if (text) out.push({ strategy: 'text', value: text, scope: { strategy: 'css', value: '.demo-select-popup' } });
    }
  }
  return out;
}
```

平台会逐个验证「**页内唯一 + 真实定位 count===1 且同节点**」，不唯一的会被静默丢弃 —— **宁可少而准**。要点：

- 表单 label 收割：同表单行 `<label>` 文本可作 label 候选；
- 弹层内容必须 **scope 锚定弹层容器**（弹层常 portal 到 body 且实例常驻，不锚定会命中隐藏实例）。

### 3. annotate —— 一句话语义标注

```js
annotate: (el) => {
  if (el.closest('.demo-select-popup')) return 'demo-select 的选项弹层（点击选项即选中并回显到输入框）';
  if (el.closest('.demo-select')) return '自研可搜索下拉 demo-select：输入可过滤，Enter 或点击选项选择（非原生 select，平台原生 select 步骤不适用）';
  return '';
}
```

写「AI 需要知道的操作事实」，会拼进页面快照直接喂给模型。

### 4. actions —— 语义动作

```js
actions: {
  select: {
    doc: '选择下拉选项（args.value=选项文本，如 上海）。真实 fill+Enter 优先，失败走页内点击选项。',
    label: '选择选项',          // 可选展示名，动作下拉/步骤标签优先显示
    preferFill: true,           // 可输入控件一律 true：平台先试 fill+Enter，失败才进 fn
    async fn(el, args, pw) {
      const value = String(args?.value || '').trim();
      if (!value) throw new Error('缺少参数 value（要选中的选项文本）');
      // 幂等：已是目标终态直接返回（匹配链上前一个插件可能已做了一半）
      // 1) 打开弹层（已开则跳过）
      // 2) 填入文本触发过滤，等待匹配选项出现
      // 3) 点击选项选中
      // 4) 等待真终态：选中标记 + 输入框回显
      return `已选择：${value}`;
    },
    verify: (el, args) => {     // 可选页内后验：不过视同 failed
      // 校验「真的选上了」，拦截假成功
    },
  },
}
```

动作编写的关键约定：

- **状态相关的多步操作必须在 fn 内闭环**（打开 → 定位 → 选中 → 等回显），禁止返回「需要点 N 次」让外壳拆步；
- **幂等**：已是目标终态直接返回成功；
- **后验不能只看回显** —— 筛选文本也会回显进输入框，要校验组件的选中状态标记（第 2 步已把筛选文本填进输入框，只查回显会把「筛选了但没点上」误判成 success）。

## 三态结果协议

每个动作返回明确三态，不做含糊处理：

| 返回 | 含义 |
| --- | --- |
| 返回字符串 | **success**（字符串作为结果消息） |
| throw Error | **failed**（错误信息展示给用户/模型） |
| 返回 `{status, message}` | 显式三态：`success` / `failed` / `uncertain`（uncertain 交平台效果哈希兜底） |

`verify` 后验不过视同 failed —— 这就是拦截「点了但没选上」假成功的机制。

## pw 桥：在动作里调用 Playwright API

动作/后验 fn 的第三参 `pw` 是平台注入的 **Playwright 桥**（Node 侧执行，真实键盘/鼠标事件、auto-wait 定位、等待网络）：

```js
async fn(el, args, pw) {
  const rootHandle = await pw(el);               // 页内元素 → Node 侧句柄，可继续链式调用
  await rootHandle.locator('input').fill('上海'); // auto-wait 真实 fill
  await pw.page.keyboard.press('Escape');         // 真实键盘事件
  await pw.page.waitForLoadState('networkidle');  // 等网络空闲
}
```

注意：pw 每次调用是**跨进程往返**，不要放进高频轮询循环；等待类需求交给 Playwright auto-wait 或 `{ timeout }`；不在平台外壳/harness 内运行时会报「桥未注入」。调试时（`--hold`）同样可用：`await window.__ttPw.page.title()`。

## 验收 harness

```bash
npm run harness -- <fixture名|页面URL> <插件.js> --probe
npm run harness -- <fixture名|页面URL> <插件.js> --probe --hold   # 报告后保持浏览器打开
npm run harness -- --list                                        # 列出可用 fixture
```

- 验收页面：新建 `tests/fixtures/<组件名>.html`（无构建、打开即用、包含目标组件完整结构），或直接用你项目跑起来的页面 URL；
- 验收标准：**唯一候选 + 动作清单齐全**；`--hold` 下在控制台用 `invokeAction` 自测每个动作。

## 上传与生效

1. 「插件管理」页上传（单 `.js` 或 zip）；
2. **试运行**一次：回写动作清单（detect 命中数、候选总数、动作列表）；
3. 在「预设」Tab 把插件**加入预设**，并让测试项目**关联该预设** —— 组合即开关，不做不生效；
4. 预设成员按优先级组成**匹配链**：顺序数字越大优先级越高、先尝试成功即止（新加入成员自动最高）。

**覆盖内置插件**：重复覆盖是允许的 —— 把你的插件排在内置插件之前，即可增强或覆盖内置的下拉/树选/日期插件。⚠️ 若你的组件与某个注册了 actions 的既有插件**共享根类**（如 antd TimePicker 与 DatePicker 同为 `.ant-picker`），还需同步收窄既有插件的 detect/annotate 并加误派保护。

**更新插件**：不必删除重传 —— 操作列「重新上传」替换源码即可，名称与预设关联保持不变，动作清单在下次试运行后按新源码回写。

## 用编程 agent 开发

不想手写？「插件管理」页下载**插件技能**（`tt-plugin-from-source` 技能包，zip），放入被测项目 `.claude/skills/` 后，Claude Code 等编程 agent 会：

1. 阅读项目源码（框架、组件库、`src/components/` 自研组件聚集地）；
2. 识别值得适配的特色组件（自研下拉/级联/树选择/穿梭框/评分/滑动条/颜色选择/上传/自定义弹层等）；
3. 从源码推导 DOM 契约假设并实测，产出四插槽纯页内脚本；
4. 用离线 harness 验收后交付上传。
