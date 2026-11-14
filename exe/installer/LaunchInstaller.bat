@echo off
setlocal
title CapLab 13 Native  ^|  Setup Launcher [Administrator]
color 0B

for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
if "%PROJECT_ROOT:~-1%"=="\" if not "%PROJECT_ROOT:~1,2%"==":\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
cd /d "%PROJECT_ROOT%"

if not exist "%PROJECT_ROOT%\build_native" mkdir "%PROJECT_ROOT%\build_native" >nul 2>&1
set "BOOT_LOG=%PROJECT_ROOT%\build_native\launcher_boot.log"
set "GUI_ERR_LOG=%PROJECT_ROOT%\build_native\gui_error.log"
set "GUI_EXC_LOG=%PROJECT_ROOT%\build_native\gui_exception.log"

echo [%DATE% %TIME%] Launcher started. Root="%PROJECT_ROOT%" > "%BOOT_LOG%"

where powershell.exe >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto :no_powershell

net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto :elevate_uac

echo.
echo   CapLab 13 Native  ^|  Windows 11 Setup ^& Build Agent
echo   -------------------------------------------------------------------------
echo   [Preflight] Clearing Windows Zone.Identifier download flags...
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath $env:PROJECT_ROOT -Include *.ps1,*.bat,*.exe -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\(\.toolchain|build_native|dist)\\' } | ForEach-Object { try { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue } catch {} }" >nul 2>&1

set "GUI_SCRIPT=%PROJECT_ROOT%\installer\InstallerGui.ps1"
if not exist "%GUI_SCRIPT%" goto :missing_gui

:run_gui
if exist "%GUI_ERR_LOG%" del /f /q "%GUI_ERR_LOG%" >nul 2>&1
if exist "%GUI_EXC_LOG%" del /f /q "%GUI_EXC_LOG%" >nul 2>&1
echo   [GUI]       Launching Interactive Setup Wizard...
powershell -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%GUI_SCRIPT%" -ProjectRoot "%PROJECT_ROOT%" 2>"%GUI_ERR_LOG%"
set "GUI_EXIT=%ERRORLEVEL%"
echo [%DATE% %TIME%] InstallerGui.ps1 exited with code %GUI_EXIT% >> "%BOOT_LOG%"
if "%GUI_EXIT%"=="0" exit /b 0

echo.
echo   [Warn] GUI Wizard exited unexpectedly (code %GUI_EXIT%).
if exist "%GUI_EXC_LOG%" (
    for %%A in ("%GUI_EXC_LOG%") do if %%~zA GTR 0 (
        echo   --- GUI Exception Detail ---
        type "%GUI_EXC_LOG%"
        type "%GUI_EXC_LOG%" >> "%BOOT_LOG%"
        echo.
        echo   ----------------------------
    )
)
if exist "%GUI_ERR_LOG%" (
    for %%A in ("%GUI_ERR_LOG%") do if %%~zA GTR 0 (
        echo   --- PowerShell Stderr ---
        type "%GUI_ERR_LOG%"
        type "%GUI_ERR_LOG%" >> "%BOOT_LOG%"
        echo.
        echo   -------------------------
    )
)
echo   [Fallback]  Switching cleanly to CLI Setup Agent pipeline...
echo.
goto :cli_fallback

:missing_gui
echo   [Warn]      installer\InstallerGui.ps1 missing. Switching to CLI pipeline...
goto :cli_fallback

:cli_fallback
set "PIPELINE_BAT=%PROJECT_ROOT%\builder\build_pipeline.bat"
if not exist "%PIPELINE_BAT%" goto :missing_all
call "%PIPELINE_BAT%"
set "PIPE_EXIT=%ERRORLEVEL%"
echo [%DATE% %TIME%] build_pipeline.bat exited with code %PIPE_EXIT% >> "%BOOT_LOG%"
if not "%PIPE_EXIT%"=="0" (
    echo.
    echo   [ERROR] CLI pipeline exited with code %PIPE_EXIT%.
    echo   [Log]   Check "%BOOT_LOG%"
    pause
)
exit /b %PIPE_EXIT%

:elevate_uac
echo [Elevation] Requesting Administrator permission for CapLab 13 Setup...
set "SELF_BAT=%~f0"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$q=[char]34; Start-Process -FilePath $env:ComSpec -ArgumentList '/c', ($q + $q + $env:SELF_BAT + $q + $q) -Verb RunAs"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] UAC Administrator elevation failed or was declined.
    echo [Hint]  Right-click game.exe and choose "Run as administrator".
    echo [%DATE% %TIME%] UAC elevation failed >> "%BOOT_LOG%"
    pause
    exit /b 1
)
exit /b 0

:no_powershell
echo [ERROR] powershell.exe not found on Windows PATH.
echo [ERROR] powershell.exe not found in PATH >> "%BOOT_LOG%"
pause
exit /b 1

:missing_all
echo [ERROR] Missing InstallerGui.ps1 and builder\build_pipeline.bat.
echo [Hint]  Extract the full ZIP archive to a folder before running game.exe.
pause
exit /b 2
