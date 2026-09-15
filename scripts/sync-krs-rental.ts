// 로컬에서 손으로 한 번 실행해서 확인할 때 쓰는 스크립트.
// 운영 단계에서는 Windows 작업 스케줄러 대신 Vercel Cron(vercel.json)이 매시간 이 로직을 자동으로 호출한다.
import "dotenv/config";
import { syncRentalEquipment } from "../src/lib/krs/syncRentalEquipment";
import { getDbPool } from "../src/lib/db/pool";

async function main() {
  const summary = await syncRentalEquipment();
  console.log("렌탈장비현황 동기화 결과:", summary);
  await getDbPool().end();
}

main().catch((err) => {
  console.error("동기화 실패:", err);
  process.exit(1);
});
