---
name: generate-testcase
description: 生成可导入「测试工具」桌面应用、由 Playwright 确定性回放并验证的 .testcase 测试用例文件（JSON）。当开发者要求为 Web 应用编写/生成/补齐端到端测试用例、UI 自动化测试、接口响应断言、WebSocket 消息断言、回归用例时使用。生成后用本机 Playwright 跑一遍 smoke test 校验所有定位器在目标应用上能解析、副作用成立，失败则改 locator/拆步重跑直到全过；之后 .testcase 可在测试工具中导入并由 Playwright 一键运行验证（断言 UI 可见性/不可见/文本包含与全等/元素值/勾选与可用状态/元素计数/URL 包含与全等/接口状态码/响应体/JSON 字段/WebSocket 消息，组件库控件可用语义动作回放，失败步骤自动截图、采集 console 与 network），或经本地 HTTP API（127.0.0.1:4123）直接推送。
---

# 生成测试工具用例（.testcase）

## 这个技能做什么

把「测试某个 Web 应用」的需求，转化成一个或多个 `.testcase` 文件，导入「测试工具」桌面端后即可 **由 Playwright 真实浏览器回放并自动验证**：

- **回放引擎**：`server/src/services/runnerService.ts` 启动 `playwright-core` 的 Chromium（`chromium.launch`），按 `steps` 顺序执行；支持 `loginConfigId` 以已登录 storageState 创建上下文。
- **验证范围**：UI 断言（`visible` / `hidden` / `text` / `text_exact` / `value` / `checked` / `unchecked` / `enabled` / `disabled` / `count` / `url` / `url_exact`，总预算 10s 自动轮询）、HTTP 响应断言（`response_status` / `response_body` / `response_json`，按 URL 关键词匹配运行中最近响应）、WebSocket 断言（`ws_sent` / `ws_received`，按 URL 关键词匹配帧）。**断言失败不自愈**（AI 换目标会把产品缺陷变成「通过」，断言失败一律保留证据直接记 FAILED）。
- **组件语义动作**：组件库（Ant Design / Element Plus / Element UI / Vant / MUI）的非原生控件（Select/DatePicker/Cascader/Slider/Checkbox/Radio 等）可用 `action: "plugin"` 语义动作回放，引擎自动探测控件、执行动作并后验，失败按「语义链 → 原生兜底 → AI 自愈」降级。
- **失败可观测**：失败步骤自动截图、采集 `console` 与 `network`（截断 20KB）一并落库；运行步骤级进度与最终 PASSED / FAILED 经 WebSocket 实时推送。
- **定位器失效可自愈**：动作步骤带 `instruction` 时，定位失败后经 CDP 附加 Stagehand 用 AI 重新定位元素，无需重写用例。
- **批量回放**：`runBatch` 顺序串跑多个用例（固定无头），汇总 PASSED / FAILED 状态。

## 何时使用

开发者出现以下意图时调用本技能：

- 「写 / 生成 / 补齐 测试用例」「加端到端测试 / E2E / 回归用例」
- 「测试登录 / 表单提交 / 列表加载 / 某个页面流程」
- 「断言接口返回某某」「断言 WebSocket 推送某某」
- 为某个功能模块批量产出可回放的测试脚本

若开发者只是问「这个工具怎么用」「测试用例格式是什么」，直接回答（可引用本技能内容），不必产出文件。

## 产出物

一个或多个 `.testcase` 文件（UTF-8 JSON，扩展名 `.testcase`）。每个文件 = 一个测试用例（含首个脚本版本 v1）。顶层可附 `intent`（测试意图，可选，见 schema 第 8 节）——手写用例通常省略，运行期也不参与校验。

## 工作流

