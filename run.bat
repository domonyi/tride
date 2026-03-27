@echo off
set PATH=C:\msys64\mingw64\bin;%USERPROFILE%\.cargo\bin;%PATH%
cd /d C:\DEV\Tride

if not exist "node_modules" (
    echo [Tride] Installing dependencies...
    call npm install || goto :fail
)

echo [Tride] Building...
call npx tauri build 2>&1 | findstr /C:"Built application" /C:"error"

echo.
echo Starting Tride...
start "" "src-tauri\target\release\tride.exe"
exit /b 0

:fail
echo BUILD FAILED
pause
exit /b 1
