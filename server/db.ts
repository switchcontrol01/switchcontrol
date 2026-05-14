import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// In the packaged Electron build the backend runs on the user's machine and
// cannot reach the Replit cloud database — this is intentional.  Only in a
// true cloud/server deployment is a missing DATABASE_URL a fatal error.
const isElectronBackend = process.env.ELECTRON_BACKEND === '1';

export const isNoDbMode = !process.env.DATABASE_URL;

if (isNoDbMode) {
  if (!isElectronBackend && process.env.NODE_ENV === 'production') {
    // Cloud production with no DB URL is always a misconfiguration.
    throw new Error('[FATAL] DATABASE_URL missing in production. Refusing to start without a database.');
  }
  const label = isElectronBackend ? 'Electron offline mode' : 'DEV no-DB mode';
  console.log(`[DB] ${label} — no DATABASE_URL present, using in-memory mock storage.`);
}

// Pool configuration: explicit limits to avoid unbounded connections.
// In production with high traffic, consider pgBouncer for connection pooling.
const POOL_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  max: 10,           // max connections in pool
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

export const pool = isNoDbMode ? null : new Pool(POOL_CONFIG);
export const db = isNoDbMode ? null : drizzle(pool!, { schema });

if (!isNoDbMode) {
  console.log(`[DB] Pool configured: max=${POOL_CONFIG.max}, idleTimeout=${POOL_CONFIG.idleTimeoutMillis}ms`);
}
