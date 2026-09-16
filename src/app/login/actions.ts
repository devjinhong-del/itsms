"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordAccessLog } from "@/lib/db/accessLog";

// 로그인 화면에는 이메일 대신 짧은 ID(예: jinhong)만 입력받고, Supabase Auth가 실제로 요구하는
// 이메일 형식은 서버에서 사내 도메인을 붙여 만든다. m365_users.account 값(XXXX@jeisys.com)과
// 형식을 맞춰야 계정 생성 스크립트로 만든 계정과 그대로 일치한다.
const LOGIN_EMAIL_DOMAIN = "jeisys.com";

// 휴대폰·태블릿에서 로그인하면 대시보드 대신 바로 자산 실사 화면으로 보낸다.
// (현장에서 바코드를 찍으려고 들어오는 경우가 대부분이라 한 단계를 줄인다)
const MOBILE_UA = /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Opera Mini|Mobile Safari|SamsungBrowser/i;

async function landingPath() {
  const userAgent = (await headers()).get("user-agent") ?? "";
  return MOBILE_UA.test(userAgent) ? "/audit_oa" : "/";
}

export async function login(_prevState: { error?: string } | undefined, formData: FormData) {
  const loginId = String(formData.get("loginId") ?? "").trim();
  const email = loginId.includes("@") ? loginId : `${loginId}@${LOGIN_EMAIL_DOMAIN}`;
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "ID 또는 비밀번호가 올바르지 않습니다." };
  }

  if (data.user) {
    const { data: profile } = await supabase.from("profiles").select("name").eq("id", data.user.id).single();
    await recordAccessLog({
      userId: data.user.id,
      userEmail: data.user.email,
      userName: profile?.name ?? null,
      eventType: "login",
      path: "/login",
    });
  }

  redirect(await landingPath());
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
