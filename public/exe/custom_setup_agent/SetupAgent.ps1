<#
.SYNOPSIS
    CapLab 13 Autonomous Custom Setup Agent (Windows 11 x64)
    State-of-the-art in-house zero-dependency self-healing build & setup agent.
    Features:
      - O(1) Project Structure & File Map verification for instant error pinpointing
      - Fast confined Mark-of-the-Web unblocking (Zone.Identifier ADS check, skipping .toolchain/build)
      - Device-wide toolchain discovery + concise aligned CLI output without stderr noise
      - Multi-target compilation (-Target All|Game|Tests) + optional PE64 CLI probe verification
      - Autonomous recovery from ISA mismatch (0xC000001D), stack overflow (0xC00000FD),
        missing runtime DLLs (0xC0000135), PowerShell char[] splat, and namespace compile bugs
      - Post-install redundant process cleanup & immediate CapLab13Native.exe launch
#>
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [int]$MaxAttempts = 3,
    [ValidateSet("All", "Game", "Tests")]
    [string]$Target = "All",
    [switch]$DiagnosticOnly,
    [switch]$AutoLaunchGame,
    [switch]$SkipShortcut,
    [switch]$Clean,
    [switch]$VerboseTests
)

$ErrorActionPreference = "Stop"
try {
    $secProto = [Net.SecurityProtocolType]::Tls12
    if ([Enum]::GetNames([Net.SecurityProtocolType]) -contains 'Tls13') {
        $secProto = $secProto -bor [Net.SecurityProtocolType]::Tls13
    }
    [Net.ServicePointManager]::SecurityProtocol = $secProto
} catch {}

if ($SkipShortcut) {
    $env:CAPLAB_CREATE_SHORTCUTS = "0"
}
if ($VerboseTests) {
    $env:CAPLAB_VERBOSE_TESTS = "1"
}

$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

function Resolve-ConfinedProjectRoot {
    param([string]$HintRoot)

    $candidates = New-Object System.Collections.Generic.List[string]
    if ($HintRoot -and (Test-Path $HintRoot)) {
        $candidates.Add((Resolve-Path $HintRoot).Path)
    }
    $scriptParent = Split-Path -Parent $PSScriptRoot
    if ($scriptParent -and (Test-Path $scriptParent)) {
        $candidates.Add((Resolve-Path $scriptParent).Path)
    }
    $cwd = (Get-Location).Path
    if ($cwd -and (Test-Path $cwd)) {
        $candidates.Add($cwd)
    }

    foreach ($base in $candidates) {
        if ((Test-Path (Join-Path $base "src\core\Types.hpp")) -and
            (Test-Path (Join-Path $base "tests\NativeParityTests.cpp"))) {
            return $base
        }
        $found = Get-ChildItem -Path $base -Filter "Types.hpp" -Recurse -Depth 4 -ErrorAction SilentlyContinue |
                 Where-Object { $_.FullName -match '[\\/]src[\\/]core[\\/]Types\.hpp$' } |
                 Select-Object -First 1
        if ($found) {
            $coreDir = $found.Directory.FullName
            $srcDir = Split-Path -Parent $coreDir
            $rootDir = Split-Path -Parent $srcDir
            if (Test-Path (Join-Path $rootDir "tests\NativeParityTests.cpp")) {
                return $rootDir
            }
        }
        $up = Split-Path -Parent $base
        if ($up -and (Test-Path (Join-Path $up "src\core\Types.hpp"))) {
            return $up
        }
    }
    return $HintRoot
}

function Invoke-NativeTool {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory = $PWD.Path
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $escapedArgs = foreach ($a in $ArgumentList) {
        if ($a -match '[\s"]') {
            '"' + ($a -replace '(\\*)"', '$1$1\"') + '"'
        } else {
            $a
        }
    }
    $psi.Arguments = ($escapedArgs -join ' ')

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    [void]$proc.Start()
    $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
    $stderrTask = $proc.StandardError.ReadToEndAsync()
    $proc.WaitForExit()
    [System.Threading.Tasks.Task]::WaitAll(@($stdoutTask, $stderrTask))

    return [PSCustomObject]@{
        ExitCode = $proc.ExitCode
        StdOut   = $stdoutTask.Result
        StdErr   = $stderrTask.Result
        Combined = ($stdoutTask.Result + "`n" + $stderrTask.Result).Trim()
    }
}

