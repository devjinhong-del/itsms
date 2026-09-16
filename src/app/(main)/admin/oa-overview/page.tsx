import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";
import { fetchAllRows } from "@/lib/db/fetchAll";
import { SectionCard, StatTile, BarList, DonutChart } from "@/components/dashboard";
import AssetTable, { type AssetRow } from "@/components/oa/AssetTable";

const NO_EXPIRY = "9999-12-31T23:59:59+00:00";

export const dynamic = "force-dynamic";

interface Equipment {
  asset_no: string;
  prdct_name: string | null;
  model_name: string | null;
  item_name: string | null;
  manuf_name: string | null;
  dept_name: string | null;
  user_name: string | null;
  rental_fee: string | null;
  dlivy_date: string | null;
  recpt_date: string | null;
}

function countBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const value = key(row);
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export default async function AdminOaOverviewPage() {
  await requireAdmin();

  const admin = getSupabaseAdmin();
  const rows = await fetchAllRows<Equipment>(() =>
    admin
      .from("krs_rental_equipment")
      .select(
        "asset_no, prdct_name, model_name, item_name, manuf_name, dept_name, user_name, rental_fee, dlivy_date, recpt_date",
      )
      .eq("valid_to", NO_EXPIRY),
  );

  const byCategory = countBy(rows, (r) => r.prdct_name ?? "미분류");
  const byBrand = countBy(rows, (r) => r.manuf_name ?? "미상");
  const laptops = rows.filter((r) => r.prdct_name === "노트북");
  const monitors = rows.filter((r) => r.prdct_name === "모니터");
  const laptopBrands = countBy(laptops, (r) => r.manuf_name ?? "미상");
  const monthlyFee = rows.reduce((sum, r) => sum + (Number(r.rental_fee) || 0), 0);

  // 조직별 사용 장비 수 — 어느 부서에 장비가 몰려 있는지 본다
  const byDept = new Map<string, { count: number; fee: number; users: Set<string> }>();
  for (const row of rows) {
    const dept = row.dept_name ?? "(부서 미지정)";
    const entry = byDept.get(dept) ?? { count: 0, fee: 0, users: new Set<string>() };
    entry.count += 1;
    entry.fee += Number(row.rental_fee) || 0;
    if (row.user_name) entry.users.add(row.user_name);
    byDept.set(dept, entry);
  }
  const deptDistribution = [...byDept.entries()]
    .map(([label, v]) => ({ label, value: v.count, fee: v.fee, headcount: v.users.size }))
    .sort((a, b) => b.value - a.value);

  const users = new Set(rows.map((r) => r.user_name).filter(Boolean));
  const depts = new Set(rows.map((r) => r.dept_name ?? "(부서 미지정)"));
  const monitorsPerLaptop = laptops.length ? (monitors.length / laptops.length).toFixed(1) : "-";

  // 장비 사용 시작일 — KRS의 출고일자(dlivy_date)를 쓰고, 값이 없으면 수령일자로 대신한다.
  const tableRows: AssetRow[] = rows
    .map((row) => ({
      assetNo: row.asset_no,
      category: row.prdct_name ?? "",
      modelName: row.model_name ?? "",
      itemName: row.item_name ?? "",
      deptName: row.dept_name ?? "",
      userName: row.user_name ?? "",
      startDate: row.dlivy_date ?? row.recpt_date ?? "",
      fee: Number(row.rental_fee) || 0,
    }))
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.assetNo.localeCompare(b.assetNo));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="전체 장비"
          value={rows.length.toLocaleString()}
          unit="대"
          sub={`노트북 ${laptops.length} · 모니터 ${monitors.length}`}
          tone="brand"
        />
        <StatTile label="사용 인원" value={users.size.toLocaleString()} unit="명" sub={`부서 ${depts.size}개`} />
        <StatTile label="1인당 모니터" value={monitorsPerLaptop} unit="대" sub="노트북 1대 기준 모니터 비율" />
        <StatTile label="월 렌탈료" value={monthlyFee.toLocaleString()} unit="원" sub={`연 ${(monthlyFee * 12).toLocaleString()}원`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="장비 종류별 비중" description={`전사 보유 장비 ${rows.length.toLocaleString()}대`}>
          <DonutChart
            items={byCategory.slice(0, 6).map((item) => ({
              ...item,
              title: `${item.label} ${item.value.toLocaleString()}대 (${
                rows.length ? Math.round((item.value / rows.length) * 100) : 0
              }%)`,
            }))}
            centerValue={`${rows.length.toLocaleString()}`}
            centerLabel="총 보유"
          />
        </SectionCard>

        <SectionCard
          title="조직별 사용 장비 수 분포"
          description={`장비가 많은 상위 10개 부서 · 전체 ${deptDistribution.length}개 부서`}
        >
          <BarList
            items={deptDistribution.slice(0, 10).map((item, index) => ({
              label: item.label,
              value: item.value,
              title: `${index + 1}위 ${item.label}
장비 ${item.value.toLocaleString()}대 · 사용자 ${item.headcount}명
전체 장비의 ${
                rows.length ? Math.round((item.value / rows.length) * 100) : 0
              }% · 월 ${item.fee.toLocaleString()}원`,
            }))}
          />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="노트북 브랜드 분포" description="제조사 기준 · 노트북만 집계">
          {laptopBrands.length > 0 ? (
            <BarList
              items={laptopBrands.map((item) => ({
                ...item,
                title: `${item.label} 노트북 ${item.value.toLocaleString()}대 (노트북 전체의 ${
                  laptops.length ? Math.round((item.value / laptops.length) * 100) : 0
                }%)`,
              }))}
            />
          ) : (
            <p className="py-8 text-center text-xs text-gray-400">노트북 보유 내역이 없습니다.</p>
          )}
        </SectionCard>

        <SectionCard title="전체 브랜드 분포" description="노트북·모니터 등 모든 장비 합계">
          <BarList
            items={byBrand.slice(0, 8).map((item) => ({
              ...item,
              title: `${item.label} ${item.value.toLocaleString()}대 (전체의 ${
                rows.length ? Math.round((item.value / rows.length) * 100) : 0
              }%)`,
            }))}
          />
        </SectionCard>
      </div>

      <SectionCard
        title="전사 OA 현황"
        description="장비 사용 시작일이 최근인 순 · 검색으로 좁혀 보고, 셀을 클릭하면 값이 복사됩니다"
      >
        <AssetTable rows={tableRows} />
      </SectionCard>

      <p className="text-[11px] text-gray-400">
        ※ 장비 사용 시작일은 KRS의 출고일자 기준이며, 출고일자가 비어 있으면 수령일자를 대신 표시합니다.
      </p>
    </div>
  );
}
