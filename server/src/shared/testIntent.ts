import { z } from 'zod';

export const browserAssertionTypes = ['visible', 'hidden', 'text', 'text_exact', 'value', 'checked', 'unchecked', 'enabled', 'disabled', 'count', 'url', 'url_exact'] as const;
export const expectedAssertionTypes: readonly string[] = ['text', 'text_exact', 'value', 'count', 'url', 'url_exact'];
export const browserAssertionSchema = z.object({
  type: z.enum(browserAssertionTypes),
  expected: z.string().optional(),
}).superRefine((a, ctx) => {
  if (expectedAssertionTypes.includes(a.type) && a.expected == null)
    ctx.addIssue({ code: 'custom', message: `${a.type} 缺少 expected`, path: ['expected'] });
  if (['text', 'url', 'url_exact'].includes(a.type) && !a.expected?.trim())
    ctx.addIssue({ code: 'custom', message: `${a.type} 的 expected 不能为空`, path: ['expected'] });
  if (a.type === 'count' && !/^(0|[1-9]\d*)$/.test(a.expected ?? ''))
    ctx.addIssue({ code: 'custom', message: 'count 的 expected 必须为非负整数', path: ['expected'] });
});

export const acceptanceCriterionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z][\w-]{0,63}$/),
  description: z.string().trim().min(1).max(1000),
  target: z.string().trim().min(1).max(1000),
  source: z.string().trim().min(1).max(1000),
  required: z.boolean().default(true),
  assertion: browserAssertionSchema,
});
export const testIntentSchema = z.object({
  version: z.literal(1),
  scenario: z.enum(['positive', 'negative', 'mixed']),
  objective: z.string().trim().min(1).max(2000),
  preconditions: z.array(z.string().trim().min(1).max(1000)).max(30),
  data: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    value: z.string().max(2000),
    policy: z.enum(['fixed', 'generated']),
  })).max(50),
  criteria: z.array(acceptanceCriterionSchema).min(1).max(50),
  cleanup: z.array(z.string().trim().min(1).max(1000)).max(20),
}).superRefine((intent, ctx) => {
  if (new Set(intent.criteria.map(c => c.id)).size !== intent.criteria.length)
    ctx.addIssue({ code: 'custom', message: '验收目标 ID 不得重复', path: ['criteria'] });
  if (!intent.criteria.some(c => c.required))
    ctx.addIssue({ code: 'custom', message: '至少需要一个必验目标', path: ['criteria'] });
});
export type TestIntent = z.infer<typeof testIntentSchema>;
export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>;
