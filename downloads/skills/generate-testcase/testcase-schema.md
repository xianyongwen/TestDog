# .testcase 用例格式与执行语义参考

> 生成 `.testcase` 文件时按此表填写字段。所有枚举值必须精确匹配，否则导入会被后端 zod 校验拒绝（HTTP 400 `步骤数据格式不正确`）。

## 1. 文件顶层结构

一个 `.testcase` 文件 = 一个测试用例（含首个脚本版本 v1）。内容为 UTF-8 JSON：

```json
{
  "format": "testcase",
  "version": 1,
  "title": "用例标题（必填）",
  "description": "可选，用例说明",
  "naturalLanguage": "可选，原始自然语言描述",
  "intent": { /* 可选，测试意图，见第 8 节 */ },
  "steps": [ /* TestStep[] */ ],
  "rawCode": ""
}
```

- 导入接口读取：`title`（必填）、`description`、`naturalLanguage`、`intent`（可选，按测试意图 schema 校验，非法则 400 `测试意图格式不正确`）、`steps`（按 TestStep 校验）、`rawCode`。`format`/`version` 被忽略，但保留以兼容导出格式（桌面端导出的 `.testcase` 与本结构一致）。
- 文件扩展名必须 `.testcase`，内容为 JSON（建议 pretty-print）。

## 2. TestStep 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `instruction` | string | 自然语言子指令。**强烈建议必填**：回放时若定位器失效，自愈模块靠它用 AI 重新定位元素；缺失则不自愈直接失败。 |
| `kind` | `navigate`\|`action`\|`assert`\|`wait` | 步骤类别（默认 `action`）。执行引擎只看 `action`，`kind` 仅供分类展示，但应与 `action` 一致。 |
| `action` | enum | 决定执行什么。见下表。 |
| `locator` | object | 元素定位器 `{strategy, value, role?, name?, scope?}`。需要定位元素的 action 必填（见第 4 节）。 |
| `url` | string | `action=goto` 时必填。支持 `{{var}}` 占位符（环境变量与系统变量统一写法）。 |
| `value` | string | `fill` 的输入文本 / `select` 的选项值 / `wait` 的毫秒数（字符串）。支持 `{{var}}` 占位符。 |
| `key` | string | `press` 的按键名（如 `Enter`、`Escape`、`Tab`），默认 `Enter`。 |
| `checked` | boolean | 仅 `action=check`：缺省/`true` = 勾选；`false` = **取消勾选**（`setChecked(false)`）。 |
| `pluginAction` | object | 仅 `action=plugin`：`{action, args?, pluginId?, label?}`，组件语义动作，见第 6 节。 |
| `assertion` | object | `action=assert` 时必填 `{type, expected?, jsonPath?}`，见第 5 节。 |
| `criterionId` | string | 可选。对应 `intent.criteria[].id`（验收目标）。运行期不校验、仅随步骤透传；由 AI 生成流程写入，手写用例无 intent 时可省略。 |
| `description` | string | 该步骤的「说明」，界面步骤表「说明」列展示。**建议每步都填**，简述意图/预期。与 `instruction` 互补：instruction 是可执行指令（给自愈用），description 是给人看的说明。 |
| `code` | string | `action=raw` 时保留原始代码。当前回放引擎跳过 `raw`，**生成用例时勿用**。 |

## 3. action 与所需字段

| action | kind | locator | url | value | key | checked | pluginAction | assertion | 执行语义 |
|---|---|---|---|---|---|---|---|---|---|
| `goto` | navigate | 否 | ✅ | — | — | — | — | — | `page.goto(url)` |
| `click` | action | ✅ | — | — | — | — | — | — | 元素 `.click()`（超时 10s） |
| `fill` | action | ✅ | — | ✅ | — | — | — | — | 元素 `.fill(value)` |
| `press` | action | ✅ | — | — | ✅默认`Enter` | — | — | — | 元素 `.press(key)` |
| `check` | action | ✅ | — | — | — | 可选默认`true` | — | — | `setChecked(checked)`：勾选/取消勾选复选框 |
| `select` | action | ✅ | — | ✅ | — | — | — | — | 原生下拉 `.selectOption(value)`；**组件库下拉请用 `plugin`** |
| `assert` | assert | 视类型 | — | — | — | — | — | ✅ | 见断言表 |
| `wait` | wait | 否 | — | ✅(毫秒) | — | — | — | — | 等待 N 毫秒（`value` 为数字字符串，默认 1000） |
| `plugin` | action | ✅(一般) | — | 视动作 | — | — | ✅ | — | 组件语义动作，见第 6 节 |
| `raw` | action | — | — | — | — | — | — | — | 当前跳过，勿用 |

