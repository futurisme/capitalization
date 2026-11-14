<#
.SYNOPSIS
    CapLab 13 Autonomous Custom Setup Agent (Windows 11 x64)
    State-of-the-art in-house zero-dependency self-healing build & setup agent.
    Detects directory/layout shifts, toolchain corruption, ISA incompatibilities
    (0xC000001D), stack exhaustion (0xC00000FD), missing DLLs (0xC0000135),
    and PowerShell array splat bugs — repairs automatically and re-runs build.
#>
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [int]$MaxAttempts = 3,
    [switch]$DiagnosticOnly
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

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
        # Bounded depth-3 child lookup for nested ZIP extraction folders
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
        # Check parent folder in case launched inside builder\ or custom_setup_agent\
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
    Write-Host "  [Agent] $Message" -ForegroundColor $Color
    if ($LogFile) {
        Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    }
}

function Get-SetupAgentDiagnosis {
    param(
        [int]$ExitCode,
        [string]$LogText
    )

    $hexCode = ("0x{0:X8}" -f ([uint32]([int64]$ExitCode -band 0xFFFFFFFF)))
    $diagnoses = New-Object System.Collections.Generic.List[object]
    $smokePassed = ($LogText -match 'lolos smoke verification|terverifikasi')

    if ($LogText -match '-E or -x required' -or $LogText -match "no such file or directory:\s*'s'") {
        $diagnoses.Add([PSCustomObject]@{
            Code = "PS_ARRAY_SPLAT_CHAR_SPLIT"
            Repair = "USE_RESPONSE_FILE_AND_STRING_ARRAYS"
            Summary = "Single-element PowerShell array unwrapped into char[]; switch linker to UTF-8 @response file."
        })
    }
    if ($LogText -match '(?m)[^\r\n:]+\.(?:cpp|hpp|c|h):\d+:\d+:\s*error:|(?m)[^\r\n\(]+\(\d+\):\s*error\s+C\d+:') {
        $diagnoses.Add([PSCustomObject]@{
            Code = "CPP_SOURCE_COMPILE_ERROR"
            Repair = "REPAIR_CPP_SOURCE_AND_RETRY"
            Summary = "C++23 source compile diagnostic detected while toolchain is intact; skip redundant .toolchain re-download and attempt deterministic source repair."
        })
    }
    if ($ExitCode -eq -1073741795 -or $hexCode -eq "0xC000001D" -or $LogText -match '0xC000001D|STATUS_ILLEGAL_INSTRUCTION') {
        $diagnoses.Add([PSCustomObject]@{
            Code = "CPU_ISA_ILLEGAL_INSTRUCTION"
            Repair = "FORCE_BASELINE_X86_64"
            Summary = "Target CPU rejected AVX2/v3 instructions (0xC000001D); force universal baseline x86-64 SSE2 & clean objects."
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
    if ($LogText -match 'No such file or directory|Cannot open (include|source) file|resource\.rc' -and $LogText -notmatch "no such file or directory:\s*'s'") {
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
    # Match exact identifier + "::ident" namespace qualification suggestion cleanly
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

        # Only accept pure namespace-qualification suggestions (e.g. MAP_GRID_SIZE -> caplab::save::MAP_GRID_SIZE)
        if (-not $suggestion.EndsWith("::$ident")) { continue }

        $candidatePath = if ([System.IO.Path]::IsPathRooted($rawFile)) {
            $rawFile
        } else {
            Join-Path $normRoot $rawFile
        }
        if (-not (Test-Path $candidatePath)) { continue }
        $fullPath = [System.IO.Path]::GetFullPath($candidatePath)

        # Security boundary: mutate ONLY .cpp/.hpp/.h files inside project src\ or tests\
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

$BuildDir   = Join-Path $ResolvedRoot "build_native"
$ObjDir     = Join-Path $BuildDir "obj"
$DistDir    = Join-Path $ResolvedRoot "dist"
$ToolchainDir = Join-Path $ResolvedRoot ".toolchain"
$LogFile    = Join-Path $BuildDir "setup_agent_report.log"

New-Item -ItemType Directory -Force -Path $BuildDir, $ObjDir, $DistDir | Out-Null
Set-Content -Path $LogFile -Value "=== CapLab 13 Custom Setup Agent Diagnostic Log ($(Get-Date -Format o)) ===" -Encoding UTF8

Write-AgentLog $LogFile "Project root locked: $ResolvedRoot" "Cyan"

# Clear Mark-of-the-Web inside confined project directory only
Get-ChildItem -Path $ResolvedRoot -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
    try { Unblock-File -Path $_.FullName -ErrorAction SilentlyContinue } catch {}
}

$OrchestratorPath = Join-Path $ResolvedRoot "builder\CustomBuildOrchestrator.ps1"
if (-not (Test-Path $OrchestratorPath)) {
    $alt = Get-ChildItem -Path $ResolvedRoot -Filter "CustomBuildOrchestrator.ps1" -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($alt) {
        $OrchestratorPath = $alt.FullName
        Write-AgentLog $LogFile "Relocated CustomBuildOrchestrator.ps1 -> $OrchestratorPath" "Yellow"
    } else {
        throw "CustomBuildOrchestrator.ps1 tidak ditemukan di dalam $ResolvedRoot"
    }
}

$AgentState = @{
    ForceBaselineX64 = $true
    ExtraLinkFlags   = [string[]]@()
    CleanObjects     = $false
    ForceDynamicFallback = $false
}

if ($DiagnosticOnly) {
    Write-AgentLog $LogFile "DiagnosticOnly mode complete. Environment verified at $ResolvedRoot." "Green"
    exit 0
}

$Succeeded = $false
$prevCleanSignature = ""
for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    Write-Host ""
    Write-AgentLog $LogFile "Autonomous Build Cycle $attempt/$MaxAttempts (BaselineX64=$($AgentState.ForceBaselineX64), CleanObj=$($AgentState.CleanObjects))" "Cyan"

    $wasCleanCycle = $AgentState.CleanObjects
    if ($AgentState.CleanObjects -and (Test-Path $ObjDir)) {
        Write-AgentLog $LogFile "Purging stale object files in $ObjDir..." "Yellow"
        Remove-Item -Path (Join-Path $ObjDir "*") -Force -Recurse -ErrorAction SilentlyContinue
    }

    $env:CAPLAB_AGENT_ACTIVE = "1"
    $env:CAPLAB_FORCE_BASELINE_X64 = if ($AgentState.ForceBaselineX64) { "1" } else { "0" }
    $env:CAPLAB_EXTRA_LINK_FLAGS = ($AgentState.ExtraLinkFlags -join ";")
    $env:CAPLAB_DYNAMIC_STDLIB_FALLBACK = if ($AgentState.ForceDynamicFallback) { "1" } else { "0" }

    $runResult = Invoke-NativeTool -FilePath "powershell.exe" -ArgumentList @(
        "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", $OrchestratorPath,
        "-ProjectRoot", $ResolvedRoot
    ) -WorkingDirectory $ResolvedRoot

    $exitCode = $runResult.ExitCode
    $outputText = $runResult.Combined
    if ($outputText) {
        foreach ($line in ($outputText -split "`r?`n")) {
            Write-Host $line
        }
        Add-Content -Path $LogFile -Value $outputText -Encoding UTF8 -ErrorAction SilentlyContinue
    }

    if ($exitCode -eq 0 -and (Test-Path (Join-Path $DistDir "CapLab13Native.exe"))) {
        $Succeeded = $true
        Write-AgentLog $LogFile "Build & all parity tests verified cleanly on cycle $attempt!" "Green"
        break
    }

    $diags = Get-SetupAgentDiagnosis -ExitCode $exitCode -LogText $outputText
    Write-AgentLog $LogFile "Failure detected on cycle $attempt (exit=$exitCode). Running self-repair diagnostics..." "Yellow"

    $smokePassed = ($outputText -match 'lolos smoke verification|terverifikasi')
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
                    Write-AgentLog $LogFile "Unfixable C++ compile diagnostic; preserving verified .toolchain\ and halting retry loop cleanly." "Red"
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

    $failLines = (($outputText -split "`r?`n") | Where-Object { $_ -match '\[FAIL\]|Summary:' }) -join "|"
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

$Stopwatch.Stop()
if (-not $Succeeded) {
    Write-AgentLog $LogFile "Autonomous recovery did not pass ($MaxAttempts max cycles). Inspect $LogFile for exact compiler diagnostics." "Red"
    exit 1
}

Write-AgentLog $LogFile "Autonomous setup & build completed in $([math]::Round($Stopwatch.Elapsed.TotalSeconds, 1))s." "Green"
exit 0
