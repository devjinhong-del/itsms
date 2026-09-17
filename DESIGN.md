# DESIGN

PLAN.md의 작업 순서를 어떤 화면·데이터 흐름·기술로 구현할지 정리한 문서입니다.

> 이 문서는 **실제 구현된 상태**를 반영합니다. 초기 설계에서 바뀐 부분은 각 절에 이유와 함께 적었습니다.
>
> 주요 변경: 데이터베이스·인증은 Supabase로 확정(NextAuth.js 대신 — 비밀번호 변경까지 한 번에 해결), 설계상의 `users` 표는 `profiles`로 대체, **AI 챗봇은 Anthropic Claude API 대신 OpenAI(gpt-4o-mini)로 구현**하고 단순 응답이 아니라 **RAG(사내 자료 근거 응답)** 방식으로 확장했습니다.

## 0. 데이터 보호 원칙

로그인·권한 제어가 붙기 전까지는 더미 데이터만 쓰기로 했고, **로그인을 앞당겨 구현한 뒤 실데이터로 전환**했다. 현재 적용 중인 원칙은 다음과 같다.

- 이름·소속·장비·라이선스는 **사내 전용(대외비)** 으로 취급하고, 로그인한 사내 계정에게 역할에 맞는 범위까지만 보여준다.
- 모든 표에 RLS를 켜고 일반 사용자용 정책은 만들지 않는다. 조회는 권한을 확인한 **서버 코드(service_role)** 만 수행한다.
- API 키와 담당자 연락처 같은 개인정보는 코드에 넣지 않고 환경변수로만 다룬다(`.env.example` 참고). 공개 저장소에는 값이 올라가지 않는다.
- AI 챗봇에는 표 전체가 아니라 **질문과 가장 가까운 자료 조각 몇 개만** 전달한다(8~11개, 아래 5번 참고).
- 실사 사진은 비공개 버킷에 저장하고, 화면에는 만료되는 서명 URL로만 보여준다.

## 1. 화면 구성 (무엇이 어디에 보이는지)

메뉴는 화면 왼쪽 사이드바에 있고, 로그인한 사람의 역할에 따라 보이는 항목이 달라진다.

| 경로 | 화면 | 보이는 것 | 접근 |
|---|---|---|---|
| `/login` | 로그인 | ID(사내 계정 앞부분)와 비밀번호. 서버에서 `@jeisys.com`을 붙여 인증한다 | 누구나 |
| `/` | 개인 자산 현황 | 내 이름·소속·사용 장비·실사 상태·보유 라이선스 | 로그인한 전원 |
| `/org-assets` | 조직 자산 현황 | 우리 조직 구성원별 장비 보유 현황, 종류·브랜드 분포 | 담당자(manager) 이상 |
| `/audit_oa` | 모바일 자산 실사 | 카메라 미리보기, 인식된 자산번호·모델코드, 사용자 확인·수정, 사진 촬영 후 제출 | 로그인한 전원 |
| `/admin/oa-overview` | 모든 OA 현황 | 전사 장비의 종류·부서·브랜드 분포와 자산 목록 검색 | 관리자 |
| `/admin/oa-status` | OA Report & Insight | 퇴사자 명의·계약종료 잔존·중복 보유·만료 임박 자산과 절감 가능액 | 관리자 |
| `/admin/license` | License 관리 | 구독 수량 대비 사용률, License × 조직 사용 현황 | 관리자 |
| `/admin/audit-monitoring` | 실사 모니터링 | 진행률, 부서별 순위, 최근 실사 내역과 실사 사진 | 관리자 |
| `/admin/audit-qr` | 실사 QR 안내 | 현장에서 휴대폰으로 접속할 QR | 관리자 |
| `/admin/access-log` | 사용자 접속 로그 | 로그인·화면 이동 기록 | 관리자 |
| `/admin/rag` | AI 도우미 학습 | 문서 업로드, 사내 DB 재학습, 학습 자료 목록 | 챗봇 담당자 1명 |
| `/admin/audit-open-close` | OA 자산 실사 Open/Close | (준비중) 실사 일정 생성·마감 | 관리자 |
| `/admin/assignee` | 담당자 선임 | (준비중) 서비스 영역별 담당자 지정 | 관리자 |

AI 챗봇은 별도 페이지가 아니라 **모든 화면 오른쪽 아래에 뜨는 위젯**이다(`src/components/ChatWidget.tsx`). 페이지 이동 없이 그 자리에서 열리고, HR팀과 지정 계정에게만 보인다.

