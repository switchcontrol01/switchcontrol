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

// Pool configuration tuned for ~10k registered users on Replit managed Postgres.
// Replit's managed Postgres typically allows 25–100 connections depending on plan.
// We claim 25, leaving headroom for migrations, admin tools, and future replicas.
//
// idleTimeoutMillis: release idle connections quickly so the pool doesn't hold
//   slots that other parts of the system (or future clustering) could use.
// connectionTimeoutMillis: generous 8s — under burst load a connection may queue
//   briefly; failing at 5s was too aggressive and produced spurious 500s.
const POOL_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  max: 25,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 8_000,
};

export const pool = isNoDbMode ? null : new Pool(POOL_CONFIG);
export const db = isNoDbMode ? null : drizzle(pool!, { schema });

if (!isNoDbMode) {
  console.log(`[DB] Pool configured: max=${POOL_CONFIG.max}, idleTimeout=${POOL_CONFIG.idleTimeoutMillis}ms`);
  // Prevent unhandled 'error' events from crashing the process when the DB
  // drops a connection (e.g. during Replit managed-DB maintenance restarts).
  pool!.on("error", (err) => {
    console.error("[DB] Pool idle-client error (non-fatal):", err.message);
  });
}
