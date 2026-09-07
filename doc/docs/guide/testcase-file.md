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
| `action` | `goto` / `click` / `fill` / `press` / `check` / `select` / `assert` / `wait` 等 |
| `locator` | `{strategy, value, role?, name?, scope?}`，按稳定性优先：testid → role → … |
| `assertion` | `action=assert` 时必填：`visible` / `hidden` / 文本 / `url` / `response_status` / `response_body` / `response_json` / `ws_sent` / `ws_received` |
| `value` | 输入文本、选项值、等待毫秒数；支持 <code v-pre>{{var}}</code> 占位符 |
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
