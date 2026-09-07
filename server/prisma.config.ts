import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Prisma 7：数据源 URL 从 schema.prisma 移到这里。
// DATABASE_URL 由 .env（开发）或 Tauri 注入（生产）提供。
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: { path: path.join('prisma', 'migrations') },
  datasource: { url: env('DATABASE_URL') },
});
