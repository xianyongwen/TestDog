import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { getScreenshotDir } from '../config';
import { testFileCheckpointReferences } from './generation/checkpoint';
import { acquireTestFileActivity, withTestFileCleanup } from './testFileActivity';

export const TEST_FILE_GRACE_MS = 24 * 60 * 60 * 1000;
export const TEST_FILE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const ID_PATTERN = /^[0-9a-f-]{36}$/;

function collectReferences(value: unknown, references: Set<string>): void {
  if (typeof value === 'string') {
    if (value.includes('"fileIds"') && /^[\s]*[\[{]/.test(value)) {
      let parsed: unknown;
      try { parsed = JSON.parse(value); } catch { return; }
      collectReferences(parsed, references);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, references);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'fileIds' && Array.isArray(child)) {
      for (const id of child) if (typeof id === 'string') references.add(id);
    } else collectReferences(child, references);
  }
}

async function liveReferences(): Promise<{ projects: Set<string>; files: Set<string> }> {
  const projects = new Set((await prisma.project.findMany({ select: { id: true } })).map(project => project.id));
  const files = new Set<string>();
  for (let skip = 0; ; skip += 100) {
    const scripts = await prisma.testScript.findMany({ select: { steps: true }, orderBy: { id: 'asc' }, take: 100, skip });
    for (const script of scripts) collectReferences(script.steps, files);
    if (scripts.length < 100) break;
  }
  for (let skip = 0; ; skip += 100) {
    const logs = await prisma.generationLog.findMany({ select: { scriptSteps: true, loopState: true }, orderBy: { id: 'asc' }, take: 100, skip });
    for (const log of logs) collectReferences(log, files);
    if (logs.length < 100) break;
  }
  for (const checkpoint of testFileCheckpointReferences()) collectReferences(checkpoint, files);
  return { projects, files };
}

export async function cleanupTestFiles(now = Date.now()) {
  return withTestFileCleanup(async () => {
    const result = { scanned: 0, marked: 0, removed: 0, bytes: 0, errors: [] as string[] };
    const directory = path.join(path.dirname(getScreenshotDir()), 'test-files');
    const root = await fs.lstat(directory).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!root || !root.isDirectory()) return result;
    const references = await liveReferences();
    const groups = new Map<string, string[]>();
    for (const entry of await fs.readdir(directory)) {
      const parsed = path.parse(entry);
      if (!ID_PATTERN.test(parsed.name) || !['.bin', '.json', '.deleted', '.orphan'].includes(parsed.ext)) continue;
      const group = groups.get(parsed.name) ?? [];
      group.push(entry);
      groups.set(parsed.name, group);
    }
    for (const [id, names] of groups) {
      result.scanned++;
      try {
        const parts = await Promise.all(names.map(async name => ({ name, stat: await fs.lstat(path.join(directory, name)) })));
        if (parts.some(part => !part.stat.isFile())) continue;
        const marker = path.join(directory, id + '.orphan');
        let retained = references.files.has(id);
        if (names.includes(id + '.json')) {
          const metadata: unknown = JSON.parse(await fs.readFile(path.join(directory, id + '.json'), 'utf8'));
          if (!metadata || typeof metadata !== 'object' || !('id' in metadata) || metadata.id !== id || !('projectId' in metadata) || typeof metadata.projectId !== 'string') {
            throw new Error('文件元数据无效，已跳过');
          }
          retained ||= references.projects.has(metadata.projectId) && names.includes(id + '.bin') && !names.includes(id + '.deleted');
        }
        if (retained) {
          await fs.rm(marker, { force: true });
          continue;
        }
        if (!names.includes(id + '.orphan')) {
          await fs.writeFile(marker, JSON.stringify({ since: now }), { flag: 'wx' });
          result.marked++;
          continue;
        }
        const state: unknown = JSON.parse(await fs.readFile(marker, 'utf8'));
        if (!state || typeof state !== 'object' || !('since' in state) || typeof state.since !== 'number' || !Number.isFinite(state.since) || state.since < 0) throw new Error('清理标记无效，已跳过');
        const newest = Math.max(state.since, ...parts.filter(part => !part.name.endsWith('.orphan')).map(part => part.stat.mtimeMs));
        if (now - newest < TEST_FILE_GRACE_MS) continue;
        for (const part of parts.filter(part => !part.name.endsWith('.orphan'))) {
          await fs.rm(path.join(directory, part.name));
          result.bytes += part.stat.size;
        }
        await fs.rm(marker);
        result.removed++;
      } catch (error) {
        result.errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return result;
  });
}

export function installTestFileCleanup(app: FastifyInstance): void {
  const requests = new WeakMap<FastifyRequest, () => void>();
  app.addHook('preHandler', async request => { requests.set(request, await acquireTestFileActivity()); });
  const releaseRequest = (request: FastifyRequest) => { requests.get(request)?.(); requests.delete(request); };
  app.addHook('onSend', async (request, _reply, payload) => { releaseRequest(request); return payload; });
  app.addHook('onError', async request => { releaseRequest(request); });
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;
  let closed = false;
  const run = () => {
    if (closed || pending) return;
    pending = cleanupTestFiles().then(result => {
      if (result && (result.marked || result.removed || result.errors.length)) app.log.info({ testFileCleanup: result }, '测试文件清理');
    }).catch(error => { app.log.warn({ err: error }, '测试文件清理失败，本次扫描已停止'); }).finally(() => { pending = undefined; });
  };
  app.addHook('onReady', async () => {
    run();
    timer = setInterval(run, TEST_FILE_CLEANUP_INTERVAL_MS);
    timer.unref();
  });
  app.addHook('onClose', async () => { closed = true; clearInterval(timer); await pending; });
}
