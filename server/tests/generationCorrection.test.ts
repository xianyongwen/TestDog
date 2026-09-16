import { expect, it, vi } from 'vitest';
import { runToolLoop, type AgentTool } from '../src/services/toolLoop';

const call = (name: string, id = name) => ({ id, type: 'function', function: { name, arguments: '{}' } });
const response = (...names: string[]) => ({ choices: [{ message: { content: '', tool_calls: names.map((name, i) => call(name, `${name}${i}`)) } }] });

it('discards a stale model response when a correction arrives during inference', async () => {
  const pending: string[] = [];
  const execute = vi.fn(async () => 'ok');
  const requests: any[] = [];
  const create = vi.fn(async (req: any) => {
    requests.push(req);
    if (requests.length === 1) { pending.push('先选择部门'); return response('click'); }
    return response('finish');
  });
  const result = await runToolLoop({ client: { chat: { completions: { create } } } as any,
    model: 'test', tools: ['click', 'finish'].map(name => ({ name, description: name, parameters: {}, execute })),
    messages: [{ role: 'user', content: '测试' }], maxSteps: 10, usageKey: 'correction-inference',
    onStep: () => {}, hasPendingInput: () => pending.length > 0, takePendingInput: () => pending.splice(0),
  });
  expect(result.finished).toBe(true);
  expect(execute).not.toHaveBeenCalled();
  expect(requests[1].messages.at(-1)).toMatchObject({ role: 'user', content: expect.stringContaining('先选择部门') });
});

it('records the in-flight operation, skips remaining old calls, and preserves tool protocol', async () => {
  const pending: string[] = [];
  const messages: any[] = [{ role: 'user', content: '测试' }];
  const click = vi.fn(async () => { pending.push('改为选择第二项'); return '操作已记录'; });
  const create = vi.fn().mockResolvedValueOnce(response('click', 'click')).mockResolvedValueOnce(response('finish'));
  const tools: AgentTool[] = ['click', 'finish'].map(name => ({ name, description: name, parameters: {}, execute: click }));
  await runToolLoop({ client: { chat: { completions: { create } } } as any, model: 'test', tools,
    messages, maxSteps: 10, usageKey: 'correction-tools',
    onStep: () => {}, hasPendingInput: () => pending.length > 0, takePendingInput: () => pending.splice(0),
  });
  expect(click).toHaveBeenCalledTimes(1);
  expect(messages[2]).toMatchObject({ role: 'tool', tool_call_id: 'click0', content: '操作已记录' });
  expect(messages[3]).toMatchObject({ role: 'tool', tool_call_id: 'click1', content: expect.stringContaining('未执行') });
  expect(messages[4]).toMatchObject({ role: 'user', content: expect.stringContaining('改为选择第二项') });
});

it('does not finish if a correction arrives during finish validation', async () => {
  const pending: string[] = [];
  const validateFinish = vi.fn(async () => { if (validateFinish.mock.calls.length === 1) pending.push('还有一步'); return null; });
  const create = vi.fn(async () => response('finish'));
  const result = await runToolLoop({ client: { chat: { completions: { create } } } as any, model: 'test',
    tools: [{ name: 'finish', description: '', parameters: {}, execute: async () => '' }],
    messages: [{ role: 'user', content: '测试' }], maxSteps: 10, usageKey: 'correction-finish', validateFinish,
    onStep: () => {}, hasPendingInput: () => pending.length > 0, takePendingInput: () => pending.splice(0),
  });
  expect(result.finished).toBe(true);
  expect(validateFinish).toHaveBeenCalledTimes(2);
});

it('retains corrections when old execution history is compressed', async () => {
  const messages: any[] = [{ role: 'system', content: 'system' }, { role: 'user', content: 'goal' },
    { role: 'user', content: '先选择部门，再选择账号', __ttCorrection: true }];
  for (let i = 0; i < 22; i++) {
    messages.push({ role: 'assistant', content: '', tool_calls: [call('click', `old${i}`)] },
      { role: 'tool', tool_call_id: `old${i}`, content: 'ok' });
  }
  const create = vi.fn(async () => response('finish'));
  await runToolLoop({ client: { chat: { completions: { create } } } as any, model: 'test',
    tools: [{ name: 'finish', description: '', parameters: {}, execute: async () => '' }],
    messages, maxSteps: 10, usageKey: 'correction-compress', workingMemory: () => '已执行步骤', onStep: () => {},
  });
  expect(messages.some(m => m.content === '先选择部门，再选择账号')).toBe(true);
  expect(messages.length).toBeLessThan(20);
});
