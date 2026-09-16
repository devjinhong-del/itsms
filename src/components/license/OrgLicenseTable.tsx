"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface OrgMember {
  name: string;
  account: string;
  licenses: string[];
}

// 한 행 = "어떤 조직에서 어떤 License를 몇 명이 쓰고 있는가".
// 같은 사람이 같은 License를 두 번 받을 수는 없으므로 assigned는 항상 headcount 이하다.
export interface OrgLicenseRow {
  license: string;
  org: string;
  headcount: number; // 조직 전체 인원(라이선스 유무 무관)
  assigned: number; // 이 조직에서 이 License를 쓰는 인원 수
  members: OrgMember[]; // 조직 구성원 전체(팝업용)
}

// 검색 조건은 아래 표의 칼럼과 동일하게 맞춘다.
const SEARCH_FIELDS = [
  { value: "all", label: "전체 검색" },
  { value: "license", label: "License" },
  { value: "org", label: "조직" },
  { value: "headcount", label: "인원" },
  { value: "assigned", label: "할당 수" },
  { value: "rate", label: "사용률" },
] as const;

type SearchField = (typeof SEARCH_FIELDS)[number]["value"];

// 숫자 칼럼 검색 — "12"(같은 값), ">=5", "<3", ">10"처럼 비교식도 받는다.
function matchNumber(value: number, raw: string) {
  const text = raw.replace(/\s|%|명|개|건/g, "");
  const match = /^(>=|<=|>|<|=)?(-?\d+(?:\.\d+)?)$/.exec(text);
  if (!match) return false;

  const target = Number(match[2]);
  switch (match[1]) {
    case ">=":
      return value >= target;
    case "<=":
      return value <= target;
    case ">":
      return value > target;
    case "<":
      return value < target;
    default:
      return value === target;
  }
}

const MEMBER_LIMIT = 60; // 팝업에 보여줄 최대 인원

