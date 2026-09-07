import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { Prisma } from '../../generated/prisma/client';
import { DEFAULT_PRESET_NAME } from '../services/componentPlugins/builtin';
import { isValidVarName } from '../shared/envVars';
import { parseViewport } from '../shared/viewport';
import { cleanupScreenshots } from './runs';

export default async function projectRoutes(app: FastifyInstance) {
  app.get('/api/projects', async () =>
    prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { testCases: true } } },
    }),
  );

  app.post('/api/projects', async (req, reply) => {
    const { name, baseUrl, presetId } = (req.body ?? {}) as { name?: string; baseUrl?: string; presetId?: string };
    if (!name) return reply.code(400).send({ error: '缺少项目名称' });
    // 关联的预设必须存在（组合即开关：项目的插件注入范围由预设编排）
    if (presetId) {
      const preset = await prisma.pluginPreset.findUnique({ where: { id: presetId }, select: { id: true } });
      if (!preset) return reply.code(400).send({ error: '预设不存在' });
    }
    // 未指定预设时默认关联内置「默认组合」，保证新建项目即刻获得插件能力
    let finalPresetId = presetId ?? null;
    if (!finalPresetId) {
      const def = await prisma.pluginPreset.findUnique({ where: { name: DEFAULT_PRESET_NAME }, select: { id: true } });
      finalPresetId = def?.id ?? null;
    }
    return prisma.project.create({ data: { name, baseUrl, ...(finalPresetId ? { presetId: finalPresetId } : {}) } });
  });

  app.get('/api/projects/:id', async (req, reply) => {
    const project = await prisma.project.findUnique({
      where: { id: (req.params as { id: string }).id },
      include: {
        testCases: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
          include: {
            _count: { select: { scripts: true, runs: true } },
            // 版本列表（仅 id/version），供用例列表「版本」列选择批量运行的脚本版本。
            scripts: { select: { id: true, version: true }, orderBy: { version: 'desc' } },
          },
        },
        loginConfigs: { select: { id: true, name: true, isDefault: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!project) return reply.code(404).send({ error: '项目不存在' });
    return project;
  });

  app.put('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name, baseUrl, presetId, viewport } = (req.body ?? {}) as {
      name?: string;
      baseUrl?: string;
      presetId?: string | null;
      viewport?: unknown;
    };
    if (presetId) {
      const preset = await prisma.pluginPreset.findUnique({ where: { id: presetId }, select: { id: true } });
      if (!preset) return { error: '预设不存在' };
    }
    // 窗口尺寸校验：null = 恢复默认；传了但类型非法（非 {width,height} 数字）则拒绝，避免静默清空。
    let viewportData: { width: number; height: number } | null | undefined;
    if (viewport !== undefined) {
      viewportData = parseViewport(viewport);
      if (viewportData === undefined) return reply.code(400).send({ error: 'viewport 需为 {width, height} 数字对象或 null' });
    }
    // Json 字段存 SQL NULL 需用 DbNull 哨兵（同 StepResult.healedLocator），直接传 null 类型不合法
    const viewportInput = viewportData === undefined ? undefined : viewportData === null ? Prisma.DbNull : viewportData;
    return prisma.project.update({
      where: { id },
      data: {
        name,
        baseUrl,
        // 显式传 null 表示清除关联（回落全部插件注入）；未传则不动
        ...(presetId !== undefined ? { presetId: presetId || null } : {}),
        ...(viewportInput !== undefined ? { viewport: viewportInput } : {}),
      },
    });
  });

  app.delete('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string };
    // DB 行由外键级联删除，但截图 PNG 文件需手动清理（与删除运行记录的路由一致）。
    const runs = await prisma.testRun.findMany({
      where: { testCase: { projectId: id } },
      select: { id: true },
    });
    await cleanupScreenshots(runs.map((r) => r.id));
    await prisma.project.delete({ where: { id } });
    return { ok: true };
  });

  /** 项目环境变量列表（含值，供管理界面编辑）。 */
  app.get('/api/projects/:id/env-vars', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: '项目不存在' });
    return prisma.envVar.findMany({
      where: { projectId: id },
      orderBy: { key: 'asc' },
    });
  });

  /** 整体替换项目环境变量（前端可增删改后一次性提交）。键去空白去重，空键丢弃。 */
  app.put('/api/projects/:id/env-vars', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { vars } = (req.body ?? {}) as { vars?: { key: string; value: string }[] };
    if (!Array.isArray(vars)) return reply.code(400).send({ error: '缺少 vars' });

    // 按 key 去重（后写覆盖先写），丢弃空键与非法键名（须能作为 {{name}} 被识别）；保留插入顺序。
    const dedup = new Map<string, string>();
    for (const v of vars) {
      const key = (v?.key ?? '').trim();
      if (!key || !isValidVarName(key)) continue;
      dedup.set(key, v?.value ?? '');
    }
    const rows = [...dedup.entries()].map(([key, value]) => ({ projectId: id, key, value }));

    await prisma.$transaction([
      prisma.envVar.deleteMany({ where: { projectId: id } }),
      ...rows.map((r) => prisma.envVar.create({ data: r })),
    ]);
    return prisma.envVar.findMany({ where: { projectId: id }, orderBy: { key: 'asc' } });
  });
}
