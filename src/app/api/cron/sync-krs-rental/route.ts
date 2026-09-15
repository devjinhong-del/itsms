import { NextRequest, NextResponse } from "next/server";
import { syncRentalEquipment } from "@/lib/krs/syncRentalEquipment";

// Design Ref: DESIGN.md §3 ① — Vercel Cron이 매시간 이 라우트를 호출해 렌탈장비현황을 동기화한다.
// Vercel Cron은 CRON_SECRET 환경변수가 설정되어 있으면 Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 붙여서 호출한다.
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await syncRentalEquipment();
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
