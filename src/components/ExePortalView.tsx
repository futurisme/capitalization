import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Download,
  FileCode2,
  FolderSearch,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import { analyzeBuildFailureLog } from '../engine/customSetupAgent';

interface ExePortalViewProps {
  onBackToGame: () => void;
}

const LOG_PRESETS: { label: string; sample: string }[] = [
  {
    label: 'C++ Compile Error (MAP_GRID_SIZE)',
    sample: `NativeParityTests.cpp:74:70: error: use of undeclared identifier 'MAP_GRID_SIZE'; did you mean 'caplab::save::MAP_GRID_SIZE'?
Kompilasi tes gagal`,
  },
  {
    label: 'Parity Tests Gagal (Reported Log)',
    sample: `=== CapLab 13 Native C++23 Parity & Stress Test Suite ===
Parity tests gagal!
At C:\\Users\\fadhil\\Downloads\\caplab-mobile_-2.5d-business-simulation-engine\\exe\\builder\\CustomBuildOrchestrator.ps1:248`,
  },
  {
    label: 'clang-23 -static Char Split',
    sample: `clang-23: error: -E or -x required when input is from standard input
clang-23: error: no such file or directory: 's'
Linking CapLab13Tests.exe gagal`,
  },
  {
    label: 'AVX2 Illegal Instruction (0xC000001D)',
    sample: `  [Test] Menjalankan CapLab13Tests.exe...
  [CRASH] Unhandled Win32 Exception: 0xC000001D
Parity tests gagal! (ExitCode=-1073741795 / 0xC000001D)`,
  },
  {
    label: 'Nested Extract / Missing resource.rc',
    sample: `llvm-windres.exe: resources\\resource.rc: No such file or directory
CustomBuildOrchestrator.ps1: gagal mengompilasi resource.rc`,
  },
];

export const ExePortalView: React.FC<ExePortalViewProps> = ({ onBackToGame }) => {
  const [logInput, setLogInput] = useState(LOG_PRESETS[0].sample);
  const plan = useMemo(() => analyzeBuildFailureLog(logInput), [logInput]);

  return (
    <div className="min-h-screen w-full bg-[#0b1120] text-slate-100 p-4 md:p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400">
              <Cpu className="w-4 h-4" />
              <span>/exe · Native Windows 11 Build Portal &amp; Interactive Setup Agent</span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold text-white">
              CapLab 13 Native C++23 · Dedicated GPU + Multi-Core CPU + Interactive GUI Installer
            </h1>
          </div>
          <button
            type="button"
            onClick={onBackToGame}
            className="min-h-[42px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Simulasi</span>
          </button>
        </div>

        {/* Direct Download Cards inside /exe directory */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/90 border border-sky-700/50 rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sky-300 font-bold text-sm">
                <Download className="w-4 h-4 shrink-0" />
                <span>Paket Sumber + Custom PE64 + Setup Agent (.ZIP)</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Berisi seluruh kode sumber C++23 (<code className="text-sky-300 font-mono">src/</code>),{' '}
                <code className="text-sky-300 font-mono">game.exe</code> (Interactive Setup GUI Windows 11),
                engine dGPU + CPU multi-core, serta agen pemulihan otomatis{' '}
                <code className="text-sky-300 font-mono">custom_setup_agent/SetupAgent.ps1</code>.
              </p>
            </div>
            <a
              href="/exe/CapLab13_Windows11_Native.zip"
              download="CapLab13_Windows11_Native.zip"
              className="min-h-[44px] px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Unduh /exe/CapLab13_Windows11_Native.zip</span>
            </a>
          </div>

          <div className="bg-slate-900/90 border border-emerald-700/50 rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                <Wrench className="w-4 h-4 shrink-0" />
                <span>Skrip Standalone custom-setup-agent</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Skrip PowerShell otonom tanpa dependensi pihak ketiga: mendeteksi pergeseran folder ZIP,
                memverifikasi smoke-test C++23, memaksa ISA universal x86-64, serta mengulang build otomatis
                hingga 3 siklus saat error terdeteksi.
              </p>
            </div>
            <a
              href="/exe/custom_setup_agent/SetupAgent.ps1"
              download="SetupAgent.ps1"
              className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <FileCode2 className="w-4 h-4" />
              <span>Unduh /exe/custom_setup_agent/SetupAgent.ps1</span>
            </a>
          </div>
        </div>

        {/* 4 Pillars of Self-Repair */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              icon: FolderSearch,
              title: 'Interactive GUI + Preflight Agent',
              desc: 'game.exe membuka Wizard Setup WinForms STA lengkap dengan inspeksi GPU/CPU & log live.',
            },
            {
              icon: ShieldCheck,
              title: 'Dedicated GPU + x86-64 Universal',
              desc: 'DXGI memilih VRAM dGPU tertinggi + baseline x86-64 bebas crash AVX2 0xC000001D.',
            },
            {
              icon: RefreshCw,
              title: 'Multi-Core CPU Simulation Worker',
              desc: 'Simulasi ekonomi & 9 AI kompetitor berjalan di thread CPU terpisah agar UI tetap 60+ FPS.',
            },
            {
              icon: Terminal,
              title: 'Response File & Self-Healing 3x',
              desc: 'Memakai @link.rsp UTF-8, SEH crash trap, & perbaikan otomatis hingga 3 siklus saat error.',
            },
          ].map(card => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1.5"
              >
                <div className="flex items-center gap-2 text-sky-400 font-bold text-xs">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{card.title}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{card.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Deterministic Error Classifier & Domino-Effect Simulator */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Terminal className="w-4 h-4 text-amber-400" />
              <span>Inspektor Diagnostik &amp; Prediktor Domino custom-setup-agent</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LOG_PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setLogInput(p.sample)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 font-medium transition-colors"
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
            rows={4}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-hidden focus:border-sky-500"
          />

          <div className="space-y-3">
            {plan.findings.map(finding => (
              <div
                key={finding.code}
                className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-mono text-xs font-bold text-amber-300">
                      {finding.code}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-sky-950 border border-sky-700/60 text-[10px] font-mono text-sky-300">
                      {finding.repairAction}
                    </span>
                  </div>
                  {plan.hexExitCode && (
                    <span className="font-mono text-[11px] text-rose-400">
                      Status: {plan.hexExitCode}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{finding.rootCause}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
                    <div className="text-[10px] font-bold uppercase text-rose-400">
                      Potensi Efek Domino yang Dicegah
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                      {finding.dominoRisks.map(risk => (
                        <li key={risk}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-slate-900/80 border border-emerald-900/50 rounded-lg p-2.5 space-y-1">
                    <div className="text-[10px] font-bold uppercase text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Tindakan Pemulihan Otomatis Agen</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {finding.automatedFix}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono">
            <span>Auto-Retry CLI: {plan.autoRetryCommand}</span>
            <span className="text-emerald-400">Est. Recovery: ~{plan.estimatedRecoverySeconds}s</span>
          </div>
        </div>
      </div>
    </div>
  );
};