1. **明确目标**：问清或从上下文推断——被测应用的起始 URL、要覆盖的场景（正向流程 + 关键异常）、登录态如何获得。
2. **勘察被测应用**（关键）：阅读前端代码 / 路由 / 组件，确认：
   - 页面路由与 URL 结构（用于 goto、url 断言）
   - 元素的可用定位锚点（按下方「定位器选择优先级」从高到低找）：`data-testid` -> 无障碍 role+name -> 表单 label -> placeholder -> 可见文本 -> 图片 alt -> title 属性（用于 locator）
   - 涉及的接口路径片段（用于 response 断言，如 `/api/login`）
   - 涉及的 WebSocket URL 片段（用于 ws 断言，如 `/ws/notify`）
   - **不要凭空猜测选择器**——基于代码里真实存在的 testid / role / label / 文本来写。
3. **设计步骤序列**：按用户操作顺序拆步，每步一个 `TestStep`。关键点：
   - 每步都写 `instruction`（自然语言）——回放时定位器失效，自愈模块靠它用 AI 重新定位。
   - 每步都写 `description`（界面「说明」列），简述该步意图/预期，给人看。
   - 断言前视情况加 `wait`：`url`/`url_exact` 断言**不等待跳转语义**（点击跳转后紧接 url 断言会因跳转未完成而失败，需先加 `wait` 或在前方加 `visible` 断言）；其余 UI 断言在总预算 10s 内自动轮询，`response_*`/`ws_*` 自动轮询约 1s，通常无需额外 wait，仅接口/动画明显偏慢时才加 300~1000ms。
   - 用断言收敛预期：页面可见/URL 跳转/接口状态码/响应体/JSON 字段/WS 消息。**优先用强断言**：能用 `text_exact`/`value`/`count`/`checked` 等精确断言就不要退化为 `visible`/`text` 包含——精确断言的回归价值更高。
   - **组件库非原生控件优先用语义动作**：被测应用用了 Ant Design / Element Plus / Element UI / Vant / MUI 的 Select/DatePicker/Cascader/Slider/Checkbox/Radio 等控件时，操作步骤用 `action: "plugin"`（详见 schema 第 6 节），原生 click/selectOption 对弹层/虚拟列表极脆。
   - **创建后建议清理**：凡新增/修改数据的步骤（新建、提交、导入），断言验证成功后**建议紧接着补一个删除/还原步骤**把刚创建的数据删掉（如「新建商机 → 断言出现 → 删除 → 断言已删除」），让用例更可重复运行、少污染系统数据。**不要拦截/ mock 接口**——接口要真实调用，接口/WS 断言正是基于真实请求的。
4. **环境相关值用占位符，但只针对高复用值**：
   - **要占位符的（环境维度，会随环境/项目切换）**：根域名 → `{{baseUrl}}`；通用登录凭据（多个用例共用同一账号）→ `{{username}}` / `{{password}}`；第三方密钥、Token、租户 ID 这类跨用例复用的配置。
   - **不要占位符的（用例私有测试数据，由你直接给出）**：本用例专用的测试输入（具体商品 SKU、订单号、搜索关键词、测试邮箱 `t1@example.com` 等）——直接写在 `value` 里。环境变量不是「任何动态值」的容器，**只为跨环境/跨用例复用**而存在。
   - **每次运行都要唯一/随机的数据用系统变量**：需要「重跑不撞残留」的临时数据（临时用户名、编号、标题、手机号、邮箱、证件号），把系统变量拼进 `value`——写法与环境变量统一都是双花括号：`{{systemTime}}`（当前时间戳）、`{{randomNumber}}`（随机数字，可写 `{{randomNumber:8}}` 指定位数）、`{{randomChinese}}`（随机汉字，可写 `{{randomChinese:4}}` 指定字数）、`{{randomPhone}}`（随机手机号）、`{{randomEmail}}`（随机邮箱）、`{{randomIdCard}}`（随机 18 位身份证号）。系统变量由运行引擎内置、每次运行生成新值，无需在项目设置里定义；同名单词若恰好定义了环境变量则以环境变量为准。
   - 在用例 `description` 里**只列出真正需要项目设置里定义的变量**（通常就 `baseUrl`，加上确实复用的账号），不要把一次性测试数据也塞进变量清单。
