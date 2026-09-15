import type { KrsResponse, KrsRentalEquipmentRow } from "./types";

// Design Ref: DESIGN.md — KRS Smart API 문서(https://www.krsmart.com/api/help) 기준
const KRS_BASE_URL = "https://api.korearental.co.kr/krsmart";

function getAuthKey(): string {
  const key = process.env.KRS_AUTH_KEY;
  if (!key) throw new Error("KRS_AUTH_KEY가 .env에 설정되어 있지 않습니다.");
  return key;
}

async function krsPost<T>(pathName: string, body: Record<string, unknown>): Promise<KrsResponse<T>> {
  const res = await fetch(`${KRS_BASE_URL}${pathName}`, {
    method: "POST",
    headers: {
      "Auth-Key": getAuthKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return (await res.json()) as KrsResponse<T>;
}

// 인증키로 당일 유효한 토큰을 새로 발급받는다 (토큰발급 API).
export async function requestNewKrsToken(): Promise<{ code: number; msg: string; token?: string }> {
  const res = await fetch(`${KRS_BASE_URL}/TokenByAuthKey`, {
    method: "POST",
    headers: {
      "Auth-Key": getAuthKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  return (await res.json()) as { code: number; msg: string; token?: string };
}

// 렌탈장비현황 조회 (getRentalEqpmntList) — 토큰 외 추가 파라미터가 필요 없다.
export async function fetchRentalEquipmentList(token: string): Promise<KrsResponse<KrsRentalEquipmentRow>> {
  return krsPost<KrsRentalEquipmentRow>("/getRentalEqpmntList", { token });
}
