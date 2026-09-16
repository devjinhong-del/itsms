import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { matchNumber } from "../src/lib/search";

describe("표 숫자 칼럼 검색", () => {
  test("숫자만 쓰면 같은 값만 걸린다", () => {
    assert.equal(matchNumber(12, "12"), true);
    assert.equal(matchNumber(13, "12"), false);
  });

  test("비교식을 지원한다", () => {
    assert.equal(matchNumber(80, ">=80"), true);
    assert.equal(matchNumber(79, ">=80"), false);
    assert.equal(matchNumber(3, "<5"), true);
    assert.equal(matchNumber(5, "<5"), false);
    assert.equal(matchNumber(11, ">10"), true);
    assert.equal(matchNumber(9, "<=9"), true);
  });

  test("표에 적힌 대로 단위를 붙여 쳐도 걸린다", () => {
    assert.equal(matchNumber(50000, "50,000원"), true);
    assert.equal(matchNumber(80, ">= 80%"), true);
    assert.equal(matchNumber(12, "12명"), true);
  });

  test("숫자가 아니면 걸리지 않는다", () => {
    assert.equal(matchNumber(12, "IT팀"), false);
    assert.equal(matchNumber(12, ""), false);
  });
});
