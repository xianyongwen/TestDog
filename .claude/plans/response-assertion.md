# 接口响应断言

## 目标
在断言步骤中新增「接口响应」作为一种断言对象，支持对页面运行过程中产生的 HTTP 接口响应做断言。断言维度：状态码、响应体包含文本、响应体 JSON 字段值。接口定位方式：按 URL 关键词匹配（取运行以来最近一次命中的响应）。

## 设计要点
- **不动 UI 元素定位语义**：`locator.strategy` 仍指 Playwright 元素定位；新增 `response` 值作为「断言对象选择」信号。当 `locator.strategy === 'response'` 时，`locator.value` 存「URL 关键词匹配串」，断言走接口响应分支（不调 `buildLocator`）。
- **断言维度由 `assertion.type` 表达**：新增 `response_status` / `response_body` / `response_json`。`response_json` 用新增字段 `assertion.jsonPath`（简单点分路径，如 `data.id`）取字段值，再与 `expected` 比较。
- **采集响应体**：现有 `page.on('response')` 只存 `{url,method,status,statusText}`，扩展为异步读取响应体回填 `body`（限 20KB 截断，仅 text/json/html/xml 类）。
- **复用现有持久化**：失败步骤已把 `networkEntries` 写入 `StepResult.networkLog`，含 body 后即可在前端失败行展开查看，无需改 Prisma schema。
- **变量替换**：`locator.value`（URL 匹配串）与 `assertion.expected` 已被 `substituteStep` 替换；新增 `assertion.jsonPath` 也纳入替换。
- **失败信息**：沿用 `断言失败：${orig.instruction}（${String(e)}）`，`e.message` 含实际状态码/响应片段便于排查（期望值仅在比较失败时出现在 message 中）。

## 改动清单

### 1. `server/src/shared/testScript.ts`（类型，前后端单一来源）
- `locatorSchema.strategy` 枚举追加 `'response'`。
- `testStepSchema.assertion`：
  - `type` 枚举追加 `'response_status' | 'response_body' | 'response_json'`。
  - 新增 `jsonPath: z.string().optional()`。
- 顶部注释补充 `strategy='response'` 的含义（接口响应断言用，value 为 URL 匹配串）。

### 2. `server/src/services/runnerService.ts`（执行引擎）
- `networkEntries` 元素类型加 `body?: string`。
- `page.on('response')`：push 基本字段后，异步 `res.text()` 回填 `body`（按 content-type 过滤、>20KB 截断、try/catch 吞错）。
- `executeStep(page, step)` → `executeStep(page, step, networkEntries)`；调用点（约 175 行）同步传参。
- `runAssertion(page, step)` → `runAssertion(page, step, networkEntries)`；在开头判断 `step.locator?.strategy === 'response'`，若是则调 `runResponseAssertion` 并 return，否则走原 UI 断言逻辑。
- 新增 `runResponseAssertion(urlMatch, assertion, networkEntries)`：
  - `response_status`：取匹配响应 `status`，`String(status).includes(expected)`，否则 throw「状态码断言失败：实际 X，期望含「Y」」。
  - `response_body`：需 body；`body.includes(expected)`，否则 throw「响应体断言失败：未包含「Y」」。
  - `response_json`：需 body；`JSON.parse` 后按 `jsonPath` 点分取值（含数组下标），`String(actual) === expected`，否则 throw「JSON 字段断言失败：字段「P」实际「A」期望「E」」；解析失败 throw「响应体非合法 JSON」。
  - 匹配查找：`findMatchedResponse(urlMatch, needBody, networkEntries)`——倒序找 `e.url.includes(urlMatch)`；若 `needBody` 且首取 `body` 未就绪，轮询最多 ~1s（每 50ms × 20 次）等异步回填；仍无则回退到不带 body 的匹配项，body 断言再报「响应体未采集到」。
  - 找不到任何匹配：throw「未找到匹配「{urlMatch}」的接口响应」。
- 新增 `getByPath(obj, path)`：按 `a.b.0.c` 取值，缺失返回 `undefined`。

### 3. `server/src/services/runnerService.ts`（变量替换）
- `substituteStep`：在 `if (s.assertion)` 块内新增 `s.assertion.jsonPath = substituteVars(s.assertion.jsonPath, vars, missing);`。
- 说明：`locator.value`（URL 匹配串）已在第 84 行被替换，无需额外改动。

