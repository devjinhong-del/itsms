@echo off
REM OA 렌탈 데이터 수집 실행 (윈도우 작업 스케줄러에 이 파일을 등록하면 자동 실행된다)
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [준비] 가상환경을 만들고 필요한 패키지를 설치합니다...
    python -m venv .venv
    .venv\Scripts\python.exe -m pip install --quiet --upgrade pip
    .venv\Scripts\python.exe -m pip install --quiet -r requirements.txt
)

.venv\Scripts\python.exe sync.py
