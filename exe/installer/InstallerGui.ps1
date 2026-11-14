<#
.SYNOPSIS
    CapLab 13 Native - Minimalist 4-Step Interactive Setup Wizard (custom-setup-ui/wizard)
    Zero third-party dependencies: System.Windows.Forms + System.Drawing + SetupAgent.ps1
    Hardened Win11 STA startup with non-locking gui_exception.log diagnostics.
#>
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Continue"

function Resolve-InstallerRoot {
    param([string]$Hint)
    $cleanHint = if ($Hint) { $Hint.Trim().TrimEnd('.') } else { "" }
    $candidates = @($cleanHint, (Split-Path -Parent $PSScriptRoot), (Get-Location).Path)
    foreach ($c in $candidates) {
        if (-not $c) { continue }
        try {
            if (-not (Test-Path -LiteralPath $c)) { continue }
            $full = (Resolve-Path -LiteralPath $c).Path
            if ((Test-Path (Join-Path $full "src\core\Types.hpp")) -and
                (Test-Path (Join-Path $full "custom_setup_agent\SetupAgent.ps1"))) {
                return $full
            }
            $hit = Get-ChildItem -LiteralPath $full -Filter "SetupAgent.ps1" -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($hit) {
                return (Split-Path -Parent (Split-Path -Parent $hit.FullName))
            }
        } catch {}
    }
    if ($cleanHint) { return $cleanHint }
    return (Split-Path -Parent $PSScriptRoot)
}

$RootDir          = Resolve-InstallerRoot -Hint $ProjectRoot
$BuildNativeDir   = Join-Path $RootDir "build_native"
$AgentScript      = Join-Path $RootDir "custom_setup_agent\SetupAgent.ps1"
$DistExe          = Join-Path $RootDir "dist\CapLab13Native.exe"
$LogPath          = Join-Path $BuildNativeDir "setup_agent_report.log"
# Separate from LaunchInstaller.bat 2>gui_error.log redirect so NTFS never locks diagnostics
$GuiExceptionPath = Join-Path $BuildNativeDir "gui_exception.log"
$GuiLegacyErrPath = Join-Path $BuildNativeDir "gui_error.log"

try {
    if (-not (Test-Path $BuildNativeDir)) {
        New-Item -ItemType Directory -Force -Path $BuildNativeDir | Out-Null
    }
    if (Test-Path $GuiExceptionPath) { Remove-Item $GuiExceptionPath -Force -ErrorAction SilentlyContinue }
} catch {}

function Write-GuiFatalLog {
    param([string]$Stage, [string]$Detail)
    $msg = "[InstallerGui] Stage='$Stage' | $Detail"
    try {
        [System.IO.File]::WriteAllText($GuiExceptionPath, $msg, (New-Object System.Text.UTF8Encoding($false)))
    } catch {}
    try {
        [Console]::Error.WriteLine($msg)
        [Console]::Error.Flush()
    } catch {}
}

