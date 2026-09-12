/// <reference lib="dom" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { browserLaunchOptions } from '../src/browser';
import { CANDIDATE_SCRIPT, analyzeElement, type AnalyzeResult } from '../src/services/locatorCandidateScript';
import { observationText } from '../src/services/browserObservation';
import {
  buildLocatorFromCandidate,
  resolveQuery,
  verifyCandidates,
  semanticizeLocator,
  stripTransientStateCss,
  type QueryLike,
} from '../src/services/locatorVerifier';
import { buildGenTools } from '../src/services/generationToolHost';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch(browserLaunchOptions({ headless: true }));
});

afterAll(async () => {
  await browser?.close();
});

async function newPage(html: string): Promise<Page> {
  const page = await browser.newPage();
  await page.addInitScript(CANDIDATE_SCRIPT);
  await page.setContent(html);
  // setContent 的 about:blank 不走 addInitScript 的导航钩子，须对当前文档显式注入（同生产 injectCandidates 兜底）
  await page.evaluate(CANDIDATE_SCRIPT);
  return page;
}

/** 在页面上对 CSS 选择器命中的元素跑 __ttAnalyze。 */
async function analyze(page: Page, css: string): Promise<AnalyzeResult> {
  const res = (await page.evaluate(
    (sel: string) => {
      const win = globalThis as any;
      const el = document.querySelector(sel);
      return win.__ttAnalyze(el);
    },
    css,
  )) as AnalyzeResult;
  return res;
}