### 접근 제어 방식
- `middleware.ts`가 모든 경로에서 세션을 확인하고, 로그인하지 않았으면 `/login`으로 보낸다.
- 역할은 `general` ⊂ `manager` ⊂ `admin` 3단계이며 판단 기준은 `src/lib/auth/role.ts` 한 곳에 모아 두었다.
- 메뉴를 숨기는 것만으로는 주소를 직접 입력해 들어올 수 있으므로, **페이지에서도 다시 검사**한다(`requireAdmin()`, `canSeeOrgAssets()`).
- 휴대폰으로 접속하면 어떤 주소로 들어와도 실사 화면(`/audit_oa`)으로 보낸다. 화면 이동(GET)만 대상으로 해서 제출(POST)은 그대로 동작한다.

## 2. 데이터 모델 (표 구조)

마이그레이션 SQL은 `db/migrations/`에 번호 순서대로 있고 `npm run db:migrate`로 적용한다.

### 실제로 만든 표

| 표(테이블) | 마이그레이션 | 주요 칼럼 |
|---|---|---|
| `krs_*` (5개) | `001` | 렌탈사이트에서 받은 자산 원본. `krs_rental_equipment`가 중심(asset_no, prdct_name, model_name, manuf_name, dept_name, user_name, rental_fee, dlivy_date, return_prnmnt_date, cntrct_status). `fetched_at`/`valid_from`/`valid_to`로 이력 관리 |
| `profiles` | `002` | id(uuid, `auth.users` 참조), email, name, department, photo_url, **role(general/manager/admin)** — 설계상의 `users` 표를 이 표로 대체(로그인 계정과 1:1) |
| `m365_users` | `004` | account(UPN), license(라이선스 1개 — 여러 개면 여러 행), name, display_name, division/office/team, department_raw. `created_at`/`validated_at`/`expired_at`으로 SCD2 |
| `audit_oa` | `006` | asset_no, asset_user_org/asset_user_name(자산 사용자), inspector_org/inspector_name/inspector_user_id(실사자), is_edited(수정 제출 여부), photo_url(비공개 버킷 경로), remark. `created_at`/`expired_at`으로 SCD2 — 재실사 시 이전 행 만료 |
| `access_logs` | `007` | user_id, user_email, user_name, event_type(login/page_view), path, created_at — 누가 언제 어떤 화면을 열었는지 |
| `m365_license_total` | `008` | sku_id(자연키), sku_part_number, total_units(구매 수량), assigned_units(할당), remaining_units(잔여). SCD2로 수량 변화 이력이 남는다 |
| `rag_documents` | `009` | title, source_type(file/database), source_key, file_size, chunk_count, uploaded_by — 챗봇이 학습한 자료 한 건 |
| `rag_chunks` | `009` | document_id, chunk_index, content, **embedding vector(1536)** — 조각 + 임베딩. HNSW 인덱스(코사인) |

### 설계했지만 아직 만들지 않은 표

`equipment` / `inspections` / `license_requests` / `inspection_schedules` / `assignees`.

- `equipment`·`inspections`는 렌탈사이트 원본(`krs_rental_equipment`)과 실사 기록(`audit_oa`)으로 같은 역할을 하고 있어서, 중간 표를 따로 두지 않았다. 장비-사용자 매핑은 `krs_rental_equipment.user_name`이 기준이다.
- `license_requests` / `inspection_schedules` / `assignees`는 해당 화면(PLAN 11~13, 16)을 다음 사이클로 미루면서 함께 보류했다.

### 권한(Row Level Security) 원칙

- **모든 표에 RLS를 켜고, 일반 로그인 사용자용 정책은 만들지 않는다.** 조회는 권한을 확인한 서버 코드(`getSupabaseAdmin()`, service_role)만 수행한다.
- `profiles`는 본인 행만 조회/수정 가능. 역할 변경 같은 관리 작업은 서버 스크립트(`scripts/sync-roles.ts`)로만 한다.
- `audit_oa`는 실사자 본인이 제출한 행만 보이고, 전사 모니터링은 관리자 화면의 서버 코드가 처리한다.
- 실사 사진은 비공개 Storage 버킷에 두고, 화면에 보여줄 때만 1시간짜리 서명 URL을 만든다.

## 3. 데이터 흐름 (입력 → 처리 → 출력)

### ① 데이터 쌓기

| | 내용 |
|---|---|
| 입력 | 렌탈사이트(KRS) 조회 API 5종, M365 PowerShell로 내보낸 CSV 2종 |
| 처리 | **웹앱이 아니라 별도 Python 배치**가 처리한다. `export_OA/sync.py` → `krs_*` 5개 표, `export_m365/sync_m365.py` → `m365_users`, `export_m365/sync_m365_license.py` → `m365_license_total` |
| 출력 | 값이 바뀐 행만 이력으로 쌓인다(SCD2) |

