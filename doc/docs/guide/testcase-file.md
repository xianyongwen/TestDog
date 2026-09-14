# .testcase 用例文件

`.testcase` 是 TestDog 的开放用例格式：一个文件就是一个测试用例（含首个脚本版本 v1），内容为 UTF-8 JSON。用于导入导出、团队分享，以及让编程 agent 离线生成用例。

<video class="doc-video" src="/videos/case-scripts.mp4" autoplay muted loop controls playsinline></video>
<p class="doc-video-caption">用例详情：脚本版本与步骤表格，右上角「导出」可导出 .testcase 文件</p>

## 导入导出

![项目用例列表](/images/project-cases.png)
<p class="doc-img-caption">项目用例列表：「导入用例 / 批量导入」按钮在顶部工具栏</p>

- **导出**：用例详情「**导出**」按钮，导出当前版本的 `.testcase` 文件。
- **导入**：项目用例列表「**导入用例**」（单个）与「**批量导入**」（多选文件/整个文件夹），导入时会校验文件格式，不合规会报明确错误。
- 导入的用例与手动创建的用例完全相同，可继续 AI 生成、录制、回放。

## 文件结构

```json
{
  "format": "testcase",
  "version": 1,
  "title": "用例标题（必填）",
  "description": "可选，用例说明",
  "naturalLanguage": "可选，原始自然语言描述",
  "steps": [],
  "rawCode": ""
}
```

## 步骤（TestStep）要点

每步核心字段：

| 字段 | 说明 |
| --- | --- |
| `instruction` | 自然语言子指令。**强烈建议必填**——回放时定位器失效，自愈靠它用 AI 重新定位 |
| `action` | `goto` / `click` / `fill` / `press` / `check` / `select` / `upload` / `scroll` / `assert` / `wait` 等 |
| `locator` | `{strategy, value, role?, name?, scope?}`，按稳定性优先：testid → role → … |
| `assertion` | `action=assert` 时必填：`visible` / `hidden` / 文本 / `url` / `response_status` / `response_body` / `response_json` / `ws_sent` / `ws_received` |
| `value` | 输入文本、选项值、等待毫秒数；支持 <code v-pre>{{var}}</code> 占位符 |
| `upload` | 文件引用与模式 `{fileIds, mode}`，mode 为 input/chooser |
| `scroll` | `{target, mode, axis?, distance?}`，区分页面、容器和目标元素 |
| `description` | 给人看的步骤说明 |

::: tip 完整字段规范
完整枚举、定位器优先级与执行语义，见技能包内的 `testcase-schema.md`（项目列表页「用例生成技能」下载后解压可查）。
:::

## 用编程 agent 生成用例

项目列表页可下载两个资源（见[项目管理](/menus/projects)）：

- **用例生成技能**：`generate-testcase` 技能包（zip），放入被测项目 `.claude/skills/` 后，Claude Code 等编程 agent 阅读技能与 schema，直接生成可导入 TestDog 的 `.testcase` 文件，并可用本机 Playwright 跑 smoke test 预先校验定位器可解析。
- **测试友好 rule**：测试友好代码规则，给业务代码库加上 `data-testid` 等测试友好标记，让定位器更稳定。

## 推荐工作流

1. 开发写代码时顺手加 testid（或引入测试友好 rule）。
2. 让编程 agent 按 generate-testcase 技能批量产出 `.testcase`。
3. TestDog「批量导入」，回放验证后纳入回归集。

## 上传资源、滚动与作用域

无上传资源通常使用 `version: 1`。包含上传步骤的导出包使用 `version: 2`，顶层 `files` 每项含 `id`、`name`、`mime`、`size`、`sha256`、原文件 base64 `data`。导入要求每个上传引用都有对应资源，校验原字节完整性后在目标项目创建新 ID 并重写引用。单文件最多 20MB、总原文件最多 100MB、资源最多 1000 个。不能只复制含源项目文件 ID 的步骤 JSON。

`upload` 必须有定位器和 `{fileIds, mode}`，单次最多 5 个不同文件。`scroll` 必须有 `{target, mode, axis?, distance?}`：页面滚动不设定位器；容器和元素滚动需要定位器。element 仅用 intoView，其余用 by/toStart/toEnd；by 的距离为 ±10000 px 内非零数，其他模式不写 distance，intoView 不写 axis。

`locator.scope` 保存一个父容器查询，再在其内部定位目标。步骤表可添加、编辑、拾取、折叠或删除范围，不替换主目标。父策略支持 testid/role/label/placeholder/text/alt/title/css；不递归嵌套，不用于接口/WS 或页面滚动。

下载的 generate-testcase 技能包含完整 v2 示例及 upload/scroll/scope 参考。界面操作见[生成与编辑](/guide/ai-generate)。
