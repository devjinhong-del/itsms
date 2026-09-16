-- 로그인 사용자 프로필 테이블
-- auth.users(Supabase Auth가 관리하는 계정 테이블)에 이메일/비밀번호는 이미 저장되므로,
-- 여기서는 화면에 보여줄 이름·소속·사진과 "역할(role)"만 1:1로 따로 관리한다.

CREATE TABLE IF NOT EXISTS profiles (
    id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    email        text NOT NULL,
    name         text,
    department   text,
    photo_url    text,
    role         text NOT NULL DEFAULT 'general' CHECK (role IN ('general', 'manager', 'admin')),
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- 새 계정이 auth.users에 생기면 profiles 행을 자동으로 만들어준다(기본 역할: general).
-- 그래야 관리자가 Supabase 대시보드나 scripts/create-user.ts로 계정을 만들 때마다
-- profiles insert를 따로 안 해줘도 된다(스크립트에서 이름/부서/역할만 이어서 채운다).
-- SECURITY DEFINER 함수는 auth 스키마 트리거에서 호출될 때 search_path에 public이
-- 없을 수 있어 테이블명을 public.profiles로 명시해야 한다(그냥 profiles라고만 쓰면 실패한다).
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- RLS: 로그인한 사용자는 자기 자신의 행만 보고 고칠 수 있다.
-- 전체 조회·역할(role) 변경 같은 관리자 작업은 src/lib/db/supabaseAdmin.ts의
-- service_role 클라이언트(= RLS를 무시함)로 처리한다.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select own profile" ON profiles;
CREATE POLICY "select own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "update own profile" ON profiles;
CREATE POLICY "update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);
