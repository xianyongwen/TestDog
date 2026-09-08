# AI 脚本生成：浏览器执行与 token 优化审查

日期：2026-09-08。范围：生成循环、浏览器工具宿主、元素编号与定位、Stagehand 接入，以及生成/回放语义一致性。以下为改动前审查记录，后续实现与验证见文末。

结论：现有“精简观测 → 模型选工具 → Playwright/组件插件确定性执行 → 保存脚本”的架构值得保留。优先修复执行和记录不一致，再减少模型往返、无效观测及重复上下文；不建议整体换成另一个浏览器 Agent。

**对照版本与证据边界**

- 本地实际安装 `@browserbasehq/stagehand@4.0.0`，不是仅依据 package.json 的版本范围。核对了安装包的声明及 `dist/extension/service-worker.js`，确认两步 act、locator 作用域及服务器缓存要求确实存在于安装版本。
- Stagehand 官方源码固定到 [d4f16a98](https://github.com/browserbase/stagehand/tree/d4f16a98a5061279bed997b98fd3f0c17334eedb)。以下引用采用固定提交链接，不把 main 的其他能力自动视为已安装版本能力。
- browser-use 官方源码固定到 [2b1f9d37](https://github.com/browser-use/browser-use/tree/2b1f9d377999a59fe7627c1a5aa88c12aa42e11f)。借鉴的是算法与执行策略，不是 Python API 的直接移植。
- 已运行 4 个相关测试文件，39 项全部通过。另用隔离的 Chromium、本地模拟网页和模拟 LLM/Stagehand 返回值做针对性复现；没有调用付费模型，没有执行真实业务流程。因此不能给出真实任务 token 节省百分比。

**现有实现已经做对的部分**

`doSnapshot` 默认只发送交互编号表，`page_tree` 按需获取；`toolLoop` 会替换同槽旧观测、截短普通结果、在输入水位超限时压缩历史；普通动作在执行前提取定位器，并用 Playwright 验证唯一性及同节点；组件插件把下拉、日期等多次点击合成语义动作；网络响应可供排查提交异常。这些都应继续保留。

| 优先级 | 建议 | 主要收益 | 工作量判断 |
| --- | --- | --- | --- |
| P1 | 修复 SPA 元素编号冲突 | 防止定位失败和错误目标 | 小 |
| P1 | 重做 act 的解析、执行、记录边界 | 避免“生成成功但回放缺步” | 中 |
| P1 | 补齐动作状态语义，尤其取消勾选 | 防止错误执行和重复修复 | 小至中 |
| P2 | 修复续跑观测回收，保留结构化任务记忆 | 减少重复输入和错误引用 | 小至中 |
| P2 | 快照增加必要状态、范围、预算 | 减少观察轮次及每轮输入 | 中 |
| P2 | 动作后自动返回必要观测，加入串行批处理 | 直接减少 LLM 往返 | 中 |
| P2 | 用实际状态判定进展，自动等待断言 | 减少空转和假失败 | 中 |
| P2 | 本地语义动作缓存，校验后复用 | 重复任务减少推理 | 中 |
| P3 | 统一 iframe/Shadow DOM/页面引用 | 扩大可自动执行场景 | 中至大 |
| P3 | 模型分工、按需审查及细分用量 | 控制长任务和额外调用成本 | 小至中 |

**1. P1：SPA 路由切换会让两个节点共享一个编号，已复现**

位置：[locatorCandidateScript.ts:563](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/locatorCandidateScript.ts:563)。URL 改变时清空 `state.byIndex`，但是保留 DOM 节点上的 `el.__ttIdx`。随后 `next` 从空映射算出 0，保留节点继续使用旧编号，新节点又从 1 分配。

复现：页面原有 button/input/input，编号 1/2/3；`history.pushState('/b')` 保留这些节点，再追加一个按钮；新快照出现两个 `[1]`，真实 Playwright 查询 `[data-tt-idx="1"]` 的 count 为 2。SPA 共用导航栏、切换主内容的场景容易触发。

建议使用文档生命周期内单调递增的计数器和 WeakMap，路由变化不重置节点身份；另建只含当前存活节点的映射，避免旧节点长期被强引用。若选择全量重编号，必须同时清除所有节点上的旧编号并更新快照版本。动作参数携带 snapshotVersion，执行前校验版本及目标，防止过期引用。

browser-use 使用 session/backend node identity，并为冲突的 backend ID 分配不冲突的模型索引。参考 [DOMTreeSerializer 的索引分配](https://github.com/browser-use/browser-use/blob/2b1f9d377999a59fe7627c1a5aa88c12aa42e11f/browser_use/dom/serializer/serializer.py#L649)。不必为修这个问题先引入整套 CDP DOM 服务。

**2. P1：act 实际执行与保存脚本不一致，已复现多动作丢失**

位置：[generationToolHost.ts:419](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/generationToolHost.ts:419)。目前先 `stagehand.act(instruction)`，只取 `res.data.actions[0]`，操作完成后才语义化目标。

Stagehand 的 act 有两步路径：首次操作后抓取下一份树，第二次推理优先使用变化部分，返回合并后的 actions。因此并不能假定一次 act 对应一个动作或一次模型调用。参考 [actService.runActPipeline](https://github.com/browserbase/stagehand/blob/d4f16a98a5061279bed997b98fd3f0c17334eedb/packages/extension/services/actService.ts#L140)。安装包也有相同两步路径。

用模拟 Stagehand 实际点击按钮并填写 Alice，再返回两个 actions：浏览器输入值是 Alice，但宿主只记录了 click，fill 丢失。另一个复现中，目标执行后消失，语义化退回原始 CSS；该例不能证明一定回放失败，但证明其绕过了普通动作的“动作前唯一性和同节点验证”。

建议采用“observe 解析 → 动作前验证/采集定位 → 本地确定性执行 → 逐动作保存”。Stagehand observe 返回的是候选动作，不应把所有候选都当作操作计划执行；应选择符合当前目标的一项。若操作展开了新面板，重新观察后再选下一项。参考 [observeService](https://github.com/browserbase/stagehand/blob/d4f16a98a5061279bed997b98fd3f0c17334eedb/packages/extension/services/observeService.ts#L75)。

若保留原始 act，则需要执行前/后的动作钩子或完整跟踪机制；简单地事后遍历 actions，只能补齐数量，不能恢复每个动作执行前的页面状态。还需保存部分成功：当前整体 success=false 时先抛异常，可能丢掉已发生的前半段操作。不要自动重试整个提交链。

**3. P1：取消勾选和按键的生成/回放语义需要统一**

位置：[generationToolHost.ts:150](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/generationToolHost.ts:150)、[runnerService.ts:524](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/runnerService.ts:524)。

- check 描述说支持勾选/取消，但只调用 `.check()`，没有 desired state 参数；act 又把 uncheck 映射成 check，回放同样只 `.check()`。真实浏览器复现：已勾选控件收到“取消勾选”的 instruction 后仍为 true，工具仍成功记录。
- 生成 press 先 click 再全局 keyboard.press，回放是 locator.press。点击可能切换组件、收起浮层或引发导航，两个阶段并不等价。
- 不认识的 Stagehand method 当前默认映射成 click，应该显式拒绝不支持的方法，不能猜。

建议在 TestStep 中保存明确的 checked:boolean，生成与回放都用 setChecked；复选框与 radio 的规则分别定义。press 两侧使用一致的目标和焦点语义。统一动作适配器、参数校验及执行函数，减少两份逻辑漂移。Stagehand 对未知方法返回失败，可参考 [takeDeterministicAction](https://github.com/browserbase/stagehand/blob/d4f16a98a5061279bed997b98fd3f0c17334eedb/packages/extension/services/actService.ts#L316)。

**4. P2：续跑旧快照回收失效；历史应保存任务事实而非大量占位符**

位置：[toolLoop.ts:209](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/toolLoop.ts:209)、[generationLoop.ts:345](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/generation/generationLoop.ts:345)。续跑复用了 messages，但 statefulSlots 每次都是新的空 Map，旧 tool_call_id 没有登记。因此新快照无法替换续跑前的旧快照。已用模拟模型连续调用两次 snapshot 复现：旧 `OLD_BIG_SNAPSHOT` 仍在原消息内。

建议从历史 assistant.tool_calls 和工具定义恢复槽登记，或把观测槽元数据持久化到 checkpoint。恢复时同时重建当前观测，不能直接把暂停前的画面当作当前画面。

此外，当前普通结果仅保留头尾，历史压缩主要截取前 80 字，仍保留消息外壳；60,000 token 水位也只能事后触发，不能保证首次巨型观测不会超限。第一条 user 中的长附件/大纲不受该压缩约束。应建立有预算的 workingMemory，保留：已完成步骤及稳定 ID、当前子目标、已确认的错误原因、实际验证过的数据、失败尝试和下一步；原始轨迹保留在日志，发送给模型的是摘要和最近完整轮次。

browser-use 把历史摘要、当前 browser state 和一次性读取结果分开，并有保留近期历史的可选压缩流程：[message_manager/service.py](https://github.com/browser-use/browser-use/blob/2b1f9d377999a59fe7627c1a5aa88c12aa42e11f/browser_use/agent/message_manager/service.py#L216)。本项目可以先从 TestStep 和结构化结果确定性生成摘要，不必每次额外调用模型压缩。

当前原地改写旧消息还会改变历史前缀；如果网关采用前缀缓存，可能降低可复用前缀长度。这个影响需要看真实 cachedTokens，不能仅凭 messages 变短判断账单收益。固定 system、工具 schema 和任务约束，将动态观测集中放在后部。

**5. P2：快照应更完整地表达状态，同时按区域裁剪**

位置：[locatorCandidateScript.ts:572](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/locatorCandidateScript.ts:572)、[generationToolHost.ts:210](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/generationToolHost.ts:210)。当前只输出 tag、短 label 和 disabled：输入 value、checked/selected/expanded、字段校验、关联 label 和组件动作能力没有稳定进入编号表。已有 pluginNotes 也没有接到该输出。编号表缺乏区分“填好了”和“被联动清空”的信息，会增加 see/readText/page_tree 调用。

建议只补任务决策所需的短状态，例如 `[23] textbox 姓名 value=张三`、`[24] checkbox 启用 checked=true`、`[25] combobox 部门 expanded=false selected=研发 actions=select`。密码只标记是否已填写，其他环境变量值继续走现有脱敏，不能因加 value 把真实变量重新发给模型。

browser-use 默认属性包含 value、checked、selected、expanded、invalid 和输入格式约束，并使用树优化、边界传播及遮挡过滤减少无关内容。参考 [默认属性](https://github.com/browser-use/browser-use/blob/2b1f9d377999a59fe7627c1a5aa88c12aa42e11f/browser_use/dom/views.py#L18)、[DOM 序列化与裁剪](https://github.com/browser-use/browser-use/blob/2b1f9d377999a59fe7627c1a5aa88c12aa42e11f/browser_use/dom/serializer/serializer.py#L773)。

当前编号表无全局预算，未按视口或活动弹窗裁剪；结构树则简单截前 45,000 字，追加在 body 尾部的弹窗可能被截掉。建议 snapshot 增加 scope、query、limit/cursor：默认活动弹窗/当前任务区域，必要时扩展至整页；给出 omitted 数量和继续获取方式。压缩前保留祖先区域名称，避免一串相同“编辑”按钮失去所属行。

Stagehand observe 的 options.locator/ignoreLocators 会进入内部 captureSnapshot 作用域，适合收窄兜底推理：[observeService 的 snapshotOptions](https://github.com/browserbase/stagehand/blob/d4f16a98a5061279bed997b98fd3f0c17334eedb/packages/extension/services/observeService.ts#L77)。本地 4.0.0 声明确认 observe/act 支持这些选项；公开 page.snapshot 的选项仅有 includeIframes，不能直接假设它也接受 locator。

**6. P2：减少模型往返比单纯压短文本更值得做**

位置：[toolLoop.ts:313](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/toolLoop.ts:313)、[generationToolHost.ts:166](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/generationToolHost.ts:166)。模型通常逐个调用动作；动作只返回短结果，变化后再用一次模型调用决定 snapshot/see，然后才能继续。

建议动作宿主在 goto、展开弹层、提交等边界自动等待，再附上必要的新状态或区域快照。例如现有 `模型→click；模型→snapshot；模型→fill` 可变为 `模型→click并附观测；模型→fill`。是减少观察决策轮次，不是所有动作后无条件发送全树。

Stagehand 的两步操作在第一步之后直接抓状态，第二次推理优先使用树差异：[actService](https://github.com/browserbase/stagehand/blob/d4f16a98a5061279bed997b98fd3f0c17334eedb/packages/extension/services/actService.ts#L183)。其 diff 是“新树里未在旧树出现的行”，不是完整的 added/changed/removed 协议：[diffCombinedTrees](https://github.com/browserbase/stagehand/blob/d4f16a98a5061279bed997b98fd3f0c17334eedb/packages/extension/understudy/a11y/snapshot/treeFormatUtils.ts#L76)。本项目若长期用增量观测，必须保留基线、删除信息和版本，不能一边清除旧槽一边只发送 delta。

第二步可增加 batch_actions 或 fill_form：一次模型返回多个独立字段的操作，宿主逐个串行验证、执行、保存；遇到导航、弹窗变化、字段联动、失败或目标失效立即截断，并返回成功列表。不要直接把 parallel_tool_calls 改成 true 后并发操作页面。

browser-use multi_act 对动作序列设静态终止标记，并在每步后检查 URL 和当前页面目标变化：[multi_act](https://github.com/browser-use/browser-use/blob/2b1f9d377999a59fe7627c1a5aa88c12aa42e11f/browser_use/agent/service.py#L2730)。URL 没变的 SPA 联动还需要本项目自己的局部状态/节点校验。

举例：5 个互不联动字段，选择动作的模型调用可从 5 次变 1 次，后续提交和验证另算。若每次输入恰为 8,000 token，这一小段理论减少约 32,000 输入 token；这只是算术示例，真实上下文大小、缓存价格、额外输出与批次中断率都需测量。

**7. P2：记录了步骤不等于任务推进；断言等待应由宿主完成**

位置：[generationLoop.ts:435](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/generation/generationLoop.ts:435)、[toolLoop.ts:417](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/toolLoop.ts:417)。isProgress 主要看步骤数增长，而 click 成功即新增步骤，即使 effect=unknown。重复无效点击可以一直被算作进展。snapshot/page_tree/readText 的循环也不属于当前 see 连击检测。

建议把 executed、recorded、progressed 分开：已执行动作始终如实保存，是否进展则结合目标字段值、URL、弹层状态、网络请求结果和子目标完成情况。相同动作+相同关键状态重复出现才累计停滞；已知循环造数则看新条目或返回 ID。联动检测同样应该读取字段是否真的被清空，不能仅凭两个 selector 交替就认定死锁。

browser-use 分别记录动作重复和页面 fingerprint 停滞：[agent/service.py](https://github.com/browser-use/browser-use/blob/2b1f9d377999a59fe7627c1a5aa88c12aa42e11f/browser_use/agent/service.py#L1496)。其页面指纹也只是信号，不能替代业务断言。

生成断言当前 visible 用即时 isVisible，text/url 也是一次判断；回放 visible/text 已有等待逻辑。位置：[generationToolHost.ts:366](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/generationToolHost.ts:366)、[runnerService.ts:637](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/runnerService.ts:637)。应共用有超时预算的断言执行器，等待条件满足再返回模型，避免 `assert失败→wait→snapshot→assert`。text 使用 body.textContent 还可能命中隐藏 DOM，需要明确全页可见文本或指定结果区域的断言语义。

当前 click 的两次 PNG 哈希和固定 400ms 等待不产生图像模型 token，但增加延迟，动画/光标等也可能使哈希变化。优先用确定性的局部状态和接口证据；页面稳定与业务成功是两个判定，不能互相替代。

**8. P2：可以做本地动作缓存，但不能直接套旧版 cacheDir**

本项目 [createSession](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/stagehandManager.ts:402) 使用本地浏览器和自定义 generate。Stagehand 当前服务器缓存要求 Browserbase API key 与 sessionId；安装包也有相同条件。参考 [buildCacheContext](https://github.com/browserbase/stagehand/blob/d4f16a98a5061279bed997b98fd3f0c17334eedb/packages/extension/services/cacheService.ts#L51)。因此不是给现有本地初始化加个 cache:true/cacheDir 就能零推理复用。

适合借鉴的是“解析结果缓存 → 校验 → 确定性执行”的设计。已有 TestStep 是缓存基础，可缓存经过验证的语义定位器、动作参数模板、作用域、适用页面指纹、前置/后置条件及插件版本。缓存键应隔离项目、页面结构/路由、角色权限和任务目标；变量参数保持占位符。命中后确认唯一性、可操作性和关键前置条件，失败只修复当前动作，再更新缓存。

不要缓存模型用的临时编号，不要仅按 URL 命中；同一路由下不同弹窗和记录可能完全不同。缓存复用动作决策，不能复用“上次断言成功”来代替本次真实断言。复用率高的登录、导航、标准表单最值得优先做；完全陌生任务的首次生成收益有限。

**9. P3：iframe、Shadow DOM 和活动页面需要端到端贯通**

当前收集器只遍历主文档 querySelectorAll；真实浏览器复现：页面只有 open shadow root 和 iframe 内按钮时，编号表是空数组。即使 page_tree 看到了目标，resolveLocator 和语义定位器保存格式也未必能跨 frame 执行。

browser-use 序列化会处理 frame 文档及 shadow children；Stagehand 在 snapshot 中组织 frame 前缀和会话索引。参考 [browser-use DOM 遍历](https://github.com/browser-use/browser-use/blob/2b1f9d377999a59fe7627c1a5aa88c12aa42e11f/browser_use/dom/serializer/serializer.py#L465)、[Stagehand capture](https://github.com/browserbase/stagehand/blob/d4f16a98a5061279bed997b98fd3f0c17334eedb/packages/extension/understudy/a11y/snapshot/capture.ts)。

建议引用包含 page/frame/document 身份，先支持 Playwright frameLocator 和 open shadow DOM，并贯通候选采集、唯一性验证、动作执行、脚本保存及回放。新窗口流程还需 page registry 与明确的 switch_page。若用户场景主要是单页后台，这项可排在 token 优化之后；闭合 Shadow DOM 再评估 CDP 路线。

**10. P3：按需审查、模型分工和正确的费用观测**

[runScriptReview](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/generation/generationLoop.ts:77) 对四步及以上脚本增加一次全局 LLM 调用，但发送的主要是已落步骤，没有关联失败响应、实际成功证据及替代关系。应在结构化轨迹中标记 retry/superseded/evidence，只有出现失败重试、修订或可疑冗余时才审查，并把相应证据带上。简单无重试脚本使用确定性结构校验即可；不能为了少几步损坏原本通过的脚本。

预拆分、主循环、Stagehand 兜底和审查目前基本共用主模型及 reasoningEffort。可单独配置 planner/executor/recovery/reviewer，普通字段定位使用轻量配置，复杂歧义才升级。browser-use 提供独立 page_extraction_llm、compaction_llm 的职责分工，可参考 [agent/service.py](https://github.com/browser-use/browser-use/blob/2b1f9d377999a59fe7627c1a5aa88c12aa42e11f/browser_use/agent/service.py)。是否更便宜取决于失败率和总调用数，而非单次模型单价。

[visualFrameService.ts:26](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/visualFrameService.ts:26) 的“384 token/张”是特定模型假设，工具描述却普遍宣称截图更省。JPEG 质量压缩能减传输量，不能据此证明模型 token 减少；截图路由应以已配置模型的实际 usage 和识别成功率为准。可保留现在的按需看图、裁剪与历史图片回收，并删除未经验证的普遍成本断言。

[tokenUsage.ts](/Users/xianyongwen/Documents/myProject/test-tool/server/src/services/tokenUsage.ts) 已有总输入、输出、缓存输入；再增加 callKind、model、requestId、latency、reasoningTokens、observationBytes，以及主循环/Stagehand 内部调用的拆分。当前 onStep 的差分会把本轮主调用与工具内部调用合在一条，难以判断成本来自选工具还是 act 的额外推理。

**落地与验证顺序**

第一轮先修编号冲突、act 多动作/部分成功、取消勾选、续跑槽恢复，并加最小回归用例。第二轮补状态化快照与有预算的区域观测，统一断言等待和进展信号。第三轮做动作后观测与受控批处理。第四轮再加入跨任务缓存、模型分工和高级 DOM 覆盖。

用固定用例集做改动前后对照：普通表单、弹窗下拉、联动字段、SPA 保留导航节点、异步提交、暂停续跑；iframe/shadow 单独统计。每条独立重置测试数据并重复运行，记录生成完成率、未经人工修改的回放通过率、人工介入率、LLM 调用数、未缓存/缓存输入、输出、总费用与耗时。分别看首次任务与缓存复用任务，不能混合报平均值。

本次验证结果：`contextRewrite.test.ts`、`stuckLoop.test.ts`、`generationSafety.test.ts`、`generationResume.test.ts` 共 39 项通过；额外复现了 SPA 重号、续跑旧快照残留、iframe/shadow 编号遗漏、模拟 Stagehand 多动作只落一步，以及取消勾选语义错误。未执行真实 LLM 基准，报告中的收益排序是源码分析判断，非量化承诺。

**后续实现（2026-09-08）**

按用户要求实现 P1、P2，本地语义动作缓存暂不实现，P3 保持后续范围。

- 编号使用文档内 WeakMap 与递增计数，清理非存活节点映射；快照有文档和版本标识，过期版本不能执行动作。
- act 改为 observe 选择一个候选，再经过动作前语义定位验证和本地执行保存；不会把候选列表误当成多步计划，不支持的方法显式失败。
- 生成和回放共用动作执行器；checked=false 贯通脚本格式、codegen、步骤编辑器与回放，旧 check 脚本默认 true；press 不再额外点击。
- 快照补字段、校验和组件状态，支持活动区域、关键词、分页和输出预算；密码仅显示已填状态，环境值继续脱敏。结构树支持区域及分页。
- 动作结果附带当前状态快照；snapshot/结构树/截图槽相互回收。续跑重建槽登记，并在首次模型调用前刷新页面；人工介入后也重新观察。
- batch_actions 每次最多 6 个独立 fill/check/native select，逐个验证、串行保存；其他字段变化、导航、结构变化、失败或暂停时停止剩余动作。
- 进展依据实际状态变化，记录动作本身不算进展；重复观测参与停滞检测，联动判断要求字段值被改变的证据。
- 生成/回放共用自动等待断言；文本匹配使用可见文本，异步挂载完成后再保存断言定位器。
- 长历史使用实际脚本事实和近期失败证据压缩，保留完整最近轮次；read_goal/read_script 提供原目标与当前脚本的按需读取。内部消息元数据不发送给模型接口。

验证：排除需要真实 Stagehand 会话的 `select-option-stagehand.test.ts` 后，23 个测试文件、245 项全部通过；最终状态处理类型修正后又定向通过 8 项回归。前端 `npm run build` 与服务端 `npm --prefix server run build` 均通过，`git diff --check` 无误。

服务端 `tsc --noEmit` 仍有两处 HEAD 中已存在的问题：`server/src/db.ts:9` 的 DATABASE_URL 可能为 undefined，以及 `server/tests/select-option-stagehand.test.ts:65` 的隐式 any。本次未修改这两处。未运行真实 LLM 费用/成功率基准，不承诺具体 token 降幅。
