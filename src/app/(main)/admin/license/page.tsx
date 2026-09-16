import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";
import { fetchAllRows } from "@/lib/db/fetchAll";
import { SectionCard, StatTile } from "@/components/dashboard";
import OrgLicenseTable, { type OrgLicenseRow } from "@/components/license/OrgLicenseTable";
import HeavyUserTable, { type HeavyUserRow } from "@/components/license/HeavyUserTable";

const NO_EXPIRY = "9999-12-31T23:59:59+00:00";

export const dynamic = "force-dynamic";

interface LicenseRow {
  account: string;
  name: string | null;
  license: string | null;
  team: string | null;
  office: string | null;
  division: string | null;
  department_raw: string | null;
}

// M365 테넌트가 구매/구독 중인 라이선스 총량(export_m365/sync_m365_license.py로 적재)
interface LicenseTotal {
  sku_part_number: string | null;
  total_units: number | null;
  assigned_units: number | null;
  remaining_units: number | null;
}

function orgOf(row: LicenseRow) {
  return row.team ?? row.office ?? row.division ?? row.department_raw ?? "(조직 미지정)";
}

export default async function AdminLicensePage() {
  await requireAdmin();

  const admin = getSupabaseAdmin();
  const [rows, totals] = await Promise.all([
    fetchAllRows<LicenseRow>(() =>
      admin
        .from("m365_users")
        .select("account, name, license, team, office, division, department_raw")
        .eq("expired_at", NO_EXPIRY),
    ),
    fetchAllRows<LicenseTotal>(() =>
      admin
        .from("m365_license_total")
        .select("sku_part_number, total_units, assigned_units, remaining_units")
        .eq("expired_at", NO_EXPIRY),
    ),
  ]);

  const assigned = rows.filter((r) => r.license);
  const accounts = new Set(rows.map((r) => r.account));
  const accountsWithLicense = new Set(assigned.map((r) => r.account));
  const accountsWithoutLicense = [...accounts].filter((a) => !accountsWithLicense.has(a));

  // License별 사용률 — 수량은 m365_license_total(테넌트 구매 현황)에서 그대로 가져온다.
  const licenseUsage = totals
    .map((t) => ({
      name: t.sku_part_number ?? "(이름 없음)",
      total: t.total_units ?? 0,
      used: t.assigned_units ?? 0,
      remaining: t.remaining_units ?? 0,
    }))
    .filter((t) => t.total > 0)
    .map((t) => ({ ...t, percent: t.total ? Math.round((t.used / t.total) * 100) : 0 }))
    .sort((a, b) => b.percent - a.percent || b.used - a.used);

  // 추가 구매를 검토해야 하는 라이선스 — 구독 수량의 90% 이상이 이미 할당된 종류
  const nearlyFull = licenseUsage.filter((item) => item.percent >= 90).map((item) => item.name);

  // 조직별 집계 — 인원은 라이선스 유무와 무관하게 그 조직의 전체 계정 수로 센다.
  const byOrg = new Map<
    string,
    { accounts: Map<string, { name: string; licenses: string[] }>; licenses: Map<string, number> }
  >();
  for (const row of rows) {
    const org = orgOf(row);
    const entry = byOrg.get(org) ?? { accounts: new Map(), licenses: new Map() };
    const member = entry.accounts.get(row.account) ?? { name: row.name ?? "", licenses: [] };
    if (row.license) {
      member.licenses.push(row.license);
      entry.licenses.set(row.license, (entry.licenses.get(row.license) ?? 0) + 1);
    }
    if (!member.name && row.name) member.name = row.name;
    entry.accounts.set(row.account, member);
    byOrg.set(org, entry);
  }

  // 표의 한 행 = (License × 조직). 조직 단위로 뭉치면 한 사람이 여러 License를 가진 만큼
  // 할당 수가 인원보다 커져서 사용률이 100%를 넘어 보였는데, License별로 나누면
  // 같은 사람이 같은 License를 두 번 받을 수 없으므로 항상 할당 수 ≤ 인원이 된다.
  const orgRows: OrgLicenseRow[] = [];
  for (const [org, v] of byOrg.entries()) {
    const members = [...v.accounts.entries()]
      .map(([account, m]) => ({ account, name: m.name, licenses: m.licenses }))
      .sort((a, b) => b.licenses.length - a.licenses.length || a.name.localeCompare(b.name));

    for (const [license, count] of v.licenses.entries()) {
      orgRows.push({ license, org, headcount: v.accounts.size, assigned: count, members });
    }
  }
  // 조직 이름 가나다순으로 묶어서 보여주고, 같은 조직 안에서는 사용률이 높은 순으로 정렬한다.
  const rateOf = (row: OrgLicenseRow) => (row.headcount ? row.assigned / row.headcount : 0);
  orgRows.sort(
    (a, b) =>
      a.org.localeCompare(b.org, "ko") ||
      rateOf(b) - rateOf(a) ||
      b.assigned - a.assigned ||
      a.license.localeCompare(b.license),
  );

  // 라이선스를 많이 보유한 계정 — 중복 할당·정리 대상 후보
  const perAccount = new Map<string, { name: string; org: string; licenses: string[] }>();
  for (const row of assigned) {
    const entry = perAccount.get(row.account) ?? { name: row.name ?? "", org: orgOf(row), licenses: [] };
    entry.licenses.push(row.license as string);
    perAccount.set(row.account, entry);
  }
  const heavyUsers: HeavyUserRow[] = [...perAccount.entries()]
    .map(([account, v]) => ({ account, ...v }))
    .sort((a, b) => b.licenses.length - a.licenses.length)
    .slice(0, 12);

  const licenseKinds = new Set(assigned.map((r) => r.license as string)).size;

  return (
    <div className="flex flex-col gap-5">
      {/* 왼쪽에 지표 2장을 세로로, 오른쪽에 License별 사용률 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 왼쪽 카드 3장이 오른쪽 "License 별 사용률" 카드와 위·아래 끝을 맞추도록 높이를 3등분해 채운다 */}
        <div className="flex flex-col gap-4">
          <StatTile
            label="License 종류"
            value={licenseKinds}
            unit="종"
            sub={`테넌트 구독 ${totals.length}종 중 실제 할당된 종류`}
            tone="brand"
            className="flex flex-1 flex-col justify-center"
          />
          <StatTile
            label="미할당 계정"
            value={accountsWithoutLicense.length.toLocaleString()}
            unit={`명 / 전체인원 ${accounts.size.toLocaleString()}명`}
            sub="라이선스가 없는 계정"
            tone="warn"
            className="flex flex-1 flex-col justify-center"
          />
          <StatTile
            label="할당률 90% 이상 License"
            value={nearlyFull.length}
            unit={`종 / 구독 ${licenseUsage.length}종`}
            sub={nearlyFull.length ? `${nearlyFull.slice(0, 3).join(", ")}${nearlyFull.length > 3 ? " 외" : ""}` : "여유 있는 상태"}
            tone={nearlyFull.length ? "warn" : "default"}
            className="flex flex-1 flex-col justify-center"
          />
        </div>

        <div className="lg:col-span-2">
          <SectionCard
            title="License 별 사용률"
            description="M365 구독 수량(m365_license_total) 기준 · 막대에 마우스를 올리면 사용률이 보입니다"
            bodyClassName="max-h-[320px] overflow-y-auto"
          >
            <ul className="flex flex-col gap-2.5">
              {licenseUsage.map((item) => (
                <li
                  key={item.name}
                  title={`${item.name}\n사용률 ${item.percent}% · 할당 ${item.used.toLocaleString()}개 / 총 ${item.total.toLocaleString()}개 · 잔여 ${item.remaining.toLocaleString()}개`}
                  className={`flex cursor-help items-center gap-3 rounded-md px-1 py-0.5 text-xs transition hover:bg-blue-50/70 ${
                    item.percent >= 100 ? "usage-full-glow" : ""
                  }`}
                >
                  <span className={`w-48 shrink-0 truncate ${item.percent >= 100 ? "font-semibold text-[#1d428a]" : "text-gray-600"}`}>
                    {item.name}
                  </span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span
                      className="block h-full rounded-full bg-[#1d428a]"
                      style={{ width: `${Math.max(2, Math.min(100, item.percent))}%` }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-right font-semibold tabular-nums text-gray-800">
                    {item.used.toLocaleString()}
                    <span className="font-normal text-gray-400"> / {item.total.toLocaleString()}개</span>
                  </span>
                </li>
              ))}
              {licenseUsage.length === 0 && (
                <li className="py-8 text-center text-gray-400">
                  구독 수량 데이터가 없습니다. export_m365/sync_m365_license.py를 실행해 주세요.
                </li>
              )}
            </ul>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="조직별 License 사용 현황"
        description="License × 조직 한 줄씩 · 조직 이름 가나다순(같은 조직 안에서는 사용률 높은 순) · 조직명에 마우스를 올리면 사용자별 License가, 클릭하면 고정됩니다"
      >
        <OrgLicenseTable rows={orgRows} />
      </SectionCard>

      <SectionCard
        title="라이선스를 많이 보유한 계정"
        description="중복 할당·정리 대상 검토용 상위 12명 · 행에 마우스를 올리면 보유 License 목록이 보입니다"
      >
        <HeavyUserTable rows={heavyUsers} />
      </SectionCard>
    </div>
  );
}
