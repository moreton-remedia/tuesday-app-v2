import { PGlite } from '@electric-sql/pglite';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle as drizzlePG, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePGLite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;
export const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
export const databaseProvider = databaseUrl ? 'postgres' : 'pglite';

function getGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'main';
  }
}

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test' || process.argv.includes('test') || process.argv.some((arg) => arg.endsWith('.test.ts'));
}

function getPgliteDataDir(): string {
  if (process.env.PGLITE_DATA_DIR?.trim()) return process.env.PGLITE_DATA_DIR.trim();
  if (isTestRuntime()) {
    const dataDir = mkdtempSync(join(tmpdir(), 'tanstack-orpc-pglite-test-'));
    process.once('exit', () => {
      try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
    });
    return dataDir;
  }
  return `./.database/${getGitBranch()}`;
}

export async function createDatabase({ migrateLocal = true }: { migrateLocal?: boolean } = {}): Promise<Database> {
  if (!databaseUrl) {
    const dataDir = getPgliteDataDir();
    mkdirSync(dataDir, { recursive: true });
    const client = new PGlite({ dataDir });
    const db = drizzlePGLite<typeof schema>({ client, schema });
    if (migrateLocal && existsSync('./drizzle')) {
      await migratePglite(db, { migrationsFolder: './drizzle' });
    }
    return db;
  }

  return drizzlePG<typeof schema>(databaseUrl, {
    schema,
    logger: process.env.DATABASE_DEBUG === 'true',
  });
}

export async function migrateDatabase(db: Database, migrationsFolder = './drizzle'): Promise<void> {
  if (!existsSync(migrationsFolder)) {
    console.log(`No migrations folder found at ${migrationsFolder}; skipping migrations.`);
    return;
  }

  if (databaseProvider === 'postgres') {
    await migratePostgres(db as NodePgDatabase<typeof schema>, { migrationsFolder });
    return;
  }
  await migratePglite(db as PgliteDatabase<typeof schema>, { migrationsFolder });
}
