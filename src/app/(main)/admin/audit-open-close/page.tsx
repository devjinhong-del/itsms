import { requireAdmin } from "@/lib/auth/requireAdmin";
import ComingSoon from "@/components/ComingSoon";

export default async function AdminAuditOpenClosePage() {
  await requireAdmin();
  return <ComingSoon label="OA 자산 실사 Open/Close" />;
}
