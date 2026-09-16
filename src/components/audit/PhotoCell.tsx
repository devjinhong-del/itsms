"use client";

import { useState } from "react";

// 실사 제출 시 찍힌 사진이 Storage에 있는지 보여주고, 있으면 마우스를 올렸을 때 미리보기를 띄운다.
// 표 카드가 overflow로 잘리므로 미리보기는 화면 기준(fixed) 좌표로 띄운다.
export default function PhotoCell({ url, assetNo }: { url: string | null; assetNo: string }) {
  const [preview, setPreview] = useState<{ top: number; left: number } | null>(null);

  if (!url) {
    return (
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500" title="제출된 사진이 없습니다">
        없음
      </span>
    );
  }

  const show = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const previewHeight = 300;
    const top = Math.min(rect.top - 8, Math.max(12, window.innerHeight - previewHeight - 12));
    setPreview({ top, left: rect.right + 12 });
  };

  return (
    <>
      <span
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={() => setPreview(null)}
        className="cursor-help rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100"
      >
        있음
      </span>

      {preview && (
        <span
          className="pointer-events-none fixed z-50 block rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
          style={{ top: preview.top, left: preview.left }}
        >
          {/* 원본 그대로가 아니라 미리보기 크기로 줄여서 보여준다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${assetNo} 실사 사진`} className="block max-h-[260px] max-w-[260px] rounded-lg object-contain" />
          <span className="mt-1 block text-center text-[11px] font-medium text-gray-500">{assetNo}</span>
        </span>
      )}
    </>
  );
}
