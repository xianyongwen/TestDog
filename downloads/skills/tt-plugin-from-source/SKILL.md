---
name: tt-plugin-from-source
description: 从被测项目的源码出发，为测试工具（test-tool）生成组件适配插件。当用户要求「扫描/分析项目源码，为特色组件生成测试插件 / 组件适配插件」「让 AI 自动化测试能操作我的自研组件」「为项目接入测试工具的插件体系」「自研下拉/级联/树选择/穿梭框/评分/滑动/颜色选择/上传/自定义弹层接入测试」等诉求时使用。分析项目技术栈与组件实现，推导并实测 DOM 契约，产出 detect/candidates/annotate/actions 四插槽的纯页内脚本，离线 harness 验收后交付上传平台「插件管理」页。与 DOM 驱动的 tt-component-plugin 技能互补——本技能不需要用户先提供 DOM 片段。
---

# 从项目源码生成测试工具组件适配插件

你的任务：分析用户的 Web 项目源码，找出值得适配的**特色组件**，为其编写测试工具「组件适配插件」——
一个纯页内 JS 脚本（IIFE），让 AI 生成测试步骤时能准确理解并操作该组件。
与 tt-component-plugin 技能（用户提供 DOM 片段驱动）不同，本技能直接从**源码**出发，先分析后验证。

## 工作流程（严格按序执行）

### 1. 读取被测项目
- `package.json`：框架（react/vue/…）与版本、UI 组件库（antd / element-plus / element-ui / …）及版本
- 组件目录结构：`src/components/`、`src/widgets/` 等自研组件聚集地；页面/视图目录里内联实现的复杂控件
- 若用户点名了组件，直接以点名的为准

### 2. 识别特色组件
- 无需排除内置插件已覆盖的组件——**重复覆盖是允许的**：同一组件上多个插件按预设成员顺序组成匹配链
  （排前者先尝试、成功即止），你的插件排在内置插件之前即可增强或覆盖内置的下拉/树选择/日期插件
- ⚠️ 例外：若你的组件与某个**注册了 actions 的既有插件共享根类**（如 antd 的 TimePicker 与
  DatePicker 同为 `.ant-picker`、element 的 TimePicker 与 DatePicker 同为 `.el-date-editor`），
  光收窄自己的 detect 不够——还要同步收窄既有插件的 detect/annotate（判别性子类/图标区分），
  并给它的动作加误派保护（fn 开头识别非己组件时报错引导换动作），否则标注误导、动作误派
- 优先关注平台原生交互难以可靠操作的：自研下拉 / 级联 / 树选择 / 穿梭框 / 评分 / 滑动条 / 颜色选择 /
  上传 / 表格行操作 / 自定义弹层表单，以及任何用户点名或你觉得「AI 步骤容易点错」的组件
- 一次适配 1~3 个组件，逐个走完流程；先和用户确认清单再动手

### 3. 从源码推导 DOM 契约假设
阅读组件实现（JSX / template / render 函数），推导出「预期 DOM 契约假设表」：
- 根类名与 BEM 前缀（`.my-cascader`、`.el-` 这类稳定前缀）
- 弹层 / 浮层的挂载方式：portal / teleport 到 body？实例常驻还是按需创建？
  动作内开弹层还要处理**归属**：可见弹层是全局的，多控件页面会撞上别处残留的弹层——
  先收起所有可见弹层再全新打开（同时重置面板内部状态）比「复用已开弹层」更确定。
  ⚠️ 按需创建（lazyRender）的弹层在**从未打开过时内容根本不在 DOM**——「目标项不存在」的
  诊断路径必须先展开弹层再枚举可选项，否则错误信息里「当前可选」永远为空，白瞎了引导。
  ⚠️ 惰性渲染常是**分层的**：同一弹层内容器/标题可能全量渲染，而深层内容（如日历的日格）
  按滚动位置逐块挂载（如 vant calendar 月容器全在、日格进视口才渲染）——「找到容器 ≠ 容器
  内容已渲染」，定位容器后须把目标块滚入视口并 `__ttPickWait` 等目标格真正出现再操作
- 受控事件模型：`v-model` / `onChange` / 自定义事件名；键盘与 Enter 语义（可输入过滤？Enter 选中？）
- 视觉状态类名（选中 / 高亮 / 禁用）——**语义须用「点击前后对照」实测**，不能凭类名猜：
  如 antd 级联的 `-expand` 实为「有子级」的常驻标记（未点开也有），「当前激活路径」是 `-active`
