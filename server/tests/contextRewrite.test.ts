/**
 * 工具循环上下文治理测试：
 * - stateful 单状态槽：新一轮同槽结果回灌时，历史同槽消息原地降级为一行占位
 * - supersedes 连带失效：新快照回灌时旧结构树槽一并降级；tree 回灌不动快照槽
 * - 回灌单行化：普通结果超长做头尾保留（stateful 除外）
 * - onFailure 钩子：返回 null 照常回灌错误；返回字符串作为人工介入替换结果
 * - onSuccess 钩子：工具成功时回调（上层用于重置连续失败计数），异常工具不回调
 * - 水位压缩：按「上一轮输入」而非「累计输入」判断；触发时正文截断 + tool_calls 参数瘦身，最近 3 轮完整保留
 * - finish 校验：validateFinish 拒绝时循环继续
 */
import { describe, it, expect, vi } from 'vitest';
import { runToolLoop, type AgentTool } from '../src/services/toolLoop';
import { initUsage, clearUsage, addUsage } from '../src/services/tokenUsage';
import { buildGenTools } from '../src/services/generationToolHost';

const JOB = 'test-loop';

/** 构造 mock OpenAI 兼容客户端：按序返回预设的 tool_calls 响应。 */
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
function resp(...calls: any[]): any {
  return { choices: [{ message: { content: '', tool_calls: calls } }] };
}

const snapshotTool: AgentTool = {
  name: 'snapshot',
  description: '快照',
  parameters: { type: 'object', properties: {} },
  stateful: 'snapshot',
  supersedes: ['tree'],
  execute: async (a: any) => a.tag === 'old' ? '旧快照内容'.repeat(20) : '最新快照内容',
};
const treeTool: AgentTool = {
  name: 'page_tree',
  description: '结构树',
  parameters: { type: 'object', properties: {} },
  stateful: 'tree',
  execute: async () => '语义树内容',
};
const boomTool: AgentTool = {
  name: 'boom',
  description: '必失败工具',
  parameters: { type: 'object', properties: {} },
  execute: async () => {
    throw new Error('元素未找到');
  },
};
const finishTool: AgentTool = {
  name: 'finish',
  description: '完成',
  parameters: { type: 'object', properties: {} },
  execute: async () => '完成',
};

