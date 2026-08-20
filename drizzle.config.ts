import { defineConfig } from "drizzle-kit";

// Guard: DATABASE_URL is required for drizzle-kit CLI commands (push, generate, etc.).
// We warn instead of throwing so that Electron frontend builds and CI tooling that
// import or evaluate this file without a database connection do not crash at load time.
// The drizzle-kit CLI will fail at the connection step (not here) if the URL is missing.
const databaseUrl = process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn(
    "[drizzle.config] DATABASE_URL is not set. " +
    "drizzle-kit migration commands will not work until it is configured. " +
    "This is expected in Electron build and CI environments."
  );
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "postgres://placeholder:placeholder@localhost/placeholder",
  },
});
