import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { startPick, getPick, cancelPick } from '../services/locatorPickerService';

export default async function locatorRoutes(app: FastifyInstance) {
  /** 启动拾取：打开 headed 浏览器到目标页，等待用户在页面上点击元素（窗口尺寸按项目配置）。 */
  app.post('/api/locator/pick', async (req, reply) => {
    const { url, loginConfigId, projectId } = (req.body ?? {}) as {
      url?: string;
      loginConfigId?: string;
      projectId?: string;
    };
    if (!url?.trim()) return reply.code(400).send({ error: '缺少页面地址' });
    const pickId = randomUUID();
    try {
      await startPick(pickId, url.trim(), loginConfigId, projectId?.trim() || undefined);
    } catch (e) {
      return reply.code(500).send({ error: `启动拾取失败：${String(e)}` });
    }
    return { pickId };
  });

  /** 轮询拾取结果：pending / done(locator) / cancelled / error。 */
  app.get('/api/locator/pick/:id', async (req, reply) => {
    const s = getPick((req.params as { id: string }).id);
    if (!s) return reply.code(404).send({ error: '拾取会话不存在或已过期' });
    return s;
  });

  /** 取消拾取并关闭浏览器。 */
  app.post('/api/locator/pick/:id/cancel', async (req) => {
    await cancelPick((req.params as { id: string }).id);
    return { ok: true };
  });
}
