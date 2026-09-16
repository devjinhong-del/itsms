# DESIGN

PLAN.md의 작업 순서를 어떤 화면·데이터 흐름·기술로 구현할지 정리한 문서입니다.

> design-validator 검토를 반영해 다음을 확정했습니다: 데이터베이스는 Supabase(Postgres)로 확정, 인증은 Supabase Auth(이메일/비밀번호)로 확정(NextAuth.js 대신 — 별도 라이브러리 없이 비밀번호 변경까지 한 번에 해결), 데이터 모델을 명시, 로그인 붙기 전 개발 단계에서는 더미 데이터만 사용하는 보안 원칙을 추가했습니다.

## 0. 개발 단계 보안 원칙 (로그인이 붙기 전까지)

- 로그인(PLAN 작업 19)이 붙기 전까지는 실제 임직원 개인정보를 절대 넣지 않고, 이름·이메일 등은 전부 더미(가짜) 데이터로만 화면을 만들고 확인한다.
- 실제 M365/렌탈사이트 데이터 연동과 실사용자 개인정보 적재는 로그인·권한 제어가 붙은 이후에만 켠다.
- Vercel에 배포할 때도 로그인이 붙기 전까지는 공개 프로덕션 URL 대신 Vercel의 비공개(프리뷰) 배포만 쓴다.
- AI 챗봇에는 답변에 꼭 필요한 최소 정보만 건넨다(예: 담당자 이름·연락처 한두 줄만 전달하고, 사용자 표 전체를 통째로 넘기지 않는다).

## 1. 화면 구성 (무엇이 어디에 보이는지)

공통 조각: 화면 상단에 "일반 / 담당자 / 관리자 / AI챗봇" 메뉴를 둔다. 로그인이 붙기 전(작업 1~18)까지는 이 메뉴로 아무나 들어갈 수 있고, 작업 19에서 로그인 후 역할에 맞는 메뉴만 보이도록 바꾼다.

| 경로 | 화면 | 보이는 것 |
|---|---|---|
| `/` | 첫 화면(개인 대시보드) | 내 이름·사진·이메일·관련 장비·실사 현황·실사 진행·사용 라이선스 현황 |
| `/account` | 사용자 정보 바꾸기 | 비밀번호 변경 폼 |
| `/audit_oa` (완료) | 실사 입력 화면 | 카메라 미리보기(가이드라인+안내문구), 인식된 자산번호·모델코드·사용자 조직/이름, 확인/수정 후 제출. 별도 권한 없이 로그인한 사람 누구나 접근 |
| `/licenses` | 라이선스 신청 화면 | 보유 라이선스 리스트, 신청 가능/불가능 표시, 신청 버튼 |
| `/org` | 담당자 조직 현황 | 팀/실 구성원 이름·사진·장비·실사·라이선스 현황 목록 |
| `/admin` | 관리자 대시보드 | 전 구성원 현황 요약 카드 |
| `/admin/import` | 데이터 가져오기 | M365 CSV 업로드 폼, 렌탈사이트 동기화 버튼, 마지막 동기화 시각 |
| `/admin/licenses` | 라이선스 수량 관리 | 전체 대비 사용량, 팀별·종류별 현황 표 |
| `/admin/license-requests` | 라이선스 신청 승인 | 대기 중인 신청 목록, 승인/거절 버튼 |
| `/admin/inspection-schedule` | 실사 일정 오픈/마감 관리 | 일정 생성·변경·마감·취소 |
| `/admin/inspection-monitoring` | 실사 현황 모니터링 | 실시간 진행률, 조직별·개인별 현황 |
| `/admin/assignees` | 담당자 선임 | 서비스 영역별 담당자 지정/변경 |
| `/chatbot` | AI 챗봇 | 채팅창, 담당자·시스템 담당자 연락처 안내, HR 요청 알림/처리 상태 |
| `/login` | 로그인 | 이메일/비밀번호 입력 (**완료 — 배포 준비를 위해 순서를 앞당겨 먼저 구현함**) |

로그인은 Supabase Auth(이메일/비밀번호) + `@supabase/ssr`로 구현했다. 회원가입 화면은 없고, 관리자가 `scripts/create-user.ts`로 계정을 미리 만든다. `middleware.ts`가 모든 경로를 보호하며, 로그인 안 된 사용자는 `/login`으로 보낸다.

## 2. 데이터 모델 (표 구조)

Supabase 대시보드의 표 편집기(Table Editor)로 직접 만들 수 있어서, 별도 스키마 도구(Prisma 등) 없이 아래 표만 참고해서 만든다.

