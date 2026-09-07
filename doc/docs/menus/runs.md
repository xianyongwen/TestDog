# 运行记录

所有回放运行的结果汇总：状态、token 消耗、耗时一目了然，失败步骤可下钻到逐步诊断。

<video class="doc-video" src="/videos/runs.mp4" autoplay muted loop controls playsinline></video>
<p class="doc-video-caption">运行记录列表 → 查看明细（跳转到用例详情的运行记录 Tab）</p>

## 运行列表

![运行记录列表](/images/runs-list.png)
<p class="doc-img-caption">运行记录：状态、用例、Token 消耗（含缓存命中）、开始/结束时间</p>

| 列 | 说明 |
| --- | --- |
| **状态** | 通过 / 失败 |
| **用例** | 所属用例名称 |
| **Token 消耗** | 本次运行中 AI 自愈消耗的 token（回放本身零 LLM 成本；列内绿点表示缓存命中比例，缓存部分成本远低于正常调用） |
| **开始 / 结束时间** | 本次运行的时间区间 |
| **操作** | 查看明细 |

顶部工具栏：**刷新**、**清除全部**（清理历史运行记录）。

**行操作**：「**查看明细**」按钮跳转到**用例详情的运行记录 Tab** 并定位到该次运行；直接**点击行任意处**也会跳转到该用例详情。

## 查看明细

点击「查看明细」跳转到**用例详情的运行记录 Tab**，可查看：

![运行明细](/images/run-detail.png)
<p class="doc-img-caption">运行明细：每步状态、耗时与失败信息</p>

- **逐步结果表**：每步的动作、状态（通过/失败）、**自愈**标记、耗时、Token 消耗、信息。
- **运行日志**：浏览器窗口尺寸、登录配置状态、每步 `goto / fill / press / assert → PASSED/FAILED`。
- **失败诊断**：失败步骤自动保存页面**截图**，并采集浏览器 **console 与 network** 记录，通常足以区分「被测应用 bug」与「脚本待修」。
- 右上「**导出**」：结果导出 JSON / Excel（测试报告）。

::: tip 断言与自愈的详细说明
断言类型（UI / 接口 / WebSocket）、自愈机制与采纳回写，见 [回放运行](/guide/replay)。
:::