# Ensure Single-Threaded Apartment for WinForms reliability
if ([System.Threading.Thread]::CurrentThread.ApartmentState -ne [System.Threading.ApartmentState]::STA) {
    $cleanRoot = if ($RootDir) { $RootDir.Trim().TrimEnd('.') } else { (Split-Path -Parent $PSScriptRoot) }
    $psArgs = @("-NoLogo", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-ProjectRoot", $cleanRoot)
    $p = Start-Process -FilePath "powershell.exe" -ArgumentList $psArgs -PassThru -Wait
    exit $p.ExitCode
}

try {
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    } catch {
        [void][System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms")
        [void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")
    }
    if (-not ([System.Management.Automation.PSTypeName]'System.Windows.Forms.Form').Type) {
        throw "System.Windows.Forms.Form type unavailable in host CLR session."
    }
} catch {
    Write-GuiFatalLog -Stage "LoadWinForms" -Detail "$($_.Exception.Message) (see also gui_error.log)"
    exit 2
}

# VisualStyles can throw InvalidOperationException in some elevated console sessions; never abort on it
try { [System.Windows.Forms.Application]::EnableVisualStyles() } catch {}
try { [System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false) } catch {}

# Accurate Hardware & Local Toolchain Discovery (Data-Saver: avoids redundant downloads)
$CpuCores = [Environment]::ProcessorCount
$RamGb = "Unknown"
try {
    $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop
    $RamGb = "{0:N1} GB" -f ($cs.TotalPhysicalMemory / 1GB)
} catch {}

function Convert-RegMemoryMb {
    param($RawVal)
    if ($null -eq $RawVal) { return 0 }
    try {
        if ($RawVal -is [byte[]]) {
            if ($RawVal.Length -ge 8) { return [math]::Round([BitConverter]::ToUInt64($RawVal, 0) / 1MB) }
            if ($RawVal.Length -ge 4) { return [math]::Round([BitConverter]::ToUInt32($RawVal, 0) / 1MB) }
            return 0
        }
        return [math]::Round([uint64]$RawVal / 1MB)
    } catch { return 0 }
}

$GpuLabel = "Direct3D 11 Hardware"
$GpuVramMb = 0
try {
    # Read 64-bit qwMemorySize / binary MemorySize from Display Class Registry first (fixes 4 GB Win32_VideoController cap)
    $dispClass = "HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
    if (Test-Path $dispClass) {
        Get-ChildItem -Path $dispClass -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                $props = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue
                if ($props.DriverDesc -and ($props.DriverDesc -notmatch "Microsoft Basic|Remote|RDP")) {
                    $qMem = Convert-RegMemoryMb $props."HardwareInformation.qwMemorySize"
                    if ($qMem -eq 0) { $qMem = Convert-RegMemoryMb $props."HardwareInformation.MemorySize" }
                    if ($qMem -ge $GpuVramMb) {
                        $GpuVramMb = $qMem
                        $GpuLabel = [string]$props.DriverDesc
                    }
                }
            } catch {}
        }
    }
    $gpus = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue
    foreach ($g in $gpus) {
        if (-not $g -or -not $g.Name -or $g.Name -match "Microsoft Basic|Remote|RDP") { continue }
        $vramMb = Convert-RegMemoryMb $g.AdapterRAM
        if ($vramMb -gt $GpuVramMb -or $GpuLabel -eq "Direct3D 11 Hardware") {
            $GpuVramMb = [Math]::Max($GpuVramMb, $vramMb)
            $GpuLabel = [string]$g.Name
        }
    }
} catch {}

$IsAdmin = $false
try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr = New-Object Security.Principal.WindowsPrincipal($id)
    $IsAdmin = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch {}

function Detect-LocalCompilerSummary {
    try {
        if (Get-Command cl.exe -ErrorAction SilentlyContinue) { return "MSVC cl.exe on PATH (0 MB download)" }
        if (Get-Command clang++.exe -ErrorAction SilentlyContinue) { return "clang++ on PATH (0 MB download)" }
        if (Get-Command g++.exe -ErrorAction SilentlyContinue) { return "g++ on PATH (0 MB download)" }
        $localTc = Join-Path $RootDir ".toolchain"
        if ((Test-Path $localTc) -and (Get-ChildItem -Path $localTc -Filter "clang++.exe" -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1)) {
            return "Cached .toolchain\ LLVM-MinGW (0 MB download)"
        }
        foreach ($dir in @("C:\msys64\clang64\bin", "C:\msys64\ucrt64\bin", "C:\Program Files\LLVM\bin", "C:\Program Files\Microsoft Visual Studio\2022")) {
            if (Test-Path $dir) { return "Device Local SDK at $dir (0 MB download)" }
        }
    } catch {}
    return "Auto-fetch portable LLVM-MinGW (~182 MB)"
}
$ToolchainSummary = Detect-LocalCompilerSummary

function New-SafeFont {
    param([string]$Family, [float]$Size, [System.Drawing.FontStyle]$Style)
    try {
        return New-Object System.Drawing.Font($Family, $Size, $Style)
    } catch {
        try {
            return New-Object System.Drawing.Font([System.Drawing.SystemFonts]::MessageBoxFont.FontFamily, $Size, $Style)
        } catch {
            return [System.Drawing.SystemFonts]::DefaultFont
        }
    }
}

