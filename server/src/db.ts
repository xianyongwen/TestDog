import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { runMigrations } from './migrate';

// Prisma 7：SQLite 必须用 driver adapter（Rust 引擎已移除）。
// 先把旧库迁到最新：升级安装时旧 app.db 不会被模板覆盖，需显式迁移，否则查询报 P2022。
runMigrations();

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
