"""KRS 조회 API 5개와 Supabase 테이블 5개의 대응 정의.

컬럼 목록은 db/migrations/001_krs_tables.sql 로 이미 만들어 둔 실제 테이블 구조와 같아야 한다.
API 응답 필드(camelCase)는 아래 camel_to_snake() 규칙으로 컬럼명(snake_case)에 대응시키고,
규칙만으로 안 맞는 항목은 FIELD_OVERRIDES에 예외로 적는다.
"""

import re
from dataclasses import dataclass, field
from typing import Callable

import config

# 규칙으로 변환되지 않는 예외 (API 필드명 → DB 컬럼명)
FIELD_OVERRIDES = {
    "Outdate": "out_date",  # 문서상 대문자로 시작하고 단어 구분이 없음
}

# 문자열이 아니라 정수로 넣어야 하는 컬럼
INTEGER_COLUMNS = {"row_num", "object_sequence", "rental_amount"}


def camel_to_snake(name: str) -> str:
    if name in FIELD_OVERRIDES:
        return FIELD_OVERRIDES[name]
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name).lower()


@dataclass
class TableSpec:
    table: str  # Supabase 테이블명
    label: str  # 사람이 읽는 이름
    path: str  # KRS API 경로
    natural_key: tuple[str, ...]  # 같은 대상인지 판단하는 기준 컬럼
    columns: tuple[str, ...]  # 적재 대상 업무 컬럼 (감사용 컬럼 제외)
    params: Callable[[], dict] = field(default=dict)  # 호출 시 추가 파라미터
    history_only: bool = False  # True면 만료 처리 없이 새 행만 append


RENTAL_EQUIPMENT_COLUMNS = (
    "asset_no", "dlivy_slip_no", "asset_div", "recpt_user", "prdct_name", "model_name",
    "item_name", "serial_no", "cntrct_status", "dlivy_date", "dlivy_class", "exchng_asset_no",
    "return_prnmnt_date", "rental_fee", "recpt_date", "dept_code", "dept_name", "user_id",
    "user_name", "cntrct_no", "manuf_code", "manuf_name", "model_code", "obj_div", "obj_sn",
    "dlivy_qty", "bsn_man", "bsn_man_name", "user_spec", "remark", "bcnc_code", "bcnc_name",
    "oper_div", "oper_status", "oper_status_div", "asset_info_div", "asset_info_str",
    "wrhs_date", "remark1", "remark2", "acins_start_date", "oper_date", "cnsul_no", "applcnt",
    "hdqrtrs", "team", "memo", "memo2", "memo3", "reg_user", "asset_div_change_date",
    "wrhs_date_start", "wrhs_date_end", "oper_date_start", "oper_date_end", "dlivy_date_start",
    "dlivy_date_end", "return_date_start", "return_date_end", "oper_asset_cnt", "asset_list_str",
)

CUSTOMER_OPER_ASSET_COLUMNS = (
    "asset_number", "row_num", "customer_code", "release_statement_number", "object_type",
    "object_sequence", "asset_type", "asset_type_change_date", "receive_date", "out_date",
    "asset_comment1", "asset_comment2", "product", "model_code", "model_name", "product_name",
    "serial_number", "state", "operation_type", "operation_date", "consult_number",
    "request_user", "company", "department", "team", "consumer", "memo1", "memo2", "memo3",
    "rental_amount",
)

