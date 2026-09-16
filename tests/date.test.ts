import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { formatKstDateTime, kstDayKey } from "../src/lib/date";

// 서버(Vercel)는 UTC로 도는데 화면에는 한국 시간이 나와야 한다.
describe("한국 시간 표시", () => {
  test("UTC 밤 10시는 한국 시간으로 다음 날 오전 7시다", () => {
    const text = formatKstDateTime("2026-09-15T22:10:00+00:00");
    assert.match(text, /09\. 16\./);
    assert.match(text, /07:10/);
  });

  test("날짜 키도 한국 기준으로 넘어간다", () => {
    assert.equal(kstDayKey("2026-09-15T22:10:00+00:00"), "2026-09-16");
    assert.equal(kstDayKey("2026-09-15T14:59:00+00:00"), "2026-09-15");
    assert.equal(kstDayKey("2026-09-15T15:00:00+00:00"), "2026-09-16");
  });
});
