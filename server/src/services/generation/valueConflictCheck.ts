import type OpenAI from 'openai';
import { legacyToUnifiedSystemVars } from '../../shared/envVars';
import type { TestIntent } from '../../shared/testIntent';
import type { ReasoningEffort } from '../../config';
import { safeJsonParse, stripFences } from './util';
import type { PlanStep } from './types';

/**
 * 确认前取值一致性审查：判断 fixed 意图数据与大纲步骤取值的语义冲突（cmtxsmtvf 案例：
 * 用户在确认页把发生时间改为 2026-09-10，大纲 set_date 步骤仍是 2026-09-12，执行以大纲为准
 * 静默沿用旧值）。字段↔步骤的对应、等价表述（单位/全半角/日期格式）是语义判断，子串启发式
 * 漏报误报都多，故主判定走 LLM 结构化输出；LLM 失败/超时退回启发式（宁误报不静默）。
 */

export interface ValueConflict {
  /** 约束字段名。 */
  field: string;
  /** 意图约束值。 */
  dataValue: string;
  /** 冲突步骤序号（1 起，与确认页步骤编号一致）。 */
  stepIndex: number;
  /** 步骤将采用的取值。 */
  stepValue: string;
  /** 一句话冲突原因（中文，展示给用户）。 */
  reason: string;
}

const SYSTEM_PROMPT = `你是测试计划取值一致性审查器。比较「测试数据约束」与「执行步骤」，找出执行后取值与约束不一致的步骤：
- 只报告 fixed 约束的冲突：某步骤执行后写入/选中/设置的值与该字段约束值不同（典型：用户修改了约束值，对应步骤仍是旧值）。
- 字段与步骤的对应按语义判断：同义词、简写、部位描述（如「发生时间」对应"设置时间为…"的步骤）都算对应，不能只看字面包含。
- 等价表述不算冲突：数量单位差异（45 与 45 分钟）、全半角/空白差异、同一日期的不同格式。
- generated 约束是 {{占位符}} 模板：步骤使用同语义占位符（\${var} 与 {{var}} 等价）不算冲突；步骤写死具体值或用了不同变量才算冲突。
- 断言步骤（kind=assert）的 expected 由验收标准单独把守，不在本审查范围，只作上下文参考。
每条冲突输出：{"field":"约束字段名","dataValue":"约束值","stepIndex":步骤序号(从1起),"stepValue":"步骤取值","reason":"一句话中文说明"}。
输出 JSON：{"conflicts":[...]}；无冲突输出 {"conflicts":[]}。不要输出 JSON 以外的内容。`;

/** 兜底启发式：字段名是步骤 instruction 子串且 value 字面不等 → 冲突（LLM 不可用时保底）。 */
function heuristicValueConflicts(steps: PlanStep[], intent: TestIntent | undefined): ValueConflict[] {
  if (!intent) return [];
  const out: ValueConflict[] = [];
  for (const d of intent.data ?? []) {
    const field = (d.name ?? '').trim();
    const want = legacyToUnifiedSystemVars((d.value ?? '').trim()) ?? '';
    if (d.policy !== 'fixed' || !field || !want) continue;
    steps.forEach((s, i) => {
      if (s.kind !== 'action' || s.action === 'goto' || s.action === 'wait') return;
      const have = legacyToUnifiedSystemVars((s.value ?? '').trim()) ?? '';
      if (!have || have === want || !s.instruction.includes(field)) return;
      out.push({ field, dataValue: want, stepIndex: i + 1, stepValue: have, reason: '固定值与步骤取值不一致（启发式检测：LLM 审查暂不可用）' });
    });
  }
  return out;
}

/** 清洗 LLM 返回：字段齐全且 stepIndex 落在步骤范围内才保留。 */
function normalizeConflicts(raw: unknown, stepCount: number): ValueConflict[] {
  if (!Array.isArray(raw)) return [];
  const out: ValueConflict[] = [];
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const field = typeof o.field === 'string' ? o.field.trim() : '';
    const stepIndex = Math.floor(Number(o.stepIndex));
    if (!field || !Number.isInteger(stepIndex) || stepIndex < 1 || stepIndex > stepCount) continue;
    out.push({
      field,
      dataValue: String(o.dataValue ?? ''),
      stepIndex,
      stepValue: String(o.stepValue ?? ''),
      reason: String(o.reason ?? '').trim() || '固定值与步骤取值不一致',
    });
  }
  return out;
}

/** LLM 结构化审查（失败/超时/解析失败一律退回启发式，调用方无需感知降级）。 */
export async function detectValueConflicts(
  client: OpenAI,
  model: string,
  steps: PlanStep[],
  intent: TestIntent | undefined,
  reasoningEffort: ReasoningEffort,
  signal?: AbortSignal,
): Promise<ValueConflict[]> {
  const fallback = () => heuristicValueConflicts(steps, intent);
  if (!intent?.data?.length) return [];
  const stepLines = steps
    .map((s, i) => `${i + 1}. ${JSON.stringify({ kind: s.kind, action: s.action, instruction: s.instruction, value: s.value ?? null })}`)
    .join('\n');
  const req: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `【测试数据约束】\n${JSON.stringify(intent.data)}\n\n【执行步骤】\n${stepLines}` },
    ],
    response_format: { type: 'json_object' },
  };
  if (reasoningEffort) req.reasoning_effort = reasoningEffort;
  else {
    // 与 preSplit 同口径：不配置推理深度时显式关思考 + temperature=0，保证快且稳定
    req.thinking = { type: 'disabled' };
    req.temperature = 0;
  }
  try {
    const res = await client.chat.completions.create(req as never, signal ? { signal } : undefined);
    const text = res.choices?.[0]?.message?.content ?? '';
    const parsed = safeJsonParse(stripFences(text)) as { conflicts?: unknown } | undefined;
    if (!parsed || !Array.isArray(parsed.conflicts)) return fallback();
    return normalizeConflicts(parsed.conflicts, steps.length);
  } catch {
    return fallback();
  }
}
