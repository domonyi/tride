@echo off
echo ============================================
echo  Tride - Build
echo ============================================
echo.

set PATH=C:\msys64\mingw64\bin;%USERPROFILE%\.cargo\bin;%PATH%
cd /d C:\DEV\Tride

if not exist "node_modules" (
    echo [Tride] Installing dependencies...
    call npm install || goto :fail
)

echo [Tride] Building...
call npx tauri build 2>&1 | findstr /C:"Built application" /C:"error" /C:"warning"

echo.
echo ============================================
echo  BUILD COMPLETE
echo  Run: src-tauri\target\release\tride.exe
echo ============================================
pause
exit /b 0

:fail
echo.
echo BUILD FAILED
pause
exit /b 1
