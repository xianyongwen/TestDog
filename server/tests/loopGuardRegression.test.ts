import { describe, expect, it, vi } from 'vitest';
import { runToolLoop, type AgentTool, type AgentToolResult, type ToolLoopOpts } from '../src/services/toolLoop';

type Event = { name?: string; args?: Record<string, unknown>; result?: AgentToolResult };
async function run(events: Event[], options: Partial<ToolLoopOpts> = {}) {
  let index = 0;
  const messages: any[] = [];
  const onStuck = vi.fn(async (..._args: any[]) => null as string | null);
  const client = { chat: { completions: { create: async () => {
    const event = events[index++];
    return { choices: [{ message: { content: '', tool_calls: [{ id: String(index), type: 'function', function: {
      name: event ? event.name ?? 'click' : 'finish', arguments: JSON.stringify(event?.args ?? { selector: '#target' }),
    } }] } }] };
  } } } };
  const tools: AgentTool[] = ['click', 'see', 'snapshot', 'wait', 'finish'].map(name => ({
    name, description: name, parameters: {}, execute: async () => events[index - 1]?.result ?? { text: 'ok' },
  }));
  const result = await runToolLoop({ client: client as any, model: 'mock', tools, messages, maxSteps: 200,
    usageKey: 'guard-regression', seeAssistAt: 4, onStep: () => {}, onStuck, ...options });
  return { result, onStuck, messages };
}
const action = (state: string, extra: Partial<AgentToolResult> = {}): Event => ({
  result: { text: 'ok', status: 'success', progressed: true, stateFingerprint: state, ...extra },
});
const observe = (state: string, name = 'snapshot'): Event => ({ name, result: { text: 'ok', stateFingerprint: state } });

describe('空转计数生命周期', () => {
  it('同一操作的无进展次数被实际进展隔开时不误终止', async () => {
    const events = Array.from({ length: 12 }, (_, i) => [action(String(i), { progressed: false }), action(String(i + 1))]).flat();
    const { result, onStuck } = await run(events);
    expect(result.finished).toBe(true);
    expect(onStuck).not.toHaveBeenCalled();
  });

  it('成功进展重新武装重复提示，累计预算也从零开始', async () => {
    const still = { result: { text: 'ok', progressed: false } };
    const { result, onStuck } = await run([...Array(6).fill(still), action('new'), ...Array(6).fill(still)]);
    expect(result.finished).toBe(true);
    expect(onStuck).toHaveBeenCalledTimes(2);
  });

  it.each(['failed', 'uncertain'] as const)('%s 结果即使错误声明 progressed=true 也不能刷新预算', async status => {
    const { result } = await run(Array.from({ length: 12 }, () => action('A', { status })));
    expect(result.finished).toBe(false);
    expect(result.steps).toBe(9);
  });

  it.each(['see', 'snapshot'])('%s 不累计不同状态的局部停滞', async name => {
    const { onStuck } = await run(['A','A','B','B','C','C','D','D','E','E'].map(s => observe(s, name)));
    expect(onStuck).not.toHaveBeenCalled();
  });

  it('不同截图不会触发；相同截图仍会触发', async () => {
    expect((await run(['A','B','C','D','E','F'].map(s => observe(s, 'see')))).onStuck).not.toHaveBeenCalled();
    const { onStuck } = await run(Array.from({ length: 5 }, () => observe('A', 'see')));
    expect(onStuck).toHaveBeenCalledWith('see', expect.anything(), 4, 'observe');
  });

  it('失败观察不能用不同指纹清除已有停滞次数', async () => {
    const { onStuck } = await run([
      ...Array.from({ length: 4 }, () => observe('A')),
      { name: 'snapshot', result: { text: '读取失败', status: 'failed', stateFingerprint: 'B' } }, observe('A'),
    ]);
    expect(onStuck).toHaveBeenCalledWith('snapshot', expect.anything(), 4, 'observe');
  });
});