// 조직별 라이선스 사용 현황 — 검색으로 좁혀 보고, 조직명에 마우스를 올리면(또는 클릭해 고정하면)
// 그 조직에서 누가 무슨 라이선스를 쓰는지 표로 보여준다.
export default function OrgLicenseTable({ rows }: { rows: OrgLicenseRow[] }) {
  const [query, setQuery] = useState("");
  const [field, setField] = useState<SearchField>("all");
  const [popover, setPopover] = useState<{ row: OrgLicenseRow; top: number; left: number } | null>(null);
  const [pinned, setPinned] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row) => {
      const rate = row.headcount ? Math.round((row.assigned / row.headcount) * 100) : 0;

      if (field === "org") return row.org.toLowerCase().includes(keyword);
      if (field === "license") return row.license.toLowerCase().includes(keyword);
      if (field === "headcount") return matchNumber(row.headcount, keyword);
      if (field === "assigned") return matchNumber(row.assigned, keyword);
      if (field === "rate") return matchNumber(rate, keyword);

      // 전체 검색 — 글자(License·조직)와 숫자(인원·할당 수·사용률)를 모두 훑는다
      return (
        row.license.toLowerCase().includes(keyword) ||
        row.org.toLowerCase().includes(keyword) ||
        matchNumber(row.headcount, keyword) ||
        matchNumber(row.assigned, keyword) ||
        matchNumber(rate, keyword)
      );
    });
  }, [rows, query, field]);

  const placeAt = (row: OrgLicenseRow, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const popoverHeight = 320;
    const top = Math.min(rect.top, Math.max(12, window.innerHeight - popoverHeight - 12));
    setPopover({ row, top, left: rect.right + 12 });
  };

  const close = () => {
    setPopover(null);
    setPinned(false);
  };

  // 고정된 동안에는 팝업 바깥 클릭·ESC로 닫는다(팝업 안쪽 클릭은 유지).
  useEffect(() => {
    if (!pinned) return;

    const onPointerDown = (event: MouseEvent) => {
      if (popoverRef.current?.contains(event.target as Node)) return;
      setPopover(null);
      setPinned(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPopover(null);
        setPinned(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pinned]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-md items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 focus-within:border-[#1d428a] focus-within:bg-white">
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
          placeholder="검색어 입력 (숫자 칼럼은 >=5 처럼 비교도 가능)"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
        />
        <span className="shrink-0 rounded bg-[#1d428a]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#1d428a]">
          {filtered.length.toLocaleString()}건
        </span>
      </div>

      <div className="max-h-[420px] overflow-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500">
            <tr>
              {["License", "조직", "인원", "할당 수", "조직 인원 대비 사용률"].map((head) => (
                <th key={head} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-800">
            {filtered.map((row) => {
              const active = pinned && popover?.row.org === row.org && popover?.row.license === row.license;
              const rate = row.headcount ? Math.round((row.assigned / row.headcount) * 100) : 0;
              return (
                <tr key={`${row.license}::${row.org}`} className="border-t border-gray-100 hover:bg-gray-50/70">
                  <td
                    className="px-3 py-2.5"
                    title={`${row.license} · ${row.org}에서 ${row.assigned}명이 사용 중`}
                  >
                    <span className="font-medium">{row.license}</span>
                    <span className="ml-1 text-gray-400">({row.assigned})</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onMouseEnter={(e) => {
                        if (pinned) return;
                        placeAt(row, e.currentTarget);
                      }}
                      onMouseLeave={() => {
                        if (pinned) return;
                        setPopover(null);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (active) {
                          close();
                          return;
                        }
                        placeAt(row, e.currentTarget);
                        setPinned(true);
                      }}
                      title={`${row.org} 사용자별 License (클릭하면 고정)`}
                      className={`cursor-pointer font-medium underline decoration-dotted underline-offset-4 transition hover:text-[#1d428a] hover:decoration-[#1d428a] ${
                        active ? "text-[#1d428a] decoration-[#1d428a]" : "decoration-gray-300"
                      }`}
                    >
                      {row.org}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.headcount.toLocaleString()}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.assigned.toLocaleString()}</td>
                  <td
                    className="px-3 py-2.5"
                    title={`${row.org} ${row.headcount}명 중 ${row.assigned}명이 ${row.license} 사용 (${rate}%)`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                        <span
                          className="block h-full rounded-full bg-[#1d428a]"
                          style={{ width: `${Math.min(100, rate)}%` }}
                        />
                      </span>
                      <span className="w-12 text-right font-semibold tabular-nums text-gray-700">{rate}%</span>
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                  조건에 맞는 결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {popover && (
        <div
          ref={popoverRef}
          className={`fixed z-50 w-[400px] rounded-xl border bg-white shadow-xl ${
            pinned ? "border-[#1d428a]/40 ring-2 ring-[#1d428a]/15" : "pointer-events-none border-gray-200"
          }`}
          style={{ top: popover.top, left: popover.left }}
        >
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            {pinned && (
              <button
                type="button"
                onClick={close}
                aria-label="닫기"
                title="닫기"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
            <p className="flex-1 truncate text-xs font-bold text-gray-900">{popover.row.org}</p>
            <p className="shrink-0 text-[11px] text-gray-500">
              인원 {popover.row.headcount}명 · License{" "}
              {popover.row.members.reduce((sum, m) => sum + m.licenses.length, 0)}개
            </p>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            <table className="w-full table-fixed text-left text-[11px]">
              <thead className="sticky top-0 bg-gray-50 text-gray-500">
                <tr>
                  <th className="w-16 px-3 py-1.5 font-medium">이름</th>
                  <th className="w-28 px-3 py-1.5 font-medium">계정</th>
                  <th className="px-3 py-1.5 font-medium">사용 중인 License</th>
                </tr>
              </thead>
              <tbody>
                {popover.row.members.slice(0, MEMBER_LIMIT).map((member) => (
                  <tr key={member.account} className="border-t border-gray-50 align-top">
                    <td className="whitespace-nowrap px-3 py-1.5 font-medium text-gray-800">{member.name || "-"}</td>
                    <td className="max-w-[120px] truncate px-3 py-1.5 text-gray-500" title={member.account}>
                      {member.account}
                    </td>
                    <td className="px-3 py-1.5">
                      {member.licenses.length === 0 ? (
                        <span className="text-gray-400">없음</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {member.licenses.map((license) => (
                            <span
                              key={license}
                              className={`break-all rounded px-1 py-0.5 text-[10px] font-medium ${
                                license === popover.row.license
                                  ? "bg-[#1d428a] text-white"
                                  : "bg-[#1d428a]/10 text-[#1d428a]"
                              }`}
                            >
                              {license}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {popover.row.members.length > MEMBER_LIMIT && (
            <p className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400">
              상위 {MEMBER_LIMIT}명만 표시 (총 {popover.row.members.length}명)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
