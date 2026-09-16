"""M365 라이선스 총량 CSV(M365_License_Report.csv) → Supabase m365_license_total 테이블 적재.

적재 규칙 (itsms의 db/migrations/008_m365_license_total.sql과 동일)
  - created_at   : 이 행이 처음 생긴 날짜시간(= 이 수량이 적재된 시각)
  - validated_at : 이 값이 그대로라고 마지막으로 확인한 날짜시간
  - expired_at   : 만료된 날짜시간. 아직 유효하면 9999-12-31 23:59:59
  - 같은 SKU의 수량·이름이 그대로면 validated_at만 갱신(행을 새로 만들지 않는다)
  - 수량이 바뀌었으면 기존 행을 만료시키고 새 행을 추가 → 수량 변화 이력이 그대로 남는다
  - 이번 CSV에 더는 없는 SKU(구독 해지 등)는 만료 처리(삭제하지 않는다)

실행:
    cd export_m365
    python sync_m365_license.py                 # 폴더 안의 M365_License_Report.csv 사용
    python sync_m365_license.py 다른파일.csv     # 파일을 직접 지정할 수도 있다
"""

import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

import config
import supabase_db

TABLE = "m365_license_total"
DEFAULT_CSV_NAME = "M365_License_Report.csv"

# CSV 헤더 → DB 컬럼
COLUMN_MAP = {
    "라이선스 이름 (SkuPartNumber)": "sku_part_number",
    "총 구매/구독 수량": "total_units",
    "할당된 수량": "assigned_units",
    "잔여 수량": "remaining_units",
    "SKU ID": "sku_id",
}

# 값이 그대로인지 비교할 업무 컬럼(sku_id는 자연키라서 비교 대상에서 제외)
COMPARE_COLUMNS = ("sku_part_number", "total_units", "assigned_units", "remaining_units")


def find_csv_file(argv: list[str]) -> Path:
    if len(argv) > 1:
        path = Path(argv[1])
        if not path.is_absolute():
            path = config.CSV_DIR / path
        if not path.exists():
            raise SystemExit(f"CSV 파일을 찾지 못했습니다: {path}")
        return path

    path = config.CSV_DIR / DEFAULT_CSV_NAME
    if not path.exists():
        raise SystemExit(
            f"{path} 파일이 없습니다.\n"
            "먼저 export_m365_license_total.ps1을 실행해 CSV를 만들고 이 폴더에 두세요."
        )
    return path


def to_int(value: str | None) -> int | None:
    text = (value or "").strip().replace(",", "")
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def read_records(csv_path: Path) -> list[dict]:
    records: list[dict] = []

    # utf-8-sig: 앞의 BOM을 자동으로 제거해서 읽어준다(PowerShell이 utf8BOM으로 저장한다)
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        missing = [c for c in COLUMN_MAP if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"CSV 헤더에서 다음 칼럼을 찾지 못했습니다: {missing}")

        for row in reader:
            sku_id = (row["SKU ID"] or "").strip()
            if not sku_id:
                continue

            records.append(
                {
                    "sku_id": sku_id,
                    "sku_part_number": (row["라이선스 이름 (SkuPartNumber)"] or "").strip() or None,
                    "total_units": to_int(row["총 구매/구독 수량"]),
                    "assigned_units": to_int(row["할당된 수량"]),
                    "remaining_units": to_int(row["잔여 수량"]),
                    "raw_response": dict(row),
                }
            )

    return records


def main() -> int:
    csv_path = find_csv_file(sys.argv)
    print(f"CSV 파일: {csv_path.name}")

    incoming_list = read_records(csv_path)

    incoming: dict[str, dict] = {}
    duplicate_skipped = 0
    for rec in incoming_list:
        if rec["sku_id"] in incoming:
            duplicate_skipped += 1
            continue
        incoming[rec["sku_id"]] = rec

    existing_rows = supabase_db.load_rows(TABLE, ("sku_id",) + COMPARE_COLUMNS, only_current=True)
    existing = {r["sku_id"]: r for r in existing_rows}

    to_insert: list[dict] = []
    to_expire_ids: list[int] = []
    to_touch_ids: list[int] = []
    changed = 0
    unchanged = 0

    for sku_id, rec in incoming.items():
        old = existing.get(sku_id)
        if old is None:
            to_insert.append(rec)
            continue

        is_same = all(old.get(c) == rec.get(c) for c in COMPARE_COLUMNS)
        if is_same:
            to_touch_ids.append(old["id"])
            unchanged += 1
        else:
            to_expire_ids.append(old["id"])
            to_insert.append(rec)
            changed += 1

    orphan_expired = 0
    for sku_id, old in existing.items():
        if sku_id not in incoming:
            to_expire_ids.append(old["id"])
            orphan_expired += 1

    now = datetime.now(timezone.utc).isoformat()

    # 만료를 먼저 처리해야 "현재 유효 행 1건" 유니크 조건과 충돌하지 않는다
    if to_expire_ids:
        supabase_db.update_by_ids(TABLE, to_expire_ids, {"expired_at": now})
    if to_insert:
        supabase_db.insert_rows(TABLE, to_insert)
    if to_touch_ids:
        supabase_db.update_by_ids(TABLE, to_touch_ids, {"validated_at": now})

    final_count = supabase_db.count_rows(TABLE, only_current=True)
    inserted_new = len(to_insert) - changed

    print("\n적재 결과")
    print("-" * 60)
    print(f"CSV 행 수(라이선스 종류)   : {len(incoming_list)}")
    print(f"중복이라 건너뜀            : {duplicate_skipped}")
    print(f"신규                       : {inserted_new}")
    print(f"변경(만료+새로 추가)        : {changed}")
    print(f"동일(검증일만 갱신)         : {unchanged}")
    print(f"더 이상 없어서 만료         : {orphan_expired}")
    print(f"현재 DB 유효 행 수          : {final_count}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
