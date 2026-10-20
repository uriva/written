import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: /(^|[/@])(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url) ? false : "require",
});

try {
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
} finally {
  await sql.end();
}