OPER_ASSET_RECORD_COLUMNS = (
    "asset_no", "dlivy_slip_no", "asset_div", "recpt_user", "prdct_name", "model_name",
    "item_name", "serial_no", "cntrct_status", "dlivy_date", "return_prnmnt_date", "rental_fee",
    "recpt_date", "dept_code", "dept_name", "user_id", "user_name", "cntrct_no", "manuf_code",
    "manuf_name", "model_code", "obj_div", "obj_sn", "spot_code", "release_qty", "bsn_man",
    "bsn_man_name", "user_spec", "remark", "bcnc_code", "bcnc_name", "oper_div", "oper_status",
    "oper_status_div", "asset_info_div", "asset_info_str", "wrhs_date", "remark1", "remark2",
    "acins_start_date", "oper_date", "cnsul_no", "applcnt", "hdqrtrs", "team", "memo", "memo2",
    "memo3", "reg_user", "wrhs_date_start", "wrhs_date_end", "oper_date_start", "oper_date_end",
    "dlivy_date_start", "dlivy_date_end", "return_date_start", "return_date_end",
    "oper_asset_cnt", "asset_list_str",
)

ASSET_RECORD_HISTORY_COLUMNS = (
    "bcnc_code", "dlivy_slip_no", "obj_div", "obj_sn", "oper_date", "cnsul_no", "applcnt",
    "user_name", "dept_name", "hdqrtrs", "team", "memo", "memo2", "memo3", "reg_user",
    "oper_status_change_date", "oper_status", "acins_start_date", "wrhs_date_start",
    "wrhs_date_end", "oper_date_start", "oper_date_end", "model_name", "oper_div", "serial_no",
    "prdct_name", "item_name",
)

ASSET_ACINS_COLUMNS = (
    "asset_no", "start_date", "dlivy_slip_no", "asset_div", "obj_div", "obj_sn", "prdct_name",
    "model_name", "model_code", "item_name", "serial_no", "wrhs_date", "bcnc_code", "oper_div",
    "oper_status", "oper_date", "cnsul_no", "applcnt", "user_name", "dept_name", "hdqrtrs",
    "team", "acins_yn", "org_acins_yn", "acins_man", "acins_date", "acins_user_yn", "acins_user",
    "acins_dept_name", "acins_hdqrtrs", "acins_team", "acins_remark1", "acins_remark2", "memo",
    "memo2", "memo3", "sn", "link_sn", "trnsf_yn", "acins_start_date", "asset_div_change_date",
)


def _date_range_params() -> dict:
    return {"wrhsDateStart": config.fetch_start_date(), "wrhsDateEnd": config.fetch_end_date()}


def _asset_record_params() -> dict:
    # 문서상 assetDiv/assetNo도 필수로 표기돼 있어 빈 값으로 함께 보낸다(전체 조회 의도).
    return {**_date_range_params(), "assetDiv": "", "assetNo": ""}


def _acins_params() -> dict:
    # 이 API만 기간이 아니라 "생성일자" 단일 날짜를 받는다.
    return {"startDate": config.acins_start_date()}


TABLES: tuple[TableSpec, ...] = (
    TableSpec(
        table="krs_rental_equipment",
        label="렌탈장비현황",
        path="/getRentalEqpmntList",
        natural_key=("asset_no",),
        columns=RENTAL_EQUIPMENT_COLUMNS,
    ),
    TableSpec(
        table="krs_customer_oper_asset",
        label="고객운영자산관리정보",
        path="/CustomerOperAssetInfo",
        natural_key=("asset_number",),
        columns=CUSTOMER_OPER_ASSET_COLUMNS,
    ),
    TableSpec(
        table="krs_oper_asset_record",
        label="운영자산관리",
        path="/operAssetRecordList",
        natural_key=("asset_no",),
        columns=OPER_ASSET_RECORD_COLUMNS,
        params=_date_range_params,
    ),
    TableSpec(
        table="krs_asset_record_history",
        label="자산이력조회",
        path="/assetRecordList",
        natural_key=("dlivy_slip_no", "obj_div", "obj_sn", "oper_date", "oper_status_change_date"),
        columns=ASSET_RECORD_HISTORY_COLUMNS,
        params=_asset_record_params,
        history_only=True,
    ),
    TableSpec(
        table="krs_asset_acins",
        label="자산실사목록",
        path="/assetAcinsList",
        natural_key=("asset_no", "start_date"),
        columns=ASSET_ACINS_COLUMNS,
        params=_acins_params,
    ),
)
