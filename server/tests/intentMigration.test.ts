import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { runMigrations } from '../src/migrate';

it('旧库升级新增 intent 列且重复启动幂等，保留原有脚本', () => {
  const dir = mkdtempSync(join(tmpdir(), 'test-intent-migration-'));
  const filename = join(dir, 'fixture.db');
  const original = process.env.DATABASE_URL;
  try {
    const db = new Database(filename);
    db.exec(readFileSync(new URL('../prisma/migrations/20260720093359_init/migration.sql', import.meta.url), 'utf8'));
    db.pragma('foreign_keys = OFF');
    db.prepare('INSERT INTO "TestScript" (id, testCaseId, version, steps) VALUES (?, ?, ?, ?)').run('old', 'case', 1, '[]');
    db.close();
    process.env.DATABASE_URL = `file:${filename}`;
    runMigrations();
    runMigrations();
    const upgraded = new Database(filename);
    try {
      expect(upgraded.prepare('SELECT steps, intent FROM "TestScript" WHERE id = ?').get('old')).toEqual({ steps: '[]', intent: null });
      upgraded.prepare('UPDATE "TestScript" SET intent = ? WHERE id = ?').run('{"version":1}', 'old');
      expect(upgraded.prepare('SELECT intent FROM "TestScript" WHERE id = ?').get('old')).toEqual({ intent: '{"version":1}' });
    } finally { upgraded.close(); }
  } finally {
    if (original == null) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    rmSync(dir, { recursive: true, force: true });
  }
});