describe('CANDIDATE_SCRIPT 候选生成与页内计数', () => {
  it('data-testid 元素：testid 候选优先且唯一', async () => {
    const page = await newPage('<button data-testid="login-btn">登录</button>');
    const r = await analyze(page, '[data-testid="login-btn"]');
    expect(r.candidates[0]).toMatchObject({ strategy: 'testid', value: 'login-btn' });
    expect(r.counts[0]).toBe(1);
    expect(r.bestIndex).toBe(0);
    await page.close();
  });

  it('重复元素：role/text 计数>1，回退到唯一 css 候选', async () => {
    const page = await newPage('<div><button>登录</button><button>登录</button></div>');
    const r = await analyze(page, 'div > button:nth-of-type(1)');
    const roleIdx = r.candidates.findIndex((c) => c.strategy === 'role');
    expect(roleIdx).toBeGreaterThanOrEqual(0);
    expect(r.counts[roleIdx]).toBeGreaterThan(1); // 两个「登录」按钮
    const cssIdx = r.candidates.findIndex((c) => c.strategy === 'css');
    expect(cssIdx).toBeGreaterThanOrEqual(0);
    expect(r.counts[cssIdx]).toBe(1);
    expect(r.bestIndex).toBe(cssIdx);
    await page.close();
  });

  it('非标准 role：不生成 role 候选（Playwright getByRole 无法执行）', async () => {
    const page = await newPage('<button role="card">自定义</button>');
    const r = await analyze(page, '[role="card"]');
    expect(r.candidates.some((c) => c.strategy === 'role')).toBe(false);
    await page.close();
  });

  it('大小写不敏感计数：Login/login 视为重复，role/text 不判唯一', async () => {
    const page = await newPage('<div><button>Login</button><button>login</button></div>');
    const r = await analyze(page, 'div > button:nth-of-type(1)');
    const roleIdx = r.candidates.findIndex((c) => c.strategy === 'role');
    expect(r.counts[roleIdx]).toBe(2); // Playwright getByRole 大小写不敏感 → 匹配 2 处
    const textIdx = r.candidates.findIndex((c) => c.strategy === 'text');
    expect(r.counts[textIdx]).toBe(3); // div + 两个 button 都含 'login'（getByText 子串匹配）
    await page.close();
  });

  it('弹层内元素：候选带 scope、不产绝对 xpath、css 相对容器', async () => {
    const page = await newPage(`
      <div role="dialog">
        <button>确认</button>
      </div>
    `);
    const r = await analyze(page, '[role="dialog"] button');
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) {
      expect(c.scope).toBeTruthy(); // 全部候选都带 scope
      expect(c.strategy).not.toBe('xpath'); // 弹层内不产绝对 xpath
    }
    const roleIdx = r.candidates.findIndex((c) => c.strategy === 'role');
    expect(r.candidates[roleIdx].scope).toMatchObject({ strategy: 'role', value: 'dialog' });
    const cssIdx = r.candidates.findIndex((c) => c.strategy === 'css');
    expect(cssIdx).toBeGreaterThanOrEqual(0);
    expect(r.counts[cssIdx]).toBe(1); // 容器内唯一
    await page.close();
  });

  it('__ttResolve：绝对 XPath 与 CSS 都能解析到元素', async () => {
    const page = await newPage('<button id="a">按钮</button>');
    const xp = (await page.evaluate(() => {
      const el = document.querySelector('#a');
      const parts: string[] = [];
      let cur: any = el;
      while (cur && cur.nodeType === 1) {
        const tag = cur.tagName.toLowerCase();
        parts.unshift(tag);
        cur = cur.parentElement;
      }
      return '/' + parts.join('/');
    })) as string;
    const byXp = (await page.evaluate(
      (s: string) => {
        const win = globalThis as any;
        const el = win.__ttResolve(s);
        return el ? el.id : null;
      },
      xp,
    )) as string | null;
    expect(byXp).toBe('a');
    const byCss = (await page.evaluate(
      (s: string) => {
        const win = globalThis as any;
        const el = win.__ttResolve(s);
        return el ? el.id : null;
      },
      '#a',
    )) as string | null;
    expect(byCss).toBe('a');
    await page.close();
  });

  it('shadow DOM：语义候选穿透，不产 css/xpath', async () => {
    const page = await newPage('');
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'host';
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<button data-testid="inner-btn">内部按钮</button>';
      document.body.appendChild(host);
    });
    const res = (await page.evaluate(() => {
      const win = globalThis as any;
      const host = document.querySelector('#host') as HTMLElement;
      const el = host.shadowRoot!.querySelector('[data-testid="inner-btn"]');
      return win.__ttAnalyze(el);
    })) as AnalyzeResult;
    const strategies = res.candidates.map((c) => c.strategy);
    expect(strategies).toContain('testid');
    expect(res.candidates[0]).toMatchObject({ strategy: 'testid', value: 'inner-btn' });
    expect(strategies).not.toContain('css'); // css/xpath 不跨 shadow
    expect(strategies).not.toContain('xpath');
    await page.close();
  });

  it('回归：antd select 的 aria-live 播报节点不混入 text 候选（曾翻倍为「XX」）', async () => {
    // 复现 antd（rc-select）交互后瞬态插入的隐藏播报节点：可见选中项与隐藏 aria-live 同文本，
    // 旧逻辑 textOf 用 textContent 会拼成「智能体平台智能体平台」，且仅存在于交互瞬间、回放必不命中。
    const page = await newPage(`
      <div role="dialog">
        <div class="ant-select ant-tree-select">
          <span aria-live="polite" style="width:0;height:0;position:absolute;overflow:hidden;opacity:0">智能体平台</span>
          <span class="ant-select-selection-item" title="智能体平台">智能体平台</span>
        </div>
        <label class="ant-checkbox-wrapper">智能体平台</label>
      </div>
    `);
    const r = await analyze(page, '.ant-tree-select');
    const textCands = r.candidates.filter((c) => c.strategy === 'text');
    // 每个 text 候选值都不应含翻倍文本
    expect(textCands.length).toBeGreaterThan(0);
    for (const c of textCands) {
      expect(c.value).toBe('智能体平台');
      expect(c.value).not.toMatch(/智能体平台智能体平台/);
    }
    // 计数用了原始 textOf（与 Playwright getByText 语义一致）：可见项 + 播报 + label 均含「智能体平台」→ 非唯一
    const textIdx = r.candidates.findIndex((c) => c.strategy === 'text');
    expect(r.counts[textIdx]).toBeGreaterThan(1);
    await page.close();
  });

  it('回归：antd select 的 aria-live 播报节点不混入快照元素 label / role 候选 name', async () => {
    const page = await newPage(`
      <div role="dialog">
        <button class="btn-x">智能体平台</button>
        <button class="btn-x"><span aria-live="polite" style="width:0;height:0;position:absolute;overflow:hidden;opacity:0">智能体平台</span>智能体平台</button>
      </div>
    `);
    // 第一个 button：正常可见文本
    const r1 = await analyze(page, '.btn-x:nth-of-type(1)');
    const t1 = r1.candidates.find((c) => c.strategy === 'text');
    expect(t1?.value).toBe('智能体平台');
    const name1 = r1.candidates.find((c) => c.strategy === 'role');
    expect(name1?.name).toBe('智能体平台');
    // 第二个 button：带隐藏播报节点，role name 与 text 候选都不应翻倍
    const r2 = await analyze(page, '.btn-x:nth-of-type(2)');
    const t2 = r2.candidates.find((c) => c.strategy === 'text');
    expect(t2?.value).toBe('智能体平台');
    expect(t2?.value).not.toMatch(/智能体平台智能体平台/);
    const name2 = r2.candidates.find((c) => c.strategy === 'role');
    expect(name2?.name).toBe('智能体平台');
    // 快照 label 同样清洁：__ttCollectInteractive 给可交互元素打的 label 不翻倍
    const snapshot = (await page.evaluate(() => (window as any).__ttCollectInteractive())) as string[];
    const btnLine = snapshot.find((l) => l.includes('btn-x')) ?? snapshot.find((l) => l.includes('button'));
    expect(btnLine).toBeTruthy();
    expect(btnLine).not.toMatch(/智能体平台智能体平台/);
    await page.close();
  });

  it('回归：选中项为可见文本时，text 候选被唯一性拒绝并落到稳定 css 候选', async () => {
    // antd select 根节点的 text 候选可见文本在弹窗内非唯一（可见项 + 播报 + 其他 label），
    // 应被 count>1 拒绝，回退到 computeCss 的结构路径，而非产出播报驱动的翻倍 text 定位器。
    const page = await newPage(`
      <div role="dialog">
        <div class="ant-select ant-tree-select" id="only">
          <span aria-live="polite" style="width:0;height:0;position:absolute;overflow:hidden;opacity:0">智能体平台</span>
          <span class="ant-select-selection-item" title="智能体平台">智能体平台</span>
        </div>
        <button>智能体平台</button>
      </div>
    `);
    const target = await page.evaluateHandle(() => document.querySelector('.ant-tree-select'));
    const res = await verifyCandidates(page, target, (await analyze(page, '.ant-tree-select')).candidates, { enableRecompute: true });
    const textTried = (res.tried ?? []).find((s) => s.startsWith('text='));
    if (textTried) expect(textTried).toContain('×'); // 非 ×1，说明唯一性被拒
    if (res.locator) {
      expect(res.locator.strategy).not.toBe('text');
      expect(res.locator.value).not.toMatch(/智能体平台智能体平台/);
    }
    await target.dispose().catch(() => {});
    await page.close();
  });
});

