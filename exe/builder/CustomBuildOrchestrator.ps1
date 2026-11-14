param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [ValidateSet("All", "Game", "Tests")]
    [string]$Target = "All",
    [switch]$Clean,
    [switch]$VerboseTests
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot
try {
    $secProto = [Net.SecurityProtocolType]::Tls12
    if ([Enum]::GetNames([Net.SecurityProtocolType]) -contains 'Tls13') {
        $secProto = $secProto -bor [Net.SecurityProtocolType]::Tls13
    }
    [Net.ServicePointManager]::SecurityProtocol = $secProto
} catch {}

$Stopwatch    = [System.Diagnostics.Stopwatch]::StartNew()
$ToolchainDir = Join-Path $ProjectRoot ".toolchain"
$BuildDir     = Join-Path $ProjectRoot "build_native"
$ObjDir       = Join-Path $BuildDir "obj"
$DistDir      = Join-Path $ProjectRoot "dist"
$TargetExe    = Join-Path $DistDir "CapLab13Native.exe"
$TestExe      = Join-Path $BuildDir "CapLab13Tests.exe"
$SmokeCache   = Join-Path $BuildDir ".smoke_verified"
$ParityLog    = Join-Path $BuildDir "parity_last.log"

New-Item -ItemType Directory -Force -Path $BuildDir, $ObjDir, $DistDir | Out-Null

function Write-StageRow {
    param(
        [string]$Tag,
        [string]$Text,
        [string]$Color = "Gray"
    )
    Write-Host ("  {0,-15} | {1}" -f $Tag, $Text) -ForegroundColor $Color
}

