# ==============================================================================
# 1. 필수 모듈 로드 및 인증
# ==============================================================================
$modules = @("Microsoft.Graph.Authentication", "Microsoft.Graph.Users", "Microsoft.Graph.Identity.DirectoryManagement", "Microsoft.Graph.Reports")

foreach ($mod in $modules) {
    if (-not (Get-Module -ListAvailable -Name $mod)) {
        Write-Host "모듈 설치 중: $mod..." -ForegroundColor Yellow
        Install-Module $mod -Scope CurrentUser -Repository PSGallery -Force -AllowClobber
    }
    Import-Module $mod -ErrorAction SilentlyContinue
}

Write-Host "로그인 인증 페이지를 브라우저로 엽니다..." -ForegroundColor Cyan
# 브라우저 자동 실행
Start-Process "https://login.microsoft.com/device"

Write-Host "하단 터미널에 표시되는 8자리 영문 코드를 방금 열린 웹 브라우저에 입력해주세요." -ForegroundColor Yellow
# 디바이스 코드 기반 인증 시작 (타임아웃 120초 이내 완료 필요)
Connect-MgGraph -Scopes "User.Read.All", "Organization.Read.All", "AuditLog.Read.All" -UseDeviceAuthentication

# ==============================================================================
# 2. 라이선스 SKU ID -> 제품명 매핑 테이블 생성
# ==============================================================================
Write-Host "`n테넌트 구독 라이선스 정보 캐싱 중..." -ForegroundColor Cyan
$subscribedSkus = Get-MgSubscribedSku -All
$skuMap = @{}
foreach ($sku in $subscribedSkus) {
    $skuMap[$sku.SkuId] = $sku.SkuPartNumber
}

# ==============================================================================
# 3. 최근 라이선스 할당 감사 로그(Audit Log) 수집
# ==============================================================================
Write-Host "라이선스 할당 일시 확인을 위한 감사 로그 분석 중..." -ForegroundColor Cyan
$licenseAuditLogs = Get-MgAuditLogDirectoryAudit -Filter "activityDisplayName eq 'Change user license'" -All -ErrorAction SilentlyContinue

$userLicenseDateMap = @{}
if ($licenseAuditLogs) {
    foreach ($log in ($licenseAuditLogs | Sort-Object ActivityDateTime)) {
        $targetUser = $log.TargetResources | Where-Object { $_.Type -eq "User" }
        if ($targetUser -and $targetUser.UserPrincipalName) {
            $userLicenseDateMap[$targetUser.UserPrincipalName.ToLower()] = $log.ActivityDateTime
        }
    }
}

# ==============================================================================
# 4. 전체 사용자 정보 수집 및 가공
# ==============================================================================
Write-Host "전체 사용자 데이터 수집 중..." -ForegroundColor Cyan
$users = Get-MgUser -All -Property "id,displayName,userPrincipalName,department,companyName,assignedLicenses,createdDateTime"

$results = foreach ($user in $users) {
    # 1) 할당된 라이선스 이름 변환
    $licenseNames = @()
    if ($user.AssignedLicenses.Count -gt 0) {
        foreach ($lic in $user.AssignedLicenses) {
            if ($skuMap.ContainsKey($lic.SkuId)) {
                $licenseNames += $skuMap[$lic.SkuId]
            } else {
                $licenseNames += $lic.SkuId
            }
        }
    }

    # 2) 라이선스 시작일 결정 로직
    $licenseStartDate = "-"
    if ($licenseNames.Count -gt 0) {
        $upnLower = $user.UserPrincipalName.ToLower()
        if ($userLicenseDateMap.ContainsKey($upnLower)) {
            $licenseStartDate = $userLicenseDateMap[$upnLower].ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")
        } elseif ($user.CreatedDateTime) {
            $licenseStartDate = $user.CreatedDateTime.Value.ToLocalTime().ToString("yyyy-MM-dd") + " (계정생성일 기준)"
        }
    }

    # 3) 결과 객체 생성
    [PSCustomObject]@{
        "이름(DisplayName)"       = $user.DisplayName
        "계정(UPN)"               = $user.UserPrincipalName
        "부서(Department)"        = if ($user.Department) { $user.Department } else { "-" }
        "회사명(CompanyName)"     = if ($user.CompanyName) { $user.CompanyName } else { "-" }
        "사용 중인 라이선스"      = if ($licenseNames.Count -gt 0) { $licenseNames -join ", " } else { "라이선스 없음" }
        "라이선스 할당/시작 일시" = $licenseStartDate
    }
}

# ==============================================================================
# 5. 화면 출력 및 CSV 저장
# ==============================================================================
Write-Host "총 $($results.Count)명의 사용자 데이터 집계 완료!" -ForegroundColor Green

# 그리드 뷰 창 열기
$results | Out-GridView -Title "M365 사용자별 조직 및 라이선스 현황"

# CSV 파일 내보내기 (한글 깨짐 방지 BOM 적용)
$csvFileName = ".\M365_User_License_Report_$(Get-Date -Format 'yyyyMMdd_HHmm').csv"
$results | Export-Csv -Path $csvFileName -NoTypeInformation -Encoding utf8BOM
Write-Host "보고서 파일 생성 완료: $csvFileName" -ForegroundColor Yellow