- Vercel에는 PowerShell을 돌릴 서버가 없어서, "자동 실행" 대신 **담당자가 내보낸 CSV를 배치가 읽는** 방식으로 정했다.
- 수집 주기(1시간)와 웹앱 배포 주기가 달라 Next.js 밖으로 분리했다. 실행은 `export_OA/run.bat`(작업 스케줄러 등록용).
- 적재 규칙: 값이 바뀌면 기존 행을 만료(`valid_to`/`expired_at` = 현재시각)시키고 새 행을 넣는다. 유효한 행은 `9999-12-31 23:59:59`. 값이 그대로면 확인 시각만 갱신한다.
- PostgREST는 한 번에 1,000행만 돌려주므로 **모든 조회는 페이징**한다(`src/lib/db/fetchAll.ts`). 이걸 빠뜨려 계정 579개가 조용히 누락된 적이 있다.

### ② 실사

| | 내용 |
|---|---|
| 입력 | 휴대폰 카메라로 비추는 자산 바코드 |
| 처리 | 브라우저에서 `@zxing/browser`가 인식 → `parseBarcodeText()`로 모델코드·자산번호 분리 → `lookupAsset()`이 `krs_rental_equipment` 조회 → 사용자 이름을 고치면 `lookupUserOrgByName()`이 `m365_users`에서 조직을 다시 찾아 채움 → `submitAudit()`이 사진을 비공개 버킷에 올리고 `audit_oa`에 기록 |
| 출력 | 실사 완료 기록, 수정 여부(`is_edited`), 실사 사진 경로 |

- 미리 채워진 사용자 정보를 시스템이 임의로 고치지 않는다. **사람이 확인·수정한 뒤 제출**한다(PRD Must 2번 규칙).
- 카메라는 보안 컨텍스트(HTTPS/localhost)에서만 열린다. 또 모바일 브라우저는 사용자 제스처 없이 호출한 `getUserMedia`를 조용히 막기 때문에, **버튼 클릭 흐름 안에서 직접** 카메라를 요청한다.

### ③ 화면 표시

| | 내용 |
|---|---|
| 입력 | `krs_*`, `m365_users`, `m365_license_total`, `audit_oa`, `access_logs` |
| 처리 | 각 페이지의 **서버 컴포넌트**가 역할을 확인한 뒤 필요한 만큼만 조회해 집계한다. 대외비 원본이 브라우저로 내려가지 않는다 |
| 출력 | 개인/조직/전사 현황, 비용 인사이트, 실사 진행률, 접속 로그 |

- 표 검색·정렬·팝업 같은 상호작용만 클라이언트 컴포넌트가 맡는다.
- 날짜는 저장은 UTC, 표시는 한국 시간으로 고정한다(`src/lib/date.ts`). 서버가 UTC라 지정하지 않으면 9시간 어긋난다.

### ④ AI 도우미 (RAG)

| | 내용 |
|---|---|
| 입력 | 담당자가 올린 문서(PDF·TXT·MD·CSV)와 사내 DB 4종, 그리고 사용자의 질문 |
| 처리 | 5장 참고 |
| 출력 | 사내 자료를 근거로 한 답변 + 근거 문서 제목. 자료에 없으면 "문서에 없습니다" |

### ⑤ 아직 만들지 않은 흐름

라이선스 신청·승인(PLAN 12·13)과 챗봇 HR 요청 자동화(PLAN 18)는 다음 사이클로 미뤘다. 현재는 **현황 조회까지만** 제공하며, PRD 비범위대로 실제 라이선스 할당/해지는 하지 않는다.

## 4. 기술 선택

기본은 Next.js(App Router, TypeScript)이고, 화면과 서버 로직을 한 프로젝트 안에서 같이 만들어 Vercel로 배포한다.

| 기술 | 왜 이걸 골랐나 |
|---|---|
| **Supabase** (Postgres + Auth + Storage + pgvector) | 데이터 저장·로그인·파일 보관·벡터 검색을 한 서비스로 해결한다. 별도 ORM이나 인증 라이브러리를 배우지 않아도 된다. Vercel에는 파일을 둘 수 없어 외부 저장소가 어차피 필요했다 |
| **@supabase/supabase-js** | 서버 코드에서 표를 읽고 쓰는 공식 라이브러리 |
| **@supabase/ssr** | 로그인 세션을 브라우저·서버 양쪽에서 안전하게 유지한다(미들웨어와 함께 사용) |
| **@zxing/browser** | 앱 설치 없이 브라우저 카메라만으로 바코드를 읽는다 |
| **Python + requests** (`export_OA`, `export_m365`) | 수집 배치를 웹앱과 분리해, 화면을 고치지 않고도 수집만 따로 돌리거나 멈출 수 있다 |
| **OpenAI gpt-4o-mini + text-embedding-3-small** | 챗봇 답변과 임베딩. 사내 문서 응답에 충분하면서 비용이 가장 낮은 조합이다 |
| **unpdf** | 업로드한 PDF에서 글자만 뽑아낸다(서버리스 환경에서 동작하는 구현) |