function Add-PathFront {
    param([string]$Dir)
    if (-not $Dir -or -not (Test-Path $Dir)) { return }
    $norm = [System.IO.Path]::GetFullPath($Dir).TrimEnd('\', '/')
    $parts = @($env:PATH -split ';' | Where-Object { $_ -ne '' })
    if (-not ($parts | Where-Object { $_.TrimEnd('\', '/').Equals($norm, [System.StringComparison]::OrdinalIgnoreCase) })) {
        $env:PATH = "$norm;$env:PATH"
    }
}

function Find-MsvcEnv {
    if (Get-Command cl.exe -ErrorAction SilentlyContinue) {
        return $true
    }

    $vswhereCandidates = @(
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\Installer\vswhere.exe"
    )
    foreach ($vswhere in $vswhereCandidates) {
        if (-not (Test-Path $vswhere)) { continue }
        $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        if ($installPath) {
            $devCmd = Join-Path $installPath "Common7\Tools\VsDevCmd.bat"
            if (Test-Path $devCmd) {
                $envVars = cmd /c "`"$devCmd`" -arch=amd64 -no_logo && set"
                foreach ($line in $envVars) {
                    if ($line -match "^([^=]+)=(.*)$") {
                        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
                    }
                }
                if (Get-Command cl.exe -ErrorAction SilentlyContinue) { return $true }
            }
        }
    }

    $vsRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ } | ForEach-Object { Join-Path $_ "Microsoft Visual Studio" }
    foreach ($vr in $vsRoots) {
        if (-not (Test-Path $vr)) { continue }
        $vcvars = Get-ChildItem -Path $vr -Filter "vcvars64.bat" -Recurse -Depth 5 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($vcvars) {
            $envVars = cmd /c "`"$($vcvars.FullName)`" && set"
            foreach ($line in $envVars) {
                if ($line -match "^([^=]+)=(.*)$") {
                    [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
                }
            }
            if (Get-Command cl.exe -ErrorAction SilentlyContinue) { return $true }
        }
    }
    return $false
}

function Find-LocalOrPathLlvm {
    if (Test-Path $ToolchainDir) {
        $clangLocal = Get-ChildItem -Path $ToolchainDir -Filter "clang++.exe" -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($clangLocal) {
            Add-PathFront $clangLocal.Directory.FullName
            return $true
        }
    }

    if ((Get-Command clang++.exe -ErrorAction SilentlyContinue) -or (Get-Command g++.exe -ErrorAction SilentlyContinue)) {
        return $true
    }

    $staticBinCandidates = @(
        "C:\msys64\clang64\bin",
        "C:\msys64\ucrt64\bin",
        "C:\msys64\mingw64\bin",
        "C:\Program Files\LLVM\bin",
        "C:\Program Files (x86)\LLVM\bin",
        "C:\mingw64\bin",
        "C:\llvm-mingw\bin",
        "$env:USERPROFILE\scoop\apps\llvm-mingw\current\bin",
        "$env:USERPROFILE\scoop\apps\mingw\current\bin",
        "$env:USERPROFILE\scoop\apps\llvm\current\bin",
        "$env:ProgramData\chocolatey\bin"
    )
    foreach ($dir in $staticBinCandidates) {
        if (-not $dir -or -not (Test-Path $dir)) { continue }
        if ((Test-Path (Join-Path $dir "clang++.exe")) -or (Test-Path (Join-Path $dir "g++.exe"))) {
            Add-PathFront $dir
            return $true
        }
    }

    $globBases = @(
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages",
        "$env:LOCALAPPDATA\Programs",
        "$env:USERPROFILE\.toolchains",
        "C:\Tools"
    )
    try {
        $drives = [System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady }
        foreach ($drv in $drives) {
            $topDirs = Get-ChildItem -Path $drv.RootDirectory.FullName -Directory -ErrorAction SilentlyContinue |
                       Where-Object { $_.Name -match 'llvm|mingw|msys|clang|toolchain|compil' }
            foreach ($td in $topDirs) { $globBases += $td.FullName }
        }
    } catch {}

    foreach ($base in ($globBases | Select-Object -Unique)) {
        if (-not $base -or -not (Test-Path $base)) { continue }
        $hit = Get-ChildItem -Path $base -Filter "clang++.exe" -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $hit) {
            $hit = Get-ChildItem -Path $base -Filter "g++.exe" -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1
        }
        if ($hit) {
            Add-PathFront $hit.Directory.FullName
            return $true
        }
    }
    return $false
}

function Install-PortableLlvmToolchain {
    Write-StageRow "[Download]" "Fetching portable LLVM-MinGW (C++23 + Win11 SDK)..." "Yellow"
    New-Item -ItemType Directory -Force -Path $ToolchainDir | Out-Null

    try {
        $headers = @{ "User-Agent" = "CapLab13-CustomBuilder" }
        $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/mstorsjo/llvm-mingw/releases/latest" -Headers $headers -TimeoutSec 30
        $asset = $rel.assets | Where-Object { $_.name -match "ucrt-x86_64\.zip$" } | Select-Object -First 1
        if (-not $asset) {
            throw "ucrt-x86_64.zip asset not found in LLVM-MinGW release."
        }
        $zipPath = Join-Path $ToolchainDir $asset.name
        Write-StageRow "[Download]" "$($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB)" "Cyan"
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "CapLab13-CustomBuilder")
        $wc.DownloadFile($asset.browser_download_url, $zipPath)

        Write-StageRow "[Extract]" "Unpacking portable toolchain into .toolchain\..." "Cyan"
        Expand-Archive -Path $zipPath -DestinationPath $ToolchainDir -Force
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

        if (Find-LocalOrPathLlvm) {
            Write-StageRow "[Found]" "Portable C++23 toolchain verified cleanly." "Green"
            return $true
        }
    } catch {
        Write-StageRow "[Warn]" "Direct fetch failed ($($_.Exception.Message)); trying winget..." "DarkYellow"
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

    $cmdInfo = Get-Command $CompilerExe -ErrorAction SilentlyContinue
    if (-not $cmdInfo) { return $false }

    $item = Get-Item $cmdInfo.Source -ErrorAction SilentlyContinue
    $sig = if ($item) { "$Mode|$($item.FullName)|$($item.Length)|$($item.LastWriteTimeUtc.Ticks)" } else { "$Mode|$CompilerExe" }
    if ((Test-Path $SmokeCache) -and ((Get-Content $SmokeCache -Raw -ErrorAction SilentlyContinue).Trim() -eq $sig)) {
        return $true
    }

    $smokeSrc = Join-Path $BuildDir "__agent_smoke_$PID.cpp"
    $smokeExe = Join-Path $BuildDir "__agent_smoke_$PID.exe"
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
        if ($LASTEXITCODE -eq 0) {
            Set-Content -Path $SmokeCache -Value $sig -Encoding UTF8 -ErrorAction SilentlyContinue
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $prevPref
        Remove-Item $smokeSrc, $smokeExe -Force -ErrorAction SilentlyContinue
    }
}

# ============================================================================
# STAGE 1: DEVICE-WIDE TOOL DISCOVERY & ZERO-DOWNLOAD CHECK
# ============================================================================
Write-StageRow "[1/4] Toolchain" "Probing local C++23 compiler & Windows 11 SDK..." "Cyan"

$ToolMode = $null
$ActiveCompilerPath = ""
if (Find-MsvcEnv) {
    if (Test-CompilerSmoke -Mode "MSVC" -CompilerExe "cl.exe") {
        $ToolMode = "MSVC"
        $ActiveCompilerPath = (Get-Command cl.exe).Source
        Write-StageRow "[Data-Saver]" "Reused local MSVC (0 MB downloaded): $ActiveCompilerPath" "Green"
    } else {
        Write-StageRow "[Warn]" "cl.exe detected but smoke probe failed; scanning LLVM-MinGW..." "Yellow"
    }
}

if (-not $ToolMode -and (Find-LocalOrPathLlvm)) {
    $candidateMode = if (Get-Command clang++.exe -ErrorAction SilentlyContinue) { "CLANG" } else { "GCC" }
    $candidateExe = if ($candidateMode -eq "CLANG") { "clang++.exe" } else { "g++.exe" }
    $ActiveCompilerPath = (Get-Command $candidateExe).Source
    if (Test-CompilerSmoke -Mode $candidateMode -CompilerExe $candidateExe) {
        $ToolMode = $candidateMode
        Write-StageRow "[Data-Saver]" "Reused local $ToolMode (0 MB downloaded): $ActiveCompilerPath" "Green"
        Write-StageRow "[Found]" "Toolchain C++23 ($ToolMode) lolos smoke verification." "Green"
    } else {
        Write-StageRow "[Repair]" "Local toolchain failed smoke probe; resetting .smoke_verified..." "Yellow"
        Remove-Item $SmokeCache -Force -ErrorAction SilentlyContinue
        if ($ActiveCompilerPath.StartsWith($ToolchainDir, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $ToolchainDir)) {
            Remove-Item -Path $ToolchainDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

if (-not $ToolMode) {
    Write-StageRow "[Missing]" "No local compiler found; provisioning portable LLVM-MinGW..." "Yellow"
    if (-not (Install-PortableLlvmToolchain)) {
        throw "Failed to provision C++23 toolchain automatically. Check internet connectivity and retry."
    }
    $ToolMode = if (Get-Command clang++.exe -ErrorAction SilentlyContinue) { "CLANG" } else { "GCC" }
    $candidateExe = if ($ToolMode -eq "CLANG") { "clang++.exe" } else { "g++.exe" }
    $ActiveCompilerPath = (Get-Command $candidateExe).Source
    if (-not (Test-CompilerSmoke -Mode $ToolMode -CompilerExe $candidateExe)) {
        throw "Toolchain $ToolMode installed but C++23 smoke probe failed."
    }
}

# ============================================================================
# STAGE 2: INCREMENTAL PARALLEL COMPILE & LINK (.RSP)
# ============================================================================
$Workers = [Environment]::ProcessorCount
Write-StageRow "[2/4] Compile" "Target=$Target | Mode=$ToolMode | Threads=$Workers (Baseline x86-64)" "Cyan"

$UseBaselineX64 = $true
$ExtraLinkFlags = if ($env:CAPLAB_EXTRA_LINK_FLAGS) {
    [string[]]($env:CAPLAB_EXTRA_LINK_FLAGS -split ";" | Where-Object { $_ -ne "" })
} else {
    [string[]]@()
}
$DynamicFallback = ($env:CAPLAB_DYNAMIC_STDLIB_FALLBACK -eq "1")

$FingerprintFile = Join-Path $BuildDir ".build_fingerprint"
$CurrentFingerprint = "$ToolMode|$ActiveCompilerPath|baseline=$UseBaselineX64|dyn=$DynamicFallback"
$PreviousFingerprint = if (Test-Path $FingerprintFile) { (Get-Content $FingerprintFile -Raw -ErrorAction SilentlyContinue).Trim() } else { "" }
$ForceCleanRebuild = $Clean.IsPresent -or ($PreviousFingerprint -ne $CurrentFingerprint)
if ($ForceCleanRebuild) {
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

$TestSource = "tests\NativeParityTests.cpp"
$CompileUnits = switch ($Target) {
    "Tests" { $EngineSources + @($TestSource) }
    "Game"  { $EngineSources + $AppSources }
    default { $EngineSources + $AppSources + @($TestSource) }
}
$CommonDefines = @("WIN32_LEAN_AND_MEAN", "NOMINMAX", "UNICODE", "_UNICODE", "_WIN32_WINNT=0x0A00", "NTDDI_VERSION=0x0A000010")
$WinLibs = @("user32", "gdi32", "d3d11", "dxgi", "d2d1", "dwrite", "dwmapi", "shcore", "shell32", "ole32", "comdlg32", "winmm", "avrt", "uuid", "dxguid")

$LatestHeaderUtc = [datetime]::MinValue
foreach ($hdr in (Get-ChildItem -Path (Join-Path $ProjectRoot "src") -Include "*.hpp","*.h" -Recurse -File -ErrorAction SilentlyContinue)) {
    if ($hdr.LastWriteTimeUtc -gt $LatestHeaderUtc) {
        $LatestHeaderUtc = $hdr.LastWriteTimeUtc
    }
}

function Invoke-ParallelCompile {
    param(
        [string[]]$Sources,
        [string]$CompilerExe,
        [string[]]$BaseFlags,
        [bool]$IsMsvc,
        [datetime]$HeaderCutoffUtc,
        [bool]$CleanAll
    )

    $MaxWorkers = [Math]::Max(2, [Environment]::ProcessorCount)
    $Pool = $null
    $Jobs = @()
    $CompiledMap = @{}
    $SkippedCount = 0

    foreach ($rel in $Sources) {
        $srcPath = Join-Path $ProjectRoot $rel
        $objName = ($rel -replace '[\\/.]', '_') + $(if ($IsMsvc) { ".obj" } else { ".o" })
        $objPath = Join-Path $ObjDir $objName

        $srcItem = Get-Item $srcPath -ErrorAction Stop
        $objItem = Get-Item $objPath -ErrorAction SilentlyContinue
        $newestDepUtc = if ($srcItem.LastWriteTimeUtc -gt $HeaderCutoffUtc) { $srcItem.LastWriteTimeUtc } else { $HeaderCutoffUtc }

        if (-not $CleanAll -and $objItem -and $objItem.Length -gt 0 -and $objItem.LastWriteTimeUtc -ge $newestDepUtc) {
            $CompiledMap[$rel] = [string]$objPath
            $SkippedCount++
            continue
        }

        if ($null -eq $Pool) {
            $Pool = [RunspaceFactory]::CreateRunspacePool(1, $MaxWorkers)
            $Pool.Open()
        }

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
                throw "Compile error ($LASTEXITCODE): $Src`n$output"
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

    if ($SkippedCount -gt 0) {
        Write-StageRow "[Cache]" "$SkippedCount unchanged translation unit(s) skipped (incremental build)" "DarkCyan"
    }

    if ($Jobs.Count -gt 0) {
        try {
            foreach ($job in $Jobs) {
                try {
                    [void]$job.PS.EndInvoke($job.Handle)
                    Write-StageRow "[CC]" "$($job.Rel)" "DarkGray"
                    $CompiledMap[$job.Rel] = [string]$job.Obj
                } finally {
                    $job.PS.Dispose()
                }
            }
        } finally {
            if ($Pool) {
                $Pool.Close()
                $Pool.Dispose()
            }
        }
    }

    [string[]]$OrderedObjs = foreach ($rel in $Sources) { [string]$CompiledMap[$rel] }
    return ,$OrderedObjs
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
        $text = if ($item -is [System.Management.Automation.ErrorRecord]) { $item.ToString() } else { [string]$item }
        if ($text -and $text.Trim() -ne "") {
            Write-Host "    $text"
        }
    }
    return $code
}

function Test-ResourceUpToDate {
    param([string]$ResFile, [string]$ProjectRoot)
    if ($ForceCleanRebuild -or -not (Test-Path $ResFile)) { return $false }
    $resTime = (Get-Item $ResFile).LastWriteTimeUtc
    $rcTime = (Get-Item (Join-Path $ProjectRoot "resources\resource.rc")).LastWriteTimeUtc
    $mfTime = (Get-Item (Join-Path $ProjectRoot "resources\app.manifest")).LastWriteTimeUtc
    return ($resTime -ge $rcTime -and $resTime -ge $mfTime)
}

$prevErrorPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"

try {
    $BuiltNewObj = $false
    $LinkWatch = [System.Diagnostics.Stopwatch]::StartNew()
    $buildTests = ($Target -ne "Game")
    $buildGame  = ($Target -ne "Tests")

    if ($ToolMode -eq "MSVC") {
        $resOut = Join-Path $ObjDir "resource.res"
        if ($buildGame -and (-not (Test-ResourceUpToDate -ResFile $resOut -ProjectRoot $ProjectRoot))) {
            if ((Invoke-CleanNativeStep "rc.exe" @("/nologo", "/i", (Join-Path $ProjectRoot "resources"), "/fo", $resOut, (Join-Path $ProjectRoot "resources\resource.rc"))) -ne 0) {
                throw "rc.exe failed to compile resource.rc"
            }
            $BuiltNewObj = $true
        }

        [string[]]$cflags = @("/nologo", "/std:c++23", "/O2", "/Oi", "/Ot", "/utf-8", "/EHsc", "/I", (Join-Path $ProjectRoot "src"))
        foreach ($d in $CommonDefines) { $cflags += "/D$d" }

        [string[]]$UnitObjs   = Invoke-ParallelCompile -Sources $CompileUnits -CompilerExe "cl.exe" -BaseFlags $cflags -IsMsvc $true -HeaderCutoffUtc $LatestHeaderUtc -CleanAll $ForceCleanRebuild
        [string[]]$EngineObjs = $UnitObjs[0..($EngineSources.Count - 1)]
        [string[]]$AllObjs    = if ($buildGame) { $UnitObjs[0..($EngineSources.Count + $AppSources.Count - 1)] } else { [string[]]@() }
        $testObj              = if ($buildTests) { $UnitObjs[$UnitObjs.Count - 1] } else { "" }

        if ($buildTests) {
            $testNeedLink = $ForceCleanRebuild -or -not (Test-Path $TestExe) -or ((Get-Item $testObj).LastWriteTimeUtc -gt (Get-Item $TestExe).LastWriteTimeUtc)
            if (-not $testNeedLink) {
                $tTime = (Get-Item $TestExe).LastWriteTimeUtc
                foreach ($eo in $EngineObjs) { if ((Get-Item $eo).LastWriteTimeUtc -gt $tTime) { $testNeedLink = $true; break } }
            }
            if ($testNeedLink) {
                if ((Invoke-CleanNativeStep "link.exe" (@("/nologo", "/OUT:$TestExe", $testObj) + $EngineObjs)) -ne 0) {
                    throw "Linking CapLab13Tests.exe gagal"
                }
                Write-StageRow "[LINK]" "CapLab13Tests.exe updated" "DarkGray"
            }
        }

        if ($buildGame) {
            $nativeNeedLink = $ForceCleanRebuild -or $BuiltNewObj -or -not (Test-Path $TargetExe)
            if (-not $nativeNeedLink) {
                $nTime = (Get-Item $TargetExe).LastWriteTimeUtc
                foreach ($ao in $AllObjs) { if ((Get-Item $ao).LastWriteTimeUtc -gt $nTime) { $nativeNeedLink = $true; break } }
            }
            if ($nativeNeedLink) {
                [string[]]$libArgs = @($WinLibs | ForEach-Object { "$_.lib" })
                if ((Invoke-CleanNativeStep "link.exe" (@("/nologo", "/MANIFEST:NO", "/SUBSYSTEM:WINDOWS", "/OUT:$TargetExe") + $AllObjs + @($resOut) + $libArgs)) -ne 0) {
                    throw "Linking CapLab13Native.exe gagal"
                }
                Write-StageRow "[LINK]" "CapLab13Native.exe updated" "DarkGray"
            }
        }
    } else {
        $cxx = if ($ToolMode -eq "CLANG") { "clang++.exe" } else { "g++.exe" }
        $windres = if (Get-Command llvm-windres.exe -ErrorAction SilentlyContinue) { "llvm-windres.exe" } else { "windres.exe" }
        $resOut = Join-Path $ObjDir "resource.res.o"
        if ($buildGame -and (-not (Test-ResourceUpToDate -ResFile $resOut -ProjectRoot $ProjectRoot))) {
            if ((Invoke-CleanNativeStep $windres @("-I", (Join-Path $ProjectRoot "resources"), (Join-Path $ProjectRoot "resources\resource.rc"), "-O", "coff", "-o", $resOut)) -ne 0) {
                throw "$windres failed to compile resource.rc"
            }
            $BuiltNewObj = $true
        }

        $marchFlag = "-march=x86-64"
        [string[]]$cflags = @("-std=c++23", "-O3", $marchFlag, "-mtune=generic", "-I", (Join-Path $ProjectRoot "src"))
        foreach ($d in $CommonDefines) { $cflags += "-D$d" }

        [string[]]$UnitObjs   = Invoke-ParallelCompile -Sources $CompileUnits -CompilerExe $cxx -BaseFlags $cflags -IsMsvc $false -HeaderCutoffUtc $LatestHeaderUtc -CleanAll $ForceCleanRebuild
        [string[]]$EngineObjs = $UnitObjs[0..($EngineSources.Count - 1)]
        [string[]]$AllObjs    = if ($buildGame) { $UnitObjs[0..($EngineSources.Count + $AppSources.Count - 1)] } else { [string[]]@() }
        $testObj              = if ($buildTests) { $UnitObjs[$UnitObjs.Count - 1] } else { "" }

        [string[]]$staticFlags = if ($DynamicFallback) {
            [string[]]@()
        } elseif ($ToolMode -eq "CLANG") {
            [string[]]@("-static")
        } else {
            [string[]]@("-static-libgcc", "-static-libstdc++")
        }

        if ($buildTests) {
            $testRsp = Join-Path $BuildDir "link_tests.rsp"
            $testNeedLink = $ForceCleanRebuild -or -not (Test-Path $TestExe) -or ((Get-Item $testObj).LastWriteTimeUtc -gt (Get-Item $TestExe).LastWriteTimeUtc)
            if (-not $testNeedLink) {
                $tTime = (Get-Item $TestExe).LastWriteTimeUtc
                foreach ($eo in $EngineObjs) { if ((Get-Item $eo).LastWriteTimeUtc -gt $tTime) { $testNeedLink = $true; break } }
            }
            if ($testNeedLink) {
                [string[]]$testLinkArgs = @("-O3") + $staticFlags + $ExtraLinkFlags + @("-o", $TestExe, $testObj) + $EngineObjs
                Write-LinkResponseFile -RspPath $testRsp -ArgsList $testLinkArgs
                if ((Invoke-CleanNativeStep $cxx @("@$testRsp")) -ne 0) {
                    throw "Linking CapLab13Tests.exe gagal"
                }
                Write-StageRow "[LINK]" "CapLab13Tests.exe updated (@link_tests.rsp)" "DarkGray"
            }
        }

        if ($buildGame) {
            $nativeRsp = Join-Path $BuildDir "link_native.rsp"
            $nativeNeedLink = $ForceCleanRebuild -or $BuiltNewObj -or -not (Test-Path $TargetExe)
            if (-not $nativeNeedLink) {
                $nTime = (Get-Item $TargetExe).LastWriteTimeUtc
                foreach ($ao in $AllObjs) { if ((Get-Item $ao).LastWriteTimeUtc -gt $nTime) { $nativeNeedLink = $true; break } }
            }
            if ($nativeNeedLink) {
                [string[]]$libArgs = @($WinLibs | ForEach-Object { "-l$_" })
                [string[]]$nativeLinkArgs = @("-O3", "-mwindows", "-municode") + $staticFlags + $ExtraLinkFlags + @("-o", $TargetExe) + $AllObjs + @($resOut) + $libArgs
                Write-LinkResponseFile -RspPath $nativeRsp -ArgsList $nativeLinkArgs
                if ((Invoke-CleanNativeStep $cxx @("@$nativeRsp")) -ne 0) {
                    throw "Linking CapLab13Native.exe gagal"
                }
                Write-StageRow "[LINK]" "CapLab13Native.exe updated (@link_native.rsp)" "DarkGray"
            }
        }
    }
    $LinkWatch.Stop()

    # ========================================================================
    # STAGE 3: PARITY & 120-MONTH STRESS SUITE
    # ========================================================================
    if ($buildTests -and $env:CAPLAB_RUN_TESTS -ne "0") {
        Write-StageRow "[3/4] Parity" "Running CapLab13Tests.exe (C++23 parity + 120-month stress)..." "Cyan"
        $testWatch = [System.Diagnostics.Stopwatch]::StartNew()
        $testOut = & $TestExe 2>&1 | Out-String
        $testExit = $LASTEXITCODE
        $testWatch.Stop()
        [System.IO.File]::WriteAllText($ParityLog, $testOut, (New-Object System.Text.UTF8Encoding($false)))

        if ($testExit -ne 0) {
            foreach ($tl in ($testOut -split "`r?`n")) {
                if ($tl -and $tl.Trim() -ne "") { Write-Host "    $tl" -ForegroundColor Red }
            }
            throw ("Parity tests gagal! (ExitCode={0} / 0x{1:X8})" -f $testExit, ([uint32]([int64]$testExit -band 0xFFFFFFFF)))
        }

        if ($VerboseTests.IsPresent -or $env:CAPLAB_VERBOSE_TESTS -eq "1") {
            foreach ($tl in ($testOut -split "`r?`n")) {
                if ($tl -and $tl.Trim() -ne "") { Write-Host "    $tl" }
            }
        } else {
            $summaryMatch = [regex]::Match($testOut, 'Summary:\s*(.+)')
            $perfMatch    = [regex]::Match($testOut, '\[PERF\]\s*(.+)')
            $sumText      = if ($summaryMatch.Success) { $summaryMatch.Groups[1].Value.Trim() } else { "All checks passed." }
            $perfText     = if ($perfMatch.Success) { " | " + $perfMatch.Groups[1].Value.Trim() } else { "" }
            Write-StageRow "[PASS]" "$sumText$perfText ($([math]::Round($testWatch.ElapsedMilliseconds)) ms)" "Green"
        }
    } else {
        Write-StageRow "[3/4] Parity" "Skipped via installer option or -Target Game." "DarkYellow"
    }
} finally {
    $ErrorActionPreference = $prevErrorPref
}

# ============================================================================
# STAGE 4: SHORTCUT INTEGRATION & TELEMETRY SUMMARY
# ============================================================================
if ($Target -eq "Tests" -or $env:CAPLAB_CREATE_SHORTCUTS -eq "0") {
    Write-StageRow "[4/4] Package" "Desktop & Start Menu shortcuts skipped per option." "DarkYellow"
} else {
    Write-StageRow "[4/4] Package" "Syncing Desktop & Start Menu shortcuts..." "Cyan"
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
            Write-StageRow "[Shortcut]" "$lnkPath" "Green"
        }
    } catch {
        Write-StageRow "[Warn]" "Shortcut skipped ($($_.Exception.Message)); binary remains ready." "DarkYellow"
    }
}

$Stopwatch.Stop()
$binTarget = if ($Target -eq "Tests") { $TestExe } else { $TargetExe }
$SizeMB = if (Test-Path $binTarget) { [math]::Round((Get-Item $binTarget).Length / 1MB, 2) } else { 0 }
Write-StageRow "[Done]" "Completed in $([math]::Round($Stopwatch.Elapsed.TotalSeconds, 1))s | Binary: $binTarget ($SizeMB MB)" "Cyan"