- 数据属性的实际格式（如日期/时间值是否补零、路径分隔符是什么），比对时一律数值/结构归一，不假设格式；
  **role/aria 等可访问性属性同样按目标版本实测**（同库跨版本可能有无之别——缺失的候选由验证管线
  自动丢弃，无害但无效，不要假设声明了 role 就一定存在）
- 元素集合枚举要过滤 `aria-hidden="true"` 的副本/幽灵节点——组件库会在拖拽/悬停后动态追加
  隐藏克隆（如 rc-slider 拖拽后追加 tooltip 锚点 handle），不过滤会让「第 N 个手柄」的索引错位
- 类名修饰符判别注意 CSS 类是整 token 匹配：`.el-date-editor--time` 匹配不到
  `el-date-editor--timerange`——判别时用 className 子串正则或把变体类逐一列出

交互语义拿不准时（就近手柄？点格是否提交？多选点文字还是点 checkbox？），去组件库自身的
GitHub 仓库读源码核对（如 antd 生态 `react-component/slider|cascader|picker`、element-plus
仓库 `packages/components/<组件>/src/`），别只靠猜测——行为真值决定动作怎么写闭环。
从兄弟框架移植交互引擎前，三件事必须逐一核对，不能假设「同款组件同款引擎」：
- **事件绑定表**：移动端优先的组件库（vant）可能只绑 touch（mousedown/键盘全无）——桌面
  Playwright mouse 与合成 MouseEvent 拖拽都会失效；触控拖拽用合成 TouchEvent（`new Touch` +
  `new TouchEvent`，Chromium 可用），且核对监听位置（document 还是元素自身，决定合成事件往哪派）
- **ARIA 齐全 ≠ 键盘可操作**：有的组件声明 role=slider/tabindex 却不实现键盘步进
  （如 vant slider），「键盘微调」引擎是否可用要以源码为准
- **多手柄组件的「点击选柄规则」**：轨道点击动哪个手柄（就近 vs 区间中点比较）决定引擎选型——
  中点比较规则下轨道点击无法表达任意 range 目标（会振荡），必须手柄级拖拽

⚠️ **触发器无判别信息的家族组件用「探测分发」范式**：有的组件库把多种语义变体渲染成同一
DOM 根类（如 vant 4 的纯选项/日期/时间滚轮都是 `.van-picker`），且触发器（只读 van-field）
在弹层未开时不携带任何区分信息——此时 detect「精确命中」不可能也不必做到：
- detect 宽进：弹层侧按根类、触发器侧按交互形态启发式（如 `input[readonly]`）
- 动作内先探测结构签名（列数、列项文本模式）再操作：不符即 **failed 落匹配链下一个**
  （同页的日历/级联插件兜底），报错文案写明「该弹层不是 X 形态」引导链路
- 链上留下的已开弹层是下个插件的输入而非障碍：下个插件检测到「本型弹层已开」直接复用
- 复用 vs 重开的分型：**同型弹层复用**（幂等，可能是链上前一插件刚为当前元素打开的）；
  **异型弹层绝不点击触发器去收起**（弹层触发器多为 toggle 语义，再点会收掉别人的弹层），
  直接结构化报错落链

### 4. 实测验证 DOM 假设
**类名与结构以实测为准，源码推导只是起点。**
- 项目能本地跑起来：启动 dev server，用 harness `--probe` 对真实页面验证（见第 7 步）
- 跑不起来：写最小 fixture 页（无构建、打开即可用，组件库用 CDN 引入或原生复刻），放到**被测项目**的 `tests/fixtures/<组件名>.html`
- 源码不可读（闭源依赖 / 二方包）：退回向用户索要组件的 HTML 片段（DevTools 复制）与希望支持的操作

⚠️ fixture 页自身 bug 会伪装成组件怪异行为（如「当前值」展示代码抛 TypeError → React/Vue
整树卸载 → 弹层凭空消失，极易误判为组件问题）。探测脚本先挂 `pageerror`/`console` 监听，
排查行为异常时先排除 fixture 自身报错（含 CDN 依赖加载顺序导致的「组件库未定义」）；
「当前值」展示尽量只做简单拼接，并给容器统一类名（如 `.val`）便于脚本断言。

