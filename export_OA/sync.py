"""KRS API → Supabase 적재기 (실행 진입점).

적재 규칙 (모든 테이블 공통)
  - fetched_at : 데이터를 가져온 날짜시간
  - valid_to   : 만료 날짜시간. 아직 유효한 행은 9999-12-31 23:59:59
  - 값이 바뀌면 기존 행 valid_to를 "지금"으로 만료시키고, 새 값을 새 행으로 넣는다.
  - 값이 그대로면 새 행을 만들지 않고 fetched_at만 갱신한다.

실행: python export_OA/sync.py
"""

import sys
from datetime import datetime, timezone

# 윈도우 기본 콘솔(cp949)에서 한글·기호가 깨지지 않도록 출력 인코딩을 UTF-8로 맞춘다
sys.stdout.reconfigure(encoding="utf-8")

import config
import krs_api
import supabase_db
from tables import INTEGER_COLUMNS, TABLES, TableSpec, camel_to_snake


def normalize(column: str, value) -> object:
    """빈 문자열은 None으로, 숫자 컬럼은 정수로 맞춘다."""
    if value is None:
        return None

    text = str(value).strip()
    if text == "":
        return None

    if column in INTEGER_COLUMNS:
        try:
            return int(float(text))
        except ValueError:
            return None

    return text


def to_record(spec: TableSpec, api_row: dict) -> dict:
    """API 응답 한 행을 DB 컬럼 형태로 바꾼다. 테이블에 없는 필드는 raw_response에만 남는다."""
    record = {column: None for column in spec.columns}
    for api_field, value in api_row.items():
        column = camel_to_snake(api_field)
        if column in record:
            record[column] = normalize(column, value)
    return record


def natural_key(spec: TableSpec, record: dict) -> tuple:
    return tuple(record.get(column) for column in spec.natural_key)


def sync_table(spec: TableSpec) -> dict:
    """테이블 하나를 동기화하고 결과 요약을 돌려준다."""
    summary = {
        "label": spec.label,
        "table": spec.table,
        "api_rows": 0,
        "inserted": 0,
        "changed": 0,
        "unchanged": 0,
        "skipped": 0,
        "error": None,
    }

    result = krs_api.call_with_token(spec.path, spec.params())
    code = result.get("code")

    if code != 200:
        summary["error"] = f"[{code}] {result.get('msg', '')}"
        return summary

    api_rows = result.get("result") or []
    summary["api_rows"] = len(api_rows)

    existing = supabase_db.load_rows(spec.table, spec.columns, only_current=not spec.history_only)
    by_key = {natural_key(spec, row): row for row in existing}

    to_insert: list[dict] = []
    to_expire: list[int] = []
    to_touch: list[int] = []
    seen: set[tuple] = set()

    for api_row in api_rows:
        record = to_record(spec, api_row)
        key = natural_key(spec, record)

        # 자연키가 비었거나 같은 응답 안에서 중복된 행은 건너뛴다
        if any(part is None for part in key) or key in seen:
            summary["skipped"] += 1
            continue
        seen.add(key)

        old = by_key.get(key)

        if old is None:
            to_insert.append({**record, "raw_response": api_row})
            summary["inserted"] += 1
        elif spec.history_only:
            # 이력 테이블은 이미 들어와 있으면 그대로 둔다
            summary["unchanged"] += 1
        elif any(old.get(column) != record.get(column) for column in spec.columns):
            to_expire.append(old["id"])
            to_insert.append({**record, "raw_response": api_row})
            summary["changed"] += 1
        else:
            to_touch.append(old["id"])
            summary["unchanged"] += 1

    now = datetime.now(timezone.utc).isoformat()

    # 만료를 먼저 처리해야 "현재 유효 행 1건" 유니크 조건과 충돌하지 않는다
    if to_expire:
        supabase_db.update_by_ids(spec.table, to_expire, {"valid_to": now})
    if to_insert:
        supabase_db.insert_rows(spec.table, to_insert)
    if to_touch:
        supabase_db.update_by_ids(spec.table, to_touch, {"fetched_at": now})

    return summary


def print_report(summaries: list[dict]) -> None:
    print("\n" + "=" * 96)
    print("적재 결과")
    print("=" * 96)
    header = f"{'테이블':<26}{'API건수':>9}{'신규':>8}{'변경':>8}{'동일':>8}{'건너뜀':>8}{'DB유효행':>10}"
    print(header)
    print("-" * 96)

    for item in summaries:
        if item["error"]:
            print(f"{item['table']:<26}{'-':>9}{'-':>8}{'-':>8}{'-':>8}{'-':>8}{item['db_rows']:>10}"
                  f"   실패: {item['error']}")
        else:
            print(
                f"{item['table']:<26}{item['api_rows']:>9}{item['inserted']:>8}{item['changed']:>8}"
                f"{item['unchanged']:>8}{item['skipped']:>8}{item['db_rows']:>10}"
            )

    print("-" * 96)
    total = sum(item["db_rows"] for item in summaries)
    print(f"{'합계':<26}{'':>9}{'':>8}{'':>8}{'':>8}{'':>8}{total:>10}")
    print()


def main() -> int:
    print(f"조회 기간: {config.fetch_start_date()} ~ {config.fetch_end_date()}")
    print(f"자산실사 생성일자: {config.acins_start_date()}\n")

    summaries = []
    for spec in TABLES:
        print(f"→ {spec.label} ({spec.table}) 수집 중...")
        try:
            summary = sync_table(spec)
        except Exception as err:  # 한 테이블이 실패해도 나머지는 계속 진행한다
            summary = {
                "label": spec.label,
                "table": spec.table,
                "api_rows": 0,
                "inserted": 0,
                "changed": 0,
                "unchanged": 0,
                "skipped": 0,
                "error": str(err)[:200],
            }

        try:
            summary["db_rows"] = supabase_db.count_rows(
                spec.table, only_current=not spec.history_only
            )
        except Exception as err:
            summary["db_rows"] = 0
            summary["error"] = summary["error"] or f"행 수 조회 실패: {err}"

        summaries.append(summary)

    print_report(summaries)

    return 1 if any(item["error"] for item in summaries) else 0


if __name__ == "__main__":
    sys.exit(main())
