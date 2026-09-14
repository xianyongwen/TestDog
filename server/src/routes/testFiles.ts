import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { deleteTestFile, listTestFiles, saveTestFile, TEST_FILE_MAX } from '../services/testFileService';
export default async function testFileRoutes(app: FastifyInstance) {
  app.delete('/api/projects/:projectId/test-files/:id', async (req, reply) => {
    const { projectId, id } = req.params as { projectId: string; id: string };
    try {
      await deleteTestFile(projectId, id);
      return { ok: true };
    } catch (e) { return reply.code(400).send({ error: String(e) }); }
  });
  app.get('/api/projects/:projectId/test-files', async req => {
    const { projectId } = req.params as { projectId: string };
    return listTestFiles(projectId);
  });
  app.post('/api/projects/:projectId/test-files', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    if (!await prisma.project.findUnique({ where: { id: projectId } })) return reply.code(404).send({ error: '项目不存在' });
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: '未收到文件' });
    try {
      const buffer = await data.toBuffer();
      if (data.file.truncated || buffer.length > TEST_FILE_MAX) throw new Error('文件超过 20MB');
      return await saveTestFile(projectId, data.filename, data.mimetype, buffer);
    } catch (e) { return reply.code(400).send({ error: String(e) }); }
  });
}
