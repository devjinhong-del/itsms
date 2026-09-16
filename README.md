# ITSMS — 제이시스메디칼 사내 IT 서비스 관리 시스템

사내 IT 자산(OA 장비)과 Microsoft 365 라이선스를 한곳에서 관리하고, 모바일 바코드 스캔으로 자산 실사를 진행하는 사내 전용 웹 애플리케이션입니다.

> 사내 인원·자산 정보를 다루는 **비공개 프로젝트**입니다. 로그인한 사내 계정만 접근할 수 있습니다.

## 주요 기능

### 자산 실사 (모바일)
- `/audit_oa` — 휴대폰 카메라로 장비 바코드를 스캔해 자산번호·모델코드를 인식
- 스캔과 동시에 KRS 자산 정보와 Microsoft 365 조직 정보를 자동으로 불러와 채움
- 실사 사진을 촬영해 Supabase Storage(비공개 버킷)에 저장
- 사용자명이 실제와 다르면 현장에서 수정 → 수정 여부가 기록됨

### 관리자 대시보드
| 화면 | 내용 |
|---|---|
| 개인 자산 현황 | 내가 쓰는 장비·라이선스·실사 상태 |
| 조직 자산 현황 | 우리 조직의 장비 구성과 구성원별 보유 현황 |
| 모든 OA 현황 | 전사 장비 분포(종류·브랜드·조직)와 전사 자산 목록 검색 |
| OA Report & Insight | 퇴사자 명의 장비, 계약종료 잔존, 중복 보유, 만료 임박 등 **비용 절감 기회** 분석 |
| License 관리 | M365 라이선스 구독 수량 대비 사용률, 조직별·사용자별 할당 현황 |
| OA 자산 현황 실사 모니터링 | 실사 진행률, 부서별 순위, 최근 실사 내역과 실사 사진 |
| 사용자 접속 로그 | 로그인·페이지 이동 기록 |

## 기술 스택

- **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4**
- **Supabase** — Postgres(REST/PostgREST), Auth(이메일·비밀번호), Storage
- **@zxing/browser** — 모바일 바코드 스캔
- **Vercel** — 배포
- **Python** — 외부 API/CSV 데이터 수집 배치 (`export_OA`, `export_m365`)

## 폴더 구조

```
src/
  app/
    (main)/          로그인 후 대시보드 화면 (사이드바 레이아웃 공유)
      admin/         관리자 전용 화면
    audit_oa/        모바일 자산 실사 화면
    login/           로그인
  components/        대시보드 공통 UI, 사이드바, 각 화면 전용 클라이언트 컴포넌트
  lib/               Supabase 클라이언트, 인증 가드, DB 헬퍼, 메뉴 정의
db/migrations/       SQL 마이그레이션 (번호 순서대로 실행)
export_OA/           KRS 렌탈 자산 수집 배치 (Python)
export_m365/         Microsoft 365 사용자·라이선스 수집 배치 (Python)
scripts/             마이그레이션·계정 생성 등 운영 스크립트 (TypeScript)
```

## 데이터 관리 원칙

모든 원천 데이터 표(`krs_*`, `m365_*`, `audit_oa`)는 **이력을 지우지 않는 SCD2 방식**입니다.

- 값이 바뀌면 기존 행을 만료 처리(`expired_at`/`valid_to` = 현재시각)하고 새 행을 추가합니다.
- 아직 유효한 행은 `9999-12-31 23:59:59`로 표시합니다.
- 따라서 "언제 무엇이 어떻게 바뀌었는지"가 항상 남습니다.

모든 테이블은 RLS가 켜져 있고, 조회는 서버 코드(service_role)에서만 이뤄집니다.

## 로컬 실행

```bash
npm install
npm run dev              # http://localhost:3000
npm run dev:https        # 휴대폰에서 카메라 테스트용(HTTPS 필요)
```

### 환경 변수 (`.env` — 저장소에 올리지 않음)

| 이름 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저용 Supabase URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저용 공개 키 |
| `SUPABASE_URL` | 서버용 Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 키(RLS 우회) |
| `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` | 마이그레이션 스크립트 전용(배포 환경에는 등록하지 않음) |

### 자주 쓰는 명령

```bash
npm run lint             # ESLint
npm run build            # 프로덕션 빌드
npm run db:migrate       # db/migrations/*.sql 순서대로 적용
npm run storage:setup    # 실사 사진 버킷 생성
```

데이터 수집 배치(별도 실행):

```bash
cd export_m365 && .venv\Scripts\python.exe sync_m365.py            # M365 사용자·라이선스
cd export_m365 && .venv\Scripts\python.exe sync_m365_license.py    # M365 라이선스 구독 수량
cd export_OA   && .venv\Scripts\python.exe sync.py                 # KRS 렌탈 자산
```

## 배포

Vercel에 배포합니다. 배포 환경에는 앱이 실행에 쓰는 Supabase 변수 4개만 등록하고, 관리용 토큰(GitHub·Vercel·Supabase Access Token)은 등록하지 않습니다.

---

문의: IT팀 김진홍 차장 (jinhong@jeisys.com)
