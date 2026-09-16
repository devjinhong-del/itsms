import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { splitIntoChunks } from "../src/lib/rag/chunk";

describe("RAG 문서 조각내기", () => {
  test("짧은 글은 한 조각으로 둔다", () => {
    const chunks = splitIntoChunks("자산번호 IFH01990 · 사용자 김진홍 · 월 렌탈료 103,000원");
    assert.equal(chunks.length, 1);
  });

  test("어떤 조각도 정해진 크기를 넘지 않는다", () => {
    // 표를 한 줄씩 적은 글 — 줄바꿈만 있고 문장 부호가 없어 예전에 한 덩어리로 뭉쳤다
    const line = "자산번호 IFH01990 · 종류 노트북 · 사용부서 IT팀 · 사용자 김진홍 · 월 렌탈료 103,000원";
    const chunks = splitIntoChunks(Array.from({ length: 300 }, () => line).join("\n"), 1200, 150);

    assert.ok(chunks.length > 1, "여러 조각으로 나뉘어야 한다");
    for (const chunk of chunks) assert.ok(chunk.length <= 1200, `조각이 너무 김: ${chunk.length}`);
  });

  test("띄어쓰기 없는 아주 긴 문자열도 잘라낸다", () => {
    const chunks = splitIntoChunks("가".repeat(5000), 1200, 150);
    for (const chunk of chunks) assert.ok(chunk.length <= 1200);
  });

  test("빈 글은 조각이 없다", () => {
    assert.deepEqual(splitIntoChunks("   \n\n  "), []);
  });
});
