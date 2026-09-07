# AI 生成用例功能 实现方案

## 目标与定位

新增「AI 生成用例」模块，位于现有「生成脚本（模块①）」**之前**：

```
需求文档(pdf/docx/txt/md) + 原型/截图(png/jpg) + 功能描述(文本)
  → @langchain/community 归一化为统一文本 + 图片走 PP-OCRv6 Medium OCR
  → 归一化语料丢给 LLM → 生成多条测试用例(TestCase: title/description/naturalLanguage)
  → 用户确认/编辑 → 保存为用例
  → 对用例「拆分步骤」→ LLM 生成测试脚本(TestStep[]，存为 TestScript 新版本)
```

**关键复用**：
- LLM 调用复用 `generationService.ts` 的 **openai-compatible + json_object** 模式（deepseek/ark 网关拒 json_schema，须把 JSON 形状写进 system prompt + 客户端 zod 校验）。
- token 计费复用 `services/tokenUsage.ts`。
- 异步进度/取消复用 `ws/hub.ts`（publish/registerCancel）+ 前端 `api/ws.ts` 事件总线。
- 步骤预览/编辑复用 `components/StepsTable.tsx`；日志复用 `components/RunLog.tsx`。
- 用例/脚本数据模型**无需改动 schema**：TestCase 已有 `title/description/naturalLanguage`，TestScript 已有 `steps/rawCode`。

**与现有「生成脚本」页的区别**：现有 Generate 是「NL → 拆步 → Stagehand 在真实站点执行捕获 selector → 脚本」，需要活的 URL。新功能的「拆分步骤」是**纯 LLM 拆步**（需求文档阶段通常没有活站点），产出带 `instruction+kind+action` 但无 `locator` 的草稿脚本；之后用户仍可进入现有 Generate 页用浏览器精修定位器。两者互补。

## OCR 方案（已确认）：ONNX 自包含

用 `onnxruntime-node` 加载官方 HuggingFace 模型，TS 实现 det→rec 流水线。模型参数取自已抓取的 `inference.yml`：

- **det**(`PaddlePaddle/PP-OCRv6_medium_det_onnx`)：`DBPostProcess`，`thresh:0.2`/`box_thresh:0.45`/`unclip_ratio:1.4`/`max_candidates:3000`；预处理 BGR、ImageNet mean`[0.485,0.456,0.406]`/std`[0.229,0.224,0.225]`/scale`1/255`、HWC→CHW、动态 resize。
- **rec**(`PaddlePaddle/PP-OCRv6_medium_rec_onnx`)：`CTCLabelDecode`，`image_shape:[3,48,320]`（宽动态到 3200）；**字符表内嵌在 yml 的 `character_dict`**（实现时一次性导出为 `dictionary.json` 随仓库提交，运行时不解析 yml）。
- **cls**（角度分类）：HF 仓库 gated(401)；截图/原型文字正向，**默认跳过 cls**，作为可选后续。

几何运算（轮廓检测/多边形扩张/透视裁剪）用 OpenCV.js(WASM)；图像解码/resize 用 `sharp`。OCR 模块隔离在单一 `ocrImage(buf,mime): Promise<{text,boxes}[]>` 接口后，便于独立开发与单测。

## 依赖（server/package.json 新增）

| 包 | 用途 | 备注 |
|---|---|---|
| `@langchain/community` + `@langchain/core` | 文档归一化 loaders | ESM，与项目 `"type":"module"` 一致 |
| `pdfjs-dist` | PDFLoader 对等依赖 | 纯 JS |
| `mammoth` | DocxLoader 对等依赖 | |
| `@fastify/multipart` | 文件上传 | |
| `onnxruntime-node` | ONNX 推理 | 原生模块，与 better-sqlite3 同类，沿用现有打包处理 |
| `sharp` | 图像解码/resize | 原生模块 |
| `@techstark/opencv-js` | det 后处理几何 | WASM，无原生编译 |

前端无新依赖（antd 已有 Upload 组件）。

## 数据契约（server/src/shared/testScript.ts 追加）

仿 `plannedStepsSchema` + `PLANNED_STEPS_JSON_SHAPE` 模式，新增两套 schema + 对应 JSON 形状文本（写进 prompt）：

