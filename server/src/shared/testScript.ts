import { z } from 'zod';

/**
 * 定位器：模块①（Stagehand act 解析出的 selector）与模块②（codegen 录制）统一结构。
 * - strategy='css'/'xpath'：Stagehand 返回的原始选择器字符串（value 即表达式）。
 * - strategy='role'：可访问性角色定位（附带 role/name）。
 * - strategy='label'/'text'/'placeholder'/'testid'/'alt'/'title'：语义定位。
 * - strategy='response'：接口响应断言专用，value 为 URL 关键词匹配串（非元素选择器），
 *   断言时不走 buildLocator，改由 runResponseAssertion 从已采集的响应中取值。
 * - strategy='websocket'：WebSocket 断言专用，value 为 WS URL 关键词匹配串，
 *   断言时不走 buildLocator，改由 runWebsocketAssertion 从已采集的帧中取值。
 */
/** 作用域定位器：先命中容器（如模态框），再在其中执行主定位。弹层内容经 portal 渲染到 body 下，页面级定位/绝对路径会随弹层序号漂移，锚定到容器内更稳。 */
export const locatorScopeSchema = z.object({
  strategy: z.enum(['role', 'testid', 'label', 'placeholder', 'text', 'alt', 'title', 'css']),
  value: z.string(),
  role: z.string().optional(),
  name: z.string().optional(),
});

export const locatorSchema = z.object({
  strategy: z.enum(['role', 'label', 'text', 'placeholder', 'testid', 'alt', 'title', 'css', 'xpath', 'response', 'websocket']),
  value: z.string(),
  role: z.string().optional(),
  name: z.string().optional(),
  scope: locatorScopeSchema.optional(),
});
export type Locator = z.infer<typeof locatorSchema>;

