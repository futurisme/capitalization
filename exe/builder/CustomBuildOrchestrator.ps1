param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$ToolchainDir = Join-Path $ProjectRoot ".toolchain"
$BuildDir     = Join-Path $ProjectRoot "build_native"
$ObjDir       = Join-Path $BuildDir "obj"
$DistDir      = Join-Path $ProjectRoot "dist"
$TargetExe    = Join-Path $DistDir "CapLab13Native.exe"
$TestExe      = Join-Path $BuildDir "CapLab13Tests.exe"

New-Item -ItemType Directory -Force -Path $BuildDir, $ObjDir, $DistDir | Out-Null

function Find-MsvcEnv {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($installPath) {
            $devCmd = Join-Path $installPath "Common7\Tools\VsDevCmd.bat"
            if (Test-Path $devCmd) {
                $envVars = cmd /c "`"$devCmd`" -arch=amd64 -no_logo && set"
                foreach ($line in $envVars) {
                    if ($line -match "^([^=]+)=(.*)$") {
                        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
                    }
                }
                return (Get-Command cl.exe -ErrorAction SilentlyContinue) -ne $null
            }
        }
    }
    return $false
}

function Find-LocalOrPathLlvm {
    if (Test-Path $ToolchainDir) {
        $clangCandidate = Get-ChildItem -Path $ToolchainDir -Filter "clang++.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($clangCandidate) {
            $binDir = $clangCandidate.Directory.FullName
            $env:PATH = "$binDir;$env:PATH"
            return $true
        }
    }
    if (Get-Command clang++.exe -ErrorAction SilentlyContinue) { return $true }
    if (Get-Command g++.exe -ErrorAction SilentlyContinue) { return $true }
    return $false
}

function Install-PortableLlvmToolchain {
    Write-Host "  [Download] Mengambil rilis portabel LLVM-MinGW (C++23 + Win11 SDK headers/libs)..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $ToolchainDir | Out-Null

    try {
        $headers = @{ "User-Agent" = "CapLab13-CustomBuilder" }
        $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/mstorsjo/llvm-mingw/releases/latest" -Headers $headers -TimeoutSec 30
        $asset = $rel.assets | Where-Object { $_.name -match "ucrt-x86_64\.zip$" } | Select-Object -First 1
        if (-not $asset) {
            throw "Aset ucrt-x86_64.zip tidak ditemukan pada rilis LLVM-MinGW."
        }
        $zipPath = Join-Path $ToolchainDir $asset.name
        Write-Host "  [Download] $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB)..." -ForegroundColor Cyan
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "CapLab13-CustomBuilder")
        $wc.DownloadFile($asset.browser_download_url, $zipPath)

        Write-Host "  [Extract] Mengekstrak toolchain ke .toolchain\ ..." -ForegroundColor Cyan
        Expand-Archive -Path $zipPath -DestinationPath $ToolchainDir -Force
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

        if (Find-LocalOrPathLlvm) {
            Write-Host "  [OK] Toolchain C++23 portabel siap digunakan." -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "  [Warn] Unduhan langsung gagal ($($_.Exception.Message)). Mencoba winget..." -ForegroundColor DarkYellow
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            & winget install -e --id MartinStorsjo.LLVM-MinGW.UCRT --silent --accept-package-agreements --accept-source-agreements
            $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
            $userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
            $env:PATH = "$machinePath;$userPath;$env:PATH"
            if (Find-LocalOrPathLlvm) { return $true }
        }
    }
    return $false
}

function Test-CompilerSmoke {
    param([string]$Mode, [string]$CompilerExe)

    $smokeSrc = Join-Path $BuildDir "__agent_smoke.cpp"
    $smokeExe = Join-Path $BuildDir "__agent_smoke.exe"
    $code = @"
#include <iostream>
#include <vector>
int main() {
    std::vector<int> v{1, 2, 3};
    int sum = 0;
    for (int x : v) sum += x;
    std::cout << sum << std::endl;
    return (sum == 6) ? 0 : 1;
}
"@
    Set-Content -Path $smokeSrc -Value $code -Encoding UTF8

    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if ($Mode -eq "MSVC") {
            & cl.exe /nologo /std:c++23 /O2 /EHsc /Fe:$smokeExe $smokeSrc *> $null
        } elseif ($Mode -eq "CLANG") {
            & $CompilerExe -std=c++23 -O2 -march=x86-64 -static -o $smokeExe $smokeSrc *> $null
        } else {
            & $CompilerExe -std=c++23 -O2 -march=x86-64 -static-libgcc -static-libstdc++ -o $smokeExe $smokeSrc *> $null
        }
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $smokeExe)) {
            return $false
        }
        & $smokeExe *> $null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $prevPref
        Remove-Item $smokeSrc, $smokeExe -Force -ErrorAction SilentlyContinue
    }
}

# ============================================================================
# STEP 1: CHECK & VERIFY / PROVISION TOOLS
# ============================================================================
Write-Host "[1/3] Memeriksa ketersediaan & integritas toolchain C++23 & Windows 11 SDK..." -ForegroundColor Cyan

$ToolMode = $null
if ((Get-Command cl.exe -ErrorAction SilentlyContinue) -or (Find-MsvcEnv)) {
    if (Test-CompilerSmoke -Mode "MSVC" -CompilerExe "cl.exe") {
        $ToolMode = "MSVC"
        Write-Host "  [Found] Microsoft Visual C++ (cl.exe) terverifikasi." -ForegroundColor Green
    } else {
        Write-Host "  [Warn] cl.exe terdeteksi namun smoke test gagal; memeriksa LLVM-MinGW..." -ForegroundColor Yellow
    }
}

if (-not $ToolMode -and (Find-LocalOrPathLlvm)) {
    $candidateMode = if (Get-Command clang++.exe -ErrorAction SilentlyContinue) { "CLANG" } else { "GCC" }
    $candidateExe = if ($candidateMode -eq "CLANG") { "clang++.exe" } else { "g++.exe" }
    if (Test-CompilerSmoke -Mode $candidateMode -CompilerExe $candidateExe) {
        $ToolMode = $candidateMode
        Write-Host "  [Found] Toolchain C++23 ($ToolMode) lolos smoke verification." -ForegroundColor Green
    } else {
        Write-Host "  [Repair] Toolchain lokal tidak lolos smoke test; membersihkan .toolchain\ dan mengunduh ulang..." -ForegroundColor Yellow
        if (Test-Path $ToolchainDir) {
            Remove-Item -Path $ToolchainDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

if (-not $ToolMode) {
    Write-Host "  [Missing] Menginstal toolchain C++23 portabel (LLVM-MinGW)..." -ForegroundColor Yellow
    if (-not (Install-PortableLlvmToolchain)) {
        throw "Gagal mengunduh toolchain C++23 otomatis. Periksa koneksi internet Anda lalu coba kembali."
    }
    $ToolMode = if (Get-Command clang++.exe -ErrorAction SilentlyContinue) { "CLANG" } else { "GCC" }
    $candidateExe = if ($ToolMode -eq "CLANG") { "clang++.exe" } else { "g++.exe" }
    if (-not (Test-CompilerSmoke -Mode $ToolMode -CompilerExe $candidateExe)) {
        throw "Toolchain $ToolMode terpasang namun gagal menjalankan smoke test C++23."
    }
}

# ============================================================================
# STEP 2: CUSTOM IN-HOUSE PARALLEL BUILD & PARITY VERIFICATION
# ============================================================================
Write-Host ""
Write-Host "[2/3] Membangun CapLab13Native.exe secara paralel ($ToolMode, $([Environment]::ProcessorCount) thread)..." -ForegroundColor Cyan

# Universal baseline x86-64 SSE2 ensures 100% compatibility across all Windows 11 x64 CPUs (zero 0xC000001D AVX2 crashes)
$UseBaselineX64 = $true
$ExtraLinkFlags = if ($env:CAPLAB_EXTRA_LINK_FLAGS) {
    [string[]]($env:CAPLAB_EXTRA_LINK_FLAGS -split ";" | Where-Object { $_ -ne "" })
} else {
    [string[]]@()
}
$DynamicFallback = ($env:CAPLAB_DYNAMIC_STDLIB_FALLBACK -eq "1")

$FingerprintFile = Join-Path $BuildDir ".build_fingerprint"
$CurrentFingerprint = "$ToolMode|baseline=$UseBaselineX64|dyn=$DynamicFallback"
$PreviousFingerprint = if (Test-Path $FingerprintFile) { (Get-Content $FingerprintFile -Raw -ErrorAction SilentlyContinue).Trim() } else { "" }
if ($PreviousFingerprint -ne $CurrentFingerprint) {
    Remove-Item -Path (Join-Path $ObjDir "*") -Force -Recurse -ErrorAction SilentlyContinue
    Set-Content -Path $FingerprintFile -Value $CurrentFingerprint -Encoding UTF8
}

$EngineSources = @(
    "src\core\JsonSerializer.cpp",
    "src\engine\ProductsData.cpp",
    "src\engine\SpatialGrid.cpp",
    "src\engine\DemandMacro.cpp",
    "src\engine\FacilityUnits.cpp",
    "src\engine\SaveSystem.cpp",
    "src\engine\EconomyEngine.cpp",
    "src\engine\StockMarket.cpp",
    "src\engine\AICompetitor.cpp",
    "src\engine\SimulationWorker.cpp"
)

$AppSources = @(
    "src\main.cpp",
    "src\platform\Win32Hardware.cpp",
    "src\graphics\D2DRenderer.cpp",
    "src\renderer\IsometricEngine.cpp",
    "src\ui\UIWidgets.cpp",
    "src\ui\GameApp.cpp"
)

$AllSources = $EngineSources + $AppSources
$CommonDefines = @("WIN32_LEAN_AND_MEAN", "NOMINMAX", "UNICODE", "_UNICODE", "_WIN32_WINNT=0x0A00", "NTDDI_VERSION=0x0A000010")
$WinLibs = @("user32", "gdi32", "d3d11", "dxgi", "d2d1", "dwrite", "dwmapi", "shcore", "shell32", "ole32", "comdlg32", "winmm", "avrt", "uuid", "dxguid")

function Invoke-ParallelCompile {
    param([string[]]$Sources, [string]$CompilerExe, [string[]]$BaseFlags, [bool]$IsMsvc)

    $MaxWorkers = [Math]::Max(2, [Environment]::ProcessorCount)
    $Pool = [RunspaceFactory]::CreateRunspacePool(1, $MaxWorkers)
    $Pool.Open()

    $Jobs = @()
    foreach ($rel in $Sources) {
        $srcPath = Join-Path $ProjectRoot $rel
        $objName = ($rel -replace '[\\/.]', '_') + $(if ($IsMsvc) { ".obj" } else { ".o" })
        $objPath = Join-Path $ObjDir $objName

        $ps = [PowerShell]::Create()
        $ps.RunspacePool = $Pool
        [void]$ps.AddScript({
            param($Compiler, $Flags, $Src, $Obj, $Msvc)
            $ErrorActionPreference = "Continue"
            $argsList = @() + $Flags
            if ($Msvc) {
                $argsList += @("/c", $Src, "/Fo$Obj")
            } else {
                $argsList += @("-c", $Src, "-o", $Obj)
            }
            $output = & $Compiler @argsList 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0) {
                throw "Kompilasi gagal ($LASTEXITCODE): $Src`n$output"
            }
            return $Obj
        }).AddArgument($CompilerExe).AddArgument($BaseFlags).AddArgument($srcPath).AddArgument($objPath).AddArgument($IsMsvc)

        $Jobs += [PSCustomObject]@{
            Rel    = $rel
            Obj    = $objPath
            PS     = $ps
            Handle = $ps.BeginInvoke()
        }
    }

    [string[]]$CompiledObjs = @()
    try {
        foreach ($job in $Jobs) {
            try {
                [void]$job.PS.EndInvoke($job.Handle)
                Write-Host "  [CC] $($job.Rel)" -ForegroundColor DarkGray
                $CompiledObjs += [string]$job.Obj
            } finally {
                $job.PS.Dispose()
            }
        }
    } finally {
        $Pool.Close()
        $Pool.Dispose()
    }
    return ,$CompiledObjs
}

