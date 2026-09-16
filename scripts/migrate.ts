// db/migrations 안의 .sql 파일들을 Supabase Management API로 순서대로 실행하는 마이그레이션 스크립트.
// (Postgres 접속 비밀번호 없이, SUPABASE_ACCESS_TOKEN만으로 실행된다.)
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!projectRef || !accessToken) {
    throw new Error("SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN이 .env에 설정되어 있지 않습니다.");
  }

  const dir = path.join(process.cwd(), "db", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(`실행: ${file}`);

    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      throw new Error(`${file} 실행 실패 (${res.status}): ${await res.text()}`);
    }
  }

  console.log("마이그레이션 완료");
}

main().catch((err) => {
  console.error("마이그레이션 실패:", err);
  process.exit(1);
});
