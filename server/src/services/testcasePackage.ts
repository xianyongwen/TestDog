import { createHash } from 'node:crypto';
import { z } from 'zod';
import { testStepSchema, type TestStep } from '../shared/testScript';
import { testIntentSchema } from '../shared/testIntent';
import { discardImportedTestFile, loadTestFiles, saveTestFile, TEST_FILE_MAX } from './testFileService';
import { withTestFileActivity } from './testFileActivity';

export const PACKAGE_BODY_LIMIT = 145 * 1024 * 1024;
const PACKAGE_FILE_LIMIT = 100 * 1024 * 1024;
const digest = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const packagedFileSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(1024),
  mime: z.string().max(255),
  size: z.number().int().min(0).max(TEST_FILE_MAX),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  data: z.string().max(4 * Math.ceil(TEST_FILE_MAX / 3)),
});
export const testcasePackageSchema = z.object({
  format: z.literal('testcase').optional(),
  version: z.union([z.literal(1), z.literal(2)]).optional(),
  title: z.string().min(1),
  description: z.string().nullish(),
  naturalLanguage: z.string().nullish(),
  rawCode: z.string().nullish(),
  intent: testIntentSchema.nullish().transform(value => value ?? undefined),
  steps: z.array(testStepSchema),
  files: z.array(packagedFileSchema).max(1000).optional(),
});
type TestcasePackage = z.infer<typeof testcasePackageSchema>;
const referencedFiles = (steps: TestStep[]) => [...new Set(steps.flatMap(step => step.action === 'upload' ? step.upload!.fileIds : []))];

export async function exportTestcasePackage(projectId: string, input: unknown): Promise<TestcasePackage> {
  return withTestFileActivity(() => exportPackageWithFiles(projectId, input));
}

async function exportPackageWithFiles(projectId: string, input: unknown): Promise<TestcasePackage> {
  const parsed = testcasePackageSchema.parse(input);
  const files: z.infer<typeof packagedFileSchema>[] = [];
  let total = 0;
  for (const id of referencedFiles(parsed.steps)) {
    let file;
    try { [file] = await loadTestFiles(projectId, [id]); }
    catch { throw new Error(`导出失败：上传文件 ${id} 缺失、损坏或不属于当前项目`); }
    total += file.buffer.length;
    if (total > PACKAGE_FILE_LIMIT || files.length >= 1000) throw new Error('用例文件总大小不得超过 100MB，数量不得超过 1000');
    files.push({ id, name: file.name, mime: file.mimeType, size: file.buffer.length, sha256: digest(file.buffer), data: file.buffer.toString('base64') });
  }
  return { ...parsed, format: 'testcase', version: files.length ? 2 : 1, files: files.length ? files : undefined };
}

export async function importTestcasePackage<Result>(projectId: string, input: unknown, persist: (payload: TestcasePackage) => Promise<Result>): Promise<Result> {
  return withTestFileActivity(() => importPackageWithFiles(projectId, input, persist));
}

async function importPackageWithFiles<Result>(projectId: string, input: unknown, persist: (payload: TestcasePackage) => Promise<Result>): Promise<Result> {
  const parsed = testcasePackageSchema.parse(input);
  const references = referencedFiles(parsed.steps);
  const packaged = new Map<string, z.infer<typeof packagedFileSchema>>();
  let total = 0;
  for (const file of parsed.files ?? []) {
    if (packaged.has(file.id)) throw new Error(`重复文件 ID：${file.id}`);
    if (!references.includes(file.id)) throw new Error(`文件未被脚本引用：${file.name}`);
    total += file.size;
    if (total > PACKAGE_FILE_LIMIT) throw new Error('用例文件总大小不得超过 100MB');
    packaged.set(file.id, file);
  }
  const decoded = new Map<string, Buffer>();
  for (const id of references) {
    const file = packaged.get(id);
    if (!file) throw new Error(`用例缺少上传文件 ${id}，请在原项目重新导出包含文件的 .testcase`);
    if (file.data.length !== 4 * Math.ceil(file.size / 3)) throw new Error(`文件大小不符：${file.name}`);
    const buffer = Buffer.from(file.data, 'base64');
    if (buffer.length !== file.size || buffer.toString('base64') !== file.data || digest(buffer) !== file.sha256) throw new Error(`文件完整性校验失败：${file.name}`);
    decoded.set(id, buffer);
  }
  const created: string[] = [];
  try {
    const replacements = new Map<string, string>();
    for (const [id, buffer] of decoded) {
      const file = packaged.get(id)!;
      const saved = await saveTestFile(projectId, file.name, file.mime, buffer);
      created.push(saved.id);
      replacements.set(id, saved.id);
    }
    const steps = parsed.steps.map(step => step.action === 'upload'
      ? { ...step, upload: { ...step.upload!, fileIds: step.upload!.fileIds.map(id => replacements.get(id)!) } }
      : step);
    return await persist({ ...parsed, steps, files: undefined });
  } catch (error) {
    const cleanup = await Promise.allSettled(created.map(id => discardImportedTestFile(projectId, id)));
    if (cleanup.some(result => result.status === 'rejected')) throw new Error('导入失败，部分新建文件清理失败', { cause: error });
    throw error;
  }
}