### 4. `src/components/StepsTable.tsx`（前端编辑）
- `STRATEGIES` 追加 `'response'`。
- 定位策略列：`options` 对 `response` 用 label「接口响应」（其余沿用英文值）。
- 定位值列：`strategy === 'response'` 时 placeholder 改「接口 URL 关键词」，仍绑定 `locator.value`。
- 参数列 `assert` 分支：
  - 按 `r.locator?.strategy === 'response'` 切换断言类型下拉 options：
    - 响应模式：`response_status`(状态码) / `response_body`(响应体包含) / `response_json`(JSON 字段)。
    - 元素模式：维持 `visible` / `text` / `url`。
  - 响应模式：三种类型均显示「期望值」Input；`response_json` 额外显示「字段路径」Input（绑 `assertion.jsonPath`）。
- 切换定位策略时同步重置 `assertion.type`：切到 `response` → `response_status`；切回元素 → `visible`（避免类型与来源不匹配）。在定位策略 `onChange` 里处理。
- `VarHints` 对 URL 匹配串、jsonPath、expected 已自动生效（这些字段都已接入 `varText`）。

### 5. `server/src/shared/testScript.ts`（AI 拆步 schema，支持生成接口响应断言）
- `plannedStepsSchema.steps` 元素新增两个可选字段，向后兼容（旧输出无这些字段时按 UI 断言处理）：
  - `target: z.enum(['ui', 'response']).optional()`（缺省视为 `ui`）。
  - `response: z.object({ urlMatch: z.string(), field: z.enum(['status', 'body', 'json']), expected: z.string().optional(), jsonPath: z.string().optional() }).optional()`。
- 更新 `PLANNED_STEPS_JSON_SHAPE`（已拼进拆步 system prompt，第 69 行）：补充说明与示例——当断言针对**接口返回**时，用 `kind:"assert", target:"response"`，并在 `response` 里填 `urlMatch`（URL 关键词）、`field`（`status`/`body`/`json`）、`expected`、`jsonPath`（仅 field=json 时）；针对页面元素/URL 时维持原写法（不填 target/response）。给一两个示例帮助模型区分。

### 6. `server/src/services/generationService.ts`（AI 生成执行捕获）
- `PlannedStep` 本地 union（第 21-25 行）：`assert` 变体增加可选 `target?: 'ui' | 'response'` 与 `response?: { urlMatch; field; expected?; jsonPath? }`。
- `executePlannedStep` 的 `assert` 分支：若 `s.target === 'response' && s.response`，直接构造接口响应断言 `TestStep`，**不调 `stagehand.observe`**：
  - `locator: { strategy: 'response', value: s.response.urlMatch }`。
  - `assertion.type` 按 `field` 映射：`status -> response_status`、`body -> response_body`、`json -> response_json`；`expected`、`jsonPath` 透传。
  - 否则维持原 UI 断言逻辑（observe 取 selector + `type:'visible'`）。
- 其余流程不变：生成阶段断言步骤只构造、不真正校验（与现有 UI 断言一致），运行时由 `runAssertion` 校验。

### 7. 不改动的部分
- Prisma schema：复用 `StepResult.networkLog`，无需迁移。
- `src/pages/TestCaseDetail.tsx`：失败行展开已用 `<pre>` 渲染 `networkLog`，含 body 后自然可见；若 body 过长体验问题后续再优化（不在本次范围）。
- `constants.ts`：`STEP_ACTION_LABEL` 不涉及；策略中文标签就地处理在 `StepsTable` 内。
- `splitSystemPrompt`（用户可配置项）：不改，接口断言能力说明全部写进 `PLANNED_STEPS_JSON_SHAPE` 常量。

## 风险与权衡
- **响应体采集时机**：`res.text()` 在监听器内 await，body 回填是异步的。`response_body`/`response_json` 断言通过轮询 ~1s 等待回填；极端情况下请求未完成会报「响应体未采集到」，属可接受的 MVP 行为。
- **body 体积**：单条截断 20KB，networkLog 仅失败步骤持久化，可接受。
- **术语**：用户称「定位策略加接口响应」，本方案在 UI 上「定位策略」列确实新增「接口响应」选项，符合心智；底层不污染 `buildLocator`（响应断言不经过它）。
- **JSON 路径**：手写点分解析（含数组下标），不引入 `jsonpath` 依赖；覆盖绝大多数接口测试场景。

## 验证
- 后端：构造一个产生 XHR/fetch 请求的页面脚本，新增 `response` 断言步骤，分别验证状态码、响应体包含、JSON 字段三种类型的通过/失败路径。
- 前端：在用例编辑页对 assert 步骤切换定位策略为「接口响应」，确认断言类型下拉、URL 关键词输入、期望值、字段路径输入正确联动。
- 失败回看：断言失败时，失败行展开的 networkLog 能看到对应响应（含 body）。
