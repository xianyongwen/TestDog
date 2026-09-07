import type { TestStep } from '../../shared/testScript';

export interface GenerateParams {
  nl: string;
  startUrl?: string;
  /** 项目环境变量 { key: value }：act 等执行时用真实值、记录的步骤保存占位符。 */
  envMap?: Record<string, string>;
  /** 登录配置：以已登录状态（storageState）启动浏览器生成。 */
  loginConfigId?: string;
  /** 附件 id 列表（上传时已归一化：文本提取 / 图片视觉描述），内容随 prompt 一起发送给模型。 */
  attachments?: string[];
  /** 项目 ID（用于在生成记录里关联项目，可空）。 */
  projectId?: string | null;
  /** 用例 ID（用于在生成记录里关联用例，可空）。 */
  testCaseId?: string | null;
}

export interface ContinueParams {
  nl: string;
  envMap?: Record<string, string>;
  attachments?: string[];
  /** 停止时已生成的步骤（可能已被用户手动调整）：新步骤追加在其后，gen:step 的 index 以其长度为偏移。 */
  baseSteps: TestStep[];
  /** 项目 ID（用于在生成记录里关联项目，可空）。 */
  projectId?: string | null;
  /** 用例 ID（用于在生成记录里关联用例，可空）。 */
  testCaseId?: string | null;
  /** 续跑模式：读回暂停时保存的 loopState（messages）直接继续工具循环，跳过重新拆分/确认。 */
  resumeLoop?: boolean;
}

/** 传给主模型的多模态图片附件（base64 原始图）。 */
export interface SplitImage {
  name: string;
  imageB64: string;
  imageMime: string;
}

/** 预拆分计划的步骤（前后端共享结构）。 */
export interface PlanStep {
  kind: 'action' | 'assert';
  instruction: string; // 自然语言，必填；act/observe 定位与回放自愈都靠它
  /** 动作名：原生动作 goto/wait/click/fill/press/select/check，或插件注册的语义动作（如 select/set_date）。开放字符串，执行期按词表校验。 */
  action?: string;
  url?: string; // goto
  value?: string; // fill/select 的 value；wait 的毫秒
  key?: string; // press
  assertion?: { type: string; expected?: string; urlMatch?: string; jsonPath?: string };
}

export type AssistDecision =
  | { decision: 'redescribe'; instruction: string }
  | { decision: 'ai-fix' }
  | { decision: 'manual' }
  | { decision: 'skip' }
  /** 撤销已生成的第 from~to 步（1-based 含端点，绝对序号、可跨续跑 baseSteps）：立即从脚本删除并广播 gen:revoke，模型收到引导文本后基于当前页面重做。 */
  | { decision: 'revoke'; from: number; to: number; nl?: string };

/** 手动捕获：用户亲自在浏览器里操作一步后，注入脚本捕获到的首个真实事件。 */
export interface CapturedEvent {
  type: 'click' | 'fill' | 'select' | 'press';
  selector: string;
  value?: string;
  key?: string;
}
