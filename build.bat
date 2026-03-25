@echo off
echo ============================================
echo  AiTerminal - Build
echo ============================================
echo.

set PATH=C:\msys64\mingw64\bin;%USERPROFILE%\.cargo\bin;%PATH%
cd /d C:\DEV\AiTerminal

if not exist "node_modules" (
    echo [AiTerminal] Installing dependencies...
    call npm install || goto :fail
)

echo [AiTerminal] Building...
call npx tauri build 2>&1 | findstr /C:"Built application" /C:"error" /C:"warning"

echo.
echo ============================================
echo  BUILD COMPLETE
echo  Run: src-tauri\target\release\ai-terminal.exe
echo ============================================
pause
exit /b 0

:fail
echo.
echo BUILD FAILED
pause
exit /b 1
