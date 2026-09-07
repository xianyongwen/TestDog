import type { FastifyInstance } from 'fastify';
import { chromium } from 'playwright';
import AdmZip from 'adm-zip';
import { prisma } from '../db';
import { browserLaunchOptions, DEFAULT_VIEWPORT } from '../browser';
import {
  actionLabelConflicts,
  enabledActionVocabulary,
  validatePluginCode,
  MAX_PLUGIN_BYTES,
} from '../services/pluginStore';
import { extractDeclaredActionLabels } from '../services/genToolsPlugin';
import { buildPluginInitScript } from '../services/pluginRuntime';
import { installPluginPwBridge } from '../../scripts/pluginPwBridge';
import { parseActionMeta } from '../services/genToolsPlugin';

import type { TtPluginActionMetaInfo } from '../types/plugin-api';

/** 试运行返回：detect 命中、候选计数、插件声明的动作元数据与采样日志。 */
interface PluginTestResult {
  detectHit: boolean;
  detectedPlugins: string[];
  candidatesCount: number;
  actions: { id: string; actions: TtPluginActionMetaInfo[] }[];
  log: string[];
}

const PRESET_DETAIL_INCLUDE = {
  items: {
    orderBy: { priority: 'asc' as const },
    include: { plugin: { select: { id: true, name: true, actions: true, builtin: true } } },
  },
  _count: { select: { projects: true } },
};

/** 创建/更新预设的公共逻辑：成员以有序 pluginIds 数组保存为 priority（数组序即注入顺序，越靠前越先注入；编辑抽屉展示的顺序数字与之相反，越大越优先）。 */
async function savePreset(o: {
  id?: string;
  name: string;
  description?: string | null;
  builtin: boolean;
  pluginIds: string[];
}) {
  const ids = (o.pluginIds ?? []).filter(Boolean);
  const found = await prisma.plugin.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const valid = new Set(found.map((f) => f.id));
  const ordered = ids.filter((x) => valid.has(x));
  const items = ordered.map((pluginId, priority) => ({ pluginId, priority }));
  // 注意：deleteMany 仅在 update 的嵌套写法中合法，create 分支只能用 create
  const itemWrite = o.id ? { deleteMany: {}, create: items } : { create: items };
  const data = {
    name: o.name,
    description: o.description ?? undefined,
    items: itemWrite,
  };
  return o.id
    ? prisma.pluginPreset.update({ where: { id: o.id }, data, include: PRESET_DETAIL_INCLUDE })
    : prisma.pluginPreset.create({
        data: { ...data, builtin: o.builtin } as any,
        include: PRESET_DETAIL_INCLUDE,
      });
}

/**
 * 解析上传插件包（裸 .js 或 zip），返回入口 js 源码；失败返回 error 文案。
 * zip 的 manifest.json 支持根目录或唯一的单层目录包裹（macOS 右键压缩 / GitHub zipball /
 * 插件模板 zip 等常见产物），entry 路径相对 manifest 所在目录解析。
 */