/** 单个测试步骤。同时携带「原始指令」与「解析出的具体执行目标」。 */
export const testStepSchema = z.object({
  instruction: z.string().optional(), // 模块①：LLM 拆出的自然语言子指令；模块②：人类可读描述
  kind: z.enum(['navigate', 'action', 'assert', 'wait']).default('action'),
  action: z.enum(['goto', 'click', 'fill', 'press', 'check', 'select', 'assert', 'wait', 'raw', 'plugin']),
  /// 语义动作步骤（action='plugin' 时必填）：action 为语义动作名；pluginId 为生成期命中的插件提示
  /// （可选，回放按语义动作链重匹配时仅作优先尝试）；args 为动作参数。
  pluginAction: z
    .object({
      pluginId: z.string().optional(),
      action: z.string(),
      /** 插件声明的展示名（落库时随步骤戳入，供状态标签/导出等展示点直接取用）。 */
      label: z.string().optional(),
      // 值放宽为 any：自由参数对象需兼容 Prisma Json 写入（unknown 会破坏 InputJsonObject 约束）
      args: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
  locator: locatorSchema.optional(),
  url: z.string().optional(),
  value: z.string().optional(),
  key: z.string().optional(),
  checked: z.boolean().optional(), // 旧脚本缺省 true；false 明确取消勾选
  assertion: z
    .object({
      type: z.enum(['visible', 'hidden', 'text', 'url', 'response_status', 'response_body', 'response_json', 'ws_sent', 'ws_received']),
      expected: z.string().optional(),
      jsonPath: z.string().optional(), // type='response_json' 时的字段点分路径，如 data.id
    })
    .optional(),
  code: z.string().optional(), // action='raw' 时保留的原始代码行
  description: z.string().optional(),
});
export type TestStep = z.infer<typeof testStepSchema>;

export const testScriptSchema = z.object({
  name: z.string(),
  steps: z.array(testStepSchema),
});
export type TestScript = z.infer<typeof testScriptSchema>;

// ---- 脚本步骤修订（生成期 revise 工具：模型调整已落库步骤）----

/** 修订操作：update 改指定步的参数/描述，delete 删步骤区间。序号一律 1-based（与「已记录为第 N 步」口径一致）。 */
export type ReviseOp =
  | { op: 'update'; step: number; value?: string; key?: string; instruction?: string; expected?: string }
  | { op: 'delete'; from: number; to?: number };

// ---- 落库口径 ----

/** emit 落库结果：引擎忠实记录浏览器实际执行的每个操作（含有意重复），返回新步骤的 1-based 序号
 *  （与「已记录为第 N 步」口径一致），供工具结果回显。重复是「有意操作」还是「失败重试」由
 *  LLM 语义判断（模型自用 revise 清理 + finish 时全局脚本审查），引擎不做流式去重。 */
export type EmitOutcome = { index: number };

/** 修订操作上限：防模型一次刷入超大操作数组。 */
const REVISE_OPS_MAX = 20;

/**
 * 对已落步骤应用修订操作（不原地修改，返回新数组）。非法入参返回错误文案；成功返回新数组与统计。
 * ops 按数组顺序依次应用——每次操作基于前一次的结果数组，先删后改会使序号移位（调用方须以返回清单回显）。
 * update 只改给出的字段；instruction 同步 description（落库步骤两者恒等）；expected 仅对断言步生效。
 */
export function applyReviseOps(
  steps: TestStep[],
  ops: ReviseOp[],
): { steps: TestStep[]; updated: number; deleted: number } | string {
  if (!Array.isArray(ops) || !ops.length) return 'ops 不能为空：至少给出一个 update/delete 操作';
  if (ops.length > REVISE_OPS_MAX) return `ops 过多（${ops.length} 项）：单次最多 ${REVISE_OPS_MAX} 项操作`;
  const working = [...steps];
  let updated = 0;
  let deleted = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const err = (msg: string) => `第 ${i + 1} 项操作无效：${msg}`;
    if (!op || typeof op !== 'object') return err('操作必须是对象');
    if (op.op === 'update') {
      const at = op.step;
      if (!Number.isInteger(at) || (at as number) < 1 || (at as number) > working.length) {
        return err(`第 ${at} 步不存在（当前共 ${working.length} 步；注意先删后改会使序号移位）`);
      }
      if (op.value == null && op.key == null && op.instruction == null && op.expected == null) {
        return err(`update 至少给出 value/key/instruction/expected 中的一个待改字段`);
      }
      const target = working[(at as number) - 1];
      const next: TestStep = { ...target };
      if (op.value != null) next.value = String(op.value);
      if (op.key != null) next.key = String(op.key);
      if (op.instruction != null) {
        next.instruction = String(op.instruction);
        next.description = String(op.instruction); // 落库步骤 instruction 与 description 恒等
      }
      if (op.expected != null) {
        if (target.kind !== 'assert') return err(`expected 仅用于断言步：第 ${at} 步是 ${target.kind === 'navigate' ? '导航' : '动作'}步`);
        // 断言步必然带 assertion（zod 要求 type 必填），这里仅绕开可选链展开的类型收窄
        next.assertion = { ...target.assertion, expected: String(op.expected) } as TestStep['assertion'];
      }
      working[(at as number) - 1] = next;
      updated++;
    } else if (op.op === 'delete') {
      const from = op.from;
      const to = op.to ?? op.from;
      if (!Number.isInteger(from) || (from as number) < 1 || (from as number) > working.length) {
        return err(`起始步 ${from} 不存在（当前共 ${working.length} 步）`);
      }
      if (!Number.isInteger(to) || (to as number) < (from as number) || (to as number) > working.length) {
        return err(`删除范围 ${from}~${to} 无效（当前共 ${working.length} 步）`);
      }
      working.splice((from as number) - 1, (to as number) - (from as number) + 1);
      deleted += (to as number) - (from as number) + 1;
    } else {
      return err(`未知操作类型「${(op as any)?.op}」（仅支持 update/delete）`);
    }
  }
  return { steps: working, updated, deleted };
}

/**
 * 人工「撤销步骤」：删除绝对序号范围 [from..to]（1-based 含端点，跨 segments 各数组段依次编号）。
 * 原地修改各段；范围非法返回错误文案，成功返回 null。续跑场景 segments = [baseSteps, 本轮 steps]。
 */
export function revokeStepRange(segments: TestStep[][], from: number, to: number): string | null {
  const total = segments.reduce((n, seg) => n + seg.length, 0);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > total) {
    return `撤销范围 ${from}~${to} 无效（当前脚本共 ${total} 步，范围须为 1~${total} 的升序整数）`;
  }
  let base = 0;
  for (const seg of segments) {
    const size = seg.length;
    const segFrom = Math.max(from - base, 1);
    const segTo = Math.min(to - base, size);
    if (segFrom <= segTo) seg.splice(segFrom - 1, segTo - segFrom + 1);
    base += size;
  }
  return null;
}

/** 定位器结构相等（strategy/value/role/name/scope 递归全等）。 */
function sameLocator(a: TestStep['locator'] | undefined, b: TestStep['locator'] | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.strategy === b.strategy &&
    a.value === b.value &&
    a.role === b.role &&
    a.name === b.name &&
    (a.scope && b.scope ? sameLocator(a.scope, b.scope) : !a.scope && !b.scope)
  );
}

/**
 * 侦察性 click 吸收：组件语义动作（action='plugin'）落库前调用。
 * 生成期模型常先点击假控件（如点开下拉）侦察选项，再对同一控件调用组件语义动作完成操作——
 * 语义动作自身会打开/收起弹层（见各插件动作 doc），前置 click 对回放是纯冗余。组件动作成功落库
 * 即证明其自足，此刻若 steps 尾部紧邻指向同一控件的 click 步（观察类工具不落库，二者在脚本里
 * 天然紧邻），原地移除它，返回被删步的 1-based 序号（与「已记录为第 N 步」口径一致）；不满足
 * 吸收条件返回 null、不动 steps。
 */
export function absorbProbeClick(steps: TestStep[], pluginStep: TestStep): number | null {
  if (pluginStep.kind !== 'action' || pluginStep.action !== 'plugin' || !steps.length) return null;
  const prev = steps[steps.length - 1];
  if (prev.kind !== 'action' || prev.action !== 'click' || !sameLocator(prev.locator, pluginStep.locator)) return null;
  steps.pop();
  return steps.length + 1;
}
