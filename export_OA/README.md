# export_OA — OA 렌탈 데이터 수집기

KRS(한국렌탈) API에서 OA 자산 데이터를 가져와 Supabase에 쌓는 Python 프로그램입니다.
웹앱(Next.js)과 별개로 혼자 돌아가며, 나중에 윈도우 작업 스케줄러에 등록해 1시간마다 실행할 수 있습니다.

## 1. 준비 (처음 한 번만)

`.env` 파일을 열어 아래 3개 값을 넣어주세요.

| 키 | 넣을 값 |
|---|---|
| `KRS_AUTH_KEY` | 한국렌탈에서 발급받은 인증키 |
| `SUPABASE_URL` | `https://xxxx.supabase.co` 형태의 주소 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role 키 |

- `KRS_TOKEN`은 프로그램이 발급받아 자동으로 채우므로 비워두시면 됩니다.
- 날짜 3개도 비워두면 기본값(2015-01-01 ~ 오늘 / 실사는 오늘)으로 동작합니다.

## 2. 실행

```
run.bat
```

처음 실행하면 가상환경(`.venv`)을 만들고 필요한 패키지를 알아서 설치합니다.
수동으로 돌리려면:

```
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python sync.py
```

## 3. 결과 보기

실행이 끝나면 테이블별로 몇 건이 들어갔는지 표로 보여줍니다.

```
테이블                       API건수    신규    변경    동일  건너뜀   DB유효행
krs_rental_equipment           5041    5041       0       0       0       5041
```

- **신규**: 처음 들어온 자산
- **변경**: 값이 바뀌어 예전 행을 만료시키고 새로 넣은 자산
- **동일**: 값이 그대로라 `fetched_at`(가져온 시각)만 갱신한 자산
- **DB유효행**: 지금 DB에 살아있는(만료되지 않은) 행 수

## 4. 데이터가 쌓이는 방식

모든 테이블에는 공통으로 아래 컬럼이 있습니다.

- `fetched_at` — 데이터를 가져온 날짜시간
- `valid_from` / `valid_to` — 이 값이 유효한 기간. 아직 유효하면 `valid_to`가 **9999-12-31 23:59:59**
- `raw_response` — API가 준 원본 JSON 전체

값이 바뀌면 예전 행을 지우지 않고 `valid_to`에 만료 시각을 적은 뒤, 새 값을 새 행으로 넣습니다.
그래서 "언제 무엇이 바뀌었는지" 이력이 그대로 남습니다.

## 5. 수집 대상

| 테이블 | KRS API |
|---|---|
| `krs_rental_equipment` | 렌탈장비현황 |
| `krs_customer_oper_asset` | 고객운영자산관리정보 |
| `krs_oper_asset_record` | 운영자산관리 |
| `krs_asset_record_history` | 자산이력조회 (이력이라 만료 없이 새 건만 추가) |
| `krs_asset_acins` | 자산실사목록 |

## 6. 파일 설명

| 파일 | 하는 일 |
|---|---|
| `sync.py` | 실행 진입점. 5개 테이블을 순서대로 수집하고 결과표를 출력 |
| `krs_api.py` | KRS API 호출. 토큰이 만료(900/901/902)면 새로 발급받아 한 번 재시도 |
| `supabase_db.py` | Supabase REST 호출 (조회/추가/수정, 여러 건을 묶어서 처리) |
| `tables.py` | 테이블 5개의 컬럼·자연키 정의 |
| `config.py` | `.env` 읽기, 토큰 저장 |
