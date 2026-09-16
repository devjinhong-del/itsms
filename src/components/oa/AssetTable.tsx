"use client";

import { useMemo, useState } from "react";
import { matchNumber } from "@/lib/search";

export interface AssetRow {
  assetNo: string;
  category: string;
  modelName: string;
  itemName: string;
  deptName: string;
  userName: string;
  startDate: string; // 장비 사용 시작일(출고일 · 없으면 수령일)
  fee: number;
}

// 검색 조건은 아래 표의 칼럼과 동일하게 맞춘다.
const SEARCH_FIELDS = [
  { value: "all", label: "전체 검색" },
  { value: "assetNo", label: "자산번호" },
  { value: "category", label: "종류" },
  { value: "modelName", label: "모델" },
  { value: "deptName", label: "부서" },
  { value: "userName", label: "사용자" },
  { value: "startDate", label: "장비 사용 시작일" },
  { value: "fee", label: "월 렌탈료" },
] as const;

type SearchField = (typeof SEARCH_FIELDS)[number]["value"];

const ROW_LIMIT = 300;

// 전사 OA 현황 — 자산 한 대가 한 줄. 검색으로 좁혀 보고, 셀을 클릭하면 값이 복사된다.
export default function AssetTable({ rows }: { rows: AssetRow[] }) {
  const [query, setQuery] = useState("");
  const [field, setField] = useState<SearchField>("all");
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row) => {
      if (field === "fee") return matchNumber(row.fee, keyword);
      if (field !== "all") return (row[field] ?? "").toLowerCase().includes(keyword);

      return (
        [row.assetNo, row.category, row.modelName, row.itemName, row.deptName, row.userName, row.startDate].some(
          (value) => value?.toLowerCase().includes(keyword),
        ) || matchNumber(row.fee, keyword)
      );
    });
  }, [rows, query, field]);

  const filteredFee = filtered.reduce((sum, row) => sum + row.fee, 0);

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
    className: "cursor-pointer whitespace-nowrap px-3 py-2.5 transition hover:bg-blue-50 hover:text-[#1d428a]",
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-md flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 focus-within:border-[#1d428a] focus-within:bg-white">
          <select
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색어 입력 (월 렌탈료는 >=50000 처럼 비교도 가능)"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
          <span className="shrink-0 rounded bg-[#1d428a]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#1d428a]">
            {filtered.length.toLocaleString()}대
          </span>
        </div>

        <p className="text-[11px] text-gray-500">
          검색된 장비의 월 렌탈료 합계 <span className="font-bold text-gray-800">{filteredFee.toLocaleString()}원</span> · 연
          환산 <span className="font-bold text-gray-800">{(filteredFee * 12).toLocaleString()}원</span>
        </p>
      </div>

      <div className="max-h-[520px] overflow-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500">
            <tr>
              {["자산번호", "종류", "모델", "부서", "사용자", "장비 사용 시작일", "월 렌탈료"].map((head) => (
                <th key={head} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-800">
            {filtered.slice(0, ROW_LIMIT).map((row) => (
              <tr key={row.assetNo} className="border-t border-gray-100 hover:bg-gray-50/70">
                <td {...cellProps(row.assetNo, "자산번호")} style={{ fontWeight: 600 }}>
                  {row.assetNo}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{row.category || "-"}</td>
                <td
                  {...cellProps(row.modelName, "모델")}
                  title={`모델: ${row.modelName || "-"}\n품목: ${row.itemName || "-"} (클릭하면 복사)`}
                  className="max-w-[200px] cursor-pointer truncate px-3 py-2.5 text-gray-600 transition hover:bg-blue-50 hover:text-[#1d428a]"
                >
                  {row.modelName || "-"}
                </td>
                <td
                  {...cellProps(row.deptName, "부서")}
                  className="max-w-[140px] cursor-pointer truncate px-3 py-2.5 text-gray-600 transition hover:bg-blue-50 hover:text-[#1d428a]"
                >
                  {row.deptName || "-"}
                </td>
                <td {...cellProps(row.userName, "사용자")}>{row.userName || "-"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gray-600">{row.startDate || "-"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{row.fee.toLocaleString()}원</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  조건에 맞는 장비가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > ROW_LIMIT && (
        <p className="text-[11px] text-gray-400">
          상위 {ROW_LIMIT}대만 표시했습니다(검색 결과 {filtered.length.toLocaleString()}대). 검색으로 범위를 좁혀주세요.
        </p>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
          📋 {toast}
        </div>
      )}
    </div>
  );
}
