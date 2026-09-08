/**
 * 工具循环空转保护测试：
 * - 滑动窗口：窗口内同签名变更类操作达 STUCK_WARN_AT 追加警告、达 STUCK_ASSIST_AT 触发 onStuck
 * - 累计上限：同签名累计达 STUCK_ABORT_AT 强制终止（finished:false，finishMessage 含「空转保护」）
 * - 签名归一化：同 selector 不同 value 的 fill 属不同签名；观察类工具（snapshot/wait）不参与
 * - onStuck 返回替换结果后窗口清零（累计不清）；本轮未应答的 tool_calls 补占位消息
 * - 观察空转保护：see 自上次进展（isProgress：goto/落库）连击达 SEE_ASSIST_AT 触发 onStuck(kind='observe)，
 *   假成功（isProgress=false）不重置连击；override 为 null 时追加 ask_human 引导警告
 * - 联动死锁保护：select 类成功调用在两元素间交替翻转达 LINK_FLIP_TRANSITIONS 触发 onStuck(kind='linkage')，
 *   失败的 select 不计入；未达阈值/非 select 动作不触发；override 为 null 时追加引导警告且清窗不立即复触
 */
import { describe, it, expect, vi } from 'vitest';
import { runToolLoop, type AgentTool } from '../src/services/toolLoop';
import { initUsage, clearUsage } from '../src/services/tokenUsage';

const JOB = 'test-stuck';

/** 构造 mock OpenAI 兼容客户端：按序返回预设的 tool_calls 响应（耗尽后重复最后一组）。 */
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

const clickTool: AgentTool = {
  name: 'click',
  description: '点击',
  parameters: { type: 'object', properties: {} },
  execute: async () => '点击完成。（已记录为第 1 步）',
};
const waitTool: AgentTool = {
  name: 'wait',
  description: '等待',
  parameters: { type: 'object', properties: {} },
  execute: async () => '页面已稳定',
};
const snapshotTool: AgentTool = {
  name: 'snapshot',
  description: '快照',
  parameters: { type: 'object', properties: {} },
  stateful: 'snapshot',
  execute: async () => '最新快照内容',
};
const fillTool: AgentTool = {
  name: 'fill',
  description: '填写',
  parameters: { type: 'object', properties: {} },
  execute: async () => '填写完成。（已记录为第 1 步）',
};
const finishTool: AgentTool = {
  name: 'finish',
  description: '完成',
  parameters: { type: 'object', properties: {} },
  execute: async () => '完成',
};
const seeTool: AgentTool = {
  name: 'see',
  description: '视觉观察',
  parameters: { type: 'object', properties: {} },
  execute: async () => '截图已附于下一条消息。观察请求：找入口。请依据截图作答并决定下一步。',
};
const gotoTool: AgentTool = {
  name: 'goto',
  description: '导航',
  parameters: { type: 'object', properties: {} },
  execute: async () => '已导航到目标页',
};
const componentActionTool: AgentTool = {
  name: 'component_action',
  description: '组件动作',
  parameters: { type: 'object', properties: {} },
  execute: async (a) => {
    if (String(a.value) === '金融科技') throw new Error('下拉选项未找到：金融科技');
    return `已选择下拉选项：${a.value}。（已记录为第 1 步）`;
  },
};

