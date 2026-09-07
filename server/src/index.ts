import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { addClient } from './ws/hub';
import projectRoutes from './routes/projects';
import testCaseRoutes from './routes/testCases';
import scriptRoutes from './routes/scripts';
import runRoutes from './routes/runs';
import settingsRoutes from './routes/settings';
import generateRoutes from './routes/generate';
import recordRoutes from './routes/record';
import loginConfigRoutes from './routes/loginConfigs';
import attachmentRoutes from './routes/attachments';
import locatorRoutes from './routes/locator';
import generationLogRoutes from './routes/generationLogs';
import pluginRoutes from './routes/plugins';
import { pruneExpired } from './services/generationLogService';
import { ensureBuiltinPlugins } from './services/pluginStore';
import { getConfig } from './config';

const app = Fastify({ logger: { level: 'info' } });

// 生产期前端跑在 tauri://localhost，直连 127.0.0.1:4123 属跨域，DELETE/PUT 等非简单方法会触发预检。
// @fastify/cors 默认 methods 仅 GET,HEAD,POST，不含 DELETE -> 预检通过但实际请求被浏览器丢弃（删除静默失败）。
await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
});
await app.register(websocket);
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 5 } });

app.get('/health', async () => ({ ok: true, ts: Date.now() }));
app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

app.get('/ws', { websocket: true }, (conn: any) => {
  // 兼容 @fastify/websocket 不同版本：conn 可能是裸 WebSocket 或带 .socket 的包装
  const ws = conn.socket ?? conn;
  addClient(ws);
});

await app.register(projectRoutes);
await app.register(testCaseRoutes);
await app.register(scriptRoutes);
await app.register(runRoutes);
await app.register(settingsRoutes);
await app.register(generateRoutes);
await app.register(recordRoutes);
await app.register(loginConfigRoutes);
await app.register(attachmentRoutes);
await app.register(locatorRoutes);
await app.register(generationLogRoutes);
await app.register(pluginRoutes);

// 启动时 seed 内置插件与「默认组合」预设（不阻塞服务）
ensureBuiltinPlugins().catch((e) => console.warn('[pluginStore] 内置插件 seed 失败:', e));

// 启动时按配置清理过期生成记录（不阻塞服务）
pruneExpired(getConfig().generationLogRetentionDays).catch((e) =>
  console.warn('[genLog] 启动清理失败:', e),
);

const port = Number(process.env.PORT ?? 4123);
await app.listen({ port, host: '127.0.0.1' });
console.log(`[backend] 后端已启动：http://127.0.0.1:${port}`);
