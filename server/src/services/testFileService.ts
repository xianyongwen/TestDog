import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getScreenshotDir } from '../config';
import { withTestFileActivity } from './testFileActivity';

export const TEST_FILE_MAX = 20 * 1024 * 1024;
export interface TestFile { id: string; projectId: string; name: string; mime: string; size: number; sha256: string }
const directory = () => path.join(path.dirname(getScreenshotDir()), 'test-files');
const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const validId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

/** Immutable originals, independent of temporary prompt attachments. No TTL or overwrite. */
export const saveTestFile: typeof saveTestFileImpl = (...args) => withTestFileActivity(() => saveTestFileImpl(...args));
export const listTestFiles: typeof listTestFilesImpl = (...args) => withTestFileActivity(() => listTestFilesImpl(...args));
export const deleteTestFile: typeof deleteTestFileImpl = (...args) => withTestFileActivity(() => deleteTestFileImpl(...args));
export const discardImportedTestFile: typeof discardImportedTestFileImpl = (...args) => withTestFileActivity(() => discardImportedTestFileImpl(...args));
export const loadTestFiles: typeof loadTestFilesImpl = (...args) => withTestFileActivity(() => loadTestFilesImpl(...args));

async function saveTestFileImpl(projectId: string, name: string, mime: string, buffer: Buffer): Promise<TestFile> {
  if (!projectId || buffer.length > TEST_FILE_MAX) throw new Error('项目缺失或文件超过 20MB');
  const file: TestFile = { id: randomUUID(), projectId, name: path.basename(name.replace(/\\/g, '/')), mime: mime || 'application/octet-stream', size: buffer.length, sha256: hash(buffer) };
  await fs.mkdir(directory(), { recursive: true });
  await fs.writeFile(path.join(directory(), file.id + '.bin'), buffer, { flag: 'wx' });
  try { await fs.writeFile(path.join(directory(), file.id + '.json'), JSON.stringify(file), { flag: 'wx' }); }
  catch (e) { await fs.rm(path.join(directory(), file.id + '.bin'), { force: true }); throw e; }
  return file;
}
async function listTestFilesImpl(projectId: string): Promise<TestFile[]> {
  if (!projectId) return [];
  const entries = await fs.readdir(directory()).catch((e) => { if (e.code === 'ENOENT') return []; throw e; });
  const files: TestFile[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json') || !validId(entry.slice(0, -5))) continue;
    const file: TestFile = JSON.parse(await fs.readFile(path.join(directory(), entry), 'utf8'));
    const deleted = await fs.access(path.join(directory(), file.id + '.deleted')).then(() => true, () => false);
    if (file.projectId === projectId && !deleted) files.push(file);
  }
  return files;
}
/** Remove from the selectable library; immutable originals remain available to saved scripts. */
async function deleteTestFileImpl(projectId: string, id: string): Promise<void> {
  if (!projectId || !validId(id)) throw new Error('无效测试文件 ID');
  const file: TestFile = JSON.parse(await fs.readFile(path.join(directory(), id + '.json'), 'utf8'));
  if (file.projectId !== projectId || file.id !== id) throw new Error('测试文件不属于当前项目');
  await fs.writeFile(path.join(directory(), id + '.deleted'), '');
}
async function discardImportedTestFileImpl(projectId: string, id: string): Promise<void> {
  if (!projectId || !validId(id)) throw new Error('无效测试文件 ID');
  const file: TestFile = JSON.parse(await fs.readFile(path.join(directory(), id + '.json'), 'utf8'));
  if (file.projectId !== projectId || file.id !== id) throw new Error('测试文件不属于当前项目');
  await fs.rm(path.join(directory(), id + '.bin'), { force: true });
  await fs.rm(path.join(directory(), id + '.json'), { force: true });
}
async function loadTestFilesImpl(projectId: string | null | undefined, ids: string[]) {
  if (!projectId || !ids.length || ids.length > 5 || new Set(ids).size !== ids.length) throw new Error('上传需要项目及 1~5 个不同测试文件');
  return Promise.all(ids.map(async id => {
    if (!validId(id)) throw new Error('无效测试文件 ID');
    const file: TestFile = JSON.parse(await fs.readFile(path.join(directory(), id + '.json'), 'utf8'));
    if (file.projectId !== projectId || file.id !== id) throw new Error('测试文件不属于当前项目');
    const buffer = await fs.readFile(path.join(directory(), id + '.bin'));
    if (buffer.length !== file.size || hash(buffer) !== file.sha256) throw new Error('测试文件内容校验失败');
    return { name: file.name, mimeType: file.mime, buffer };
  }));
}
