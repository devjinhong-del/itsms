import { Pool } from "pg";

// Design Ref: DESIGN.md §4 — DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD는 .env에서만 읽는다.
let pool: Pool | undefined;

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
  }
  return pool;
}