## 4. locator.strategy 与 Playwright 映射

**选择优先级（必须遵守）**：按表中顺序从上到下依次尝试，命中即用，不要跳级。

| 优先级 | strategy | `value` 含义 | 额外字段 | Playwright 调用 | 稳定性 | 推荐 |
|---|---|---|---|---|---|---|
| 1 | `testid` | `data-testid` 的值 | - | `getByTestId(value)` | ★★★★★ | 首选 |
| 2 | `role` | 无障碍角色（button/textbox/link/heading/checkbox/tab 等），`value` 与 `role` 同值 | `role`(必填), `name`(可选) | `getByRole(role, {name?})` | ★★★★★ | 首选 |
| 3 | `label` | 表单 label 文本 | - | `getByLabel(value)` | ★★★★★ | 强烈推荐 |
| 4 | `placeholder` | placeholder 文本 | - | `getByPlaceholder(value)` | ★★★★ | 推荐 |
| 5 | `text` | 元素可见文本 | - | `getByText(value)` | ★★★★ | 推荐 |
| 6 | `alt` | 图片/图像按钮的 alt 文本 | - | `getByAltText(value)` | ★★★★ | 推荐 |
| 7 | `title` | 元素 title 提示属性值 | - | `getByTitle(value)` | ★★★★ | 推荐 |
| 8 | `css` | CSS 选择器 | - | `locator(value)` | ★★★ | 兜底 |
| 9 | `xpath` | XPath 表达式（以 `//` 开头） | - | `locator('xpath='+value)` | ★★ | 最后考虑 |
| - | `response` | 接口 URL 关键词子串 | - | 不定位元素，匹配运行中最近响应 | - | **仅用于接口断言** |
| - | `websocket` | WS URL 关键词子串 | - | 不定位元素，匹配 WS 帧 | - | **仅用于 WS 断言** |

**role 定位器写法**（`value` 与 `role` 同值，`name` 可选）：
```json
{ "strategy": "role", "value": "button", "role": "button", "name": "登录" }
{ "strategy": "role", "value": "heading", "role": "heading", "name": "仪表盘" }
{ "strategy": "role", "value": "checkbox", "role": "checkbox", "name": "记住我" }
```

**定位器偏好**：`testid` > `role` > `label` > `placeholder` > `text` > `alt` > `title` > `css` > `xpath`。语义定位器（role/label 等）抗 UI 重构；`css` 仅在无语义锚点时用；**`xpath` 极不稳定（绝对路径对 DOM 结构变化零容忍），只在前述方式全部不可行时才允许使用，建议不使用 XPath**。

**作用域定位器 `scope`（可选，模态框/弹层内容强烈建议）**：弹层内容经 portal 渲染到 body 下，页面级定位可能与其他弹层冲突、绝对路径会随弹层序号漂移。`scope` 先命中容器（如对话框），再在其中执行主定位（链式查询）：
```json
{ "strategy": "role", "value": "button", "role": "button", "name": "确定", "scope": { "strategy": "role", "value": "dialog", "role": "dialog" } }
```
对应 `getByRole('dialog').getByRole('button', {name:'确定'})`。scope 的 strategy 取 testid/role/label/placeholder/text/alt/title/css（不含 xpath/response/websocket），value 语义同主定位。给弹窗内元素写用例时优先加 `role=dialog` 作用域（或该弹窗唯一的 css/id）；普通页面元素无需 scope。**注意**：回放要求 scope 恰好命中 1 个容器，命中 0 个或多个直接判失败。

## 5. assertion.type 与所需字段

### 5.1 UI / 浏览器断言