5. **按 schema 写文件**：字段与枚举必须精确。**务必先读 [testcase-schema.md](./testcase-schema.md)** 获取完整字段表与执行语义，照表填写——枚举拼错会导致导入被后端校验拒绝（HTTP 400）。
6. **本地 Playwright 预校验**（强烈推荐，见下文「本地预校验」一节）：写完文件**不立刻交付**，先用本机 Playwright 跑一遍目标 URL 上的每一步 locator，确认能解析到元素；不通过则改 locator / 拆步，重跑直至全过。
7. **参考示例**：`examples/` 下有覆盖 UI/接口/WS 三类断言的完整范例，可直接对照。
   - [examples/login-flow.testcase](./examples/login-flow.testcase) — 导航/填写/点击 + UI 断言 + 接口状态码断言 + URL 断言 + 环境变量
   - [examples/api-json-assert.testcase](./examples/api-json-assert.testcase) — 下拉/勾选 + 接口 JSON 字段断言 + 响应体断言 + 等待
   - [examples/websocket-notify.testcase](./examples/websocket-notify.testcase) — WebSocket 发送/接收断言
   - [examples/component-actions.testcase](./examples/component-actions.testcase) — 组件语义动作（plugin）+ 强断言（text_exact/value/count/checked）

## 本地预校验（Playwright smoke run）

**目的**：生成 `.testcase` 后、用真实浏览器把每一步定位器在目标应用上跑一遍，**确认所有 `locator` 都能解析到至少 1 个元素**（`goto`/`wait`/`assert url` 校验副作用），失败就改 locator / 拆步 / 加 `wait`，不要把带病 locator 交付出去。

**前置**：
- 本机已装 Playwright。Python：`pip install playwright && playwright install chromium`（项目环境已装好，Python 1.61.1 可用）。Node：`npm i -D @playwright/test && npx playwright install chromium`。
- 知道被测应用的 `{{baseUrl}}` 的实际值（预校验阶段必须把占位符替换为真实域名才能跑）。
- 知道测试账号（若用例涉登录）。

**做法**：写一个临时脚本（推荐放在 `/tmp/` 下、跑完即弃，不要进 git）：

