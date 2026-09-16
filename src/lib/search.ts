// 표 검색에서 숫자 칼럼을 다루는 공통 규칙.
// "12"처럼 값만 쓰면 같은 값, ">=5" "<3" ">10"처럼 쓰면 비교로 걸러낸다.
// 사람이 표에 적힌 대로 "5명", "50,000원", "80%"라고 쳐도 되게 단위 문자는 무시한다.
export function matchNumber(value: number, raw: string) {
  const text = raw.replace(/[\s,%원명개건대]/g, "");
  const match = /^(>=|<=|>|<|=)?(-?\d+(?:\.\d+)?)$/.exec(text);
  if (!match) return false;

  const target = Number(match[2]);
  switch (match[1]) {
    case ">=":
      return value >= target;
    case "<=":
      return value <= target;
    case ">":
      return value > target;
    case "<":
      return value < target;
    default:
      return value === target;
  }
}
