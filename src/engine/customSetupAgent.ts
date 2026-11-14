/**
 * Pure in-house diagnostic engine, toolchain discovery planner, project structure
 * awareness registry, process-cleanup orchestrator, and wizard state model
 * (`custom-setup-agent-model`) for CapLab 13 Windows 11 Native.
 *
 * Zero third-party libraries. Standard TypeScript only.
 */

export type RepairActionId =
  | 'REPAIR_CPP_SOURCE_AND_RETRY'
  | 'USE_RESPONSE_FILE_AND_STRING_ARRAYS'
  | 'FORCE_BASELINE_X86_64'
  | 'INJECT_8MB_STACK_RESERVE'
  | 'STATIC_OR_STAGE_RUNTIME_DLLS'
  | 'RECOVER_DIRECTORY_LAYOUT'
  | 'FIX_LAUNCHER_TLS_MOTW_AND_PAUSE'
  | 'CLEAN_OBJ_AND_VERIFY_TOOLCHAIN'
  | 'CLEAN_REPROVISION_AND_RETRY';

export interface DiagnosticFinding {
  code: string;
  severity: 'critical' | 'high' | 'medium';
  repairAction: RepairActionId;
  rootCause: string;
  dominoRisks: string[];
  automatedFix: string;
}

export interface SetupAgentPlan {
  detectedExitCode: number | null;
  hexExitCode: string | null;
  findings: DiagnosticFinding[];
  autoRetryCommand: string;
  estimatedRecoverySeconds: number;
}

export type ProjectModuleCategory =
  | 'custom-engine'
  | 'custom-model'
  | 'custom-setup'
  | 'custom-compiler'
  | 'custom-builder'
  | 'custom-setup-ui'
  | 'resources'
  | 'tests';

export interface ProjectModuleInfo {
  path: string;
  category: ProjectModuleCategory;
  role: string;
  critical: boolean;
}