Python 版（推荐，最少依赖）：
```python
# /tmp/verify_<用例名>.py
import json, sys, re, time
from pathlib import Path
from playwright.sync_api import sync_playwright

tc = json.loads(Path("/abs/path/to/<file>.testcase").read_text())
env = {
    "baseUrl":  "https://app.example.com",  # 替换真实值
    "username": "demo",
    "password": "demo123",
    # ...其他用到的占位符
}
def sub(s):
    # 系统变量与环境变量统一写法 {{name}} / {{name:N}} / {{name[:N]}}；
    # 系统变量用固定值（仅预校验），先于环境变量替换（同名单词环境变量优先）
    s = re.sub(r"\{\{systemTime\}\}", str(int(time.time()*1000)), s or "")
    s = re.sub(r"\{\{randomNumber(?:\[:?\d+\]?)?\}\}", "123456", s or "")
    s = re.sub(r"\{\{randomChinese(?:\[:?\d+\]?)?\}\}", "测试用例", s or "")
    s = re.sub(r"\{\{randomPhone\}\}", "13812345678", s or "")
    s = re.sub(r"\{\{randomEmail\}\}", "t1@example.com", s or "")
    s = re.sub(r"\{\{randomIdCard\}\}", "11010519491231002X", s or "")
    s = re.sub(r"\{\{(\w+)\}\}", lambda m: env.get(m.group(1), m.group(0)), s or "")   # 环境变量兜底
    # 旧写法 ${name} 兼容（历史用例可能残留）
    s = re.sub(r"\$\{systemTime\}", str(int(time.time()*1000)), s or "")
    s = re.sub(r"\$\{randomNumber(?::\d+)?\}", "123456", s or "")
    s = re.sub(r"\$\{randomChinese(?::\d+)?\}", "测试用例", s or "")
    s = re.sub(r"\$\{randomPhone\}", "13812345678", s or "")
    s = re.sub(r"\$\{randomEmail\}", "t1@example.com", s or "")
    s = re.sub(r"\$\{randomIdCard\}", "11010519491231002X", s or "")
    return s

# 把每步的 {{var}}（环境变量+系统变量统一写法）替换成真实值
def resolve(step):
    s = json.loads(json.dumps(step))  # 深拷贝
    for k in ("instruction","url","value"):
        if isinstance(s.get(k), str): s[k] = sub(s[k])
    if s.get("locator"):
        s["locator"]["value"] = sub(s["locator"]["value"])
        if s["locator"].get("name"): s["locator"]["name"] = sub(s["locator"]["name"])
    if s.get("assertion"):
        s["assertion"]["expected"] = sub(s["assertion"]["expected"])
        if s["assertion"].get("jsonPath"): s["assertion"]["jsonPath"] = sub(s["assertion"]["jsonPath"])
    if s.get("pluginAction") and isinstance(s["pluginAction"].get("args"), dict):
        s["pluginAction"]["args"] = {k: sub(v) if isinstance(v, str) else v for k, v in s["pluginAction"]["args"].items()}
    return s

def to_pw(page, step):
    """把一个 TestStep 翻译成 Playwright 调用并执行；返回 (ok, detail)。"""
    a = step["action"]
    if a == "goto":
        page.goto(step["url"], timeout=10000); return (True, f"goto {step['url']}")
    if a == "wait":
        page.wait_for_timeout(int(step.get("value") or 1000)); return (True, f"wait {step.get('value')}ms")
    loc = step.get("locator") or {}
    L = page.get_by_test_id(loc["value"]) if loc.get("strategy")=="testid" \
        else page.get_by_role(loc["role"], name=loc.get("name")) if loc.get("strategy")=="role" \
        else page.get_by_label(loc["value"]) if loc.get("strategy")=="label" \
        else page.get_by_placeholder(loc["value"]) if loc.get("strategy")=="placeholder" \
        else page.get_by_text(loc["value"]) if loc.get("strategy")=="text" \
        else page.get_by_alt_text(loc["value"]) if loc.get("strategy")=="alt" \
        else page.get_by_title(loc["value"]) if loc.get("strategy")=="title" \
        else page.locator(loc["value"])  # css / xpath
    if a in ("click","check"):
        L.first.set_checked(step.get("checked", True)) if a == "check" else L.first.click(timeout=5000)
        return (True, f"{a} {loc}")
    if a == "plugin":
        # 组件语义动作依赖测试工具页内插件链，预校验只确认控件定位器能解析到唯一元素，不执行动作
        L.first.wait_for(state="attached", timeout=5000); return (True, f"plugin {step['pluginAction']['action']} (deferred to runner)")
    if a == "fill":
        L.first.fill(step["value"]); return (True, f"fill {loc}={step['value']}")
    if a == "press":
        L.first.press(step.get("key") or "Enter"); return (True, f"press {step.get('key') or 'Enter'}")
    if a == "select":
        L.first.select_option(step["value"]); return (True, f"select {loc}={step['value']}")
    if a == "assert":
        t = step["assertion"]["type"]
        if t == "visible":   L.first.wait_for(state="visible", timeout=5000); return (True, f"visible {loc}")
        if t == "hidden":    L.first.wait_for(state="hidden", timeout=5000); return (True, f"hidden {loc}")
        if t == "text":      L.first.wait_for(state="visible"); assert step["assertion"]["expected"] in L.first.inner_text(), f"text mismatch: {L.first.inner_text()!r}"; return (True, f"text {loc}")
        if t == "text_exact":
            L.first.wait_for(state="visible")
            norm = lambda s: re.sub(r"\s+", " ", (s or "")).strip()
            assert norm(step["assertion"]["expected"]) == norm(L.first.inner_text()), f"text_exact mismatch: {L.first.inner_text()!r}"
            return (True, f"text_exact {loc}")
        if t == "value":     assert step["assertion"]["expected"] == L.first.input_value(), f"value mismatch: {L.first.input_value()!r}"; return (True, f"value {loc}")
        if t == "checked":   assert L.first.is_checked(), "expected checked"; return (True, f"checked {loc}")
        if t == "unchecked": assert not L.first.is_checked(), "expected unchecked"; return (True, f"unchecked {loc}")
        if t == "enabled":   assert L.first.is_enabled(), "expected enabled"; return (True, f"enabled {loc}")
        if t == "disabled":  assert not L.first.is_enabled(), "expected disabled"; return (True, f"disabled {loc}")
        if t == "count":     assert str(L.first.count()) == step["assertion"]["expected"], f"count mismatch: {L.first.count()}"; return (True, f"count {loc}")
        if t == "url":       assert step["assertion"]["expected"] in page.url, f"url mismatch: {page.url}"; return (True, f"url contains {step['assertion']['expected']!r}")
        if t == "url_exact": assert step["assertion"]["expected"] == page.url, f"url_exact mismatch: {page.url}"; return (True, f"url_exact {page.url!r}")
        # response_* / ws_* 真实回放时由测试工具的 runner 校验（依赖 network/ws hook），预校验阶段只确认步骤本身能跑通即可
        if t.startswith("response_") or t.startswith("ws_"): return (True, f"{t} (deferred to runner)")
        raise ValueError(f"unknown assert type: {t}")
    raise ValueError(f"unknown action: {a}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    fail = []
    for i, raw_step in enumerate(tc["steps"]):
        step = resolve(raw_step)
        try:
            ok, detail = to_pw(page, step)
            print(f"[{i:02d}] OK   {step['action']:<6} {detail}")
        except Exception as e:
            print(f"[{i:02d}] FAIL {step['action']:<6} {e}")
            fail.append((i, str(e)))
    browser.close()
    if fail:
        print(f"\n❌ {len(fail)} step(s) failed: {fail}")
        sys.exit(1)
    print(f"\n✅ all {len(tc['steps'])} steps resolved")
```