function parsePluginPackage(buf: Buffer, filename: string): { entryFile?: string; error?: string } {
  const fname = filename.toLowerCase();
  try {
    if (fname.endsWith('.zip')) {
      const zip = new AdmZip(buf);
      const entries = zip.getEntries().filter((e) => !e.isDirectory);
      if (entries.length > 20) return { error: '插件包成员过多（超过 20 个文件）' };
      const total = entries.reduce((s, e) => s + e.header.size, 0);
      if (total > MAX_PLUGIN_BYTES) return { error: '插件包总量超过 512KB 上限' };
      let mf = entries.find((e) => e.entryName === 'manifest.json');
      let base = '';
      if (!mf) {
        const nested = entries.filter((e) => /^[^/]+\/manifest\.json$/.test(e.entryName));
        if (nested.length > 1) return { error: 'zip 包含多个 manifest.json，无法确定入口' };
        mf = nested[0];
        if (mf) base = mf.entryName.slice(0, -'manifest.json'.length);
      }
      if (!mf) return { error: 'zip 包缺少 manifest.json（需在 zip 根目录或唯一的单层目录内）' };
      let manifest: any;
      try {
        manifest = JSON.parse(mf.getData().toString('utf-8'));
      } catch {
        return { error: 'manifest.json 无法解析' };
      }
      const relEntry = String(manifest.entry ?? 'index.js').replace(/^\.\//, '').replace(/^\//, '');
      const entry = entries.find((e) => e.entryName === base + relEntry);
      if (!entry) return { error: `入口文件不存在：${base + relEntry}` };
      return { entryFile: entry.getData().toString('utf-8') };
    }
    if (fname.endsWith('.js')) return { entryFile: buf.toString('utf-8') };
    return { error: '仅支持 .js 或 .zip 插件包' };
  } catch (e) {
    return { error: `插件包解析失败：${String(e)}` };
  }
}

export default async function pluginRoutes(app: FastifyInstance) {
  // —— 上传：裸 .js（主路径，配套表单元数据）或 .zip（manifest.json + 入口 js）——
  app.post('/api/plugins/upload', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_PLUGIN_BYTES } });
    if (!file) return reply.code(400).send({ error: '缺少插件文件' });
    const fields = (file.fields ?? {}) as Record<string, any>;
    const name = String(fields.name?.value ?? '').trim();
    const version = String(fields.version?.value ?? '').trim() || '1.0.0';
    const description = String(fields.description?.value ?? '').trim() || null;
    if (!name) return reply.code(400).send({ error: '缺少插件名称' });

    const buf = await file.toBuffer();
    if (buf.length > MAX_PLUGIN_BYTES) return reply.code(400).send({ error: '插件超过 512KB 上限' });

    const parsed = parsePluginPackage(buf, file.filename ?? '');
    if (parsed.error) return reply.code(400).send({ error: parsed.error });
    const entryFile = parsed.entryFile!;

    try {
      validatePluginCode(entryFile);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }

    const dup = await prisma.plugin.findUnique({ where: { name }, select: { id: true } });
    if (dup) return reply.code(400).send({ error: `同名插件已存在：${name}` });

    const created = await prisma.plugin.create({
      data: { name, version, description, entryFile, source: 'upload', builtin: false },
    });
    // 静态提取源码 actions 声明的 label，与库内其他插件同名动作做一致性检测（不阻塞上传，仅警告）
    const warnings = await actionLabelConflicts(extractDeclaredActionLabels(entryFile));
    return { ...created, warnings };
  });

  // —— 重新上传：替换已上传插件的入口源码（保留 id/名称/预设关联；动作元数据保留，下次试运行按新源码重新回写）——
  app.post('/api/plugins/:id/file', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await prisma.plugin.findUnique({ where: { id } });
    if (!p) return reply.code(404).send({ error: '插件不存在' });
    if (p.builtin) return reply.code(403).send({ error: '内置插件不可重新上传，随平台版本发布更新' });
    const file = await req.file({ limits: { fileSize: MAX_PLUGIN_BYTES } });
    if (!file) return reply.code(400).send({ error: '缺少插件文件' });
    const fields = (file.fields ?? {}) as Record<string, any>;
    const version = String(fields.version?.value ?? '').trim();
    const description = String(fields.description?.value ?? '').trim();
    const buf = await file.toBuffer();
    if (buf.length > MAX_PLUGIN_BYTES) return reply.code(400).send({ error: '插件超过 512KB 上限' });
    const parsed = parsePluginPackage(buf, file.filename ?? '');
    if (parsed.error) return reply.code(400).send({ error: parsed.error });
    try {
      validatePluginCode(parsed.entryFile!);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    const updated = await prisma.plugin.update({
      where: { id },
      data: {
        entryFile: parsed.entryFile!,
        ...(version ? { version } : {}),
        ...(description ? { description } : {}),
      },
    });
    // 与其他插件同名动作 label 一致性检测（排除自身旧元数据；不阻塞重传，仅警告）
    const warnings = await actionLabelConflicts(extractDeclaredActionLabels(parsed.entryFile!), id);
    return { ...updated, warnings };
  });

  // —— 列表（含所属预设名与动作元数据）——
  app.get('/api/plugins', async () => {
    const list = await prisma.plugin.findMany({
      orderBy: [{ builtin: 'desc' }, { createdAt: 'asc' }],
      include: { presets: { include: { preset: { select: { name: true } } } } },
    });
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      source: p.source,
      builtin: p.builtin,
      actions: p.actions,
      presetNames: p.presets.map((i) => i.preset.name),
      createdAt: p.createdAt,
    }));
  });

  // —— 项目可用语义动作词表（Preset 编排去重；脚本编辑的动作下拉等前端场景共用）——
  app.get('/api/plugin-actions', async (req) => {
    const { projectId } = req.query as { projectId?: string };
    return enabledActionVocabulary(projectId || null);
  });

  app.patch('/api/plugins/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { description } = (req.body ?? {}) as { description?: string };
    const p = await prisma.plugin.findUnique({ where: { id }, select: { id: true } });
    if (!p) return reply.code(404).send({ error: '插件不存在' });
    return prisma.plugin.update({
      where: { id },
      data: { description: typeof description === 'string' ? description : undefined },
    });
  });

  app.delete('/api/plugins/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await prisma.plugin.findUnique({ where: { id } });
    if (!p) return reply.code(404).send({ error: '插件不存在' });
    if (p.builtin) return reply.code(403).send({ error: '内置插件不可删除' });
    await prisma.plugin.delete({ where: { id } });
    return { ok: true };
  });

  // —— 试运行：headed 打开目标页注入「运行时框架 + 该插件」，自动收集 detect/candidates/actions 摘要 ——
  app.post('/api/plugins/:id/test', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { url } = (req.body ?? {}) as { url?: string };
    if (!url) return reply.code(400).send({ error: '缺少目标地址' });
    const p = await prisma.plugin.findUnique({ where: { id } });
    if (!p) return reply.code(404).send({ error: '插件不存在' });

    let browser: any;
    try {
      browser = await chromium.launch({ ...browserLaunchOptions({ headless: true }) });
      const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
      const page = await context.newPage();
      // Playwright 桥：试运行下插件动作同样可经 pw.* 调真实 Playwright API
      try {
        await installPluginPwBridge(context);
      } catch {
        /* 桥不可用时动作内报「桥未注入」，不阻塞试运行 */
      }
      await page.addInitScript(buildPluginInitScript([{ id: p.name, code: p.entryFile }]));
      await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500); // 等 SPA / 组件库渲染完成

      const result = (await page.evaluate(() => {
        const reg = (globalThis as any).__ttPluginRegistry__;
        const log: string[] = [];
        if (!reg) {
          return { detectHit: false, detectedPlugins: [], candidatesCount: 0, actions: [], log: ['运行时框架未注入'] };
        }
        const els = Array.from(document.body ? document.body.querySelectorAll('*') : []).slice(0, 2000);
        let candidatesCount = 0;
        let detectHit = false;
        for (const el of els) {
          const hits = reg.detectAll(el);
          if (!hits.length) continue;
          detectHit = true;
          const cs = reg.candidatesFor(el);
          if (cs.length) {
            candidatesCount += cs.length;
            if (log.length < 30) {
              const cls = String(el.className || '').split(' ').slice(0, 2).join('.');
              log.push(
                `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} → ${cs
                  .map((c: any) => c.strategy + '=' + String(c.value).slice(0, 40))
                  .join(' | ')}`,
              );
            }
          }
        }
        const bodyHits = reg.detectAll(document.body).map((h: any) => h.id);
        return {
          detectHit: detectHit || bodyHits.length > 0,
          detectedPlugins: bodyHits,
          candidatesCount,
          actions: reg.listActions(),
          log,
        };
      })) as PluginTestResult;

      // 用户插件的动作清单需在页内注册后才能得知：试运行时回写。
      // 归一化为动作元数据形态 [{name, doc?, label?, preferFill?}]（与内置 seed 同构，词表/管理页共用）；
      // 页内声明（对象形态）携带的元数据随插件源码更新优先，既有元数据仅补其缺失字段。
      const byName = new Map(parseActionMeta(p.actions).map((m) => [m.name, m]));
      const collected = (result.actions ?? []).flatMap((x) => x.actions);
      const merged = collected.map((m) => {
        const prev = byName.get(m.name);
        return {
          name: m.name,
          doc: m.doc ?? prev?.doc,
          label: m.label ?? prev?.label,
          preferFill: m.preferFill || prev?.preferFill || undefined,
        };
      });
      // 与其他插件同名动作 label 一致性检测：警告追加进试运行日志（词表按 preset 优先级取先声明者）
      const labelWarnings = await actionLabelConflicts(merged, id);
      if (labelWarnings.length) result.log.push(...labelWarnings);
      await prisma.plugin.update({ where: { id }, data: { actions: merged as any } }).catch(() => {});
      return result;
    } catch (e) {
      return reply.code(500).send({ error: `试运行失败：${String(e)}` });
    } finally {
      try {
        await browser?.close();
      } catch {
        /* 忽略 */
      }
    }
  });

  // —— 预设（唯一编排入口）——
  app.get('/api/plugin-presets', async () =>
    prisma.pluginPreset.findMany({
      orderBy: [{ builtin: 'desc' }, { createdAt: 'asc' }],
      include: PRESET_DETAIL_INCLUDE,
    }),
  );

  app.post('/api/plugin-presets', async (req, reply) => {
    const { name, description, pluginIds } = (req.body ?? {}) as {
      name?: string;
      description?: string;
      pluginIds?: string[];
    };
    if (!name?.trim()) return reply.code(400).send({ error: '缺少预设名称' });
    const dup = await prisma.pluginPreset.findUnique({ where: { name: name.trim() } });
    if (dup) return reply.code(400).send({ error: `同名预设已存在：${name.trim()}` });
    return savePreset({
      name: name.trim(),
      description: description ?? null,
      builtin: false,
      pluginIds: Array.isArray(pluginIds) ? pluginIds : [],
    });
  });

  app.patch('/api/plugin-presets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name, description, pluginIds } = (req.body ?? {}) as {
      name?: string;
      description?: string;
      pluginIds?: string[];
    };
    const preset = await prisma.pluginPreset.findUnique({
      where: { id },
      include: { items: { orderBy: { priority: 'asc' } } },
    });
    if (!preset) return reply.code(404).send({ error: '预设不存在' });
    // 内置预设可编辑成员/描述，但名称锁定：enabledPluginRecords 回落与项目默认预设均按 DEFAULT_PRESET_NAME 查名
    const builtinSet = preset.builtin
      ? new Set(
          (
            await prisma.plugin.findMany({
              where: { id: { in: preset.items.map((i) => i.pluginId) }, builtin: true },
              select: { id: true },
            })
          ).map((p) => p.id),
        )
      : null;
    // 未传成员时保持现有成员不变（仅更新名称/描述）；内置预设的内置插件成员不可删除，
    // 缺失的按原优先级序补回尾部（保留提交顺序）
    const ids = Array.isArray(pluginIds) ? [...pluginIds] : preset.items.map((i) => i.pluginId);
    if (builtinSet) for (const i of preset.items) if (builtinSet.has(i.pluginId) && !ids.includes(i.pluginId)) ids.push(i.pluginId);
    return savePreset({
      id,
      name: preset.builtin ? preset.name : (name?.trim() ?? preset.name),
      description: typeof description === 'string' ? description : undefined,
      builtin: false,
      pluginIds: ids,
    });
  });

  app.delete('/api/plugin-presets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const preset = await prisma.pluginPreset.findUnique({ where: { id } });
    if (!preset) return reply.code(404).send({ error: '预设不存在' });
    if (preset.builtin) return reply.code(403).send({ error: '内置预设不可删除' });
    // Project.presetId 为 SetNull：删除后相关项目回落全部插件注入。
    // 老库的 Project.presetId 是迁移加的列、无物理外键（SQLite 不能 ALTER 加约束），
    // DB 层不会自动置空，这里应用层显式清一遍；新库外键同样动作，幂等无害。
    await prisma.project.updateMany({ where: { presetId: id }, data: { presetId: null } });
    await prisma.pluginPreset.delete({ where: { id } });
    return { ok: true };
  });
}