describe('runToolLoop 上下文治理', () => {
  it('stateful 单状态槽：新一轮同槽结果回灌时，历史同槽消息降级为一行占位', async () => {
    initUsage(JOB);
    const client = mockClient([resp(call('snapshot', { tag: 'old' }, 'c1')), resp(call('snapshot', { tag: 'new' }, 'c2')), resp(call('finish', {}, 'c3'))]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    await runToolLoop({ client, model: 'm', tools: [snapshotTool, finishTool], messages: messages as any, maxSteps: 10, usageKey: JOB, onStep: () => {} });
    const toolMsgs = messages.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(3);
    expect(toolMsgs[0].content).toContain('同槽结果已省略');
    expect(toolMsgs[0].content).toContain('以最新结果为准');
    expect(toolMsgs[1].content).toBe('最新快照内容');
    clearUsage(JOB);
  });

  it('supersedes：新快照回灌时连带降级旧结构树槽（页面已变化，树层级过期）', async () => {
    initUsage(JOB);
    const client = mockClient([resp(call('page_tree', {}, 't1')), resp(call('snapshot', {}, 's1')), resp(call('finish', {}, 'f1'))]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    await runToolLoop({ client, model: 'm', tools: [snapshotTool, treeTool, finishTool], messages: messages as any, maxSteps: 10, usageKey: JOB, onStep: () => {} });
    const toolMsgs = messages.filter((m) => m.role === 'tool');
    expect(toolMsgs[0].content).toContain('同槽结果已省略'); // 旧结构树被新快照连带降级
    expect(toolMsgs[1].content).toBe('最新快照内容');
    clearUsage(JOB);
  });

  it('tree 回灌只降级旧树，不降级快照槽（编号表是行动依据，必须保留）', async () => {
    initUsage(JOB);
    const client = mockClient([resp(call('snapshot', {}, 's1')), resp(call('page_tree', {}, 't1')), resp(call('page_tree', {}, 't2')), resp(call('finish', {}, 'f1'))]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    await runToolLoop({ client, model: 'm', tools: [snapshotTool, treeTool, finishTool], messages: messages as any, maxSteps: 10, usageKey: JOB, onStep: () => {} });
    const toolMsgs = messages.filter((m) => m.role === 'tool');
    expect(toolMsgs[0].content).toBe('最新快照内容'); // 快照不受 tree 回灌影响
    expect(toolMsgs[1].content).toContain('同槽结果已省略'); // 第一棵树被第二棵降级
    expect(toolMsgs[2].content).toBe('语义树内容');
    clearUsage(JOB);
  });

  it('普通回灌超长做单行化（头尾保留），stateful 结果不截断', async () => {
    initUsage(JOB);
    const long = 'x'.repeat(500);
    const normalTool: AgentTool = { name: 'normal', description: '', parameters: { type: 'object', properties: {} }, execute: async () => long };
    const client = mockClient([resp(call('normal', {}, 'n1')), resp(call('finish', {}, 'n2'))]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    await runToolLoop({ client, model: 'm', tools: [normalTool, finishTool], messages: messages as any, maxSteps: 10, usageKey: JOB, onStep: () => {} });
    const toolMsg = messages.find((m) => m.role === 'tool');
    expect(toolMsg.content.length).toBeLessThan(400);
    expect(toolMsg.content).toContain('(中间省略)');
    expect(toolMsg.content.startsWith('x')).toBe(true);
    clearUsage(JOB);
  });

  it('onFailure：返回替换结果时不回灌原始错误；返回 null 时照常回灌', async () => {
    initUsage(JOB);
    const client = mockClient([resp(call('boom', {}, 'b1')), resp(call('finish', {}, 'b2'))]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    await runToolLoop({
      client, model: 'm', tools: [boomTool, finishTool], messages: messages as any, maxSteps: 10, usageKey: JOB, onStep: () => {},
      onFailure: async () => '人工已修正该步骤，请继续',
    });
    expect(messages.find((m) => m.role === 'tool')?.content).toBe('人工已修正该步骤，请继续');

    // null → 错误照常回灌
    initUsage(JOB);
    const client2 = mockClient([resp(call('boom', {}, 'b3')), resp(call('finish', {}, 'b4'))]);
    const messages2: any[] = [{ role: 'user', content: '目标' }];
    await runToolLoop({ client: client2, model: 'm', tools: [boomTool, finishTool], messages: messages2 as any, maxSteps: 10, usageKey: JOB, onStep: () => {}, onFailure: async () => null });
    expect(messages2.find((m) => m.role === 'tool')?.content).toContain('元素未找到');
    clearUsage(JOB);
  });

  it('validateFinish 拒绝时回灌拒绝消息并继续循环', async () => {
    initUsage(JOB);
    const client = mockClient([
      resp(call('finish', {}, 'f1')), // 第一次 finish 被拒
      resp(call('finish', {}, 'f2')), // 第二次（模拟已补断言）通过
    ]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    let rejectOnce = true;
    const result = await runToolLoop({
      client, model: 'm', tools: [finishTool], messages: messages as any, maxSteps: 10, usageKey: JOB, onStep: () => {},
      validateFinish: async () => {
        if (rejectOnce) {
          rejectOnce = false;
          return '脚本必须以断言结尾';
        }
        return null;
      },
    });
    expect(result.finished).toBe(true);
    const rejectMsg = messages.filter((m) => m.role === 'tool')[0];
    expect(rejectMsg.content).toContain('断言');
    clearUsage(JOB);
  });
});

describe('runToolLoop onSuccess 与水位压缩（P1）', () => {
  const normalTool: AgentTool = { name: 'normal', description: '', parameters: { type: 'object', properties: {} }, execute: async () => 'ok' };

  it('onSuccess：工具执行成功时回调（含 args），异常/未知工具不回调', async () => {
    initUsage(JOB);
    const onSuccess = vi.fn();
    const client = mockClient([resp(call('normal', { k: 1 }, 's1')), resp(call('finish', {}, 's2'))]);
    await runToolLoop({ client, model: 'm', tools: [normalTool, finishTool], messages: [{ role: 'user', content: '目标' }] as any, maxSteps: 10, usageKey: JOB, onStep: () => {}, onSuccess });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('normal', { k: 1 });

    // 失败工具：只走 onFailure，不回调 onSuccess
    const onSuccess2 = vi.fn();
    const client2 = mockClient([resp(call('boom', {}, 'b1')), resp(call('finish', {}, 'b2'))]);
    await runToolLoop({ client: client2, model: 'm', tools: [boomTool, finishTool], messages: [{ role: 'user', content: '目标' }] as any, maxSteps: 10, usageKey: JOB, onStep: () => {}, onSuccess: onSuccess2, onFailure: async () => null });
    expect(onSuccess2).not.toHaveBeenCalled();
    clearUsage(JOB);
  });

  /** 带 usage 记账的 mock 客户端：每次主调用入账 inputTokens，模拟真实网关。 */
  function billingClient(perCallInput: number, responder: (i: number) => any) {
    let i = 0;
    return {
      chat: {
        completions: {
          create: vi.fn(async () => {
            addUsage(JOB, { inputTokens: perCallInput, outputTokens: 10, totalTokens: perCallInput + 10, cachedTokens: 0 });
            return responder(i++);
          }),
        },
      },
    } as any;
  }

  const fillTool: AgentTool = {
    name: 'fill',
    description: '填写',
    parameters: { type: 'object', properties: {} },
    execute: async () => '填写完成。（已记录为第 1 步）',
  };

  it('水位按上一轮输入判断：累计超水位但本轮输入小 → 不压缩（旧语义会误压）', async () => {
    initUsage(JOB);
    addUsage(JOB, { inputTokens: 100_000, outputTokens: 0, totalTokens: 100_000, cachedTokens: 0 }); // 累计已超水位
    const longInstruction = '很长的操作指令'.repeat(100); // 700 chars
    // 每轮仅入账 100 input（lastRoundInput 恒 << 水位）→ 永不压缩
    const responses = Array.from({ length: 5 }, (_, k) => resp(call('normal', { instruction: longInstruction }, `n${k}`)));
    const billing = billingClient(100, (i) => (i < 5 ? responses[i] : resp(call('finish', {}, 'nf'))));
    const messages: any[] = [{ role: 'user', content: '目标' }];
    await runToolLoop({ client: billing, model: 'm', tools: [normalTool, finishTool], messages: messages as any, maxSteps: 10, usageKey: JOB, onStep: () => {} });
    const assistants = messages.filter((m: any) => m.role === 'assistant' && m.tool_calls?.length && m.tool_calls[0].function.name !== 'finish');
    expect(assistants.length).toBeGreaterThanOrEqual(5);
    // 全部 args 原样保留（若误按累计水位压缩，最早的 args 已被瘦身）
    for (const a of assistants) {
      expect(a.tool_calls[0].function.arguments).toContain(longInstruction);
    }
    clearUsage(JOB);
  });

  it('上一轮输入超水位 → 压缩中间历史：正文截断 + tool_calls 参数瘦身，最近 3 轮完整保留', async () => {
    initUsage(JOB);
    const longValue = 'v'.repeat(300);
    const longInstruction = '长指令'.repeat(100); // 300 chars
    // 每轮入账 70K input（≥ 水位）→ 第 2 轮起每轮压缩；messages 带 system，与生产结构一致
    const responses = Array.from({ length: 5 }, (_, k) => resp(call('fill', { selector: `s${k}`, value: longValue, instruction: longInstruction }, `f${k}`)));
    const billing = billingClient(70_000, (i) => (i < 5 ? responses[i] : resp(call('finish', {}, 'ff'))));
    const messages: any[] = [{ role: 'system', content: '系统提示' }, { role: 'user', content: '目标' }];
    await runToolLoop({ client: billing, model: 'm', tools: [fillTool, finishTool], messages: messages as any, maxSteps: 10, usageKey: JOB, onStep: () => {} });
    const assistants = messages.filter((m: any) => m.role === 'assistant' && m.tool_calls?.length);
    expect(assistants.length).toBeGreaterThanOrEqual(6);
    // 最早一轮（超出最近 3 轮窗口）：args 已瘦身——长字符串值截断带省略号，短字段（selector）保留
    const oldest = JSON.parse(assistants[0].tool_calls[0].function.arguments);
    expect(oldest.value.length).toBeLessThanOrEqual(81); // TRIM_KEEP_CHARS + 省略号
    expect(oldest.value.endsWith('…')).toBe(true);
    expect(oldest.selector).toBe('s0');
    // 最近 3 轮完整保留
    const recent = JSON.parse(assistants[assistants.length - 2].tool_calls[0].function.arguments);
    expect(recent.value).toBe(longValue);
    expect(recent.instruction).toBe(longInstruction);
    clearUsage(JOB);
  });

  it('see 工具注册为 screenshot 单状态槽（视觉观察描述不在历史累积）', () => {
    const ctx: any = {
      jobId: 'j', page: {}, stagehand: {}, pwPage: {}, client: {}, model: 'm', xpathMap: {},
      sub: (t: any) => t, envMap: {}, emit: async () => {}, onTool: () => {}, note: () => {},
      stepCount: () => 0, usageKey: 'j', modelVision: true, pluginActions: [],
    };
    const tools = buildGenTools(ctx);
    const see = tools.find((t) => t.name === 'see');
    expect(see?.stateful).toBe('screenshot');
    // 快照默认只回编号表（瘦身），结构树由 page_tree 独立兜底并挂 tree 槽
    const snap = tools.find((t) => t.name === 'snapshot');
    expect(snap?.stateful).toBe('snapshot');
    expect(snap?.supersedes).toEqual(['tree']);
    const tree = tools.find((t) => t.name === 'page_tree');
    expect(tree?.stateful).toBe('tree');
    expect(tree?.supersedes).toBeUndefined();
  });
});
