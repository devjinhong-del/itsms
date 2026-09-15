-- KRS Smart(렌탈업체) OA API 연동을 위한 테이블 정의
-- 문서: https://www.krsmart.com/api/help
--
-- 공통 규칙 (모든 krs_* 테이블에 동일하게 적용)
--   fetched_at : 이 행을 API로 가져온 날짜시간
--   valid_from : 이 값이 유효해지기 시작한 날짜시간
--   valid_to   : 이 값이 만료된 날짜시간. 아직 유효하면 9999-12-31 23:59:59(=만료 없음, "무한대" 대신 사람이 읽을 수 있는 고정 값 사용)
--   raw_response : API가 내려준 해당 행의 원본 JSON 전체(문서에 없는 필드가 나중에 추가되어도 데이터가 유실되지 않도록 보관)
--
-- 변경 이력을 남기는 방식(SCD2): 같은 자산(assetNo 등 자연키)에 대해 값이 바뀌면
--   1) 기존 "현재 유효한" 행의 valid_to를 지금 시각으로 바꾸고(만료 처리)
--   2) 새 값을 valid_from=지금 시각, valid_to=9999-12-31 23:59:59 로 새로 insert 한다.
-- 값이 안 바뀌었으면 새 행을 만들지 않고 fetched_at만 갱신한다.

-- 만료 없음을 뜻하는 값(문서에 적으신 "9999...12/31 23:59:59"를 타임스탬프로 표현한 것)
-- 앞으로 SQL에서 반복해서 쓰기 편하도록 그대로 리터럴로 사용한다: TIMESTAMPTZ '9999-12-31 23:59:59+00'
-- (인덱스 조건에 쓰려면 세션 시간대에 따라 달라지지 않는 IMMUTABLE 값이어야 해서, 시간대를 +00으로 고정해서 적었다)

-- ============================================================
-- 1) 렌탈장비현황 (getRentalEqpmntList) — 지금 바로 연동해서 쓰는 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS krs_rental_equipment (
    id                  BIGSERIAL PRIMARY KEY,
    asset_no            TEXT NOT NULL,              -- assetNo, 자산번호 (자연키)

    dlivy_slip_no       TEXT,                        -- dlivySlipNo 출고전표번호
    asset_div           TEXT,                        -- assetDiv 자산구분
    recpt_user          TEXT,                        -- recptUser 수령자
    prdct_name          TEXT,                        -- prdctName 제품명
    model_name          TEXT,                        -- modelName 모델명
    item_name           TEXT,                        -- itemName 품명
    serial_no           TEXT,                        -- serialNo 시리얼번호
    cntrct_status       TEXT,                        -- cntrctStatus 계약상태
    dlivy_date          TEXT,                        -- dlivyDate 출고일자
    dlivy_class         TEXT,                        -- dlivyClass 출고유형
    exchng_asset_no     TEXT,                        -- exchngAssetNo 교체자산번호
    return_prnmnt_date  TEXT,                        -- returnPrnmntDate 반납예정일
    rental_fee          TEXT,                        -- rentalFee 렌탈료
    recpt_date          TEXT,                        -- recptDate 수령일자
    dept_code           TEXT,                        -- deptCode 소속부서코드
    dept_name           TEXT,                        -- deptName 소속부서
    user_id             TEXT,                        -- userId 사용자ID
    user_name           TEXT,                        -- userName 사용자
    cntrct_no           TEXT,                        -- cntrctNo 계약번호
    manuf_code          TEXT,                        -- manufCode 제조사코드
    manuf_name          TEXT,                        -- manufName 제조사명
    model_code          TEXT,                        -- modelCode 모델코드
    obj_div             TEXT,                        -- objDiv 물건구분
    obj_sn              TEXT,                        -- objSn 물건순번
    dlivy_qty           TEXT,                        -- dlivyQty 출고수량
    bsn_man             TEXT,                        -- bsnMan 영업담당자
    bsn_man_name        TEXT,                        -- bsnManName 영업담당자명
    user_spec           TEXT,                        -- userSpec 사용자스팩
    remark              TEXT,                        -- remark 비고
    bcnc_code           TEXT,                        -- bcncCode 거래처코드
    bcnc_name           TEXT,                        -- bcncName 거래처명
    oper_div            TEXT,                        -- operDiv 운영구분
    oper_status         TEXT,                        -- operStatus 운영상태
    oper_status_div     TEXT,                        -- operStatusDiv 운영상태
    asset_info_div      TEXT,                        -- assetInfoDiv 자산정보구분
    asset_info_str      TEXT,                        -- assetInfoStr 자산정보구분
    wrhs_date           TEXT,                        -- wrhsDate 사용자정의.입고일
    remark1             TEXT,                        -- remark1 사용자정의.비고
    remark2             TEXT,                        -- remark2 사용자정의.비고
    acins_start_date    TEXT,                        -- acinsStartDate 실사시작일자
    oper_date           TEXT,                        -- operDate 운영일자
    cnsul_no            TEXT,                        -- cnsulNo 품의번호
    applcnt             TEXT,                        -- applcnt 신청자
    hdqrtrs             TEXT,                        -- hdqrtrs 본부
    team                TEXT,                        -- team 팀
    memo                TEXT,                        -- memo 메모
    memo2               TEXT,                        -- memo2 메모2
    memo3               TEXT,                        -- memo3 메모3
    reg_user            TEXT,                        -- regUser 등록자
    asset_div_change_date TEXT,                       -- assetDivChangeDate 자산사용부서변경일
    wrhs_date_start     TEXT,                        -- wrhsDateStart
    wrhs_date_end       TEXT,                        -- wrhsDateEnd
    oper_date_start     TEXT,                        -- operDateStart
    oper_date_end       TEXT,                        -- operDateEnd
    dlivy_date_start    TEXT,                        -- dlivyDateStart
    dlivy_date_end      TEXT,                        -- dlivyDateEnd
    return_date_start   TEXT,                        -- returnDateStart
    return_date_end     TEXT,                        -- returnDateEnd
    oper_asset_cnt      TEXT,                        -- operAssetCnt 이후운영자산
    asset_list_str      TEXT,                        -- assetListStr 일괄처리용

    raw_response        JSONB,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_from          TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to            TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMPTZ '9999-12-31 23:59:59+00'
);

