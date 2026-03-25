@echo off
set GYP_MSVS_VERSION=2022
set PYTHON=C:\Users\zdomonyi\AppData\Local\Programs\Python\Python312\python.exe
set PATH=C:\Users\zdomonyi\AppData\Roaming\fnm\node-versions\v20.20.2\installation;%PATH%
cd /d C:\DEV\AiTerminal\theia-ide

echo Building... output saved to build-log.txt
call npx theia build --mode production > build-log.txt 2>&1
if errorlevel 1 (
    echo BUILD FAILED - check build-log.txt
) else (
    echo BUILD COMPLETE
)
pause
