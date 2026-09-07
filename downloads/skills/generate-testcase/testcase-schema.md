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
  "steps": [ /* TestStep[] */ ],
  "rawCode": ""
}
```

- 后端导入接口读取：`title`（必填）、`description`、`naturalLanguage`、`steps`（按 TestStep 校验）、`rawCode`。`format`/`version` 被忽略，但保留以兼容导出格式。
- 文件扩展名必须 `.testcase`，内容为 JSON（建议 pretty-print）。

## 2. TestStep 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `instruction` | string | 自然语言子指令。**强烈建议必填**：回放时若定位器失效，自愈模块靠它用 AI 重新定位元素；缺失则不自愈直接失败。 |
| `kind` | `navigate`\|`action`\|`assert`\|`wait` | 步骤类别（默认 `action`）。执行引擎只看 `action`，`kind` 仅供分类展示，但应与 `action` 一致。 |
| `action` | enum | 决定执行什么。见下表。 |
| `locator` | object | 元素定位器 `{strategy, value, role?, name?, scope?}`。需要定位元素的 action 必填。 |
| `url` | string | `action=goto` 时必填。支持 `{{var}}` 占位符（环境变量与系统变量统一写法）。 |
| `value` | string | `fill` 的输入文本 / `select` 的选项值 / `wait` 的毫秒数（字符串）。支持 `{{var}}` 占位符（环境变量与系统变量统一写法）。 |
| `key` | string | `press` 的按键名（如 `Enter`、`Escape`、`Tab`），默认 `Enter`。 |
| `assertion` | object | `action=assert` 时必填 `{type, expected?, jsonPath?}`。 |
| `description` | string | 该步骤的「说明」，界面步骤表「说明」列展示。**建议每步都填**，简述意图/预期（如「填写登录账号，值取自环境变量」「校验已跳转到仪表盘」）。与 `instruction` 互补：instruction 是可执行指令（给自愈用），description 是给人看的说明。 |
| `code` | string | `action=raw` 时保留原始代码。当前回放引擎跳过 `raw`，**生成用例时勿用**。 |

## 3. action 与所需字段

| action | kind | locator | url | value | key | assertion | 执行语义 |
|---|---|---|---|---|---|---|---|
| `goto` | navigate | 否 | ✅ | — | — | — | `page.goto(url)` |
| `click` | action | ✅ | — | — | — | — | 元素 `.click()`（超时 10s） |
| `fill` | action | ✅ | — | ✅ | — | — | 元素 `.fill(value)` |
| `press` | action | ✅ | — | — | ✅默认`Enter` | — | 元素 `.press(key)` |
| `check` | action | ✅ | — | — | — | — | 勾选复选框/单选 `.check()` |
| `select` | action | ✅ | — | ✅ | — | — | 下拉 `.selectOption(value)` |
| `assert` | assert | 视类型 | — | — | — | ✅ | 见断言表 |
| `wait` | wait | 否 | — | ✅(毫秒) | — | — | 等待 N 毫秒（`value` 为数字字符串，默认 1000） |
| `raw` | action | — | — | — | — | — | 当前跳过，勿用 |

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
对应 `getByRole('dialog').getByRole('button', {name:'确定'})`。scope 的 strategy 取 testid/role/label/placeholder/text/alt/title/css（不含 xpath/response/websocket），value 语义同主定位。给弹窗内元素写用例时优先加 `role=dialog` 作用域（或该弹窗唯一的 css/id）；普通页面元素无需 scope。

## 5. assertion.type 与所需字段

| type | locator | expected | jsonPath | 语义 |
|---|---|---|---|---|
| `visible` | ✅ 普通元素 | — | — | 等待元素可见（超时 10s） |
| `hidden` | ✅ 普通元素 | — | — | 等待元素**不可见或不存在于 DOM**（超时 10s），等同 Playwright `toBeHidden()`。常用于断言 toast/loading/弹窗已消失。无 `expected`。**不自愈**（AI 重新定位会反向操作） |
| `text` | ✅ 普通元素 | ✅ 子串 | — | 元素文本包含 `expected` |
| `url` | 不需要 | ✅ 子串 | — | 当前页 URL 包含 `expected` |
| `response_status` | `strategy=response` | ✅ 状态码字符串(如 `"200"`) | — | 匹配 URL 关键词的最近响应，状态码含 `expected` |
| `response_body` | `strategy=response` | ✅ 响应体子串 | — | 响应体包含 `expected` |
| `response_json` | `strategy=response` | ✅ 字段期望值 | ✅ 点分路径(如 `data.id`) | 响应体 JSON 取 `jsonPath` 字段，值等于 `expected`（字符串比较） |
| `ws_sent` | `strategy=websocket` | ✅ payload 子串或字段值 | 可选 | 客户端发出的 WS 消息匹配 |
| `ws_received` | `strategy=websocket` | ✅ | 可选 | 服务端推送的 WS 消息匹配 |

要点：

- **response / ws 断言的 `locator.value` 是 URL 关键词子串**，引擎用 `url.includes(value)` 命中运行中最近一次匹配的响应/帧。填路径片段即可，如 `/api/login`、`/ws/notify`。
- **`response_json` 的 jsonPath** 支持数组下标，如 `data.items.0.id`；用 `.` 分隔。`expected` 与字段值做**字符串相等**比较，数字也要写成字符串（如 `"42"`）。
- **ws 断言**：`expected` 为空时只要存在匹配方向的消息即通过；填 `jsonPath` 则按 JSON 字段值断言，否则按 payload 包含文本断言。`ws_sent`=客户端发出，`ws_received`=服务端推送。
- 断言会自动轮询等待异步响应/帧约 1s，不必每条接口断言前都加 `wait`；但页面动画/接口较慢时显式 `wait` 更稳。

### 断言前的等待时机

不同断言的自动等待能力不同，按需在断言前加 `wait` 步：

| 断言类型 | 自动等待 | 是否需显式 wait |
|---|---|---|
| `url` | ❌ 瞬时取当前 URL，不等 | **常需要**：点击触发跳转后，跳转未完成会立即失败。加 `wait`（如 1000ms），或在前方先做 `visible` 断言（它自动等到元素出现，间接保证跳转完成） |
| `visible` / `hidden` | ✅ 自动等元素满足状态，最多 10s | 一般不需要；`hidden` 隐含「等元素消失」语义，常用作操作后的清理等待 |
| `text` | ✅ 自动等元素可见，最多 10s | 一般不需要 |
| `response_*` | ✅ 轮询等响应到达，约 1s | 接口较慢时加 `wait` |
| `ws_*` | ✅ 轮询等匹配帧，约 1s | 服务端推送延迟较高时加 `wait` |

原则：能靠自动等待就别加 `wait`，避免拖慢运行；只有断言依赖的异步结果不在自动等待范围内（典型是 `url` 断言，或动画/接口明显偏慢）时才加，时长一般 300~1000ms。

## 6. 变量占位符

### 6.1 环境变量 `{{name}}`

- 占位符 `{{name}}`，name 规则：字母/下划线开头，含字母/数字/下划线，支持中文（如 `{{baseUrl}}`、`{{密码}}`）。
- 运行时替换为「项目环境变量」中同名的值。替换范围：`instruction`、`url`、`value`、`locator.value`、`locator.name`、`assertion.expected`、`assertion.jsonPath`。
- 未定义的变量保留 `{{name}}` 字面量并在运行日志告警。生成用例时把环境相关值（域名、账号、密码）写成占位符，并在 `description` 里列出需定义的变量名。
- 变量在测试工具的「项目设置」里维护，**不在 .testcase 文件内**。

### 6.2 系统变量（`{{name[:N]}}`）

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

## 7. 数据清理建议（可重复运行）

生成用例时建议让用例**跑完尽量不增删系统数据**，让同一用例可重复运行、少污染真实环境：

- **不要拦截接口，也不要绕过接口**：需要实际调用被测系统的接口（接口/WS 断言正是基于真实请求与响应的），不要为了「不产生数据」去 mock、拦截或取消请求——那样断言就失去意义了。
- **创建类操作建议紧跟清理**：凡是会新增/修改数据的步骤（新建、创建、提交、导入），断言验证成功后，**建议紧接着补一个删除/还原步骤**，把刚创建的数据删掉。例如：新建一个商机 → 断言列表出现 → 删除该商机 → 断言已删除。
- **创建建议用唯一数据**：创建时可用 `{{systemTime}}` / `{{randomNumber}}` / `{{randomChinese}}` 拼出唯一名称/编号（见 6.2），删除时按同一标识定位，避免误删已有数据，也避免重跑撞到上次残留。
- **只读类用例**：查询/详情/列表/导出这类不改数据的用例，保持纯只读，可不加清理步骤。
- **清理步骤也建议断言**：删除完成后可加一条 `hidden` 断言（数据已消失）或列表不含该名称的断言，确认清理真的生效。

## 8. 易错点清单

- 枚举拼写精确：`response_status`（非 `responseStatus`）、`ws_received`（非 `ws_recv`）、`response_body`（非 `responseBody`）。
- `role` 定位器同时填 `value` 和 `role`（同值），漏填 `role` 会导致 `getByRole(undefined)` 失败。
- `wait` 的 `value` 是毫秒数字符串，`"2000"` = 2 秒；漏填默认 1000ms。
- `press` 的 `key` 用 Playwright 键名：`Enter`/`Escape`/`Tab`/`ArrowDown`/`Backspace`…。
- `goto` 的 `url` 尽量用 `{{baseUrl}}` 前缀，避免硬编码环境域名。
- 每步都写 `instruction`——定位器失效时自愈靠它救回。
- 一个 `.testcase` 文件只含一个用例；多场景拆成多个文件。
- `assertion.type=url`/`hidden` 不需要 `locator`（`hidden` 实际需要普通元素 locator；`url` 不需要）；`visible`/`text` 需要 `locator`（普通元素）；`response_*`/`ws_*` 需要 `locator.strategy` 为 `response`/`websocket`。
- `url` 断言**不自动等待**：点击触发跳转后紧接 `url` 断言会因跳转未完成而失败，需先加 `wait` 或在前方加 `visible` 断言。
