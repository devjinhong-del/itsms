import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 관리자 메뉴 하위 페이지는 URL을 직접 입력해도 admin 역할이 아니면 볼 수 없게 막는다.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "admin") redirect("/");
}