```ts
// 1) 归一化语料 → 测试用例
export const generatedTestCasesSchema = z.object({
  cases: z.array(z.object({
    title: z.string(),          // 用例标题
    description: z.string(),    // 用例说明（覆盖点/前置条件）
    naturalLanguage: z.string(),// 可执行测试流程描述（喂给后续拆步/现有 Generate）
    category: z.string().optional(), // 如 主流程/异常/边界
  })),
});
export const GENERATED_CASES_JSON_SHAPE = `{
  "cases": [ { "title": "...", "description": "...", "naturalLanguage": "...", "category": "..." } ]
}
naturalLanguage 必须是一段具体、可依次执行的 Web 测试流程描述（含操作与断言），凭据类用 {{变量名}} 占位。`;

// 2) 用例 → 拆分步骤（草稿脚本）
export const caseStepsSchema = z.object({
  startUrl: z.string().optional(),
  steps: z.array(z.object({
    instruction: z.string(),
    kind: z.enum(['navigate','action','assert','wait']),
    action: z.enum(['goto','click','fill','press','check','select','assert','wait']).optional(),
    value: z.string().optional(),   // fill 文本等
  })),
});
export const CASE_STEPS_JSON_SHAPE = `{
  "startUrl": "<可选>",
  "steps": [ { "instruction": "...", "kind": "navigate|action|assert|wait", "action": "goto|click|fill|press|check|select|assert|wait", "value": "<可选>" } ]
}
kind=wait 时 instruction 写明时长（如「等待 2 秒」）。`;
```

## 后端实现

### 1. `services/ocrModels.ts` — 模型下载/缓存
- 配置项 `ocrModelDir`（开发 `server/.ocr-models`；生产 `app_data_dir/ocr-models`，由 Rust 注入）。
- `ensureModels()`：缺则从 HF `resolve/main/inference.onnx` 下载 det/rec 两个 onnx 到本地（带 `aigen:progress` 进度）。首次 OCR 触发，复用 Chromium「首次启动下载到 app_data_dir」策略，安装包不膨胀。
- `dictionary.json` 随仓库提交（从 rec yml 的 `character_dict` 一次性导出）。

### 2. `services/ocrService.ts` — PP-OCRv6 推理（隔离）
- `ocrImage(buf, mime): Promise<string>`：单图 → 文本。
- 流水线（参数取自 yml）：
  1. `sharp` 解码 → BGR raw 像素 → det 预处理（动态 resize 限长边、归一化、CHW）。
  2. onnxruntime-node 跑 det → 概率图 → OpenCV.js `threshold`+`findContours`+`approxPolyDP` → 候选框；按 `box_thresh` 过滤、`unclip_ratio` 扩张（offsetPolygon）。
  3. 每个框 OpenCV.js `getPerspectiveTransform`+`warpPerspective` 裁成水平文本块。
  4. rec 预处理（高 48、按比例缩放、归一化、CHW）→ onnxruntime-node 跑 rec → CTC 解码（合并重复、去 blank、按 `dictionary.json` 映射）→ 文本+置信度。
  5. 按框位置排序拼接为整图文本。
- **风险点**：det 后处理几何是全方案最高实现风险；mitigation = 隔离接口 + 用 OpenCV.js 标准算子 + 实现期可用真实截图对拍 RapidOCR 结果校验。

### 3. `services/aiCaseService.ts` — 主流程（异步 WS）
- `generateCases(jobId, { projectId, docPaths, imagePaths, functionalDesc, startUrl })`：
  - **归一化**：按扩展名分流——`@langchain/community` 的 `PDFLoader`/`DocxLoader`/`TextLoader` 读文档 → 取 `pageContent` 拼接；图片走 `ocrService.ocrImage`。推 `aigen:progress { stage:'normalize'|'ocr', name, index, total }`。
  - **LLM 生成用例**：`createOpenAICompatible({name,apiKey,baseURL}).chatModel(model)` + `generateObject({ model, schema: generatedTestCasesSchema, system: <生成用例 system prompt + GENERATED_CASES_JSON_SHAPE + 环境变量键提示>, prompt: 归一化语料+功能描述 })`；`addUsage` 记账。
  - 推 `aigen:cases { jobId, cases }` → `aigen:done { usage }`；异常 `aigen:error { message, usage }`。
  - system prompt：资深测试工程师；据需求/原型/截图/功能描述生成覆盖主流程+异常+边界的用例集；`naturalLanguage` 必须具体可执行；凭据用 `{{envVar}}` 占位（用项目 EnvVar 键，不泄露值，同 generationService）。
- 取消：`registerCancel(jobId, …)` + AbortController 传给 `generateObject` 的 `abortSignal`。

### 4. `services/aiScriptService.ts` — 用例拆步（同步 HTTP）
- `splitSteps({ naturalLanguage, startUrl?, envVarKeys }): Promise<{ steps: TestStep[], usage }>`：`generateObject` + `caseStepsSchema` + `CASE_STEPS_JSON_SHAPE`；映射为 `TestStep[]`（`instruction/kind/action/value/description`，无 `locator`）。单次 LLM 调用，同步返回。

### 5. `routes/aiGenerate.ts`
- `POST /api/projects/:projectId/ai-generate`（**multipart**）：收文档+图片+functionalDesc+startUrl，存临时目录，返回 `{ jobId }`，异步跑 `aiCaseService.generateCases`（WS 推进度）。未配置网关同步返错误。
- `POST /api/test-cases/:id/split-steps`：同步调 `aiScriptService.splitSteps`，返回 `{ steps, usage }`。
- `POST /api/projects/:projectId/test-cases/bulk`：批量建用例（`[{title,description,naturalLanguage}]` → 多条 TestCase），事务。
- `POST /api/ocr/download`（可选）：手动触发模型下载 + 返回状态。

