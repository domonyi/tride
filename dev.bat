@echo off
set PATH=C:\msys64\mingw64\bin;%USERPROFILE%\.cargo\bin;%PATH%
cd /d C:\DEV\Tride

if not exist "node_modules" (
    echo [Tride] Installing dependencies...
    call npm install || goto :fail
)

echo [Tride] Starting dev mode...
call npx tauri dev
exit /b 0

:fail
echo SETUP FAILED
pause
exit /b 1
