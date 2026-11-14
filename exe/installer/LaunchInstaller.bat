@echo off
setlocal enabledelayedexpansion
title CapLab 13 Native - Interactive Setup Launcher [Administrator]
color 0B

cd /d "%~dp0.."

net session >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [Elevation] Meminta izin Administrator untuk Interactive Setup GUI...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

set "GUI_SCRIPT=%~dp0InstallerGui.ps1"
if exist "%GUI_SCRIPT%" (
    powershell -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "%GUI_SCRIPT%" -ProjectRoot "%CD%"
    if %ERRORLEVEL% EQU 0 (
        exit /b 0
    )
    if exist "%CD%\dist\CapLab13Native.exe" (
        exit /b 0
    )
    echo [Fallback] GUI Installer berhenti atau tidak dapat dimuat; beralih ke CLI pipeline...
)

call "%~dp0..\builder\build_pipeline.bat"
exit /b %ERRORLEVEL%
