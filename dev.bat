@echo off
cd /d "%~dp0"

if not exist "node_modules" (
    echo [Tride] Installing dependencies...
    call bun install || goto :fail
)

echo [Tride] Starting dev mode...
call npx tauri dev
exit /b 0

:fail
echo SETUP FAILED
pause
exit /b 1
