import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import * as config from '../src/config';
import { saveTestFile, deleteTestFile, loadTestFiles, listTestFiles } from '../src/services/testFileService';
import { exportTestcasePackage, importTestcasePackage } from '../src/services/testcasePackage';
import type { TestStep } from '../src/shared/testScript';

const database = vi.hoisted(() => ({ project: { findUnique: vi.fn() }, $transaction: vi.fn() }));
vi.mock('../src/db', () => ({ prisma: database }));
vi.mock('../src/routes/runs', () => ({ cleanupScreenshots: vi.fn() }));
import testCaseRoutes from '../src/routes/testCases';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'testcase-package-'));
  vi.spyOn(config, 'getScreenshotDir').mockReturnValue(path.join(directory, 'screenshots'));
  database.project.findUnique.mockResolvedValue({ id: 'target' });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await rm(directory, { recursive: true, force: true });
});

function uploadStep(ids: string[]): TestStep {
  return { kind: 'action', action: 'upload', locator: { strategy: 'css', value: '#file' }, upload: { mode: 'input', fileIds: ids } };
}
async function example() {
  const file = await saveTestFile('source', '客户.csv', 'text/csv', Buffer.from('客户\n张三'));
  return exportTestcasePackage('source', { title: '导入客户', steps: [uploadStep([file.id])] });
}

it('deduplicates references, includes removed originals and remaps IDs across projects', async () => {
  const first = await saveTestFile('source', 'same.csv', 'text/csv', Buffer.from('first'));
  const second = await saveTestFile('source', 'same.csv', 'text/csv', Buffer.from('second'));
  await saveTestFile('source', 'unused.csv', 'text/csv', Buffer.from('unused'));
  await deleteTestFile('source', first.id);
  const packaged = await exportTestcasePackage('source', { title: '用例', steps: [uploadStep([first.id, second.id]), uploadStep([first.id])] });
  expect(packaged.version).toBe(2);
  expect(packaged.files).toHaveLength(2);
  const imported = await importTestcasePackage('target', JSON.parse(JSON.stringify(packaged)), async payload => payload);
  const ids = imported.steps[0].upload!.fileIds;
  expect(ids).not.toContain(first.id);
  expect(ids).not.toContain(second.id);
  expect(imported.steps[1].upload!.fileIds).toEqual([ids[0]]);
  expect((await loadTestFiles('target', ids)).map(file => file.buffer.toString())).toEqual(['first', 'second']);
  expect(imported.files).toBeUndefined();
  const exportedAgain = await exportTestcasePackage('target', imported);
  expect(exportedAgain.files?.map(file => file.sha256)).toEqual(packaged.files?.map(file => file.sha256));
});

it('accepts legacy packages without uploads and rejects unsupported versions', async () => {
  const payload = { title: '旧用例', steps: [{ kind: 'navigate', action: 'goto', url: 'https://example.test' }] };
  await expect(importTestcasePackage('target', payload, async parsed => parsed.title)).resolves.toBe('旧用例');
  expect((await exportTestcasePackage('source', payload)).version).toBe(1);
  await expect(importTestcasePackage('target', { ...payload, version: 3 }, async parsed => parsed)).rejects.toThrow();
});

it('rejects missing files and cross-project export', async () => {
  const packaged = await example();
  await expect(exportTestcasePackage('other', packaged)).rejects.toThrow('缺失、损坏或不属于');
  await expect(exportTestcasePackage('source', { title: 'missing', steps: [uploadStep(['missing'])] })).rejects.toThrow('导出失败');
  await expect(importTestcasePackage('target', { ...packaged, files: undefined }, async parsed => parsed)).rejects.toThrow('缺少上传文件');
});

it.each(['hash', 'size', 'base64', 'duplicate', 'unreferenced'] as const)('rejects %s before persisting any files', async corruption => {
  const packaged = await example();
  const file = packaged.files![0];
  if (corruption === 'hash') file.sha256 = '0'.repeat(64);
  if (corruption === 'size') file.size += 1;
  if (corruption === 'base64') file.data = '!'.repeat(file.data.length);
  if (corruption === 'duplicate') packaged.files!.push({ ...file });
  if (corruption === 'unreferenced') packaged.files!.push({ ...file, id: 'unused' });
  const persist = vi.fn();
  await expect(importTestcasePackage('target', packaged, persist)).rejects.toThrow();
  expect(persist).not.toHaveBeenCalled();
  expect(await listTestFiles('target')).toEqual([]);
});

it('cleans up imported originals if the database transaction fails', async () => {
  const packaged = await example();
  const before = await readdir(path.join(directory, 'test-files'));
  await expect(importTestcasePackage('target', packaged, async () => { throw new Error('database failed'); })).rejects.toThrow('database failed');
  expect(await readdir(path.join(directory, 'test-files'))).toEqual(before);
  expect((await loadTestFiles('source', [packaged.files![0].id]))[0].buffer.toString()).toBe('客户\n张三');
});

it('imports a package larger than the default JSON limit through the real HTTP route', async () => {
  const app = Fastify();
  await app.register(testCaseRoutes);
  try {
    const file = await saveTestFile('source', 'large.bin', 'application/octet-stream', Buffer.alloc(1024 * 1024, 7));
    const exported = await app.inject({ method: 'POST', url: '/api/projects/source/test-cases/export', payload: { title: 'large', steps: [uploadStep([file.id])] } });
    expect(exported.statusCode).toBe(200);
    expect(exported.body.length).toBeGreaterThan(1024 * 1024);
    const saveScript = vi.fn().mockResolvedValue({});
    database.$transaction.mockImplementation(async callback => callback({ testCase: { create: async () => ({ id: 'case' }) }, testScript: { create: saveScript } }));
    const imported = await app.inject({ method: 'POST', url: '/api/projects/target/test-cases/import', payload: exported.json() });
    expect(imported.statusCode).toBe(200);
    const ids = saveScript.mock.calls[0][0].data.steps[0].upload.fileIds;
    expect(ids).not.toEqual([file.id]);
    expect((await loadTestFiles('target', ids))[0].buffer).toEqual(Buffer.alloc(1024 * 1024, 7));
  } finally { await app.close(); }
});
