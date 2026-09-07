import fs from 'node:fs';
import path from 'node:path';

/** LLM 思考深度，作用于预拆分与生成主循环。'' 表示关闭：发 thinking:{type:'disabled'}（DeepSeek OpenAI 格式开关；其思考模式默认打开且 effort=high，不发送参数≠关闭）；low/high/max 发 reasoning_effort。 */
export type ReasoningEffort = '' | 'low' | 'high' | 'max';
export const REASONING_EFFORTS: ReasoningEffort[] = ['', 'low', 'high', 'max'];

/** 预拆分 system prompt 的默认值（设置页可查看/修改/恢复）。流程：先把用户描述预拆分为有序步骤计划，确认后再逐步用 act/observe 定位执行。 */
export const DEFAULT_SPLIT_SYSTEM_PROMPT = `你是一名资深 Web 测试工程师。用户会给出一条测试流程的自然语言描述（可能附有页面截图/视觉说明与附件内容），请你据此把整个测试过程预拆分为一份**有序的可执行步骤计划**，后续会在真实浏览器里逐步执行并回放。

输出要求：
- 只输出一个 JSON 对象，格式为 {"steps": [ ... ]}，不要输出其他文字或 markdown 围栏。
- 每个步骤是一个对象：
  · "kind": "action"（动作）或 "assert"（断言），必填。
  · "instruction": 用自然语言写清「操作哪个元素、期望什么」，必填。这是后续用 act/observe 定位与回放自愈的依据，越具体越好，如「点击页面右上角『登录』按钮」「在『用户名』输入框输入 admin」「断言页面右上角显示用户名 admin」。
  · 动作步："action" 可为 goto（需带 "url"）、wait（需带 "value" 毫秒数）；click/fill/press/select/check 等 UI 动作**必须带 "action" 字段**（fill/select 需带 "value" 指定要填入/选中的值，press 可带 "key"），但**不要提供选择器**——目标元素写在 instruction 里，执行时由浏览器自动定位。select 步的 value 写目标选项的可见文本；若不确定页面实际有哪些选项，按语义写近似描述即可——该值仅供参考，执行 Agent 会以页面实际可选列表为准自动修正。
  · 断言步："assertion" 对象：UI 断言用 {"type":"visible"|"hidden"|"text","expected":"..."}，目标元素在 instruction 里用自然语言描述（observe 会去定位）；接口断言用 {"type":"response_status"|"response_body"|"response_json","urlMatch":"/api/xxx","expected":"...","jsonPath":"data.id"}；WebSocket 断言用 {"type":"ws_sent"|"ws_received","urlMatch":"/ws/xxx"}。urlMatch 是 URL 关键词子串，不是完整 URL 或 CSS 选择器。
  · 断言证据要**持久、可复现**：不要断言 toast/浮层等几秒后自动消失的瞬态提示（如「登录成功」「保存成功」「发布成功」）——回放时极易因提示消失时机不确定而误报失败。优先断言**接口响应**（操作基本都有对应接口，response_status/response_json 最稳）；其次断言**操作后的持久页面内容**（列表新增的行、详情页字段、跳转后稳定展示的元素）。若结果只能靠瞬态提示体现，就改断言它带来的持久效果（如列表/详情出现新数据、URL 发生跳转）。
- 步骤按用户操作的真实顺序排列；只保留与测试目标相关的步骤，探查性动作不要。
- 需要唯一/随机测试数据的字段（临时用户名、编号、标题、手机号、邮箱、身份证等）把系统变量拼进 instruction/value 里，写法与环境变量相同都是双花括号：{{systemTime}}（当前时间戳）、{{randomNumber[:n]}}（随机数字）、{{randomChinese[:n]}}（随机汉字）、{{randomPhone}}（随机手机号）、{{randomEmail}}（随机邮箱）、{{randomIdCard}}（随机 18 位身份证号）。系统变量是运行期内置的、无需在项目里定义；只有当项目环境变量恰好定义了同名变量时才以环境变量为准。跨环境复用的值（根域名、通用账号密码）用 {{变量名}} 占位（需在项目设置里定义）；一次性测试数据直接写真实值。
- 计划必须**以一条断言步骤结尾**，验证测试目标已达成（关键结果出现、目标页面元素可见、接口返回成功等）。

【拆步示例】
输入描述：在系统里新增一个公告并验证发布成功。
输出：
{"steps":[
  {"kind":"action","action":"click","instruction":"点击左侧菜单「公告管理」"},
  {"kind":"action","action":"click","instruction":"点击「新建公告」按钮"},
  {"kind":"action","action":"fill","instruction":"在「标题」输入框输入 公告_{{randomNumber[:6]}}","value":"公告_{{randomNumber[:6]}}"},
  {"kind":"action","action":"fill","instruction":"在「内容」输入框输入 这是一条测试公告","value":"这是一条测试公告"},
  {"kind":"action","action":"click","instruction":"点击「发布」按钮"},
  {"kind":"assert","instruction":"断言公告列表出现标题以 公告_ 开头的新条目","assertion":{"type":"text","expected":"公告_"}},
  {"kind":"assert","instruction":"断言公告列表接口返回的最新标题包含新标题前缀","assertion":{"type":"response_json","urlMatch":"/api/announcements","expected":"公告_","jsonPath":"data[0].title"}}
]}`;

