// 자산 바코드 원문을 모델코드와 자산번호로 나눈다.
//
// 사내에서 쓰는 바코드는 "1AB12345 IFH01990"처럼 두 덩어리로 찍히고,
// 앞쪽 모델코드에는 구분자로 1이 하나 더 붙어 나오기 때문에 그 1을 떼어낸다.
// 한 덩어리만 찍히면 같은 값을 둘 다에 쓴다(뒤에서 자산번호로 조회해 본다).
export function parseBarcodeText(raw: string): { modelCode: string; assetNo: string } {
  const stripLeadingOne = (value: string) => (value.startsWith("1") ? value.slice(1) : value);
  const parts = raw.trim().split(/[\s,;|]+/);

  if (parts.length >= 2) {
    return {
      modelCode: stripLeadingOne(parts[0].toUpperCase()),
      assetNo: parts[1].toUpperCase(),
    };
  }

  const code = stripLeadingOne(raw.trim().toUpperCase());
  return { modelCode: code, assetNo: code };
}
