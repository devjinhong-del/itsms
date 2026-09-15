import { getDbPool } from "@/lib/db/pool";
import { requestNewKrsToken } from "./client";
import { updateKrsTokenInEnvFile } from "./envFile";
import { KRS_TOKEN_ERROR_CODES, type KrsResponse } from "./types";

// Plan SC: KRS 토큰은 "당일까지만" 유효하다. 만료 여부를 날짜로 미리 계산하지 않고,
// 호출 실패(코드 900/901/902)를 받았을 때만 새로 발급받아 한 번 재시도한다.
async function refreshKrsToken(): Promise<string> {
  const res = await requestNewKrsToken();

  await getDbPool().query(
    `INSERT INTO krs_token_log (code, msg) VALUES ($1, $2)`,
    [res.code, res.msg],
  );

  if (res.code !== 200 || !res.token) {
    throw new Error(`KRS 토큰 발급 실패: [${res.code}] ${res.msg}`);
  }

  updateKrsTokenInEnvFile(res.token);
  return res.token;
}

// 현재 토큰으로 호출해보고, 토큰 문제(900/901/902)면 새로 발급받아 한 번만 재시도한다.
export async function withValidKrsToken<T>(
  call: (token: string) => Promise<KrsResponse<T>>,
): Promise<KrsResponse<T>> {
  let token = process.env.KRS_TOKEN ?? "";
  if (!token) {
    token = await refreshKrsToken();
  }

  let res = await call(token);

  if (KRS_TOKEN_ERROR_CODES.includes(res.code)) {
    token = await refreshKrsToken();
    res = await call(token);
  }

  return res;
}
