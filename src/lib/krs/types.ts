// Design Ref: DESIGN.md — KRS Smart API(https://www.krsmart.com/api/help) 공통 응답 형태

export interface KrsResponse<T> {
  code: number;
  msg: string;
  total?: string;
  token?: string;
  result?: T[];
}

// 토큰이 없거나(902) 유효하지 않거나(900) 만료된(901) 경우 — 새 토큰을 발급받아 재시도해야 하는 코드
export const KRS_TOKEN_ERROR_CODES = [900, 901, 902];

// getRentalEqpmntList 응답 한 행 (렌탈장비현황) — 문서에 나온 필드 그대로 camelCase
export interface KrsRentalEquipmentRow {
  dlivySlipNo?: string;
  assetDiv?: string;
  assetNo: string;
  recptUser?: string;
  prdctName?: string;
  modelName?: string;
  itemName?: string;
  serialNo?: string;
  cntrctStatus?: string;
  dlivyDate?: string;
  dlivyClass?: string;
  exchngAssetNo?: string;
  returnPrnmntDate?: string;
  rentalFee?: string;
  recptDate?: string;
  deptCode?: string;
  deptName?: string;
  userId?: string;
  userName?: string;
  cntrctNo?: string;
  manufCode?: string;
  manufName?: string;
  modelCode?: string;
  objDiv?: string;
  objSn?: string;
  dlivyQty?: string;
  bsnMan?: string;
  bsnManName?: string;
  userSpec?: string;
  remark?: string;
  bcncCode?: string;
  bcncName?: string;
  operDiv?: string;
  operStatus?: string;
  operStatusDiv?: string;
  assetInfoDiv?: string;
  assetInfoStr?: string;
  wrhsDate?: string;
  remark1?: string;
  remark2?: string;
  acinsStartDate?: string;
  operDate?: string;
  cnsulNo?: string;
  applcnt?: string;
  hdqrtrs?: string;
  team?: string;
  memo?: string;
  memo2?: string;
  memo3?: string;
  regUser?: string;
  assetDivChangeDate?: string;
  wrhsDateStart?: string;
  wrhsDateEnd?: string;
  operDateStart?: string;
  operDateEnd?: string;
  dlivyDateStart?: string;
  dlivyDateEnd?: string;
  returnDateStart?: string;
  returnDateEnd?: string;
  operAssetCnt?: string;
  assetListStr?: string;
}