### 5. 判断能力需求
- 只需「找得准」→ 只写 detect + candidates（+annotate 更好）
- 需要「操作套路」（多步交互、状态相关步数，如面板翻页）→ 额外写 actions
- 面板兜底路径必须**实测提交条件**，不能假设「点完目标项就成」：有的面板点完即自动提交并关闭，
  有的要点确认按钮，有的只更新待定值（如 antd 5.x TimePicker 面板无确定按钮、点格仅待定、
  Enter 提交还要求输入框持有焦点）——提交条件决定 fn 的闭环收尾怎么写，verify 要校验真实终态（回显形态也要实测：值可能在 input、标签 chips（如 el-cascader 多选 input 为空、完整路径在 .el-cascader__tags 的 tag 里）等不同位置）
- 需要真实键盘/鼠标事件、auto-wait 定位、等网络空闲等 Playwright 能力 → 在 actions 的
  `fn(el, args, pw)` 里用第三参 `pw`（Playwright 桥，见 plugin-api.md「pw — Playwright 桥」；
  跨进程 RPC，勿放高频循环，等待交给 auto-wait/`{ timeout }`）
- **切换型控件（checkbox/radio/switch 等藏在 label 里的原生 input）范式**：
  原生 input 是状态真值（input.checked，状态类只是渲染结果），合成 click 点原生 input 即官方等效
  交互；动作设计三件套——目标状态参数解析（布尔参数优先 + 文本别名容错）、**已处于目标状态时
  幂等成功**、点击后受控回写**异步落定**（框架批处理/nextTick，实测可达数百毫秒）——fn 与 verify
  都必须轮询确认，同步即读会把「已成功」误判为失败、或把重试点成回退
- 可输入的控件**先实测 fill+Enter 是否提交所填值**，可靠才声明 `preferFill: true`（平台先尝试
  fill+Enter，画面有变化即算成功）。⚠️ 有的组件 fill 后提交的不是输入值（如 element-plus
  TimePicker 会提交面板默认的当前时刻）——这种情况必须 `preferFill: false`，让动作的面板路径
  兜底，否则错值会被当成功落库

### 6. 生成插件代码
- 完整契约与插槽说明：**务必先读 [references/plugin-api.md](references/plugin-api.md)**
- 硬性约束：**务必读 [references/red-lines.md](references/red-lines.md)（禁止项与安全边界）**
- 示例模板：[examples/antd-select.js](examples/antd-select.js)、[examples/element-plus-datepicker.js](examples/element-plus-datepicker.js)（含 set_date 动作）、[examples/custom-badge.js](examples/custom-badge.js)（自研组件）
- 硬性红线速记：禁止 Node 侧代码 / fetch 平台接口；弹层候选必须 scope 锚定可见弹层容器；
  动作必须页内闭环（翻页在 fn 内循环解决）；单动作 ≤10s；结果三态（string=success / throw=failed / {status,message}）；
  插件源码为一个求值定义对象的表达式（无需 register 调用 / IIFE 外壳 / id——平台封装注入），需要共享辅助状态时用 IIFE 表达式返回对象