/** 定位失败时的修正助手：给定最新页面结构与失败步骤，输出改述后的指令或直接给选择器。 */
export const CORRECT_STEP_SYSTEM_PROMPT = `你是测试脚本生成器的定位修正助手。给定「当前页面结构」和「一个未能定位的步骤」，请修正它以便重新定位。
只输出一个 JSON 对象，不要输出其他文字或 markdown 围栏：
- 若改述步骤的自然语言指令更合适，输出 {"instruction": "修正后的自然语言指令"}；
- 若你能直接从页面结构里确定目标元素，输出 {"selector": "CSS 选择器或 XPath"}；
- 两者都可行时优先给 "selector"。
页面结构里每个元素标记形如 [index] <tag> text…，选择器请用 CSS 或 XPath 语法。`;

export interface AppConfig {
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  /** 主模型（openaiModel）是否具备视觉能力：开启后图片附件/页面截图直接以多模态发给主模型，工具循环提供 see 视觉观察工具。 */
  openaiModelVision: boolean;
  maxSteps: number;
  browserPath: string;
  splitSystemPrompt: string; // 自然语言 -> 步骤拆分所用的 system prompt
  reasoningEffort: ReasoningEffort; // 思考深度：'' = 发 thinking disabled 真关闭，low/high/max = 发 reasoning_effort；预拆分与生成主循环共用
  /** 生成记录的保留天数。null/0 = 永久保留；>0 表示超过 N 天的记录在启动时自动清理。 */
  generationLogRetentionDays: number | null;
}

// 开发期落 server/.local-config.json；生产期由 Tauri 经 CONFIG_PATH 指向 app_data_dir。
const CONFIG_PATH = process.env.CONFIG_PATH ?? path.resolve('.local-config.json');

function readConfigFile(): Partial<AppConfig> {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Partial<AppConfig>;
    }
  } catch (e) {
    console.error('[config] 读取配置文件失败:', e);
  }
  return {};
}

/** 每次调用动态读取（env > 配置文件），改设置无需重启。 */
export function getConfig(): AppConfig {
  const file = readConfigFile();
  return {
    openaiApiKey: file.openaiApiKey ?? process.env.OPENAI_API_KEY ?? '',
    openaiBaseUrl: file.openaiBaseUrl ?? process.env.OPENAI_BASE_URL ?? '',
    openaiModel: file.openaiModel ?? process.env.OPENAI_MODEL ?? 'deepseek-v4-flash-vision-exp',
    openaiModelVision: typeof file.openaiModelVision === 'boolean' ? file.openaiModelVision : false,
    maxSteps: typeof file.maxSteps === 'number' ? file.maxSteps : 200,
    browserPath: file.browserPath ?? '',
    // 旧版拆步提示词（无「必须带 action 字段」特征）已不适用预拆分流程，检出即退回新默认
    splitSystemPrompt: (() => {
      const saved = typeof file.splitSystemPrompt === 'string' && file.splitSystemPrompt.trim() ? file.splitSystemPrompt : '';
      return saved && saved.includes('必须带 "action" 字段') ? saved : DEFAULT_SPLIT_SYSTEM_PROMPT;
    })(),
    reasoningEffort: REASONING_EFFORTS.includes(file.reasoningEffort as ReasoningEffort)
      ? (file.reasoningEffort as ReasoningEffort)
      : '',
    // 默认保留 5 天；显式存 0 也视作「永久」（避免用户手动设 0 时被误清）
    generationLogRetentionDays:
      typeof file.generationLogRetentionDays === 'number' && file.generationLogRetentionDays > 0
        ? file.generationLogRetentionDays
        : file.generationLogRetentionDays === null
          ? null
          : 5,
  };
}

export function isConfigured(): boolean {
  const c = getConfig();
  return Boolean(c.openaiApiKey && c.openaiBaseUrl);
}

export function saveConfig(partial: Partial<AppConfig>): AppConfig {
  const next: AppConfig = { ...getConfig(), ...partial };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

export const CONFIG_FILE_PATH = CONFIG_PATH;

/** 截图存放目录：与数据库同目录的 screenshots/ 子目录。 */
export function getScreenshotDir(): string {
  const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
  const dbPath = dbUrl.replace(/^file:/, '');
  const dir = path.dirname(path.resolve(dbPath));
  const screenshotDir = path.join(dir, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });
  return screenshotDir;
}