try {
    # Modern Minimalist Slate Theme
    $ColVoid    = [System.Drawing.Color]::FromArgb(11, 17, 32)
    $ColHeader  = [System.Drawing.Color]::FromArgb(15, 23, 42)
    $ColCard    = [System.Drawing.Color]::FromArgb(20, 30, 52)
    $ColSky     = [System.Drawing.Color]::FromArgb(56, 189, 248)
    $ColSkyBtn  = [System.Drawing.Color]::FromArgb(2, 132, 199)
    $ColEmerald = [System.Drawing.Color]::FromArgb(16, 185, 129)
    $ColAmber   = [System.Drawing.Color]::FromArgb(245, 158, 11)
    $ColRose    = [System.Drawing.Color]::FromArgb(244, 63, 94)
    $ColText    = [System.Drawing.Color]::FromArgb(248, 250, 252)
    $ColMuted   = [System.Drawing.Color]::FromArgb(148, 163, 184)

    $FontTitle = New-SafeFont "Segoe UI" 12 ([System.Drawing.FontStyle]::Bold)
    $FontStep  = New-SafeFont "Segoe UI" 9 ([System.Drawing.FontStyle]::Bold)
    $FontBold  = New-SafeFont "Segoe UI" 9.5 ([System.Drawing.FontStyle]::Bold)
    $FontReg   = New-SafeFont "Segoe UI" 9 ([System.Drawing.FontStyle]::Regular)
    $FontMono  = New-SafeFont "Consolas" 8.5 ([System.Drawing.FontStyle]::Regular)

    $Form = New-Object System.Windows.Forms.Form
    $Form.Text = "CapLab 13 Setup Wizard - custom-setup-ui/wizard"
    $Form.Size = New-Object System.Drawing.Size(880, 600)
    $Form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $Form.BackColor = $ColVoid
    $Form.ForeColor = $ColText
    $Form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
    $Form.MaximizeBox = $false

    # Header + Wizard Step Rail
    $HeaderPanel = New-Object System.Windows.Forms.Panel
    $HeaderPanel.Location = New-Object System.Drawing.Point(0, 0)
    $HeaderPanel.Size = New-Object System.Drawing.Size(880, 62)
    $HeaderPanel.BackColor = $ColHeader
    $Form.Controls.Add($HeaderPanel)

    $LblBrand = New-Object System.Windows.Forms.Label
    $LblBrand.Text = "CapLab 13 Native  |  Setup Wizard"
    $LblBrand.Font = $FontTitle
    $LblBrand.ForeColor = $ColText
    $LblBrand.Location = New-Object System.Drawing.Point(20, 10)
    $LblBrand.Size = New-Object System.Drawing.Size(440, 24)
    $HeaderPanel.Controls.Add($LblBrand)

    $LblSub = New-Object System.Windows.Forms.Label
    $LblSub.Text = if ($IsAdmin) { "Administrator Session | Proprietary C++23 & D3D11 Ecosystem" } else { "User Session | Proprietary C++23 & D3D11 Ecosystem" }
    $LblSub.Font = $FontReg
    $LblSub.ForeColor = $ColMuted
    $LblSub.Location = New-Object System.Drawing.Point(20, 35)
    $LblSub.Size = New-Object System.Drawing.Size(470, 18)
    $HeaderPanel.Controls.Add($LblSub)

    $StepLabels = @()
    $StepNames = @("1. Preflight", "2. Options", "3. Build", "4. Launch")
    for ($i = 0; $i -lt 4; $i++) {
        $lbl = New-Object System.Windows.Forms.Label
        $lbl.Text = $StepNames[$i]
        $lbl.Font = $FontStep
        $lbl.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
        $lbl.Location = New-Object System.Drawing.Point((500 + $i * 90), 17)
        $lbl.Size = New-Object System.Drawing.Size(84, 28)
        $lbl.BackColor = $ColCard
        $lbl.ForeColor = $ColMuted
        $HeaderPanel.Controls.Add($lbl)
        $StepLabels += $lbl
    }

    # Step 1 Panel: Preflight Hardware & File Awareness
    $PanelStep1 = New-Object System.Windows.Forms.Panel
    $PanelStep1.Location = New-Object System.Drawing.Point(20, 78)
    $PanelStep1.Size = New-Object System.Drawing.Size(824, 420)
    $PanelStep1.BackColor = $ColCard
    $PanelStep1.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $Form.Controls.Add($PanelStep1)

    $LblS1Title = New-Object System.Windows.Forms.Label
    $LblS1Title.Text = "Step 1 of 4 - System Preflight & Data-Saver Toolchain Scan"
    $LblS1Title.Font = $FontTitle
    $LblS1Title.ForeColor = $ColSky
    $LblS1Title.Location = New-Object System.Drawing.Point(20, 18)
    $LblS1Title.Size = New-Object System.Drawing.Size(780, 26)
    $PanelStep1.Controls.Add($LblS1Title)

    $vramLabel = if ($GpuVramMb -gt 0) { "$GpuVramMb MB VRAM" } else { "Auto Adapter" }
    $LblS1Info = New-Object System.Windows.Forms.Label
    $LblS1Info.Text = "CPU Worker Pool : $CpuCores Logical Threads`r`nSystem RAM      : $RamGb`r`nGPU Accelerator : $GpuLabel ($vramLabel)`r`nLocal Toolchain : $ToolchainSummary`r`nProject Root    : $RootDir"
    $LblS1Info.Font = $FontMono
    $LblS1Info.ForeColor = $ColText
    $LblS1Info.Location = New-Object System.Drawing.Point(20, 56)
    $LblS1Info.Size = New-Object System.Drawing.Size(780, 120)
    $PanelStep1.Controls.Add($LblS1Info)

    $LblS1Desc = New-Object System.Windows.Forms.Label
    $LblS1Desc.Text = "Custom Setup Agent will verify folder structure (src/, resources/, tests/, builder/) and reuse any existing compiler found on your device to avoid unnecessary downloads. Redundant build workers are terminated automatically when launch begins."
    $LblS1Desc.Font = $FontReg
    $LblS1Desc.ForeColor = $ColMuted
    $LblS1Desc.Location = New-Object System.Drawing.Point(20, 188)
    $LblS1Desc.Size = New-Object System.Drawing.Size(780, 56)
    $PanelStep1.Controls.Add($LblS1Desc)

    $BtnSelfCheck = New-Object System.Windows.Forms.Button
    $BtnSelfCheck.Text = "Run Structure & Diagnostic Preflight"
    $BtnSelfCheck.Font = $FontBold
    $BtnSelfCheck.BackColor = $ColHeader
    $BtnSelfCheck.ForeColor = $ColText
    $BtnSelfCheck.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $BtnSelfCheck.Location = New-Object System.Drawing.Point(20, 260)
    $BtnSelfCheck.Size = New-Object System.Drawing.Size(270, 38)
    $PanelStep1.Controls.Add($BtnSelfCheck)

    $BtnPlayExisting = New-Object System.Windows.Forms.Button
    $BtnPlayExisting.Text = "Launch Existing CapLab13Native.exe"
    $BtnPlayExisting.Font = $FontBold
    $BtnPlayExisting.BackColor = $ColEmerald
    $BtnPlayExisting.ForeColor = $ColVoid
    $BtnPlayExisting.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $BtnPlayExisting.Location = New-Object System.Drawing.Point(304, 260)
    $BtnPlayExisting.Size = New-Object System.Drawing.Size(260, 38)
    $BtnPlayExisting.Visible = (Test-Path $DistExe)
    $PanelStep1.Controls.Add($BtnPlayExisting)

    # Step 2 Panel: Installation Configuration
    $PanelStep2 = New-Object System.Windows.Forms.Panel
    $PanelStep2.Location = New-Object System.Drawing.Point(20, 78)
    $PanelStep2.Size = New-Object System.Drawing.Size(824, 420)
    $PanelStep2.BackColor = $ColCard
    $PanelStep2.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $PanelStep2.Visible = $false
    $Form.Controls.Add($PanelStep2)

    $LblS2Title = New-Object System.Windows.Forms.Label
    $LblS2Title.Text = "Step 2 of 4 - Build Strategy & Launch Preferences"
    $LblS2Title.Font = $FontTitle
    $LblS2Title.ForeColor = $ColSky
    $LblS2Title.Location = New-Object System.Drawing.Point(20, 18)
    $LblS2Title.Size = New-Object System.Drawing.Size(780, 26)
    $PanelStep2.Controls.Add($LblS2Title)

    $ChkShortcuts = New-Object System.Windows.Forms.CheckBox
    $ChkShortcuts.Text = "Create Desktop & Start Menu Shortcuts (CapLab 13 Native)"
    $ChkShortcuts.Checked = $true
    $ChkShortcuts.Font = $FontReg
    $ChkShortcuts.ForeColor = $ColText
    $ChkShortcuts.Location = New-Object System.Drawing.Point(24, 68)
    $ChkShortcuts.Size = New-Object System.Drawing.Size(740, 26)
    $PanelStep2.Controls.Add($ChkShortcuts)

    $ChkGpuPref = New-Object System.Windows.Forms.CheckBox
    $ChkGpuPref.Text = "Register Discrete GPU Priority (DirectX High Performance Preference)"
    $ChkGpuPref.Checked = $true
    $ChkGpuPref.Font = $FontReg
    $ChkGpuPref.ForeColor = $ColText
    $ChkGpuPref.Location = New-Object System.Drawing.Point(24, 108)
    $ChkGpuPref.Size = New-Object System.Drawing.Size(740, 26)
    $PanelStep2.Controls.Add($ChkGpuPref)

    $ChkParity = New-Object System.Windows.Forms.CheckBox
    $ChkParity.Text = "Run C++23 Parity & 120-Month Stability Verification (CapLab13Tests)"
    $ChkParity.Checked = $true
    $ChkParity.Font = $FontReg
    $ChkParity.ForeColor = $ColText
    $ChkParity.Location = New-Object System.Drawing.Point(24, 148)
    $ChkParity.Size = New-Object System.Drawing.Size(740, 26)
    $PanelStep2.Controls.Add($ChkParity)

    $ChkAutoLaunch = New-Object System.Windows.Forms.CheckBox
    $ChkAutoLaunch.Text = "Terminate Redundant Build Processes & Launch CapLab13Native.exe Automatically"
    $ChkAutoLaunch.Checked = $true
    $ChkAutoLaunch.Font = $FontReg
    $ChkAutoLaunch.ForeColor = $ColText
    $ChkAutoLaunch.Location = New-Object System.Drawing.Point(24, 188)
    $ChkAutoLaunch.Size = New-Object System.Drawing.Size(740, 26)
    $PanelStep2.Controls.Add($ChkAutoLaunch)

    # Step 3 Panel: Parallel Build & Concise Diagnostics
    $PanelStep3 = New-Object System.Windows.Forms.Panel
    $PanelStep3.Location = New-Object System.Drawing.Point(20, 78)
    $PanelStep3.Size = New-Object System.Drawing.Size(824, 420)
    $PanelStep3.BackColor = $ColCard
    $PanelStep3.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $PanelStep3.Visible = $false
    $Form.Controls.Add($PanelStep3)

    $LblStage = New-Object System.Windows.Forms.Label
    $LblStage.Text = "Ready for parallel incremental compilation..."
    $LblStage.Font = $FontBold
    $LblStage.ForeColor = $ColText
    $LblStage.Location = New-Object System.Drawing.Point(16, 16)
    $LblStage.Size = New-Object System.Drawing.Size(580, 22)
    $PanelStep3.Controls.Add($LblStage)

    $LblAgentStatus = New-Object System.Windows.Forms.Label
    $LblAgentStatus.Text = "Status: Standby"
    $LblAgentStatus.Font = $FontMono
    $LblAgentStatus.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight
    $LblAgentStatus.ForeColor = $ColSky
    $LblAgentStatus.Location = New-Object System.Drawing.Point(600, 16)
    $LblAgentStatus.Size = New-Object System.Drawing.Size(206, 22)
    $PanelStep3.Controls.Add($LblAgentStatus)

    $ProgressBar = New-Object System.Windows.Forms.ProgressBar
    $ProgressBar.Location = New-Object System.Drawing.Point(16, 44)
    $ProgressBar.Size = New-Object System.Drawing.Size(790, 12)
    $ProgressBar.Minimum = 0
    $ProgressBar.Maximum = 100
    $ProgressBar.Value = 0
    $PanelStep3.Controls.Add($ProgressBar)

    $TxtLog = New-Object System.Windows.Forms.TextBox
    $TxtLog.Location = New-Object System.Drawing.Point(16, 68)
    $TxtLog.Size = New-Object System.Drawing.Size(790, 336)
    $TxtLog.Multiline = $true
    $TxtLog.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
    $TxtLog.ReadOnly = $true
    $TxtLog.WordWrap = $false
    $TxtLog.BackColor = [System.Drawing.Color]::FromArgb(8, 12, 22)
    $TxtLog.ForeColor = [System.Drawing.Color]::FromArgb(203, 213, 225)
    $TxtLog.Font = $FontMono
    $TxtLog.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $PanelStep3.Controls.Add($TxtLog)

    # Step 4 Panel: Cleanup & Instant Launch
    $PanelStep4 = New-Object System.Windows.Forms.Panel
    $PanelStep4.Location = New-Object System.Drawing.Point(20, 78)
    $PanelStep4.Size = New-Object System.Drawing.Size(824, 420)
    $PanelStep4.BackColor = $ColCard
    $PanelStep4.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $PanelStep4.Visible = $false
    $Form.Controls.Add($PanelStep4)

    $LblS4Title = New-Object System.Windows.Forms.Label
    $LblS4Title.Text = "Step 4 of 4 - Setup Verified & Process Cleanup Complete"
    $LblS4Title.Font = $FontTitle
    $LblS4Title.ForeColor = $ColEmerald
    $LblS4Title.Location = New-Object System.Drawing.Point(20, 20)
    $LblS4Title.Size = New-Object System.Drawing.Size(780, 26)
    $PanelStep4.Controls.Add($LblS4Title)

    $LblS4Summary = New-Object System.Windows.Forms.Label
    $LblS4Summary.Text = "Executable : $DistExe`r`nCleanup    : Lingering test binaries & build subprocesses terminated.`r`nLog Report : $LogPath"
    $LblS4Summary.Font = $FontMono
    $LblS4Summary.ForeColor = $ColText
    $LblS4Summary.Location = New-Object System.Drawing.Point(20, 62)
    $LblS4Summary.Size = New-Object System.Drawing.Size(780, 90)
    $PanelStep4.Controls.Add($LblS4Summary)

    # Bottom Wizard Navigation Bar
    $BtnBack = New-Object System.Windows.Forms.Button
    $BtnBack.Text = "Back"
    $BtnBack.Font = $FontBold
    $BtnBack.BackColor = $ColHeader
    $BtnBack.ForeColor = $ColMuted
    $BtnBack.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $BtnBack.Location = New-Object System.Drawing.Point(20, 512)
    $BtnBack.Size = New-Object System.Drawing.Size(110, 38)
    $Form.Controls.Add($BtnBack)

    $BtnOpenLog = New-Object System.Windows.Forms.Button
    $BtnOpenLog.Text = "Open Log"
    $BtnOpenLog.Font = $FontBold
    $BtnOpenLog.BackColor = $ColHeader
    $BtnOpenLog.ForeColor = $ColMuted
    $BtnOpenLog.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $BtnOpenLog.Location = New-Object System.Drawing.Point(140, 512)
    $BtnOpenLog.Size = New-Object System.Drawing.Size(110, 38)
    $Form.Controls.Add($BtnOpenLog)

    $BtnInstall = New-Object System.Windows.Forms.Button
    $BtnInstall.Text = "Next"
    $BtnInstall.Font = $FontBold
    $BtnInstall.BackColor = $ColSkyBtn
    $BtnInstall.ForeColor = $ColText
    $BtnInstall.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $BtnInstall.Location = New-Object System.Drawing.Point(614, 512)
    $BtnInstall.Size = New-Object System.Drawing.Size(230, 38)
    $Form.Controls.Add($BtnInstall)

    $BtnLaunchGame = New-Object System.Windows.Forms.Button
    $BtnLaunchGame.Text = "Launch CapLab 13 Native"
    $BtnLaunchGame.Font = $FontBold
    $BtnLaunchGame.BackColor = $ColEmerald
    $BtnLaunchGame.ForeColor = $ColVoid
    $BtnLaunchGame.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $BtnLaunchGame.Enabled = (Test-Path $DistExe)
    $BtnLaunchGame.Visible = $false
    $BtnLaunchGame.Location = New-Object System.Drawing.Point(614, 512)
    $BtnLaunchGame.Size = New-Object System.Drawing.Size(230, 38)
    $Form.Controls.Add($BtnLaunchGame)

    $Script:CurrentStep = 1
    $Script:ActiveProc = $null
    $Script:LogQueue = New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'

    function Set-WizardStep {
        param([int]$Step)
        $Script:CurrentStep = $Step
        $PanelStep1.Visible = ($Step -eq 1)
        $PanelStep2.Visible = ($Step -eq 2)
        $PanelStep3.Visible = ($Step -eq 3)
        $PanelStep4.Visible = ($Step -eq 4)

        for ($i = 0; $i -lt 4; $i++) {
            $isActive = (($i + 1) -eq $Step)
            $isDone = (($i + 1) -lt $Step)
            $StepLabels[$i].BackColor = if ($isActive) { $ColSkyBtn } elseif ($isDone) { [System.Drawing.Color]::FromArgb(6, 78, 59) } else { $ColCard }
            $StepLabels[$i].ForeColor = if ($isActive -or $isDone) { $ColText } else { $ColMuted }
        }

        $BtnBack.Enabled = ($Step -gt 1 -and $Script:ActiveProc -eq $null)
        $BtnInstall.Visible = ($Step -lt 4)
        $BtnLaunchGame.Visible = ($Step -eq 4)

        if ($Step -eq 1) { $BtnInstall.Text = "Next: Configure Options" }
        elseif ($Step -eq 2) { $BtnInstall.Text = "Install & Build Now" }
        elseif ($Step -eq 3) { $BtnInstall.Text = "Retry Build" }
    }

    function Stop-StrayGameAndBuildWorkers {
        foreach ($pname in @("CapLab13Tests", "CapLab13Native", "clang++", "lld-link", "ld.lld")) {
            Get-Process -Name $pname -ErrorAction SilentlyContinue | ForEach-Object {
                try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
            }
        }
    }

    function Append-ConsoleLine {
        param([string]$Line)
        if ($null -eq $Line) { return }
        $TxtLog.AppendText("$Line`r`n")
        if ($Line -match '\[1/4\]|\[1/3\]') { $ProgressBar.Value = 18; $LblStage.Text = "Stage 1/4: Preflight & local toolchain discovery (0 MB priority)..." }
        elseif ($Line -match '\[Data-Saver\]|\[REUSE\]') { $ProgressBar.Value = [Math]::Max($ProgressBar.Value, 30) }
        elseif ($Line -match '\[Download\]|\[Extract\]') { $ProgressBar.Value = [Math]::Max($ProgressBar.Value, 32); $LblStage.Text = "Fetching portable LLVM-MinGW C++23 toolchain..." }
        elseif ($Line -match '\[2/4\]|\[2/3\]') { $ProgressBar.Value = 45; $LblStage.Text = "Stage 2/4: Parallel incremental compilation & linking..." }
        elseif ($Line -match '\[Cache\]|\[CACHE\]|\[CC\]|\[LINK\]') { $ProgressBar.Value = [Math]::Min(80, $ProgressBar.Value + 4) }
        elseif ($Line -match '\[3/4\]|\[Test\]|\[PASS\]') { $ProgressBar.Value = 86; $LblStage.Text = "Stage 3/4: CapLab13Tests parity & stability suite..." }
        elseif ($Line -match '\[4/4\]|\[3/3\]') { $ProgressBar.Value = 94; $LblStage.Text = "Stage 4/4: Shortcuts, cleanup & GPU profile..." }
        elseif ($Line -match '\[Done\]|\[READY\]|verified cleanly') { $ProgressBar.Value = 100 }
        elseif ($Line -match 'self-repair|Auto-Repair|Purging') {
            $LblAgentStatus.Text = "Status: Self-Healing"
            $LblAgentStatus.ForeColor = $ColAmber
        }
    }

    function Register-DiscreteGpuPreference {
        param([string]$ExePath)
        if (-not (Test-Path $ExePath)) { return }
        try {
            $regPath = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
            if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
            Set-ItemProperty -Path $regPath -Name $ExePath -Value "GpuPreference=2;" -Type String -Force
        } catch {}
    }

    $UiTimer = New-Object System.Windows.Forms.Timer
    $UiTimer.Interval = 80
    $UiTimer.Add_Tick({
        $line = $null
        $batch = 0
        while ($batch -lt 40 -and $Script:LogQueue.TryDequeue([ref]$line)) {
            Append-ConsoleLine $line
            $batch++
        }

        if ($Script:ActiveProc -ne $null -and $Script:ActiveProc.HasExited -and $Script:LogQueue.IsEmpty) {
            $code = $Script:ActiveProc.ExitCode
            $Script:ActiveProc.Dispose()
            $Script:ActiveProc = $null
            $UiTimer.Stop()
            $BtnInstall.Enabled = $true
            $BtnSelfCheck.Enabled = $true

            if ($code -eq 0 -and (Test-Path $DistExe)) {
                if ($ChkGpuPref.Checked) { Register-DiscreteGpuPreference -ExePath $DistExe }
                Stop-StrayGameAndBuildWorkers
                $ProgressBar.Value = 100
                $LblStage.Text = "Build verified & redundant background processes cleared."
                $LblStage.ForeColor = $ColEmerald
                $LblAgentStatus.Text = "Status: Verified OK"
                $LblAgentStatus.ForeColor = $ColEmerald
                $BtnLaunchGame.Enabled = $true
                Set-WizardStep -Step 4
                if ($ChkAutoLaunch.Checked) {
                    Start-Process -FilePath $DistExe -WorkingDirectory (Split-Path -Parent $DistExe)
                    $Form.Close()
                }
            } else {
                $LblStage.Text = "Build stopped (exit=$code). Review concise pinpointed error below."
                $LblStage.ForeColor = $ColRose
                $LblAgentStatus.Text = "Status: Error $code"
                $LblAgentStatus.ForeColor = $ColRose
                $BtnBack.Enabled = $true
            }
        }
    })

    function Start-AgentProcess {
        param([switch]$DiagOnly)
        if ($Script:ActiveProc -ne $null) { return }
        if (-not (Test-Path $AgentScript)) {
            [System.Windows.Forms.MessageBox]::Show("custom_setup_agent\SetupAgent.ps1 tidak ditemukan di $RootDir", "CapLab 13 Setup", "OK", "Error") | Out-Null
            return
        }

        Set-WizardStep -Step 3
        $BtnInstall.Enabled = $false
        $BtnBack.Enabled = $false
        $BtnSelfCheck.Enabled = $false
        $ProgressBar.Value = 8
        $LblStage.ForeColor = $ColText
        $LblStage.Text = if ($DiagOnly) { "Running preflight diagnostics..." } else { "Starting SetupAgent (max 3 self-repair cycles)..." }
        $LblAgentStatus.Text = "Status: Running"
        $LblAgentStatus.ForeColor = $ColSky
        $TxtLog.Clear()

        $env:CAPLAB_CREATE_SHORTCUTS = if ($ChkShortcuts.Checked) { "1" } else { "0" }
        $env:CAPLAB_RUN_TESTS = if ($ChkParity.Checked) { "1" } else { "0" }
        $env:CAPLAB_AUTO_LAUNCH = "0"

        $argStr = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$AgentScript`" -ProjectRoot `"$RootDir`" -MaxAttempts 3"
        if ($DiagOnly) { $argStr += " -DiagnosticOnly" }

        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "powershell.exe"
        $psi.Arguments = $argStr
        $psi.WorkingDirectory = $RootDir
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true

        $proc = New-Object System.Diagnostics.Process
        $proc.StartInfo = $psi
        $proc.EnableRaisingEvents = $true

        $q = $Script:LogQueue
        $handler = [System.Diagnostics.DataReceivedEventHandler]{
            param($sender, $e)
            if ($null -ne $e.Data) { $q.Enqueue($e.Data) }
        }
        $proc.add_OutputDataReceived($handler)
        $proc.add_ErrorDataReceived($handler)

        [void]$proc.Start()
        $proc.BeginOutputReadLine()
        $proc.BeginErrorReadLine()
        $Script:ActiveProc = $proc
        $UiTimer.Start()
    }

    $BtnInstall.Add_Click({
        if ($Script:CurrentStep -eq 1) {
            Set-WizardStep -Step 2
        } elseif ($Script:CurrentStep -eq 2 -or $Script:CurrentStep -eq 3) {
            Start-AgentProcess
        }
    })
    $BtnBack.Add_Click({
        if ($Script:CurrentStep -gt 1 -and $Script:ActiveProc -eq $null) {
            Set-WizardStep -Step ($Script:CurrentStep - 1)
        }
    })
    $BtnSelfCheck.Add_Click({ Start-AgentProcess -DiagOnly })
    $BtnOpenLog.Add_Click({
        if (Test-Path $LogPath) {
            Start-Process -FilePath "notepad.exe" -ArgumentList "`"$LogPath`""
        } else {
            [System.Windows.Forms.MessageBox]::Show("Log belum tersedia. Jalankan Preflight atau Build terlebih dahulu.", "CapLab 13 Setup", "OK", "Information") | Out-Null
        }
    })
    $BtnPlayExisting.Add_Click({
        if (Test-Path $DistExe) {
            Stop-StrayGameAndBuildWorkers
            Start-Process -FilePath $DistExe -WorkingDirectory (Split-Path -Parent $DistExe)
            $Form.Close()
        }
    })
    $BtnLaunchGame.Add_Click({
        if (Test-Path $DistExe) {
            Stop-StrayGameAndBuildWorkers
            Start-Process -FilePath $DistExe -WorkingDirectory (Split-Path -Parent $DistExe)
            $Form.Close()
        }
    })

    $Form.Add_Shown({
        $Form.Activate()
        $Form.BringToFront()
    })

    $Form.Add_FormClosing({
        if ($Script:ActiveProc -ne $null -and -not $Script:ActiveProc.HasExited) {
            $res = [System.Windows.Forms.MessageBox]::Show("Proses build sedang berjalan. Batalkan & tutup wizard?", "Konfirmasi", "YesNo", "Warning")
            if ($res -ne [System.Windows.Forms.DialogResult]::Yes) {
                $_.Cancel = $true
                return
            }
            try { $Script:ActiveProc.Kill() } catch {}
        }
    })

    Set-WizardStep -Step 1
    try {
        [void]$Form.ShowDialog()
    } catch {
        [System.Windows.Forms.Application]::Run($Form)
    }
    exit 0
} catch {
    $lineNo = if ($_.InvocationInfo) { $_.InvocationInfo.ScriptLineNumber } else { 0 }
    Write-GuiFatalLog -Stage "WizardRuntime(Line $lineNo)" -Detail "$($_.Exception.ToString()) | legacyErr=$GuiLegacyErrPath"
    exit 2
}
