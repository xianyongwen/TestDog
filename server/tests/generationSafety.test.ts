import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGenTools, type GenToolContext } from '../src/services/generationToolHost';
import { runToolLoop, type AgentTool } from '../src/services/toolLoop';
import { clearGenerationEnvironment, redactGenerationData, redactGenerationText, setGenerationEnvironment } from '../src/services/generation/privacy';
import { createSubstituter } from '../src/services/generation/substitution';
import { semanticizeLocator } from '../src/services/locatorVerifier';
import { shotHash } from '../src/services/visualFrameService';

vi.mock('../src/services/locatorVerifier', () => ({ semanticizeLocator: vi.fn() }));
vi.mock('../src/services/visualFrameService', () => ({ shotHash: vi.fn(), effectChanged: (a: string, b: string) => a !== b }));

const JOB = 'generation-safety';
const call = (name: string, id: string, args = {}) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const response = (...calls: any[]) => ({ choices: [{ message: { content: '', tool_calls: calls } }] });
const tool = (name: string, execute: AgentTool['execute']): AgentTool => ({ name, execute, description: name, parameters: {} });
const textOf = (result: any): string => typeof result === 'string' ? result : result.text;

function context(env: Record<string, string> = {}) {
  setGenerationEnvironment(JOB, env);
  const steps: any[] = [];
  const loc = { elementHandle: vi.fn(async () => null), click: vi.fn(async () => {}), fill: vi.fn(async (_value: string) => {}), selectOption: vi.fn(async () => {}) };
  const ctx = {
    jobId: JOB, envMap: env, sub: createSubstituter(env, 1000).sub,
    page: { url: async () => 'https://example.test/success' },
    pwPage: { locator: () => loc }, stagehand: { act: vi.fn() },
    pluginActions: [], modelVision: false, note: vi.fn(), stepCount: () => steps.length,
    emit: vi.fn(async (step: any) => { steps.push(step); return { index: steps.length }; }),
  } as unknown as GenToolContext;
  const get = (name: string) => buildGenTools(ctx).find((t) => t.name === name)!;
  return { ctx, steps, loc, get };
}

beforeEach(() => {
  vi.mocked(semanticizeLocator).mockResolvedValue({ strategy: 'testid', value: 'target' });
  vi.mocked(shotHash).mockResolvedValue('same-frame');
});
afterEach(() => { clearGenerationEnvironment(JOB); vi.useRealTimers(); vi.clearAllMocks(); });

describe('生成动作与断言', () => {
  it('await URL 并以真实值校验、占位符落库；不再接受 selector 代替 expected', async () => {
    const { get, steps } = context({ path: '/success' });
    await get('assert').execute({ type: 'url', expected: '{{path}}', instruction: '验证 URL' });
    expect(steps[0].assertion.expected).toBe('{{path}}');
    await expect(get('assert').execute({ type: 'url', expected: '/missing' })).rejects.toThrow('断言未通过');
    await expect(get('assert').execute({ type: 'url', selector: '/success' })).rejects.toThrow('缺少 expected');
    expect(steps).toHaveLength(1);
  });

  it('截图相同仍记录点击，记录发生在后验截图之前', async () => {
    vi.useFakeTimers();
    const { get, steps, loc } = context();
    vi.mocked(shotHash).mockImplementationOnce(async () => 'same-frame').mockImplementationOnce(async () => {
      expect(steps).toHaveLength(1);
      return 'same-frame';
    });
    const pending = get('click').execute({ selector: '12', instruction: '提交' });
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ status: 'success', effect: 'unknown', recordedStep: 1 });
    expect(steps).toHaveLength(1);
    expect(loc.click).toHaveBeenCalledTimes(1);
  });

  it('点击失败不记录；定位不可靠时不执行点击', async () => {
    const { get, steps, loc } = context();
    loc.click.mockRejectedValueOnce(new Error('timeout'));
    await expect(get('click').execute({ selector: '12', instruction: '提交' })).rejects.toThrow('timeout');
    vi.mocked(semanticizeLocator).mockResolvedValueOnce(undefined as never);
    await expect(get('click').execute({ selector: '12', instruction: '提交' })).rejects.toThrow('本步未执行');
    expect(loc.click).toHaveBeenCalledTimes(1);
    expect(steps).toHaveLength(0);
  });

  it('fill 仅在执行层使用密码，结果和失败消息脱敏', async () => {
    const { get, loc, steps } = context({ password: 'fake-password-123' });
    const result = await get('fill').execute({ selector: '12', instruction: '填写密码', value: '{{password}}' });
    expect(loc.fill).toHaveBeenCalledWith('fake-password-123', expect.anything());
    expect(textOf(result)).not.toContain('fake-password-123');
    expect(steps[0].value).toBe('{{password}}');
    loc.selectOption.mockRejectedValueOnce(new Error('invalid fake-password-123'));
    const failure = await get('select').execute({ selector: '12', value: '{{password}}', instruction: '选择' });
    expect(failure).toMatchObject({ status: 'failed' });
    expect(textOf(failure)).toContain('{{password}}');
    expect(textOf(failure)).not.toContain('fake-password-123');
  });

  it('含环境变量值的 act 不把真实值发送给浏览器 AI', async () => {
    const { get, ctx } = context({ password: 'fake-password-123' });
    expect(await get('act').execute({ instruction: '填写密码 {{password}}' })).toMatchObject({ status: 'failed' });
    expect(ctx.stagehand.act).not.toHaveBeenCalled();
  });
});

