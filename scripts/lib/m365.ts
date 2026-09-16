// M365 CSV의 "이름/부서/라이선스" 칼럼을 규칙대로 분해하는 함수들.

// 한글 음절(가~힣) 범위로 시작하는지 확인
function startsWithHangul(text: string): boolean {
  const code = text.codePointAt(0) ?? 0;
  return code >= 0xac00 && code <= 0xd7a3;
}

// 이름: 한글로 시작하면 첫 공백 전까지만, 그 외(영어/숫자 시작)엔 전체 텍스트 그대로.
// 예) "이가연 (Gayeon Lee)" → "이가연" / "153tech" → "153tech"
export function parseName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return trimmed;

  if (startsWithHangul(trimmed)) {
    const spaceIndex = trimmed.indexOf(" ");
    return spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  }
  return trimmed;
}

export interface DepartmentParts {
  division: string | null; // OO본부
  office: string | null; // OO실
  team: string | null; // OO팀
  departmentRaw: string | null; // 원본 전체(본부/실/팀 어디에도 안 걸리면 이 값이 소속명)
}

// 부서 문자열 예) "생산본부 생산지원실 생산기획팀" → division/office/team 3단계로 분해.
// "Partner Success팀"처럼 팀 이름 안에 공백이 있을 수 있어, 공백 기준 토큰 분리가 아니라
// "본부"/"실" 접미사가 나오는 지점까지를 통째로 잘라내고 나머지를 팀으로 취급한다.
export function parseDepartment(raw: string): DepartmentParts {
  const trimmed = raw.trim();

  if (!trimmed || trimmed === "-") {
    return { division: null, office: null, team: null, departmentRaw: null };
  }

  let rest = trimmed;
  let division: string | null = null;
  let office: string | null = null;

  const divisionMatch = rest.match(/^(.*?본부)\s*/);
  if (divisionMatch) {
    division = divisionMatch[1];
    rest = rest.slice(divisionMatch[0].length);
  }

  const officeMatch = rest.match(/^(.*?실)\s*/);
  if (officeMatch) {
    office = officeMatch[1];
    rest = rest.slice(officeMatch[0].length);
  }

  rest = rest.trim();
  const team = rest || null;

  // 본부/실/팀 어느 것도 못 찾았으면(division/office/team 전부 비어있으면) 원본 전체를 보존한다.
  if (!division && !office && !team) {
    return { division: null, office: null, team: null, departmentRaw: trimmed };
  }

  return { division, office, team, departmentRaw: trimmed };
}

// 계정(UPN) 값에 '#'이 있으면 그 앞부분만 쓴다.
// 예) 게스트 계정 "2210400_daewoong.co.kr#EXT#@jeisys1.onmicrosoft.com" → "2210400_daewoong.co.kr"
export function normalizeAccount(raw: string): string {
  return raw.trim().split("#")[0];
}

// 라이선스: 쉼표로 여러 개 나열될 수 있고, "라이선스 없음"/"-"/빈 값이면 라이선스가 없는 것.
// 결과가 빈 배열이면 안 되므로, 라이선스가 없을 땐 [null] 하나짜리 배열을 돌려준다(그 사람 자체는 남겨야 하므로).
export function parseLicenses(raw: string): (string | null)[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "라이선스 없음") {
    return [null];
  }

  const licenses = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return licenses.length > 0 ? licenses : [null];
}
