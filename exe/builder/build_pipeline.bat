@echo off
setlocal
title CapLab 13 Native  ^|  Build ^& Setup Agent [Administrator]
color 0B

for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
if "%PROJECT_ROOT:~-1%"=="\" if not "%PROJECT_ROOT:~1,2%"==":\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
cd /d "%PROJECT_ROOT%"

echo   +------------------------------------------------------------------------+
echo   ^| CapLab 13 Native  ^|  Windows 11 x64 Zero-Dependency Build Pipeline     ^|
echo   +------------------------------------------------------------------------+

net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [Elevation] Requesting Administrator privilege...
    set "SELF_BAT=%~f0"
    powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$q=[char]34; Start-Process -FilePath $env:ComSpec -ArgumentList '/k', ($q + $q + $env:SELF_BAT + $q + $q) -Verb RunAs"
    if %ERRORLEVEL% NEQ 0 (
        echo   [ERROR] Administrator UAC request failed.
        pause
        exit /b 1
    )
    exit /b 0
)

set "ENTRY_SCRIPT=%PROJECT_ROOT%\custom_setup_agent\SetupAgent.ps1"
if not exist "%ENTRY_SCRIPT%" (
    set "ENTRY_SCRIPT=%PROJECT_ROOT%\builder\CustomBuildOrchestrator.ps1"
)
if not exist "%ENTRY_SCRIPT%" (
    echo   [ERROR] SetupAgent.ps1 / CustomBuildOrchestrator.ps1 missing under "%PROJECT_ROOT%".
    pause
    exit /b 2
)

set "EXTRA_FLAGS="
set "AUTO_LAUNCHED=0"
if /I "%~nx1"=="" if /I "%ENTRY_SCRIPT:~-14%"=="SetupAgent.ps1" (
    set "EXTRA_FLAGS=-AutoLaunchGame"
    set "AUTO_LAUNCHED=1"
)

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ENTRY_SCRIPT%" -ProjectRoot "%PROJECT_ROOT%" %EXTRA_FLAGS%
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if %EXIT_CODE% EQU 0 (
    echo   +------------------------------------------------------------------------+
    echo   ^| BUILD ^& SHORTCUT SELESAI!                                              ^|
    echo   ^| Binary: %CD%\dist\CapLab13Native.exe
    echo   +------------------------------------------------------------------------+
    if "%AUTO_LAUNCHED%"=="1" (
        echo   [Launcher] Game started cleanly. Closing setup console in 2s...
        ping 127.0.0.1 -n 3 >nul
        exit /b 0
    )
    pause
    exit /b 0
)

echo   +------------------------------------------------------------------------+
echo   ^| [ERROR] Build halted (code %EXIT_CODE%)
echo   ^| Report : %PROJECT_ROOT%\build_native\setup_agent_report.log
echo   +------------------------------------------------------------------------+
echo.
pause
exit /b %EXIT_CODE%
