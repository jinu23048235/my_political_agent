import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { migrate } from "./migrate";
const url = process.env.DB_TEST_URL;
if (!url || !new URL(url).pathname.endsWith("_test") || url === process.env.DATABASE_URL) throw new Error("DB_TEST_URL must name a separate disposable *_test database.");
await migrate(url);
const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
try {
  await sql.begin(async tx => {
    await tx.unsafe(await readFile("db/tests/foundation.sql", "utf8"));
    throw new Error("ROLLBACK_TEST_FIXTURES");
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== "ROLLBACK_TEST_FIXTURES") throw error;
  console.log("PASS: database policy constraints; all fixtures rolled back.");
} finally { await sql.end({ timeout: 2 }); }
