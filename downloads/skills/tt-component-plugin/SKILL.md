---
name: tt-component-plugin
description: 为测试工具（test-tool）开发组件适配插件。当用户需要为其项目中的特色组件（自研下拉、级联、树选择、日期面板、表格行操作等）生成测试插件时使用。产出 detect/candidates/annotate/actions 四插槽的纯页内脚本，用离线 harness 验证后打包上传平台「插件管理」页。
---

# 测试工具组件适配插件开发

你的任务：为用户的 Web 项目编写一个测试工具「组件适配插件」——一个纯页内 JS 脚本，让 AI 生成测试步骤时能准确理解并操作用户项目里的特色组件。

## 工作流程（严格按序执行）

### 1. 采集组件 DOM 样本
向用户询问，或请用户提供以下任一材料：
- 组件在页面上的 HTML 片段（打开含组件的页面，从 DevTools 复制外层容器到内部结构的 HTML）
- 使用的组件库与版本（element-ui / element-plus / antd / antd-design-vue / 自研）
- 希望支持的操作（仅定位？还是需要「选择选项」「设置日期」「展开节点」等步骤动作）

### 2. 判断能力需求
- 只需「找得准」→ 只写 detect + candidates（+annotate 更好）
- 需要「操作套路」（多步交互、状态相关步数，如日期面板翻页）→ 额外写 actions
- 需要真实键盘/鼠标事件、auto-wait 定位、等网络空闲等 Playwright 能力 → 在 actions 的
  `fn(el, args, pw)` 里用第三参 `pw`（Playwright 桥，见 plugin-api.md「pw — Playwright 桥」）；
  注意 pw 是跨进程 RPC，等待类需求交给 auto-wait/`{ timeout }`，勿放高频循环
- 可输入的控件（日期/下拉搜索框）一律优先声明 `preferFill: true`，让平台先尝试 fill+Enter

### 3. 生成插件代码
- 完整契约与插槽说明：阅读 [references/plugin-api.md](references/plugin-api.md)
- 示例模板：[examples/antd-select.js](examples/antd-select.js)、[examples/element-plus-datepicker.js](examples/element-plus-datepicker.js)（含 set_date 动作）、[examples/custom-badge.js](examples/custom-badge.js)（自研组件）
- 硬性约束：阅读 [references/red-lines.md](references/red-lines.md)（禁止项与安全边界）

### 4. 准备验收页面（fixture）
- 若组件属于常见库且平台 `server/tests/fixtures/` 已有对应页面（antd.html / element-plus.html / element-ui.html / native.html），直接使用
- 否则在 `server/tests/fixtures/` 新建 `<组件名>.html`：引入组件库 CDN + 渲染一个可交互实例 + 数据
- 页面要求：无构建、打开即可用、包含用户描述的完整组件结构

### 5. 离线验收（必做，不通过不得交付）
```bash
cd <平台 server 目录>
npx tsx scripts/pluginHarness.ts <fixture名|用户页面url> ./你的插件.js --probe
```
验收标准（全部满足才算通过）：
- 目标组件的关键元素存在 `✓唯一` 标记的候选（count===1）
- `--probe` 输出的 actions 清单包含你声明的全部动作
- 有 actions 时：给 fixture 页临时加一个按钮（或直接用页面控制台）调用 `invokeAction` 验证动作可执行且返回 `status==='success'`（三态协议：string=success / throw=failed / 对象=显式三态）
- 动作用到 pw（Playwright 桥）时：harness 内已注入桥，`--hold` 下在页面控制台可先 `await window.__ttPw.page.title()` 冒烟确认桥可用

### 6. 交付
- 单文件 `.js`（推荐）：把最终 IIFE 脚本交给用户
- 或打包 `.zip`：`manifest.json`（字段：name/version/description/entry）+ 入口 js
- 用户在平台「插件管理」页上传；提醒用户：**上传后需编辑某个「预设」把插件加入才会生效**（组合即开关），并把预设关联到对应测试项目

## 输出要求
- 插件代码为一个 IIFE（参考示例），顶部注释写明：适配的组件、维护的候选策略、动作清单
- 所有面向用户的文案用中文
- 候选设计原则：宁可少而准（唯一性优先），多而不唯一会被验证管线自动丢弃
