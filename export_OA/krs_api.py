"""KRS Smart API 호출 (문서: https://www.krsmart.com/api/help).

문서에는 "JSON 본문에 token을 넣으라"고 적혀 있지만, 실제 서버는 JSON 바디를 읽지 않고
쿼리스트링(URL 파라미터)에서 token 등을 읽는다(직접 테스트로 확인됨 — 실제 동작이 문서와 다르다).
그래서 모든 파라미터를 쿼리스트링으로 보낸다.
토큰은 당일만 유효하므로, 미리 만료를 계산하지 않고 "실패하면 새로 발급받아 한 번 재시도"한다.
"""

import requests

import config

# 토큰이 없거나(902) 유효하지 않거나(900) 만료된(901) 경우 → 재발급 후 재시도 대상
TOKEN_ERROR_CODES = {900, 901, 902}

TIMEOUT_SECONDS = 120


def _post(path: str, query_params: dict) -> dict:
    res = requests.post(
        f"{config.KRS_BASE_URL}{path}",
        headers={"Auth-Key": config.krs_auth_key()},
        params=query_params,
        timeout=TIMEOUT_SECONDS,
    )
    res.raise_for_status()
    return res.json()


def issue_new_token() -> str:
    """인증키로 당일 토큰을 새로 발급받아 .env에 저장한다."""
    result = _post("/TokenByAuthKey", {})
    code = result.get("code")
    msg = result.get("msg", "")
    token = result.get("token")

    if code != 200 or not token:
        raise RuntimeError(f"토큰 발급 실패: [{code}] {msg}")

    config.save_krs_token(token)
    return token


def call_with_token(path: str, params: dict) -> dict:
    """현재 토큰으로 호출하고, 토큰 문제면 재발급 후 한 번만 재시도한다."""
    token = config.krs_token() or issue_new_token()

    result = _post(path, {"token": token, **params})

    if result.get("code") in TOKEN_ERROR_CODES:
        token = issue_new_token()
        result = _post(path, {"token": token, **params})

    return result
