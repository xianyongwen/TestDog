/**
 * see 视觉观察的「模型回答」落库链路测试：
 * - see 结果+截图回灌后，模型作答滞后一轮（下一轮 completion 的 content）到达，按 see 步骤序号回调 onAssistantContent
 * - content 为空（纯 tool_calls 无文本）不回调；多轮多次 see 各自回调一次、序号正确
 * - 非 see 工具不登记待回答步骤
 */
import { describe, it, expect, vi } from 'vitest';
import { runToolLoop, type AgentTool } from '../src/services/toolLoop';
import { initUsage, clearUsage } from '../src/services/tokenUsage';

const JOB = 'test-see-answer';

function mockClient(responses: any[]) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const r = responses[Math.min(i, responses.length - 1)];
          i++;
          return r;
        }),
      },
    },
  } as any;
}

function call(name: string, args: Record<string, unknown> = {}, id = name): any {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}
function resp(content: string | null, ...calls: any[]): any {
  return { choices: [{ message: { content, tool_calls: calls } }] };
}

const seeTool: AgentTool = {
  name: 'see',
  description: '视觉观察',
  parameters: { type: 'object', properties: {} },
  execute: async () => '截图已附于下一条消息。观察请求：是否有校验错误。请依据截图作答并决定下一步。',
};
const snapshotTool: AgentTool = {
  name: 'snapshot',
  description: '快照',
  parameters: { type: 'object', properties: {} },
  stateful: 'snapshot',
  execute: async () => '最新快照内容',
};
const finishTool: AgentTool = {
  name: 'finish',
  description: '完成',
  parameters: { type: 'object', properties: {} },
  execute: async () => '完成',
};

describe('runToolLoop see 模型回答回传', () => {
  it('see 之后的下一轮 content 按其步骤序号回传一次', async () => {
    initUsage(JOB);
    const client = mockClient([
      resp(null, call('see', { question: '是否有红色校验错误' }, 's1')),
      resp('弹窗未关闭，上游服务字段下方有红字校验错误提示。', call('snapshot', {}, 'n1')),
      resp(null, call('finish', { success: true }, 'fz')),
    ]);
    const onAssistantContent = vi.fn();
    await runToolLoop({
      client, model: 'm', tools: [seeTool, snapshotTool, finishTool],
      messages: [{ role: 'user', content: '目标' }] as any,
      maxSteps: 10, usageKey: JOB, onStep: () => {}, onAssistantContent,
    });
    // see 是第 1 个工具步骤；下一轮 content 即其作答
    expect(onAssistantContent).toHaveBeenCalledTimes(1);
    expect(onAssistantContent).toHaveBeenCalledWith(1, '弹窗未关闭，上游服务字段下方有红字校验错误提示。');
    clearUsage(JOB);
  });

  it('下一轮 content 为空（纯 tool_calls）不回调，回答可跨轮迟到：see → 快照轮(content空) → 再下一轮 content 归最后一次 see', async () => {
    initUsage(JOB);
    const client = mockClient([
      resp(null, call('see', {}, 's1')),
      resp(null, call('snapshot', {}, 'n1')), // 空轮：回答未到，待回答步骤保持
      resp('第二次观察才作答。', call('finish', { success: true }, 'fz')),
    ]);
    const onAssistantContent = vi.fn();
    await runToolLoop({
      client, model: 'm', tools: [seeTool, snapshotTool, finishTool],
      messages: [{ role: 'user', content: '目标' }] as any,
      maxSteps: 10, usageKey: JOB, onStep: () => {}, onAssistantContent,
    });
    expect(onAssistantContent).toHaveBeenCalledTimes(1);
    expect(onAssistantContent).toHaveBeenCalledWith(1, '第二次观察才作答。');
    clearUsage(JOB);
  });

  it('非 see 工具不登记待回答步骤：snapshot 后的 content 不回调', async () => {
    initUsage(JOB);
    const client = mockClient([
      resp(null, call('snapshot', {}, 'n1')),
      resp('这是对快照的分析。', call('finish', { success: true }, 'fz')),
    ]);
    const onAssistantContent = vi.fn();
    await runToolLoop({
      client, model: 'm', tools: [seeTool, snapshotTool, finishTool],
      messages: [{ role: 'user', content: '目标' }] as any,
      maxSteps: 10, usageKey: JOB, onStep: () => {}, onAssistantContent,
    });
    expect(onAssistantContent).not.toHaveBeenCalled();
    clearUsage(JOB);
  });

  it('多次 see 各自归号：第二次 see 的作答带新步骤序号', async () => {
    initUsage(JOB);
    const client = mockClient([
      resp(null, call('see', {}, 's1')),
      resp('第一次作答。', call('see', {}, 's2')),
      resp('第二次作答。', call('finish', { success: true }, 'fz')),
    ]);
    const onAssistantContent = vi.fn();
    await runToolLoop({
      client, model: 'm', tools: [seeTool, finishTool],
      messages: [{ role: 'user', content: '目标' }] as any,
      maxSteps: 10, usageKey: JOB, onStep: () => {}, onAssistantContent,
    });
    expect(onAssistantContent).toHaveBeenCalledTimes(2);
    expect(onAssistantContent).toHaveBeenNthCalledWith(1, 1, '第一次作答。');
    expect(onAssistantContent).toHaveBeenNthCalledWith(2, 2, '第二次作答。');
    clearUsage(JOB);
  });
});