| type | locator | expected | 语义 |
|---|---|---|---|
| `visible` | ✅ 普通元素 | — | 等待元素可见 |
| `hidden` | ✅ 普通元素 | — | 等待元素**不可见或不存在于 DOM**。常用于断言 toast/loading/弹窗已消失 |
| `text` | ✅ 普通元素（可省略，省略时对整页 `body` 断言） | ✅ 子串（非空） | 元素文本**包含** `expected` |
| `text_exact` | ✅ 普通元素 | ✅ 全等文本 | 元素文本**全等** `expected`（两侧先把连续空白折叠为单个空格再 trim，故换行/多空格不影响） |
| `value` | ✅ 表单控件 | ✅ 全等值 | 元素 `inputValue()`（input/textarea/select 当前值）**全等** `expected` |
| `checked` | ✅ 复选/单选 | — | 元素勾选状态为**已勾选** |
| `unchecked` | ✅ 复选/单选 | — | 元素勾选状态为**未勾选** |
| `enabled` | ✅ 普通元素 | — | 元素**可用**（未禁用） |
| `disabled` | ✅ 普通元素 | — | 元素**禁用** |
| `count` | ✅ 普通元素 | ✅ 非负整数字符串 | 定位器命中的元素**个数等于** `expected`（如断言列表行数、按钮数量） |
| `url` | 不需要 | ✅ 子串（非空） | 当前页 URL **包含** `expected` |
| `url_exact` | 不需要 | ✅ 完整 URL（非空） | 当前页 URL **全等** `expected` |

### 5.2 接口 / WebSocket 断言

| type | locator | expected | jsonPath | 语义 |
|---|---|---|---|---|
| `response_status` | `strategy=response` | ✅ 状态码字符串(如 `"200"`) | — | 匹配 URL 关键词的最近响应，状态码含 `expected` |
| `response_body` | `strategy=response` | ✅ 响应体子串 | — | 响应体包含 `expected` |
| `response_json` | `strategy=response` | ✅ 字段期望值 | ✅ 点分路径(如 `data.id`) | 响应体 JSON 取 `jsonPath` 字段，值等于 `expected`（字符串比较） |
| `ws_sent` | `strategy=websocket` | ✅ payload 子串或字段值 | 可选 | 客户端发出的 WS 消息匹配 |
| `ws_received` | `strategy=websocket` | ✅ | 可选 | 服务端推送的 WS 消息匹配 |

要点：

- **`text` / `text_exact` / `value` / `count` / `url` / `url_exact` 必须带 `expected`**（其中 `text`/`url`/`url_exact` 的 expected 还不能是空白串），否则导入校验直接 400。`checked`/`unchecked`/`enabled`/`disabled`/`visible`/`hidden` 不需要 expected。
- **response / ws 断言的 `locator.value` 是 URL 关键词子串**，引擎用 `url.includes(value)` 命中运行中最近一次匹配的响应/帧。填路径片段即可，如 `/api/login`、`/ws/notify`。
- **`response_json` 的 jsonPath** 支持数组下标，如 `data.items.0.id`；用 `.` 分隔。`expected` 与字段值做**字符串相等**比较，数字也要写成字符串（如 `"42"`）。
- **ws 断言**：`expected` 为空时只要存在匹配方向的消息即通过；填 `jsonPath` 则按 JSON 字段值断言，否则按 payload 包含文本断言。`ws_sent`=客户端发出，`ws_received`=服务端推送。
- **断言失败不自愈**：定位器失效自愈只对动作步生效；断言失败可能是产品缺陷，AI 换目标会把真实缺陷变成「通过」，所以断言失败一律保留现场证据（截图/console/network）直接记 FAILED。
- `text` 省略 locator 是合法写法（整页包含断言），但**推荐仍写具体元素**——整页断言太宽，元素级断言的失败信息更可定位。

### 断言前的等待时机

所有 UI/浏览器断言都在**总预算 10s 内自动轮询**（每 100ms 重试），无需为元素渲染/动画加 wait；接口/WS 断言自动轮询约 1s（ws 每 50ms 共 5s）：

