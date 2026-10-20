import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Sql = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  writtenSql?: Sql;
  writtenDb?: Database;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add a PostgreSQL connection string to .env.local (see .env.example)."
    );
  }
  return url;
}

/**
 * Lazily create the PostgreSQL client so builds do not need a database and a
 * missing DATABASE_URL produces a clear runtime error instead of a crash at
 * import time.
 */
export function getDb(): Database {
  if (globalForDb.writtenDb) return globalForDb.writtenDb;

  const url = connectionString();
  const isLocal = /(^|[/@])(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);

  const sql = postgres(url, {
    // Works with pgbouncer / transaction poolers as well as direct connections.
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: isLocal ? false : "require",
  });

  const db = drizzle(sql, { schema });
  globalForDb.writtenSql = sql;
  globalForDb.writtenDb = db;
  return db;
}

export type { Database };
export { schema };
