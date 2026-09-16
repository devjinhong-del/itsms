-- 사용자 접속 로그: 로그인 시점과 화면 이동(페이지 조회) 기록.
-- 관리자 메뉴의 "사용자 접속 로그" 화면에서 조회한다.
CREATE TABLE IF NOT EXISTS access_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES profiles (id),
    user_email TEXT,
    user_name TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('login', 'page_view')),
    path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_logs_created_at_idx ON access_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS access_logs_user_id_idx ON access_logs (user_id);

-- 로그는 서버 코드(service_role)만 쓰고 읽는다. 일반 로그인 사용자에게는 전부 잠근다.
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
