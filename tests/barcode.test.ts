import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { parseBarcodeText } from "../src/lib/barcode";

describe("바코드 원문 해석", () => {
  test("두 덩어리로 찍히면 앞은 모델코드(앞의 1 제거), 뒤는 자산번호", () => {
    assert.deepEqual(parseBarcodeText("116Z90TR IFH01990"), {
      modelCode: "16Z90TR",
      assetNo: "IFH01990",
    });
  });

  test("구분자가 공백이 아니어도 나뉜다", () => {
    assert.equal(parseBarcodeText("1ABC123,IFH01990").assetNo, "IFH01990");
    assert.equal(parseBarcodeText("1ABC123;IFH01990").assetNo, "IFH01990");
  });

  test("소문자로 읽혀도 대문자로 맞춘다", () => {
    assert.deepEqual(parseBarcodeText("1abc123 ifh01990"), {
      modelCode: "ABC123",
      assetNo: "IFH01990",
    });
  });

  test("한 덩어리만 찍히면 모델코드와 자산번호를 같은 값으로 둔다", () => {
    assert.deepEqual(parseBarcodeText("  IFH01990  "), {
      modelCode: "IFH01990",
      assetNo: "IFH01990",
    });
  });

  test("앞자리가 1이 아니면 아무것도 떼지 않는다", () => {
    assert.equal(parseBarcodeText("ABC123 IFH01990").modelCode, "ABC123");
  });
});
