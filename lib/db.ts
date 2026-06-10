import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import * as schema from './schema';

/**
 * Drizzle client over libSQL (Turso). Runs on the Node.js runtime (the default
 * for server components / actions / route handlers) — do NOT import this from an
 * Edge runtime without switching to `@libsql/client/web`.
 *
 * Initialization is LAZY: `createClient` validates the URL eagerly and would throw
 * at import time when env vars are absent (e.g. during `next build` page-data
 * collection). We defer it to first query so importing `db` is always safe; the
 * libSQL client is cached on `globalThis` to reuse one connection across dev
 * hot-reloads and warm serverless invocations.
 */
type DB = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __libsqlClient?: Client };
let dbInstance: DB | undefined;

function getDb(): DB {
  if (dbInstance) return dbInstance;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error('TURSO_DATABASE_URL chưa được set — kiểm tra .env.local (hoặc env trên Vercel).');
  }
  const client =
    globalForDb.__libsqlClient ?? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  if (process.env.NODE_ENV !== 'production') globalForDb.__libsqlClient = client;
  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
