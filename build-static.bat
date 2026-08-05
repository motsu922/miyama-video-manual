@echo off
cd /d "%~dp0"
npm run build
echo.
echo Open static-app\index.html after the build finishes.
pause