> **설계 변경**: 처음에는 챗봇 두뇌로 **Anthropic Claude API**를 적었지만, 실제로는 **OpenAI**로 구현했다. 임베딩(text-embedding-3-small)과 답변(gpt-4o-mini)을 한 곳에서 가장 낮은 비용으로 쓸 수 있고, pgvector에 넣을 1536차원 벡터를 바로 얻을 수 있어서다. 또 단순 응답이 아니라 **사내 자료를 근거로 답하는 RAG** 방식으로 확장했다(아래 5장).

> Prisma·NextAuth.js 같은 도구는 쓰지 않는다. Supabase 하나로 해결되어 배워야 할 개념 수를 줄일 수 있기 때문이다.

## 5. AI 도우미(RAG) 설계

"사내 자료에 있는 것만 답하고, 없으면 지어내지 않는다"가 이 기능의 전부다. 그러려면 답변 생성 전에 **근거를 찾아 붙이는 단계**가 필요하다.

### 학습(적재) — `src/lib/rag/ingest.ts`

1. **원본 확보**: 업로드 파일(PDF는 `unpdf`로 글자 추출)과 사내 DB 4종(자산 목록·M365 사용자·라이선스 수량·실사 내역).
2. **글로 바꾸기**: 표를 그대로 넣으면 검색이 잘 안 되므로 `자산번호 A · 종류 노트북 · 사용자 B · 월 렌탈료 C원`처럼 **사람이 읽는 문장**으로 만든다. 맨 앞에는 합계·상위 목록 같은 요약 문단을 둬서 "전체 몇 대냐" 같은 질문도 답할 수 있게 한다.
3. **조각내기**(`chunk.ts`): 줄·문장 경계를 지키되 **어떤 조각도 1,200자를 넘지 않게** 자르고, 앞 조각의 끝 150자를 물고 시작해 문맥이 끊기지 않게 한다. 임베딩 API에는 길이 상한이 있어 이 보장이 필요하다.
4. **임베딩**: 64개씩 묶어 `text-embedding-3-small`로 벡터(1536차원)를 만들어 `rag_chunks`에 저장한다.
5. **재학습**: 같은 출처(`source_key`)를 다시 학습시키면 이전 조각을 지우고 새로 넣는다. 중복 답변을 막기 위해서다.

### 답변 — `src/lib/rag/answer.ts`

1. 질문을 같은 모델로 임베딩한다.
2. **의미 검색**: `match_rag_chunks()` 함수가 코사인 거리로 가까운 조각 8개를 찾는다(유사도 0.2 미만은 버림).
3. **글자 검색 보강**: 질문에 `IFH01990` 같은 영문+숫자 식별자가 있으면 본문에 그 글자가 그대로 들어간 조각도 최대 3개 더 찾는다. 의미 검색만으로는 자산번호를 놓치기 때문이다.
4. 두 결과를 합쳐 중복을 제거하고 **최대 11개 조각만** 프롬프트에 넣는다. 표 전체를 넘기지 않는다는 원칙(0장)을 여기서 지킨다.
5. 시스템 프롬프트로 규칙을 고정한다 — 참고 자료에 있는 내용만, 없으면 `문서에 없습니다`만, 한국어 존댓말로, 숫자·이름·날짜는 그대로.
6. 답변과 함께 **근거가 된 문서 제목**을 출처로 돌려준다.

### 접근 제어 — `src/lib/rag/access.ts`

- 사용할 수 있는 사람: 지정 팀(HR팀) 소속 + 환경변수에 적은 계정. 그 외에는 **아이콘 자체가 렌더링되지 않는다.**
- 문서를 올려 학습시킬 수 있는 사람: 담당자 1명.
- 화면에서 숨기는 것과 별개로, 질문을 받는 서버 액션이 **매번 권한을 다시 확인**한다.
- 모바일에서는 챗봇을 띄우지 않는다(현장 실사 화면에 집중).

### 앞으로의 데이터 구조

시스템·서버·네트워크·계정·결재까지 넓힌 확장 설계는 [docs/data-model.md](docs/data-model.md)에 관계도(ERD)로 정리했다.

## 6. 문서와 구현의 관계

이 문서는 구현이 끝난 뒤 실제 상태에 맞춰 갱신했다. 작업 단위와 완료 여부는 PLAN.md, 요구사항과 범위는 PRD.md를 본다.