describe('快照采集：自定义点击卡片与 query 文本兜底', () => {
  it('div onClick 卡片纳入交互元素，query 快照可命中记录标题（cmtxyqp86 C9 回归）', async () => {
    const page = await newPage(`
      <button>新建互动事件</button>
      <div class="card" data-testid="event-card" onclick="void 0" style="cursor:pointer;padding:8px">
        <span>电话</span> 自动化测试互动事件1789192034362
      </div>
    `);
    const lines = (await page.evaluate(() => (window as any).__ttCollectInteractive())) as string[];
    const cardLine = lines.find((l) => l.includes('1789192034362'));
    expect(cardLine).toBeTruthy();
    const snap = (await page.evaluate(() => (window as any).__ttSnapshot({ scope: 'page', query: '1789192034362' }))) as any;
    expect(snap.total).toBeGreaterThan(0);
    await page.close();
  });

  it('cursor:pointer 的 div 采集；普通 div 与按钮内指针 span 不采集', async () => {
    const page = await newPage(`
      <div style="cursor:pointer">记录甲</div>
      <div>纯文本容器</div>
      <button style="cursor:pointer">按钮 <span style="cursor:pointer">内层文字</span></button>
    `);
    const lines = (await page.evaluate(() => (window as any).__ttCollectInteractive())) as string[];
    expect(lines.find((l) => l.includes('记录甲'))).toBeTruthy();
    expect(lines.find((l) => l.includes('纯文本容器'))).toBeFalsy();
    // 内层 span 落在原生交互元素内部，不重复占号；文本由 button 行承载
    expect(lines.filter((l) => l.includes('内层文字')).length).toBe(1);
    await page.close();
  });

  it('无可见文本的指针容器不占号', async () => {
    const page = await newPage('<div style="cursor:pointer;width:40px;height:40px;background:#eee"></div><button>保存</button>');
    const lines = (await page.evaluate(() => (window as any).__ttCollectInteractive())) as string[];
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('保存');
    await page.close();
  });

  it('query 快照：内容渲染在非交互容器时给文本兜底信号（queryTextHit/queryTextSnippet）', async () => {
    const page = await newPage('<div>列表内容：自动化测试互动事件999 摘要文本</div>');
    const hit = (await page.evaluate(() => (window as any).__ttSnapshot({ scope: 'page', query: '自动化测试互动事件999' }))) as any;
    expect(hit.total).toBe(0);
    expect(hit.queryTextHit).toBe(true);
    expect(hit.queryTextSnippet).toContain('自动化测试互动事件999');
    const miss = (await page.evaluate(() => (window as any).__ttSnapshot({ scope: 'page', query: '不存在关键词xyz' }))) as any;
    expect(miss.total).toBe(0);
    expect(miss.queryTextHit).toBe(false);
    await page.close();
  });

  it('observationText：0 命中时按文本兜底结果输出两种提示', async () => {
    const base = { version: 'd:1', documentId: 'd', url: 'u', lines: [], total: 0, allCount: 0, offset: 0, nextOffset: null, scope: 'page', values: {}, structure: '', pageText: '', alerts: [], context: '' };
    const hit = observationText({ ...base, queryTextHit: true, queryTextSnippet: '……自动化测试互动事件1789192034362……' } as any);
    expect(hit).toContain('文本兜底');
    expect(hit).toContain('1789192034362');
    const miss = observationText({ ...base, queryTextHit: false } as any);
    expect(miss).toContain('页面文本中也未找到');
    const normal = observationText({ ...base } as any);
    expect(normal).not.toContain('文本兜底');
    expect(normal).not.toContain('页面文本中也未找到');
  });
});