describe('短周期循环保护', () => {
  it.each([2, 3, 4])('%i 步循环即使每次 progressed=true 也会求助并最终终止', async period => {
    const { result, onStuck } = await run(Array.from({ length: 40 }, (_, i) => action(`state-${i % period}`)));
    expect(onStuck).toHaveBeenCalledTimes(1);
    expect(onStuck).toHaveBeenCalledWith('click', expect.anything(), 1, 'cycle', expect.stringContaining(`${period} 步`));
    expect(result.finished).toBe(false);
    expect(result.finishMessage).toContain('循环复现');
  });

  it('仅两轮正常往返不求助', async () => {
    const { result, onStuck } = await run(['A','B','A','B'].map(s => action(s)));
    expect(result.finished).toBe(true);
    expect(onStuck).not.toHaveBeenCalled();
  });

  it('正常翻页到不同状态不会触发', async () => {
    const { result, onStuck } = await run(Array.from({ length: 40 }, (_, i) => action(`page-${i}`)));
    expect(result.finished).toBe(true);
    expect(onStuck).not.toHaveBeenCalled();
  });

  it('状态相同但操作内容不同，不合并成同一循环', async () => {
    const { onStuck } = await run(Array.from({ length: 20 }, (_, i) => ({ ...action(String(i % 2)), args: { selector: `#item-${i}` } })));
    expect(onStuck).not.toHaveBeenCalled();
  });

  it('插入观察和等待不会绕过动作循环检测', async () => {
    const events = Array.from({ length: 8 }, (_, i) => [action(String(i % 2)), observe(String(i % 2)), { name: 'wait' }]).flat();
    expect((await run(events)).onStuck).toHaveBeenCalledWith('click', expect.anything(), 1, 'cycle', expect.anything());
  });

  it('人工给出建议后清检测窗口但重复建议不能无限延长预算', async () => {
    const onStuck = vi.fn(async () => '换一种方式');
    // No snapshot tool: advice itself is not evidence of a changed page.
    const tools: AgentTool[] = [
      { name: 'click', description: '', parameters: {}, execute: async () => ({ text: 'ok', progressed: true, stateFingerprint: String((counter++) % 2) }) },
      { name: 'finish', description: '', parameters: {}, execute: async () => '' },
    ];
    let counter = 0;
    const { result } = await run(Array.from({ length: 80 }, () => ({})), { onStuck, tools });
    expect(onStuck).toHaveBeenCalledTimes(8);
    expect(result.finished).toBe(false);
    expect(result.finishMessage).toContain('循环复现');
  });

  it('到达新状态后旧循环预算失效', async () => {
    const events = [...Array.from({ length: 12 }, (_, i) => action(String(i % 2))), action('new'), ...Array.from({ length: 12 }, (_, i) => action(String(i % 2)))];
    const { result, onStuck } = await run(events);
    expect(result.finished).toBe(true);
    expect(onStuck).toHaveBeenCalledTimes(2);
  });

  it('缺少指纹的动作打断轨迹，不跨不确定区间拼接循环', async () => {
    const { onStuck } = await run(Array.from({ length: 5 }, () => [action('A'), action('B'), action('', { stateFingerprint: undefined })]).flat());
    expect(onStuck).not.toHaveBeenCalled();
  });
});

describe('循环恢复边界', () => {
  it('求助钩子异常时回灌警告，仍有终止上限', async () => {
    const { result, messages } = await run(Array.from({ length: 30 }, (_, i) => action(String(i % 2))), {
      onStuck: async () => { throw new Error('assist unavailable'); },
    });
    expect(result.finished).toBe(false);
    expect(result.finishMessage).toContain('循环复现');
    expect(JSON.stringify(messages)).toContain('改变策略');
  });

  it('人工处理后快照证明页面改变，则旧循环累计预算清零', async () => {
    let counter = 0;
    const tools: AgentTool[] = [
      { name: 'click', description: '', parameters: {}, execute: async () => ({ text: 'ok', progressed: true, stateFingerprint: String((counter++) % 2) }) },
      { name: 'snapshot', description: '', parameters: {}, execute: async () => ({ text: '新状态', stateFingerprint: 'human-changed' }) },
      { name: 'finish', description: '', parameters: {}, execute: async () => '' },
    ];
    const onStuck = vi.fn(async () => '已处理');
    const { result } = await run(Array.from({ length: 60 }, () => ({})), { onStuck, tools });
    expect(result.finished).toBe(true);
    expect(onStuck).toHaveBeenCalledTimes(10);
  });

  it('失败动作打断状态轨迹', async () => {
    const events = Array.from({ length: 4 }, () => [action('A'), action('B'), action('A', { status: 'failed' })]).flat();
    const { onStuck } = await run(events);
    expect(onStuck).not.toHaveBeenCalled();
  });
});
