import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { startLoginRecording, stopLoginRecording, cancelLoginRecording } from '../services/loginRecorderService';
import { readViewport } from '../shared/viewport';

export default async function loginConfigRoutes(app: FastifyInstance) {
  /** 登录配置列表（不含 storageState：体积大且含敏感凭据，管理界面只需元信息）。 */
  app.get('/api/projects/:id/login-configs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: '项目不存在' });
    return prisma.loginConfig.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, isDefault: true, createdAt: true },
    });
  });

  /** 新建：录制停止后由前端提交 storageState。项目的首个配置自动设为默认。 */
  app.post('/api/projects/:id/login-configs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name, storageState } = (req.body ?? {}) as { name?: string; storageState?: unknown };
    if (!name?.trim()) return reply.code(400).send({ error: '缺少配置名称' });
    if (!storageState) return reply.code(400).send({ error: '缺少登录状态数据' });
    const count = await prisma.loginConfig.count({ where: { projectId: id } });
    return prisma.loginConfig.create({
      data: {
        projectId: id,
        name: name.trim(),
        storageState: storageState as object,
        isDefault: count === 0, // 首个自动设为默认
      },
      select: { id: true, name: true, isDefault: true, createdAt: true },
    });
  });

  /** 重命名。 */
  app.put('/api/login-configs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name } = (req.body ?? {}) as { name?: string };
    if (!name?.trim()) return reply.code(400).send({ error: '缺少配置名称' });
    return prisma.loginConfig.update({
      where: { id },
      data: { name: name.trim() },
      select: { id: true, name: true, isDefault: true, createdAt: true },
    });
  });

  /** 刷新：重录后更新已有配置的登录状态数据。 */
  app.put('/api/login-configs/:id/storage-state', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { storageState } = (req.body ?? {}) as { storageState?: unknown };
    if (!storageState) return reply.code(400).send({ error: '缺少登录状态数据' });
    return prisma.loginConfig.update({
      where: { id },
      data: { storageState: storageState as object },
      select: { id: true, name: true, isDefault: true, createdAt: true },
    });
  });

  /** 设为默认（项目内唯一：先清兄弟再置当前）。 */
  app.put('/api/projects/:id/login-configs/:configId/default', async (req) => {
    const { id, configId } = req.params as { id: string; configId: string };
    await prisma.$transaction([
      prisma.loginConfig.updateMany({ where: { projectId: id, isDefault: true }, data: { isDefault: false } }),
      prisma.loginConfig.update({ where: { id: configId }, data: { isDefault: true } }),
    ]);
    return { ok: true };
  });

  /** 删除；若删的是默认配置且仍有余项，自动提升最新一条为默认。 */
  app.delete('/api/login-configs/:id', async (req) => {
    const { id } = req.params as { id: string };
    const deleted = await prisma.loginConfig.findUnique({
      where: { id },
      select: { projectId: true, isDefault: true },
    });
    if (!deleted) return { ok: true };
    await prisma.loginConfig.delete({ where: { id } });
    if (deleted.isDefault) {
      const next = await prisma.loginConfig.findFirst({
        where: { projectId: deleted.projectId },
        orderBy: { createdAt: 'desc' },
      });
      if (next) await prisma.loginConfig.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { ok: true };
  });

  /** 启动登录录制：打开有头浏览器，用户手动登录（窗口尺寸按项目配置）。 */
  app.post('/api/projects/:id/login-configs/record/start', async (req) => {
    const { url } = (req.body ?? {}) as { url?: string };
    if (!url) return { error: '缺少起始地址' };
    const { id } = req.params as { id: string };
    const project = await prisma.project.findUnique({ where: { id }, select: { viewport: true } });
    const viewport = readViewport(project?.viewport);
    const { randomUUID } = await import('node:crypto');
    const jobId = randomUUID();
    await startLoginRecording(jobId, url, viewport);
    return { jobId };
  });

  /** 停止录制并返回捕获的 storageState。 */
  app.post('/api/login-configs/record/stop', async (req, reply) => {
    const { jobId } = (req.body ?? {}) as { jobId?: string };
    if (!jobId) return reply.code(400).send({ error: '缺少 jobId' });
    try {
      return await stopLoginRecording(jobId);
    } catch (e) {
      return reply.code(400).send({ error: String(e) });
    }
  });

  /** 取消录制：关闭浏览器并丢弃会话（不保存）。幂等，前端收到响应后自行复位 UI。 */
  app.post('/api/login-configs/record/cancel', async (req, reply) => {
    const { jobId } = (req.body ?? {}) as { jobId?: string };
    if (!jobId) return reply.code(400).send({ error: '缺少 jobId' });
    await cancelLoginRecording(jobId);
    return { ok: true };
  });
}