| 断言类型 | 自动等待 | 是否需显式 wait |
|---|---|---|
| `visible` / `hidden` / `text` / `text_exact` / `value` / `checked` / `unchecked` / `enabled` / `disabled` / `count` | ✅ 自动轮询，最多 10s | 一般不需要；接口明显偏慢导致 UI 数据晚到时加 `wait` |
| `url` / `url_exact` | ❌ 瞬时轮询当前 URL，但**不等待跳转语义** | **常需要**：点击触发跳转后，跳转未完成会立即失败。加 `wait`（如 1000ms），或在前方先做 `visible` 断言（它自动等到元素出现，间接保证跳转完成） |
| `response_*` | ✅ 轮询等响应到达，约 1s | 接口较慢时加 `wait` |
| `ws_*` | ✅ 轮询等匹配帧，约 5s | 服务端推送延迟较高时加 `wait` |

原则：能靠自动等待就别加 `wait`，避免拖慢运行；只有断言依赖的异步结果不在自动等待范围内（典型是 `url`/`url_exact` 断言，或接口明显偏慢）时才加，时长一般 300~1000ms。

## 6. 组件语义动作（action='plugin'）

组件库（Ant Design / Element Plus / Element UI / Vant / MUI）的非原生控件——Select、DatePicker、Cascader、Slider、TimePicker、TreeSelect、Checkbox、Radio 等——其弹层经 portal 渲染、选项常为虚拟列表，原生 `click`/`selectOption`/`fill` 很容易失效。此类控件**优先用组件语义动作**：引擎在页内按控件特征自动探测匹配的插件，执行动作并做后验。

### 6.1 步骤写法

```json
{
  "instruction": "在下拉框中选择「已发布」",
  "kind": "action",
  "action": "plugin",
  "locator": { "strategy": "label", "value": "状态" },
  "pluginAction": { "action": "select", "args": { "value": "已发布" } }
}
```

- `pluginAction.action`：语义动作名（必填），常用 `select` / `set_date` / `set_time` / `set_value` / `check`。
- `pluginAction.args`：动作参数对象（见 6.2 参数表）。
- `pluginAction.pluginId`：**建议省略**。缺省时引擎按 locator 命中的控件自动探测可用插件；填了仅作「优先尝试」提示，不匹配会自动落到链上其他插件，写错不会致命。
- `locator`：指向**触发控件**（输入框/选择框本体）。仅插件自身声明支持无元素时才可省略，一般必填。

### 6.2 常用动作与参数

| 语义动作 | 适用控件 | args | 说明 |
|---|---|---|---|
| `select` | Select / TreeSelect / Cascader / 单选 Radio 组 / 移动端 Picker | `value`（选项可见文本）或 `index`（非负整数，仅部分 Select 支持） | 按可见文本点选选项；Cascader 的 `value` 为完整路径「A / B / C」；Radio 组的 `value` 为目标单选项可见文本，对组容器或任一单选项定位均可 |
| `set_date` | DatePicker / Calendar | `value`=`YYYY-MM-DD`（可带 `HH:mm(:ss)`） | 打开面板选日期；datetime 控件自动补 `00:00:00` |
| `set_time` | TimePicker | `value`=`HH:mm(:ss)` | 逐列点选时分秒 |
| `set_value` | Slider | `value`=数值或 `"a,b"`（范围滑块两端） | 设定滑块值 |
| `check` | Checkbox | `checked` 布尔（或 `value` 别名） | 目标状态：缺省勾选；`checked:false`/别名（`false`/`0`/`no`/`unchecked`/`uncheck`/`否`/`取消` 等）为取消勾选。幂等：已是目标态直接成功 |

### 6.3 回放语义（失败兜底链）

回放按顺序尝试，直到某一步成功：

1. **语义动作链**：页内探测「能识别该控件且注册了该动作」的插件，逐个执行；插件报失败则换链上下一个。动作结果三态——成功 / 不确定（uncertain，按通过处理）/ 失败（换下一个）；成功后若插件声明了后验（verify）会实际复查控件状态，后验不过视同失败继续换。
2. **原生交互兜底**：链全败时降级原生操作——`pluginAction.action='select'` 且步骤带 `value` → `selectOption(value)`；步骤带 `value` → `fill(value)` 后按 Enter；否则 `click`。
3. **AI 自愈**：原生兜底也失败且步骤写了 `instruction` 时，走通用自愈重新定位执行。

