/**
 * 测试工具插件契约声明（对外发布）。
 *
 * 插件是纯页内脚本：不依赖本平台任何代码，只需先注入运行时框架
 * （window.__ttPluginRegistry__，或使用 server/scripts/pluginHarness.ts 的内嵌 polyfill），
 * 然后调用 register 注册四类能力。插件代码只在被测站点的浏览器环境中执行。
 *
 * 用法：
 *   window.__ttPluginRegistry__.register({
 *     id: 'my-select',
 *     detect: (el) => !!el.closest('.my-select'),
 *     candidates: (el) => { ... return PickCandidate[] },
 *     annotate: (el) => '我的下拉：当前值 xxx',
 *     actions: {
 *       select: {
 *         doc: '...',
 *         preferFill: false,
 *         verify: (el) => /* 校验终态，如选中项文本 *\/,
 *         fn: async (el, args, pw) => '已完成',
 *       },
 *     },
 *   });
 *
 * 动作执行模型（语义动作层）：
 * - 平台按「detect(el) 命中 && actions 含该动作」过滤插件组成匹配链（registry.resolveChain），
 *   按 preset 优先级（注入顺序）逐个调用动作 helper；
 * - 动作结果三态：string = success（向后兼容）、throw = failed、
 *   { status: 'success'|'failed'|'uncertain', message } = 显式三态（uncertain 交由平台效果校验兜底）；
 * - 可选 verify 页内后验：成功后校验终态，不过视同 failed（链上下一插件接手），后验自身异常视同 uncertain；
 * - 无 verify 时平台以页面效果哈希（前后帧变化）兜底校验，不轻信插件自述；
 * - 链上全部失败后回落原生交互 tier，仍失败才回灌 LLM。
 *
 * 平台保证：
 * - candidates 产出的候选一律经平台验证（页内唯一性 + 真实定位 count===1 且命中同一节点）
 *   后才落库；返回不唯一/不命中的候选会被自动跳过，不会误点。
 * - 异常隔离：任一插槽抛错只影响该插件自身，不会污染主链路或其他插件。
 * - invokeAction 结果归一化为 PluginActionResult（不抛错），调用方按 status 分流；
 *   Node 侧不含任何插件代码（安全边界）。
 *
 * 已知限制（务必阅读）：
 * - actions 在页内无法产生可信事件（isTrusted=false）。对自家组件的 Vue/React 监听器
 *   通常有效，但若组件显式校验 isTrusted 则需要改用平台真实交互（fill/click 原子步骤）。
 * - 建议动作优先声明 preferFill: true（可输入控件直接 fill+Enter 最稳定），
 *   页内导航（翻页/级联展开）作为兜底路径。
 */

/** 插件候选定位器：与平台 Locator 同构，经验证后可直接落库为 TestStep.locator。 */
export interface PluginCandidate {
  /** 定位策略：testid/role/label/placeholder/text/alt/title/css/xpath */
  strategy: 'testid' | 'role' | 'label' | 'placeholder' | 'text' | 'alt' | 'title' | 'css' | 'xpath';
  /** 表达式：css 选择器、文本、testid 值等（依 strategy 而定） */
  value: string;
  /** strategy='role' 时的 ARIA 角色（如 combobox/button） */
  role?: string;
  /** strategy='role' 时的可访问名（如表单 label 文本） */
  name?: string;
  /** 作用域定位：弹层内容 portal 到 body 下时，先命中容器再在容器内定位主元素 */
  scope?: {
    strategy: 'role' | 'testid' | 'label' | 'placeholder' | 'text' | 'alt' | 'title' | 'css';
    value: string;
    role?: string;
    name?: string;
  };
}

/** 动作结果三态协议：string 返回视为 success（向后兼容），throw 视为 failed。 */
export interface PluginActionResult {
  /** 按序选择等动作解析出的实际值；运行时用其做后验，生成器保存为确定的回放参数。 */
  resolvedValue?: string;
  status: 'success' | 'failed' | 'uncertain';
  message: string;
}

/** 插件动作定义：页内异步函数 + 可选页内后验 + 展示元数据。 */
export interface PluginActionDef {
  /** 页内实现：el 为已定位的目标元素（可能为 null，args.allowNoElement=true 时允许）；
   *  pw 为 Playwright 桥（可在动作内调用真实 Playwright API，仅在平台外壳内可用）。 */
  fn: (el: Element | null, args: Record<string, any>, pw: TtPw) => Promise<string | PluginActionResult>;
  /** 可选页内后验：动作返回 success 后校验终态（如选中项文本），返回 false 视同 failed 进入链上下一插件。 */
  verify?: (el: Element | null, args: Record<string, any>, pw: TtPw) => Promise<boolean> | boolean;
  /** 给 LLM 的动作说明（拼入动作词表与工具 description，写清参数与行为）。 */
  doc: string;
  /** 界面展示名（如「选择收货地址」）：动作下拉、步骤标签等场景优先显示；缺省显示动作名本身。 */
  label?: string;
  /** true 时平台外壳先尝试 Playwright fill+Enter（可输入控件强烈建议），失败再调用 fn。 */
  preferFill?: boolean;
}

