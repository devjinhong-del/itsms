import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";
import { requireChatbotManager } from "@/lib/rag/access";
import { SectionCard, StatTile } from "@/components/dashboard";
import RagManager, { type RagDocumentRow } from "@/components/rag/RagManager";

export const dynamic = "force-dynamic";

interface DocumentRow {
  id: number;
  title: string;
  source_type: string;
  chunk_count: number;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export default async function AdminRagPage() {
  await requireChatbotManager();

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("rag_documents")
    .select("id, title, source_type, chunk_count, file_size, uploaded_by, created_at")
    .order("created_at", { ascending: false });

  const documents = (data ?? []) as DocumentRow[];
  const rows: RagDocumentRow[] = documents.map((row) => ({
    id: row.id,
    title: row.title,
    sourceType: row.source_type,
    chunkCount: row.chunk_count,
    fileSize: row.file_size,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  }));

  const fileCount = documents.filter((row) => row.source_type === "file").length;
  const dbCount = documents.filter((row) => row.source_type === "database").length;
  const chunkTotal = documents.reduce((sum, row) => sum + (row.chunk_count ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="업로드 문서" value={fileCount} unit="건" sub="PDF·TXT·MD·CSV" tone="brand" />
        <StatTile label="학습한 사내 DB" value={dbCount} unit="종" sub="자산·사용자·라이선스·실사" />
        <StatTile label="학습 조각" value={chunkTotal.toLocaleString()} unit="개" sub="질문에 근거로 쓰이는 단위" />
      </div>

      <SectionCard
        title="AI 도우미 학습 자료"
        description="여기에 올린 자료만 근거로 답합니다. 자료에 없는 질문에는 '문서에 없습니다'라고 답합니다."
      >
        <RagManager rows={rows} />
      </SectionCard>

      <p className="text-[11px] text-gray-400">
        ※ 글자를 뽑을 수 없는 스캔 이미지 PDF는 학습되지 않습니다. 파일은 8MB 이하로 올려주세요.
      </p>
    </div>
  );
}
