# 插件红线与安全边界（违反任意一条将导致插件被拒收或运行异常）

## 安全边界
1. **插件代码只允许在被测站点的浏览器环境执行**——禁止任何 Node 侧代码、`require`/`import`、`fetch` 平台内部接口。平台 Node 侧不含任何插件代码，这是安全模型根基。
2. 禁止访问/修改 `window.__ttCandidates__`、`window.__ttAnalyze` 等平台内部符号（只读使用 `__ttPluginRegistry__` 与 `__ttPickWait`）。
3. 禁止 `localStorage/sessionStorage` 清除、`document.cookie` 批量改写等破坏页面状态的行为。

## 定位（candidates）
4. 一切候选都会被平台验证（页内唯一 + 真实定位 count===1 且同节点）；**不要试图产出「碰运气」的宽泛候选**（如裸 `div`、通配 css）——它们会被验证管线静默丢弃。
5. `xpath` 策略仅限最后手段：活不过一次组件库小版本升级的概率极高。优先 role/placeholder/testid/label。
6. 弹层内容必须带 `scope`（先锚定可见的弹层容器），因为弹层 portal 到 body 下且实例常驻——命中隐藏弹层的候选会被唯一性校验淘汰，等于白写。

## 动作（actions）
7. **禁止 dispatchEvent 假事件伪装点击**作为主要手段——平台外壳已优先 Playwright 真实交互（fill/click），页内合成事件（`el.click()`、`new MouseEvent`）只用于真实交互无法触达的页内闭环（面板翻页等），并在 doc 中向用户说明。
8. 动作必须是**页内闭环**：状态相关的步数（翻几页、展开几层）在 fn 内部循环解决，禁止「执行一半返回让外壳拆步」。
9. 动作内禁止 `alert/confirm/prompt`、禁止修改 `location`/`history`、禁止注入新的 `<script>` 标签加载外部代码。
10. 动作超时：单次动作应在 10s 内完成（外壳 15s 兜底超时）；长等待用 `__ttPickWait` 明确轮询而非 `setTimeout` 瞬等。
11. 动作返回字符串（人类可读、含关键结果）；抛错时错误信息要能指导模型换路径（如「选项未找到：X，弹层当前选项：A/B/C」）。

## pw 桥（Playwright API）
- pw 只在动作/后验里可用（第三参数）；detect/candidates/annotate 同步插槽拿不到。仅平台外壳（生成/回放/试运行/harness）内注入，别处调用报「桥未注入」。
- 每次调用是跨进程往返：**禁止放进高频轮询循环**；等待交给 Playwright auto-wait / `{ timeout }` 参数或页内 `__ttPickWait`。
- 给每个 pw 动作调用显式传 `{ timeout }`（Playwright 默认 30s 会撑爆外壳 15s 动作兜底），保证动作总耗时 ≤ 10s。
- DOM 节点不能作为 pw 方法的普通参数传递；需要把动作里的 `el` 交给 Playwright 时用 `pw(el)`
  注册为作用域 Locator 再续链（仅支持主 frame 内元素；函数不能跨桥，`evaluate` 传字符串表达式）。
- pw 是**增强而非唯一路径**：主要闭环应能靠页内 DOM 完成；pw 调用要容错（try/catch 后走页内兜底），不要让「桥未注入」直接废掉整个动作。

## 兼容性
12. 同 id 重复注册被忽略；插件脚本必须幂等（多次注入无副作用）。
13. 不要假设组件库版本——detect 宽进、candidates 按实测 DOM 写；跨 element-ui/element-plus 时用共同类名前缀 `.el-`。
14. 禁止与平台原子动作重复造轮子：原生 `<select>` 用平台的 select 步骤；可输入控件优先 `preferFill: true`，actions 只兜「真实交互走不通」的路径。
