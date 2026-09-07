# WebSocket 断言

## 目标
在断言步骤的「定位策略」中新增「WebSocket」，对页面运行中产生的 WS 连接的**发送**与**接收**消息做断言。复用接口响应断言的模式（`locator.strategy` 标识断言对象 + 采集层 + `runAssertion` 分支 + 前端联动 + AI 生成）。

## 断言维度设计
- `assertion.type` 新增 `ws_sent` / `ws_received` 两个值，分别表示对**客户端发出** / **服务端推送**的消息做断言。
- 维度（包含文本 vs JSON 字段）由 `assertion.jsonPath` 有无决定，复用既有字段与 `getByPath`：
  - 无 `jsonPath`：消息 payload **包含** `expected` 子串。
  - 有 `jsonPath`：payload 按 `jsonPath` 取字段值，`String(actual) === expected`。
- `expected` 为空时：只要存在匹配 URL + 方向的消息即通过（断言「有该方向的消息」）。
- 接口定位：`locator.value` 存 WS URL 关键词匹配串（`includes` 匹配 `ws.url()`）。
- 匹配语义：遍历所有匹配 URL+方向的帧，**任一条**满足条件即通过（WS 消息多条，比「最近一条」更合理）。

## 采集
- `page.on('websocket', ws => { ws.on('framesent', f => ...); ws.on('framereceived', f => ...) })`。
- `wsEntries: { url, direction: 'sent'|'received', payload: string }[]`，payload 用 `String(f.payload)`。
- 帧事件同步触发（payload 即时可得），但断言可能紧跟 action、消息稍后到，故查找时轮询等待最多 ~1s（同 `findMatchedResponse` 思路）。
- **不持久化** `wsEntries`（避免 DB 迁移）；失败信息附带最近一条匹配方向消息的片段（截断 200 字）便于排查。

## 改动清单

### 1. `server/src/shared/testScript.ts`
- `locatorSchema.strategy` 枚举追加 `'websocket'`。
- `testStepSchema.assertion.type` 枚举追加 `'ws_sent' | 'ws_received'`。
- `plannedStepsSchema` 的 step：`target` 枚举追加 `'websocket'`；新增可选 `ws: { urlMatch, direction: 'sent'|'received', expected?, jsonPath? }`。
- 顶部 locator 注释补充 `strategy='websocket'` 含义。
- `PLANNED_STEPS_JSON_SHAPE`：补充 `target:"websocket"` + `ws` 字段说明与示例（发送/接收各一）。

### 2. `server/src/services/runnerService.ts`
- import 追加 `type WebSocket`。
- 新增 `type WsEntry = { url: string; direction: 'sent' | 'received'; payload: string }`。
- 在 `page.on('response')` 后注册 `page.on('websocket', ...)`，采集 `framesent`/`framereceived` 入 `wsEntries`。
- `executeStep(page, step, networkEntries, wsEntries)` 与 `runAssertion(page, step, networkEntries, wsEntries)` 签名追加 `wsEntries`；调用点同步。
- `runAssertion` 开头追加：`step.locator?.strategy === 'websocket'` -> `runWebsocketAssertion(step.locator.value, a, wsEntries)` 并 return。
- 新增 `runWebsocketAssertion(urlMatch, a, wsEntries)`：
  - `direction = a.type === 'ws_sent' ? 'sent' : 'received'`。
  - `match(payload)`：`expected` 空 -> true；有 `jsonPath` -> `JSON.parse` + `getByPath` 比较；否则 `payload.includes(expected)`。
  - `findMatchedWsFrame(urlMatch, direction, match, wsEntries)`：轮询 ~1s 找首条匹配帧。
  - 命中则通过；失败 throw，message 附最近一条匹配 URL+方向消息的片段（或「未采集到匹配消息」）。
- 自愈守卫扩展：`step.locator?.strategy !== 'response' && step.locator?.strategy !== 'websocket'`。

### 3. `src/components/StepsTable.tsx`
- `STRATEGIES` 追加 `'websocket'`；`STRATEGY_LABEL['websocket'] = 'WebSocket'`。
- 定位值列：`strategy === 'websocket'` 时 placeholder =「WebSocket URL 关键词」。
- 参数列 `assert` 分支：`isWs = r.locator?.strategy === 'websocket'` 时，断言类型下拉为 `[{ws_sent,'发送'},{ws_received,'接收'}]`；显示期望值 Input + jsonPath Input（可选，placeholder「字段路径，留空按包含文本」）。
- 切换策略重置 `assertion.type`：切到 `websocket` -> `ws_received`；切到 `response` -> `response_status`；切到元素 -> `visible`（把现有切换逻辑通用化）。

### 4. `server/src/services/generationService.ts`
- 新增 `interface PlannedWsAssert { urlMatch; direction: 'sent'|'received'; expected?; jsonPath? }`。
- `PlannedStep` assert 变体追加 `target?: 'ui'|'response'|'websocket'` 与 `ws?: PlannedWsAssert`。
- `executePlannedStep` assert 分支：`target==='websocket' && s.ws` -> 构造 WS 断言 TestStep（`locator.strategy='websocket'`、`assertion.type = direction==='sent'?'ws_sent':'ws_received'`、`expected`/`jsonPath` 透传，沿用 `placeholderValue` 占位符逻辑），不调 `stagehand.observe`。

## 不改动
- Prisma schema：不新增字段，WS 消息不持久化（失败信息自带片段）。
- `TestCaseDetail.tsx`：无需改（WS 断言失败信息走 `message`，不依赖 networkLog 展开）。

## 风险与权衡
- **payload 为 Buffer**：二进制帧 `String()` 可能乱码，但文本/JSON 帧正常；WS 业务消息多为文本，可接受。
- **匹配语义「任一条」**：与 response 的「最近一条」不同，更贴合 WS 多消息场景；在计划中显式说明。
- **不持久化 WS 消息**：失败时只能看 message 里的片段（200 字），不能在失败行展开看完整消息流。如需完整回看后续可加 `wsLog` 字段（涉及 DB 迁移，本次不做）。
- **AI 生成质量**：LLM 拆步时不知实际 WS 消息结构，`jsonPath` 仍是猜测（同 response_json 的固有问题）；`ws_sent`/`ws_received` + 包含文本模式相对鲁棒。

## 验证
- 后端：构造含 WS 连接的页面脚本，分别验证 `ws_sent`/`ws_received` 在包含文本与 JSON 字段模式下的通过/失败；验证 URL 不匹配、消息未到（轮询等待）路径。
- 前端：assert 步骤切换定位策略为「WebSocket」，确认方向下拉、URL 关键词、期望值、字段路径联动；切换策略时 type 正确重置。
- AI 生成：自然语言描述 WS 断言（如「断言 WebSocket 收到包含 connected 的消息」），确认生成步骤结构正确。