describe('locatorVerifier', () => {
  it('analyzeElement（Node 桥接）：给定 XPath 返回候选', async () => {
    const page = await newPage('<input data-testid="u" placeholder="用户名" />');
    const xp = (await page.evaluate(() => {
      let cur: any = document.querySelector('[data-testid="u"]');
      const parts: string[] = [];
      while (cur && cur.nodeType === 1) {
        parts.unshift(cur.tagName.toLowerCase());
        cur = cur.parentElement;
      }
      return '/' + parts.join('/');
    })) as string;
    const r = await analyzeElement(page, xp);
    expect(r).not.toBeNull();
    expect(r!.candidates[0]).toMatchObject({ strategy: 'testid', value: 'u' });
    await page.close();
  });

  it('verifyCandidates：count===1 且 isSameNode 才通过', async () => {
    const page = await newPage('<button data-testid="ok">保存</button>');
    const target = await page.evaluateHandle(() => document.querySelector('[data-testid="ok"]'));
    const r = await analyze(page, '[data-testid="ok"]');
    const res = await verifyCandidates(page, target, r.candidates, { enableRecompute: true });
    await target.dispose().catch(() => {});
    expect(res.locator).toMatchObject({ strategy: 'testid', value: 'ok' });
    await page.close();
  });

  it('verifyCandidates：重复候选被拒绝（count>1 不通过）', async () => {
    const page = await newPage('<div><button>保存</button><button>保存</button></div>');
    const target = await page.evaluateHandle(() => document.querySelector('div > button:nth-of-type(1)'));
    const r = await analyze(page, 'div > button:nth-of-type(1)');
    const res = await verifyCandidates(page, target, r.candidates, { enableRecompute: true });
    await target.dispose().catch(() => {});
    // role/text 都重复；但 computeCss 会产唯一 nth-of-type，故应命中唯一 css 候选
    expect(res.locator).toBeTruthy();
    expect(res.locator!.strategy).toBe('css');
    await page.close();
  });

  it('semanticizeLocator（stagehand/hybrid 模式）：唯一 testid 直接命中', async () => {
    const page = await newPage('<button data-testid="login-btn">登录</button>');
    const loc = await semanticizeLocator(page, '[data-testid="login-btn"]', { mode: 'stagehand' });
    expect(loc).toMatchObject({ strategy: 'testid', value: 'login-btn' });
    await page.close();
  });

  it('semanticizeLocator（playwright 精确模式）：getBy* 验证唯一 + 同节点', async () => {
    const page = await newPage('<button data-testid="ok">保存</button>');
    const loc = await semanticizeLocator(page, '[data-testid="ok"]', { mode: 'playwright' });
    expect(loc).toMatchObject({ strategy: 'testid', value: 'ok' });
    await page.close();
  });

  it('semanticizeLocator（playwright 精确模式）：多匹配的 role 被拒，落到唯一 css 候选', async () => {
    const page = await newPage('<div><button>保存</button><button>保存</button></div>');
    // 两个同名按钮：getByRole 多匹配被拒 → 落到 computeCss 算出的唯一结构路径
    const loc = await semanticizeLocator(page, 'div > button:nth-of-type(1)', { mode: 'playwright' });
    expect(loc.strategy).toBe('css');
    expect(loc.value).toContain('button:nth-of-type(1)');
    await page.close();
  });

  it('semanticizeLocator：解析不到元素回退原始选择器', async () => {
    const page = await newPage('<button>存在</button>');
    const loc = await semanticizeLocator(page, '#not-exist', { mode: 'stagehand' });
    expect(loc).toEqual({ strategy: 'css', value: '#not-exist' });
    const loc2 = await semanticizeLocator(page, '/html/body/div', { mode: 'stagehand' });
    expect(loc2).toEqual({ strategy: 'xpath', value: '/html/body/div' });
    await page.close();
  });

  it('buildLocatorFromCandidate：role 补全 + scope 附载', () => {
    const c = { strategy: 'role', role: 'button', name: '登录', scope: { strategy: 'role', value: 'dialog', role: 'dialog' } };
    const loc = buildLocatorFromCandidate(c as any);
    expect(loc).toEqual({
      strategy: 'role',
      value: 'button',
      role: 'button',
      name: '登录',
      scope: { strategy: 'role', value: 'dialog', role: 'dialog' },
    });
  });

  it('resolveQuery：各 strategy 映射为对应 Playwright 定位器', async () => {
    const page = await newPage(`
      <label for="n">用户名</label><input id="n" placeholder="请输入用户名" data-testid="u" title="提示" alt="" />
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="头像" />
    `);
    const queries: [QueryLike, string][] = [
      [{ strategy: 'testid', value: 'u' }, '[data-testid="u"]'],
      [{ strategy: 'placeholder', value: '请输入用户名' }, '[placeholder="请输入用户名"]'],
      [{ strategy: 'label', value: '用户名' }, 'input'],
      [{ strategy: 'title', value: '提示' }, '[title="提示"]'],
      [{ strategy: 'alt', value: '头像' }, 'img'],
    ];
    for (const [q, css] of queries) {
      expect(await resolveQuery(page, q).count()).toBeGreaterThanOrEqual(1);
      expect(await page.locator(css).count()).toBeGreaterThanOrEqual(1);
    }
    await page.close();
  });
});

