"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";
import { getChatbotAccess } from "@/lib/rag/access";
import { ingestDatabase, ingestText } from "@/lib/rag/ingest";

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

export interface RagActionResult {
  ok: boolean;
  message: string;
}

// PDF에서 글자만 뽑아낸다(스캔 이미지로만 된 PDF는 글자가 없어 실패한다).
async function extractPdfText(file: File) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

export async function uploadRagDocument(_prev: RagActionResult | undefined, formData: FormData): Promise<RagActionResult> {
  const access = await getChatbotAccess();
  if (!access.canManage) return { ok: false, message: "권한이 없습니다." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "파일을 선택해 주세요." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, message: "파일이 너무 큽니다. 8MB 이하로 올려주세요." };
  }

  const name = file.name.toLowerCase();
  const isPdf = name.endsWith(".pdf");
  const isText = /\.(txt|md|csv)$/.test(name);
  if (!isPdf && !isText) {
    return { ok: false, message: "PDF, TXT, MD, CSV 파일만 올릴 수 있습니다." };
  }

  try {
    const text = isPdf ? await extractPdfText(file) : await file.text();
    const result = await ingestText({
      title: file.name,
      text,
      sourceType: "file",
      fileSize: file.size,
      uploadedBy: access.email,
    });

    revalidatePath("/admin/rag");
    return { ok: true, message: `"${file.name}" 학습 완료 — ${result.chunkCount}개 조각으로 나눠 저장했습니다.` };
  } catch (error) {
    console.error("문서 학습 실패:", error);
    return { ok: false, message: error instanceof Error ? error.message : "문서를 학습시키지 못했습니다." };
  }
}

// 사내 DB(자산·M365 사용자·라이선스·실사 내역)를 다시 읽어 학습시킨다.
export async function reindexDatabase(): Promise<RagActionResult> {
  const access = await getChatbotAccess();
  if (!access.canManage) return { ok: false, message: "권한이 없습니다." };

  try {
    const results = await ingestDatabase(access.email);
    const total = results.reduce((sum, item) => sum + item.chunkCount, 0);
    revalidatePath("/admin/rag");
    return { ok: true, message: `DB ${results.length}종을 다시 학습했습니다 — 총 ${total}개 조각.` };
  } catch (error) {
    console.error("DB 학습 실패:", error);
    return { ok: false, message: error instanceof Error ? error.message : "DB를 학습시키지 못했습니다." };
  }
}

export async function deleteRagDocument(documentId: number): Promise<RagActionResult> {
  const access = await getChatbotAccess();
  if (!access.canManage) return { ok: false, message: "권한이 없습니다." };

  const admin = getSupabaseAdmin();
  // rag_chunks는 document_id에 ON DELETE CASCADE가 걸려 있어 함께 지워진다.
  const { error } = await admin.from("rag_documents").delete().eq("id", documentId);
  if (error) return { ok: false, message: `삭제 실패: ${error.message}` };

  revalidatePath("/admin/rag");
  return { ok: true, message: "삭제했습니다." };
}
