import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

export const isNoDbMode = !process.env.DATABASE_URL;

if (isNoDbMode) {
  console.log("\n========================================");
  console.log("Running in DEV NO-DB MODE (DATABASE_URL not set)");
  console.log("Database features are disabled. Using mock data.");
  console.log("========================================\n");
}

export const pool = isNoDbMode ? null : new Pool({ connectionString: process.env.DATABASE_URL });
export const db = isNoDbMode ? null : drizzle(pool!, { schema });