Node 版（若项目已用 Playwright TS）也按相同思路写 `playwright.chromium.launch()` → 按 action 分支调用 `page.getByTestId` / `getByRole` / `locator`。

**判定标准**：
- 全部步骤输出 `OK` → 通过，可交付。
- 任意一步 `FAIL`：
  - 定位器没匹配到元素 -> 回去看被测应用代码（testid/role/label/可见文本），改 locator 或改写为更稳的 strategy（优先级见下方「关键规则」的优先级表：`testid` > `role` > `label` > `placeholder` > `text` > `alt` > `title` > `css` > `xpath`）。
  - `url` 断言失败（跳转未完成）→ 在前一步后加 `wait`（300~1000ms），或把 `url` 断言换成对落地元素的 `visible` 断言。
  - `fill`/`select` 提示严格模式违规（多个匹配）→ 用 `.first` 或更精确的 locator 子串。
  - 登录后页面被重定向导致后续 locator 失效 → 拆分用例，或在脚本里把登录提前到预校验脚本里手动跑一次再继续。
  - `response_*` / `ws_*` 断言在预校验脚本里**不验证**（依赖测试工具 runner 的 network/ws hook），但**点击 / 填写等触发动作必须跑通**——否则响应根本不会发，导入测试工具后必挂。

**注意**：
- 预校验脚本里用真实值替换 `{{var}}`，**不要改 `.testcase` 文件本体**（文件里仍保留占位符，运行时由测试工具替换）。
- 预校验脚本是临时文件，**不要提交进仓库**（`/tmp/` 或加 `.gitignore`）。
- 若被测应用需要登录态，预校验脚本里先 `page.goto(login_url)` → 填表 → 提交 → 再开始跑用例步骤。
- 涉及写操作的步骤（新增 / 删除 / 提交订单）建议在预校验里用一次性测试账号 + 测试数据，避免污染真实环境。

