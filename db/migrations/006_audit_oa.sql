-- 자산현황실사(OA 자산 실사) 결과를 저장하는 표.
-- 한 자산(asset_no)에 대해 실사를 다시 하면(재실사·정보 수정 후 재제출), 기존 행을 만료시키고
-- 새 행을 추가한다 — 다른 표(krs_*, m365_users)와 같은 규칙이라 이력이 전부 남는다.
--
--   created_at : 이 실사 결과가 들어온 날짜시간 (인풋데이트타임)
--   expired_at : 만료된 날짜시간. 아직 유효(=가장 최근 실사 결과)하면 9999-12-31 23:59:59

CREATE TABLE IF NOT EXISTS audit_oa (
    id                  BIGSERIAL PRIMARY KEY,

    asset_no            TEXT NOT NULL,              -- 자산번호 (자연키)
    asset_user_org      TEXT,                       -- 자산사용자조직
    asset_user_name     TEXT,                       -- 자산사용자이름
    inspector_org       TEXT,                       -- 실사한사람조직
    inspector_name      TEXT,                       -- 실사한사람이름

    -- 로그인 계정과 연결(누가 이 실사를 실제로 제출했는지 추적용). 실사자 본인이 스스로 제출하는
    -- 구조라 RLS에서 "본인 실사 건만 조회/제출 가능"의 기준이 된다.
    inspector_user_id   UUID REFERENCES profiles (id),

    is_edited           BOOLEAN NOT NULL DEFAULT FALSE, -- 편집여부: 미리 채워진 자산·사용자 정보를 실사자가 고쳐서 "변경 제출"했는지
    photo_url           TEXT,                       -- 실사 시 찍은 사진의 저장 경로/URL(Supabase Storage 등)
    remark              TEXT,                       -- 비고(불일치 사유 등 자유 기재)

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expired_at          TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMPTZ '9999-12-31 23:59:59+00'
);

-- 자산번호(asset_no)당 "현재 유효한(가장 최근) 실사 결과"는 하나만 존재해야 한다.
CREATE UNIQUE INDEX IF NOT EXISTS ux_audit_oa_current
    ON audit_oa (asset_no)
    WHERE expired_at = TIMESTAMPTZ '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS ix_audit_oa_asset_no ON audit_oa (asset_no);
CREATE INDEX IF NOT EXISTS ix_audit_oa_inspector_user_id ON audit_oa (inspector_user_id);

-- RLS: 로그인 사용자는 "본인이 실사자로 제출한" 행만 만들고 볼 수 있다.
-- 기존 행을 만료시키는 작업(재실사 시 이전 기록 만료)은 서버 코드가 service_role로 처리한다
-- (일반 사용자에게 UPDATE 권한을 주지 않음 — 이력 위·변조 방지).
-- 관리자 전용 전사 모니터링(/admin/inspection-monitoring)은 getSupabaseAdmin()(service_role, RLS 우회)로 조회한다.
ALTER TABLE audit_oa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert own audit" ON audit_oa;
CREATE POLICY "insert own audit" ON audit_oa
    FOR INSERT WITH CHECK (auth.uid() = inspector_user_id);

DROP POLICY IF EXISTS "select own audit" ON audit_oa;
CREATE POLICY "select own audit" ON audit_oa
    FOR SELECT USING (auth.uid() = inspector_user_id);
