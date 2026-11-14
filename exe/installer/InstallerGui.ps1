<#
.SYNOPSIS
    CapLab 13 Native - Interactive Windows 11 Setup GUI & Built-In Custom Agent
    Zero third-party dependencies: System.Windows.Forms + System.Drawing + SetupAgent.ps1
#>
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

# Ensure Single-Threaded Apartment for WinForms reliability
if ([System.Threading.Thread]::CurrentThread.ApartmentState -ne [System.Threading.ApartmentState]::STA) {
    $psArgs = @("-NoLogo", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-ProjectRoot", $ProjectRoot)
    $p = Start-Process -FilePath "powershell.exe" -ArgumentList $psArgs -PassThru -Wait
    exit $p.ExitCode
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

function Resolve-InstallerRoot {
    param([string]$Hint)
    $candidates = @($Hint, (Split-Path -Parent $PSScriptRoot), (Get-Location).Path)
    foreach ($c in $candidates) {
        if (-not $c -or -not (Test-Path $c)) { continue }
        $full = (Resolve-Path $c).Path
        if ((Test-Path (Join-Path $full "src\core\Types.hpp")) -and
            (Test-Path (Join-Path $full "custom_setup_agent\SetupAgent.ps1"))) {
            return $full
        }
        $hit = Get-ChildItem -Path $full -Filter "SetupAgent.ps1" -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) {
            return (Split-Path -Parent (Split-Path -Parent $hit.FullName))
        }
    }
    return $Hint
}

$RootDir = Resolve-InstallerRoot -Hint $ProjectRoot
$AgentScript = Join-Path $RootDir "custom_setup_agent\SetupAgent.ps1"
$DistExe = Join-Path $RootDir "dist\CapLab13Native.exe"
$LogPath = Join-Path $RootDir "build_native\setup_agent_report.log"

# Hardware & System Preflight Scan
$CpuCores = [Environment]::ProcessorCount
$RamGb = "Unknown"
try {
    $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop
    $RamGb = "{0:N1} GB" -f ($cs.TotalPhysicalMemory / 1GB)
} catch {}

$GpuLabel = "Direct3D 11 Hardware"
$GpuVramMb = 0
$HasDiscreteGpu = $false
try {
    $gpus = Get-CimInstance -ClassName Win32_VideoController -ErrorAction Stop
    foreach ($g in $gpus) {
        if ($g.Name -match "Microsoft Basic|Remote|RDP") { continue }
        $vramMb = if ($g.AdapterRAM) { [math]::Round([uint64]$g.AdapterRAM / 1MB) } else { 0 }
        if ($vramMb -ge $GpuVramMb) {
            $GpuVramMb = $vramMb
            $GpuLabel = $g.Name
            if ($g.Name -match "NVIDIA|Radeon|AMD|GeForce|RTX|GTX|Arc" -or $vramMb -ge 2048) {
                $HasDiscreteGpu = $true
            }
        }
    }
} catch {}

$IsAdmin = $false
try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr = New-Object Security.Principal.WindowsPrincipal($id)
    $IsAdmin = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch {}

$HasCl = [bool](Get-Command cl.exe -ErrorAction SilentlyContinue)
$HasToolchain = $HasCl -or [bool](Get-ChildItem -Path (Join-Path $RootDir ".toolchain") -Filter "clang++.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)

# Palette (Capitalism Lab Dark Executive Slate)
$ColVoid    = [System.Drawing.Color]::FromArgb(9, 14, 26)
$ColHeader  = [System.Drawing.Color]::FromArgb(14, 21, 37)
$ColCard    = [System.Drawing.Color]::FromArgb(18, 28, 48)
$ColBorder  = [System.Drawing.Color]::FromArgb(51, 65, 85)
$ColSky     = [System.Drawing.Color]::FromArgb(14, 165, 233)
$ColSkyDim  = [System.Drawing.Color]::FromArgb(2, 132, 199)
$ColEmerald = [System.Drawing.Color]::FromArgb(16, 185, 129)
$ColAmber   = [System.Drawing.Color]::FromArgb(245, 158, 11)
$ColRose    = [System.Drawing.Color]::FromArgb(244, 63, 94)
$ColText    = [System.Drawing.Color]::FromArgb(248, 250, 252)
$ColMuted   = [System.Drawing.Color]::FromArgb(148, 163, 184)

$FontTitle = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$FontBold  = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$FontReg   = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
$FontMono  = New-Object System.Drawing.Font("Consolas", 8.5, [System.Drawing.FontStyle]::Regular)

$Form = New-Object System.Windows.Forms.Form
$Form.Text = "CapLab 13 Native - Interactive Setup & Custom Build Agent"
$Form.Size = New-Object System.Drawing.Size(880, 620)
$Form.MinimumSize = New-Object System.Drawing.Size(800, 560)
$Form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$Form.BackColor = $ColVoid
$Form.ForeColor = $ColText
$Form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
$Form.MaximizeBox = $false

# Header Bar
$HeaderPanel = New-Object System.Windows.Forms.Panel
$HeaderPanel.Location = New-Object System.Drawing.Point(0, 0)
$HeaderPanel.Size = New-Object System.Drawing.Size(880, 56)
$HeaderPanel.BackColor = $ColHeader
$Form.Controls.Add($HeaderPanel)

$LblBrand = New-Object System.Windows.Forms.Label
$LblBrand.Text = "CAPLAB 13 NATIVE  ·  WINDOWS 11 SETUP & CUSTOM AGENT"
$LblBrand.Font = $FontTitle
$LblBrand.ForeColor = $ColText
$LblBrand.Location = New-Object System.Drawing.Point(18, 8)
$LblBrand.Size = New-Object System.Drawing.Size(660, 24)
$HeaderPanel.Controls.Add($LblBrand)

$LblSub = New-Object System.Windows.Forms.Label
$LblSub.Text = "Zero-Dependency C++23 Parallel Builder · Dedicated GPU Renderer · Multi-Core CPU Simulation"
$LblSub.Font = $FontReg
$LblSub.ForeColor = $ColSky
$LblSub.Location = New-Object System.Drawing.Point(18, 32)
$LblSub.Size = New-Object System.Drawing.Size(680, 18)
$HeaderPanel.Controls.Add($LblSub)

$LblAdminBadge = New-Object System.Windows.Forms.Label
$LblAdminBadge.Text = if ($IsAdmin) { "ADMIN MODE" } else { "USER MODE" }
$LblAdminBadge.Font = $FontBold
$LblAdminBadge.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$LblAdminBadge.BackColor = if ($IsAdmin) { [System.Drawing.Color]::FromArgb(6, 78, 59) } else { [System.Drawing.Color]::FromArgb(120, 53, 15) }
$LblAdminBadge.ForeColor = if ($IsAdmin) { $ColEmerald } else { $ColAmber }
$LblAdminBadge.Location = New-Object System.Drawing.Point(744, 15)
$LblAdminBadge.Size = New-Object System.Drawing.Size(110, 26)
$HeaderPanel.Controls.Add($LblAdminBadge)

# Hardware Preflight Card
$HwPanel = New-Object System.Windows.Forms.Panel
$HwPanel.Location = New-Object System.Drawing.Point(16, 68)
$HwPanel.Size = New-Object System.Drawing.Size(416, 138)
$HwPanel.BackColor = $ColCard
$HwPanel.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$Form.Controls.Add($HwPanel)

$LblHwTitle = New-Object System.Windows.Forms.Label
$LblHwTitle.Text = "PREFLIGHT HARDWARE & TOOLCHAIN"
$LblHwTitle.Font = $FontBold
$LblHwTitle.ForeColor = $ColSky
$LblHwTitle.Location = New-Object System.Drawing.Point(12, 8)
$LblHwTitle.Size = New-Object System.Drawing.Size(390, 18)
$HwPanel.Controls.Add($LblHwTitle)

$gpuSummary = if ($HasDiscreteGpu) { "$GpuLabel (Dedicated GPU Priority)" } else { "$GpuLabel (Auto Hardware Adapter)" }
$tcSummary = if ($HasToolchain) { "C++23 Toolchain Siap (Cached / MSVC)" } else { "LLVM-MinGW C++23 akan diunduh otomatis" }
$LblHwInfo = New-Object System.Windows.Forms.Label
$LblHwInfo.Text = "CPU Worker : $CpuCores Logical Threads (AI & Economy Offload)`r`nMemori RAM : $RamGb`r`nGPU Render : $gpuSummary`r`nToolchain  : $tcSummary`r`nFolder Root: $RootDir"
$LblHwInfo.Font = $FontMono
$LblHwInfo.ForeColor = $ColText
$LblHwInfo.Location = New-Object System.Drawing.Point(12, 32)
$LblHwInfo.Size = New-Object System.Drawing.Size(392, 98)
$HwPanel.Controls.Add($LblHwInfo)

# Options & Agent Configuration Card
$OptPanel = New-Object System.Windows.Forms.Panel
$OptPanel.Location = New-Object System.Drawing.Point(444, 68)
$OptPanel.Size = New-Object System.Drawing.Size(412, 138)
$OptPanel.BackColor = $ColCard
$OptPanel.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$Form.Controls.Add($OptPanel)

$LblOptTitle = New-Object System.Windows.Forms.Label
$LblOptTitle.Text = "OPSI INSTALASI & CUSTOM SETUP AGENT"
$LblOptTitle.Font = $FontBold
$LblOptTitle.ForeColor = $ColSky
$LblOptTitle.Location = New-Object System.Drawing.Point(12, 8)
$LblOptTitle.Size = New-Object System.Drawing.Size(386, 18)
$OptPanel.Controls.Add($LblOptTitle)

$ChkShortcuts = New-Object System.Windows.Forms.CheckBox
$ChkShortcuts.Text = "Buat Shortcut Desktop & Start Menu (CapLab 13 Native)"
$ChkShortcuts.Checked = $true
$ChkShortcuts.Font = $FontReg
$ChkShortcuts.ForeColor = $ColText
$ChkShortcuts.Location = New-Object System.Drawing.Point(14, 34)
$ChkShortcuts.Size = New-Object System.Drawing.Size(386, 22)
$OptPanel.Controls.Add($ChkShortcuts)

$ChkGpuPref = New-Object System.Windows.Forms.CheckBox
$ChkGpuPref.Text = "Prioritaskan Dedicated GPU (Windows Graphics HighPerf)"
$ChkGpuPref.Checked = $true
$ChkGpuPref.Font = $FontReg
$ChkGpuPref.ForeColor = $ColText
$ChkGpuPref.Location = New-Object System.Drawing.Point(14, 58)
$ChkGpuPref.Size = New-Object System.Drawing.Size(386, 22)
$OptPanel.Controls.Add($ChkGpuPref)

$ChkParity = New-Object System.Windows.Forms.CheckBox
$ChkParity.Text = "Jalankan Verifikasi Parity & Stress Test (CapLab13Tests)"
$ChkParity.Checked = $true
$ChkParity.Font = $FontReg
$ChkParity.ForeColor = $ColText
$ChkParity.Location = New-Object System.Drawing.Point(14, 82)
$ChkParity.Size = New-Object System.Drawing.Size(386, 22)
$OptPanel.Controls.Add($ChkParity)

$ChkAutoLaunch = New-Object System.Windows.Forms.CheckBox
$ChkAutoLaunch.Text = "Luncurkan CapLab13Native.exe otomatis setelah instalasi selesai"
$ChkAutoLaunch.Checked = $true
$ChkAutoLaunch.Font = $FontReg
$ChkAutoLaunch.ForeColor = $ColText
$ChkAutoLaunch.Location = New-Object System.Drawing.Point(14, 106)
$ChkAutoLaunch.Size = New-Object System.Drawing.Size(386, 22)
$OptPanel.Controls.Add($ChkAutoLaunch)

# Agent Stage & Progress Bar
$LblStage = New-Object System.Windows.Forms.Label
$LblStage.Text = "Siap menjalankan instalasi otomatis. Klik [Instal & Bangun Sekarang] untuk memulai."
$LblStage.Font = $FontBold
$LblStage.ForeColor = $ColText
$LblStage.Location = New-Object System.Drawing.Point(16, 216)
$LblStage.Size = New-Object System.Drawing.Size(640, 20)
$Form.Controls.Add($LblStage)

$LblAgentStatus = New-Object System.Windows.Forms.Label
$LblAgentStatus.Text = "Agent Status: Standby"
$LblAgentStatus.Font = $FontMono
$LblAgentStatus.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight
$LblAgentStatus.ForeColor = $ColEmerald
$LblAgentStatus.Location = New-Object System.Drawing.Point(656, 216)
$LblAgentStatus.Size = New-Object System.Drawing.Size(200, 20)
$Form.Controls.Add($LblAgentStatus)

$ProgressBar = New-Object System.Windows.Forms.ProgressBar
$ProgressBar.Location = New-Object System.Drawing.Point(16, 240)
$ProgressBar.Size = New-Object System.Drawing.Size(840, 14)
$ProgressBar.Minimum = 0
$ProgressBar.Maximum = 100
$ProgressBar.Value = 0
$Form.Controls.Add($ProgressBar)

# Live Agent Log Console
$TxtLog = New-Object System.Windows.Forms.TextBox
$TxtLog.Location = New-Object System.Drawing.Point(16, 264)
$TxtLog.Size = New-Object System.Drawing.Size(840, 250)
$TxtLog.Multiline = $true
$TxtLog.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
$TxtLog.ReadOnly = $true
$TxtLog.WordWrap = $false
$TxtLog.BackColor = [System.Drawing.Color]::FromArgb(6, 10, 18)
$TxtLog.ForeColor = [System.Drawing.Color]::FromArgb(203, 213, 225)
$TxtLog.Font = $FontMono
$TxtLog.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$Form.Controls.Add($TxtLog)

# Bottom Action Buttons
$BtnInstall = New-Object System.Windows.Forms.Button
$BtnInstall.Text = "Instal & Bangun Sekarang"
$BtnInstall.Font = $FontBold
$BtnInstall.BackColor = $ColSkyDim
$BtnInstall.ForeColor = $ColText
$BtnInstall.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$BtnInstall.Location = New-Object System.Drawing.Point(16, 526)
$BtnInstall.Size = New-Object System.Drawing.Size(220, 40)
$Form.Controls.Add($BtnInstall)

$BtnSelfCheck = New-Object System.Windows.Forms.Button
$BtnSelfCheck.Text = "Diagnostik Agent"
$BtnSelfCheck.Font = $FontBold
$BtnSelfCheck.BackColor = $ColCard
$BtnSelfCheck.ForeColor = $ColMuted
$BtnSelfCheck.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$BtnSelfCheck.Location = New-Object System.Drawing.Point(246, 526)
$BtnSelfCheck.Size = New-Object System.Drawing.Size(148, 40)
$Form.Controls.Add($BtnSelfCheck)

$BtnOpenLog = New-Object System.Windows.Forms.Button
$BtnOpenLog.Text = "Buka Log"
$BtnOpenLog.Font = $FontBold
$BtnOpenLog.BackColor = $ColCard
$BtnOpenLog.ForeColor = $ColMuted
$BtnOpenLog.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$BtnOpenLog.Location = New-Object System.Drawing.Point(404, 526)
$BtnOpenLog.Size = New-Object System.Drawing.Size(108, 40)
$Form.Controls.Add($BtnOpenLog)

$BtnLaunchGame = New-Object System.Windows.Forms.Button
$BtnLaunchGame.Text = "Mainkan CapLab 13 Native"
$BtnLaunchGame.Font = $FontBold
$BtnLaunchGame.BackColor = $ColEmerald
$BtnLaunchGame.ForeColor = $ColVoid
$BtnLaunchGame.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$BtnLaunchGame.Enabled = (Test-Path $DistExe)
$BtnLaunchGame.Location = New-Object System.Drawing.Point(626, 526)
$BtnLaunchGame.Size = New-Object System.Drawing.Size(230, 40)
$Form.Controls.Add($BtnLaunchGame)

$Script:ActiveProc = $null
$Script:LogQueue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$Script:ExitFlag = $false
$Script:LastExitCode = -1

function Append-ConsoleLine {
    param([string]$Line)
    if ($null -eq $Line) { return }
    $TxtLog.AppendText("$Line`r`n")
    if ($Line -match '\[1/3\]') { $ProgressBar.Value = 18; $LblStage.Text = "Tahap 1/3: Memeriksa & menyiapkan toolchain C++23..." }
    elseif ($Line -match '\[Download\]|\[Extract\]') { $ProgressBar.Value = [Math]::Max($ProgressBar.Value, 32); $LblStage.Text = "Mengunduh & mengekstrak toolchain portabel..." }
    elseif ($Line -match '\[2/3\]') { $ProgressBar.Value = 45; $LblStage.Text = "Tahap 2/3: Kompilasi paralel GPU + Engine C++23..." }
    elseif ($Line -match '\[CC\]') { $ProgressBar.Value = [Math]::Min(78, $ProgressBar.Value + 2) }
    elseif ($Line -match '\[Test\]') { $ProgressBar.Value = 82; $LblStage.Text = "Menjalankan CapLab13Tests.exe (Parity & 120-bln Stress Test)..." }
    elseif ($Line -match '\[3/3\]') { $ProgressBar.Value = 92; $LblStage.Text = "Tahap 3/3: Membuat Shortcut & registrasi GPU..." }
    elseif ($Line -match '\[Done\]|verified cleanly') { $ProgressBar.Value = 100 }
    elseif ($Line -match 'self-repair|Auto-Repair|Purging') {
        $LblAgentStatus.Text = "Agent: Self-Healing Active"
        $LblAgentStatus.ForeColor = $ColAmber
    }
}

function Set-UiRunningState {
    param([bool]$Running)
    $BtnInstall.Enabled = -not $Running
    $BtnSelfCheck.Enabled = -not $Running
    $ChkShortcuts.Enabled = -not $Running
    $ChkGpuPref.Enabled = -not $Running
    $ChkParity.Enabled = -not $Running
    $ChkAutoLaunch.Enabled = -not $Running
}

function Register-DiscreteGpuPreference {
    param([string]$ExePath)
    if (-not (Test-Path $ExePath)) { return }
    try {
        $regPath = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
        if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
        Set-ItemProperty -Path $regPath -Name $ExePath -Value "GpuPreference=2;" -Type String -Force
        $Script:LogQueue.Enqueue("[GPU] Windows DirectX GpuPreference=2 (High Performance dGPU) diterapkan untuk $ExePath")
    } catch {
        $Script:LogQueue.Enqueue("[GPU-Warn] Lewati registrasi HKCU GpuPreference ($($_.Exception.Message))")
    }
}

$UiTimer = New-Object System.Windows.Forms.Timer
$UiTimer.Interval = 90
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
        Set-UiRunningState -Running $false

        if ($code -eq 0 -and (Test-Path $DistExe)) {
            if ($ChkGpuPref.Checked) { Register-DiscreteGpuPreference -ExePath $DistExe }
            $ProgressBar.Value = 100
            $LblStage.Text = "Instalasi & build selesai sempurna! CapLab13Native.exe siap dijalankan."
            $LblStage.ForeColor = $ColEmerald
            $LblAgentStatus.Text = "Agent: Verified OK"
            $LblAgentStatus.ForeColor = $ColEmerald
            $BtnLaunchGame.Enabled = $true
            $BtnInstall.Text = "Bangun Ulang (Re-Verify)"
            if ($ChkAutoLaunch.Checked) {
                Start-Process -FilePath $DistExe -WorkingDirectory (Split-Path -Parent $DistExe)
            }
        } else {
            $LblStage.Text = "Setup berhenti dengan kode $code. Gunakan [Buka Log] atau [Instal & Bangun Sekarang] untuk retry."
            $LblStage.ForeColor = $ColRose
            $LblAgentStatus.Text = "Agent: Recovery Needed ($code)"
            $LblAgentStatus.ForeColor = $ColRose
            $BtnInstall.Text = "Retry Self-Repair Build"
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

    Set-UiRunningState -Running $true
    $ProgressBar.Value = 6
    $LblStage.ForeColor = $ColText
    $LblStage.Text = if ($DiagOnly) { "Menjalankan diagnostik preflight custom-setup-agent..." } else { "Memulai Custom Setup Agent (Max 3 Self-Repair Cycles)..." }
    $LblAgentStatus.Text = "Agent: Running"
    $LblAgentStatus.ForeColor = $ColSky
    $TxtLog.Clear()

    $env:CAPLAB_CREATE_SHORTCUTS = if ($ChkShortcuts.Checked) { "1" } else { "0" }
    $env:CAPLAB_RUN_TESTS = if ($ChkParity.Checked) { "1" } else { "0" }

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

$BtnInstall.Add_Click({ Start-AgentProcess })
$BtnSelfCheck.Add_Click({ Start-AgentProcess -DiagOnly })
$BtnOpenLog.Add_Click({
    if (Test-Path $LogPath) {
        Start-Process -FilePath "notepad.exe" -ArgumentList "`"$LogPath`""
    } else {
        [System.Windows.Forms.MessageBox]::Show("Log belum tersedia. Jalankan Instalasi atau Diagnostik terlebih dahulu.", "CapLab 13 Setup", "OK", "Information") | Out-Null
    }
})
$BtnLaunchGame.Add_Click({
    if (Test-Path $DistExe) {
        Start-Process -FilePath $DistExe -WorkingDirectory (Split-Path -Parent $DistExe)
        $Form.Close()
    }
})

$Form.Add_FormClosing({
    if ($Script:ActiveProc -ne $null -and -not $Script:ActiveProc.HasExited) {
        $res = [System.Windows.Forms.MessageBox]::Show("Proses build sedang berjalan. Batalkan & tutup installer?", "Konfirmasi", "YesNo", "Warning")
        if ($res -ne [System.Windows.Forms.DialogResult]::Yes) {
            $_.Cancel = $true
            return
        }
        try { $Script:ActiveProc.Kill() } catch {}
    }
})

Append-ConsoleLine "CapLab 13 Interactive Installer GUI + Embedded custom-setup-agent siap."
Append-ConsoleLine "Direktori Proyek: $RootDir"
Append-ConsoleLine "Hardware Terdeteksi: $CpuCores Threads | RAM $RamGb | GPU: $gpuSummary"
[void]$Form.ShowDialog()
if (Test-Path $DistExe) { exit 0 } else { exit 1 }
