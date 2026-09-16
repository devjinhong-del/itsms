import type { ReactNode } from "react";

export const BRAND = "#1d428a";

// 차트에 쓰는 색 — 브랜드 네이비를 기준으로 톤만 바꿔서 한 세트처럼 보이게 한다.
export const CHART_COLORS = ["#1d428a", "#3a63b5", "#5d86d6", "#89a9e6", "#b3c7f0", "#d6e0f7"];

// className: 카드 자체 크기(예: 화면 1/3 높이)를 지정할 때 쓴다.
// bodyClassName: 카드 높이를 고정했을 때 내용만 안쪽에서 스크롤되게 하려고 쓴다(flex-1 min-h-0 overflow-y-auto).
export function SectionCard({
  title,
  description,
  right,
  className = "",
  bodyClassName = "",
  children,
}: {
  title: string;
  description?: string;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
        </div>
        {right}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  unit,
  sub,
  tone = "default",
  className = "",
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  tone?: "default" | "brand" | "warn";
  // className: 카드 높이를 옆 카드와 맞추는 등 바깥에서 크기를 조절할 때 쓴다.
  className?: string;
}) {
  const toneClass =
    tone === "brand" ? "text-[#1d428a]" : tone === "warn" ? "text-amber-600" : "text-gray-900";

  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${toneClass}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-gray-400">{unit}</span>}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// 가로 막대 목록 — 값이 큰 순으로 정렬해서 넘겨주면 된다.
export function BarList({
  items,
  unit = "대",
  max,
}: {
  // title: 막대에 마우스를 올렸을 때 보여줄 상세 설명(차트 툴팁 역할)
  items: { label: string; value: number; hint?: string; title?: string }[];
  unit?: string;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li
          key={item.label}
          title={item.title ?? item.label}
          className={`flex items-center gap-3 rounded-md px-1 py-0.5 text-xs transition ${
            item.title ? "cursor-help hover:bg-blue-50/70" : ""
          }`}
        >
          <span className="w-28 shrink-0 truncate text-gray-600">{item.label}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(2, (item.value / top) * 100)}%`, backgroundColor: BRAND }}
            />
          </span>
          <span className="w-20 shrink-0 text-right font-semibold tabular-nums text-gray-800">
            {item.value.toLocaleString()}
            <span className="ml-0.5 font-normal text-gray-400">{unit}</span>
          </span>
          {item.hint && <span className="w-16 shrink-0 text-right text-gray-400">{item.hint}</span>}
        </li>
      ))}
    </ul>
  );
}

// 도넛 차트(SVG) — 비중 비교용. 항목이 많으면 상위 몇 개만 넘기고 나머지는 "기타"로 묶어서 준다.
export function DonutChart({
  items,
  size = 148,
  centerLabel,
  centerValue,
}: {
  // title: 조각·범례에 마우스를 올렸을 때 보여줄 상세 설명(차트 툴팁 역할)
  items: { label: string; value: number; title?: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = items.reduce((sum, i) => sum + i.value, 0) || 1;
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;

  // 각 조각의 길이와 시작 위치(누적 길이)를 그리기 전에 미리 계산해둔다.
  const segments = items.reduce<{ label: string; title?: string; length: number; offset: number }[]>((acc, item) => {
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    acc.push({ label: item.label, title: item.title, length: (item.value / total) * circumference, offset });
    return acc;
  }, []);

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
          {segments.map((segment, index) => (
            <circle
              key={segment.label}
              r={radius}
              fill="none"
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
              strokeWidth={18}
              strokeDasharray={`${segment.length} ${circumference - segment.length}`}
              strokeDashoffset={-segment.offset}
            >
              {/* SVG의 <title>은 마우스를 올리면 브라우저 기본 툴팁으로 표시된다 */}
              <title>{segment.title ?? segment.label}</title>
            </circle>
          ))}
        </g>
        {(centerValue || centerLabel) && (
          <g>
            <text
              x={size / 2}
              y={size / 2 - 2}
              textAnchor="middle"
              className="fill-gray-900 text-[15px] font-bold"
            >
              {centerValue}
            </text>
            <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="fill-gray-400 text-[10px]">
              {centerLabel}
            </text>
          </g>
        )}
      </svg>

      <ul className="flex flex-1 flex-col gap-1.5 text-xs">
        {items.map((item, index) => (
          <li
            key={item.label}
            title={item.title ?? item.label}
            className={`flex items-center gap-2 rounded px-1 transition ${item.title ? "cursor-help hover:bg-blue-50/70" : ""}`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="flex-1 truncate text-gray-600">{item.label}</span>
            <span className="font-semibold tabular-nums text-gray-800">{item.value.toLocaleString()}</span>
            <span className="w-10 text-right tabular-nums text-gray-400">
              {Math.round((item.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-xs">
        {/* 카드 높이를 고정해 안쪽에서 스크롤될 때도 머리글은 계속 보이게 한다 */}
        <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-gray-800">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-gray-400">
        {text}
      </td>
    </tr>
  );
}

// 상태 배지 — 실사 완료/미완료처럼 상태를 한눈에 보이게 한다.
export function Badge({ tone, children }: { tone: "ok" | "warn" | "muted"; children: ReactNode }) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-gray-100 text-gray-500";

  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${toneClass}`}>{children}</span>;
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: BRAND }}
        />
      </span>
      <span className="w-10 text-right font-semibold tabular-nums text-gray-700">{percent}%</span>
    </span>
  );
}