function Write-AgentLog {
    param([string]$LogFile, [string]$Message, [string]$Color = "Gray")
    $stamp = (Get-Date).ToString("HH:mm:ss")
    $line = "[$stamp] $Message"
    Write-Host ("  [Agent] {0}" -f $Message) -ForegroundColor $Color
    if ($LogFile) {
        Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    }
}

function Test-ProjectFileStructure {
    param([string]$RootPath, [string]$LogFile)

    $requiredFiles = @(
        "src\main.cpp",
        "src\core\Types.hpp",
        "src\core\PrecisionMath.hpp",
        "src\core\JsonSerializer.cpp",
        "src\engine\ProductsData.cpp",
        "src\engine\SpatialGrid.cpp",
        "src\engine\DemandMacro.cpp",
        "src\engine\FacilityUnits.cpp",
        "src\engine\SaveSystem.cpp",
        "src\engine\EconomyEngine.cpp",
        "src\engine\StockMarket.cpp",
        "src\engine\AICompetitor.cpp",
        "src\engine\SimulationWorker.cpp",
        "src\platform\Win32Hardware.cpp",
        "src\graphics\D2DRenderer.cpp",
        "src\renderer\IsometricEngine.cpp",
        "src\ui\UIWidgets.cpp",
        "src\ui\GameApp.cpp",
        "resources\resource.rc",
        "resources\app.manifest",
        "tests\NativeParityTests.cpp",
        "builder\CustomBuildOrchestrator.ps1"
    )

    $missing = New-Object System.Collections.Generic.List[string]
    foreach ($rel in $requiredFiles) {
        if (-not (Test-Path (Join-Path $RootPath $rel))) {
            $missing.Add($rel)
        }
    }
    if ($missing.Count -eq 0) {
        Write-AgentLog $LogFile "[Structure] Verified $($requiredFiles.Count)/$($requiredFiles.Count) native modules in $RootPath" "Green"
        return $true
    }
    Write-AgentLog $LogFile "[Pinpoint] Missing $($missing.Count) required project file(s): $($missing -join ', ')" "Red"
    return $false
}

function Clear-MarkOfTheWebFast {
    param([string]$RootPath)

    $skipDirs = @(".toolchain", "build_native", "build", "build_cl", "dist")
    $dirs = New-Object System.Collections.Generic.Queue[string]
    $dirs.Enqueue($RootPath)
    while ($dirs.Count -gt 0) {
        $cur = $dirs.Dequeue()
        foreach ($sub in [System.IO.Directory]::GetDirectories($cur)) {
            $name = [System.IO.Path]::GetFileName($sub)
            if ($skipDirs -contains $name) { continue }
            $dirs.Enqueue($sub)
        }
        foreach ($file in [System.IO.Directory]::GetFiles($cur)) {
            try {
                if (Get-Item -LiteralPath $file -Stream "Zone.Identifier" -ErrorAction SilentlyContinue) {
                    Unblock-File -LiteralPath $file -ErrorAction SilentlyContinue
                }
            } catch {}
        }
    }
}

