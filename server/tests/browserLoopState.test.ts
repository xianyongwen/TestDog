import { describe, it, expect, vi } from 'vitest';
import { runToolLoop, type AgentTool } from '../src/services/toolLoop';
import { buildWorkingMemory } from '../src/services/generation/workingMemory';
import { parseCodegen } from '../src/codegen/parseCodegen';
import { observedAction } from '../src/services/browserExecution';

const call = (name: string, id: string) => ({ id, type: 'function', function: { name, arguments: '{}' } });
const tool = (name: string, execute: AgentTool['execute'], stateful?: string): AgentTool => ({ name, description: name, parameters: {}, execute, stateful });
function clientFor(names: string[]) {
  let index = 0;
  return { chat: { completions: { create: vi.fn(async (_req: any) => ({ choices: [{ message: { content: '', tool_calls: [call(names[index] ?? 'finish', String(index++))] } }] })) } } };
}

describe('续跑、观测槽与任务记忆', () => {
  it('续跑重建旧快照登记；动作附带的快照保留完整且参与替换', async () => {
    const messages: any[] = [
      { role: 'system', content: '规则' }, { role: 'user', content: '目标' },
      { role: 'assistant', tool_calls: [call('snapshot', 'old')] },
      { role: 'tool', tool_call_id: 'old', content: 'OLD_SNAPSHOT' },
    ];
    const client = clientFor(['click', 'snapshot', 'finish']);
    const observation = 'NEW_STATE'.repeat(100);
    await runToolLoop({ client: client as any, model: 'mock', messages, maxSteps: 4, usageKey: 'state', onStep: () => {}, tools: [
      tool('click', async () => ({ text: '已记录', observation, observationKind: 'snapshot', progressed: true })),
      tool('snapshot', async () => 'LATEST', 'snapshot'), tool('finish', async () => ''),
    ] });
    const requests = client.chat.completions.create.mock.calls;
    expect(JSON.stringify(requests[1][0].messages)).toContain(observation);
    expect(JSON.stringify(requests[1][0].messages)).not.toContain('OLD_SNAPSHOT');
    expect(JSON.stringify(requests[2][0].messages)).not.toContain(observation);
    expect(JSON.stringify(requests)).not.toContain('__tt');
    expect(messages.find(m => m.tool_call_id === '0').__ttStateKind).toBe('snapshot');
  });

  it('长历史压缩保留失败原因和完成事实，工具应答配对完整', async () => {
    const messages: any[] = [{ role: 'system', content: '规则' }, { role: 'user', content: '任务要求' }];
    const client = clientFor([...Array(22).fill('click'), 'finish']);
    await runToolLoop({ client: client as any, model: 'mock', messages, maxSteps: 24, usageKey: 'memory',
      tools: [tool('click', async () => ({ text: '表单校验：手机号重复，原提交未成功，已保存实际操作', progressed: true })), tool('finish', async () => '')],
      onStep: () => {}, workingMemory: () => '{"recordedSteps":18,"goal":"创建客户"}',
    });
    const memory = messages.find(m => m.__ttMemory);
    expect(memory.content).toContain('手机号重复');
    expect(memory.content).toContain('创建客户');
    expect(messages.length).toBeLessThan(30);
    for (const m of messages) for (const tc of m.tool_calls ?? []) {
      expect(messages.filter(x => x.role === 'tool' && x.tool_call_id === tc.id)).toHaveLength(1);
    }
  });

  it('workingMemory 从修订后脚本生成，不保留撤销的完成记录', () => {
    const memory = JSON.parse(buildWorkingMemory([{ kind: 'action', action: 'fill', instruction: '正确步骤', value: '新值' }], '测试目标'));
    expect(memory.recordedSteps).toBe(1);
    expect(memory.recentSteps[0]).toMatchObject({ step: 1, value: '新值' });
    expect(buildWorkingMemory([], '测试目标')).not.toContain('正确步骤');
  });

  it('失败后人工介入刷新观测，不回灌介入前的页面', async () => {
    const client = clientFor(['click', 'finish']);
    const messages: any[] = [];
    await runToolLoop({ client: client as any, model: 'mock', messages, maxSteps: 3, usageKey: 'human',
      tools: [tool('click', async () => ({ status: 'failed', text: '失败', observation: 'BEFORE_HUMAN', observationKind: 'snapshot' })),
        tool('snapshot', async () => 'AFTER_HUMAN', 'snapshot'), tool('finish', async () => '')],
      onFailure: async () => '用户已处理', onStep: () => {},
    });
    expect(JSON.stringify(messages)).toContain('AFTER_HUMAN');
    expect(JSON.stringify(messages)).not.toContain('BEFORE_HUMAN');
  });

  it('记录了步骤但 progressed=false 时仍触发重复保护', async () => {
    const client = clientFor([...Array(10).fill('click'), 'finish']);
    const result = await runToolLoop({ client: client as any, model: 'mock', messages: [], maxSteps: 20, usageKey: 'stuck',
      tools: [tool('click', async () => ({ text: '已记录', recordedStep: 1, progressed: false })), tool('finish', async () => '')],
      isProgress: () => true, onStep: () => {},
    });
    expect(result.finished).toBe(false);
    expect(result.finishMessage).toContain('空转保护');
  });

  it('正常交替选择有真实进展且没有字段回设时不误报联动', async () => {
    const client = clientFor([...Array(8).fill('select'), 'finish']);
    const onStuck = vi.fn();
    await runToolLoop({ client: client as any, model: 'mock', messages: [], maxSteps: 12, usageKey: 'link',
      tools: [tool('select', async () => ({ text: '已选择', progressed: true, resetFields: [] })), tool('finish', async () => '')],
      onStep: () => {}, onStuck,
    });
    expect(onStuck).not.toHaveBeenCalled();
  });
});

describe('动作状态格式', () => {
  it('codegen 保留 uncheck/setChecked(false)，旧 check 仍为 true', () => {
    const steps = parseCodegen("await page.getByLabel('A').uncheck();\nawait page.getByLabel('B').setChecked(false);\nawait page.getByLabel('C').check();");
    expect(steps.map(s => s.checked)).toEqual([false, false, true]);
  });
  it('observe 不支持的方法和错误参数显式失败', () => {
    expect(() => observedAction({ selector: '#x', method: 'dragTo' })).toThrow('不支持');
    expect(() => observedAction({ selector: '#x', method: 'fill', arguments: [] })).toThrow('缺少');
    expect(observedAction({ selector: '#x', method: 'uncheck' })).toMatchObject({ action: 'check', checked: false });
  });
});