## 交付与导入

生成文件后，告诉开发者两种导入方式以及「导入之后如何在 Playwright 真实浏览器里跑起来验证」：

### 方式 A — 桌面端 UI 导入（默认推荐）
在测试工具中打开目标项目 → 用例列表页 →「导入」→ 选择 `.testcase` 文件。支持多选批量导入。

**导入成功后的 Playwright 运行验证**（导入只是入库；验证要主动点「运行」）：

1. 进入用例详情 → 顶部选好「登录配置」（已登录状态）或留空（未登录）→ 点 **「运行」**。
2. 后端启动 Chromium → 依次执行 `steps` → 每步产出 PASSED / FAILED：
   - UI 断言（`visible` / `hidden` / `text` / `text_exact` / `value` / `checked` / `unchecked` / `enabled` / `disabled` / `count` / `url` / `url_exact`）、组件语义动作（`plugin`）、接口断言（`response_status` / `response_body` / `response_json`）、WebSocket 断言（`ws_sent` / `ws_received`）。
   - 失败步骤自动截图、采集 `console` 与 `network`（最近 20KB）落库，可点开步骤查看。
   - 步骤级进度与运行日志经 WebSocket 实时推送，UI 上能看到「运行中 / 已通过 / 失败」。
3. 定位器失效时若动作步填了 `instruction`，自动降级 AI 自愈（经 CDP 附加 Stagehand 重新定位）；自愈成功则步骤记 PASSED 并标注「已自愈」、展示自愈后的新定位器。**断言失败不自愈**（换目标会把真实缺陷变成通过）。
4. 「批量运行」入口可串跑多个用例（无头模式），汇总 PASSED / FAILED。

> 生成用例不是「写完即正确」——**必须实际点运行过一遍并全部 PASSED**，才算这条用例可作为回归基线。生成时记得用 `{{baseUrl}}` 等占位符，避免硬编码环境域名导致在他环境跑挂。

### 方式 B — 本地 API 推送（工具正在运行时，地址 `http://127.0.0.1:4123`）
```bash
# 1. 列出项目，拿到 projectId
curl http://127.0.0.1:4123/api/projects

# 2. 推送用例（body 即 .testcase 文件内容）
curl -X POST http://127.0.0.1:4123/api/projects/<projectId>/test-cases/import \
  -H 'Content-Type: application/json' \
  --data @login-flow.testcase

# 若还没有项目，先建一个：
curl -X POST http://127.0.0.1:4123/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"我的应用","baseUrl":"https://app.example.com"}'
```
推送前确认工具已启动（桌面端运行即监听 4123）。若不确定工具是否运行，走方式 A 即可，不要因推送失败阻塞交付。

> 推送仅入库；要触发 Playwright 验证，仍需在桌面端点「运行」，或调运行接口 `POST /api/runs`（body 含 `testCaseId` 必填 + `scriptId` / `steps`（可直接传步骤数组，不必来自已存脚本）/ `selfHeal`（默认 true）/ `headless`（默认 false）/ `loginConfigId`，立即返回 jobId，进度经 WS 推送）；批量运行用 `POST /api/runs/batch`（body `{testCaseIds, selfHeal?, loginConfigId?, scriptIds?}`，固定无头）。

## 关键规则（易踩坑）

- **定位器选择优先级（必须遵守）**：为每个需要定位元素的步骤选择 strategy 时，按下表从上到下依次尝试，命中即用、不要跳级；**建议不使用 XPath**。
  | 定位方式 | strategy | 示例 | 稳定性 | 推荐 |
  | --- | --- | --- | --- | --- |
  | getByTestId | `testid` | `getByTestId('login-btn')` | ★★★★★ | 首选 |
  | getByRole | `role` | `getByRole('button', {name:'登录'})` | ★★★★★ | 首选 |
  | getByLabel | `label` | `getByLabel('用户名')` | ★★★★★ | 强烈推荐 |
  | getByPlaceholder | `placeholder` | `getByPlaceholder('请输入用户名')` | ★★★★ | 推荐 |
  | getByText | `text` | `getByText('登录')` | ★★★★ | 推荐 |
  | getByAltText | `alt` | `getByAltText('头像')` | ★★★★ | 推荐 |
  | getByTitle | `title` | `getByTitle('关闭')` | ★★★★ | 推荐 |
  | CSS | `css` | `button.login` | ★★★ | 兜底 |
  | XPath | `xpath` | `//button[text()='登录']` | ★★ | 最后考虑 |
