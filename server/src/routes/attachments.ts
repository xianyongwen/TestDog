import type { FastifyInstance } from 'fastify';
import { storeAttachment, deleteAttachment, MAX_FILE_SIZE } from '../services/attachmentService';

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of stream as AsyncIterable<Buffer>) {
    size += c.length;
    if (size > MAX_FILE_SIZE) throw new Error('文件过大（单文件上限 20MB）');
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  }
  return Buffer.concat(chunks);
}

export default async function attachmentRoutes(app: FastifyInstance) {
  /** 上传单个附件（multipart/form-data，字段名 files）。上传时即归一化：文本提取 / 图片保存原始图（多模态直发主模型）。 */
  app.post('/api/attachments', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: '未收到文件' });
    const size = data.file.truncated ? MAX_FILE_SIZE + 1 : 0; // truncated 表示超出 limits 大小
    let buffer: Buffer;
    try {
      buffer = await streamToBuffer(data.file);
    } catch (e) {
      data.file.resume();
      return reply.code(400).send({ error: String(e) });
    }
    if (size > MAX_FILE_SIZE || buffer.length > MAX_FILE_SIZE) {
      return reply.code(400).send({ error: '文件过大（单文件上限 20MB）' });
    }
    const name = data.filename || 'file';
    try {
      const att = await storeAttachment({ name, mime: data.mimetype ?? '', size: buffer.length, buffer });
      return {
        id: att.id,
        name: att.name,
        mime: att.mime,
        size: att.size,
        isImage: att.isImage,
        contentPreview: att.content.slice(0, 5000),
      };
    } catch (e) {
      return reply.code(400).send({ error: `${name} 处理失败：${String(e)}` });
    }
  });

  app.delete('/api/attachments/:id', async (req) => {
    deleteAttachment((req.params as { id: string }).id);
    return { ok: true };
  });
}
