/// <reference lib="dom" />
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { executeScroll } from '../src/services/scrollExecution';
import { captureObservation, stateFingerprint } from '../src/services/browserObservation';
import { buildGenTools, type GenToolContext } from '../src/services/generationToolHost';
import { resolveQuery } from '../src/services/locatorVerifier';
import { scrollSchema, testStepSchema, type TestStep } from '../src/shared/testScript';
import { evidenceSignature } from '../src/services/generation/intentCoverage';
import { stuckSig } from '../src/services/toolLoop';
let browser: Browser, page: Page;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });
beforeEach(async () => { page = await browser.newPage({ viewport: { width: 800, height: 600 } }); });
afterEach(async () => { await page.close(); });
const fixture = `<div id="outer" style="height:220px;width:400px;overflow:auto" aria-label="外层">
<div id="inner" style="height:140px;width:250px;overflow:auto" aria-label="客户列表">
<div style="height:1000px;width:1200px"><span>客户</span><button id="target" style="margin-top:850px">最后一项</button></div></div>
<div style="height:600px"></div></div><div style="height:1800px"></div>`;
function host() {
  const steps: TestStep[] = [];
  const ctx = { jobId: 'scroll-test', page, pwPage: page, pluginActions: [], modelVision: false, envMap: {}, sub: (s: any) => s,
    stepCount: () => steps.length, emit: async (s: TestStep) => { steps.push(s); return { index: steps.length }; } } as unknown as GenToolContext;
  const tools = buildGenTools(ctx);
  return { ctx, steps, get: (name: string) => tools.find(t => t.name === name)! };
}
it('scrolls the page, refreshes version and fingerprint, stops at current end', async () => {
  await page.setContent(fixture);
  const before = await captureObservation(page);
  const result = await executeScroll(page, undefined, { target: 'page', mode: 'by', distance: 500 });
  expect(result.moved).toBe(true);
  expect(result.after[0].top).toBe(500);
  const after = await captureObservation(page);
  expect(after.version).not.toBe(before.version);
  expect(stateFingerprint(after)).not.toBe(stateFingerprint(before));
  expect(await page.locator('#inner').evaluate(el => el.scrollTop)).toBe(0);
  expect((await executeScroll(page, undefined, { target: 'page', mode: 'toEnd' })).atEnd).toBe(true);
  const end = await executeScroll(page, undefined, { target: 'page', mode: 'toEnd' });
  expect(end.moved).toBe(false);
  expect(end.atEnd).toBe(true);
  expect((await executeScroll(page, undefined, { target: 'page', mode: 'toStart' })).atStart).toBe(true);
});
it('discovers nested scroll containers, generates stable steps and replays horizontally', async () => {
  await page.setContent(fixture);
  const { get, steps } = host();
  const snapshot: any = await get('snapshot').execute({ scope: 'page' });
  expect(snapshot.text).toContain('scrollable=xy');
  const selector = await page.locator('#inner').getAttribute('data-tt-idx');
  const result: any = await get('scroll').execute({ selector, target: 'container', mode: 'by', axis: 'x', distance: 300, instruction: '向右滚动客户列表' });
  expect(result.progressed).toBe(true);
  expect(result.observation).toContain('scrollLeft=300');
  expect(steps).toHaveLength(1);
  const step = testStepSchema.parse(JSON.parse(JSON.stringify(steps[0])));
  expect(step.locator?.value).not.toContain('data-tt-idx');
  await page.setContent(fixture);
  const root = step.locator?.scope ? resolveQuery(page, step.locator.scope) : page;
  await executeScroll(page, resolveQuery(root, step.locator!), step.scroll!);
  expect(await page.locator('#inner').evaluate(el => el.scrollLeft)).toBe(300);
  expect(await page.locator('#outer').evaluate(el => el.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
it('scrolls an already mounted element into view through ancestors', async () => {
  await page.setContent(fixture);
  const result = await executeScroll(page, page.locator('#target'), { target: 'element', mode: 'intoView' });
  expect(result.moved).toBe(true);
  const visible = await page.locator('#target').evaluate(el => { const r = el.getBoundingClientRect(); const c = document.getElementById('inner')!.getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom; });
  expect(visible).toBe(true);
});
it('observes virtualized contents after a bounded scroll', async () => {
  await page.setContent('<div id="list" aria-label="虚拟列表" style="height:160px;overflow:auto"><div style="height:2000px;position:relative"><button id="row" style="position:absolute">记录 0</button></div></div>');
  await page.locator('#list').evaluate(el => el.addEventListener('scroll', () => { const row = document.getElementById('row')!; row.textContent = '记录 ' + Math.floor(el.scrollTop / 40); row.style.top = el.scrollTop + 'px'; }));
  const { get } = host();
  const result: any = await get('scroll').execute({ target: 'container', selector: '#list', mode: 'by', distance: 400, instruction: '向下查找记录' });
  expect(result.progressed).toBe(true);
  expect(result.observation).toContain('记录 10');
});
it('rejects stale snapshots, invalid targets and cancelled actions without recording', async () => {
  await page.setContent(fixture);
  const { ctx, get, steps } = host();
  await get('snapshot').execute({});
  const old = ctx.snapshotVersion;
  await executeScroll(page, undefined, { target: 'page', mode: 'by', distance: 100 });
  await expect(get('scroll').execute({ target: 'page', mode: 'by', distance: 100, instruction: '滚动', snapshotVersion: old })).rejects.toThrow('过期');
  await expect(executeScroll(page, page.locator('#target'), { target: 'container', mode: 'by', distance: 100 })).rejects.toThrow('滚动容器');
  await expect(executeScroll(page, undefined, { target: 'page', mode: 'by', distance: 100 }, AbortSignal.abort(new Error('cancelled')))).rejects.toThrow('cancelled');
  expect(steps).toHaveLength(0);
});
it('validates mode combinations and invalidates evidence when distance changes', () => {
  expect(scrollSchema.safeParse({ target: 'page', mode: 'intoView' }).success).toBe(false);
  expect(scrollSchema.safeParse({ target: 'page', mode: 'by', distance: 0 }).success).toBe(false);
  expect(scrollSchema.safeParse({ target: 'page', mode: 'by', distance: 10001 }).success).toBe(false);
  expect(testStepSchema.safeParse({ action: 'scroll', scroll: { target: 'container', mode: 'toEnd' } }).success).toBe(false);
  const criterion: any = { id: 'C1', assertion: { type: 'text', expected: 'done' } };
  const steps: TestStep[] = [{ kind: 'action', action: 'scroll', scroll: { target: 'page', mode: 'by', distance: 100 } }, { kind: 'assert', action: 'assert', criterionId: 'C1', assertion: criterion.assertion }];
  const before = evidenceSignature(steps, 1, criterion);
  steps[0].scroll!.distance = 200;
  expect(evidenceSignature(steps, 1, criterion)).not.toBe(before);
  expect(stuckSig('scroll', { target: 'page', mode: 'by', distance: 100 })).not.toBe(stuckSig('scroll', { target: 'page', mode: 'by', distance: -100 }));
});
it('reports no progress when repeated scrolling is at a boundary', async () => {
  await page.setContent(fixture);
  const { get } = host();
  const args = { target: 'container', selector: '#inner', mode: 'toEnd', instruction: '滚动到底' };
  await get('scroll').execute(args);
  const result: any = await get('scroll').execute(args);
  expect(result.progressed).toBe(false);
  expect(result.text).toContain('位置未变化');
});
it('records a completed scroll when its container is removed by the scroll handler', async () => {
  await page.setContent('<div id="list" style="height:100px;overflow:auto"><div style="height:1000px"></div></div>');
  await page.locator('#list').evaluate(el => el.addEventListener('scroll', () => el.remove(), { once: true }));
  const { get, steps } = host();
  const result: any = await get('scroll').execute({ target: 'container', selector: '#list', mode: 'by', distance: 200, instruction: '滚动列表' });
  expect(result.status).toBe('success');
  expect(steps).toHaveLength(1);
  expect(result.text).toContain('已记录');
});
it('supports RTL horizontal start/end without modifying the outer page', async () => {
  await page.setContent('<div id="rtl" dir="rtl" style="overflow:auto;width:200px"><div style="width:1000px;height:50px"></div></div>');
  const end = await executeScroll(page, page.locator('#rtl'), { target: 'container', mode: 'toEnd', axis: 'x' });
  expect(end.atEnd).toBe(true);
  expect(end.after[0].left).toBe(-800);
  expect((await executeScroll(page, page.locator('#rtl'), { target: 'container', mode: 'toStart', axis: 'x' })).atStart).toBe(true);
});
