$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host " CapLab 13 Native Engine - Windows 11 (x64) PowerShell Build Pipeline" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan

function Find-VsDevCmd {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($installPath) {
            $devCmd = Join-Path $installPath "Common7\Tools\VsDevCmd.bat"
            if (Test-Path $devCmd) { return $devCmd }
        }
    }
    return $null
}

$hasCmake = [bool](Get-Command cmake -ErrorAction SilentlyContinue)
$hasCl = [bool](Get-Command cl.exe -ErrorAction SilentlyContinue)
$hasClang = [bool](Get-Command clang++ -ErrorAction SilentlyContinue)

if (-not $hasCl -and -not $hasClang) {
    $vsDevCmd = Find-VsDevCmd
    if ($vsDevCmd) {
        Write-Host "[Init] Loading Visual Studio x64 Toolchain Environment..." -ForegroundColor Yellow
        $envVars = cmd /c "`"$vsDevCmd`" -arch=amd64 -no_logo && set"
        foreach ($line in $envVars) {
            if ($line -match "^([^=]+)=(.*)$") {
                [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
            }
        }
    }
}

if ($hasCmake -or (Get-Command cmake -ErrorAction SilentlyContinue)) {
    Write-Host "[1/4] Configuring CMake Release Build..." -ForegroundColor Green
    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
    Write-Host "[2/4] Compiling Native Engine, Tests, and Game Executable..." -ForegroundColor Green
    cmake --build build --config Release --parallel
    Write-Host "[3/4] Executing Native C++23 Parity & Performance Benchmark Suite..." -ForegroundColor Green
    ctest --test-dir build -C Release --output-on-failure

    New-Item -ItemType Directory -Force -Path dist | Out-Null
    $exeCandidates = @("build\Release\CapLab13Native.exe", "build\CapLab13Native.exe")
    foreach ($candidate in $exeCandidates) {
        if (Test-Path $candidate) {
            Copy-Item $candidate "dist\CapLab13Native.exe" -Force
            break
        }
    }
    Write-Host "[4/4] DONE -> $((Resolve-Path 'dist\CapLab13Native.exe').Path)" -ForegroundColor Cyan
} else {
    $agentScript = Join-Path $PSScriptRoot "custom_setup_agent\SetupAgent.ps1"
    if (Test-Path $agentScript) {
        Write-Host "CMake not found in PATH; delegating to custom_setup_agent\SetupAgent.ps1..." -ForegroundColor Yellow
        & powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $agentScript -ProjectRoot $PSScriptRoot
        exit $LASTEXITCODE
    }
    Write-Host "CMake not found in PATH; delegating to build_windows11.bat..." -ForegroundColor Yellow
    cmd /c build_windows11.bat
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