describe('瞬态状态类与 label 包裹勾选控件（capture-after-mutation 回归）', () => {
  it('stripTransientStateCss：剔除 checked/selected/loading 与 element-plus is-* 交互态，保留稳定类', () => {
    // 实测案例：「选择«智能体平台»」步骤 css 编入 ant-checkbox-wrapper-checked，回放 0 命中自愈
    expect(
      stripTransientStateCss('label.ant-checkbox-wrapper.ant-checkbox-wrapper-checked.ant-checkbox-wrapper-in-form-item.css-var-default'),
    ).toBe('label.ant-checkbox-wrapper.ant-checkbox-wrapper-in-form-item.css-var-default');
    expect(stripTransientStateCss('li.ant-menu-item.ant-menu-item-selected')).toBe('li.ant-menu-item');
    expect(stripTransientStateCss('button.ant-btn.ant-btn-loading')).toBe('button.ant-btn');
    expect(stripTransientStateCss('label.el-checkbox.is-checked')).toBe('label.el-checkbox');
    expect(stripTransientStateCss('div.el-form-item.is-error')).toBe('div.el-form-item');
    expect(stripTransientStateCss('input.ant-input.ant-input-status-error')).toBe('input.ant-input');
    // 非 .class token（属性选择器）原样保留
    expect(stripTransientStateCss('label.ant-checkbox-wrapper.ant-checkbox-wrapper-checked[title="x"]')).toBe(
      'label.ant-checkbox-wrapper[title="x"]',
    );
  });

  it('label 包裹的 checkbox 包裹层：补 role 候选（内层 input），且为首个唯一候选', async () => {
    const page = await newPage(`
      <div role="dialog">
        <label class="ant-checkbox-wrapper"><input type="checkbox" /><span>智能体平台</span></label>
        <label class="ant-checkbox-wrapper"><input type="checkbox" /><span>普通用户</span></label>
      </div>
    `);
    const r = await analyze(page, '[role="dialog"] label.ant-checkbox-wrapper:first-of-type');
    // 修复前：包裹层 computeRole 为空、text 被祖先包含计数判重 → 只剩 css
    const roleIdx = r.candidates.findIndex((c) => c.strategy === 'role' && c.role === 'checkbox');
    expect(roleIdx).toBeGreaterThanOrEqual(0);
    expect(r.candidates[roleIdx]).toMatchObject({
      role: 'checkbox',
      name: '智能体平台',
      scope: { strategy: 'role', value: 'dialog' },
    });
    expect(r.counts[roleIdx]).toBe(1);
    expect(r.bestIndex).toBe(roleIdx);
    await page.close();
  });

  it('勾选后采集（动作后状态模拟）：role 候选不受影响、css 不编入 -checked；playwright 验证经 label 语义放行', async () => {
    const page = await newPage(`
      <div role="dialog">
        <label class="ant-checkbox-wrapper"><input type="checkbox" /><span>智能体平台</span></label>
        <label class="ant-checkbox-wrapper"><input type="checkbox" /><span>普通用户</span></label>
      </div>
    `);
    // 模拟 antd 点击后的状态类（框架行为：wrapper 追加 ant-checkbox-wrapper-checked）
    await page.evaluate(() => document.querySelector('[role="dialog"] label')!.classList.add('ant-checkbox-wrapper-checked'));
    const r = await analyze(page, '[role="dialog"] label.ant-checkbox-wrapper:first-of-type');
    const roleIdx = r.candidates.findIndex((c) => c.strategy === 'role' && c.role === 'checkbox');
    expect(roleIdx).toBeGreaterThanOrEqual(0);
    expect(r.counts[roleIdx]).toBe(1);
    const cssIdx = r.candidates.findIndex((c) => c.strategy === 'css');
    expect(cssIdx).toBeGreaterThanOrEqual(0);
    expect(r.candidates[cssIdx].value).not.toContain('checked');
    // playwright 精确验证：候选命中内层 input、target 是包裹层 label——同节点不符但点击语义等价，放行
    const target = await page.evaluateHandle(() => document.querySelector('[role="dialog"] label.ant-checkbox-wrapper'));
    const res = await verifyCandidates(page, target, r.candidates, { enableRecompute: true });
    await target.dispose().catch(() => {});
    expect(res.locator).toMatchObject({ strategy: 'role', role: 'checkbox', name: '智能体平台' });
    await page.close();
  });

  it('semanticizeLocator：noRawFallback 解析不到元素返回 undefined（动作前预采集判定用）', async () => {
    const page = await newPage('<button>存在</button>');
    expect(await semanticizeLocator(page, '#not-exist', { mode: 'playwright', noRawFallback: true })).toBeUndefined();
    expect(await semanticizeLocator(page, '#not-exist', { mode: 'playwright' })).toEqual({ strategy: 'css', value: '#not-exist' });
    await page.close();
  });
});

