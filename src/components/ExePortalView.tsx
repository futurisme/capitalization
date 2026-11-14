import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Download,
  FileCode2,
  FolderTree,
  HardDrive,
  Play,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  analyzeBuildFailureLog,
  buildSetupAgentCliCommand,
  DeviceToolchainProfile,
  evaluateDeviceToolchainPlan,
  EXE_PROJECT_MODULES,
  getPostInstallCleanupPlan,
  pinpointErrorLocation,
  ProjectModuleCategory,
  simulateWizardBuildRun,
  WizardConfig,
  WizardStepId,
} from '../engine/customSetupAgent';

interface ExePortalViewProps {
  onBackToGame: () => void;
}

const LOG_PRESETS: { id: string; label: string; sample: string }[] = [
  {
    id: 'cpp-ns',
    label: 'C++23 Compile Error',
    sample: `tests\\NativeParityTests.cpp:74:70: error: use of undeclared identifier 'MAP_GRID_SIZE'; did you mean 'caplab::save::MAP_GRID_SIZE'?
Kompilasi tes gagal`,
  },
  {
    id: 'splat',
    label: 'clang -static Char Split',
    sample: `clang-23: error: -E or -x required when input is from standard input
clang-23: error: no such file or directory: 's'
Linking CapLab13Tests.exe gagal`,
  },
  {
    id: 'avx2',
    label: 'AVX2 Illegal (0xC000001D)',
    sample: `  [Test] Menjalankan CapLab13Tests.exe...
  [CRASH] Unhandled Win32 Exception: 0xC000001D
Parity tests gagal! (ExitCode=-1073741795 / 0xC000001D)`,
  },
  {
    id: 'nested',
    label: 'Missing resource.rc',
    sample: `llvm-windres.exe: resources\\resource.rc: No such file or directory
At C:\\Users\\Dev\\CapLab13_Windows11\\builder\\CustomBuildOrchestrator.ps1:248`,
  },
  {
    id: 'cmd-close',
    label: 'GUI Wizard Kode 2 / MotW',
    sample: `[Warn] GUI Wizard gagal dimulai atau berhenti tidak terduga (kode 2).
EnableVisualStyles locked gui_error.log / Cannot convert value "Tls13" to type "System.Net.SecurityProtocolType"`,
  },
];

const WIZARD_STEPS: { id: WizardStepId; num: string; label: string }[] = [
  { id: 'preflight', num: '01', label: 'Preflight' },
  { id: 'configure', num: '02', label: 'Configure' },
  { id: 'build', num: '03', label: 'Build & Pinpoint' },
  { id: 'launch', num: '04', label: 'Launch' },
];

const PROFILE_OPTIONS: { id: DeviceToolchainProfile; label: string; detail: string }[] = [
  {
    id: 'msys2-clang64',
    label: 'MSYS2 / LLVM Lokal',
    detail: 'C:\\msys64\\clang64\\bin\\clang++.exe',
  },
  {
    id: 'msvc-vs2026',
    label: 'MSVC Visual Studio',
    detail: 'vswhere + vcvars64.bat (C++23 /MP)',
  },
  {
    id: 'clean-pc-portable',
    label: 'Windows 11 Bersih',
    detail: 'Unduh 1x LLVM-MinGW ke .toolchain cache',
  },
];

const MODULE_FILTERS: { id: 'all' | 'custom' | 'engine' | 'tests'; label: string }[] = [
  { id: 'all', label: `Semua Modul (${EXE_PROJECT_MODULES.length})` },
  { id: 'custom', label: 'In-House Ecosystem' },
  { id: 'engine', label: 'Custom Engine C++23' },
  { id: 'tests', label: 'Tests & Resources' },
];

const CUSTOM_CATEGORIES: ReadonlySet<ProjectModuleCategory> = new Set([
  'custom-setup',
  'custom-compiler',
  'custom-builder',
  'custom-setup-ui',
  'custom-model',
]);