-- 자산번호(asset_no)당 "현재 유효한(valid_to가 만료 안 된)" 행은 딱 1개만 존재해야 한다
CREATE UNIQUE INDEX IF NOT EXISTS ux_krs_rental_equipment_current
    ON krs_rental_equipment (asset_no)
    WHERE valid_to = TIMESTAMPTZ '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS ix_krs_rental_equipment_asset_no ON krs_rental_equipment (asset_no);

-- ============================================================
-- 2) 고객운영자산관리정보 (CustomerOperAssetInfo) — 테이블 정의만 우선 준비 (연동은 다음 단계)
-- ============================================================
CREATE TABLE IF NOT EXISTS krs_customer_oper_asset (
    id                          BIGSERIAL PRIMARY KEY,
    asset_number                TEXT NOT NULL,       -- assetNumber 자산번호 (자연키)

    row_num                     INTEGER,             -- rowNum 행번호
    customer_code                TEXT,                -- customerCode 거래처코드
    release_statement_number     TEXT,                -- releaseStatementNumber 출고전표번호
    object_type                  TEXT,                -- objectType 물건구분
    object_sequence               INTEGER,             -- objectSequence 물건순번
    asset_type                   TEXT,                -- assetType 자산구분
    asset_type_change_date        TEXT,                -- assetTypeChangeDate 자산구분변동일자
    receive_date                 TEXT,                -- receiveDate 입고일자
    out_date                     TEXT,                -- Outdate 입고일자(문서 원문 그대로)
    asset_comment1                TEXT,                -- assetComment1 자산비고1
    asset_comment2                TEXT,                -- assetComment2 자산비고2
    product                      TEXT,                -- product 제품명
    model_code                   TEXT,                -- modelCode 모델코드
    model_name                   TEXT,                -- modelName 모델명
    product_name                  TEXT,                -- productName 품명
    serial_number                 TEXT,                -- serialNumber 시리얼번호
    state                        TEXT,                -- state 운영상태
    operation_type                TEXT,                -- operationType 운영구분
    operation_date                 TEXT,                -- operationDate 운영일자
    consult_number                TEXT,                -- consultNumber 품의번호
    request_user                  TEXT,                -- requestUser 신청자
    company                      TEXT,                -- Company 본부
    department                   TEXT,                -- Department 소속부서
    team                        TEXT,                -- Team 팀
    consumer                     TEXT,                -- Consumer 사용자
    memo1                       TEXT,                -- memo1
    memo2                       TEXT,                -- memo2
    memo3                       TEXT,                -- memo3
    rental_amount                 INTEGER,             -- rentalAmount 렌탈료

    raw_response                 JSONB,
    fetched_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_from                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to                     TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMPTZ '9999-12-31 23:59:59+00'
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_krs_customer_oper_asset_current
    ON krs_customer_oper_asset (asset_number)
    WHERE valid_to = TIMESTAMPTZ '9999-12-31 23:59:59+00';

-- ============================================================
-- 3) 운영자산관리 (operAssetRecordList) — 테이블 정의만 우선 준비
-- ============================================================
CREATE TABLE IF NOT EXISTS krs_oper_asset_record (
    id                  BIGSERIAL PRIMARY KEY,
    asset_no            TEXT NOT NULL,               -- assetNo 자산번호 (자연키)

    dlivy_slip_no       TEXT,
    asset_div           TEXT,
    recpt_user          TEXT,
    prdct_name          TEXT,
    model_name          TEXT,
    item_name           TEXT,
    serial_no           TEXT,
    cntrct_status       TEXT,
    dlivy_date          TEXT,
    return_prnmnt_date  TEXT,
    rental_fee          TEXT,
    recpt_date          TEXT,
    dept_code           TEXT,
    dept_name           TEXT,
    user_id             TEXT,
    user_name           TEXT,
    cntrct_no           TEXT,
    manuf_code          TEXT,
    manuf_name          TEXT,
    model_code          TEXT,
    obj_div             TEXT,
    obj_sn              TEXT,
    spot_code           TEXT,                        -- spotCode 현장코드
    release_qty         TEXT,                        -- releaseQty 출고수량
    bsn_man             TEXT,
    bsn_man_name        TEXT,
    user_spec           TEXT,
    remark              TEXT,
    bcnc_code           TEXT,
    bcnc_name           TEXT,
    oper_div            TEXT,
    oper_status         TEXT,
    oper_status_div     TEXT,
    asset_info_div      TEXT,
    asset_info_str      TEXT,
    wrhs_date           TEXT,
    remark1             TEXT,
    remark2             TEXT,
    acins_start_date    TEXT,
    oper_date           TEXT,
    cnsul_no            TEXT,
    applcnt             TEXT,
    hdqrtrs             TEXT,
    team                TEXT,
    memo                TEXT,
    memo2               TEXT,
    memo3               TEXT,
    reg_user            TEXT,
    wrhs_date_start     TEXT,
    wrhs_date_end       TEXT,
    oper_date_start     TEXT,
    oper_date_end       TEXT,
    dlivy_date_start    TEXT,
    dlivy_date_end      TEXT,
    return_date_start   TEXT,
    return_date_end     TEXT,
    oper_asset_cnt      TEXT,
    asset_list_str      TEXT,

    raw_response        JSONB,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_from          TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to            TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMPTZ '9999-12-31 23:59:59+00'
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_krs_oper_asset_record_current
    ON krs_oper_asset_record (asset_no)
    WHERE valid_to = TIMESTAMPTZ '9999-12-31 23:59:59+00';

-- ============================================================
-- 4) 자산이력조회 (assetRecordList) — 원래 "이력" 데이터라 매 조회마다 새 행으로 쌓기만 한다(만료 처리 없음).
--    다만 요청하신 규칙대로 fetched_at / valid_from / valid_to 칼럼은 동일하게 두고, valid_to는 항상 만료없음 값으로 채운다.
-- ============================================================
CREATE TABLE IF NOT EXISTS krs_asset_record_history (
    id                      BIGSERIAL PRIMARY KEY,

    bcnc_code               TEXT,
    dlivy_slip_no           TEXT,
    obj_div                 TEXT,
    obj_sn                  TEXT,
    oper_date               TEXT,
    cnsul_no                TEXT,
    applcnt                 TEXT,
    user_name               TEXT,
    dept_name               TEXT,
    hdqrtrs                 TEXT,
    team                    TEXT,
    memo                    TEXT,
    memo2                   TEXT,
    memo3                   TEXT,
    reg_user                TEXT,
    oper_status_change_date TEXT,
    oper_status             TEXT,
    acins_start_date        TEXT,
    wrhs_date_start         TEXT,
    wrhs_date_end           TEXT,
    oper_date_start         TEXT,
    oper_date_end           TEXT,
    model_name              TEXT,
    oper_div                TEXT,
    serial_no               TEXT,
    prdct_name              TEXT,
    item_name               TEXT,

    raw_response            JSONB,
    fetched_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_from              TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to                TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMPTZ '9999-12-31 23:59:59+00'
);