- **枚举精确**：`action` ∈ goto/click/fill/press/check/select/assert/wait/raw/plugin；`kind` ∈ navigate/action/assert/wait；`locator.strategy` ∈ role/label/text/placeholder/testid/alt/title/css/xpath/response/websocket；`assertion.type` ∈ visible/hidden/text/text_exact/value/checked/unchecked/enabled/disabled/count/url/url_exact/response_status/response_body/response_json/ws_sent/ws_received。拼错=导入 400。
- **check 与取消勾选**：`action: "check"` 缺省勾选；取消勾选写 `"checked": false`（没有 uncheck 动作）。断言勾选状态用 `assertion.type` = `checked`/`unchecked`。
- **组件库控件用语义动作**：Ant Design / Element Plus / Element UI / Vant / MUI 的 Select/DatePicker/Cascader/Slider/TimePicker/TreeSelect/Checkbox/Radio 等非原生控件，操作步骤写 `action: "plugin"` + `pluginAction: {action, args}`（常用 `select`/`set_date`/`set_time`/`set_value`/`check`，参数表见 schema 第 6 节），`pluginId` 建议省略（引擎自动探测控件匹配插件）。原生控件仍用 click/fill/select。
- **role 定位器**要同时填 `value` 和 `role`（同值），`name` 可选：`{"strategy":"role","value":"button","role":"button","name":"登录"}`。
- **接口/WS 断言**用 `locator.strategy` = `response`/`websocket`，`locator.value` 是 URL 关键词子串（如 `/api/login`），不是 CSS 选择器。
- **wait** 的 `value` 是毫秒数字符串（`"2000"` = 2 秒）。
- **press** 的 `key` 用 Playwright 键名（`Enter`/`Escape`/`Tab`/`ArrowDown`…），默认 `Enter`。
- **每步写 instruction**：自愈依赖它（动作步失效时可救回；断言步失败不自愈，AI 换目标会把产品缺陷变成「通过」）。同时填 `description`（界面「说明」列），简述意图/预期。
- **断言前按需加 wait**：`url`/`url_exact` 断言不等待跳转语义，点击跳转后要先加 `wait`（如 500ms）或前方加 `visible` 断言；其余 UI 断言（10s 轮询）与 `response_*`/`ws_*`（约 1s）已自动等待，别重复加。
- **建议生成用例跑完尽量不增删系统数据**：创建类操作断言通过后**可紧跟删除步骤**清理（如「新建 → 断言 → 删除 → 断言已删除」）；但**不要拦截接口**——接口必须真实调用，接口/WS 断言正是基于真实请求。
- **唯一/随机测试数据用系统变量**：需要唯一值的字段（临时用户名/编号/标题/手机号/邮箱/证件号）把系统变量拼进 value，写法与环境变量统一都是双花括号：`{{systemTime}}`（当前时间戳）、`{{randomNumber}}`（随机数字，如 `{{randomNumber:8}}`）、`{{randomChinese}}`（随机汉字，如 `{{randomChinese:4}}`）、`{{randomPhone}}`（随机手机号）、`{{randomEmail}}`（随机邮箱）、`{{randomIdCard}}`（随机 18 位身份证号），如 `test_user_{{systemTime}}`、`user_{{randomChinese}}`；运行引擎每次运行生成新值，避免重跑撞到上次残留。
- **一文件一用例**：多场景拆多个文件。
- 完整字段语义、所需字段对照、执行映射见 [testcase-schema.md](./testcase-schema.md)。
