@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 이상이 필요합니다. https://nodejs.org/
  pause
  exit /b 1
)
echo 게임 서버를 시작합니다. 실행창을 닫으면 서버가 종료됩니다.
start "" "http://localhost:3000"
node server.js
pause
