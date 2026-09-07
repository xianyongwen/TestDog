import type { FastifyInstance } from 'fastify';
import { listLogs, getLogById, deleteLog, deleteLogs, clearAllLogs, pruneExpired } from '../services/generationLogService';
import { getConfig } from '../config';

export default async function generationLogRoutes(app: FastifyInstance) {
  /** 列表：支持 limit/offset/keyword/status。关联用例标题。 */
  app.get('/api/generation-logs', async (req) => {
    const q = (req.query ?? {}) as { limit?: string; offset?: string; keyword?: string; status?: string };
    const limit = q.limit ? Math.max(1, Math.min(200, Number(q.limit))) : 20;
    const offset = q.offset ? Math.max(0, Number(q.offset)) : 0;
    const status = (q.status && q.status !== 'ALL' ? q.status : 'ALL') as any;
    return listLogs({ limit, offset, keyword: q.keyword, status });
  });

  /** 详情：含全部 steps。 */
  app.get('/api/generation-logs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const log = await getLogById(id);
    if (!log) return reply.code(404).send({ error: '记录不存在' });
    return log;
  });

  /** 单条删除。 */
  app.delete('/api/generation-logs/:id', async (req) => {
    const { id } = req.params as { id: string };
    await deleteLog(id);
    return { ok: true };
  });

  /** 批量删除（body: { ids: string[] }）或全部清除（无 body / ids 为空）。 */
  app.delete('/api/generation-logs', async (req) => {
    const body = (req.body ?? {}) as { ids?: string[] };
    const count = await deleteLogs(Array.isArray(body.ids) ? body.ids : []);
    return { ok: true, count };
  });

  /** 手动触发按保留天数清理。 */
  app.post('/api/generation-logs/prune', async () => {
    const days = getConfig().generationLogRetentionDays;
    const count = await pruneExpired(days);
    return { ok: true, count, days };
  });
}
