import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
export async function migrate(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(721815003)`;
      await tx`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
      for (const name of (await readdir("db/migrations")).filter(name => /^\d+_[a-z_]+\.sql$/.test(name)).sort()) {
        const source = await readFile(resolve("db/migrations", name), "utf8");
        const checksum = createHash("sha256").update(source).digest("hex");
        const rows = await tx<{ checksum: string }[]>`SELECT checksum FROM schema_migrations WHERE name = ${name}`;
        if (rows.length) {
          if (rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
          continue;
        }
        await tx.unsafe(source);
        await tx`INSERT INTO schema_migrations(name, checksum) VALUES (${name}, ${checksum})`;
        console.log(`Applied ${name}`);
      }
    });
  } finally { await sql.end({ timeout: 2 }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL explicitly before migrating."); process.exitCode = 1; }
  else await migrate(process.env.DATABASE_URL).catch(error => { console.error("Migration failed:", error.code ?? "MIGRATION_ERROR"); process.exitCode = 1; });
}
