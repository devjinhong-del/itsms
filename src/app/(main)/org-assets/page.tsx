import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canSeeOrgAssets } from "@/lib/auth/role";
import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";
import { fetchAllRows } from "@/lib/db/fetchAll";
import { SectionCard, StatTile, Table, EmptyRow, BarList, DonutChart } from "@/components/dashboard";

const NO_EXPIRY = "9999-12-31T23:59:59+00:00";

interface OrgEquipment {
  asset_no: string;
  prdct_name: string | null;
  model_name: string | null;
  manuf_name: string | null;
  dept_name: string | null;
  user_name: string | null;
  rental_fee: string | null;
}

function countBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const value = key(row);
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

// 로그인한 사람의 소속(팀)을 먼저 찾고, 그 팀 인원들이 쓰는 장비를 모아 본다.
async function loadOrgData(name: string | null, email: string | undefined) {
  const admin = getSupabaseAdmin();

  const { data: me } = await admin
    .from("m365_users")
    .select("team, office, division, department_raw")
    .eq("expired_at", NO_EXPIRY)
    .eq("account", email ?? "__없음__")
    .limit(1)
    .maybeSingle();

  const { data: myEquipment } = await admin
    .from("krs_rental_equipment")
    .select("dept_name")
    .eq("valid_to", NO_EXPIRY)
    .eq("user_name", name ?? "__없음__")
    .limit(1)
    .maybeSingle();

  // KRS 장비의 부서명(dept_name)이 실제 조직 기준이라 이를 우선 사용한다.
  const orgName =
    myEquipment?.dept_name ?? me?.team ?? me?.office ?? me?.division ?? me?.department_raw ?? null;

  if (!orgName) return { orgName: null, rows: [] as OrgEquipment[] };

  const rows = await fetchAllRows<OrgEquipment>(() =>
    admin
      .from("krs_rental_equipment")
      .select("asset_no, prdct_name, model_name, manuf_name, dept_name, user_name, rental_fee")
      .eq("valid_to", NO_EXPIRY)
      .eq("dept_name", orgName),
  );

  return { orgName, rows };
}

export default async function OrgAssetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("name, role").eq("id", user.id).single();

  // 조직 현황은 담당자(manager) 이상만 볼 수 있다. 메뉴를 숨기는 것만으로는 부족해서 여기서도 막는다.
  if (!canSeeOrgAssets(profile?.role)) redirect("/");

  const { orgName, rows } = await loadOrgData(profile?.name ?? null, user.email);

  const byCategory = countBy(rows, (r) => r.prdct_name ?? "미분류");
  const byBrand = countBy(rows, (r) => r.manuf_name ?? "미상");
  const laptops = rows.filter((r) => r.prdct_name === "노트북");
  const monitors = rows.filter((r) => r.prdct_name === "모니터");
  const laptopBrands = countBy(laptops, (r) => r.manuf_name ?? "미상");
  const monthlyFee = rows.reduce((sum, r) => sum + (Number(r.rental_fee) || 0), 0);

  // 인원별 보유 현황 — 노트북/모니터 대수를 함께 보여 1인당 편차를 확인한다.
  const memberMap = new Map<string, { laptop: number; monitor: number; etc: number; fee: number }>();
  for (const row of rows) {
    const key = row.user_name ?? "(미지정)";
    const entry = memberMap.get(key) ?? { laptop: 0, monitor: 0, etc: 0, fee: 0 };
    if (row.prdct_name === "노트북") entry.laptop += 1;
    else if (row.prdct_name === "모니터") entry.monitor += 1;
    else entry.etc += 1;
    entry.fee += Number(row.rental_fee) || 0;
    memberMap.set(key, entry);
  }
  const members = [...memberMap.entries()]
    .map(([name, v]) => ({ name, ...v, total: v.laptop + v.monitor + v.etc }))
    .sort((a, b) => b.total - a.total);

  const monitorsPerLaptop = laptops.length ? (monitors.length / laptops.length).toFixed(1) : "-";

  if (!orgName) {
    return (
      <SectionCard title="조직 자산 현황" description="소속 정보를 찾을 수 없습니다">
        <p className="py-8 text-center text-xs text-gray-400">
          내 계정에 연결된 조직(부서) 정보가 없어 조직 자산을 불러올 수 없습니다.
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="조직" value={orgName} sub={`인원 ${members.length}명 (장비 보유 기준)`} tone="brand" />
        <StatTile label="전체 장비" value={rows.length} unit="대" sub={`노트북 ${laptops.length} · 모니터 ${monitors.length}`} />
        <StatTile label="1인당 모니터" value={monitorsPerLaptop} unit="대" sub="노트북 1대 기준 모니터 비율" />
        <StatTile label="월 렌탈료" value={monthlyFee.toLocaleString()} unit="원" sub="조직 전체 합계" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="장비 종류별 비중" description={`${orgName} 보유 장비 ${rows.length}대`}>
          <DonutChart items={byCategory.slice(0, 6)} centerValue={`${rows.length}`} centerLabel="총 보유" />
        </SectionCard>

        <SectionCard title="노트북 브랜드 분포" description="제조사 기준 · 노트북만 집계">
          {laptopBrands.length > 0 ? (
            <BarList items={laptopBrands} />
          ) : (
            <p className="py-8 text-center text-xs text-gray-400">노트북 보유 내역이 없습니다.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="전체 브랜드 분포" description="노트북·모니터 등 모든 장비 합계">
        <BarList items={byBrand.slice(0, 8)} />
      </SectionCard>

      <SectionCard title="구성원별 보유 장비" description="보유 대수가 많은 순">
        <Table head={["이름", "노트북", "모니터", "기타", "합계", "월 렌탈료"]}>
          {members.map((member) => (
            <tr key={member.name} className="border-t border-gray-100">
              <td className="px-3 py-2.5 font-medium">{member.name}</td>
              <td className="px-3 py-2.5 tabular-nums">{member.laptop}</td>
              <td className="px-3 py-2.5 tabular-nums">{member.monitor}</td>
              <td className="px-3 py-2.5 tabular-nums">{member.etc}</td>
              <td className="px-3 py-2.5 font-semibold tabular-nums">{member.total}</td>
              <td className="px-3 py-2.5 tabular-nums text-gray-600">{member.fee.toLocaleString()}원</td>
            </tr>
          ))}
          {members.length === 0 && <EmptyRow colSpan={6} text="조직에 등록된 장비가 없습니다." />}
        </Table>
      </SectionCard>
    </div>
  );
}
