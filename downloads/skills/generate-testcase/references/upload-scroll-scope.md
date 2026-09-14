# 上传、滚动与作用域

适用于生成含 `upload` / `scroll` / `locator.scope` 的 `.testcase`。字段以 TestDog 的 `testStepSchema` 与 `testcasePackageSchema` 为准。

## 上传：动作与文件资源一起交付

步骤写 `kind: "action"`、`action: "upload"`、稳定 `locator` 和 `upload: {fileIds, mode}`。

- `mode: "input"`：定位唯一的 `input[type=file]`，允许隐藏，不允许禁用；用 `setInputFiles` 设置文件。
- `mode: "chooser"`：定位上传按钮；先监听文件选择事件，再点击并设置文件。该动作已包含点击，不额外添加一次打开文件窗口的 click。
- `fileIds` 为 1~5 个不同文件 ID。单文件最多 20MB，多文件要求控件支持 `multiple`。保留原始字节，不压缩图片或把文档提取文本当作原文件。
- 文件选中不是业务上传成功；随后断言文件列表、导入记录或需求指定的结果。结果不确定时先检查页面与接口，避免重复提交。
- 文件不存在或用户没有提供所需文件时，说明缺失项；不要编造服务器路径、文件内容或项目文件 ID。

### 可移植 .testcase v2

包含上传动作的可导入文件必须附顶层 `files`，仅写已有项目 ID 不能跨项目导入。每个资源为：

```text
{id, name, mime, size, sha256, data}
```

`data` 是原始字节的标准 base64（不加 data URL 前缀）；`size` 是原始字节数；`sha256` 是同一原始字节的 SHA-256 小写十六进制。用代码从实际文件计算这三项，不交给模型手写。包内 ID 可以是本地稳定字符串，必须与步骤 `upload.fileIds` 一致。

- 无文件的包通常 `version: 1`，含文件的包用 `version: 2`，`format: "testcase"`。
- 文件 ID 不得重复；每个资源必须被上传步骤引用；每个引用必须有对应资源。
- 整包原始文件总量最多 100MB、最多 1000 个资源；单文件最多 20MB。
- 导入会校验大小、base64、SHA-256，在目标项目创建新文件 ID 并重写上传步骤的引用。
- TestDog 单个/批量导出自动附带引用文件；删除文件标签只将其从可选列表移除，保留已有脚本的回放与导出资源。

生成阶段的 `list_files`、临时元素编号、`snapshotVersion` 是工具参数，不写入脚本；文件二进制不应放入模型提示词。

## 滚动：先区分目标

步骤写 `kind: "action"`、`action: "scroll"` 和 `scroll: {target, mode, axis?, distance?}`。

| target | locator | mode |
| --- | --- | --- |
| `page` | 不设置 | `by` / `toStart` / `toEnd` |
| `container` | 唯一且可见的实际滚动容器 | `by` / `toStart` / `toEnd` |
| `element` | 唯一且可见、已挂载的目标元素（可在视口外） | `intoView` |

`axis` 为 `x` / `y`，默认 `y`；`by` 的 `distance` 必须非零、有限且在 -10000~10000 px 内。正数向下/右，负数向上/左。其他模式不写 distance；intoView 不写 axis。

- 普通 click 已自动滚入视口，不为每次点击补 scroll。
- 使用 DOM 滚动和 `scrollIntoViewIfNeeded`，不将其等同于 wheel 输入测试；不跨 iframe 查找。
- `toEnd` 只到当前内容边界，不自动遍历无限列表。虚拟列表目标未挂载时逐段滚动并查新状态，连续不动时停止检查加载状态或定位器，不盲重试。
- 生成快照会显示 `scrollable=x/y/xy`、容器位置/尺寸及页面位置；位移纳入进展与过期快照检测。
- 回放保留滚动参数；修改距离、目标或模式后不能沿用旧验收证据。

## 作用域：先定位父容器，再定位子元素

```json
{
  "strategy": "role", "value": "button", "role": "button", "name": "确定",
  "scope": {"strategy": "role", "value": "dialog", "role": "dialog", "name": "导入客户"}
}
```

按 `page.getByRole('dialog', {name:'导入客户'}).getByRole('button', {name:'确定'})` 查询。作用域应唯一存在，不用 `.first()` 掩盖多匹配。目标必须在该容器的实际 DOM 子树中；portal 下拉可能位于 body，不能仅凭视觉位置套上弹窗范围。

- scope 策略支持 `testid/role/label/placeholder/text/alt/title/css`；不支持 xpath、response、websocket 或递归 scope。
- role 策略同时填写 value 和 role，值相同，可加 name 区分同角色容器。
- scope.value/name 支持项目占位符；本地预校验也必须替换，不能只替换主定位器。
- 步骤表支持添加、展开编辑、折叠、单独拾取或删除作用域。拾取作用域只更新父容器，保留主目标；删除作用域保留主目标并恢复页面级查询。
- 页面滚动没有 locator，也没有 scope；容器滚动与上传可通过 locator.scope 限定目标。接口/WS 定位不使用 scope。

## 验证与交付

读 [完整示例](../examples/upload-scroll-scope.testcase)。示例的 testid、URL 是演示约定，必须按被测应用调整，不代表已在用户环境回放通过。

优先在用户授权的测试环境中用 TestDog 实际运行导入用例，覆盖文件 ID 重映射、上传事件、滚动和作用域。若只做本地 Playwright smoke，必须实现相同文件/滚动语义并校验业务结果；不能把跳过的新动作记为通过。通用技能内的简化 smoke 模板不支持 upload/scroll，会明确拒绝。

无法运行时交付文件并明确未验证项；不要无限重试、换文件或改断言来掩盖失败。upload、scroll、assert 在当前回放实现中不走通用 AI 自愈。
