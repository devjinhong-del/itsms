// 긴 글을 임베딩하기 좋은 크기로 자른다.
// 줄·문장 경계를 최대한 지키되, 어떤 경우에도 조각 하나가 정해진 크기를 넘지 않게 한다
// (넘으면 임베딩 API가 "maximum input length" 오류를 낸다 — 표를 한 줄씩 쓴 글이 특히 그렇다).
const CHUNK_SIZE = 1200; // 글자 수 기준(한국어는 1글자 ≒ 1토큰 안팎)
const CHUNK_OVERLAP = 150;

// 한 덩어리가 아직도 너무 길면 문장 → 글자 수 순으로 강제로 쪼갠다.
function forceSplit(text: string, size: number): string[] {
  if (text.length <= size) return [text];

  const sentences = text.split(/(?<=[.!?。])\s+/);
  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > size) {
      if (current) {
        pieces.push(current);
        current = "";
      }
      for (let start = 0; start < sentence.length; start += size) {
        pieces.push(sentence.slice(start, start + size));
      }
      continue;
    }

    if (current.length + sentence.length + 1 > size) {
      pieces.push(current);
      current = "";
    }
    current += (current ? " " : "") + sentence;
  }

  if (current) pieces.push(current);
  return pieces;
}

export function splitIntoChunks(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];

  // 줄 단위로 모으다가 한도에 닿으면 끊는다. 앞 조각의 끝을 조금 물고 시작해 문맥이 끊기지 않게 한다.
  const lines = normalized.split("\n");
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = trimmed.length > overlap ? `${trimmed.slice(-overlap)}\n` : "";
  };

  for (const line of lines) {
    for (const piece of forceSplit(line, chunkSize)) {
      if (current.length + piece.length + 1 > chunkSize) flush();
      current += (current ? "\n" : "") + piece;
    }
  }

  const last = current.trim();
  if (last) chunks.push(last);

  // 겹침 때문에 마지막 조각이 앞 조각과 똑같아지는 경우를 걸러낸다.
  return chunks.filter((chunk, index) => chunk.length > 20 && chunk !== chunks[index - 1]);
}
