import { requireAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

// 실사 화면 주소를 담은 QR — public/audit-qr.svg (scripts/make-audit-qr.ts로 생성)
const AUDIT_URL = "https://itsms.vercel.app/audit_oa";

export default async function AdminAuditQrPage() {
  await requireAdmin();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/audit-qr.svg" alt="OA 자산 현황 실사 QR 코드" className="h-[300px] w-[300px]" />
      </div>

      <div className="text-center">
        <p className="text-lg font-bold text-gray-900">모바일로 접속해 주세요.</p>
        <p className="mt-1.5 text-xs text-gray-400">{AUDIT_URL}</p>
      </div>
    </div>
  );
}
