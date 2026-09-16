"""M365 CSV(export_m365/*.csv) → Supabase m365_users 테이블 적재.

적재 규칙 (itsms의 db/migrations/004_m365_users.sql과 동일)
  - created_at   : 이 행이 처음 생긴 날짜시간
  - validated_at : 이 값이 그대로라고 마지막으로 확인한 날짜시간
  - expired_at   : 만료된 날짜시간. 아직 유효하면 9999-12-31 23:59:59
  - 같은 사람(계정)+같은 라이선스 조합이 그대로면 validated_at만 갱신
  - 값이 바뀌었으면 기존 행을 만료시키고 새 행을 추가
  - 이번 CSV에 더는 나타나지 않는 조합(계정 삭제·라이선스 해제 등)은 만료 처리

실행: python sync_m365.py
"""

import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

import config
import supabase_db
from parse import extract_name, normalize_account, parse_department, parse_licenses

TABLE = "m365_users"
NONE_KEY = "__NONE__"

# 값이 그대로인지 비교할 업무 컬럼(계정/라이선스는 자연키라서 비교 대상에서 제외)
COMPARE_COLUMNS = ("name", "display_name", "division", "office", "team", "department_raw")


def find_csv_file() -> Path:
    # 같은 폴더에 라이선스 총량 CSV(M365_License_Report.csv)도 있으므로,
    # 사용자 리포트 파일 이름으로만 후보를 좁힌다(잘못된 CSV를 집는 것을 막는다).
    files = sorted(
        config.CSV_DIR.glob("M365_User_License_Report*.csv"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not files:
        raise SystemExit(f"{config.CSV_DIR}에 M365_User_License_Report*.csv 파일이 없습니다.")
    return files[0]  # 여러 개면 가장 최근 파일


def key_of(account: str, license_: str | None) -> str:
    return f"{account}::{license_ or NONE_KEY}"


def read_records(csv_path: Path) -> list[dict]:
    records: list[dict] = []

    # utf-8-sig: 앞의 BOM을 자동으로 제거해서 읽어준다
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        required = ["이름(DisplayName)", "계정(UPN)", "부서(Department)", "사용 중인 라이선스"]
        missing = [c for c in required if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"CSV 헤더에서 다음 칼럼을 찾지 못했습니다: {missing}")

        for row in reader:
            account = normalize_account(row["계정(UPN)"])
            if not account:
                continue

            display_name = (row["이름(DisplayName)"] or "").strip()
            name = extract_name(display_name)
            dept = parse_department(row["부서(Department)"])
            licenses = parse_licenses(row["사용 중인 라이선스"])

            for license_ in licenses:
                records.append(
                    {
                        "account": account,
                        "license": license_,
                        "name": name,
                        "display_name": display_name,
                        "division": dept.division,
                        "office": dept.office,
                        "team": dept.team,
                        "department_raw": dept.department_raw,
                        "raw_response": dict(row),
                    }
                )

    return records


def main() -> int:
    csv_path = find_csv_file()
    print(f"CSV 파일: {csv_path.name}")

    incoming_list = read_records(csv_path)

    incoming: dict[str, dict] = {}
    duplicate_skipped = 0
    for rec in incoming_list:
        key = key_of(rec["account"], rec["license"])
        if key in incoming:
            duplicate_skipped += 1
            continue
        incoming[key] = rec

    existing_rows = supabase_db.load_rows(
        TABLE, ("account", "license") + COMPARE_COLUMNS, only_current=True
    )
    existing = {key_of(r["account"], r["license"]): r for r in existing_rows}

    to_insert: list[dict] = []
    to_expire_ids: list[int] = []
    to_touch_ids: list[int] = []
    changed = 0
    unchanged = 0

    for key, rec in incoming.items():
        old = existing.get(key)
        if old is None:
            to_insert.append(rec)
            continue

        is_same = all((old.get(c) or None) == (rec.get(c) or None) for c in COMPARE_COLUMNS)
        if is_same:
            to_touch_ids.append(old["id"])
            unchanged += 1
        else:
            to_expire_ids.append(old["id"])
            to_insert.append(rec)
            changed += 1

    orphan_expired = 0
    for key, old in existing.items():
        if key not in incoming:
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

    people_count = len({rec["account"] for rec in incoming_list})
    inserted_new = len(to_insert) - changed

    print("\n적재 결과")
    print("-" * 60)
    print(f"CSV 원본 행 수(사람 기준)       : {people_count}")
    print(f"CSV에서 만든 행 수(사람×라이선스): {len(incoming_list)}")
    print(f"중복이라 건너뜀                : {duplicate_skipped}")
    print(f"신규                           : {inserted_new}")
    print(f"변경(만료+새로 추가)            : {changed}")
    print(f"동일(검증일만 갱신)             : {unchanged}")
    print(f"더 이상 없어서 만료             : {orphan_expired}")
    print(f"현재 DB 유효 행 수              : {final_count}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