所以 `plugin` 步骤同样**必须写 `instruction`**。链上所有尝试的报错会汇总抛出，失败步骤照常截图取证。

## 7. 变量占位符

### 7.1 环境变量 `{{name}}`

- 占位符 `{{name}}`，name 规则：字母/下划线开头，含字母/数字/下划线，支持中文（如 `{{baseUrl}}`、`{{密码}}`）。
- 运行时替换为「项目环境变量」中同名的值。替换范围：`instruction`、`url`、`value`、`locator.value`、`locator.name`、`assertion.expected`、`assertion.jsonPath`。
- 未定义的变量保留 `{{name}}` 字面量并在运行日志告警。生成用例时把环境相关值（域名、账号、密码）写成占位符，并在 `description` 里列出需定义的变量名。
- 变量在测试工具的「项目设置」里维护，**不在 .testcase 文件内**。

### 7.2 系统变量（`{{name[:N]}}`）

- 占位符 `{{name}}`（可选参数 `:N` 写在名字后，`{{randomChinese:4}}` 与 `{{randomChinese[:4]}}` 等价），**运行期内置、无需在项目里定义**。写法与环境变量统一，都是 `{{...}}`；同名冲突时**环境变量优先**（项目显式定义的值覆盖内置随机值）。
- 目前支持：
  - `{{systemTime}}`：当前时间戳（epoch 毫秒，13 位数字）。
  - `{{randomNumber}}`：随机数字串，默认 6 位（前置补零），如 `{{randomNumber:8}}` 指定 8 位。
  - `{{randomChinese}}`：随机常用汉字，默认 2 个（适合人名/标题），如 `{{randomChinese:4}}` 指定 4 个。
  - `{{randomPhone}}`：随机中国大陆手机号（11 位，1[3-9] 开头），适合填写手机号/联系方式字段。
  - `{{randomEmail}}`：随机邮箱（小写字母/数字用户名 + 常见域名），适合填写邮箱字段。
  - `{{randomIdCard}}`：随机 18 位身份证号（符合 GB 11643-1999 校验位），适合填写证件号码字段。
- 每次运行开始对用到的每个键求值一次，**同一次运行内同键值一致**（fill 写入的账号与后续断言用同一个值，随机值不会在断言时变掉）。同一运行里要多个互不相同的随机值时，用不同参数或拼 `{{systemTime}}` 区分。
- 替换范围同环境变量：`instruction`、`url`、`value`、`locator.value`、`locator.name`、`assertion.expected`、`assertion.jsonPath`。
- 主要用途：**构造唯一/随机测试数据**，避免重跑撞到上次运行残留的数据。例：账号 `test_{{systemTime}}`、随机用户名 `user_{{randomChinese}}`、编号 `SN-{{randomNumber:8}}`、手机号 `{{randomPhone}}`、邮箱 `{{randomEmail}}`、证件号 `{{randomIdCard}}`。
- 旧写法 `${name}`（如 `${systemTime}`）是历史语法，运行引擎仍兼容替换，但**生成用例一律写 `{{name}}`**。
- 未知的 `{{...}}` 保留原样：若名字未在项目里定义也不在系统变量名单，运行日志会告警「未定义的环境变量」。

## 8. 测试意图 intent（可选）

顶层 `intent` 描述用例的意图与验收标准，导入时按 schema 校验并随脚本保存。**手写用例可以不填**（导入校验只要求 steps 合法）；它主要服务于工具内置的 AI 生成流程（约束断言、验收覆盖率检查），运行/回放期**不**用 intent 做校验——回放只看 steps。

```json
{
  "version": 1,
  "scenario": "positive | negative | mixed",
  "objective": "本用例要验证什么（1~2000 字）",
  "preconditions": ["前置条件，每条 1~1000 字，最多 30 条"],
  "data": [
    { "name": "数据名", "value": "取值", "policy": "fixed | generated" }
  ],
  "criteria": [
    {
      "id": "以字母开头的短标识（如 listVisible）",
      "description": "验收目标描述",
      "target": "断言作用对象（元素/页面/接口的描述）",
      "source": "目标来源（需求条目/用户原话）",
      "required": true,
      "assertion": { "type": "text", "expected": "..." }
    }
  ],
  "cleanup": ["清理步骤描述，最多 20 条"]
}
```

