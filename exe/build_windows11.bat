@echo off
setlocal enabledelayedexpansion

echo ============================================================================
echo  CapLab 13 Native Engine - Windows 11 (x64) Direct Build Script
echo  Zero Third-Party Dependencies - C++23 + D3D11 + Direct2D 1.1 + DirectWrite
echo ============================================================================
echo.

cd /d "%~dp0"

where cmake >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [1/4] Configuring CMake Release build...
    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
    if %ERRORLEVEL% NEQ 0 goto :error

    echo [2/4] Building CapLab13Native.exe and CapLab13Tests.exe...
    cmake --build build --config Release --parallel
    if %ERRORLEVEL% NEQ 0 goto :error

    echo [3/4] Running Native C++23 Parity ^& 120-Month Benchmark Tests...
    ctest --test-dir build -C Release --output-on-failure
    if %ERRORLEVEL% NEQ 0 goto :error

    echo [4/4] Staging CapLab13Native.exe in .\dist\CapLab13Native.exe...
    if not exist dist mkdir dist
    if exist build\Release\CapLab13Native.exe (
        copy /y build\Release\CapLab13Native.exe dist\CapLab13Native.exe >nul
    ) else if exist build\CapLab13Native.exe (
        copy /y build\CapLab13Native.exe dist\CapLab13Native.exe >nul
    )
    echo.
    echo BUILD SUCCEEDED: .\dist\CapLab13Native.exe
    exit /b 0
)

where cl.exe >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [1/3] Compiling Win32 Resources...
    if not exist build_cl mkdir build_cl
    if not exist dist mkdir dist
    rc.exe /nologo /fo build_cl\resource.res resources\resource.rc
    if %ERRORLEVEL% NEQ 0 goto :error

    echo [2/3] Compiling and Running Native Parity Tests...
    cl.exe /nologo /std:c++23 /O2 /Oi /Ot /utf-8 /EHsc ^
      /DWIN32_LEAN_AND_MEAN /DNOMINMAX /DUNICODE /D_UNICODE /D_WIN32_WINNT=0x0A00 ^
      /Isrc /Febuild_cl\CapLab13Tests.exe ^
      tests\NativeParityTests.cpp ^
      src\core\JsonSerializer.cpp ^
      src\engine\ProductsData.cpp ^
      src\engine\SpatialGrid.cpp ^
      src\engine\DemandMacro.cpp ^
      src\engine\FacilityUnits.cpp ^
      src\engine\SaveSystem.cpp ^
      src\engine\EconomyEngine.cpp ^
      src\engine\StockMarket.cpp ^
      src\engine\AICompetitor.cpp ^
      src\engine\SimulationWorker.cpp
    if %ERRORLEVEL% NEQ 0 goto :agent_fallback
    build_cl\CapLab13Tests.exe
    if %ERRORLEVEL% NEQ 0 goto :agent_fallback

    echo [3/3] Compiling CapLab13Native.exe with LTCG...
    cl.exe /nologo /std:c++23 /O2 /Oi /Ot /GL /utf-8 /EHsc ^
      /DWIN32_LEAN_AND_MEAN /DNOMINMAX /DUNICODE /D_UNICODE /D_WIN32_WINNT=0x0A00 ^
      /Isrc /Fedist\CapLab13Native.exe ^
      src\main.cpp ^
      src\platform\Win32Hardware.cpp ^
      src\graphics\D2DRenderer.cpp ^
      src\renderer\IsometricEngine.cpp ^
      src\ui\UIWidgets.cpp ^
      src\ui\GameApp.cpp ^
      src\core\JsonSerializer.cpp ^
      src\engine\ProductsData.cpp ^
      src\engine\SpatialGrid.cpp ^
      src\engine\DemandMacro.cpp ^
      src\engine\FacilityUnits.cpp ^
      src\engine\SaveSystem.cpp ^
      src\engine\EconomyEngine.cpp ^
      src\engine\StockMarket.cpp ^
      src\engine\AICompetitor.cpp ^
      src\engine\SimulationWorker.cpp ^
      build_cl\resource.res ^
      /link /LTCG /MANIFEST:NO /SUBSYSTEM:WINDOWS ^
      user32.lib gdi32.lib d3d11.lib dxgi.lib d2d1.lib dwrite.lib dwmapi.lib ^
      shcore.lib shell32.lib ole32.lib comdlg32.lib winmm.lib avrt.lib
    if %ERRORLEVEL% NEQ 0 goto :agent_fallback

    echo.
    echo BUILD SUCCEEDED: .\dist\CapLab13Native.exe
    exit /b 0
)

:agent_fallback
if exist "%~dp0custom_setup_agent\SetupAgent.ps1" (
    echo [SetupAgent] Mengaktifkan autonomous self-repair agent...
    powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0custom_setup_agent\SetupAgent.ps1" -ProjectRoot "%CD%"
    exit /b %ERRORLEVEL%
)

echo ERROR: Neither CMake nor MSVC Developer Prompt (cl.exe) was found in PATH.
echo Please open "x64 Native Tools Command Prompt for VS 2022" or run custom_setup_agent\SetupAgent.ps1.
:error
exit /b 1
