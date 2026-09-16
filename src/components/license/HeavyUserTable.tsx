"use client";

import { useState } from "react";

export interface HeavyUserRow {
  account: string;
  name: string;
  org: string;
  licenses: string[];
}

// 라이선스를 많이 보유한 계정 — 행에 마우스를 올리면 그 계정이 무슨 License를 쓰는지 표로 보여준다.
export default function HeavyUserTable({ rows }: { rows: HeavyUserRow[] }) {
  const [popover, setPopover] = useState<{ row: HeavyUserRow; top: number; left: number } | null>(null);

  const show = (row: HeavyUserRow, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const popoverHeight = 260;
    const top = Math.min(rect.top, Math.max(12, window.innerHeight - popoverHeight - 12));
    // 행은 표 전체 너비라서 커서를 가리지 않도록 표 오른쪽 끝에 붙여 띄운다.
    setPopover({ row, top, left: Math.min(rect.right - 320, window.innerWidth - 340) });
  };

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500">
            <tr>
              {["계정", "이름", "조직", "보유 License 수"].map((head) => (
                <th key={head} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-800">
            {rows.map((row) => (
              <tr
                key={row.account}
                onMouseEnter={(e) => show(row, e.currentTarget)}
                onMouseLeave={() => setPopover(null)}
                title={`${row.name || row.account}님이 보유한 License 목록`}
                className="cursor-help border-t border-gray-100 transition hover:bg-blue-50/60"
              >
                <td className="px-3 py-2.5 font-medium">{row.account}</td>
                <td className="px-3 py-2.5">{row.name || "-"}</td>
                <td className="px-3 py-2.5 text-gray-600">{row.org}</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums">{row.licenses.length}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-gray-400">
                  라이선스 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {popover && (
        <div
          className="pointer-events-none fixed z-50 w-[320px] rounded-xl border border-gray-200 bg-white shadow-xl"
          style={{ top: popover.top, left: popover.left }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
            <p className="truncate text-xs font-bold text-gray-900">
              {popover.row.name || popover.row.account}
              <span className="ml-1 font-normal text-gray-400">{popover.row.org}</span>
            </p>
            <p className="shrink-0 text-[11px] text-gray-500">{popover.row.licenses.length}종</p>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-gray-50 text-gray-500">
                <tr>
                  <th className="w-8 px-3 py-1.5 font-medium">#</th>
                  <th className="px-3 py-1.5 font-medium">License</th>
                </tr>
              </thead>
              <tbody>
                {popover.row.licenses.map((license, index) => (
                  <tr key={license} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 tabular-nums text-gray-400">{index + 1}</td>
                    <td className="px-3 py-1.5 font-medium text-gray-800">{license}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
