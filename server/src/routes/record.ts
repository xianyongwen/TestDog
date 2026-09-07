import type { FastifyInstance } from 'fastify';
import { startRecording, stopRecording } from '../services/recorderService';

export default async function recordRoutes(app: FastifyInstance) {
  app.post('/api/record/start', async (req) => {
    const { url } = (req.body ?? {}) as { url?: string };
    if (!url) return { error: '缺少起始地址' };
    const { randomUUID } = await import('node:crypto');
    const jobId = randomUUID();
    await startRecording(jobId, url);
    return { jobId };
  });

  app.post('/api/record/stop', async (req) => {
    const { jobId } = (req.body ?? {}) as { jobId?: string };
    if (!jobId) return { error: '缺少 jobId' };
    await stopRecording(jobId);
    return { ok: true };
  });
}
