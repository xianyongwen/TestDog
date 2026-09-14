import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import * as config from '../src/config';
import { saveTestFile, deleteTestFile, loadTestFiles } from '../src/services/testFileService';
import { cleanupTestFiles, installTestFileCleanup, TEST_FILE_GRACE_MS, TEST_FILE_CLEANUP_INTERVAL_MS } from '../src/services/testFileCleanup';
import { withTestFileActivity } from '../src/services/testFileActivity';

const database = vi.hoisted(() => ({ project: { findMany: vi.fn() }, testScript: { findMany: vi.fn() }, generationLog: { findMany: vi.fn() } }));
const memory = vi.hoisted(() => vi.fn());
vi.mock('../src/db', () => ({ prisma: database }));
vi.mock('../src/services/generation/checkpoint', () => ({ testFileCheckpointReferences: memory }));

let root: string;
let now: number;
const step = (id: string) => ({ action: 'upload', upload: { fileIds: [id] } });
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'file-cleanup-'));
  now = Date.now() + 1000;
  vi.spyOn(config, 'getScreenshotDir').mockReturnValue(path.join(root, 'screenshots'));
  database.project.findMany.mockResolvedValue([{ id: 'project' }]);
  database.testScript.findMany.mockResolvedValue([]);
  database.generationLog.findMany.mockResolvedValue([]);
  memory.mockReturnValue([]);
});
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); await rm(root, { recursive: true, force: true }); });
const files = () => readdir(path.join(root, 'test-files'));
const save = () => saveTestFile('project', 'test.csv', 'text/csv', Buffer.from('original'));

it('keeps project library files and all saved script versions', async () => {
  const library = await save();
  const referenced = await save();
  await deleteTestFile('project', referenced.id);
  database.testScript.findMany.mockResolvedValue([{ steps: [step(referenced.id)] }]);
  expect((await cleanupTestFiles(now))?.marked).toBe(0);
  expect((await cleanupTestFiles(now + 2 * TEST_FILE_GRACE_MS))?.removed).toBe(0);
  expect(await loadTestFiles('project', [library.id, referenced.id])).toHaveLength(2);
});

it('requires a full grace period and removes the original, metadata and markers', async () => {
  const file = await save();
  await deleteTestFile('project', file.id);
  expect((await cleanupTestFiles(now))?.marked).toBe(1);
  expect((await cleanupTestFiles(now + TEST_FILE_GRACE_MS - 1))?.removed).toBe(0);
  const result = await cleanupTestFiles(now + TEST_FILE_GRACE_MS + 1);
  expect(result?.removed).toBe(1);
  expect(result!.bytes).toBeGreaterThan(0);
  expect(await files()).toEqual([]);
});

it('cleans deleted projects and incomplete writes but preserves unrelated files and symlinks', async () => {
  const deletedProject = await save();
  database.project.findMany.mockResolvedValue([]);
  const fragmentId = randomUUID();
  await writeFile(path.join(root, 'test-files', fragmentId + '.bin'), 'partial');
  await writeFile(path.join(root, 'test-files', 'notes.txt'), 'keep');
  const outside = path.join(root, 'outside');
  await writeFile(outside, 'keep');
  const linkName = randomUUID() + '.bin';
  await symlink(outside, path.join(root, 'test-files', linkName));
  expect((await cleanupTestFiles(now))?.marked).toBe(2);
  expect((await cleanupTestFiles(now + TEST_FILE_GRACE_MS + 1))?.removed).toBe(2);
  expect(await files()).not.toContain(deletedProject.id + '.json');
  expect(await files()).toEqual(expect.arrayContaining(['notes.txt', linkName]));
  expect(await readFile(outside, 'utf8')).toBe('keep');
});

