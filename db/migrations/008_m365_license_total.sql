-- M365 테넌트가 "구매/구독 중인 라이선스 총량" 표.
-- 원본: export_m365/M365_License_Report.csv (Get-MgSubscribedSku 결과)
--   "라이선스 이름 (SkuPartNumber)" → sku_part_number
--   "총 구매/구독 수량"             → total_units
--   "할당된 수량"                   → assigned_units
--   "잔여 수량"                     → remaining_units
--   "SKU ID"                        → sku_id
--
-- 다른 표(krs_*, m365_users)와 같은 규칙: 값이 바뀌면 기존 행을 만료시키고 새 행을 넣는다(SCD2).
-- 데이터를 지우지 않으므로 "언제 몇 개를 사서 몇 개를 쓰고 있었는지" 이력이 그대로 남는다.
--   created_at   : 이 행이 처음 생긴 날짜시간(= 이 수량이 적재된 시각)
--   validated_at : 이 값이 그대로라고 마지막으로 확인(재검증)한 날짜시간
--   expired_at   : 만료된 날짜시간. 아직 유효하면 9999-12-31 23:59:59(= 만료 없음)

CREATE TABLE IF NOT EXISTS m365_license_total (
    id                BIGSERIAL PRIMARY KEY,

    sku_id            TEXT NOT NULL,   -- 라이선스 고유 ID(자연키) — 이름이 바뀌어도 이 값은 유지된다
    sku_part_number   TEXT,            -- 라이선스 이름(SkuPartNumber)

    total_units       INTEGER,         -- 총 구매/구독 수량
    assigned_units    INTEGER,         -- 할당된 수량
    remaining_units   INTEGER,         -- 잔여 수량

    raw_response      JSONB,           -- CSV 원본 행 전체(안전망)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expired_at        TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMPTZ '9999-12-31 23:59:59+00'
);

-- 같은 SKU의 "현재 유효한" 행은 하나만 존재해야 한다.
CREATE UNIQUE INDEX IF NOT EXISTS ux_m365_license_total_current
    ON m365_license_total (sku_id)
    WHERE expired_at = TIMESTAMPTZ '9999-12-31 23:59:59+00';

-- 이력 조회(특정 라이선스의 수량 변화)를 위한 인덱스
CREATE INDEX IF NOT EXISTS ix_m365_license_total_sku ON m365_license_total (sku_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_m365_license_total_name ON m365_license_total (sku_part_number);

-- krs_*, m365_users와 동일한 원칙: RLS를 켜고 일반 로그인 사용자용 정책은 만들지 않는다.
-- service_role 키(서버 코드)로만 조회 가능하다.
ALTER TABLE m365_license_total ENABLE ROW LEVEL SECURITY;
