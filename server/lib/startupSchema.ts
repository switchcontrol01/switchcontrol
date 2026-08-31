export type SchemaQueryClient = {
  query: (queryText: string) => Promise<{
    rows: Array<{ users_table?: string | null }>;
  }>;
};

/**
 * The app's runtime migrations extend an already-created application schema.
 * A missing users table means the database is fresh rather than partially
 * migrated, so callers can wait for the normal schema setup instead of
 * reporting a cascade of missing-table errors.
 */
export async function isCoreSchemaReady(
  client: SchemaQueryClient,
): Promise<boolean> {
  const result = await client.query(
    "SELECT to_regclass('public.users') AS users_table",
  );
  return Boolean(result.rows[0]?.users_table);
}