| 표(테이블) | 주요 칼럼 |
|---|---|
| `profiles` (완료) | id(uuid, `auth.users` 참조), email, name(이름), department(소속), photo_url, **role(일반=general/담당자=manager/관리자=admin)** — 기존 설계의 `users` 표를 이 표로 대체(로그인 계정과 1:1) |
| `m365_users` (완료) | account(UPN, 자연키), license(라이선스 1개, 자연키 — 라이선스 여러 개면 여러 행), name(이름 규칙 적용), display_name(원본), division/office/team(OO본부/OO실/OO팀), department_raw(원본 부서 전체, 분해 안 될 때의 대체값) — `scripts/sync-m365.ts`가 `export_m365/*.csv`를 파싱해 채움. `created_at`/`validated_at`/`expired_at`으로 SCD2 이력 관리(krs_*와 동일한 만료 규칙, RLS도 동일하게 잠금) |
| `audit_oa` (완료, 테이블만) | asset_no(자산번호, 자연키), asset_user_org/asset_user_name(자산사용자 조직·이름), inspector_org/inspector_name(실사한사람 조직·이름), inspector_user_id(제출한 로그인 계정, `profiles` 참조), is_edited(편집여부 — 미리 채워진 정보를 실사자가 고쳐서 제출했는지), photo_url(실사 사진 경로/URL), remark(비고). `created_at`(인풋데이트타임)/`expired_at`(만료데이트타임)으로 SCD2 이력 관리(재실사·재제출 시 이전 행 만료). RLS: 로그인 사용자는 본인이 제출한(`inspector_user_id`=본인) 행만 생성·조회 가능, 전사 모니터링은 관리자 서버 코드(service_role)로 |
| `equipment` | id, asset_no(자산번호), ip, service(장비별 서비스), assigned_user_id(배정된 실사용자, profiles 참조) |
| `inspections` | id, equipment_id(참조), asset_no, reported_user_id(실사 시 확인된 사용자), status(제출/변경제출), submitted_at |
| `license_requests` | id, user_id(참조), license_type, status(대기/승인/거절), requested_at, processed_at |
| `inspection_schedules` | id, title, start_at, end_at, status(오픈/마감/취소) |
| `assignees` | id, service_area(서비스 영역명), user_id(담당자, profiles 참조) |

`equipment.assigned_user_id`가 "장비-실사용자" 매핑의 기준이다. 렌탈사이트 API 응답에 담당(배정) 사용자 정보가 포함되어 있으면 그대로 채우고, 없으면 관리자가 `/admin/import` 화면에서 수동으로 배정·수정할 수 있게 만든다.

### 권한(Row Level Security) 원칙
- `profiles`: 본인 행만 조회/수정 가능(RLS). 전체 조회·역할 변경은 관리자 전용 서버 코드(`getSupabaseAdmin()`)로만 한다.
- `krs_*`(렌탈업체 원본 자산 데이터, 전사 인원의 이름·소속·배정 장비 포함): **RLS를 켜고 일반 로그인 사용자용 정책은 만들지 않는다.** service_role 키(서버 코드)로만 조회 가능 — 화면에는 관리자 role을 확인한 서버 코드가 요약만 골라서 보여준다(`src/app/page.tsx`의 관리자 전용 섹션 참고).
- 앞으로 만들 `equipment`/`inspections`/`license_requests`/`inspection_schedules`/`assignees`도 같은 원칙 적용: 본인 데이터는 본인만, 팀/전사 범위는 담당자·관리자만 보이게 RLS 정책을 설계한다.

## 3. 데이터 흐름 (입력 → 처리 → 출력)

**① 데이터 쌓기 (작업 2, 3, 4)**
- 입력: 담당자가 M365 PowerShell로 내보낸 사용자 목록 파일(CSV), 렌탈사이트(KRS) API 응답
- 처리:
  - M365: `/admin/import` 화면에서 CSV 업로드 → `/api/sync/m365`가 파싱해 `users`에 저장
  - 렌탈사이트: **웹앱이 아니라 `export_OA` 폴더의 Python 수집기가 단독으로 처리**한다. KRS 조회 API 5개(렌탈장비현황·고객운영자산관리정보·운영자산관리·자산이력조회·자산실사목록)를 호출해 `krs_*` 테이블 5개에 Supabase REST로 적재한다.
- 출력: `users` 표와 `krs_*` 표에 데이터가 쌓임

> 참고 1: Vercel에 배포하면 PowerShell을 직접 실행할 서버가 없으므로, "PowerShell을 그때그때 자동 실행"하는 대신 "담당자가 PowerShell로 뽑은 CSV 파일을 화면에서 업로드"하는 방식으로 설계했다.
>
> 참고 2: 렌탈사이트 수집은 웹앱 배포 주기와 무관하게 1시간 주기로 돌아야 해서 Next.js 밖으로 분리했다. 실행은 `export_OA/run.bat`(윈도우 작업 스케줄러 등록용)으로 한다. 토큰은 당일만 유효하므로 실패(코드 900/901/902) 시에만 재발급받아 1회 재시도하고, 새 토큰은 `export_OA/.env`에 자동 저장한다.
>
> 적재 규칙: 모든 `krs_*` 테이블은 `fetched_at`(가져온 시각), `valid_from`/`valid_to`(유효 기간), `raw_response`(원본 JSON)를 갖는다. 값이 바뀌면 기존 행의 `valid_to`를 지금 시각으로 만료시키고 새 행을 넣으며, 새 행의 `valid_to`는 만료 없음을 뜻하는 `9999-12-31 23:59:59`이다. 값이 그대로면 `fetched_at`만 갱신한다.