### 6. `index.ts` / `config.ts` / `settings`
- `index.ts`：`app.register(multipart)` + 注册 `aiGenerateRoutes`。
- `config.ts`：加 `ocrModelDir`、`ocrEnabled`（默认 true）。
- `routes/settings.ts` + `src/pages/Settings.tsx`：OCR 模型目录、开关、就绪状态（模型是否已下载）；沿用现有 mask/保存模式。

### WS 协议（复用单条 `/ws`，按 jobId 过滤）
- 服务端→客户端：`aigen:progress` / `aigen:cases` / `aigen:done` / `aigen:error`（均带 `jobId` + `usage`）。
- 取消：客户端发 `{type:'cancel', jobId}`（已有机制）。

## 前端实现

### `src/pages/AIGenerate.tsx`（新页面，路由 `/projects/:projectId/ai-generate`）
- 顶部：返回 + 标题 + 入口来自 `ProjectCases` 的「AI 生成用例」按钮。
- 输入区（Card）：
  - `Upload.Dragger` 多选：文档（pdf/docx/txt/md）+ 图片（png/jpg/jpeg/webp），分别分组展示文件列表。
  - 功能描述 `Input.TextArea`（必填）；起始 URL（可选，取项目 baseUrl 预填）。
  - 「生成」按钮 → `fetch('/api/projects/:id/ai-generate', { method:POST, body:FormData })` 拿 jobId；订阅 `aigen:*`。
- 进度区：`RunLog` 展示 `aigen:progress`（归一化 X / OCR Y / 生成中…）+ token。
- 结果区：`Table` 展示 `aigen:cases`，行可编辑（title/description/naturalLanguage/category），`rowSelection` 选要保存的；「保存选中用例」→ `POST .../test-cases/bulk` → `message.success` + 跳回用例列表。
- 每个已保存用例提供「生成脚本」按钮 → `POST /api/test-cases/:id/split-steps` → `StepsTable` 预览编辑 →「保存脚本版本」→ `POST /api/test-cases/:id/scripts { steps }`（现有接口）。
- 复用：`http`/`ws`/`RunLog`/`StepsTable`/`fmtToken`。

### `src/App.tsx` / `src/pages/ProjectCases.tsx`
- `App.tsx`：加 `<Route path="/projects/:projectId/ai-generate" element={<AIGenerate/>} />`。
- `ProjectCases.tsx`：工具栏加「AI 生成用例」按钮 → `nav('/projects/:id/ai-generate')`。

## 打包注意
- `onnxruntime-node`/`sharp` 是原生模块，与现有 `better-sqlite3` 同类，沿用 SEA/pkg 打包原生模块的处理（见 `测试工具开发plan.md` 风险点 1）。
- `@techstark/opencv-js` 是 WASM，需把 `.wasm` 作为 asset 一并打入。
- ONNX 模型文件（约数十 MB）**不入安装包**，首次 OCR 时下载到 `app_data_dir/ocr-models`（与 Chromium 同策略）。

## 里程碑（可独立验证）
1. **M-OCR**：`ocrService` 单图跑通——对一张截图 OCR 出文本，与 RapidOCR/官方 demo 结果对拍。`ocrModels` 下载缓存就绪。
2. **M-NORM**：langchain loaders 对 pdf/docx/txt 出文本；与 OCR 文本拼接为归一化语料。
3. **M-CASE**：`aiCaseService` + multipart 路由 + WS 进度；curl/前端触发 → `aigen:cases` 返回多条用例，token 计账正确。
4. **M-UI**：`AIGenerate.tsx` 页面上传→进度→可编辑用例表→批量保存；ProjectCases 入口接通。
5. **M-SCRIPT**：`splitSteps` 路由 + 用例「生成脚本」→ StepsTable 预览 → 保存脚本版本；后续可进现有 Generate 浏览器精修。
6. **M-SETTINGS**：Settings 加 OCR 模型目录/开关/就绪状态。

## 主要风险
- **det 后处理几何**：全方案最高风险。mitigation=OpenCV.js 标准算子 + 隔离接口 + 对拍校验；若 TS 实现过于脆弱，可在同一 `ocrImage` 接口后降级为 Python `paddleocr` 子进程（不波及上层）。
- **json_object 网关约束**：须严格复用 `generationService` 的「schema 仅客户端校验 + JSON 形状写进 prompt」模式，否则 deepseek/ark 拒 `json_schema`。
- **rec 多输出头**：v6 rec 可能有 CTC+GTC 多输出，实现期需按 onnx 输出名确认取 CTC 分支。
- **原生模块打包**：onnxruntime-node/sharp 随 sidecar 打包需验证（沿用 better-sqlite3 既有处理）。
