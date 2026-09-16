// 사내 DB(자산·M365 사용자·라이선스·실사 내역)를 RAG 챗봇 학습 자료로 넣는다.
// 실행: npx tsx scripts/rag-index-db.ts
import "dotenv/config";
import { ingestDatabase } from "../src/lib/rag/ingest";

async function main() {
  console.log("사내 DB를 읽어 학습 자료로 만드는 중...");
  const results = await ingestDatabase("system");
  for (const item of results) {
    console.log(`  ${item.title} — ${item.chunkCount}개 조각`);
  }
  console.log(`완료 — 총 ${results.reduce((sum, item) => sum + item.chunkCount, 0)}개 조각`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
