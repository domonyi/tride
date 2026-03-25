@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  AiTerminal - Full Build
echo ============================================
echo.

set GYP_MSVS_VERSION=2022
set PYTHON=C:\Users\zdomonyi\AppData\Local\Programs\Python\Python312\python.exe
set PATH=C:\Users\zdomonyi\AppData\Roaming\fnm\node-versions\v20.20.2\installation;C:\msys64\mingw64\bin;%USERPROFILE%\.cargo\bin;%PATH%

:: ── Theia IDE ──────────────────────────────────────────────────────────
cd /d C:\DEV\AiTerminal\theia-ide

if not exist "node_modules" (
    echo [Theia] Installing dependencies...
    call npm install --ignore-scripts || goto :fail
)

:: Patch Spectre flags if needed
powershell -Command "if (Test-Path 'node_modules\node-pty\binding.gyp') { $c = Get-Content 'node_modules\node-pty\binding.gyp' -Raw; if ($c -match \"'SpectreMitigation': 'Spectre'\") { $c -replace \"'SpectreMitigation': 'Spectre'\", \"'SpectreMitigation': 'false'\" | Set-Content 'node_modules\node-pty\binding.gyp' } }" 2>nul
powershell -Command "if (Test-Path 'node_modules\@vscode\windows-ca-certs\binding.gyp') { $c = Get-Content 'node_modules\@vscode\windows-ca-certs\binding.gyp' -Raw; if ($c -match '\"SpectreMitigation\": \"Spectre\"') { $c -replace '\"SpectreMitigation\": \"Spectre\"', '\"SpectreMitigation\": \"false\"' | Set-Content 'node_modules\@vscode\windows-ca-certs\binding.gyp' } }" 2>nul

:: Redirect electron node-gyp
>node_modules\@electron\node-gyp\bin\node-gyp.js echo #!/usr/bin/env node
>>node_modules\@electron\node-gyp\bin\node-gyp.js echo require('%USERPROFILE:\=\\%\\AppData\\Roaming\\fnm\\node-versions\\v20.20.2\\installation\\node_modules\\npm\\node_modules\\node-gyp\\bin\\node-gyp.js');

:: Rebuild native modules only if missing
set NEED_REBUILD=0
if not exist "node_modules\node-pty\build\Release\pty.node" set NEED_REBUILD=1
if not exist "node_modules\@vscode\windows-ca-certs\build\Release\crypt32.node" set NEED_REBUILD=1
if not exist "node_modules\keytar\build\Release\keytar.node" set NEED_REBUILD=1
if not exist "node_modules\drivelist\build\Release\drivelist.node" set NEED_REBUILD=1

if !NEED_REBUILD!==1 (
    echo [Theia] Rebuilding native modules...
    call npm rebuild 2>nul
    if not exist "node_modules\node-pty\build\Release\pty.node" (
        cd /d C:\DEV\AiTerminal\theia-ide\node_modules\node-pty
        call npx node-gyp rebuild 2>nul
        cd /d C:\DEV\AiTerminal\theia-ide
    )
    if not exist "node_modules\@vscode\windows-ca-certs\build\Release\crypt32.node" (
        cd /d C:\DEV\AiTerminal\theia-ide\node_modules\@vscode\windows-ca-certs
        call npx node-gyp rebuild 2>nul
        cd /d C:\DEV\AiTerminal\theia-ide
    )
) else (
    echo [Theia] Native modules OK, skipping rebuild
)

:: Build webpack only if bundle missing or package.json changed
if not exist "lib\frontend\bundle.js" (
    echo [Theia] Building webpack bundle...
    call npx theia build --mode production || goto :fail
) else (
    echo [Theia] Bundle exists, skipping webpack build
    echo         To force rebuild, delete theia-ide\lib\frontend\bundle.js
)

:: ── Tauri App ──────────────────────────────────────────────────────────
cd /d C:\DEV\AiTerminal

if not exist "node_modules" (
    echo [Tauri] Installing dependencies...
    call npm install || goto :fail
)

echo [Tauri] Building app...
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
