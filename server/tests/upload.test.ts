/// <reference lib="dom" />
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as config from '../src/config';
import { saveTestFile, loadTestFiles, listTestFiles } from '../src/services/testFileService';
import { executeUpload } from '../src/services/uploadExecution';
import { buildGenTools, type GenToolContext } from '../src/services/generationToolHost';
import { resolveQuery } from '../src/services/locatorVerifier';
import { testStepSchema, type TestStep } from '../src/shared/testScript';
import { evidenceSignature } from '../src/services/generation/intentCoverage';
import { captureObservation } from '../src/services/browserObservation';

let browser: Browser, page: Page, dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'test-upload-'));
  vi.spyOn(config, 'getScreenshotDir').mockReturnValue(path.join(dir, 'screenshots'));
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); vi.restoreAllMocks(); await rm(dir, { recursive: true, force: true }); });
beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page.close(); });
const fixture = '<label for="file">导入文件</label><input id="file" type="file" multiple accept=".csv" hidden><button onclick="document.getElementById(\'file\').click()">上传文件</button><output id="result"></output><script>document.getElementById("file").onchange = e => document.getElementById("result").textContent = Array.from(e.target.files).map(f => f.name).join(",")</script>';

it('preserves originals and differentiates same names; rejects cross-project and corrupted files', async () => {
  const a = await saveTestFile('p', 'a.csv', 'text/csv', Buffer.from('original'));
  const b = await saveTestFile('p', 'a.csv', 'text/csv', Buffer.from('different'));
  expect(a.id).not.toBe(b.id);
  expect((await loadTestFiles('p', [a.id]))[0].buffer.toString()).toBe('original');
  expect((await listTestFiles('other')).length).toBe(0);
  await expect(loadTestFiles('other', [a.id])).rejects.toThrow('不属于');
  await expect(loadTestFiles('p', ['../../secret'])).rejects.toThrow('无效');
  await writeFile(path.join(dir, 'test-files', a.id + '.bin'), 'changed');
  await expect(loadTestFiles('p', [a.id])).rejects.toThrow('校验失败');
});

it.each(['input', 'chooser'] as const)('generates and replays %s uploads with stable locators and multiple originals', async mode => {
  const a = await saveTestFile('p', '客户.csv', 'text/csv', Buffer.from('name\n张三'));
  const b = await saveTestFile('p', 'other.csv', 'text/csv', Buffer.from('name\n李四'));
  await page.setContent(fixture);
  const steps: TestStep[] = [];
  const ctx = { jobId: 'upload-test', projectId: 'p', pwPage: page, page, pluginActions: [], modelVision: false, envMap: {}, sub: (s: any) => s, stepCount: () => steps.length, emit: async (s: TestStep) => { steps.push(s); return { index: steps.length }; } } as unknown as GenToolContext;
  const tools = buildGenTools(ctx);
  const snapshot = await captureObservation(page, { scope: 'page' });
  expect(snapshot.lines.join('\n')).toContain('type=file');
  expect(snapshot.lines.join('\n')).toContain('accept=.csv');
  const selector = mode === 'input' ? '#file' : 'button';
  const result: any = await tools.find(t => t.name === 'upload')!.execute({ selector, mode, fileIds: [a.id, b.id], instruction: '上传客户文件' });
  expect(result.status).toBe('success');
  expect(steps).toHaveLength(1);
  expect(testStepSchema.parse(steps[0]).upload?.fileIds).toEqual([a.id, b.id]);
  expect(result.text).toContain('请断言');
  await page.setContent(fixture);
  const step = JSON.parse(JSON.stringify(steps[0])) as TestStep;
  const root = step.locator!.scope ? resolveQuery(page, step.locator!.scope) : page;
  await executeUpload(page, resolveQuery(root, step.locator!), step.upload!, 'p');
  expect(await page.locator('#result').innerText()).toBe('客户.csv,other.csv');
  expect(await page.locator('#file').evaluate(async (el: any) => await el.files[0].text())).toBe('name\n张三');
});

it('rejects missing resources before clicking and never leaves a chooser listener after click failure', async () => {
  await page.setContent(fixture);
  const click = vi.fn();
  await expect(executeUpload(page, { click } as any, { mode: 'chooser', fileIds: ['bad'] }, 'p')).rejects.toThrow();
  expect(click).not.toHaveBeenCalled();
  const file = await saveTestFile('p', 'a.txt', 'text/plain', Buffer.from('x'));
  const listeners = (page as unknown as { listenerCount(event: string): number }).listenerCount('filechooser');
  await expect(executeUpload(page, { click: async () => { throw new Error('blocked'); } } as any, { mode: 'chooser', fileIds: [file.id] }, 'p')).rejects.toThrow('blocked');
  expect((page as unknown as { listenerCount(event: string): number }).listenerCount('filechooser')).toBe(listeners);
});

it('rejects multiple files for single input and invalid upload schema', async () => {
  await page.setContent('<input type="file">');
  const a = await saveTestFile('p', 'a', '', Buffer.from('a'));
  const b = await saveTestFile('p', 'b', '', Buffer.from('b'));
  await expect(executeUpload(page, page.locator('input'), { mode: 'input', fileIds: [a.id, b.id] }, 'p')).rejects.toThrow('不支持多文件');
  expect(testStepSchema.safeParse({ action: 'upload' }).success).toBe(false);
});

it('changing upload files invalidates previous acceptance evidence', () => {
  const criterion: any = { id: 'C1', assertion: { type: 'text', expected: 'done' } };
  const steps: TestStep[] = [{ kind: 'action', action: 'upload', upload: { mode: 'input', fileIds: ['a'] } }, { kind: 'assert', action: 'assert', criterionId: 'C1', assertion: criterion.assertion }];
  const before = evidenceSignature(steps, 1, criterion);
  steps[0].upload!.fileIds = ['b'];
  expect(evidenceSignature(steps, 1, criterion)).not.toBe(before);
});

it('disabled inputs and cancelled uploads do not select files', async () => {
  await page.setContent('<input type="file" disabled>');
  const a = await saveTestFile('p', 'a.csv', 'text/csv', Buffer.from('a'));
  const upload = { mode: 'input' as const, fileIds: [a.id] };
  await expect(executeUpload(page, page.locator('input'), upload, 'p')).rejects.toThrow('禁用');
  await page.locator('input').evaluate((el: any) => { el.disabled = false; });
  const signal = AbortSignal.abort(new Error('cancelled'));
  await expect(executeUpload(page, page.locator('input'), upload, 'p', signal)).rejects.toThrow('cancelled');
  expect(await page.locator('input').evaluate((el: any) => el.files.length)).toBe(0);
});
