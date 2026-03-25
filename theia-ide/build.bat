@echo off
echo ============================================
echo  Building Theia IDE
echo ============================================
echo.

set GYP_MSVS_VERSION=2022
set PYTHON=C:\Users\zdomonyi\AppData\Local\Programs\Python\Python312\python.exe
set PATH=C:\Users\zdomonyi\AppData\Roaming\fnm\node-versions\v20.20.2\installation;%PATH%
cd /d C:\DEV\AiTerminal\theia-ide

echo [1/5] Installing dependencies...
call npm install --ignore-scripts
if errorlevel 1 (
    echo INSTALL FAILED
    pause
    exit /b 1
)

echo [2/5] Patching Spectre flags...
powershell -Command "if (Test-Path 'node_modules\node-pty\binding.gyp') { (Get-Content 'node_modules\node-pty\binding.gyp') -replace \"'SpectreMitigation': 'Spectre'\", \"'SpectreMitigation': 'false'\" | Set-Content 'node_modules\node-pty\binding.gyp' }"
powershell -Command "if (Test-Path 'node_modules\@vscode\windows-ca-certs\binding.gyp') { (Get-Content 'node_modules\@vscode\windows-ca-certs\binding.gyp') -replace '\"SpectreMitigation\": \"Spectre\"', '\"SpectreMitigation\": \"false\"' | Set-Content 'node_modules\@vscode\windows-ca-certs\binding.gyp' }"

echo [3/5] Redirecting @electron/node-gyp to standard node-gyp...
echo #!/usr/bin/env node > node_modules\@electron\node-gyp\bin\node-gyp.js
echo require('C:\\Users\\zdomonyi\\AppData\\Roaming\\fnm\\node-versions\\v20.20.2\\installation\\node_modules\\npm\\node_modules\\node-gyp\\bin\\node-gyp.js'); >> node_modules\@electron\node-gyp\bin\node-gyp.js

echo [4/5] Rebuilding native modules...
call npm rebuild
if errorlevel 1 (
    echo WARNING: Some native modules failed, checking critical ones...
)

echo Verifying critical native modules...
if not exist "node_modules\node-pty\build\Release\pty.node" (
    echo Rebuilding node-pty manually...
    cd /d C:\DEV\AiTerminal\theia-ide\node_modules\node-pty
    call npx node-gyp rebuild
    cd /d C:\DEV\AiTerminal\theia-ide
)
if not exist "node_modules\@vscode\windows-ca-certs\build\Release\crypt32.node" (
    echo Rebuilding windows-ca-certs manually...
    cd /d C:\DEV\AiTerminal\theia-ide\node_modules\@vscode\windows-ca-certs
    call npx node-gyp rebuild
    cd /d C:\DEV\AiTerminal\theia-ide
)

echo Checking all native modules:
if exist "node_modules\keytar\build\Release\keytar.node" (echo   keytar.node ........... OK) else (echo   keytar.node ........... MISSING)
if exist "node_modules\node-pty\build\Release\pty.node" (echo   pty.node .............. OK) else (echo   pty.node .............. MISSING)
if exist "node_modules\drivelist\build\Release\drivelist.node" (echo   drivelist.node ........ OK) else (echo   drivelist.node ........ MISSING)
if exist "node_modules\@vscode\windows-ca-certs\build\Release\crypt32.node" (echo   crypt32.node .......... OK) else (echo   crypt32.node .......... MISSING)
if exist "node_modules\@theia\ffmpeg\build\Release\ffmpeg.node" (echo   ffmpeg.node ........... OK) else (echo   ffmpeg.node ........... MISSING)
echo.

echo [5/5] Building webpack bundle...
call npx theia build --mode production
if errorlevel 1 (
    echo BUILD FAILED
    pause
    exit /b 1
)

echo.
echo ============================================
echo  BUILD COMPLETE
echo ============================================
pause
