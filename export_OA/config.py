"""환경설정 로드 — export_OA/.env 파일 하나만 바라본다."""

import os
import re
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(ENV_PATH)

# "만료 없음"을 뜻하는 고정 값. db/migrations/001_krs_tables.sql 의 기본값과 반드시 같아야 한다.
NO_EXPIRY = "9999-12-31T23:59:59+00:00"

KRS_BASE_URL = "https://api.korearental.co.kr/krsmart"


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"[설정 오류] {ENV_PATH} 파일에 {name} 값을 넣어주세요.")
    return value


def krs_auth_key() -> str:
    return _required("KRS_AUTH_KEY")


def krs_token() -> str:
    return os.getenv("KRS_TOKEN", "").strip()


def supabase_url() -> str:
    return _required("SUPABASE_URL").rstrip("/")


def supabase_service_role_key() -> str:
    return _required("SUPABASE_SERVICE_ROLE_KEY")


def fetch_start_date() -> str:
    return os.getenv("FETCH_START_DATE", "").strip() or "2015-01-01"


def fetch_end_date() -> str:
    return os.getenv("FETCH_END_DATE", "").strip() or date.today().isoformat()


def acins_start_date() -> str:
    return os.getenv("ACINS_START_DATE", "").strip() or date.today().isoformat()


def save_krs_token(new_token: str) -> None:
    """새로 발급받은 토큰을 .env의 KRS_TOKEN 줄에 덮어쓴다(값은 화면에 출력하지 않는다)."""
    os.environ["KRS_TOKEN"] = new_token
    content = ENV_PATH.read_text(encoding="utf-8") if ENV_PATH.exists() else ""
    line = f"KRS_TOKEN={new_token}"

    if re.search(r"^KRS_TOKEN=.*$", content, flags=re.MULTILINE):
        content = re.sub(r"^KRS_TOKEN=.*$", line, content, flags=re.MULTILINE)
    else:
        content = content.rstrip("\n") + "\n" + line + "\n"

    ENV_PATH.write_text(content, encoding="utf-8")