describe('工具循环终止与错误状态', () => {
  it('finish 接受后不再执行当前批次剩余工具，仍补全应答', async () => {
    const click = vi.fn(async () => 'clicked');
    const messages: any[] = [];
    const client: any = { chat: { completions: { create: vi.fn(async () => response(call('finish', 'f'), call('click', 'c'))) } } };
    const result = await runToolLoop({ client, model: 'mock', tools: [tool('finish', async () => ''), tool('click', click)], messages, maxSteps: 5, usageKey: JOB, validateFinish: async () => null, onStep: () => {} });
    expect(result.finished).toBe(true);
    expect(click).not.toHaveBeenCalled();
    expect(messages.filter(m => m.role === 'tool').map(m => m.tool_call_id)).toEqual(['f', 'c']);
  });

  it('maxSteps 约束实际工具调用数', async () => {
    const click = vi.fn(async () => 'clicked');
    const messages: any[] = [];
    const client: any = { chat: { completions: { create: vi.fn(async () => response(call('click', 'a'), call('click', 'b'), call('click', 'c'))) } } };
    const result = await runToolLoop({ client, model: 'mock', tools: [tool('click', click)], messages, maxSteps: 1, usageKey: JOB, onStep: () => {} });
    expect(result.steps).toBe(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(messages.filter(m => m.role === 'tool')).toHaveLength(3);
  });

  it('failed 进入失败回调，uncertain 不清零失败计数，工具错误在回灌前脱敏', async () => {
    setGenerationEnvironment(JOB, { password: 'fake-password-123' });
    const onFailure = vi.fn(async () => null);
    const onSuccess = vi.fn();
    const onStep = vi.fn();
    const messages: any[] = [];
    const client: any = { chat: { completions: { create: async () => response(call('select', 'a'), call('uncertain', 'b')) } } };
    await runToolLoop({ client, model: 'mock', tools: [tool('select', async () => ({status: 'failed', text: 'invalid fake-password-123'})), tool('uncertain', async () => ({status: 'uncertain', text: '效果未知'}))], messages, maxSteps: 2, usageKey: JOB, onFailure, onSuccess, onStep });
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0]).not.toContain('fake-password-123');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(JSON.stringify(messages)).not.toContain('fake-password-123');
    expect(JSON.stringify(onStep.mock.calls)).not.toContain('fake-password-123');
  });

  it('模型请求 Abort 正常返回，普通网络异常继续抛出', async () => {
    const abort = new AbortController();
    const client: any = { chat: { completions: { create: async () => { abort.abort(); throw new Error('aborted'); } } } };
    const options = { client, model: 'mock', tools: [], messages: [], maxSteps: 2, usageKey: JOB, onStep: () => {} };
    expect((await runToolLoop({ ...options, signal: abort.signal })).finished).toBe(false);
    client.chat.completions.create = async () => { throw new Error('network'); };
    await expect(runToolLoop(options)).rejects.toThrow('network');
  });

  it('动作期间暂停：保留当前记录，剩余调用跳过，不触发新的人工等待', async () => {
    const abort = new AbortController();
    const messages: any[] = [];
    const execute = vi.fn(async () => { abort.abort(); return '已记录'; });
    const onFailure = vi.fn();
    const client: any = { chat: { completions: { create: async () => response(call('click', 'a'), call('click', 'b')) } } };
    await runToolLoop({ client, model: 'mock', tools: [tool('click', execute)], messages, maxSteps: 5, usageKey: JOB, signal: abort.signal, onFailure, onStep: () => {} });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    expect(messages.filter(m => m.role === 'tool').map(m => m.content)).toEqual(['已记录', '（已中止）']);
  });
});

describe('变量与脱敏', () => {
  it('跨两次续跑复用时间和随机值，新的系统变量也使用原始时间', () => {
    const first = createSubstituter({}, 1000);
    const email = first.sub('{{randomEmail}}');
    const second = createSubstituter({}, 2000, structuredClone(first.state));
    expect(second.sub('{{randomEmail}}')).toBe(email);
    expect(second.sub('{{systemTime}}')).toBe('1000');
    const third = createSubstituter({}, 3000, structuredClone(second.state));
    expect(third.sub('{{randomEmail}}')).toBe(email);
    expect(third.sub('{{systemTime}}')).toBe('1000');
  });

  it('脱敏保留协议 ID、工具名和已有占位符，正确处理嵌套参数 JSON', () => {
    setGenerationEnvironment(JOB, { p: 'secret"value', tool: 'fill' });
    const messages = [{ role: 'assistant', content: 'secret"value {{p}}', tool_calls: [{ id: 'fill', type: 'function', function: { name: 'fill', arguments: JSON.stringify({value: 'secret"value'}) } }] }];
    const safe = redactGenerationData(JOB, messages);
    expect(safe[0].tool_calls[0].id).toBe('fill');
    expect(safe[0].tool_calls[0].function.name).toBe('fill');
    expect(JSON.parse(safe[0].tool_calls[0].function.arguments).value).toBe('{{p}}');
    expect(safe[0].content).toBe('{{p}} {{p}}');
    expect(redactGenerationText(JOB, '{{p}}')).toBe('{{p}}');
    expect(messages[0].content).toContain('secret"value');
  });
});