### 7. 离线验收（必做，不通过不得交付）
```bash
# 把本技能随包的 scripts/ 整目录复制到被测项目（如 scripts/ 目录）后运行——
# pluginHarness.ts 与 pluginPwBridge.ts 成对依赖，缺一不可；
# 不要在本技能目录内原位运行——fixture 解析要求 <cwd>/tests/fixtures/ 存在
cd <被测项目根目录>
npx tsx scripts/pluginHarness.ts <fixture名|页面URL> ./<你的插件>.js --probe
```
- 验收标准（全部满足才算通过）：
  - 目标组件的关键元素存在 `✓唯一` 标记的候选（count===1）。注意：harness 只能对
    css/testid/placeholder/title 类候选计算唯一性，`role/label/text` 类显示 `?`——
    这不代表无效（平台的候选验证管线会真实定位并丢弃不唯一者），但语义候选之外应尽量
    再补一条结构化候选（如根 id 收敛的 css）保证可验收性。
    ⚠️ **兜底型插件豁免**：仅提供动作、不产出候选的兜底插件（如 tree-select 系、vant-calendar
    ——候选由链上前置插件统一产出）harness 必然报「无唯一候选」（exit 2），这是预期而非失败；
    其验收改为「前置插件候选唯一 + 本插件动作经 invokeAction/链式断言通过」
  - `--probe` 输出的 actions 清单包含你声明的全部动作
  - 有 actions 时：给 harness 加 `--hold`（报告输出后浏览器保持打开），在页面控制台调用
    `await window.__ttPluginRegistry__.invokeAction('<插件id>','<动作名>', el, {…})`
    验证动作可执行且返回 `status==='success'`（harness 只验候选与清单，不执行动作）。
    需要批量/回归验证时可脚本化同款逻辑：自建 Playwright 脚本注入运行时后循环
    `page.evaluate(() => window.__ttPluginRegistry__.invokeAction(…))` 断言结果，比手测可靠
    ⚠️ **page.evaluate 回调内不能有任何具名函数绑定**（tsx/esbuild keep-names 会把具名函数与
    `const fn = () => {}` 包一层 `__name()`，页面里没有该助手 → ReferenceError 假死）：回调体
    只用内联匿名箭头，或 `page.addInitScript('window.__name = (f) => f;')` 打桩兜底

### 8. 交付
- 单文件 `.js`（推荐）：把最终 IIFE 脚本交给用户
- 或打包 `.zip`：`manifest.json` **只写 `{"entry": "index.js"}`**——插件的名称 / 版本 / 说明走平台上传表单，manifest 不需要这些字段
- 用户在平台「插件管理」页上传（单文件 ≤ 512KB）；提醒用户：**上传后需在「预设」Tab 把插件加入某个预设，
  并把预设关联到对应测试项目才会生效**（组合即开关）
- 若用户插件覆盖的组件与内置插件重叠：提醒可在预设里调整成员顺序，把新插件排在内置插件之前即可优先命中
- 迭代更新：改动后无需删除重传，在「插件管理」页对该插件点「重新上传」替换源码即可（保留名称与预设关联）

**变体：为测试工具本仓库贡献内置插件**（被测项目=本仓库时的标准路径，替代第 8 步上传交付）：
1. 插件源码放 `server/src/services/componentPlugins/sources/<name>.js`（内置插件与自定义插件同款
   组织方式：单文件求值定义对象表达式，可直接阅读/编辑/作范例；同域适配先读既有兄弟插件
   ——如 el-select.js / ant-slider.js——复用其交互引擎骨架与 verify 思路）
2. 在 `server/src/services/componentPlugins/builtin.ts` 的 `BUILTIN_PLUGIN_DEFS` 追加定义
   （name/version/description/entryFile=loadSource('<name>')/actionsMeta——actionsMeta 的 doc 为
   动作词表文案，**同名词表取 preset 优先级首个声明者的 doc**，复用既有动作名时改共享常量而非只改自己），
   并把 name 追加进 `BUILTIN_PRESET_MEMBERS`（成员顺序=匹配链优先级，兜底型排同类插件之后）；
   注意 loadSource 是 eager 的，**只注册源码已存在的插件**
3. 验收与回归：第 7 步 harness 在本仓库同样适用，但 scripts 需**拷进 `server/` 下的临时目录运行**
   （脚本 ESM 依赖从脚本自身位置解析，放 downloads/ 下找不到 server 的 playwright；server 有
   `"type": "module"`，拷到 /tmp 这类无 package.json 的目录会因 CJS 顶层 await 报错）。
   vitest 仿照 `server/tests/treeSelectPlugin.test.ts`（file:// 打开 fixtures +
   `buildPluginInitScript` 注入 + resolveChain/invokeAction 断言），⚠️ **每个 it 显式传超时
   （如 60000）**——fixture 页 CDN 加载重（Vue dev 构建约 1.3MB）会超 vitest 默认 5s；
   并跑既有插件测试确认 detect 收窄/误派保护无回归

## 输出要求
- 插件代码为一个 IIFE，顶部注释写明：适配的组件、维护的候选策略、动作清单
- 所有面向用户的文案用中文
- 候选设计原则：宁可少而准（唯一性优先），多而不唯一会被验证管线自动丢弃
- 同一组件不同形态的 id/attrs 透传落点可能不同（如 el-slider 单值落手柄包装层、范围落根节点），
  candidates 要对每种形态分别验证后再产出收敛候选