describe('runActionShell 动作前预采集（capture-before-mutation）', () => {
  it('click 落库定位器不含动作后的可访问名漂移（展开→收起）', async () => {
    const page = await newPage('<button data-tt-idx="1" id="b">展开</button>');
    await page.evaluate(() => {
      document.getElementById('b')!.addEventListener('click', () => {
        (document.getElementById('b') as HTMLElement).textContent = '收起';
      });
    });
    const emitted: any[] = [];
    const ctx: any = {
      jobId: 't',
      page,
      stagehand: {},
      pwPage: page,
      client: {},
      model: 't',
      xpathMap: {},
      sub: (t: any) => t ?? undefined,
      envMap: {},
      emit: async (s: any) => {
        emitted.push(s);
        return { index: emitted.length };
      },
      onTool: () => {},
      note: () => {},
      stepCount: () => emitted.length,
      usageKey: 't',
      modelVision: false,
      pluginActions: [],
      network: {},
    };
    const clickTool = buildGenTools(ctx).find((t) => t.name === 'click')!;
    const res = await clickTool.execute({ selector: '1', instruction: '点击展开' });
    expect(res).toMatchObject({ status: 'success', recordedStep: 1 });
    expect(typeof res === 'object' ? res.text : res).toContain('点击已执行');
    expect(emitted).toHaveLength(1);
    // 修复前：语义化在点击后执行，采到动作后的可访问名「收起」，回放初始态必不命中
    expect(emitted[0].locator).toMatchObject({ strategy: 'role', role: 'button', name: '展开' });
    expect(JSON.stringify(emitted[0].locator)).not.toContain('收起');
    await page.close();
  });
});
