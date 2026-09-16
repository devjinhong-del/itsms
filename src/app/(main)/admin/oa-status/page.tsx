import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";
import { fetchAllRows } from "@/lib/db/fetchAll";
import { SectionCard, Table, BarList, DonutChart, Badge } from "@/components/dashboard";
import ActionTable, { type ActionRow } from "@/components/oa/ActionTable";

const NO_EXPIRY = "9999-12-31T23:59:59+00:00";

export const dynamic = "force-dynamic";

interface Equipment {
  asset_no: string;
  prdct_name: string | null;
  manuf_name: string | null;
  model_name: string | null;
  item_name: string | null;
  dept_name: string | null;
  user_name: string | null;
  rental_fee: string | null;
  dlivy_date: string | null;
  return_prnmnt_date: string | null;
  cntrct_status: string | null;
}

type ActionKind = "retired" | "ended" | "duplicate" | "expiring";

interface ActionItem {
  kind: ActionKind;
  asset: Equipment;
  fee: number;
  guide: string;
}

function toFee(value: string | null) {
  return Number(value) || 0;
}

export default async function AdminOaStatusPage() {
  await requireAdmin();

  const admin = getSupabaseAdmin();
  const [equipment, m365, audits] = await Promise.all([
    fetchAllRows<Equipment>(() =>
      admin
        .from("krs_rental_equipment")
        .select(
          "asset_no, prdct_name, manuf_name, model_name, item_name, dept_name, user_name, rental_fee, dlivy_date, return_prnmnt_date, cntrct_status",
        )
        .eq("valid_to", NO_EXPIRY),
    ),
    fetchAllRows<{ name: string | null }>(() => admin.from("m365_users").select("name").eq("expired_at", NO_EXPIRY)),
    fetchAllRows<{ asset_no: string }>(() => admin.from("audit_oa").select("asset_no").eq("expired_at", NO_EXPIRY)),
  ]);

  const totalFee = equipment.reduce((sum, e) => sum + toFee(e.rental_fee), 0);
  const auditedAssets = new Set(audits.map((a) => a.asset_no));

  // M365 계정 이름이 "퇴사_홍길동"인 사람 = 퇴사자. 이 이름으로 아직 장비가 잡혀 있으면 회수 대상이다.
  const retiredNames = new Set(
    m365
      .map((row) => row.name)
      .filter((name): name is string => Boolean(name?.startsWith("퇴사")))
      .map((name) => name.replace(/^퇴사[_\s]*/, "").trim())
      .filter(Boolean),
  );

  // 같은 사람이 노트북을 2대 이상 들고 있으면 중복 지급 여부 확인 대상
  const laptopCountByUser = new Map<string, number>();
  for (const item of equipment) {
    if (item.prdct_name !== "노트북" || !item.user_name) continue;
    laptopCountByUser.set(item.user_name, (laptopCountByUser.get(item.user_name) ?? 0) + 1);
  }

  const today = new Date();
  const threeMonths = new Date(today);
  threeMonths.setMonth(threeMonths.getMonth() + 3);

  const actions: ActionItem[] = [];
  for (const asset of equipment) {
    const fee = toFee(asset.rental_fee);
    const user = asset.user_name?.trim() ?? "";

    if (user && retiredNames.has(user)) {
      actions.push({
        kind: "retired",
        asset,
        fee,
        guide: `퇴사자(${user}) 명의 장비 · 회수 시 월 ${fee.toLocaleString()}원 절감`,
      });
      continue;
    }
    if (asset.cntrct_status === "계약종료") {
      actions.push({ kind: "ended", asset, fee, guide: "계약이 종료됐는데 자산이 남아 있음 · 반납 처리 확인 필요" });
      continue;
    }
    if (asset.prdct_name === "노트북" && user && (laptopCountByUser.get(user) ?? 0) > 1) {
      actions.push({
        kind: "duplicate",
        asset,
        fee,
        guide: `${user}님 노트북 ${laptopCountByUser.get(user)}대 보유 · 중복 지급 여부 확인`,
      });
      continue;
    }
    if (asset.return_prnmnt_date) {
      const due = new Date(asset.return_prnmnt_date);
      if (due >= today && due <= threeMonths) {
        actions.push({
          kind: "expiring",
          asset,
          fee,
          guide: `${asset.return_prnmnt_date} 반납예정 · 재계약/회수 결정 필요`,
        });
      }
    }
  }

  const retiredItems = actions.filter((a) => a.kind === "retired");
  const endedItems = actions.filter((a) => a.kind === "ended");
  const duplicateItems = actions.filter((a) => a.kind === "duplicate");
  const expiringItems = actions.filter((a) => a.kind === "expiring");

  // 즉시 절감 = 퇴사자 명의 + 계약종료 잔존 (사용자 확인 없이도 회수 판단이 서는 건)
  const retiredNameFee = retiredItems.reduce((sum, a) => sum + a.fee, 0);
  const endedFee = endedItems.reduce((sum, a) => sum + a.fee, 0);
  const monthlySaving = [...retiredItems, ...endedItems].reduce((sum, a) => sum + a.fee, 0);
  const reviewSaving = duplicateItems.reduce((sum, a) => sum + a.fee, 0);

  // 부서별 비용
  const byDept = new Map<string, { count: number; fee: number; users: Set<string> }>();
  for (const item of equipment) {
    const dept = item.dept_name ?? "(부서 미지정)";
    const entry = byDept.get(dept) ?? { count: 0, fee: 0, users: new Set<string>() };
    entry.count += 1;
    entry.fee += toFee(item.rental_fee);
    if (item.user_name) entry.users.add(item.user_name);
    byDept.set(dept, entry);
  }
  const depts = [...byDept.entries()]
    .map(([label, v]) => ({ label, count: v.count, fee: v.fee, headcount: v.users.size }))
    .sort((a, b) => b.fee - a.fee);

  // 전사 평균 1인당 월 비용 — 부서별 1인당 비용이 높은지 낮은지 비교 기준으로 쓴다
  const totalHeadcount = new Set(equipment.map((e) => e.user_name).filter(Boolean)).size;
  const averagePerHead = totalHeadcount ? Math.round(totalFee / totalHeadcount) : 0;

  // 종류별 비용 비중
  const byCategory = new Map<string, { count: number; fee: number }>();
  for (const item of equipment) {
    const cat = item.prdct_name ?? "미분류";
    const entry = byCategory.get(cat) ?? { count: 0, fee: 0 };
    entry.count += 1;
    entry.fee += toFee(item.rental_fee);
    byCategory.set(cat, entry);
  }
  const categories = [...byCategory.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.fee - a.fee);

  // 렌탈료 상위 10%(고비용)·하위 10%(저비용) 기준선 — 표에서 마우스를 올렸을 때 알려준다
  const sortedFees = equipment.map((e) => toFee(e.rental_fee)).filter((f) => f > 0).sort((a, b) => a - b);
  const p90 = sortedFees[Math.floor(sortedFees.length * 0.9)] ?? Infinity;
  const p10 = sortedFees[Math.floor(sortedFees.length * 0.1)] ?? -Infinity;

  const actionRows = [...actions].sort((a, b) => b.fee - a.fee);

  // 검색·필터·툴팁은 클라이언트에서 처리하므로, 화면에 필요한 값만 평평하게 만들어 넘긴다.
  const tableRows: ActionRow[] = actionRows.map((row) => ({
    kind: row.kind,
    assetNo: row.asset.asset_no,
    category: row.asset.prdct_name ?? "",
    modelName: row.asset.model_name ?? "",
    itemName: row.asset.item_name ?? "",
    deptName: row.asset.dept_name ?? "",
    userName: row.asset.user_name ?? "",
    fee: row.fee,
    guide: row.guide,
    isHighCost: row.fee >= p90,
    isLowCost: row.fee > 0 && row.fee <= p10,
    dlivyDate: row.asset.dlivy_date,
    returnDate: row.asset.return_prnmnt_date,
    manufName: row.asset.manuf_name ?? "",
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* 절감 기회 히어로 — 관리자가 가장 먼저 봐야 할 "돈" 이야기 */}
      <section className="flex flex-wrap items-center justify-between gap-6 rounded-xl bg-gradient-to-br from-[#1e293b] to-[#0f172a] px-6 py-5 text-white">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold">💰 렌탈 비용 & 절감 기회</h2>
          <p className="mt-1 text-xs text-slate-400">
            퇴사자 명의·계약종료 장비를 회수하면 그 달부터 고정비가 바로 줄어듭니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-7">
          <div
            className="cursor-help"
            title={`KRS 렌탈 자산 ${equipment.length.toLocaleString()}대의 월 렌탈료 합계
월 ${totalFee.toLocaleString()}원 · 연 ${(totalFee * 12).toLocaleString()}원
1대당 평균 ${equipment.length ? Math.round(totalFee / equipment.length).toLocaleString() : 0}원`}
          >
            <p className="text-xs font-semibold text-slate-400">전체 월 렌탈료</p>
            <p className="text-2xl font-extrabold tabular-nums">{totalFee.toLocaleString()}원</p>
            <p className="mt-0.5 text-[11px] text-slate-400">연 {(totalFee * 12).toLocaleString()}원</p>
          </div>

          <div className="h-10 w-px bg-white/15" />

          <div
            className="cursor-help"
            title={`퇴사자 명의 ${retiredItems.length}건 + 계약종료 잔존 ${endedItems.length}건을 회수했을 때 줄어드는 고정비
월 ${monthlySaving.toLocaleString()}원 · 연 ${(monthlySaving * 12).toLocaleString()}원
전체 렌탈료의 ${totalFee ? Math.round((monthlySaving / totalFee) * 100) : 0}%`}
          >
            <p className="text-xs font-semibold text-sky-300">연간 절감 가능액</p>
            <p className="text-2xl font-extrabold tabular-nums text-sky-300">{(monthlySaving * 12).toLocaleString()}원</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              월 <span className="font-bold text-white">{monthlySaving.toLocaleString()}원</span> · 전체의{" "}
              {totalFee ? Math.round((monthlySaving / totalFee) * 100) : 0}%
            </p>
          </div>

          <div className="h-10 w-px bg-white/15" />

          <div
            className="cursor-help"
            title={`노트북을 2대 이상 보유한 사용자의 장비 ${duplicateItems.length}건 · 대상 ${new Set(duplicateItems.map((a) => a.asset.user_name)).size}명
중복 지급이 확인되면 월 ${reviewSaving.toLocaleString()}원(연 ${(reviewSaving * 12).toLocaleString()}원)을 더 줄일 수 있습니다`}
          >
            <p className="text-xs font-semibold text-slate-400">검토 시 추가 절감</p>
            <p className="text-2xl font-extrabold tabular-nums text-amber-300">{reviewSaving.toLocaleString()}원</p>
            <p className="mt-0.5 text-[11px] text-slate-400">노트북 중복 보유 {duplicateItems.length}건</p>
          </div>
        </div>
      </section>

      {/* 조치가 필요한 지표 5장 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: "전체 자산",
            value: equipment.length,
            sub: `사용자 ${new Set(equipment.map((e) => e.user_name).filter(Boolean)).size}명`,
            color: "#1d428a",
            tip: `KRS에 살아 있는 렌탈 자산 전체 ${equipment.length.toLocaleString()}대
사용자 ${new Set(equipment.map((e) => e.user_name).filter(Boolean)).size}명 · 부서 ${depts.length}개
월 렌탈료 ${totalFee.toLocaleString()}원`,
          },
          {
            label: "퇴사자 명의",
            value: retiredItems.length,
            sub: `월 ${retiredNameFee.toLocaleString()}원`,
            color: "#dc2626",
            tip: `M365 계정명이 "퇴사_이름"인 사람 명의로 아직 남아 있는 장비 ${retiredItems.length}건
회수 시 월 ${retiredNameFee.toLocaleString()}원 · 연 ${(retiredNameFee * 12).toLocaleString()}원 절감
대상 인원 ${new Set(retiredItems.map((a) => a.asset.user_name)).size}명`,
          },
          {
            label: "계약종료 잔존",
            value: endedItems.length,
            sub: `월 ${endedFee.toLocaleString()}원`,
            color: "#ea580c",
            tip: `계약상태가 "계약종료"인데 자산이 남아 있는 건 ${endedItems.length}건
반납 처리가 누락됐는지 확인이 필요합니다
월 ${endedFee.toLocaleString()}원 · 연 ${(endedFee * 12).toLocaleString()}원`,
          },
          {
            label: "노트북 중복 보유",
            value: duplicateItems.length,
            sub: `대상 ${new Set(duplicateItems.map((a) => a.asset.user_name)).size}명`,
            color: "#7c3aed",
            tip: `노트북을 2대 이상 들고 있는 사용자의 장비 ${duplicateItems.length}건 · 대상 ${new Set(duplicateItems.map((a) => a.asset.user_name)).size}명
월 ${reviewSaving.toLocaleString()}원 · 연 ${(reviewSaving * 12).toLocaleString()}원
업무상 2대가 필요한 경우도 있으니 확인 후 회수하세요`,
          },
          {
            label: "미실사",
            value: equipment.length - auditedAssets.size,
            sub: `전체 ${equipment.length.toLocaleString()}대 중`,
            color: "#64748b",
            tip: `아직 실사되지 않은 자산 ${(equipment.length - auditedAssets.size).toLocaleString()}대
실사 완료 ${auditedAssets.size.toLocaleString()}대 / 전체 ${equipment.length.toLocaleString()}대 (${equipment.length ? Math.round((auditedAssets.size / equipment.length) * 100) : 0}%)`,
          },
        ].map((card) => (
          <div
            key={card.label}
            title={card.tip}
            className="relative cursor-help overflow-hidden rounded-xl border border-gray-200 bg-white p-4 pl-5 shadow-sm transition hover:border-gray-300 hover:shadow-md"
          >
            <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: card.color }} />
            <p className="text-xs font-semibold text-gray-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: card.color }}>
              {card.value.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">{card.sub}</p>
          </div>
        ))}
      </div>

      <SectionCard
        title="조치가 필요한 자산"
        description="검색·필터로 좁혀 보고, 셀에 마우스를 올리면 상세 정보가, 클릭하면 값이 복사됩니다"
        right={<Badge tone="warn">{actionRows.length}건</Badge>}
      >
        <ActionTable rows={tableRows} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="실사 현황" description="전체 자산 대비 실사 완료 비율">
          <DonutChart
            items={[
              {
                label: "실사 완료",
                value: auditedAssets.size,
                title: `실사 완료 ${auditedAssets.size.toLocaleString()}대 / 전체 ${equipment.length.toLocaleString()}대 (${
                  equipment.length ? Math.round((auditedAssets.size / equipment.length) * 100) : 0
                }%)`,
              },
              {
                label: "미실사",
                value: equipment.length - auditedAssets.size,
                title: `미실사 ${(equipment.length - auditedAssets.size).toLocaleString()}대 (${
                  equipment.length ? Math.round(((equipment.length - auditedAssets.size) / equipment.length) * 100) : 0
                }%) · 실사 모니터링 화면에서 부서별 진행률을 확인할 수 있습니다`,
              },
            ]}
            centerValue={`${equipment.length ? Math.round((auditedAssets.size / equipment.length) * 100) : 0}%`}
            centerLabel="완료율"
          />
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard title="부서별 월 렌탈 비용 TOP 10" description="비용이 큰 부서부터 점검하면 효과가 큽니다">
            <BarList
              items={depts.slice(0, 10).map((d, index) => ({
                label: d.label,
                value: d.fee,
                title: `${index + 1}위 ${d.label}
자산 ${d.count.toLocaleString()}대 · 사용자 ${d.headcount}명
월 ${d.fee.toLocaleString()}원 · 연 ${(d.fee * 12).toLocaleString()}원
전체 비용의 ${totalFee ? Math.round((d.fee / totalFee) * 100) : 0}% · 1인당 월 ${d.headcount ? Math.round(d.fee / d.headcount).toLocaleString() : 0}원`,
              }))}
              unit="원"
            />
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="장비 종류별 비용 구조" description="대수와 비용 비중이 크게 다른 항목을 확인하세요">
          <Table head={["종류", "대수", "월 비용", "비중", "1대당"]}>
            {categories.map((cat) => (
              <tr
                key={cat.label}
                title={`${cat.label} ${cat.count.toLocaleString()}대
월 ${cat.fee.toLocaleString()}원 · 연 ${(cat.fee * 12).toLocaleString()}원
전체 비용의 ${totalFee ? Math.round((cat.fee / totalFee) * 100) : 0}% · 1대당 월 ${cat.count ? Math.round(cat.fee / cat.count).toLocaleString() : 0}원`}
                className="cursor-help border-t border-gray-100 transition hover:bg-blue-50/60"
              >
                <td className="px-3 py-2.5 font-medium">{cat.label}</td>
                <td className="px-3 py-2.5 tabular-nums">{cat.count.toLocaleString()}</td>
                <td className="px-3 py-2.5 tabular-nums">{cat.fee.toLocaleString()}원</td>
                <td className="px-3 py-2.5 tabular-nums text-gray-500">
                  {totalFee ? Math.round((cat.fee / totalFee) * 100) : 0}%
                </td>
                <td className="px-3 py-2.5 tabular-nums text-gray-600">
                  {cat.count ? Math.round(cat.fee / cat.count).toLocaleString() : 0}원
                </td>
              </tr>
            ))}
          </Table>
        </SectionCard>

        <SectionCard title="부서별 1인당 비용" description="1인당 비용·대수가 유난히 높은 부서는 과배정 가능성">
          <Table head={["부서", "인원", "대수", "1인당 월 비용", "1인당 대수"]}>
            {depts
              .filter((d) => d.headcount > 0)
              .sort((a, b) => b.fee / b.headcount - a.fee / a.headcount)
              .slice(0, 10)
              .map((dept) => (
                <tr
                  key={dept.label}
                  title={`${dept.label}
사용자 ${dept.headcount}명이 자산 ${dept.count.toLocaleString()}대 보유 (1인당 ${(dept.count / dept.headcount).toFixed(1)}대)
1인당 월 ${Math.round(dept.fee / dept.headcount).toLocaleString()}원 · 부서 합계 월 ${dept.fee.toLocaleString()}원
전사 평균 1인당 ${averagePerHead.toLocaleString()}원 대비 ${
                    averagePerHead ? Math.round((dept.fee / dept.headcount / averagePerHead) * 100) : 0
                  }%`}
                  className="cursor-help border-t border-gray-100 transition hover:bg-blue-50/60"
                >
                  <td className="px-3 py-2.5 font-medium">{dept.label}</td>
                  <td className="px-3 py-2.5 tabular-nums">{dept.headcount}</td>
                  <td className="px-3 py-2.5 tabular-nums">{dept.count}</td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums">
                    {Math.round(dept.fee / dept.headcount).toLocaleString()}원
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-600">
                    {(dept.count / dept.headcount).toFixed(1)}
                  </td>
                </tr>
              ))}
          </Table>
        </SectionCard>
      </div>

      <p className="text-[11px] text-gray-400">
        ※ 퇴사자 판정은 Microsoft 365 계정명이 &ldquo;퇴사_이름&rdquo; 형태인 계정을 KRS 자산의 사용자명과 대조한 결과입니다. 동명이인이
        있을 수 있으니 회수 전 확인이 필요합니다. 만료 임박은 3개월 이내 반납예정 자산 {expiringItems.length}건입니다.
      </p>
    </div>
  );
}
