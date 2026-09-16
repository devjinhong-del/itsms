"use client";

import { useState, useTransition } from "react";
import {
  deleteRagDocument,
  reindexDatabase,
  uploadRagDocument,
  type RagActionResult,
} from "@/app/(main)/admin/rag/actions";
import { formatKstDateTimeWithYear } from "@/lib/date";

export interface RagDocumentRow {
  id: number;
  title: string;
  sourceType: string;
  chunkCount: number;
  fileSize: number | null;
  uploadedBy: string | null;
  createdAt: string;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function RagManager({ rows }: { rows: RagDocumentRow[] }) {
  const [result, setResult] = useState<RagActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleUpload(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const next = await uploadRagDocument(undefined, formData);
      setResult(next);
    });
  }

  function handleReindex() {
    setResult(null);
    startTransition(async () => {
      setResult(await reindexDatabase());
    });
  }

  function handleDelete(id: number, title: string) {
    if (!window.confirm(`"${title}" 학습 내용을 삭제할까요? 챗봇이 더 이상 이 문서를 근거로 답하지 않습니다.`)) return;
    setResult(null);
    startTransition(async () => {
      setResult(await deleteRagDocument(id));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={handleUpload} className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
        <input
          type="file"
          name="file"
          accept=".pdf,.txt,.md,.csv"
          required
          className="flex-1 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#1d428a] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[#1d428a] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#173568] disabled:bg-gray-300"
        >
          {pending ? "처리 중..." : "학습시키기"}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleReindex}
          disabled={pending}
          className="rounded-lg border border-[#1d428a] px-4 py-2 text-xs font-semibold text-[#1d428a] transition hover:bg-[#1d428a]/5 disabled:opacity-50"
        >
          사내 DB 다시 학습시키기
        </button>
        <p className="text-[11px] text-gray-500">
          자산·M365 사용자·라이선스·실사 내역을 최신 상태로 다시 읽어 학습합니다(기존 DB 학습 내용은 교체됩니다).
        </p>
      </div>

      {result && (
        <p
          className={`rounded-lg px-3 py-2 text-xs ${
            result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {result.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              {["제목", "출처", "조각 수", "크기", "올린 사람", "등록일", ""].map((head) => (
                <th key={head} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-800">
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-3 py-2.5 font-medium">{row.title}</td>
                <td className="px-3 py-2.5 text-gray-600">{row.sourceType === "database" ? "사내 DB" : "업로드 문서"}</td>
                <td className="px-3 py-2.5 tabular-nums">{row.chunkCount.toLocaleString()}</td>
                <td className="px-3 py-2.5 tabular-nums text-gray-600">{formatSize(row.fileSize)}</td>
                <td className="px-3 py-2.5 text-gray-600">{row.uploadedBy ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gray-600">
                  {formatKstDateTimeWithYear(row.createdAt)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(row.id, row.title)}
                    disabled={pending}
                    className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  아직 학습시킨 자료가 없습니다. 문서를 올리거나 사내 DB를 학습시켜 주세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
