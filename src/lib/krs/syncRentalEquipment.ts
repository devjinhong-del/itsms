import type { PoolClient } from "pg";
import { getDbPool } from "@/lib/db/pool";
import { fetchRentalEquipmentList } from "./client";
import { withValidKrsToken } from "./token";
import type { KrsRentalEquipmentRow } from "./types";

// 만료 없음을 뜻하는 고정 값 — db/migrations/001_krs_tables.sql 과 반드시 같은 값을 써야 한다.
const NO_EXPIRY = "9999-12-31 23:59:59+00";

// KRS 응답 필드(camelCase) → DB 칼럼(snake_case) 매핑.
// 이 목록에 있는 칼럼만 "값이 바뀌었는지" 비교 대상이 된다(감사용 칼럼 fetched_at/valid_from/valid_to/raw_response는 제외).
const FIELD_MAP: [keyof KrsRentalEquipmentRow, string][] = [
  ["dlivySlipNo", "dlivy_slip_no"],
  ["assetDiv", "asset_div"],
  ["recptUser", "recpt_user"],
  ["prdctName", "prdct_name"],
  ["modelName", "model_name"],
  ["itemName", "item_name"],
  ["serialNo", "serial_no"],
  ["cntrctStatus", "cntrct_status"],
  ["dlivyDate", "dlivy_date"],
  ["dlivyClass", "dlivy_class"],
  ["exchngAssetNo", "exchng_asset_no"],
  ["returnPrnmntDate", "return_prnmnt_date"],
  ["rentalFee", "rental_fee"],
  ["recptDate", "recpt_date"],
  ["deptCode", "dept_code"],
  ["deptName", "dept_name"],
  ["userId", "user_id"],
  ["userName", "user_name"],
  ["cntrctNo", "cntrct_no"],
  ["manufCode", "manuf_code"],
  ["manufName", "manuf_name"],
  ["modelCode", "model_code"],
  ["objDiv", "obj_div"],
  ["objSn", "obj_sn"],
  ["dlivyQty", "dlivy_qty"],
  ["bsnMan", "bsn_man"],
  ["bsnManName", "bsn_man_name"],
  ["userSpec", "user_spec"],
  ["remark", "remark"],
  ["bcncCode", "bcnc_code"],
  ["bcncName", "bcnc_name"],
  ["operDiv", "oper_div"],
  ["operStatus", "oper_status"],
  ["operStatusDiv", "oper_status_div"],
  ["assetInfoDiv", "asset_info_div"],
  ["assetInfoStr", "asset_info_str"],
  ["wrhsDate", "wrhs_date"],
  ["remark1", "remark1"],
  ["remark2", "remark2"],
  ["acinsStartDate", "acins_start_date"],
  ["operDate", "oper_date"],
  ["cnsulNo", "cnsul_no"],
  ["applcnt", "applcnt"],
  ["hdqrtrs", "hdqrtrs"],
  ["team", "team"],
  ["memo", "memo"],
  ["memo2", "memo2"],
  ["memo3", "memo3"],
  ["regUser", "reg_user"],
  ["assetDivChangeDate", "asset_div_change_date"],
  ["wrhsDateStart", "wrhs_date_start"],
  ["wrhsDateEnd", "wrhs_date_end"],
  ["operDateStart", "oper_date_start"],
  ["operDateEnd", "oper_date_end"],
  ["dlivyDateStart", "dlivy_date_start"],
  ["dlivyDateEnd", "dlivy_date_end"],
  ["returnDateStart", "return_date_start"],
  ["returnDateEnd", "return_date_end"],
  ["operAssetCnt", "oper_asset_cnt"],
  ["assetListStr", "asset_list_str"],
];

export interface SyncSummary {
  totalFromApi: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

function normalize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s === "" ? null : s;
}

async function upsertOne(client: PoolClient, row: KrsRentalEquipmentRow): Promise<"inserted" | "updated" | "unchanged"> {
  const values = FIELD_MAP.map(([apiField]) => normalize(row[apiField]));

  const current = await client.query<{ id: number } & Record<string, string | null>>(
    `SELECT id, ${FIELD_MAP.map(([, col]) => col).join(", ")}
       FROM krs_rental_equipment
      WHERE asset_no = $1 AND valid_to = TIMESTAMPTZ '${NO_EXPIRY}'`,
    [row.assetNo],
  );

  if (current.rowCount === 0) {
    await client.query(
      `INSERT INTO krs_rental_equipment
         (asset_no, ${FIELD_MAP.map(([, col]) => col).join(", ")}, raw_response, fetched_at, valid_from, valid_to)
       VALUES
         ($1, ${FIELD_MAP.map((_, i) => `$${i + 2}`).join(", ")}, $${FIELD_MAP.length + 2}, now(), now(), TIMESTAMPTZ '${NO_EXPIRY}')`,
      [row.assetNo, ...values, JSON.stringify(row)],
    );
    return "inserted";
  }

  const existing = current.rows[0];
  const changed = FIELD_MAP.some(([, col], i) => (existing[col] ?? null) !== values[i]);

  if (!changed) {
    await client.query(`UPDATE krs_rental_equipment SET fetched_at = now() WHERE id = $1`, [existing.id]);
    return "unchanged";
  }

  await client.query(`UPDATE krs_rental_equipment SET valid_to = now() WHERE id = $1`, [existing.id]);
  await client.query(
    `INSERT INTO krs_rental_equipment
       (asset_no, ${FIELD_MAP.map(([, col]) => col).join(", ")}, raw_response, fetched_at, valid_from, valid_to)
     VALUES
       ($1, ${FIELD_MAP.map((_, i) => `$${i + 2}`).join(", ")}, $${FIELD_MAP.length + 2}, now(), now(), TIMESTAMPTZ '${NO_EXPIRY}')`,
    [row.assetNo, ...values, JSON.stringify(row)],
  );
  return "updated";
}

// Design Ref: DESIGN.md §3 ① — 렌탈사이트 API로 장비 데이터를 가져와 저장한다 (PLAN 작업 4).
export async function syncRentalEquipment(): Promise<SyncSummary> {
  const res = await withValidKrsToken((token) => fetchRentalEquipmentList(token));

  if (res.code !== 200) {
    throw new Error(`KRS getRentalEqpmntList 실패: [${res.code}] ${res.msg}`);
  }

  const rows = res.result ?? [];
  const summary: SyncSummary = { totalFromApi: rows.length, inserted: 0, updated: 0, unchanged: 0, skipped: 0 };

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      if (!row.assetNo) {
        summary.skipped += 1;
        continue;
      }
      const result = await upsertOne(client, row);
      summary[result] += 1;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return summary;
}
