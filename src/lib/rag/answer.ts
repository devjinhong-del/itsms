import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";
import { chatComplete, embedText, type ChatMessage } from "./openai";

const MATCH_COUNT = 8; // 질문 하나에 참고할 조각 수
const MIN_SIMILARITY = 0.2; // 이보다 덜 비슷한 조각은 근거로 쓰지 않는다
const KEYWORD_LIMIT = 3; // 식별자가 그대로 들어 있는 조각을 몇 개까지 더 볼지
const NOT_FOUND = "문서에 없습니다.";

// 답변 규칙 — 올린 문서(와 학습시킨 DB 내용)에 있는 것만 근거로 삼는다.
const SYSTEM_PROMPT = [
  "당신은 사내 자료를 안내하는 도우미입니다.",
  "",
  "지켜야 할 규칙:",
  "1. 아래 [참고 자료]에 적힌 내용만 근거로 답하세요. 자료에 없는 내용은 절대 지어내지 마세요.",
  `2. 참고 자료에서 답을 찾을 수 없으면 다른 말을 덧붙이지 말고 "${NOT_FOUND}" 라고만 답하세요.`,
  "3. 항상 한국어 존댓말로 답하세요.",
  "4. 친절한 선생님처럼 쉬운 말로 설명하되, 자료에 있는 내용은 빠뜨리지 말고 모두 알려주세요.",
  "5. 숫자·이름·날짜는 자료에 적힌 값을 그대로 옮기세요. 추측해서 바꾸지 마세요.",
  "6. 항목이 여러 개면 줄바꿈이나 번호를 써서 보기 좋게 정리하세요.",
].join("\n");

export interface RagAnswer {
  answer: string;
  sources: string[]; // 근거로 쓴 문서 제목
}

interface MatchedChunk {
  id: number;
  document_id: number;
  title: string;
  content: string;
  similarity: number;
}

// 자산번호(IFH01990)·계정·모델코드처럼 "영문+숫자"로 된 식별자를 질문에서 뽑아낸다.
const IDENTIFIER = /[A-Za-z][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*/g;

async function findByKeyword(question: string): Promise<MatchedChunk[]> {
  const keywords = [...new Set(question.match(IDENTIFIER) ?? [])]
    .filter((word) => word.length >= 4)
    .slice(0, 2);
  if (keywords.length === 0) return [];

  const admin = getSupabaseAdmin();
  const found: MatchedChunk[] = [];

  for (const keyword of keywords) {
    const { data } = await admin
      .from("rag_chunks")
      .select("id, document_id, content, rag_documents(title)")
      .ilike("content", `%${keyword}%`)
      .limit(KEYWORD_LIMIT);

    for (const row of (data ?? []) as unknown as {
      id: number;
      document_id: number;
      content: string;
      rag_documents: { title: string } | { title: string }[] | null;
    }[]) {
      const document = Array.isArray(row.rag_documents) ? row.rag_documents[0] : row.rag_documents;
      found.push({
        id: row.id,
        document_id: row.document_id,
        title: document?.title ?? "사내 자료",
        content: row.content,
        similarity: 1,
      });
    }
  }

  return found;
}

export async function answerQuestion(question: string, history: ChatMessage[] = []): Promise<RagAnswer> {
  const trimmed = question.trim();
  if (!trimmed) return { answer: "질문을 입력해 주세요.", sources: [] };

  const admin = getSupabaseAdmin();
  const embedding = await embedText(trimmed);

  const { data, error } = await admin.rpc("match_rag_chunks", {
    query_embedding: embedding as unknown as string,
    match_count: MATCH_COUNT,
    min_similarity: MIN_SIMILARITY,
  });

  if (error) throw new Error(`자료 검색 실패: ${error.message}`);

  // 의미 검색만으로는 "IFH01990" 같은 자산번호·계정처럼 생긴 값이 잘 안 잡힌다.
  // 질문에 그런 식별자가 들어 있으면 글자 그대로 포함된 조각도 함께 찾아 근거에 더한다.
  const keywordChunks = await findByKeyword(trimmed);

  const merged = new Map<number, MatchedChunk>();
  for (const chunk of [...keywordChunks, ...((data ?? []) as MatchedChunk[])]) {
    if (!merged.has(chunk.id)) merged.set(chunk.id, chunk);
  }

  const chunks = [...merged.values()].slice(0, MATCH_COUNT + KEYWORD_LIMIT);
  if (chunks.length === 0) {
    return { answer: NOT_FOUND, sources: [] };
  }

  const context = chunks
    .map((chunk, index) => `[자료 ${index + 1}] (출처: ${chunk.title})\n${chunk.content}`)
    .join("\n\n---\n\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    // 직전 대화 몇 개만 함께 넘겨서 "그건 뭔가요?" 같은 이어지는 질문도 이해하게 한다.
    ...history.slice(-6),
    { role: "user", content: `[참고 자료]\n${context}\n\n[질문]\n${trimmed}` },
  ];

  const answer = await chatComplete(messages);
  const sources = [...new Set(chunks.map((chunk) => chunk.title))];

  // 자료에서 못 찾았다고 답한 경우에는 출처를 붙이지 않는다.
  if (answer.replace(/\s/g, "").startsWith(NOT_FOUND.replace(/\s/g, "").slice(0, 6))) {
    return { answer: NOT_FOUND, sources: [] };
  }

  return { answer: answer || NOT_FOUND, sources };
}
