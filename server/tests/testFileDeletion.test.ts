import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as config from '../src/config';
import { deleteTestFile, listTestFiles, loadTestFiles, saveTestFile } from '../src/services/testFileService';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'file-deletion-'));
  vi.spyOn(config, 'getScreenshotDir').mockReturnValue(path.join(dir, 'screenshots'));
});
afterEach(async () => { vi.restoreAllMocks(); await rm(dir, { recursive: true, force: true }); });

it('removes only the requested file from the library and retains replay bytes', async () => {
  const first = await saveTestFile('p', 'same.csv', 'text/csv', Buffer.from('first'));
  const second = await saveTestFile('p', 'same.csv', 'text/csv', Buffer.from('second'));
  await deleteTestFile('p', first.id);
  await deleteTestFile('p', first.id);
  expect((await listTestFiles('p')).map(f => f.id)).toEqual([second.id]);
  expect((await loadTestFiles('p', [first.id]))[0].buffer.toString()).toBe('first');
});

it('rejects cross-project deletion and invalid IDs without changing the library', async () => {
  const file = await saveTestFile('p', 'a.csv', 'text/csv', Buffer.from('a'));
  await expect(deleteTestFile('other', file.id)).rejects.toThrow('不属于');
  await expect(deleteTestFile('p', '../outside')).rejects.toThrow('无效');
  expect((await listTestFiles('p')).map(f => f.id)).toEqual([file.id]);
});