export interface TtPluginDef {
  /** 全局唯一 id（建议含框架与组件能力域，如 'ant-select' / 'el-date-picker' / 'my-app-tree'）。重复注册被忽略。 */
  id: string;
  /** DOM 特征探测：el 是否属于本插件负责的组件。返回 true 或 { matched, version?, variant? }（variant 供多框架适配插件标记变体）。 */
  detect?: (el: Element) => boolean | { matched: boolean; version?: string; variant?: string };
  /** 候选定位器增强：返回的候选会被平台验证后按优先级落库。 */
  candidates?: (el: Element) => PluginCandidate[];
  /** 语义标注：返回一句话描述（拼入页面快照，帮助模型理解组件语义）。 */
  annotate?: (el: Element) => string;
  /** 注册新的步骤动作（会进入动作词表、统一 component_action 工具与可回放步骤）。 */
  actions?: Record<string, PluginActionDef>;
}

export interface TtPluginHit {
  id: string;
  version?: string;
}

/**
 * Playwright 桥（平台注入的动态 Proxy，作为动作/后验 fn 的第三参 pw 传入）：
 * 在页内插件中调用真实 Playwright API（Node 侧执行，跨进程 RPC）。
 *
 * - `pw.page` / `pw.context`：根对象，其后的属性链按方法调用转发，
 *   如 `await pw.page.keyboard.press('Escape')`、`await pw.page.locator('.item').click({ timeout: 3000 })`；
 * - 返回的 Locator/Page/ElementHandle 等复杂对象以不透明句柄回传，可继续链式调用；
 *   原始值/纯对象直接返回；错误（含 Playwright 超时）以 rejected promise 抛出；
 * - `pw(el)`：把页内元素注册为作用域 Locator 句柄（可继续链式调用，auto-wait；仅主 frame 元素）。
 *   Node 侧函数参数不可跨桥传递——`evaluate` 请传字符串表达式。
 * - 可用性：仅平台外壳（生成 / 回放 / 插件试运行 / harness）内注入；裸 polyfill 环境调用会报错；
 * - 性能：每次调用为一次跨进程往返，不要放在页内高频轮询循环里；等待类需求
 *   交给 Playwright 自带 auto-wait 或传 { timeout }，而非页内 setInterval 重试 pw 调用。
 */
export interface TtPw {
  /** 当前被测页（Playwright Page）。 */
  page: any;
  /** 页面所属 BrowserContext。 */
  context: any;
  /** 把页内元素注册为作用域 Locator（返回可续链代理；仅主 frame 元素）。 */
  (el: Element): any;
  /** 允许任意扩展属性链（Proxy 动态代理，无静态类型）。 */
  [key: string]: any;
}

/** 匹配链命中项：id 供平台落库为 pluginId 提示，variant 供多框架适配日志。 */
export interface TtPluginChainHit {
  id: string;
  variant?: string;
}

/** 动作元数据（试运行收集/动作清单展示用）：对象形态声明携带 doc/label/preferFill，函数形态仅有 name。 */
export interface TtPluginActionMetaInfo {
  name: string;
  doc?: string;
  label?: string;
  preferFill?: boolean;
}

export interface TtPluginActionList {
  id: string;
  actions: TtPluginActionMetaInfo[];
}

export interface TtPluginRegistry {
  /** 注册插件（幂等守卫由框架保证：重复 id 忽略）。 */
  register(def: TtPluginDef): void;
  /** 逐插件探测，返回命中列表。 */
  detectAll(el: Element): TtPluginHit[];
  /** 匹配链解析：detect(el) 命中且 actions 含该动作（fn 可调用）的插件，按注册顺序（= preset 注入优先级）返回。 */
  resolveChain(el: Element, action: string): TtPluginChainHit[];
  /** 收集各插件对 el 的候选增强（自动附加 pluginId）。 */
  candidatesFor(el: Element): (PluginCandidate & { pluginId: string })[];
  /** 各插件对 el 的语义标注拼接（[id] 标注文本）。 */
  annotateFor(el: Element): string;
  /** 平台外壳调用入口：转发到指定插件的页内动作，结果归一化为三态协议（不抛错）。 */
  invokeAction(pluginId: string, action: string, el: Element | null, args: Record<string, any> | undefined): Promise<PluginActionResult>;
  /** 已注册插件与其动作清单（试运行/管理页展示用）。 */
  listActions(): TtPluginActionList[];
  count(): number;
}

declare global {
  interface Window {
    __ttPluginRegistry__?: TtPluginRegistry;
    /** 运行时提供的轮询辅助：fn 返回真值即 resolve，超时 reject（等弹层/DOM 刷新用）。 */
    __ttPickWait?: <T>(fn: () => T | null | undefined, timeoutMs?: number, intervalMs?: number) => Promise<T>;
    /** 运行时框架守卫。 */
    __ttPluginRuntimeInstalled__?: boolean;
    /** Playwright 桥代理（Node 侧经 exposeBinding 注入 __ttPwRpc 绑定后可用）。 */
    __ttPw?: TtPw;
  }
}

export {};
