import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScanClient from "./ScanClient";

// Design Ref: DESIGN.md — 별도 권한 없이 로그인한 사람은 누구나 접근 가능한 화면.
export default async function AuditOaPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ScanClient />;
}
