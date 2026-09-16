# 1. Microsoft.Graph.Users 모듈 설치 여부 확인 및 설치
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Users)) {
    Write-Host "Microsoft.Graph 모듈을 설치합니다..." -ForegroundColor Yellow
    Install-Module Microsoft.Graph.Users -Scope CurrentUser -Repository PSGallery -Force
}

# 2. Graph API 접속 (라이선스 조회를 위한 최소 읽기 권한)
Write-Host "Microsoft 365 테넌트에 로그인합니다..." -ForegroundColor Cyan
Connect-MgGraph -Scopes "Organization.Read.All" -NoWelcome

# 3. 구독/구매 중인 모든 라이선스(SKU) 정보 조회
Write-Host "라이선스 정보를 가져오는 중..." -ForegroundColor Cyan
$subscribedSkus = Get-MgSubscribedSku -All

# 4. 결과 데이터 가공
$licenseReport = foreach ($sku in $subscribedSkus) {
    # 사용 가능한 총 수량 (선불 구매 + 활성 상태)
    $totalPurchased = $sku.PrepaidUnits.Enabled
    # 현재 사용자에게 할당된 수량
    $assignedUnits  = $sku.ConsumedUnits
    # 잔여 잔여 수량
    $remainingUnits = $totalPurchased - $assignedUnits

    [PSCustomObject]@{
        "라이선스 이름 (SkuPartNumber)" = $sku.SkuPartNumber
        "총 구매/구독 수량"            = $totalPurchased
        "할당된 수량"                  = $assignedUnits
        "잔여 수량"                    = $remainingUnits
        "SKU ID"                       = $sku.SkuId
    }
}

# 5. 콘솔에 표 형태로 출력
Write-Host "`n=== M365 라이선스 보유 및 사용 현황 ===" -ForegroundColor Green
$licenseReport | Format-Table -AutoSize

# 6. (선택 사항) CSV 파일로 저장
$csvPath = "$HOME\Desktop\M365_License_Report.csv"
$licenseReport | Export-Csv -Path $csvPath -NoTypeInformation -Encoding utf8BOM
Write-Host "결과 파일이 저장되었습니다: $csvPath" -ForegroundColor Green

# 7. 세션 종료 (필요 시 주석 해제)
# Disconnect-MgGraph