function Write-LinkResponseFile {
    param([string]$RspPath, [string[]]$ArgsList)
    $formatted = $ArgsList | ForEach-Object {
        if ($_ -match '[\s"]') {
            '"' + ($_ -replace '\\', '/' -replace '"', '\"') + '"'
        } else {
            ($_ -replace '\\', '/')
        }
    }
    [System.IO.File]::WriteAllLines($RspPath, $formatted, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-CleanNativeStep {
    param([string]$ToolExe, [string[]]$ToolArgs)
    $raw = & $ToolExe @ToolArgs 2>&1
    $code = $LASTEXITCODE
    foreach ($item in $raw) {
        if ($item -is [System.Management.Automation.ErrorRecord]) {
            Write-Host $item.ToString()
        } else {
            Write-Host $item
        }
    }
    return $code
}

$prevErrorPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"

try {
    if ($ToolMode -eq "MSVC") {
        $resOut = Join-Path $ObjDir "resource.res"
        if ((Invoke-CleanNativeStep "rc.exe" @("/nologo", "/i", (Join-Path $ProjectRoot "resources"), "/fo", $resOut, (Join-Path $ProjectRoot "resources\resource.rc"))) -ne 0) {
            throw "rc.exe gagal mengompilasi resource.rc"
        }

        [string[]]$cflags = @("/nologo", "/std:c++23", "/O2", "/Oi", "/Ot", "/utf-8", "/EHsc", "/I", (Join-Path $ProjectRoot "src"))
        foreach ($d in $CommonDefines) { $cflags += "/D$d" }

        [string[]]$AllObjs = Invoke-ParallelCompile -Sources $AllSources -CompilerExe "cl.exe" -BaseFlags $cflags -IsMsvc $true
        [string[]]$EngineObjs = $AllObjs[0..($EngineSources.Count - 1)]

        $testObj = Join-Path $ObjDir "tests_NativeParityTests_cpp.obj"
        if ((Invoke-CleanNativeStep "cl.exe" ($cflags + @("/c", (Join-Path $ProjectRoot "tests\NativeParityTests.cpp"), "/Fo$testObj"))) -ne 0) {
            throw "Kompilasi tes gagal"
        }

        if ((Invoke-CleanNativeStep "link.exe" (@("/nologo", "/OUT:$TestExe", $testObj) + $EngineObjs)) -ne 0) {
            throw "Linking CapLab13Tests.exe gagal"
        }

        [string[]]$libArgs = @($WinLibs | ForEach-Object { "$_.lib" })
        if ((Invoke-CleanNativeStep "link.exe" (@("/nologo", "/MANIFEST:NO", "/SUBSYSTEM:WINDOWS", "/OUT:$TargetExe") + $AllObjs + @($resOut) + $libArgs)) -ne 0) {
            throw "Linking CapLab13Native.exe gagal"
        }
    } else {
        $cxx = if ($ToolMode -eq "CLANG") { "clang++.exe" } else { "g++.exe" }
        $windres = if (Get-Command llvm-windres.exe -ErrorAction SilentlyContinue) { "llvm-windres.exe" } else { "windres.exe" }
        $resOut = Join-Path $ObjDir "resource.res.o"
        if ((Invoke-CleanNativeStep $windres @("-I", (Join-Path $ProjectRoot "resources"), (Join-Path $ProjectRoot "resources\resource.rc"), "-O", "coff", "-o", $resOut)) -ne 0) {
            throw "$windres gagal mengompilasi resource.rc"
        }

        $marchFlag = "-march=x86-64"
        [string[]]$cflags = @("-std=c++23", "-O3", $marchFlag, "-mtune=generic", "-I", (Join-Path $ProjectRoot "src"))
        foreach ($d in $CommonDefines) { $cflags += "-D$d" }

        [string[]]$AllObjs = Invoke-ParallelCompile -Sources $AllSources -CompilerExe $cxx -BaseFlags $cflags -IsMsvc $false
        [string[]]$EngineObjs = $AllObjs[0..($EngineSources.Count - 1)]

        $testObj = Join-Path $ObjDir "tests_NativeParityTests_cpp.o"
        if ((Invoke-CleanNativeStep $cxx ($cflags + @("-c", (Join-Path $ProjectRoot "tests\NativeParityTests.cpp"), "-o", $testObj))) -ne 0) {
            throw "Kompilasi tes gagal"
        }

        [string[]]$staticFlags = if ($DynamicFallback) {
            [string[]]@()
        } elseif ($ToolMode -eq "CLANG") {
            [string[]]@("-static")
        } else {
            [string[]]@("-static-libgcc", "-static-libstdc++")
        }

        $testRsp = Join-Path $BuildDir "link_tests.rsp"
        [string[]]$testLinkArgs = @("-O3") + $staticFlags + $ExtraLinkFlags + @("-o", $TestExe, $testObj) + $EngineObjs
        Write-LinkResponseFile -RspPath $testRsp -ArgsList $testLinkArgs
        if ((Invoke-CleanNativeStep $cxx @("@$testRsp")) -ne 0) {
            throw "Linking CapLab13Tests.exe gagal"
        }

        [string[]]$libArgs = @($WinLibs | ForEach-Object { "-l$_" })
        $nativeRsp = Join-Path $BuildDir "link_native.rsp"
        [string[]]$nativeLinkArgs = @("-O3", "-mwindows", "-municode") + $staticFlags + $ExtraLinkFlags + @("-o", $TargetExe) + $AllObjs + @($resOut) + $libArgs
        Write-LinkResponseFile -RspPath $nativeRsp -ArgsList $nativeLinkArgs
        if ((Invoke-CleanNativeStep $cxx @("@$nativeRsp")) -ne 0) {
            throw "Linking CapLab13Native.exe gagal"
        }
    }

    if ($env:CAPLAB_RUN_TESTS -ne "0") {
        Write-Host "  [Test] Menjalankan CapLab13Tests.exe..." -ForegroundColor Cyan
        & $TestExe
        $testExit = $LASTEXITCODE
        if ($testExit -ne 0) {
            throw ("Parity tests gagal! (ExitCode={0} / 0x{1:X8})" -f $testExit, ([uint32]([int64]$testExit -band 0xFFFFFFFF)))
        }
    } else {
        Write-Host "  [Test] Verifikasi parity dilewati sesuai opsi installer." -ForegroundColor DarkYellow
    }
} finally {
    $ErrorActionPreference = $prevErrorPref
}

# ============================================================================
# STEP 3: FAST & CLEAN SHORTCUT CREATION
# ============================================================================
Write-Host ""
if ($env:CAPLAB_CREATE_SHORTCUTS -eq "0") {
    Write-Host "[3/3] Pembuatan shortcut dilewati sesuai opsi installer." -ForegroundColor DarkYellow
} else {
    Write-Host "[3/3] Membuat shortcut Desktop & Start Menu secara cepat..." -ForegroundColor Cyan

    try {
        $Shell = New-Object -ComObject WScript.Shell
        $DesktopDir   = [Environment]::GetFolderPath("Desktop")
        $StartMenuDir = [Environment]::GetFolderPath("Programs")

        $ShortcutTargets = @(
            (Join-Path $DesktopDir "CapLab 13 Native.lnk"),
            (Join-Path $StartMenuDir "CapLab 13 Native.lnk")
        )

        foreach ($lnkPath in $ShortcutTargets) {
            if (-not $lnkPath) { continue }
            $sc = $Shell.CreateShortcut($lnkPath)
            $sc.TargetPath       = $TargetExe
            $sc.WorkingDirectory = $DistDir
            $sc.IconLocation     = "$TargetExe,0"
            $sc.Description      = "CapLab 13 - Simulasi Ekonomi & Konglomerasi 2.5D (Windows 11 Native)"
            $sc.Save()
            Write-Host "  [Shortcut] $lnkPath" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [Warn] Shortcut creation skipped ($($_.Exception.Message)); executable tetap siap di $TargetExe" -ForegroundColor DarkYellow
    }
}

$Stopwatch.Stop()
$SizeMB = [math]::Round((Get-Item $TargetExe).Length / 1MB, 2)
Write-Host ""
Write-Host "[Done] Selesai dalam $([math]::Round($Stopwatch.Elapsed.TotalSeconds, 1)) detik | Binary: $TargetExe ($SizeMB MB)" -ForegroundColor Cyan
