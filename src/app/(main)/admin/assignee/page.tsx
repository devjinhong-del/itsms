import { requireAdmin } from "@/lib/auth/requireAdmin";
import ComingSoon from "@/components/ComingSoon";

export default async function AdminAssigneePage() {
  await requireAdmin();
  return <ComingSoon label="담당자 선임" />;
}