**② 실사 (작업 7, 8, 9)**
- 입력: 사용자가 카메라로 비추는 바코드
- 처리: 브라우저에서 바코드를 숫자(자산번호)로 바꾸고, `equipment`와 대조해 배정된 실사용자 정보를 화면에 보여줌 → 사용자가 확인/수정 → `/api/inspections`로 전송 → `inspections`에 기록(제출/변경 제출 구분)
- 출력: 실사 완료 여부, 최신 실사용자 정보가 반영됨
- 전제조건: 카메라 기능은 브라우저 보안 정책상 HTTPS(또는 localhost)에서만 동작하고, 카메라가 있는 기기(웹캠/스마트폰)가 필요하다.

**③ 화면 표시 (작업 5, 6, 10, 14)**
- 입력: `users`, `equipment`, `inspections`, `license_requests` 등에 쌓인 데이터
- 처리: 각 페이지의 서버 쪽 코드가 필요한 데이터만 조회
- 출력: 대시보드·조직 현황·모니터링·라이선스 현황 화면에 표시

**④ 라이선스 신청·승인 (작업 12, 13, 14)**
- 입력: 사용자가 누른 "신청" 버튼 → 관리자의 승인/거절
- 처리: `/api/license-requests`가 남은 수량을 확인하고 `license_requests`에 "대기"로 저장 → 관리자가 `/admin/license-requests`에서 승인/거절하면 상태 변경(실제 M365 라이선스 부여는 여전히 하지 않음 — PRD 비범위)
- 출력: 신청 상태(대기/승인/거절)가 화면에 반영, 관리자 화면의 수량 현황에도 반영

**⑤ AI 챗봇 (작업 17, 18)**
- 입력: 사용자의 채팅 메시지(예: "담당자 연락처 알려줘", HR의 신규 입사자 요청)
- 처리: `/api/chatbot`이 `assignees`·`license_requests` 등에서 답변에 꼭 필요한 최소 정보만 찾아 AI 모델(Anthropic Claude API)에 전달해 답변 생성. 라이선스 부족 등 후속 처리는 "자동 처리 제안" 또는 "수동 처리 선택"까지만 하고, 실제 확정은 담당자가 한다.
- 출력: 챗봇 답변, 후속 처리 상태 기록. 이번 사이클에서는 실제 이메일을 발송하지 않고 "HR에게 발송함" 기록만 화면에 남긴다(실제 메일 전송 연동은 이후 과제).

## 4. 기술 선택

기본은 Next.js(App Router, TypeScript)이고, 화면과 서버 API를 한 프로젝트 안에서 같이 만든다. Part 5에서 Vercel로 그대로 배포한다.

| 추가 기술 | 왜 필요한지 (쉬운 설명) |
|---|---|
| **Supabase** (Postgres 데이터베이스 + 인증) | 사용자·장비·실사·라이선스 정보를 저장할 곳과, 로그인/비밀번호 변경 기능을 한 번에 제공하는 서비스다. 엑셀 표처럼 데이터를 저장하는 인터넷 데이터베이스이고, 표는 대시보드 화면에서 클릭만으로 만들 수 있다. Vercel에 배포하면 내 컴퓨터의 파일에는 저장할 수 없어서 이런 인터넷 저장소를 쓴다. (CLAUDE.md에 이미 Supabase 사용을 대비한 규칙이 있어 그대로 이어간다.) |
| **@supabase/supabase-js** (연결 코드) | Next.js 코드에서 Supabase 표에 "데이터 가져와줘/저장해줘"라고 요청할 때 쓰는 공식 라이브러리다. |
| **@supabase/ssr** (로그인 연동) | 로그인한 사용자의 세션을 브라우저·서버 양쪽에서 안전하게 유지해주는 Supabase 공식 라이브러리다(Next.js 미들웨어와 함께 씀). |
| **Python + requests** (`export_OA` 수집기) | 렌탈사이트에서 자산 데이터를 주기적으로 긁어와 DB에 넣는 "수집 전용 프로그램"이다. 웹앱과 분리해 두면 화면을 고치지 않고도 수집만 따로 돌리거나 멈출 수 있다. |
| **@zxing/browser** (바코드 인식 라이브러리) | 카메라 화면에 보이는 바코드 무늬를 읽어서 숫자(자산번호)로 바꿔주는 라이브러리다. |
| **Anthropic Claude API** (AI 챗봇 두뇌) | 챗봇이 사람 질문을 이해하고 자연스럽게 답하게 해주는 AI 서비스다. |

> Prisma나 NextAuth.js 같은 별도 도구는 쓰지 않는다. Supabase 하나로 데이터베이스와 로그인/비밀번호 변경까지 해결되어, 배워야 할 개념 수를 줄일 수 있기 때문이다.

## 5. 개발 단위와의 연결
이 문서의 화면·데이터 모델·데이터 흐름·기술 선택은 PLAN.md의 작업 순서(1~19번)를 그대로 따라 구현한다. 작업별 세부 파일 구조는 각 작업을 실제로 만들 때(Do 단계) 정한다.