约束：`criteria` 至少 1 条、最多 50 条，`id` 不得重复，且**至少一条 `required: true`**；`criteria[].assertion.type` 取第 5 节 UI 断言类型的子集（visible/hidden/text/text_exact/value/checked/unchecked/enabled/disabled/count/url/url_exact），`expected` 规则同第 5 节。步骤可用 `criterionId` 引用 criteria 的 id 标注「这步断言验证哪个验收目标」。

## 9. 数据清理建议（可重复运行）

生成用例时建议让用例**跑完尽量不增删系统数据**，让同一用例可重复运行、少污染真实环境：

- **不要拦截接口，也不要绕过接口**：需要实际调用被测系统的接口（接口/WS 断言正是基于真实请求与响应的），不要为了「不产生数据」去 mock、拦截或取消请求——那样断言就失去意义了。
- **创建类操作建议紧跟清理**：凡是会新增/修改数据的步骤（新建、创建、提交、导入），断言验证成功后，**建议紧接着补一个删除/还原步骤**，把刚创建的数据删掉。例如：新建一个商机 → 断言列表出现 → 删除该商机 → 断言已删除。
- **创建建议用唯一数据**：创建时可用 `{{systemTime}}` / `{{randomNumber}}` / `{{randomChinese}}` 拼出唯一名称/编号（见 7.2），删除时按同一标识定位，避免误删已有数据，也避免重跑撞到上次残留。
- **只读类用例**：查询/详情/列表/导出这类不改数据的用例，保持纯只读，可不加清理步骤。
- **清理步骤也建议断言**：删除完成后可加一条 `hidden` 断言（数据已消失）或 `count` 断言（列表行数归零/不含该项）确认清理真的生效。

## 10. 易错点清单

- 枚举拼写精确：`response_status`（非 `responseStatus`）、`ws_received`（非 `ws_recv`）、`text_exact`（非 `textEqual`）、`url_exact`（非 `urlEqual`）、`unchecked`/`disabled`（非 `not_checked`/`disabled_state`）。
- 带 `expected` 的断言类型：`text`、`text_exact`、`value`、`count`、`url`、`url_exact`（缺失或空白 → 导入 400）；`count` 的 expected 必须是非负整数字符串。
- `text_exact` / `value` / `url_exact` 是**全等**比较：`text_exact` 先做空白归一化（连续空白折叠成一个空格再 trim），写 expected 时照渲染文本抄但不必纠结换行；`value`/`url_exact` 是严格全等，多一个字符都算失败。
- `role` 定位器同时填 `value` 和 `role`（同值），漏填 `role` 会导致 `getByRole(undefined)` 失败。
- `wait` 的 `value` 是毫秒数字符串，`"2000"` = 2 秒；漏填默认 1000ms。
- `press` 的 `key` 用 Playwright 键名：`Enter`/`Escape`/`Tab`/`ArrowDown`/`Backspace`…。
- `check` 取消勾选要写 `"checked": false`，不能写 `action: "uncheck"`（没有这个动作）。
- 组件库非原生控件（Select/DatePicker/Cascader/Slider/Checkbox/Radio 等）优先用 `action: "plugin"`（第 6 节），原生 `click`/`selectOption` 对弹层/虚拟列表极脆。
- `goto` 的 `url` 尽量用 `{{baseUrl}}` 前缀，避免硬编码环境域名。
- 每步都写 `instruction`——定位器失效时自愈靠它救回（断言步除外：断言失败一律不自愈）。
- 一个 `.testcase` 文件只含一个用例；多场景拆成多个文件。
- locator 需求：`url`/`url_exact` 不需要 locator；`text` 可省略（整页断言，不推荐）；其余 UI 断言需要普通元素 locator；`response_*`/`ws_*` 需要 `locator.strategy` 为 `response`/`websocket`。
- `url` / `url_exact` 断言**不等待跳转语义**：点击触发跳转后紧接 url 断言可能因跳转未完成而失败，需先加 `wait` 或在前方加 `visible` 断言。
- `scope` 命中 0 个或多个容器都直接失败，容器定位器要足够唯一。