it('protects persisted and memory checkpoints, final generated scripts and pending tool arguments', async () => {
  const protectedFiles = await Promise.all([save(), save(), save(), save()]);
  for (const file of protectedFiles) await deleteTestFile('project', file.id);
  database.generationLog.findMany.mockResolvedValue([
    { loopState: { steps: [step(protectedFiles[0].id)] } },
    { scriptSteps: [step(protectedFiles[1].id)] },
    { loopState: { messages: [{ function: { arguments: JSON.stringify({ fileIds: [protectedFiles[2].id] }) } }] } },
  ]);
  memory.mockReturnValue([{ steps: [step(protectedFiles[3].id)] }]);
  expect((await cleanupTestFiles(now))?.marked).toBe(0);
});

it('restarts the grace period after a file becomes referenced again', async () => {
  const file = await save();
  await deleteTestFile('project', file.id);
  await cleanupTestFiles(now);
  database.testScript.findMany.mockResolvedValue([{ steps: [step(file.id)] }]);
  await cleanupTestFiles(now + TEST_FILE_GRACE_MS);
  expect(await files()).not.toContain(file.id + '.orphan');
  database.testScript.findMany.mockResolvedValue([]);
  expect((await cleanupTestFiles(now + 2 * TEST_FILE_GRACE_MS))?.marked).toBe(1);
  expect((await cleanupTestFiles(now + 2 * TEST_FILE_GRACE_MS + 1))?.removed).toBe(0);
});

it('does not interpret database failures or corrupt metadata as absence of references', async () => {
  const file = await save();
  await deleteTestFile('project', file.id);
  await cleanupTestFiles(now);
  database.testScript.findMany.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(cleanupTestFiles(now + 2 * TEST_FILE_GRACE_MS)).rejects.toThrow('database unavailable');
  expect(await files()).toContain(file.id + '.bin');
  await writeFile(path.join(root, 'test-files', file.id + '.json'), '{broken');
  const result = await cleanupTestFiles(now + 2 * TEST_FILE_GRACE_MS);
  expect(result?.removed).toBe(0);
  expect(result?.errors).toHaveLength(1);
});

it('skips cleanup during active operations, then allows a later sweep', async () => {
  const file = await save();
  await deleteTestFile('project', file.id);
  await withTestFileActivity(async () => { expect(await cleanupTestFiles(now)).toBeNull(); });
  expect((await cleanupTestFiles(now))?.marked).toBe(1);
});

it('queues new file operations until an exclusive sweep completes', async () => {
  await save();
  let finishQuery!: (value: { id: string }[]) => void;
  let queryStarted!: () => void;
  const started = new Promise<void>(resolve => { queryStarted = resolve; });
  database.project.findMany.mockImplementationOnce(() => { queryStarted(); return new Promise(resolve => { finishQuery = resolve; }); });
  const sweep = cleanupTestFiles(now);
  await started;
  let written = false;
  const pending = save().then(() => { written = true; });
  await Promise.resolve();
  expect(written).toBe(false);
  expect(await cleanupTestFiles(now)).toBeNull();
  finishQuery([{ id: 'project' }]);
  await sweep;
  await pending;
  expect(written).toBe(true);
});

it('runs at startup and hourly, protects requests and stops its timer on close', async () => {
  const file = await save();
  await deleteTestFile('project', file.id);
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(now);
  const app = Fastify();
  installTestFileCleanup(app);
  app.get('/busy', async () => ({ cleanup: await cleanupTestFiles() }));
  try {
    await app.ready();
    await withTestFileActivity(async () => {});
    expect(await files()).toContain(file.id + '.orphan');
    const response = await app.inject('/busy');
    expect(response.json()).toEqual({ cleanup: null });
    vi.setSystemTime(now + TEST_FILE_GRACE_MS + 1);
    await vi.advanceTimersByTimeAsync(TEST_FILE_CLEANUP_INTERVAL_MS);
    await withTestFileActivity(async () => {});
    expect(await files()).toEqual([]);
  } finally { await app.close(); }
  expect(vi.getTimerCount()).toBe(0);
});