export const EXE_PROJECT_MODULES: readonly ProjectModuleInfo[] = [
  {
    path: 'src/core/Types.hpp',
    category: 'custom-engine',
    role: 'Model data inti, struct perusahaan, & konstanta fixed-point/layout',
    critical: true,
  },
  {
    path: 'src/core/PrecisionMath.hpp',
    category: 'custom-engine',
    role: 'Aritmetika moneter int64 bebas drift floating-point & margin unit',
    critical: true,
  },
  {
    path: 'src/core/JsonSerializer.hpp',
    category: 'custom-engine',
    role: 'Deklarasi parser & writer JSON in-house tanpa pustaka eksternal',
    critical: true,
  },
  {
    path: 'src/core/JsonSerializer.cpp',
    category: 'custom-engine',
    role: 'Serialisasi JSON pre-allocated buffer (128 KB) cepat untuk Save/Load',
    critical: true,
  },
  {
    path: 'src/engine/EconomyEngine.hpp',
    category: 'custom-engine',
    role: 'Antarmuka mesin simulasi ekonomi supply-chain & R&D C++23',
    critical: true,
  },
  {
    path: 'src/engine/EconomyEngine.cpp',
    category: 'custom-engine',
    role: 'Simulasi produksi, retail demand, saham, obligasi & M&A real-time',
    critical: true,
  },
  {
    path: 'src/engine/AICompetitor.hpp',
    category: 'custom-model',
    role: 'Header model perilaku & keputusan 9 konglomerat AI',
    critical: true,
  },
  {
    path: 'src/engine/AICompetitor.cpp',
    category: 'custom-model',
    role: 'Eksekusi taktis AI dengan threshold paralel adaptif bebas overhead thread',
    critical: true,
  },
  {
    path: 'src/engine/SaveSystem.hpp',
    category: 'custom-engine',
    role: 'Deklarasi skenario preset, save state, & peta 240 parsel',
    critical: true,
  },
  {
    path: 'src/engine/SaveSystem.cpp',
    category: 'custom-engine',
    role: 'Generator dunia awal ($10M modal) & snapshot paritas TypeScript<->C++',
    critical: true,
  },
  {
    path: 'src/engine/SimulationWorker.hpp',
    category: 'custom-engine',
    role: 'Kontrol worker simulasi latar belakang lock-free/mutex aman UI',
    critical: true,
  },
  {
    path: 'src/engine/SimulationWorker.cpp',
    category: 'custom-engine',
    role: 'Offloading tick simulasi ke thread CPU terpisah agar render tetap >60 FPS',
    critical: true,
  },
  {
    path: 'src/graphics/D2DRenderer.hpp',
    category: 'custom-engine',
    role: 'Abstraksi renderer Direct2D / DirectWrite Windows 11 High-DPI',
    critical: true,
  },
  {
    path: 'src/graphics/D2DRenderer.cpp',
    category: 'custom-engine',
    role: 'Selektor VRAM dGPU DXGI, clip-depth guard, & fast-path quad tanpa PathGeometry',
    critical: true,
  },
  {
    path: 'src/platform/Win32Hardware.hpp',
    category: 'custom-engine',
    role: 'Header deteksi GPU, CPU thread, & elevasi jendela Win32 modern',
    critical: true,
  },
  {
    path: 'src/platform/Win32Hardware.cpp',
    category: 'custom-engine',
    role: 'DXGI/WMI hardware probe & work-area clamping bebas terpotong taskbar',
    critical: true,
  },
  {
    path: 'src/ui/GameWindow.hpp',
    category: 'custom-setup-ui',
    role: 'Deklarasi viewport 2.5D isometrik & panel HUD interaktif native',
    critical: true,
  },
  {
    path: 'src/ui/GameWindow.cpp',
    category: 'custom-setup-ui',
    role: 'Loop UI interaktif, kontrol kecepatan, pasar saham & peta properti',
    critical: true,
  },
  {
    path: 'src/main.cpp',
    category: 'custom-engine',
    role: 'Entry point wWinMain dengan NvOptimus/AMD dGPU hints & graceful exit',
    critical: true,
  },
  {
    path: 'tests/NativeParityTests.cpp',
    category: 'tests',
    role: 'Gerbang verifikasi paritas deterministik $10M, M&A, JSON & SEH crash trap',
    critical: true,
  },
  {
    path: 'resources/resource.rc',
    category: 'resources',
    role: 'Manifest High-DPI PerMonitorV2 & metadata versi biner PE32+ Windows 11',
    critical: true,
  },
  {
    path: 'builder/CustomBuildOrchestrator.ps1',
    category: 'custom-builder',
    role: 'Orkestrator build paralel RunspacePool, cache inkremental & scan compiler lokal',
    critical: true,
  },
  {
    path: 'custom_setup_agent/SetupAgent.ps1',
    category: 'custom-setup',
    role: 'Agen pemulihan mandiri 3-siklus, pembersih proses & auto-launcher biner',
    critical: true,
  },
  {
    path: 'custom_compiler/custom_pe64_compiler.py',
    category: 'custom-compiler',
    role: 'Perakit & penerjemah in-house .casm -> PE32+ x86-64 (GUI & CUI) dengan checksum & manifest',
    critical: true,
  },
  {
    path: 'builder/cli_probe.casm',
    category: 'custom-compiler',
    role: 'Modul biner CUI konsol native x86-64 (UTF-8 astr + Win32 Console) hasil custom_pe64_compiler',
    critical: true,
  },
  {
    path: 'installer/InstallerGui.ps1',
    category: 'custom-setup-ui',
    role: 'Wizard Setup WinForms 4-langkah dengan isolasi EnableVisualStyles & gui_exception.log non-lock',
    critical: true,
  },
  {
    path: 'installer/LaunchInstaller.bat',
    category: 'custom-setup',
    role: 'Elevation launcher UAC STA tahan spasi path dengan pembacaan gui_exception.log & fallback CLI',
    critical: true,
  },
] as const;

export interface ErrorPinpoint {
  filePath: string | null;
  line: number | null;
  column: number | null;
  moduleRole: string;
  summary: string;
}

export type DeviceToolchainProfile =
  | 'msys2-clang64'
  | 'msvc-vs2026'
  | 'clean-pc-portable';

export interface ToolchainDiscoveryPlan {
  profile: DeviceToolchainProfile;
  detectedCompiler: string;
  discoveredPath: string;
  reusedLocalToolchain: boolean;
  downloadRequiredMb: number;
  savedDownloadMb: number;
  incrementalCacheEnabled: boolean;
  parallelJobs: number;
  estimatedBuildSeconds: number;
  strategySummary: string;
}