-- ============================================================
-- 5) 자산실사목록 (assetAcinsList) — 테이블 정의만 우선 준비
-- ============================================================
CREATE TABLE IF NOT EXISTS krs_asset_acins (
    id                      BIGSERIAL PRIMARY KEY,
    asset_no                TEXT NOT NULL,           -- assetNo 자산번호 (자연키로 사용)
    start_date              TEXT,                    -- startDate 생성일자(문서상 이 값 + assetNo 조합이 실사 1건을 식별)

    dlivy_slip_no           TEXT,
    asset_div               TEXT,
    obj_div                 TEXT,
    obj_sn                  TEXT,
    prdct_name              TEXT,
    model_name              TEXT,
    model_code              TEXT,
    item_name               TEXT,
    serial_no               TEXT,
    wrhs_date               TEXT,
    bcnc_code               TEXT,
    oper_div                TEXT,
    oper_status             TEXT,
    oper_date               TEXT,
    cnsul_no                TEXT,
    applcnt                 TEXT,
    user_name               TEXT,
    dept_name               TEXT,
    hdqrtrs                 TEXT,
    team                    TEXT,
    acins_yn                TEXT,                    -- acinsYn 실사여부
    org_acins_yn            TEXT,                    -- orgAcinsYn 실사여부
    acins_man               TEXT,                    -- acinsMan 실사담당자
    acins_date              TEXT,                    -- acinsDate 실사일시
    acins_user_yn           TEXT,                    -- acinsUserYn 실사용자일치여부
    acins_user              TEXT,                    -- acinsUser 실사사용자
    acins_dept_name         TEXT,                    -- acinsDeptName 실사소속부서
    acins_hdqrtrs           TEXT,                    -- acinsHdqrtrs 실사본부
    acins_team              TEXT,                    -- acinsTeam 실사팀
    acins_remark1           TEXT,                    -- acinsRemark1 실사비고1
    acins_remark2           TEXT,                    -- acinsRemark2 실사비고2
    memo                    TEXT,
    memo2                   TEXT,
    memo3                   TEXT,
    sn                      TEXT,                    -- sn 순번
    link_sn                 TEXT,                    -- linkSn 링크순번
    trnsf_yn                TEXT,                    -- trnsfYn 이관여부
    acins_start_date        TEXT,                    -- acinsStartDate 실사시작일자
    asset_div_change_date   TEXT,                    -- assetDivChangeDate 자산구분변동일자

    raw_response            JSONB,
    fetched_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_from              TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to                TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMPTZ '9999-12-31 23:59:59+00'
);

CREATE INDEX IF NOT EXISTS ix_krs_asset_acins_asset_no ON krs_asset_acins (asset_no, start_date);

-- ============================================================
-- 6) 우리 서비스 자체의 KRS 토큰 발급 이력 (문제 생겼을 때 추적용, 선택 사항이지만 만들어 둠)
-- ============================================================
CREATE TABLE IF NOT EXISTS krs_token_log (
    id          BIGSERIAL PRIMARY KEY,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),  -- 토큰을 새로 발급받은 시각
    code        INTEGER,                              -- KRS가 응답한 code
    msg         TEXT                                   -- KRS가 응답한 msg
);
