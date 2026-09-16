"""Supabase 접근 — REST(PostgREST) API만 사용한다.

service_role 키로 호출하므로 Postgres 접속 비밀번호가 필요 없다.
행 하나마다 요청을 보내면 수천 건에서 너무 느려지므로, 조회는 페이징으로 한 번에 읽고
쓰기는 여러 건을 묶어서(batch) 보낸다.
"""

import requests

import config

TIMEOUT_SECONDS = 120
PAGE_SIZE = 1000  # 한 번에 읽어올 행 수
INSERT_CHUNK = 500  # 한 번에 넣을 행 수
ID_CHUNK = 200  # 한 번에 수정할 id 개수 (URL 길이 제한 때문에 끊는다)


def _headers(extra: dict | None = None) -> dict:
    key = config.supabase_service_role_key()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def _url(table: str) -> str:
    return f"{config.supabase_url()}/rest/v1/{table}"


def _check(res: requests.Response) -> None:
    if not res.ok:
        raise RuntimeError(f"Supabase 요청 실패 ({res.status_code}): {res.text[:300]}")


def load_rows(table: str, columns: tuple[str, ...], only_current: bool) -> list[dict]:
    """테이블의 행을 모두 읽어온다. only_current=True면 아직 만료되지 않은 행만 읽는다."""
    rows: list[dict] = []
    offset = 0

    while True:
        params = {
            "select": ",".join(("id",) + columns),
            "order": "id",
            "limit": PAGE_SIZE,
            "offset": offset,
        }
        if only_current:
            params["valid_to"] = f"eq.{config.NO_EXPIRY}"

        res = requests.get(_url(table), headers=_headers(), params=params, timeout=TIMEOUT_SECONDS)
        _check(res)
        page = res.json()
        rows.extend(page)

        if len(page) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def insert_rows(table: str, rows: list[dict]) -> None:
    """새 행을 넣는다. fetched_at/valid_from/valid_to는 테이블 기본값(=만료없음)이 적용된다."""
    for i in range(0, len(rows), INSERT_CHUNK):
        chunk = rows[i : i + INSERT_CHUNK]
        res = requests.post(
            _url(table),
            headers=_headers({"Prefer": "return=minimal"}),
            json=chunk,
            timeout=TIMEOUT_SECONDS,
        )
        _check(res)


def update_by_ids(table: str, ids: list[int], patch: dict) -> None:
    """id 목록에 해당하는 행들의 값을 한 번에 바꾼다."""
    for i in range(0, len(ids), ID_CHUNK):
        chunk = ids[i : i + ID_CHUNK]
        res = requests.patch(
            _url(table),
            headers=_headers({"Prefer": "return=minimal"}),
            params={"id": f"in.({','.join(str(x) for x in chunk)})"},
            json=patch,
            timeout=TIMEOUT_SECONDS,
        )
        _check(res)


def count_rows(table: str, only_current: bool) -> int:
    """테이블 행 수를 센다(only_current=True면 아직 만료되지 않은 행만)."""
    params = {"select": "id", "limit": 1}
    if only_current:
        params["valid_to"] = f"eq.{config.NO_EXPIRY}"

    res = requests.get(
        _url(table),
        headers=_headers({"Prefer": "count=exact", "Range": "0-0"}),
        params=params,
        timeout=TIMEOUT_SECONDS,
    )
    _check(res)

    # Content-Range 예: "0-0/5041"
    content_range = res.headers.get("Content-Range", "")
    total = content_range.split("/")[-1]
    return int(total) if total.isdigit() else 0
