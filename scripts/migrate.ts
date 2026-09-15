// db/migrations 안의 .sql 파일들을 순서대로 실행하는 아주 단순한 마이그레이션 스크립트.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getDbPool } from "../src/lib/db/pool";

async function main() {
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const pool = getDbPool();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(`실행: ${file}`);
    await pool.query(sql);
  }

  console.log("마이그레이션 완료");
  await pool.end();
}

main().catch((err) => {
  console.error("마이그레이션 실패:", err);
  process.exit(1);
});
