"""환경설정 로드 — export_m365/.env 파일 하나만 바라본다."""

import os
from pathlib import Path

from dotenv import load_dotenv

ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(ENV_PATH)

# "만료 없음"을 뜻하는 고정 값. itsms DB의 db/migrations/004_m365_users.sql 기본값과 반드시 같아야 한다.
NO_EXPIRY = "9999-12-31T23:59:59+00:00"

CSV_DIR = Path(__file__).parent


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"[설정 오류] {ENV_PATH} 파일에 {name} 값을 넣어주세요.")
    return value


def supabase_url() -> str:
    return _required("SUPABASE_URL").rstrip("/")


def supabase_service_role_key() -> str:
    return _required("SUPABASE_SERVICE_ROLE_KEY")