describe('runToolLoop 空转保护', () => {
  it('同签名点击：第 4 次追加警告，第 6 次触发 onStuck，第 9 次按累计强制终止', async () => {
    initUsage(JOB);
    const click = { selector: '132', instruction: '点击「确定」' };
    const client = mockClient(Array.from({ length: 9 }, (_, i) => [resp(call('click', click, `c${i}`))]).flat());
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const results: string[] = [];
    const onStuck = vi.fn(async (_name: string, _args: Record<string, unknown>, _count: number) => null);
    const result = await runToolLoop({
      client, model: 'm', tools: [clickTool, snapshotTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: ({ result: r }) => { results.push(r); }, onStuck,
    });
    expect(result.finished).toBe(false);
    expect(result.finishMessage).toContain('空转保护');
    expect(results.filter((r) => r.includes('⚠️ 系统提示'))).toHaveLength(5); // 第 4~8 次警告（第 6 次 assist 超时后闩锁，仅警告不再弹窗）
    expect(onStuck).toHaveBeenCalledTimes(1);
    expect(onStuck.mock.calls[0][2]).toBe(6);
    expect(results[8]).toContain('（空转保护：本次生成已被强制终止）');
    clearUsage(JOB);
  });

  it('终止时本轮并行未应答的 tool_calls 补占位消息', async () => {
    initUsage(JOB);
    const click = { selector: '7' };
    // 前 8 轮单 click，第 9 轮并行 [click, wait]：click 触发终止，wait 未应答 → 占位
    const responses = [
      ...Array.from({ length: 8 }, (_, i) => resp(call('click', click, `a${i}`))),
      resp(call('click', click, 'a8'), call('wait', {}, 'w8')),
    ];
    const client = mockClient(responses);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const result = await runToolLoop({
      client, model: 'm', tools: [clickTool, waitTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: () => {},
    });
    expect(result.finished).toBe(false);
    const toolMsgs = messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.at(-1)?.content).toBe('（空转保护终止）');
    expect(result.steps).toBe(9); // 仅计已应答的 click
    clearUsage(JOB);
  });

  it('onStuck 返回替换结果则替换回灌并清窗口；但累计上限仍会在第 9 次终止', async () => {
    initUsage(JOB);
    const click = { selector: '132' };
    const client = mockClient(Array.from({ length: 9 }, (_, i) => [resp(call('click', click, `o${i}`))]).flat());
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const results: string[] = [];
    const onStuck = vi.fn(async (_name: string, _args: Record<string, unknown>, _count: number) => '【用户引导】请改用其他方式完成该目标。');
    const result = await runToolLoop({
      client, model: 'm', tools: [clickTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: ({ result: r }) => { results.push(r); }, onStuck,
    });
    expect(results[5]).toBe('【用户引导】请改用其他方式完成该目标。'); // 第 6 次：替换
    expect(results[6]).not.toContain('⚠️'); // 窗口已清零，第 7、8 次不再警告
    expect(results[7]).not.toContain('⚠️');
    expect(onStuck).toHaveBeenCalledTimes(1);
    expect(result.finished).toBe(false); // 累计第 9 次仍终止
    expect(result.finishMessage).toContain('空转保护');
    clearUsage(JOB);
  });

  it('同 selector 不同 value 的 fill 是不同签名：不触发警告/终止', async () => {
    initUsage(JOB);
    const responses = [
      ...Array.from({ length: 5 }, (_, i) => [resp(call('fill', { selector: '3', value: `v${i}` }, `f${i}`))]).flat(),
      resp(call('finish', {}, 'fz')),
    ];
    const client = mockClient(responses);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const results: string[] = [];
    const result = await runToolLoop({
      client, model: 'm', tools: [fillTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: ({ result: r }) => { results.push(r); },
    });
    expect(result.finished).toBe(true);
    expect(results.every((r) => !r.includes('⚠️'))).toBe(true);
    clearUsage(JOB);
  });

  it('相同 snapshot 的反复观察参与停滞检测，wait 不清零', async () => {
    initUsage(JOB);
    const responses = [
      ...Array.from({ length: 6 }, (_, i) => [resp(call('snapshot', {}, `s${i}`), call('wait', { ms: 1000 }, `w${i}`))]).flat(),
      resp(call('finish', {}, 'sz')),
    ];
    const client = mockClient(responses);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const results: string[] = [];
    const onStuck = vi.fn(async (_name: string, _args: Record<string, unknown>, _count: number) => null);
    const result = await runToolLoop({
      client, model: 'm', tools: [snapshotTool, waitTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: ({ result: r }) => { results.push(r); }, onStuck,
    });
    expect(result.finished).toBe(true);
    expect(results.some((r) => r.includes('⚠️'))).toBe(true);
    expect(onStuck).toHaveBeenCalledWith('snapshot', expect.anything(), 4, 'observe');
    clearUsage(JOB);
  });
});

describe('runToolLoop 观察空转保护（see 连击）', () => {
  it('see 连续 4 次触发 onStuck(kind=observe)，结果被人工决策替换', async () => {
    initUsage(JOB);
    const client = mockClient([
      ...Array.from({ length: 4 }, (_, i) => resp(call('see', { question: '找系统管理入口' }, `v${i}`))),
      resp(call('finish', {}, 'fz')),
    ]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const results: string[] = [];
    const onStuck = vi.fn(async (_name: string, _args: Record<string, unknown>, _count: number, _kind?: string) => '【用户引导】系统管理在左侧「数据工坊」分组下，请先点击展开。');
    await runToolLoop({
      client, model: 'm', tools: [seeTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: ({ result: r }) => { results.push(r); }, onStuck,
    });
    expect(onStuck).toHaveBeenCalledTimes(1);
    expect(onStuck.mock.calls[0][0]).toBe('see');
    expect(onStuck.mock.calls[0][2]).toBe(4);
    expect(onStuck.mock.calls[0][3]).toBe('observe');
    expect(results[3]).toBe('【用户引导】系统管理在左侧「数据工坊」分组下，请先点击展开。'); // 第 4 次 see：替换
    // 决策文本回灌上下文（替换原 see 结果）
    const toolMsgs = (messages as any[]).filter((m) => m.role === 'tool');
    expect(toolMsgs[3].content).toBe('【用户引导】系统管理在左侧「数据工坊」分组下，请先点击展开。');
    clearUsage(JOB);
  });

  it('goto 进展重置连击：see×3 → goto → see×3 不触发', async () => {
    initUsage(JOB);
    const client = mockClient([
      ...Array.from({ length: 3 }, (_, i) => resp(call('see', {}, `a${i}`))),
      resp(call('goto', { url: 'http://x' }, 'g0')),
      ...Array.from({ length: 3 }, (_, i) => resp(call('see', {}, `b${i}`))),
      resp(call('finish', {}, 'fz')),
    ]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const onStuck = vi.fn(async (_name: string, _args: Record<string, unknown>, _count: number, _kind?: 'repeat' | 'observe' | 'linkage') => null);
    await runToolLoop({
      client, model: 'm', tools: [seeTool, gotoTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: () => {}, onStuck,
      isProgress: (name) => name === 'goto',
    });
    expect(onStuck).not.toHaveBeenCalled(); // 第二段连击仅 3 次，未达阈值
    clearUsage(JOB);
  });

  it('假成功不重置：see×3 → click（isProgress=false）→ see×1 触发', async () => {
    initUsage(JOB);
    const client = mockClient([
      ...Array.from({ length: 3 }, (_, i) => resp(call('see', {}, `a${i}`))),
      resp(call('click', { selector: '2', instruction: '点击 admin 头像' }, 'c0')),
      resp(call('see', {}, 'b0')),
      resp(call('finish', {}, 'fz')),
    ]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const results: string[] = [];
    const onStuck = vi.fn(async (_name: string, _args: Record<string, unknown>, _count: number, _kind?: 'repeat' | 'observe' | 'linkage') => null);
    await runToolLoop({
      client, model: 'm', tools: [seeTool, clickTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: ({ result: r }) => { results.push(r); }, onStuck,
      isProgress: () => false, // 点击返回成功但未落库新步骤（假成功）
    });
    expect(onStuck).toHaveBeenCalledTimes(1); // 连击跨假成功 click 累计到 4
    expect(onStuck.mock.calls[0][0]).toBe('see');
    expect(results[4]).toContain('⚠️'); // override 为 null → 追加引导警告（第 4 次 see 在 click 之后）
    expect(results[4]).toContain('ask_human');
    clearUsage(JOB);
  });

  it('落库进展重置连击：see×3 → click（落库新步骤）→ see×1 不触发（真实有状态 isProgress）', async () => {
    // 复刻 generationLoop 的真实 isProgress：stepCount 随落库递增的闭包。
    // 回归背景：toolLoop 曾对 isProgress 双调用（空转窗口检查 + seeStreak 重置各一次），
    // 第二次恒 false → 落库重置从未生效，4 次 see 间夹着落库也被误判「观察空转」（cmtqvusc6 案例）。
    initUsage(JOB);
    let scriptSteps = 0;
    let lastStepCount = 0;
    const isProgress = (name: string): boolean => {
      const cur = scriptSteps;
      if (cur > lastStepCount) {
        lastStepCount = cur;
        return true;
      }
      return name === 'goto';
    };
    const landingClick: AgentTool = {
      name: 'click',
      description: '点击',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        scriptSteps++; // 落库新脚本步骤 = 真实进展
        return '点击完成。（已记录为新步骤）';
      },
    };
    const client = mockClient([
      ...Array.from({ length: 3 }, (_, i) => resp(call('see', { question: `q${i}` }, `a${i}`))),
      resp(call('click', { selector: '161', instruction: '点击确认' }, 'c0')),
      resp(call('see', { question: '弹窗是否关闭，是否有校验错误' }, 'b0')),
      resp(call('finish', {}, 'fz')),
    ]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const onStuck = vi.fn(async (_name: string, _args: Record<string, unknown>, _count: number, _kind?: 'repeat' | 'observe' | 'linkage') => '【人工介入】');
    await runToolLoop({
      client, model: 'm', tools: [seeTool, landingClick, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: () => {}, onStuck,
      isProgress,
    });
    expect(onStuck).not.toHaveBeenCalled(); // click 落库重置连击 → 第 4 次 see 只是新一轮第 1 次
    // 第 4 次 see 的结果未被人工决策替换（仍是原始观察结果）
    const toolMsgs = (messages as any[]).filter((m) => m.role === 'tool');
    expect(toolMsgs[4].content).toContain('截图已附于下一条消息');
    clearUsage(JOB);
  });

  it('override 为 null 时追加 ask_human 引导警告并重置连击', async () => {
    initUsage(JOB);
    const client = mockClient([
      ...Array.from({ length: 8 }, (_, i) => resp(call('see', {}, `v${i}`))),
      resp(call('finish', {}, 'fz')),
    ]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const results: string[] = [];
    const onStuck = vi.fn(async (_name: string, _args: Record<string, unknown>, _count: number, _kind?: 'repeat' | 'observe' | 'linkage') => null);
    await runToolLoop({
      client, model: 'm', tools: [seeTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: ({ result: r }) => { results.push(r); }, onStuck,
    });
    expect(onStuck).toHaveBeenCalledTimes(2); // 第 4、8 次 see 各挂起一次（介入后重置给新预算）
    expect(onStuck.mock.calls[0][3]).toBe('observe');
    expect(results[3]).toContain('ask_human');
    expect(results[7]).toContain('ask_human');
    expect(results.slice(0, 3).every((r) => !r.includes('⚠️'))).toBe(true); // 前 3 次不打扰
    clearUsage(JOB);
  });
});

describe('runToolLoop 联动死锁保护（select 交替翻转）', () => {
  /** select 类调用构造器：instruction 带字段描述，验证挂起文案可读化。 */
  const ca = (sel: string, value: string, id: string, action = 'select'): any =>
    call('component_action', { action, selector: sel, value, instruction: `在字段${sel}中选择${value}` }, id);

  it('select 类调用在两元素间交替翻转达阈值 → onStuck(kind=linkage)，结果被人工决策替换', async () => {
    initUsage(JOB);
    const client = mockClient([
      resp(ca('87', '金赋科技', 'k1')),
      resp(ca('89', 'test_user_auto', 'k2')),
      resp(ca('87', '金赋科技', 'k3')),
      resp(ca('89', 'test_user_auto', 'k4')),
      resp(ca('87', '技术开发部', 'k5')),
      resp(call('finish', {}, 'fz')),
    ]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const results: string[] = [];
    const onStuck = vi.fn(async (_n: string, _a: Record<string, unknown>, _c: number, _k?: string, _d?: string) =>
      '【用户补充说明】账号与部门是联动字段：先选部门，再从该部门过滤出的账号列表里选。');
    const result = await runToolLoop({
      client, model: 'm', tools: [componentActionTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: ({ result: r }) => { results.push(r); }, onStuck,
    });
    expect(onStuck).toHaveBeenCalledTimes(1);
    expect(onStuck.mock.calls[0][2]).toBe(4);
    expect(onStuck.mock.calls[0][3]).toBe('linkage');
    expect(String(onStuck.mock.calls[0][4])).toContain('元素 87');
    expect(String(onStuck.mock.calls[0][4])).toContain('元素 89');
    expect(results[4]).toContain('【用户补充说明】');
    expect(result.finished).toBe(true);
    clearUsage(JOB);
  });

  it('交替未达阈值或非 select 动作不触发联动保护', async () => {
    initUsage(JOB);
    const client = mockClient([
      resp(ca('87', '金赋科技', 'k1')),
      resp(ca('89', 'test_user_auto', 'k2')),
      resp(ca('87', '金赋科技', 'k3')),
      resp(ca('89', 'test_user_auto', 'k4')),
      // 3 次转移未达阈值；set_date 非 select 动作，交替再多也不计入
      ...Array.from({ length: 4 }, (_, i) => resp(ca(String(92 + (i % 2)), '2026-12-31', `d${i}`, 'set_date'))),
      resp(call('finish', {}, 'fz')),
    ]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const results: string[] = [];
    const onStuck = vi.fn(async (_n: string, _a: Record<string, unknown>, _c: number, _k?: string) => null);
    const result = await runToolLoop({
      client, model: 'm', tools: [componentActionTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: ({ result: r }) => { results.push(r); }, onStuck,
    });
    expect(onStuck).not.toHaveBeenCalled();
    expect(results.every((r) => !r.includes('⚠️'))).toBe(true);
    expect(result.finished).toBe(true);
    clearUsage(JOB);
  });

  it('失败的 select 不计入翻转证据', async () => {
    initUsage(JOB);
    const client = mockClient([
      resp(ca('87', '金赋科技', 'k1')),
      resp(ca('89', 'test_user_auto', 'k2')),
      resp(ca('87', '金赋科技', 'k3')),
      resp(ca('89', '金融科技', 'k4')), // 抛错 → toolOk=false，不计入 linkHist
      resp(ca('87', '金赋科技', 'k5')),
      resp(call('finish', {}, 'fz')),
    ]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const results: string[] = [];
    const onStuck = vi.fn(async (_n: string, _a: Record<string, unknown>, _c: number, _k?: string) => null);
    const result = await runToolLoop({
      client, model: 'm', tools: [componentActionTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: ({ result: r }) => { results.push(r); }, onStuck,
    });
    expect(onStuck).not.toHaveBeenCalled();
    expect(result.finished).toBe(true);
    clearUsage(JOB);
  });

  it('override 为 null 时追加引导警告并清窗（不立即复触）', async () => {
    initUsage(JOB);
    const client = mockClient([
      resp(ca('87', '金赋科技', 'k1')),
      resp(ca('89', 'test_user_auto', 'k2')),
      resp(ca('87', '金赋科技', 'k3')),
      resp(ca('89', 'test_user_auto', 'k4')),
      resp(ca('87', '技术开发部', 'k5')), // 第 5 次触发（4 次转移），挂起超时返回 null
      resp(ca('89', 'test_user_auto', 'k6')),
      resp(ca('87', '技术开发部', 'k7')),
      resp(ca('89', 'test_user_auto', 'k8')),
      resp(ca('87', '技术开发部', 'k9')),
      resp(call('finish', {}, 'fz')),
    ]);
    const messages: any[] = [{ role: 'user', content: '目标' }];
    const results: string[] = [];
    const onStuck = vi.fn(async (_n: string, _a: Record<string, unknown>, _c: number, _k?: string) => null);
    await runToolLoop({
      client, model: 'm', tools: [componentActionTool, finishTool], messages: messages as any,
      maxSteps: 20, usageKey: JOB, onStep: ({ result: r }) => { results.push(r); }, onStuck,
    });
    expect(onStuck).toHaveBeenCalledTimes(1); // 清窗后第二段仅 3 次转移，不再触发
    expect(results[4]).toContain('⚠️');
    expect(results[4]).toContain('ask_human');
    clearUsage(JOB);
  });
});
