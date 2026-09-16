-- krs_* 테이블(렌탈업체 API로 받아온 원본 자산 데이터)은 전사 인원의 이름·소속·배정 장비가
-- 통째로 들어있는 대외비 데이터다(PRD.md 7번). 로그인 기능이 붙기 전에는 신경쓰지 않아도 됐지만,
-- 이제 로그인 사용자가 생겼으니 "일반 로그인 사용자도 API로 직접 조회 가능한 상태"를 막아야 한다.
--
-- RLS를 켜고 anon/authenticated용 정책을 하나도 만들지 않으면, service_role 키(서버 코드,
-- src/lib/db/supabaseAdmin.ts)로만 읽고 쓸 수 있고 로그인한 일반 사용자의 브라우저 요청으로는
-- 전혀 조회되지 않는다. 화면에는 관리자 전용 서버 코드가 필요한 요약만 골라서 보여준다.

ALTER TABLE krs_rental_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE krs_customer_oper_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE krs_oper_asset_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE krs_asset_record_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE krs_asset_acins ENABLE ROW LEVEL SECURITY;
ALTER TABLE krs_token_log ENABLE ROW LEVEL SECURITY;
