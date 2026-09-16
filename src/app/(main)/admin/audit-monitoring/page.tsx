import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";
import { fetchAllRows } from "@/lib/db/fetchAll";
import { SectionCard, StatTile, Table, EmptyRow, Badge } from "@/components/dashboard";
import DeptRanking, { type DeptRankRow } from "@/components/audit/DeptRanking";
import PhotoCell from "@/components/audit/PhotoCell";

const NO_EXPIRY = "9999-12-31T23:59:59+00:00";

// 실사 데이터는 계속 쌓이므로 이 화면은 캐시하지 않고 매번 최신 상태로 읽는다.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Equipment {
  asset_no: string;
  prdct_name: string | null;
  dept_name: string | null;
  user_name: string | null;
}

const POPOVER_ASSET_LIMIT = 40; // 부서명 hover 팝업에 보여줄 최대 자산 수
const RECENT_LIMIT = 50; // "최근 실사 내역"에 보여줄 건수
const AUDIT_PHOTOS_BUCKET = "audit-photos";

interface Audit {
  asset_no: string;
  asset_user_org: string | null;
  asset_user_name: string | null;
  inspector_name: string | null;
  inspector_org: string | null;
  is_edited: boolean;
  created_at: string;
  photo_url: string | null;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminAuditMonitoringPage() {
  await requireAdmin();

  const admin = getSupabaseAdmin();
  const [equipment, audits] = await Promise.all([
    fetchAllRows<Equipment>(() =>
      admin.from("krs_rental_equipment").select("asset_no, prdct_name, dept_name, user_name").eq("valid_to", NO_EXPIRY),
    ),
    fetchAllRows<Audit>(() =>
      admin
        .from("audit_oa")
        .select("asset_no, asset_user_org, asset_user_name, inspector_name, inspector_org, is_edited, created_at, photo_url")
        .eq("expired_at", NO_EXPIRY)
        .order("created_at", { ascending: false }),
    ),
  ]);

  const auditedAssets = new Set(audits.map((a) => a.asset_no));

  // 화면에 뿌리는 최근 50건의 사진만 서명 URL로 바꾼다.
  // audit-photos 버킷은 비공개라서 서명 URL(1시간 유효)이 있어야 이미지를 볼 수 있다.
  const recentAudits = audits.slice(0, RECENT_LIMIT);
  const photoPaths = [...new Set(recentAudits.map((a) => a.photo_url).filter((path): path is string => Boolean(path)))];
  const photoUrls = new Map<string, string>();
  if (photoPaths.length > 0) {
    const { data: signed } = await admin.storage.from(AUDIT_PHOTOS_BUCKET).createSignedUrls(photoPaths, 60 * 60);
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) photoUrls.set(item.path, item.signedUrl);
    }
  }

  // 부서별 진행률 — 전체 OA 자산 대비 실사 완료 비율을 등수로 매긴다.
  // 부서명에 마우스를 올렸을 때 보여줄 자산 목록도 함께 만들어 둔다.
  const byDept = new Map<string, { total: number; done: number; assets: Equipment[] }>();
  for (const item of equipment) {
    const dept = item.dept_name ?? "(부서 미지정)";
    const entry = byDept.get(dept) ?? { total: 0, done: 0, assets: [] };
    entry.total += 1;
    if (auditedAssets.has(item.asset_no)) entry.done += 1;
    entry.assets.push(item);
    byDept.set(dept, entry);
  }

  const ranking: DeptRankRow[] = [...byDept.entries()]
    .map(([dept, v]) => ({
      dept,
      total: v.total,
      done: v.done,
      percent: v.total ? Math.round((v.done / v.total) * 100) : 0,
      assets: v.assets.slice(0, POPOVER_ASSET_LIMIT).map((asset) => ({
        assetNo: asset.asset_no,
        category: asset.prdct_name ?? "",
        userName: asset.user_name ?? "",
        audited: auditedAssets.has(asset.asset_no),
      })),
    }))
    .sort((a, b) => b.percent - a.percent || b.done - a.done || a.dept.localeCompare(b.dept));

  const totalDone = audits.length;
  const totalTarget = equipment.length;
  const overallPercent = totalTarget ? Math.round((totalDone / totalTarget) * 100) : 0;
  const editedCount = audits.filter((a) => a.is_edited).length;

  // 오늘 실사 건수 — 실사가 실제로 돌아가고 있는지 바로 보이도록
  const todayKey = new Date().toDateString();
  const todayCount = audits.filter((a) => new Date(a.created_at).toDateString() === todayKey).length;

  const inspectors = new Map<string, number>();
  for (const audit of audits) {
    const key = audit.inspector_name ?? "(미상)";
    inspectors.set(key, (inspectors.get(key) ?? 0) + 1);
  }
  const topInspectors = [...inspectors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    // 화면 안에서 스크롤 없이 다 보이도록, 세로 공간을 카드들에 나눠 준다.
    <div className="flex h-full flex-col gap-4">
      <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="전체 진행률"
          value={`${overallPercent}%`}
          sub={`${totalDone.toLocaleString()} / ${totalTarget.toLocaleString()}대 완료`}
          tone="brand"
        />
        <StatTile label="오늘 실사" value={todayCount} unit="건" sub="오늘 등록된 실사 건수" />
        <StatTile label="사용자 수정 건" value={editedCount} unit="건" sub="실사 중 사용자명이 수정된 건" tone={editedCount ? "warn" : "default"} />
        <StatTile
          label="미실사"
          value={(totalTarget - totalDone).toLocaleString()}
          unit={`대 / 전체 ${totalTarget.toLocaleString()}대`}
          sub={`실사 완료 ${totalDone.toLocaleString()}대`}
          tone="warn"
        />
      </div>

      <SectionCard
        title="최근 실사 내역"
        description="가장 최근 실사가 맨 위 · 화면을 새로고침하면 최신 상태로 갱신됩니다"
        right={<Badge tone="ok">총 {totalDone.toLocaleString()}건</Badge>}
        className="min-h-0 flex-1"
        bodyClassName="min-h-0 flex-1 overflow-y-auto"
      >
        <Table head={["실사 시각", "자산번호", "사진", "사용자 조직", "사용자", "실사자", "수정 여부"]}>
          {recentAudits.map((audit) => (
            <tr key={`${audit.asset_no}-${audit.created_at}`} className="border-t border-gray-100">
              <td className="px-3 py-2.5 font-medium tabular-nums">{formatDateTime(audit.created_at)}</td>
              <td className="px-3 py-2.5">{audit.asset_no}</td>
              <td className="px-3 py-2.5">
                <PhotoCell url={(audit.photo_url && photoUrls.get(audit.photo_url)) || null} assetNo={audit.asset_no} />
              </td>
              <td className="px-3 py-2.5 text-gray-600">{audit.asset_user_org ?? "-"}</td>
              <td className="px-3 py-2.5">{audit.asset_user_name ?? "-"}</td>
              <td className="px-3 py-2.5 text-gray-600">{audit.inspector_name ?? "-"}</td>
              <td className="px-3 py-2.5">
                {audit.is_edited ? <Badge tone="warn">사용자 변경</Badge> : <Badge tone="muted">원본 유지</Badge>}
              </td>
            </tr>
          ))}
          {audits.length === 0 && <EmptyRow colSpan={7} text="아직 실사 내역이 없습니다." />}
        </Table>
      </SectionCard>

      {/* 위 "최근 실사 내역"과 남은 높이를 반반씩 나눠 쓰고, 내용이 길면 각 카드 안쪽에서만 스크롤한다 */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
        <div className="flex min-h-0 lg:col-span-2">
          <SectionCard
            title="부서별 실사 진행률 순위"
            description="진행률이 높은 순 · 부서명에 마우스를 올리면 해당 부서 자산 목록이 보입니다"
            className="min-h-0 w-full"
            bodyClassName="min-h-0 flex-1 overflow-y-auto"
          >
            <DeptRanking rows={ranking} />
          </SectionCard>
        </div>

        <SectionCard
          title="실사자 TOP 5"
          description="실사 건수 기준"
          className="min-h-0"
          bodyClassName="min-h-0 flex-1 overflow-y-auto"
        >
          <ul className="flex flex-col gap-2 text-xs">
            {topInspectors.map(([name, count], index) => (
              <li key={name} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="font-bold text-gray-400">{index + 1}</span>
                  <span className="font-medium text-gray-800">{name}</span>
                </span>
                <span className="font-semibold tabular-nums text-[#1d428a]">{count}건</span>
              </li>
            ))}
            {topInspectors.length === 0 && <li className="py-6 text-center text-gray-400">실사 내역이 없습니다.</li>}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
