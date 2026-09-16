"use client";

import { useMemo, useState } from "react";

export type ActionKind = "retired" | "ended" | "duplicate" | "expiring";

export interface ActionRow {
  kind: ActionKind;
  assetNo: string;
  category: string;
  modelName: string;
  itemName: string;
  deptName: string;
  userName: string;
  fee: number;
  guide: string;
  isHighCost: boolean;
  isLowCost: boolean;
  dlivyDate: string | null;
  returnDate: string | null;
  manufName: string;
}

const KIND_META: Record<ActionKind, { label: string; color: string }> = {
  retired: { label: "반납 추천", color: "#dc2626" },
  ended: { label: "계약종료 잔존", color: "#ea580c" },
  duplicate: { label: "중복 보유", color: "#7c3aed" },
  expiring: { label: "만료 임박", color: "#0891b2" },
};

const SEARCH_FIELDS = [
  { value: "all", label: "전체 검색" },
  { value: "deptName", label: "부서" },
  { value: "userName", label: "사용자" },
  { value: "assetNo", label: "자산번호" },
  { value: "modelName", label: "모델" },
  { value: "itemName", label: "품목명" },
] as const;

type SearchField = (typeof SEARCH_FIELDS)[number]["value"];

export default function ActionTable({ rows }: { rows: ActionRow[] }) {
  const [query, setQuery] = useState("");
  const [field, setField] = useState<SearchField>("all");
  const [kindFilter, setKindFilter] = useState<ActionKind | "all">("all");
  const [toast, setToast] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map = { retired: 0, ended: 0, duplicate: 0, expiring: 0 } as Record<ActionKind, number>;
    for (const row of rows) map[row.kind] += 1;
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (kindFilter !== "all" && row.kind !== kindFilter) return false;
      if (!keyword) return true;

      if (field === "all") {
        return [row.assetNo, row.modelName, row.itemName, row.deptName, row.userName, row.category].some((value) =>
          value?.toLowerCase().includes(keyword),
        );
      }
      return (row[field] ?? "").toLowerCase().includes(keyword);
    });
  }, [rows, query, field, kindFilter]);

  const filteredSaving = filtered.reduce((sum, row) => sum + row.fee, 0);

  // 표의 값을 클릭하면 클립보드로 복사한다(자산번호·사용자명을 다른 시스템에 붙여넣을 때 편하도록).
  const copy = (value: string, label: string) => {
    if (!value || value === "-") return;
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setToast(`${label} 복사됨: ${value}`);
        setTimeout(() => setToast(null), 1800);
      })
      .catch(() => {});
  };

  const cellProps = (value: string, label: string) => ({
    title: `${label}: ${value || "-"} (클릭하면 복사)`,
    onClick: () => copy(value, label),
    className: "cursor-pointer px-3 py-2.5 transition hover:bg-blue-50 hover:text-[#1d428a]",
  });

  return (
    <div className="flex flex-col gap-3">
      {/* 검색 + 상태 필터 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-md flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 focus-within:border-[#1d428a] focus-within:bg-white">
          <select
            id="action-search-field"
            value={field}
            onChange={(e) => setField(e.target.value as SearchField)}
            className="border-r border-gray-200 bg-transparent pr-2 text-xs font-semibold text-gray-700 outline-none"
          >
            {SEARCH_FIELDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            id="action-search-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색어 입력..."
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
          <span className="shrink-0 rounded bg-[#1d428a]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#1d428a]">
            {filtered.length.toLocaleString()}건
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setKindFilter("all")}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              kindFilter === "all" ? "border-[#1d428a] bg-[#1d428a] text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            전체 {rows.length}
          </button>
          {(Object.keys(KIND_META) as ActionKind[]).map((kind) => {
            const meta = KIND_META[kind];
            const active = kindFilter === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setKindFilter(active ? "all" : kind)}
                className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition"
                style={
                  active
                    ? { backgroundColor: meta.color, borderColor: meta.color, color: "#fff" }
                    : { borderColor: `${meta.color}55`, backgroundColor: `${meta.color}12`, color: meta.color }
                }
              >
                {meta.label} {counts[kind]}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-gray-500">
        지금 조건에 해당하는 자산의 월 렌탈료 합계{" "}
        <span className="font-bold text-gray-800">{filteredSaving.toLocaleString()}원</span> · 연 환산{" "}
        <span className="font-bold text-gray-800">{(filteredSaving * 12).toLocaleString()}원</span>
      </p>

      <div className="max-h-[420px] overflow-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500">
            <tr>
              {["구분", "자산번호", "종류", "모델", "부서", "사용자", "월 렌탈료", "조치 가이드"].map((head) => (
                <th key={head} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-800">
            {filtered.slice(0, 200).map((row) => {
              const meta = KIND_META[row.kind];
              return (
                <tr key={`${row.kind}-${row.assetNo}`} className="border-t border-gray-100 hover:bg-gray-50/70">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold"
                      style={{ color: meta.color, backgroundColor: `${meta.color}14` }}
                      title={`${meta.label} · ${row.guide}`}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td {...cellProps(row.assetNo, "자산번호")} className="cursor-pointer whitespace-nowrap px-3 py-2.5 font-semibold transition hover:bg-blue-50 hover:text-[#1d428a]">
                    {row.assetNo}
                  </td>
                  <td
                    className="whitespace-nowrap px-3 py-2.5 text-gray-600"
                    title={`${row.category} · 제조사 ${row.manufName || "-"}${row.dlivyDate ? ` · 납품 ${row.dlivyDate}` : ""}`}
                  >
                    {row.category || "-"}
                  </td>
                  <td
                    {...cellProps(row.modelName, "모델")}
                    title={`모델: ${row.modelName || "-"}\n품목: ${row.itemName || "-"} (클릭하면 복사)`}
                    className="max-w-[180px] cursor-pointer truncate px-3 py-2.5 text-gray-600 transition hover:bg-blue-50 hover:text-[#1d428a]"
                  >
                    {row.modelName || "-"}
                  </td>
                  <td {...cellProps(row.deptName, "부서")} className="max-w-[140px] cursor-pointer truncate px-3 py-2.5 text-gray-600 transition hover:bg-blue-50 hover:text-[#1d428a]">
                    {row.deptName || "-"}
                  </td>
                  <td {...cellProps(row.userName, "사용자")} className="cursor-pointer whitespace-nowrap px-3 py-2.5 transition hover:bg-blue-50 hover:text-[#1d428a]">{row.userName || "-"}</td>
                  <td
                    className="whitespace-nowrap px-3 py-2.5 tabular-nums"
                    style={
                      row.isHighCost
                        ? { color: "#dc2626", fontWeight: 700 }
                        : row.isLowCost
                          ? { color: "#1d428a", fontWeight: 600 }
                          : undefined
                    }
                    title={`월 ${row.fee.toLocaleString()}원 · 연 ${(row.fee * 12).toLocaleString()}원${
                      row.isHighCost ? " (상위 10% 고비용 장비)" : row.isLowCost ? " (하위 10% 저비용 장비)" : ""
                    }${row.returnDate ? ` · 반납예정 ${row.returnDate}` : ""}`}
                  >
                    {row.fee.toLocaleString()}원
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-[11px] text-gray-500" title={row.guide}>
                    {row.guide}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                  조건에 맞는 자산이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 200 && (
        <p className="text-[11px] text-gray-400">상위 200건만 표시했습니다. 검색으로 범위를 좁혀주세요.</p>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
          📋 {toast}
        </div>
      )}
    </div>
  );
}
