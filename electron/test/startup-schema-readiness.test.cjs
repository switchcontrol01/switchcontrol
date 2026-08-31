const test = require("node:test");
const assert = require("node:assert/strict");

test("empty databases are recognized as not ready for runtime migrations", async () => {
  const { isCoreSchemaReady } = await import("../../server/lib/startupSchema.ts");
  let queryText = "";
  const client = {
    async query(sql) {
      queryText = sql;
      return { rows: [{ users_table: null }] };
    },
  };

  assert.equal(await isCoreSchemaReady(client), false);
  assert.match(queryText, /to_regclass\('public\.users'\)/);
});

test("initialized databases allow runtime migrations to proceed", async () => {
  const { isCoreSchemaReady } = await import("../../server/lib/startupSchema.ts");
  const client = {
    async query() {
      return { rows: [{ users_table: "users" }] };
    },
  };

  assert.equal(await isCoreSchemaReady(client), true);
});

test("database readiness query failures remain visible to callers", async () => {
  const { isCoreSchemaReady } = await import("../../server/lib/startupSchema.ts");
  const expected = new Error("database unavailable");
  const client = {
    async query() {
      throw expected;
    },
  };

  await assert.rejects(isCoreSchemaReady(client), expected);
});