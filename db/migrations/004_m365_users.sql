-- M365(PowerShell로 내보낸 CSV) 사용자·라이선스 데이터를 적재하는 표.
-- 한 사람이 라이선스를 여러 개 쓰면, 그 사람은 여러 행(라이선스마다 한 행)으로 들어간다.
--
-- 다른 표(krs_*)와 같은 규칙: 값이 바뀌면 기존 행을 만료시키고 새 행을 넣는다(SCD2).
--   created_at   : 이 행이 처음 생긴 날짜시간
--   validated_at : 이 값이 그대로라고 마지막으로 확인(재검증)한 날짜시간
--   expired_at   : 만료된 날짜시간. 아직 유효하면 9999-12-31 23:59:59(=만료 없음, krs_* 표와 동일한 값)

CREATE TABLE IF NOT EXISTS m365_users (
    id              BIGSERIAL PRIMARY KEY,

    account         TEXT NOT NULL,      -- 계정(UPN) — 자연키의 일부
    license         TEXT,               -- 사용 중인 라이선스 1개(NULL = 라이선스 없음) — 자연키의 일부

    name            TEXT,               -- 이름 규칙 적용 결과 (한글 시작이면 첫 공백 전까지, 그 외엔 전체)
    display_name    TEXT,               -- 원본 "이름(DisplayName)" 칼럼 그대로(참고용)
    division        TEXT,               -- OO본부
    office          TEXT,               -- OO실
    team            TEXT,               -- OO팀
    department_raw  TEXT,               -- 원본 부서 문자열 전체(본부/실/팀 어디에도 안 걸리면 이 값이 곧 소속명)

    raw_response    JSONB,              -- CSV 원본 행 전체(안전망)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expired_at      TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMPTZ '9999-12-31 23:59:59+00'
);

-- 같은 계정+라이선스 조합의 "현재 유효한" 행은 하나만 존재해야 한다.
-- license가 NULL(라이선스 없음)인 경우도 하나만 허용하려면 COALESCE로 NULL을 고정 문자열로 치환해야 한다
-- (SQL에서 NULL끼리는 서로 다른 값으로 취급되어 그냥 UNIQUE(account, license)로는 중복이 막히지 않는다).
CREATE UNIQUE INDEX IF NOT EXISTS ux_m365_users_current
    ON m365_users (account, COALESCE(license, '__NONE__'))
    WHERE expired_at = TIMESTAMPTZ '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS ix_m365_users_account ON m365_users (account);
