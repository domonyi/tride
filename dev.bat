@echo off
set PATH=C:\msys64\mingw64\bin;%USERPROFILE%\.cargo\bin;%PATH%
cd /d C:\DEV\AiTerminal

if not exist "node_modules" (
    echo [AiTerminal] Installing dependencies...
    call npm install || goto :fail
)

echo [AiTerminal] Starting dev mode...
call npx tauri dev
exit /b 0

:fail
echo SETUP FAILED
pause
exit /b 1
