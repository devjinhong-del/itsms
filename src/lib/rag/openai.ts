// OpenAI 호출은 전부 서버에서만 일어난다. 키는 .env의 OPENAI_API_KEY만 쓰고,
// 클라이언트로 내려보내거나 화면에 표시하지 않는다.
const OPENAI_API = "https://api.openai.com/v1";

export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536차원, 저렴
export const CHAT_MODEL = "gpt-4o-mini"; // 비용이 적게 드는 모델

function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  return key;
}

async function callOpenAI(path: string, body: unknown) {
  const res = await fetch(`${OPENAI_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    // 키 값이 섞여 나가지 않도록 응답 본문 앞부분만 남긴다.
    throw new Error(`OpenAI 요청 실패 (${res.status}): ${detail.slice(0, 300)}`);
  }

  return res.json();
}

// 여러 문장을 한 번에 임베딩한다(요청 수를 줄여 비용·시간을 아낀다).
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const data = (await callOpenAI("/embeddings", {
    model: EMBEDDING_MODEL,
    input: texts,
  })) as { data: { embedding: number[]; index: number }[] };

  return data.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const data = (await callOpenAI("/chat/completions", {
    model: CHAT_MODEL,
    messages,
    temperature: 0.2, // 문서에 있는 내용을 그대로 옮기는 성격이라 낮게 둔다
  })) as { choices: { message: { content: string } }[] };

  return data.choices[0]?.message?.content?.trim() ?? "";
}
