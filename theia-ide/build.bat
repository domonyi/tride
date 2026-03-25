@echo off
echo ============================================
echo  Building Theia native modules + webpack
echo ============================================
echo.

set GYP_MSVS_VERSION=2022
set PYTHON=C:\Users\zdomonyi\AppData\Local\Programs\Python\Python312\python.exe
set PATH=C:\Users\zdomonyi\AppData\Roaming\fnm\node-versions\v20.20.2\installation;%PATH%
cd /d C:\DEV\AiTerminal\theia-ide

echo [1/2] Rebuilding native modules...
call npm rebuild
if errorlevel 1 (
    echo.
    echo WARNING: Some native modules failed, continuing anyway...
    echo.
)

echo [2/2] Building Theia webpack bundle...
call npx theia build --mode production
if errorlevel 1 (
    echo.
    echo BUILD FAILED
    pause
    exit /b 1
)

echo.
echo ============================================
echo  BUILD COMPLETE - you can close this window
echo ============================================
pause
