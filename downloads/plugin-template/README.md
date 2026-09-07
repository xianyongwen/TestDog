# 测试工具「组件适配插件」开发模板

让 AI 生成测试步骤时能准确理解并操作你的 Web 项目里的**特色组件**（自研下拉、级联、树选择、日期面板等）。
本模板是一个可直接跑通离线验收的插件开发骨架项目：内置一个可运行的示例插件、示例组件页面与平台同款验收 harness。

> 插件是**纯页内 JS 脚本**——一个求值「插件定义对象」的表达式（平台封装 register 与 id，无需 IIFE 外壳），
> 只在被测网站的浏览器环境执行；平台 Node 侧不含任何插件代码。
> 它通过四个插槽接入平台：`detect`（组件归属判定）、`candidates`（候选定位器增强）、`annotate`（语义标注）、`actions`（组件语义动作）。
> 完整契约见 [references/plugin-api.md](references/plugin-api.md)，硬性红线见 [references/red-lines.md](references/red-lines.md)。

## 目录结构

```text
tt-plugin-template/
├── index.js                      # 插件骨架（示例：自研可搜索下拉 demo-select），按 TODO(改造点) 注释改造
├── manifest.json                 # 插件包清单（zip 上传用，只写 entry）
├── package.json                  # 本地验收依赖（playwright + tsx）
├── harness/pluginHarness.ts      # 平台同款离线验收 CLI（与平台运行时保持同步）
├── harness/pluginPwBridge.ts     # pw 桥 Node 侧实现（harness 引用，与 harness 同目录）
├── tests/fixtures/               # 验收用页面（harness 按 <cwd>/tests/fixtures/<名字>.html 查找）
│   └── sample-widget.html        # 示例：自研可搜索下拉组件页
├── references/                   # 插件 API 完整参考 + 红线（来自平台技能文档）
└── examples/                     # 三个示例插件（antd 下拉 / Element 日期 / 自研徽标）
```

## 快速开始（解压即跑，约 2 分钟）

```bash
npm install
npx playwright install chromium          # 首次执行会下载浏览器，之后复用缓存
npm run harness -- sample-widget index.js --probe
```

会弹出浏览器窗口自动扫描页面，期望输出：

- 触发器与输入框候选出现 **✓唯一** 标记（`css=.demo-select`、`placeholder=请选择`；扫描时弹层处于关闭态，弹层候选不参与本次报告）
- `✅ 验收通过：存在页内唯一的候选定位器`
- `已注册动作` 含 `select`（动作清单随包列出；插件 id 取文件名，如 `index -> ["select"]`）

harness 只验证候选唯一性与动作清单，**不执行动作**。动作自测：加 `--hold` 运行，报告输出后浏览器会保持打开，在页面控制台执行：

```bash
npm run harness -- sample-widget index.js --probe --hold
```

```js
await window.__ttPluginRegistry__.invokeAction('demo-select', 'select', document.querySelector('.demo-select'), { value: '上海' })
// 期望返回 { status: 'success', message: '已选择：上海' }，且页面下拉框回显「上海」
```

自测完成按回车（或直接关闭浏览器窗口）结束。

### 调试时调用 Playwright API（pw 桥）

动作/后验 fn 的第三参 `pw` 是平台注入的 **Playwright 桥**，可在动作内调用真实 Playwright API
（Node 侧执行，真实键盘/鼠标事件、auto-wait 定位、等待网络等）：

```js
async fn(el, args, pw) {
  const rootHandle = await pw(el);              // 页内元素 → Node 侧句柄，可继续链式调用
  await rootHandle.locator('input').fill('上海'); // auto-wait 真实 fill
  await pw.page.keyboard.press('Escape');        // 真实键盘事件
  await pw.page.waitForLoadState('networkidle'); // 等网络空闲
}
```

harness 调试（`--hold` 下在页面控制台）同样可用：`await window.__ttPw.page.title()`。
注意事项：pw 每次调用是跨进程往返，不要放进高频轮询循环；等待类需求交给 Playwright
auto-wait 或传 `{ timeout }`；不在平台外壳/harness 内运行时调用会报「桥未注入」。
完整说明见 [references/plugin-api.md](references/plugin-api.md) 的「pw — Playwright 桥」一节。

## 开发你自己的插件

1. 改造 `index.js`：按 `TODO(改造点)` 注释逐处替换（共 2 处：detect 类名、动作交互闭环；
   语法可直接用 ES6+（const / 箭头函数 / 可选链等），插件只在被测网站的 Playwright Chromium 里执行，无需构建降级；
   插件 id 由平台注入 `window.__ttPluginId__`，无需自定义）。
2. 准备验收页面：新建 `tests/fixtures/<组件名>.html`（无构建、打开即可用，包含目标组件的完整结构）；
   或直接用你项目里跑起来的页面地址作为 harness 第一个参数（`npx tsx harness/pluginHarness.ts https://你的页面 ./index.js --probe`）。
3. 跑 harness 验收（标准同上：唯一候选 + 动作清单齐全）；有动作时加 `--hold` 保持浏览器打开，在页面控制台自测动作。
4. 交付上传（见下）。

示例插件参考 `examples/`：antd 下拉、Element Plus 日期面板（翻页闭环）、自研徽标（只定位不动作）。

## 上传到测试工具

- **推荐直接上传入口 `.js` 文件**（本模板即 `index.js`）；
  若打 zip 包：`manifest.json` 只需 `{"entry": "index.js"}` —— **插件名称 / 版本 / 说明走平台的上传表单，manifest 不需要这些字段**。
  平台兼容常见的单层目录包裹结构——**整个本模板 zip 直接上传也可以**（会把示例插件 demo-select 注册进平台，用于体验完整流程）。
- 单文件 ≤ 512KB。
- 在测试工具「插件管理」页上传后，**须在「预设」Tab 把插件加入某个预设，并让测试项目关联该预设，插件才会被注入生效**（组合即开关）。
- 预设成员按优先级组成匹配链，优先级高者先尝试、成功即止；预设编辑界面中**顺序数字越大优先级越高**（新加入的成员自动获得最高优先级）。
  因此重复覆盖是允许的——把你的插件排在内置插件之前，即可增强或覆盖内置的下拉/树选择/日期插件。
- **更新插件**：不必删除重传——在「插件管理」页对已上传插件点操作列的「重新上传」（上传图标）替换源码即可，
  名称与预设关联保持不变（版本 / 说明可选更新；动作清单在下次试运行后按新源码回写）。

## 验收 harness 说明

`harness/pluginHarness.ts` 与平台注入运行时同源（内嵌同步的 polyfill），用法：

```bash
npm run harness -- <fixture名|页面URL> <插件.js> --probe
npm run harness -- <fixture名|页面URL> <插件.js> --probe --hold   # 报告后保持浏览器打开，可在控制台自测动作
npm run harness -- --list                                        # 列出可用 fixture
```
