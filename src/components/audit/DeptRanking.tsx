"use client";

import { useEffect, useRef, useState } from "react";

export interface DeptAsset {
  assetNo: string;
  category: string;
  userName: string;
  audited: boolean;
}

export interface DeptRankRow {
  dept: string;
  total: number;
  done: number;
  percent: number;
  assets: DeptAsset[];
}

// 부서명에 마우스를 올리면 그 부서의 자산 목록을 띄우고, 클릭하면 그대로 고정된다.
// 고정된 팝업은 바깥을 클릭하거나 ESC, 좌측 상단 X 버튼으로 닫는다.
// 카드가 overflow로 잘리기 때문에, 팝업은 화면 기준(fixed) 좌표로 띄워 잘리지 않게 한다.
export default function DeptRanking({ rows }: { rows: DeptRankRow[] }) {
  const [popover, setPopover] = useState<{ row: DeptRankRow; top: number; left: number } | null>(null);
  // pinned=true면 부서명을 클릭해 "고정"한 상태 — 커서가 벗어나도 사라지지 않는다.
  const [pinned, setPinned] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const placeAt = (row: DeptRankRow, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const popoverHeight = 280;
    const top = Math.min(rect.top, Math.max(12, window.innerHeight - popoverHeight - 12));
    setPopover({ row, top, left: rect.right + 12 });
  };

  const close = () => {
    setPopover(null);
    setPinned(false);
  };

  // 고정된 동안에는 "팝업 바깥을 누르면 닫기"와 ESC 닫기를 붙인다.
  // 팝업 안쪽 클릭은 popoverRef.contains로 걸러서 닫히지 않게 한다.
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
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500">
            <tr>
              {["순위", "부서", "완료/대상", "진행률"].map((head) => (
                <th key={head} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-800">
            {rows.map((row, index) => {
              const active = pinned && popover?.row.dept === row.dept;
              return (
                <tr key={row.dept} className="border-t border-gray-100 hover:bg-gray-50/70">
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                        index < 3 ? "rank-glow bg-[#1d428a] text-white" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      // 커서만 올려도 보이고(이때는 커서가 벗어나면 사라진다), 클릭하면 고정된다.
                      onMouseEnter={(e) => {
                        if (pinned) return;
                        placeAt(row, e.currentTarget);
                      }}
                      onMouseLeave={() => {
                        if (pinned) return;
                        setPopover(null);
                      }}
                      onClick={(e) => {
                        // 이 클릭이 document까지 올라가면 바깥 클릭으로 인식돼 바로 닫히므로 여기서 멈춘다.
                        e.stopPropagation();
                        if (active) {
                          close();
                          return;
                        }
                        placeAt(row, e.currentTarget);
                        setPinned(true);
                      }}
                      title={`${row.dept} 자산 목록 (클릭하면 고정)`}
                      className={`cursor-pointer font-medium underline decoration-dotted underline-offset-4 transition hover:text-[#1d428a] hover:decoration-[#1d428a] ${
                        active ? "text-[#1d428a] decoration-[#1d428a]" : "decoration-gray-300"
                      }`}
                    >
                      {row.dept}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-600">
                    {row.done} / {row.total}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
                        <span
                          className="block h-full rounded-full bg-[#1d428a]"
                          style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }}
                        />
                      </span>
                      <span className="w-10 text-right font-semibold tabular-nums text-gray-700">{row.percent}%</span>
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-gray-400">
                  자산 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {popover && (
        <div
          ref={popoverRef}
          // 고정 상태일 때만 마우스 이벤트를 받는다(그냥 훑어볼 때는 팝업이 커서를 가로채지 않도록).
          className={`fixed z-50 w-[340px] rounded-xl border bg-white shadow-xl ${
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
            <p className="flex-1 truncate text-xs font-bold text-gray-900">{popover.row.dept}</p>
            <p className="shrink-0 text-[11px] text-gray-500">
              실사 {popover.row.done} / {popover.row.total}대 ({popover.row.percent}%)
            </p>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-1.5 font-medium">자산번호</th>
                  <th className="px-3 py-1.5 font-medium">종류</th>
                  <th className="px-3 py-1.5 font-medium">사용자</th>
                  <th className="px-3 py-1.5 font-medium">실사</th>
                </tr>
              </thead>
              <tbody>
                {popover.row.assets.map((asset) => (
                  <tr key={asset.assetNo} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 font-medium text-gray-800">{asset.assetNo}</td>
                    <td className="px-3 py-1.5 text-gray-600">{asset.category || "-"}</td>
                    <td className="px-3 py-1.5 text-gray-600">{asset.userName || "-"}</td>
                    <td className="px-3 py-1.5">
                      {asset.audited ? (
                        <span className="rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-700">완료</span>
                      ) : (
                        <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-500">미실사</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {popover.row.total > popover.row.assets.length && (
            <p className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400">
              상위 {popover.row.assets.length}대만 표시 (총 {popover.row.total}대)
            </p>
          )}
        </div>
      )}
    </>
  );
}