export interface ProcessCleanupEntry {
  processName: string;
  role: string;
  action: 'TERMINATE' | 'LAUNCH';
  reason: string;
}

export type WizardStepId = 'preflight' | 'configure' | 'build' | 'launch';

export interface WizardConfig {
  profile: DeviceToolchainProfile;
  reuseLocalToolchain: boolean;
  incrementalParallelBuild: boolean;
  preferDiscreteGpu: boolean;
  runParityGate: boolean;
  autoCleanupAndLaunch: boolean;
  desktopShortcut: boolean;
}

export interface WizardBuildLogEntry {
  phase: string;
  message: string;
  level: 'info' | 'ok' | 'warn';
  durationMs: number;
}

export function extractExitCode(logText: string): number | null {
  const hexMatch = logText.match(/0x[0-9a-fA-F]{8}/);
  if (hexMatch) {
    return parseInt(hexMatch[0], 16) >> 0;
  }
  const codeMatch = logText.match(/(?:ExitCode|kode|code)\s*[=:]?\s*(-?\d+)/i);
  if (codeMatch) {
    const parsed = Number.parseInt(codeMatch[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatHexNtStatus(code: number | null): string | null {
  if (code === null || !Number.isFinite(code)) return null;
  const unsigned = code >>> 0;
  return `0x${unsigned.toString(16).toUpperCase().padStart(8, '0')}`;
}

export function pinpointErrorLocation(rawLog: string): ErrorPinpoint {
  const log = rawLog || '';
  const cppMatch = log.match(
    /([A-Za-z0-9_./\\-]+\.(?:cpp|hpp|c|h|rc)):(\d+):(?:(\d+):)?\s*(?:fatal )?error:\s*([^\r\n]+)/i
  );
  if (cppMatch) {
    const normalizedFile = cppMatch[1].replace(/\\/g, '/');
    const matchedMod = EXE_PROJECT_MODULES.find(
      m => normalizedFile.endsWith(m.path) || normalizedFile.endsWith(m.path.split('/').pop() || '')
    );
    return {
      filePath: cppMatch[1],
      line: Number.parseInt(cppMatch[2], 10),
      column: cppMatch[3] ? Number.parseInt(cppMatch[3], 10) : null,
      moduleRole: matchedMod
        ? `${matchedMod.category} (${matchedMod.role})`
        : 'Modul sumber native C++23',
      summary: cppMatch[4].trim(),
    };
  }

  const psMatch = log.match(/At\s+([^\r\n:]+\.ps1):(\d+)/i);
  if (psMatch) {
    const normalizedFile = psMatch[1].replace(/\\/g, '/');
    const matchedMod = EXE_PROJECT_MODULES.find(
      m => normalizedFile.endsWith(m.path) || normalizedFile.endsWith(m.path.split('/').pop() || '')
    );
    return {
      filePath: psMatch[1],
      line: Number.parseInt(psMatch[2], 10),
      column: null,
      moduleRole: matchedMod
        ? `${matchedMod.category} (${matchedMod.role})`
        : 'Skrip orkestrator build PowerShell',
      summary: 'Kegagalan eksekusi skrip orkestrator pada baris target.',
    };
  }

  const rcMatch = log.match(/(resources[\\/]+resource\.rc)/i);
  if (rcMatch) {
    return {
      filePath: rcMatch[1],
      line: null,
      column: null,
      moduleRole: 'resources (Manifest & versi biner PE32+ Windows 11)',
      summary: 'Resource compiler tidak menemukan file manifest/resource di $ProjectRoot.',
    };
  }

  return {
    filePath: null,
    line: null,
    column: null,
    moduleRole: 'Runtime / Linker / Environment Gate',
    summary: 'Error terjadi pada fase linking, ABI runtime, atau pemeriksaan lingkungan eksekusi.',
  };
}

export function analyzeBuildFailureLog(
  rawLog: string,
  explicitExitCode?: number
): SetupAgentPlan {
  const log = rawLog || '';
  const exitCode = explicitExitCode !== undefined ? explicitExitCode : extractExitCode(log);
  const hexCode = formatHexNtStatus(exitCode);
  const findings: DiagnosticFinding[] = [];

  if (
    log.includes('-E or -x required') ||
    /no such file or directory:\s*'s'/i.test(log)
  ) {
    findings.push({
      code: 'PS_ARRAY_SPLAT_CHAR_SPLIT',
      severity: 'critical',
      repairAction: 'USE_RESPONSE_FILE_AND_STRING_ARRAYS',
      rootCause:
        'PowerShell 5.1 unwrapped a 1-element array (@("-static")) into a scalar string, splitting characters during @staticFlags splatting.',
      dominoRisks: [
        'Linking fails identically for both CapLab13Tests.exe and CapLab13Native.exe.',
        'Partial .o artifacts may persist with stale flags on subsequent runs.',
      ],
      automatedFix:
        'Enforce [string[]] typing, write UTF-8 no-BOM @link_tests.rsp / @link_native.rsp response files, and purge build_native\\obj.',
    });
  }

  const cppErrorMatch = log.match(
    /([^\r\n:]+\.(?:cpp|hpp|c|h)):(\d+):(?:\d+:)?\s*error:\s*([^\r\n]+)/i
  );
  if (cppErrorMatch) {
    const didYouMean = log.match(/did you mean\s*'([^']+)'/i);
    findings.push({
      code: 'CPP_SOURCE_COMPILE_ERROR',
      severity: 'critical',
      repairAction: 'REPAIR_CPP_SOURCE_AND_RETRY',
      rootCause: `C++23 compile error at ${cppErrorMatch[1]}:${cppErrorMatch[2]} — ${cppErrorMatch[3].trim()}`,
      dominoRisks: [
        'Unclassified source errors would falsely purge the 182 MB verified .toolchain\\ cache and trigger slow redundant downloads.',
        'Test executable fails to link before Step 2 parity suite runs.',
      ],
      automatedFix: didYouMean
        ? `Preserve smoke-verified local/.toolchain cache (0 MB re-download), apply scoped fix ('${didYouMean[1]}'), and re-compile incrementally (~4s).`
        : 'Preserve smoke-verified local/.toolchain cache (0 MB re-download), pinpoint failing line cleanly without NativeCommandError noise.',
    });
  }

  if (
    exitCode === -1073741795 ||
    hexCode === '0xC000001D' ||
    /0xC000001D|STATUS_ILLEGAL_INSTRUCTION/i.test(log)
  ) {
    findings.push({
      code: 'CPU_ISA_ILLEGAL_INSTRUCTION',
      severity: 'critical',
      repairAction: 'FORCE_BASELINE_X86_64',
      rootCause:
        'Compiled binary executed AVX2/FMA instructions (-march=x86-64-v3 or /arch:AVX2) unsupported by host CPU.',
      dominoRisks: [
        'CapLab13Tests.exe crashes mid-startup before flushing C++ stdio buffers.',
        'Final CapLab13Native.exe would likewise crash immediately on launch across non-AVX2 Windows 11 systems.',
      ],
      automatedFix:
        'Switch compiler flags to universal baseline -march=x86-64 -mtune=generic (SSE2), invalidate .build_fingerprint, clean objects, and rebuild.',
    });
  }

  if (
    exitCode === -1073741571 ||
    hexCode === '0xC00000FD' ||
    /0xC00000FD|STACK_OVERFLOW/i.test(log)
  ) {
    findings.push({
      code: 'STACK_OVERFLOW_EXHAUSTION',
      severity: 'high',
      repairAction: 'INJECT_8MB_STACK_RESERVE',
      rootCause:
        'Default 1MB Windows PE thread stack exhausted during deep simulation or recursive UI layout.',
      dominoRisks: [
        'Multi-year stress benchmarks and deep JSON parse trees abort unpredictably.',
      ],
      automatedFix:
        'Inject -Wl,--stack,8388608 (or /STACK:8388608) into link response files and re-run test suite.',
    });
  }

  if (
    exitCode === -1073741515 ||
    hexCode === '0xC0000135' ||
    /libstdc\+\+|libc\+\+|libwinpthread|DLL.*not found/i.test(log)
  ) {
    findings.push({
      code: 'MISSING_RUNTIME_DLL',
      severity: 'high',
      repairAction: 'STATIC_OR_STAGE_RUNTIME_DLLS',
      rootCause:
        'MinGW/C++ runtime DLLs missing from working directory or PATH.',
      dominoRisks: [
        'Test executable fails silently with 0xC0000135 before reaching main().',
      ],
      automatedFix:
        'Verify -static linkage in @response file or fall back cleanly with staged runtime DLLs in dist\\ and build_native\\.',
    });
  }

  if (/Tls13|SecurityProtocolType|Zone\.Identifier|ExecutionPolicy|WindowStyle Hidden|InstallerGui\.ps1|MemorySize|ParserError|UnexpectedToken|EnableVisualStyles|gui_error\.log|kode 2|â\?/i.test(log)) {
    findings.push({
      code: 'POWERSHELL_LAUNCH_OR_TLS_BLOCK',
      severity: 'critical',
      repairAction: 'FIX_LAUNCHER_TLS_MOTW_AND_PAUSE',
      rootCause:
        'PowerShell 5.1 startup atau WinForms wizard terhenti (kode 2) akibat VisualStyles exception, bentrok kunci file gui_error.log, UTF-8 without BOM ANSI dash, Tls13 cast, atau Zone.Identifier.',
      dominoRisks: [
        'Double-clicking game.exe memicu GUI exit code 2 tanpa rincian stderr karena 2>gui_error.log mengunci file.',
        'CLI fallback dapat meninggalkan jendela konsol menggantung atau salah memparsing path berkarakter !.',
      ],
      automatedFix:
        'Isolasi EnableVisualStyles/Font agar non-fatal, tulis error UI ke gui_exception.log (bebas lock NTFS), jalankan Unblock-File, gunakan CLI 4-tahap ringkas, dan tutup konsol otomatis 2 detik setelah game diluncurkan.',
    });
  }

  if (
    /No such file or directory|Cannot open (include|source) file|resource\.rc/i.test(log) &&
    !findings.some(f => f.code === 'PS_ARRAY_SPLAT_CHAR_SPLIT')
  ) {
    findings.push({
      code: 'PATH_OR_FILE_MISPLACED',
      severity: 'high',
      repairAction: 'RECOVER_DIRECTORY_LAYOUT',
      rootCause:
        'ZIP extraction nesting or shifted working directory detached builder from src\\core\\Types.hpp or resources\\resource.rc.',
      dominoRisks: [
        'rc.exe / windres fails before C++ compilation starts.',
        'Include resolution (-I src) cannot locate engine headers.',
      ],
      automatedFix:
        'Run O(1) Test-ProjectFileStructure scan, relocate $ProjectRoot, clear Zone.Identifier only on affected files, and re-run.',
    });
  }

  if (/\[FAIL\]|Parity tests gagal|Summary:.*failed|0xC0000005/i.test(log)) {
    findings.push({
      code: 'PARITY_TEST_OR_MEMORY_FAULT',
      severity: 'critical',
      repairAction: 'CLEAN_OBJ_AND_VERIFY_TOOLCHAIN',
      rootCause:
        'Native parity assertion failed, buffered stdout hid diagnostics prior to crash, or incremental .o/.obj mismatch occurred.',
      dominoRisks: [
        'CapLab13Native.exe deployment blocked by Step 2 parity gate.',
        'Mixing MSVC/GCC/Clang/AVX2 objects creates silent ABI corruption.',
      ],
      automatedFix:
        'Terminate stray workers, flush unbuffered test output with SEH trap diagnostics, purge stale build_native\\obj cache, and auto-retry build.',
    });
  }

  if (findings.length === 0) {
    findings.push({
      code: 'TOOLCHAIN_INTEGRITY_AND_CACHE_GUARD',
      severity: 'medium',
      repairAction: 'CLEAN_REPROVISION_AND_RETRY',
      rootCause:
        'No specific fatal token matched; pre-emptive environment hygiene & smoke verification recommended.',
      dominoRisks: [
        'Corrupted partial LLVM-MinGW archives or Windows Mark-of-the-Web blocks can stall PowerShell scripts.',
      ],
      automatedFix:
        'Clear Zone.Identifier MotW streams selectively, verify cached .smoke_verified signature, and trigger autonomous retry cycle.',
    });
  }

  return {
    detectedExitCode: exitCode,
    hexExitCode: hexCode,
    findings,
    autoRetryCommand:
      'powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\\custom_setup_agent\\SetupAgent.ps1 -AutoLaunchGame',
    estimatedRecoverySeconds: findings.some(f => f.repairAction === 'CLEAN_REPROVISION_AND_RETRY')
      ? 18
      : 5,
  };
}

export function evaluateDeviceToolchainPlan(
  profile: DeviceToolchainProfile,
  options?: { reuseLocalToolchain?: boolean; incrementalParallelBuild?: boolean; cpuThreads?: number }
): ToolchainDiscoveryPlan {
  const reuse = options?.reuseLocalToolchain ?? true;
  const incremental = options?.incrementalParallelBuild ?? true;
  const jobs = Math.max(2, Math.min(16, options?.cpuThreads ?? 8));

  if (profile === 'msvc-vs2026' && reuse) {
    return {
      profile,
      detectedCompiler: 'MSVC cl.exe + link.exe + rc.exe (Visual Studio 2022/2026)',
      discoveredPath: 'C:\\Program Files\\Microsoft Visual Studio\\2026\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat',
      reusedLocalToolchain: true,
      downloadRequiredMb: 0,
      savedDownloadMb: 182,
      incrementalCacheEnabled: incremental,
      parallelJobs: jobs,
      estimatedBuildSeconds: incremental ? 4 : 9,
      strategySummary:
        'Data-Saver Aktif: MSVC lokal ditemukan via vswhere/registry; 0 MB diunduh, build paralel C++23 multi-core.',
    };
  }

  if (profile === 'msys2-clang64' && reuse) {
    return {
      profile,
      detectedCompiler: 'LLVM-MinGW / MSYS2 clang++ (C++23 + lld-link + llvm-windres)',
      discoveredPath: 'C:\\msys64\\clang64\\bin\\clang++.exe',
      reusedLocalToolchain: true,
      downloadRequiredMb: 0,
      savedDownloadMb: 182,
      incrementalCacheEnabled: incremental,
      parallelJobs: jobs,
      estimatedBuildSeconds: incremental ? 3 : 8,
      strategySummary:
        'Data-Saver Aktif: LLVM/Clang lokal digunakan ulang tanpa unduhan ulang (hemat 182 MB kuota) + RunspacePool.',
    };
  }

  return {
    profile,
    detectedCompiler: 'LLVM-MinGW 2025.x Portable x86-64 (.toolchain cache)',
    discoveredPath: '.\\.toolchain\\llvm-mingw\\bin\\clang++.exe',
    reusedLocalToolchain: false,
    downloadRequiredMb: 182,
    savedDownloadMb: 0,
    incrementalCacheEnabled: incremental,
    parallelJobs: jobs,
    estimatedBuildSeconds: incremental ? 22 : 34,
    strategySummary:
      'PC Bersih tanpa compiler lokal: mengunduh 1x LLVM-MinGW Portable ke .toolchain\\ dan men-cache selamanya untuk build berikutnya.',
  };
}

export function getPostInstallCleanupPlan(autoLaunch: boolean): ProcessCleanupEntry[] {
  const entries: ProcessCleanupEntry[] = [
    {
      processName: 'CapLab13Tests.exe',
      role: 'Parity & Stress Verification Runner',
      action: 'TERMINATE',
      reason: 'Menghentikan runner tes jika masih menggantung setelah gerbang verifikasi selesai.',
    },
    {
      processName: 'CapLab13Native.exe (instance lama)',
      role: 'Binary Game Sebelumnya',
      action: 'TERMINATE',
      reason: 'Membebaskan kunci file dist\\CapLab13Native.exe serta mengosongkan VRAM/RAM lama.',
    },
    {
      processName: 'clang++ / lld-link / cl / rc (worker build lokal)',
      role: 'Child Subprocesses Orkestrator',
      action: 'TERMINATE',
      reason: 'Menutup worker kompilasi/linking latar belakang di pohon folder proyek agar CPU idle 0%.',
    },
  ];

  if (autoLaunch) {
    entries.push({
      processName: 'dist\\CapLab13Native.exe',
      role: 'Executable Native Direct2D + dGPU CapLab 13',
      action: 'LAUNCH',
      reason: 'Diluncurkan seketika oleh custom-model tepat setelah seluruh proses latar belakang dibersihkan.',
    });
  }

  return entries;
}

export function buildSetupAgentCliCommand(config: WizardConfig): string {
  const parts = [
    'powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\\custom_setup_agent\\SetupAgent.ps1',
  ];
  if (config.autoCleanupAndLaunch) {
    parts.push('-AutoLaunchGame');
  }
  if (!config.desktopShortcut) {
    parts.push('-SkipShortcut');
  }
  return parts.join(' ');
}

export function simulateWizardBuildRun(config: WizardConfig): {
  logs: WizardBuildLogEntry[];
  toolchain: ToolchainDiscoveryPlan;
  cleanupPlan: ProcessCleanupEntry[];
  outputBinaryPath: string;
  totalDurationMs: number;
} {
  const toolchain = evaluateDeviceToolchainPlan(config.profile, {
    reuseLocalToolchain: config.reuseLocalToolchain,
    incrementalParallelBuild: config.incrementalParallelBuild,
    cpuThreads: 8,
  });

  const compileMs = config.incrementalParallelBuild ? 1420 : 4180;
  const testMs = config.runParityGate ? 340 : 0;

  const logs: WizardBuildLogEntry[] = [
    {
      phase: '1/4 Preflight',
      message: `Project root & ${EXE_PROJECT_MODULES.length} modul /exe terverifikasi; Zone.Identifier dibersihkan & proses lama dihentikan.`,
      level: 'ok',
      durationMs: 42,
    },
    {
      phase: '2/4 Toolchain',
      message: toolchain.reusedLocalToolchain
        ? `Reused local toolchain @ ${toolchain.discoveredPath} (0 MB downloaded, hemat ${toolchain.savedDownloadMb} MB) | Smoke C++23 OK.`
        : `Provisioned portable toolchain @ ${toolchain.discoveredPath} (${toolchain.downloadRequiredMb} MB cached) | Smoke C++23 OK.`,
      level: toolchain.reusedLocalToolchain ? 'ok' : 'warn',
      durationMs: toolchain.reusedLocalToolchain ? 18 : 650,
    },
    {
      phase: '3/4 Compile',
      message: config.incrementalParallelBuild
        ? `Parallel (${toolchain.parallelJobs} workers): kompilasi inkremental C++23 + link @link_tests.rsp / @link_native.rsp + verify PE64.`
        : `Parallel (${toolchain.parallelJobs} workers): full rebuild 15 modul C++23 & CapLab13Tests.exe.`,
      level: 'info',
      durationMs: compileMs,
    },
  ];

  if (config.runParityGate) {
    logs.push({
      phase: '4/4 Parity',
      message:
        'CapLab13Tests.exe [PASS] Ringkas: seluruh uji $10M, merger comp_agro, JSON & SEH lulus tanpa cetak baris berlebih.',
      level: 'ok',
      durationMs: testMs,
    });
  } else {
    logs.push({
      phase: '4/4 Parity',
      message: 'Gerbang Parity Test dilewati sesuai konfigurasi wizard.',
      level: 'warn',
      durationMs: 0,
    });
  }

  logs.push({
    phase: 'Link-PE32+',
    message: `Link statis dist\\CapLab13Native.exe (ASLR + NX + 8MB Stack${config.preferDiscreteGpu ? ' + dGPU priority' : ''}).`,
    level: 'ok',
    durationMs: 280,
  });

  const cleanupPlan = getPostInstallCleanupPlan(config.autoCleanupAndLaunch);
  logs.push({
    phase: 'Cleanup-Model',
    message: config.autoCleanupAndLaunch
      ? `Terminasi ${cleanupPlan.filter(c => c.action === 'TERMINATE').length} proses latar belakang -> Launch CapLab13Native.exe (konsol CLI auto-close 2s).`
      : `Terminasi ${cleanupPlan.filter(c => c.action === 'TERMINATE').length} proses latar belakang selesai; biner siap dijalankan.`,
    level: 'ok',
    durationMs: 35,
  });

  const totalDurationMs = logs.reduce((acc, item) => acc + item.durationMs, 0);

  return {
    logs,
    toolchain,
    cleanupPlan,
    outputBinaryPath: 'dist\\CapLab13Native.exe',
    totalDurationMs,
  };
}