export const ExePortalView: React.FC<ExePortalViewProps> = ({ onBackToGame }) => {
  const initialAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [activeStep, setActiveStep] = useState<WizardStepId>(
    initialAutostart ? 'build' : 'preflight'
  );
  const [config, setConfig] = useState<WizardConfig>({
    profile: 'msys2-clang64',
    reuseLocalToolchain: true,
    incrementalParallelBuild: true,
    preferDiscreteGpu: true,
    runParityGate: true,
    autoCleanupAndLaunch: true,
    desktopShortcut: true,
  });

  const [preflightVerified, setPreflightVerified] = useState<boolean>(initialAutostart);
  const [moduleFilter, setModuleFilter] = useState<'all' | 'custom' | 'engine' | 'tests'>('all');
  const [buildExecuted, setBuildExecuted] = useState<boolean>(initialAutostart);
  const [cleanupExecuted, setCleanupExecuted] = useState<boolean>(initialAutostart);
  const [logInput, setLogInput] = useState<string>(LOG_PRESETS[0].sample);

  const toolchainPlan = useMemo(
    () =>
      evaluateDeviceToolchainPlan(config.profile, {
        reuseLocalToolchain: config.reuseLocalToolchain,
        incrementalParallelBuild: config.incrementalParallelBuild,
        cpuThreads: 8,
      }),
    [config.profile, config.reuseLocalToolchain, config.incrementalParallelBuild]
  );

  const buildSimulation = useMemo(() => simulateWizardBuildRun(config), [config]);
  const cliCommand = useMemo(() => buildSetupAgentCliCommand(config), [config]);
  const cleanupPlan = useMemo(
    () => getPostInstallCleanupPlan(config.autoCleanupAndLaunch),
    [config.autoCleanupAndLaunch]
  );

  const diagnosticPlan = useMemo(() => analyzeBuildFailureLog(logInput), [logInput]);
  const pinpoint = useMemo(() => pinpointErrorLocation(logInput), [logInput]);

  const filteredModules = useMemo(() => {
    if (moduleFilter === 'all') return EXE_PROJECT_MODULES;
    if (moduleFilter === 'custom') {
      return EXE_PROJECT_MODULES.filter(m => CUSTOM_CATEGORIES.has(m.category));
    }
    if (moduleFilter === 'engine') {
      return EXE_PROJECT_MODULES.filter(m => m.category === 'custom-engine');
    }
    return EXE_PROJECT_MODULES.filter(
      m => m.category === 'tests' || m.category === 'resources'
    );
  }, [moduleFilter]);

  const toggleConfig = (key: keyof Omit<WizardConfig, 'profile'>) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen w-full bg-[#090e1a] text-slate-100 antialiased overflow-y-auto">
      {/* Top Interactive Navigation Header (3 Clean Zones, Single-Row on Desktop) */}
      <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-[#090e1a]/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4 text-sky-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-400 truncate">
                Windows 11 Native · custom-setup-ui/wizard
              </div>
              <h1 className="text-sm md:text-base font-bold text-white truncate">
                CapLab 13 Setup Wizard
              </h1>
            </div>
          </div>

          <nav aria-label="Tahapan Wizard" className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 w-full lg:w-auto">
            {WIZARD_STEPS.map(step => {
              const active = activeStep === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStep(step.id)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                    active
                      ? 'bg-sky-600 border-sky-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {step.num}. {step.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={onBackToGame}
            className="min-h-[38px] px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Kembali ke Simulasi</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Clean 4-Metric KPI Bar (Tabular Nums, Single Elevation, Zero Pills) */}
        <section aria-label="Ringkasan Status Toolchain & Proyek" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Unduhan Data Toolchain</span>
              <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            </div>
            <div className="text-lg font-bold text-white tabular-nums">
              {toolchainPlan.downloadRequiredMb} MB
            </div>
            <div className="text-[11px] text-emerald-400 tabular-nums">
              {toolchainPlan.reusedLocalToolchain
                ? `Reused lokal · Hemat ${toolchainPlan.savedDownloadMb} MB`
                : 'Cache portabel 1x untuk build berikutnya'}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Kesadaran Struktur Proyek</span>
              <FolderTree className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            </div>
            <div className="text-lg font-bold text-white tabular-nums">
              {EXE_PROJECT_MODULES.length} Modul Terpetakan
            </div>
            <div className="text-[11px] text-slate-400">
              Inspeksi O(1) · Zero dependensi pihak ketiga
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Orkestrasi Kompilasi</span>
              <RefreshCw className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            </div>
            <div className="text-lg font-bold text-white tabular-nums">
              {toolchainPlan.parallelJobs} Worker Paralel
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              {config.incrementalParallelBuild ? 'Cache Inkremental Aktif' : 'Full Rebuild Mode'} · ~
              {toolchainPlan.estimatedBuildSeconds}s
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Target Biner Windows 11</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            </div>
            <div className="text-lg font-bold text-white truncate">
              CapLab13Native.exe
            </div>
            <div className="text-[11px] text-slate-400">
              PE32+ x86-64 · Direct2D dGPU · ASLR + NX
            </div>
          </div>
        </section>

        {/* STEP 1: Preflight, Local Device Toolchain Discovery & File Awareness */}
        {activeStep === 'preflight' && (
          <section aria-label="Langkah 1 Preflight" className="space-y-5">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white">
                    01. Deteksi Toolchain Perangkat &amp; Validasi Struktur /exe
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Agen memeriksa compiler C++23 yang sudah ada di perangkat agar tidak mengunduh data berulang.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreflightVerified(true)}
                  className="min-h-[40px] px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{preflightVerified ? 'Scan Ulang Perangkat' : 'Scan Perangkat & Struktur'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {PROFILE_OPTIONS.map(opt => {
                  const selected = config.profile === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setConfig(prev => ({ ...prev, profile: opt.id }));
                        setPreflightVerified(true);
                      }}
                      className={`text-left p-3.5 rounded-xl border transition-colors ${
                        selected
                          ? 'bg-sky-950/50 border-sky-500 text-white'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold">{opt.label}</div>
                      <div className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                        {opt.detail}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-400">
                    Compiler Terdeteksi
                  </div>
                  <div className="font-semibold text-white">{toolchainPlan.detectedCompiler}</div>
                  <div className="font-mono text-[11px] text-sky-300 break-all">
                    {toolchainPlan.discoveredPath}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-400">
                    Strategi Efisiensi Data
                  </div>
                  <p className="text-slate-300 leading-relaxed">{toolchainPlan.strategySummary}</p>
                  <div className="text-[11px] font-medium text-emerald-400">
                    {preflightVerified
                      ? `Status: Preflight valid · ${EXE_PROJECT_MODULES.length} file /exe siap dikompilasi`
                      : 'Klik Scan Perangkat & Struktur atau lanjut ke Konfigurasi'}
                  </div>
                </div>
              </div>
            </div>

            {/* Project Structure Awareness Table */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Peta Kesadaran Struktur Folder /exe
                  </h3>
                  <p className="text-xs text-slate-400">
                    Digunakan SetupAgent &amp; CustomBuildOrchestrator untuk mendeteksi modul hilang atau titik gagal secara instan.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MODULE_FILTERS.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setModuleFilter(f.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors ${
                        moduleFilter === f.id
                          ? 'bg-slate-800 border-sky-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {filteredModules.map(mod => (
                  <div
                    key={mod.path}
                    className="bg-slate-950/70 border border-slate-800/90 rounded-lg px-3 py-2.5 flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-sky-300 truncate">
                        {mod.path}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {mod.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">{mod.role}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPreflightVerified(true);
                    setActiveStep('configure');
                  }}
                  className="min-h-[40px] px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition-colors"
                >
                  Lanjut ke 02. Konfigurasi Build
                </button>
              </div>
            </div>
          </section>
        )}

        {/* STEP 2: Configure Build Strategy & Automation */}
        {activeStep === 'configure' && (
          <section aria-label="Langkah 2 Konfigurasi" className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-5">
            <div>
              <h2 className="text-base font-bold text-white">
                02. Konfigurasi Strategi Kompilasi, Data-Saver &amp; Auto-Launch
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Atur perilaku custom-setup-agent, akselerasi GPU diskret, gerbang paritas, dan terminasi proses otomatis.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  key: 'reuseLocalToolchain' as const,
                  title: 'Gunakan Toolchain Lokal Perangkat (Data-Saver 0 MB)',
                  desc: 'Prioritaskan MSVC / MSYS2 / LLVM / WinGet lokal sebelum mengunduh paket eksternal.',
                },
                {
                  key: 'incrementalParallelBuild' as const,
                  title: 'Kompilasi Paralel Multi-Core + Cache Inkremental',
                  desc: 'Kompilasi C++23 & ParityTests bersamaan via RunspacePool dan lewati objek up-to-date.',
                },
                {
                  key: 'preferDiscreteGpu' as const,
                  title: 'Prioritaskan Discrete GPU (DXGI High-Performance)',
                  desc: 'Pilih VRAM dGPU terbesar di Direct2D serta ekspor hint NvOptimus & AMD PowerXpress.',
                },
                {
                  key: 'runParityGate' as const,
                  title: 'Wajibkan Gerbang Uji Paritas NativeParityTests.cpp',
                  desc: 'Pastikan determinisme modal $10M, merger comp_agro, JSON pretty-print & SEH trap.',
                },
                {
                  key: 'autoCleanupAndLaunch' as const,
                  title: 'Tutup Proses Latar Belakang & Launch Game Otomatis',
                  desc: 'custom-model menghentikan worker build/test redundan lalu meluncurkan CapLab13Native.exe.',
                },
                {
                  key: 'desktopShortcut' as const,
                  title: 'Buat Shortcut Desktop & Start Menu Windows 11',
                  desc: 'Membuat tautan langsung dengan ikon & working directory ke dist\\CapLab13Native.exe.',
                },
              ].map(item => (
                <label
                  key={item.key}
                  className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 hover:border-slate-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={config[item.key]}
                    onChange={() => toggleConfig(item.key)}
                    className="mt-0.5 w-4 h-4 accent-sky-500 rounded cursor-pointer shrink-0"
                  />
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-white">{item.title}</div>
                    <div className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
              <div className="text-[11px] font-medium text-slate-400">
                Perintah CLI SetupAgent yang Dihasilkan
              </div>
              <div className="font-mono text-xs text-emerald-300 break-all">{cliCommand}</div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => setActiveStep('preflight')}
                className="min-h-[40px] px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
              >
                Kembali ke 01. Preflight
              </button>
              <button
                type="button"
                onClick={() => {
                  setBuildExecuted(true);
                  setActiveStep('build');
                }}
                className="min-h-[40px] px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white flex items-center gap-2 transition-colors"
              >
                <Play className="w-4 h-4 shrink-0" />
                <span>Jalankan Build Paralel &amp; Verifikasi</span>
              </button>
            </div>
          </section>
        )}

        {/* STEP 3: Parallel Build Logs & Error Pinpoint Diagnostic Engine */}
        {activeStep === 'build' && (
          <section aria-label="Langkah 3 Build dan Diagnostik" className="space-y-5">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white">
                    03. Eksekusi Build Paralel &amp; Log Ringkas Terstruktur
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                    Estimasi durasi inkremental: {buildSimulation.totalDurationMs} ms · Output:{' '}
                    <span className="font-mono text-slate-200">{buildSimulation.outputBinaryPath}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBuildExecuted(true)}
                    className="min-h-[38px] px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white whitespace-nowrap transition-colors"
                  >
                    Refresh Log Simulasi
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCleanupExecuted(true);
                      setActiveStep('launch');
                    }}
                    className="min-h-[38px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white whitespace-nowrap transition-colors"
                  >
                    Lanjut ke 04. Launch
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-900">
                {buildSimulation.logs.map((entry, idx) => (
                  <div
                    key={`${entry.phase}-${idx}`}
                    className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <span
                        className={`font-mono font-bold shrink-0 w-28 ${
                          entry.level === 'ok'
                            ? 'text-emerald-400'
                            : entry.level === 'warn'
                              ? 'text-amber-400'
                              : 'text-sky-400'
                        }`}
                      >
                        [{entry.phase}]
                      </span>
                      <span className="text-slate-200 leading-relaxed">{entry.message}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                      {buildExecuted ? `${entry.durationMs} ms` : 'siap'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Error Pinpoint & Domino Predictor */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400 shrink-0" />
                  <h3 className="text-sm font-bold text-white">
                    Error Pinpoint &amp; Domino Predictor (custom-setup-agent-model)
                  </h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {LOG_PRESETS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setLogInput(p.sample)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 font-medium transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                aria-label="Log error build Windows 11"
                value={logInput}
                onChange={e => setLogInput(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-hidden focus:border-sky-500"
              />

              {/* Pinpoint Location Strip */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-[11px] font-medium text-slate-400">Lokasi Sumber Terdeteksi</div>
                  <div className="font-mono font-semibold text-amber-300 mt-0.5 break-all">
                    {pinpoint.filePath
                      ? `${pinpoint.filePath}${pinpoint.line ? `:${pinpoint.line}` : ''}${
                          pinpoint.column ? `:${pinpoint.column}` : ''
                        }`
                      : 'Tidak ada baris sumber spesifik'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-400">Peran Modul</div>
                  <div className="text-slate-200 mt-0.5">{pinpoint.moduleRole}</div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-400">Inti Kegagalan</div>
                  <div className="text-slate-300 mt-0.5">{pinpoint.summary}</div>
                </div>
              </div>

              <div className="space-y-3">
                {diagnosticPlan.findings.map(finding => (
                  <div
                    key={finding.code}
                    className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="font-mono font-bold text-amber-300">{finding.code}</span>
                        <span className="text-slate-500">·</span>
                        <span className="font-mono text-sky-300">{finding.repairAction}</span>
                      </div>
                      {diagnosticPlan.hexExitCode && (
                        <span className="font-mono text-[11px] text-rose-400 tabular-nums">
                          Status: {diagnosticPlan.hexExitCode}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{finding.rootCause}</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-1">
                        <div className="text-[11px] font-semibold text-rose-400">
                          Efek Domino yang Dicegah
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                          {finding.dominoRisks.map(risk => (
                            <li key={risk}>{risk}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-slate-900/80 border border-emerald-900/60 rounded-lg p-3 space-y-1">
                        <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Aksi Pemulihan Otomatis Agen</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {finding.automatedFix}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* STEP 4: Background Process Cleanup, Instant Auto-Launch & Downloads */}
        {activeStep === 'launch' && (
          <section aria-label="Langkah 4 Cleanup dan Peluncuran" className="space-y-5">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white">
                    04. Pembersihan Proses Latar Belakang &amp; Peluncuran Game
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    custom-model memastikan tidak ada proses tes atau worker build yang tertinggal sebelum meluncurkan CapLab13Native.exe.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCleanupExecuted(true)}
                  className="min-h-[40px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>
                    {cleanupExecuted
                      ? 'Pembersihan & Peluncuran Siap'
                      : 'Bersihkan Proses & Siapkan Peluncuran'}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cleanupPlan.map(item => (
                  <div
                    key={item.processName}
                    className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-semibold text-white truncate">
                        {item.processName}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-bold shrink-0 ${
                          item.action === 'LAUNCH' ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {item.action}
                      </span>
                    </div>
                    <div className="text-[11px] font-medium text-slate-400">{item.role}</div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Persistent Native Package & Standalone Agent Download Bar */}
        <section aria-label="Unduhan Paket Windows 11 Native" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sky-300 font-semibold text-sm">
                <Download className="w-4 h-4 shrink-0" />
                <span>Paket Sumber C++23 + game.exe + Setup Wizard (.ZIP)</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Berisi source lengkap (<code className="font-mono text-sky-300">src/</code>), launcher{' '}
                <code className="font-mono text-sky-300">game.exe</code>, orkestrator paralel, dan GUI wizard 4-langkah.
              </p>
            </div>
            <a
              href="/exe/CapLab13_Windows11_Native.zip"
              download="CapLab13_Windows11_Native.zip"
              className="min-h-[42px] px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Unduh /exe/CapLab13_Windows11_Native.zip</span>
            </a>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                <Wrench className="w-4 h-4 shrink-0" />
                <span>Skrip Otonom custom_setup_agent/SetupAgent.ps1</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Scan toolchain lokal 0 MB, validasi {EXE_PROJECT_MODULES.length} modul, pembersih proses latar belakang, &amp; peluncur otomatis.
              </p>
            </div>
            <a
              href="/exe/custom_setup_agent/SetupAgent.ps1"
              download="SetupAgent.ps1"
              className="min-h-[42px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <FileCode2 className="w-4 h-4 shrink-0" />
              <span>Unduh /exe/custom_setup_agent/SetupAgent.ps1</span>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
};