function Stop-RedundantBuildProcesses {
    param([string]$RootPath, [string]$LogFile)

    $terminated = New-Object System.Collections.Generic.List[string]
    $normRoot = ([System.IO.Path]::GetFullPath($RootPath)).TrimEnd('\', '/')
    $targetNames = @("CapLab13Tests", "CapLab13Native", "clang++", "lld-link", "ld.lld", "llvm-windres", "cl", "link", "rc")

    foreach ($procName in $targetNames) {
        $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            if ($p.Id -eq $PID) { continue }
            $shouldKill = $false
            if ($procName -in @("CapLab13Tests", "CapLab13Native")) {
                $shouldKill = $true
            } else {
                try {
                    $exePath = $p.Path
                    if ($exePath -and $exePath.StartsWith($normRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                        $shouldKill = $true
                    }
                } catch {}
            }
            if ($shouldKill) {
                try {
                    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
                    $terminated.Add("$procName($($p.Id))")
                } catch {}
            }
        }
    }

    if ($terminated.Count -gt 0) {
        Write-AgentLog $LogFile "[Cleanup] Terminated redundant background process(es): $($terminated -join ', ')" "DarkCyan"
    } else {
        Write-AgentLog $LogFile "[Cleanup] Zero lingering build workers or stale game instances." "DarkCyan"
    }
}

function Get-SetupAgentDiagnosis {
    param(
        [int]$ExitCode,
        [string]$LogText
    )

    $hexCode = ("0x{0:X8}" -f ([uint32]([int64]$ExitCode -band 0xFFFFFFFF)))
    $diagnoses = New-Object System.Collections.Generic.List[object]
    $smokePassed = ($LogText -match 'lolos smoke verification|terverifikasi|Reused local')

    if ($LogText -match '-E or -x required' -or $LogText -match "no such file or directory:\s*'s'") {
        $diagnoses.Add([PSCustomObject]@{
            Code = "PS_ARRAY_SPLAT_CHAR_SPLIT"
            Repair = "USE_RESPONSE_FILE_AND_STRING_ARRAYS"
            Summary = "Single-element PowerShell array unwrapped into char[]; enforce [string[]] & UTF-8 @response file."
        })
    }
    if ($LogText -match '(?m)[^\r\n:]+\.(?:cpp|hpp|c|h):\d+:\d+:\s*error:|(?m)[^\r\n\(]+\(\d+\):\s*error\s+C\d+:') {
        $diagnoses.Add([PSCustomObject]@{
            Code = "CPP_SOURCE_COMPILE_ERROR"
            Repair = "REPAIR_CPP_SOURCE_AND_RETRY"
            Summary = "C++23 source compile diagnostic pinpointed while toolchain is intact; preserve local toolchain cache and repair source."
        })
    }
    if ($ExitCode -eq -1073741795 -or $hexCode -eq "0xC000001D" -or $LogText -match '0xC000001D|STATUS_ILLEGAL_INSTRUCTION') {
        $diagnoses.Add([PSCustomObject]@{
            Code = "CPU_ISA_ILLEGAL_INSTRUCTION"
            Repair = "FORCE_BASELINE_X86_64"
            Summary = "Target CPU rejected AVX2/v3 instructions (0xC000001D); force universal baseline x86-64 SSE2 & purge objects."
        })
    }
    if ($ExitCode -eq -1073741571 -or $hexCode -eq "0xC00000FD" -or $LogText -match '0xC00000FD|STACK_OVERFLOW') {
        $diagnoses.Add([PSCustomObject]@{
            Code = "STACK_OVERFLOW_EXHAUSTION"
            Repair = "INJECT_8MB_STACK_RESERVE"
            Summary = "Thread stack exhausted (0xC00000FD); inject 8MB linker stack reserve (-Wl,--stack,8388608 / /STACK:8388608)."
        })
    }
    if ($ExitCode -eq -1073741515 -or $hexCode -eq "0xC0000135" -or $LogText -match 'libstdc\+\+|libc\+\+|libwinpthread|DLL.*not found') {
        $diagnoses.Add([PSCustomObject]@{
            Code = "MISSING_RUNTIME_DLL"
            Repair = "STATIC_OR_STAGE_RUNTIME_DLLS"
            Summary = "Dynamic C++/MinGW runtime DLL missing (0xC0000135); enforce static linkage or stage toolchain DLLs."
        })
    }
    if ($LogText -match 'No such file or directory|Cannot open (include|source) file|resource\.rc|Missing \d+ required' -and $LogText -notmatch "no such file or directory:\s*'s'") {
        $diagnoses.Add([PSCustomObject]@{
            Code = "PATH_OR_FILE_MISPLACED"
            Repair = "RECOVER_DIRECTORY_LAYOUT"
            Summary = "Source/resource path mismatch detected; re-index project root and repair missing directories."
        })
    }
    if ($LogText -match '\[FAIL\]|Parity tests gagal|Summary:.*failed|0xC0000005') {
        $diagnoses.Add([PSCustomObject]@{
            Code = "PARITY_TEST_OR_MEMORY_FAULT"
            Repair = "CLEAN_OBJ_AND_VERIFY_TOOLCHAIN"
            Summary = "Test failure or access violation ($hexCode); purge incremental object cache, verify toolchain smoke binary, and rebuild."
        })
    }
    if ($diagnoses.Count -eq 0 -and $ExitCode -ne 0) {
        if ($smokePassed) {
            $diagnoses.Add([PSCustomObject]@{
                Code = "BUILD_STEP_ERROR_TOOLCHAIN_HEALTHY"
                Repair = "CLEAN_OBJ_AND_VERIFY_TOOLCHAIN"
                Summary = "Build error ($ExitCode / $hexCode) with healthy smoke-verified toolchain; purge object cache only and retry."
            })
        } else {
            $diagnoses.Add([PSCustomObject]@{
                Code = "UNCLASSIFIED_BUILD_ERROR"
                Repair = "CLEAN_REPROVISION_AND_RETRY"
                Summary = "Non-zero exit ($ExitCode / $hexCode) without verified compiler smoke pass; purge cache/toolchain and retry."
            })
        }
    }
    return $diagnoses
}

function Repair-CppDiagnosticIfKnown {
    param(
        [string]$ProjectRoot,
        [string]$LogText,
        [string]$LogFile
    )

    $repairedAny = $false
    $nsPattern = '(?m)^(?<file>(?:[A-Za-z]:)?[^\r\n:]+\.(?:cpp|hpp|c|h)):(?<line>\d+):(?<col>\d+):\s*error:\s*use of undeclared identifier\s*''(?<ident>[A-Za-z_][A-Za-z0-9_]*)'';\s*did you mean\s*''(?<suggestion>[A-Za-z_][A-Za-z0-9_:]+)''\?'
    $mMatches = [regex]::Matches($LogText, $nsPattern)

    $normRoot = ([System.IO.Path]::GetFullPath($ProjectRoot)).TrimEnd('\', '/')
    $srcAllowed = [System.IO.Path]::GetFullPath((Join-Path $normRoot "src"))
    $testsAllowed = [System.IO.Path]::GetFullPath((Join-Path $normRoot "tests"))

    foreach ($m in $mMatches) {
        $rawFile = $m.Groups["file"].Value.Trim()
        $lineNum = [int]$m.Groups["line"].Value
        $ident = $m.Groups["ident"].Value
        $suggestion = $m.Groups["suggestion"].Value

        if (-not $suggestion.EndsWith("::$ident")) { continue }

        $candidatePath = if ([System.IO.Path]::IsPathRooted($rawFile)) {
            $rawFile
        } else {
            Join-Path $normRoot $rawFile
        }
        if (-not (Test-Path $candidatePath)) { continue }
        $fullPath = [System.IO.Path]::GetFullPath($candidatePath)

        if (-not ($fullPath.StartsWith($srcAllowed, [System.StringComparison]::OrdinalIgnoreCase) -or
                  $fullPath.StartsWith($testsAllowed, [System.StringComparison]::OrdinalIgnoreCase))) {
            continue
        }

        $lines = [System.IO.File]::ReadAllLines($fullPath, [System.Text.Encoding]::UTF8)
        $idx = $lineNum - 1
        if ($idx -lt 0 -or $idx -ge $lines.Length) { continue }

        $origLine = $lines[$idx]
        $replacePattern = "(?<![A-Za-z0-9_:])$([regex]::Escape($ident))(?![A-Za-z0-9_])"
        $updatedLine = [regex]::Replace($origLine, $replacePattern, $suggestion, 1)
        if ($updatedLine -ne $origLine) {
            $lines[$idx] = $updatedLine
            [System.IO.File]::WriteAllLines($fullPath, $lines, (New-Object System.Text.UTF8Encoding($false)))
            Write-AgentLog $LogFile "[Auto-Repair] Qualified '$ident' -> '$suggestion' at ${rawFile}:$lineNum" "Green"
            $repairedAny = $true
        }
    }

    return $repairedAny
}

$ResolvedRoot = Resolve-ConfinedProjectRoot -HintRoot $ProjectRoot
Set-Location $ResolvedRoot

$BuildDir     = Join-Path $ResolvedRoot "build_native"
$ObjDir       = Join-Path $BuildDir "obj"
$DistDir      = Join-Path $ResolvedRoot "dist"
$ToolchainDir = Join-Path $ResolvedRoot ".toolchain"
$LogFile      = Join-Path $BuildDir "setup_agent_report.log"
$ParityLog    = Join-Path $BuildDir "parity_last.log"
$TargetExe    = Join-Path $DistDir "CapLab13Native.exe"

New-Item -ItemType Directory -Force -Path $BuildDir, $ObjDir, $DistDir | Out-Null
Set-Content -Path $LogFile -Value "=== CapLab 13 Custom Setup Agent Diagnostic Log ($(Get-Date -Format o)) ===" -Encoding UTF8

Write-AgentLog $LogFile "[Phase 1] Project root locked: $ResolvedRoot" "Cyan"
$structureOk = Test-ProjectFileStructure -RootPath $ResolvedRoot -LogFile $LogFile
Clear-MarkOfTheWebFast -RootPath $ResolvedRoot

$OrchestratorPath = Join-Path $ResolvedRoot "builder\CustomBuildOrchestrator.ps1"
if (-not (Test-Path $OrchestratorPath)) {
    $alt = Get-ChildItem -Path $ResolvedRoot -Filter "CustomBuildOrchestrator.ps1" -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($alt) {
        $OrchestratorPath = $alt.FullName
        Write-AgentLog $LogFile "Relocated CustomBuildOrchestrator.ps1 -> $OrchestratorPath" "Yellow"
    } else {
        throw "CustomBuildOrchestrator.ps1 not found under $ResolvedRoot"
    }
}

$AgentState = @{
    ForceBaselineX64     = $true
    ExtraLinkFlags       = [string[]]@()
    CleanObjects         = ($Clean.IsPresent -or (-not $structureOk))
    ForceDynamicFallback = $false
}

if ($DiagnosticOnly) {
    Stop-RedundantBuildProcesses -RootPath $ResolvedRoot -LogFile $LogFile
    Write-AgentLog $LogFile "DiagnosticOnly mode complete. Structure & environment verified at $ResolvedRoot." "Green"
    exit 0
}

Stop-RedundantBuildProcesses -RootPath $ResolvedRoot -LogFile $LogFile

$Succeeded = $false
$prevCleanSignature = ""
for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    Write-Host ""
    Write-AgentLog $LogFile "[Phase 2] Build Cycle $attempt/$MaxAttempts (Target=$Target, BaselineX64=$($AgentState.ForceBaselineX64), CleanObj=$($AgentState.CleanObjects))" "Cyan"

    $wasCleanCycle = $AgentState.CleanObjects
    if ($AgentState.CleanObjects -and (Test-Path $ObjDir)) {
        Write-AgentLog $LogFile "Purging stale object files in $ObjDir..." "Yellow"
        Remove-Item -Path (Join-Path $ObjDir "*") -Force -Recurse -ErrorAction SilentlyContinue
    }

    $env:CAPLAB_AGENT_ACTIVE = "1"
    $env:CAPLAB_FORCE_BASELINE_X64 = if ($AgentState.ForceBaselineX64) { "1" } else { "0" }
    $env:CAPLAB_EXTRA_LINK_FLAGS = ($AgentState.ExtraLinkFlags -join ";")
    $env:CAPLAB_DYNAMIC_STDLIB_FALLBACK = if ($AgentState.ForceDynamicFallback) { "1" } else { "0" }

    $orchArgs = [string[]]@(
        "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", $OrchestratorPath,
        "-ProjectRoot", $ResolvedRoot,
        "-Target", $Target
    )
    if ($VerboseTests) { $orchArgs += "-VerboseTests" }

    $runResult = Invoke-NativeTool -FilePath "powershell.exe" -ArgumentList $orchArgs -WorkingDirectory $ResolvedRoot

    $exitCode = $runResult.ExitCode
    $outputText = $runResult.Combined
    if ($outputText) {
        foreach ($line in ($outputText -split "`r?`n")) {
            if ($line -and $line.Trim() -ne "") {
                Write-Host $line
            }
        }
        Add-Content -Path $LogFile -Value $outputText -Encoding UTF8 -ErrorAction SilentlyContinue
    }
    if (Test-Path $ParityLog) {
        $pRaw = Get-Content -Path $ParityLog -Raw -ErrorAction SilentlyContinue
        if ($pRaw) { Add-Content -Path $LogFile -Value $pRaw -Encoding UTF8 -ErrorAction SilentlyContinue }
    }

    $targetReady = if ($Target -eq "Tests") { Test-Path (Join-Path $BuildDir "CapLab13Tests.exe") } else { Test-Path $TargetExe }
    if ($exitCode -eq 0 -and $targetReady) {
        $Succeeded = $true
        Write-AgentLog $LogFile "[Phase 3] Build & parity gate verified cleanly on cycle $attempt!" "Green"
        break
    }

    $diags = Get-SetupAgentDiagnosis -ExitCode $exitCode -LogText $outputText
    Write-AgentLog $LogFile "[Pinpoint] Failure detected on cycle $attempt (exit=$exitCode). Running precision diagnostics..." "Yellow"

    $smokePassed = ($outputText -match 'lolos smoke verification|terverifikasi|Reused local')
    $AgentState.CleanObjects = $true
    $abortUnfixableSource = $false
    $mutatedConfig = $false

    foreach ($d in $diags) {
        Write-AgentLog $LogFile "[$($d.Code)] -> $($d.Summary)" "Yellow"
        switch ($d.Repair) {
            "REPAIR_CPP_SOURCE_AND_RETRY" {
                $repaired = Repair-CppDiagnosticIfKnown -ProjectRoot $ResolvedRoot -LogText $outputText -LogFile $LogFile
                if ($repaired) {
                    $mutatedConfig = $true
                } else {
                    Write-AgentLog $LogFile "Unfixable C++ compile diagnostic; preserving verified local toolchain and halting retry loop cleanly." "Red"
                    $abortUnfixableSource = $true
                }
            }
            "FORCE_BASELINE_X86_64" {
                if (-not $AgentState.ForceBaselineX64) { $mutatedConfig = $true }
                $AgentState.ForceBaselineX64 = $true
            }
            "INJECT_8MB_STACK_RESERVE" {
                if (-not ($AgentState.ExtraLinkFlags -contains "-Wl,--stack,8388608")) { $mutatedConfig = $true }
                $AgentState.ExtraLinkFlags = [string[]]@("-Wl,--stack,8388608")
            }
            "STATIC_OR_STAGE_RUNTIME_DLLS" {
                if (-not $AgentState.ForceDynamicFallback) { $mutatedConfig = $true }
                $AgentState.ForceDynamicFallback = $true
            }
            "CLEAN_REPROVISION_AND_RETRY" {
                if (-not $smokePassed -and $attempt -ge 2 -and (Test-Path $ToolchainDir)) {
                    Write-AgentLog $LogFile "Smoke check failed; purging corrupted portable .toolchain cache for clean re-download..." "Yellow"
                    Remove-Item -Path $ToolchainDir -Recurse -Force -ErrorAction SilentlyContinue
                    $mutatedConfig = $true
                }
            }
            "RECOVER_DIRECTORY_LAYOUT" {
                $ResolvedRoot = Resolve-ConfinedProjectRoot -HintRoot $ResolvedRoot
                Set-Location $ResolvedRoot
                $mutatedConfig = $true
            }
        }
    }

    $failLines = (($outputText -split "`r?`n") | Where-Object { $_ -match '\[FAIL\]|Summary:|:\d+:\d+:\s*error:' }) -join "|"
    $curSignature = "$exitCode|$failLines"
    if ($wasCleanCycle -and -not $mutatedConfig -and $curSignature -eq $prevCleanSignature -and $curSignature -ne "$exitCode|") {
        Write-AgentLog $LogFile "Deterministic failure verified after clean object rebuild; halting duplicate retry." "Red"
        break
    }
    if ($wasCleanCycle) {
        $prevCleanSignature = $curSignature
    }

    if ($abortUnfixableSource) {
        break
    }
}

Stop-RedundantBuildProcesses -RootPath $ResolvedRoot -LogFile $LogFile

$Stopwatch.Stop()
if (-not $Succeeded) {
    Write-AgentLog $LogFile "Autonomous recovery did not pass ($MaxAttempts max cycles). Inspect $LogFile for pinpointed diagnostics." "Red"
    exit 1
}

Write-AgentLog $LogFile "Autonomous setup & build completed in $([math]::Round($Stopwatch.Elapsed.TotalSeconds, 1))s." "Green"

if ($Target -ne "Tests" -and ($AutoLaunchGame -or ($env:CAPLAB_AUTO_LAUNCH -eq "1"))) {
    if (Test-Path $TargetExe) {
        Write-AgentLog $LogFile "[Launch] Starting CapLab13Native.exe immediately..." "Green"
        Start-Process -FilePath $TargetExe -WorkingDirectory $DistDir
    }
}
exit 0
