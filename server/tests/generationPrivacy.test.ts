import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(async (_body: any, _options?: any) => ({choices: []})), publish: vi.fn(), append: vi.fn() }));
vi.mock('openai', () => ({ default: class { chat = {completions: {create: mocks.create}}; } }));
vi.mock('../src/config', () => ({ getConfig: () => ({openaiApiKey: 'fake-key', openaiBaseUrl: 'https://example.test'}) }));
vi.mock('../src/ws/hub', () => ({ publish: mocks.publish }));
vi.mock('../src/services/generationLogService', () => ({ appendStep: mocks.append, STEP_TYPE: {TOOL: 'tool'} }));

import { createGatewayClient } from '../src/services/stagehandManager';
import { activeLogIds, pub } from '../src/services/generation/logBridge';
import { setGenerationEnvironment, clearGenerationEnvironment } from '../src/services/generation/privacy';

afterEach(() => { clearGenerationEnvironment('privacy'); activeLogIds.clear(); vi.clearAllMocks(); });

it('网关出口覆盖模型消息和工具参数，保留模型配置、AbortSignal 和原始输入', async () => {
  setGenerationEnvironment('privacy', {password: 'fake-secret'});
  const client = createGatewayClient('privacy');
  const messages: any[] = [
    {role: 'system', content: 'fake-secret'},
    {role: 'assistant', tool_calls: [{id: 'fake-secret', type: 'function', function: {name: 'fill', arguments: JSON.stringify({value: 'fake-secret'})}}]},
    {role: 'tool', tool_call_id: 'fake-secret', content: '填写 fake-secret'},
  ];
  const signal = new AbortController().signal;
  await client.chat.completions.create({model: 'model-name', messages}, {signal});
  const [request, options] = mocks.create.mock.calls[0];
  expect(request.model).toBe('model-name');
  expect(options.signal).toBe(signal);
  expect(request.messages[0].content).toBe('{{password}}');
  expect(JSON.parse(request.messages[1].tool_calls[0].function.arguments).value).toBe('{{password}}');
  expect(request.messages[2].tool_call_id).toBe('fake-secret');
  expect(request.messages[2].content).toBe('填写 {{password}}');
  expect(messages[0].content).toBe('fake-secret');
});

it('同一工具事件的 WS、日志和结构化参数全部脱敏', () => {
  setGenerationEnvironment('privacy', {password: 'fake-secret'});
  activeLogIds.set('privacy', 'log');
  pub({type: 'gen:tool', jobId: 'privacy', index: 1, step: {actionLabel: '填写', actionDetail: 'fake-secret', result: 'fake-secret'}, args: {value: 'fake-secret'}});
  expect(JSON.stringify(mocks.publish.mock.calls)).not.toContain('fake-secret');
  expect(JSON.stringify(mocks.append.mock.calls)).not.toContain('fake-secret');
  expect(JSON.stringify(mocks.append.mock.calls)).toContain('{{password}}');
});
