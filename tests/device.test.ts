import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { isMobileUserAgent } from "../src/lib/device";

describe("모바일 기기 판별", () => {
  const MOBILE: Record<string, string> = {
    "삼성 인터넷": "Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 SamsungBrowser/23.0 Mobile Safari/537.36",
    "안드로이드 크롬": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
    "아이폰 사파리": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  };
  const DESKTOP: Record<string, string> = {
    "윈도우 크롬": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "맥 사파리": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  };

  for (const [name, ua] of Object.entries(MOBILE)) {
    test(`${name}는 모바일로 본다`, () => assert.equal(isMobileUserAgent(ua), true));
  }
  for (const [name, ua] of Object.entries(DESKTOP)) {
    test(`${name}는 PC로 본다`, () => assert.equal(isMobileUserAgent(ua), false));
  }

  test("User-Agent가 없으면 PC로 본다", () => {
    assert.equal(isMobileUserAgent(null), false);
    assert.equal(isMobileUserAgent(undefined), false);
  });
});
