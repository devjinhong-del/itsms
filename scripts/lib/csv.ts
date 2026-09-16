// 아주 단순한 CSV 파서 — 큰따옴표로 묶인 필드 안의 쉼표/줄바꿈, ""(escaped quote)를 처리한다.
// (사용 중인 라이선스 칼럼처럼 한 칸 안에 쉼표가 여러 개 들어있는 CSV를 안전하게 읽기 위해 필요하다.)
export function parseCsv(text: string): string[][] {
  // UTF-8 BOM 제거
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // \n과 함께 처리하므로 무시
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.length > 1 || r[0] !== "");
}
