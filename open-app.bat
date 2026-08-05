@echo off
cd /d "%~dp0"
start "ミヤマ工業動画マニュアル Server" /min npx vite --host 127.0.0.1
timeout /t 3 >nul
start http://127.0.0.1:5173/
