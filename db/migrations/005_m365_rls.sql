-- m365_users도 krs_*와 같은 성격(전사 인원 이름·소속·라이선스)의 대외비 데이터라
-- 003_krs_rls.sql과 동일한 원칙을 적용한다: RLS를 켜고 일반 로그인 사용자용 정책은 만들지 않는다.
-- service_role 키(서버 코드)로만 조회 가능하다.
ALTER TABLE m365_users ENABLE ROW LEVEL SECURITY;
