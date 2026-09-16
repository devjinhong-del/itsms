"""M365 CSV의 이름/부서/라이선스 칼럼을 규칙대로 분해하는 함수들."""

import re

# 한글 음절(가~힣) 연속 구간. 밑줄(_)로 이어진 경우("퇴사_백준")도 끊지 않고 계속 이어서 추출한다
# (밑줄을 "끊음"이 아니라 "연결자"로 본다 — 예: 퇴사자 표시 접두사 "퇴사_" + 실제 이름).
_HANGUL_RUN = re.compile(r"^[가-힣]+(?:_[가-힣]+)*")


def extract_name(display_name: str) -> str:
    """이름 추출 규칙.

    - 앞뒤 공백 제거
    - 한글로 시작하면: 맨 앞의 연속된 한글(밑줄로 이어진 한글 포함)을 이름으로 추출
      - 그 뒤에 영문 대문자 한 글자(A~Z)가 붙어 있고,
        그다음이 문자열 끝/공백/괄호이면 동명이인 구분자로 보고 이름에 포함
    - 한글로 시작하지 않으면 전체 텍스트를 그대로 사용
    """
    text = display_name.strip()
    if not text:
        return text

    match = _HANGUL_RUN.match(text)
    if not match:
        return text  # 한글로 시작하지 않음 → 전체 그대로

    name = match.group(0)
    rest = text[len(name):]

    if rest and "A" <= rest[0] <= "Z":
        after = rest[1:2]
        if after in ("", " ", "("):
            name += rest[0]

    return name


class DepartmentParts:
    def __init__(self, division: str | None, office: str | None, team: str | None, department_raw: str | None):
        self.division = division
        self.office = office
        self.team = team
        self.department_raw = department_raw


def parse_department(raw: str) -> DepartmentParts:
    """부서 문자열을 본부/실/팀으로 분해한다.

    예) "생산본부 생산지원실 생산기획팀" → division/office/team 3단계.
    "Partner Success팀"처럼 팀 이름 안에 공백이 있을 수 있어, 공백 기준 토큰 분리가 아니라
    "본부"/"실" 접미사가 나오는 지점까지를 통째로 잘라내고 나머지를 팀으로 취급한다.
    본부/실/팀 어디에도 안 걸리면 department_raw에 원본 전체를 담는다.
    """
    text = (raw or "").strip()
    if not text or text == "-":
        return DepartmentParts(None, None, None, None)

    rest = text
    division = None
    office = None

    m = re.match(r"^(.*?본부)\s*", rest)
    if m:
        division = m.group(1)
        rest = rest[m.end():]

    m = re.match(r"^(.*?실)\s*", rest)
    if m:
        office = m.group(1)
        rest = rest[m.end():]

    rest = rest.strip()
    team = rest or None

    if not division and not office and not team:
        return DepartmentParts(None, None, None, text)

    return DepartmentParts(division, office, team, text)


def normalize_account(raw: str) -> str:
    """계정(UPN) 값에 '#'이 있으면 그 앞부분만 쓴다.

    예) 게스트 계정 "2210400_daewoong.co.kr#EXT#@jeisys1.onmicrosoft.com" → "2210400_daewoong.co.kr"
    """
    text = (raw or "").strip()
    return text.split("#", 1)[0]


def parse_licenses(raw: str) -> list[str | None]:
    """쉼표로 나열된 라이선스를 분리한다. 없으면 [None] 하나짜리 목록을 돌려준다."""
    text = (raw or "").strip()
    if not text or text in ("-", "라이선스 없음"):
        return [None]

    licenses = [s.strip() for s in text.split(",") if s.strip()]
    return licenses or [None]
