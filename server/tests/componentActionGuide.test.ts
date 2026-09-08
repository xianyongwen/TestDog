/**
 * component_action 全链失败回灌文案：
 * - 链上错误带真实可选值清单（select「当前可选：」/ tree-select「当前可见：」）→ 首选建议「仅修正 args.value 重试本动作」
 * - 其他失败（无可选值清单）→ 维持「换路径」建议
 * 全链失败不落库（emit 不被调用）。
 */
import { describe, it, expect, vi } from 'vitest';
import { buildGenTools, type GenToolContext } from '../src/services/generationToolHost';

// 本组测试聚焦插件失败文案；目标已经通过动作前唯一性验证。
vi.mock('../src/services/locatorVerifier', () => ({ semanticizeLocator: async () => ({ strategy: 'css', value: '#select' }) }));

/** 最小 pwPage mock：locator/elementHandle 可用，evaluate 按参数形状分流（2 元=链解析，4 元=动作调用），其余抛错走 catch 降级。 */
function makeCtx(chainMessage: string): GenToolContext {
  const loc = {
    elementHandle: async () => ({}),
    selectOption: async () => {
      throw new Error('Element is not a <select> element');
    },
  };
  const evaluate = vi.fn(async (_fn: unknown, args?: unknown[]) => {
    const a = Array.isArray(args) ? args : [];
    if (a.length === 2) return [{ id: 'select' }]; // resolveChainInPage：命中内置 select 插件
    if (a.length === 4) return { status: 'failed', message: chainMessage }; // invokeInPage：插件三态 failed
    throw new Error('unsupported evaluate'); // 语义化预采集等 → 外层 catch 降级
  });
  const pwPage = {
    locator: () => loc,
    evaluate,
    screenshot: async () => {
      throw new Error('no screenshot');
    },
  };
  return {
    jobId: 'j',
    page: {},
    stagehand: {},
    pwPage,
    client: {},
    model: 'm',
    xpathMap: {},
    sub: (t: any) => t,
    envMap: {},
    emit: vi.fn(async () => {}),
    onTool: () => {},
    note: () => {},
    stepCount: () => 0,
    usageKey: 'j',
    modelVision: false,
    pluginActions: [{ name: 'select', doc: '选择选项', preferFill: false, pluginId: 'select', pluginName: 'select' }],
    network: {} as never,
  } as unknown as GenToolContext;
}

async function runComponentAction(chainMessage: string): Promise<string> {
  const tools = buildGenTools(makeCtx(chainMessage));
  const tool = tools.find((t) => t.name === 'component_action')!;
  const result = await tool.execute({ action: 'select', selector: '121', value: '普通用户', instruction: '选择「用户角色」' });
  expect(typeof result === 'object' && result.status).toBe('failed');
  return typeof result === 'string' ? result : result.text;
}

describe('component_action 全链失败回灌文案', () => {
  it('链上错误带「当前可选：」→ 首选建议修正 value 重试同一动作，不引导两段式', async () => {
    const r = await runComponentAction('下拉选项未找到：普通用户（当前可选：南海政数普通用户 / 南海政数管理）。请从当前可选列表中选取，或修正选项文本。');
    expect(r).toContain('当前可选：南海政数普通用户');
    expect(r).toContain('仅修正 args.value 重试本动作');
    expect(r).not.toContain('换路径（两段式点击、修正参数或 act）');
  });

  it('链上错误带「当前可见：」（tree-select 诊断）→ 同样引导修正 value 重试', async () => {
    const r = await runComponentAction('树节点未找到：前端组（当前可见：总公司 / 研发部）。深层节点需先展开其祖先，或修正节点文本。');
    expect(r).toContain('仅修正 args.value 重试本动作');
  });

  it('其他失败（无可选值清单）→ 维持「换路径」建议', async () => {
    const r = await runComponentAction('目标元素不属于任何已适配下拉（.ant-select / .el-select）');
    expect(r).toContain('换路径（两段式点击、修正参数或 act）');
    expect(r).not.toContain('仅修正 args.value 重试本动作');
  });

  it('全链失败不落库（emit 不被调用）', async () => {
    const ctx = makeCtx('下拉选项未找到：x（当前可选：y）');
    const tools = buildGenTools(ctx);
    const tool = tools.find((t) => t.name === 'component_action')!;
    await tool.execute({ action: 'select', selector: '121', value: 'x', instruction: 'i' });
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});
