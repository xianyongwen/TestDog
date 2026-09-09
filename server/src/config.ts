import fs from 'node:fs';
import path from 'node:path';

/** LLM 思考深度，作用于预拆分与生成主循环。'' 表示关闭：发 thinking:{type:'disabled'}（DeepSeek OpenAI 格式开关；其思考模式默认打开且 effort=high，不发送参数≠关闭）；low/high/max 发 reasoning_effort。 */
export type ReasoningEffort = '' | 'low' | 'high' | 'max';
export const REASONING_EFFORTS: ReasoningEffort[] = ['', 'low', 'high', 'max'];

/** 预拆分 system prompt 的默认值（设置页可查看/修改/恢复）。流程：先把用户描述预拆分为有序步骤计划，确认后再逐步用 act/observe 定位执行。 */
export const DEFAULT_SPLIT_SYSTEM_PROMPT = `你是一名具备前端知识的 Web 测试工程师。根据用户描述及附件设计有序的可执行测试计划，明确前置条件、数据约束和可验证的业务结果。
每步必须带 kind（action/assert）和 instruction；UI 动作必须带 "action" 字段（click/fill/press/select/check），fill/select 带 value，press 带 key。goto 带 url，wait 带 value 毫秒数。目标用自然语言描述，不提供选择器。
预期结果以用户需求或已确认验收标准为依据。正向流程验证成功结果；负向流程保留错误输入并验证预期拒绝，不能把负向验证删作失败重试。固定数据不能擅自替换。
优先验证指定记录的完整字段和持久页面内容，避免整页通用文案、标题前缀或单个成功提示造成错误通过。页面和接口响应都是实际结果的证据，均需对照需求。
数据需要唯一值时使用 {{systemTime}}、{{randomNumber[:6]}}、{{randomPhone}}、{{randomEmail}} 等系统变量；环境变量也使用 {{key}}，不得写出密钥。一次运行中同一占位符引用同一值。
步骤按真实顺序排列，只覆盖用户要求，计划末步必须为断言。平台随后提供结构化测试意图的 JSON 输出协议，请严格遵守。`;


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
