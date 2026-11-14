@echo off
setlocal enabledelayedexpansion
title CapLab 13 Native Script Builder [Administrator]
color 0B

cd /d "%~dp0.."

echo ============================================================================
echo   CapLab 13 Native - Automated Windows 11 Administrator Build Pipeline
echo   Mode: Custom Zero-Dependency Parallel Builder (No External Make/CMake)
echo ============================================================================
echo.

net session >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [Elevation] Meminta izin Administrator Command Prompt...
    powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/k','\"\"%~f0\"\"' -Verb RunAs"
    exit /b 0
)

echo [OK] Berjalan dalam mode Administrator.
echo [Info] Direktori Proyek: %CD%
echo.

set "ENTRY_SCRIPT=%~dp0..\custom_setup_agent\SetupAgent.ps1"
if not exist "%ENTRY_SCRIPT%" (
    set "ENTRY_SCRIPT=%~dp0CustomBuildOrchestrator.ps1"
)
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ENTRY_SCRIPT%" -ProjectRoot "%CD%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if %EXIT_CODE% EQU 0 (
    echo ============================================================================
    echo   BUILD ^& SHORTCUT SELESAI! Siap dimainkan via Shortcut Desktop atau:
    echo   %CD%\dist\CapLab13Native.exe
    echo ============================================================================
) else (
    echo ============================================================================
    echo   [ERROR] Build berhenti dengan kode %EXIT_CODE%. Periksa log di atas.
    echo ============================================================================
)
echo.
pause
exit /b %EXIT_CODE%
