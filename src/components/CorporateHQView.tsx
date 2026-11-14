import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SimulationState, ProductId, BrandStrategy, ExecutiveRole } from '../types/game';
import { PRODUCTS, AVAILABLE_EXECUTIVES } from '../engine/productsData';
import { formatMoney, roundCurrency } from '../engine/precisionMath';
import {
  saveGameStateToStorage,
  loadGameStateFromStorage,
  exportStateAsJSON,
  importStateFromJSON,
  generateDefaultState,
} from '../engine/saveSystem';
import {
  Building2,
  Save,
  Upload,
  Download,
  RefreshCw,
  Cpu,
  Award,
  CheckCircle2,
  Users,
  Sparkles,
  UserCheck,
  UserMinus,
  Monitor,
} from 'lucide-react';
import { CEOIcon, ProductIcon } from './IconHelper';
import { LeaderboardView } from './LeaderboardView';

interface CorporateHQViewProps {
  state: SimulationState;
  onStateUpdate: (newState: SimulationState) => void;
  onOpenExePortal?: () => void;
}

export function CorporateHQView({
  state,
  onStateUpdate,
  onOpenExePortal,
}: CorporateHQViewProps) {
  const [importJsonText, setImportJsonText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<
    'profile' | 'executives' | 'ranking' | 'tech' | 'save_system'
  >('profile');
  const [confirmReset, setConfirmReset] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = state.companies[state.playerCompanyId];

  const notify = useCallback((msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFeedback(msg);
    timerRef.current = setTimeout(() => {
      setFeedback(null);
      timerRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSaveToStorage = () => {
    const ok = saveGameStateToStorage(state);
    if (ok) notify('Progres berhasil disimpan ke penyimpanan lokal browser.');
  };

  const handleLoadFromStorage = () => {
    const loaded = loadGameStateFromStorage();
    if (loaded) {
      onStateUpdate(loaded);
      notify('Progres permainan berhasil dimuat ulang.');
    } else {
      notify('Belum ditemukan data simpanan lokal.');
    }
  };

  const handleExportJSON = () => {
    const json = exportStateAsJSON(state);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caplab13_save_${state.dateString.replace(' ', '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Berkas JSON cadangan progres berhasil diunduh.');
  };

  const handleImportJSON = () => {
    if (!importJsonText.trim()) return;
    const restored = importStateFromJSON(importJsonText);
    if (restored) {
      onStateUpdate(restored);
      setImportJsonText('');
      notify('Progres JSON berhasil diimpor.');
    } else {
      notify('Format JSON tidak valid atau rusak.');
    }
  };

  const handleConfirmReset = () => {
    const fresh = generateDefaultState();
    saveGameStateToStorage(fresh);
    onStateUpdate(fresh);
    setConfirmReset(false);
    notify('Konglomerasi baru berhasil dimulai dari awal.');
  };

  const handleChangeBrandStrategy = (strategy: BrandStrategy) => {
    if (!player) return;
    onStateUpdate({
      ...state,
      companies: {
        ...state.companies,
        [player.id]: { ...player, brandStrategy: strategy },
      },
    });
    notify(`Strategi merek diubah ke mode ${strategy.toUpperCase()}.`);
  };

  const handleToggleExecutive = (role: ExecutiveRole) => {
    if (!player) return;
    const existingList =
      player.executives && player.executives.length > 0
        ? player.executives
        : AVAILABLE_EXECUTIVES.map(e => ({ ...e, hired: false }));

    const target = existingList.find(e => e.role === role);
    if (!target) return;

    if (!target.hired) {
      if (player.cash < target.monthlySalary) {
        notify(`Kas tidak cukup untuk biaya kontrak awal $${target.monthlySalary.toLocaleString()}.`);
        return;
      }
      const updatedExecs = existingList.map(e => (e.role === role ? { ...e, hired: true } : e));
      onStateUpdate({
        ...state,
        companies: {
          ...state.companies,
          [player.id]: {
            ...player,
            cash: roundCurrency(player.cash - target.monthlySalary),
            executives: updatedExecs,
          },
        },
        newsFeed: [
          {
            id: `news_exec_${Date.now()}`,
            month: state.currentTick,
            category: 'economy' as const,
            title: `Pengangkatan ${role}: ${target.name}`,
            detail: `${player.name} resmi merekrut ${target.name} sebagai ${role} untuk memperkuat efisiensi dan daya saing korporasi.`,
          },
          ...state.newsFeed,
        ].slice(0, 25),
      });
      notify(`${target.name} resmi bergabung sebagai ${role}.`);
    } else {
      const updatedExecs = existingList.map(e => (e.role === role ? { ...e, hired: false } : e));
      onStateUpdate({
        ...state,
        companies: {
          ...state.companies,
          [player.id]: {
            ...player,
            executives: updatedExecs,
          },
        },
      });
      notify(`Kontrak ${target.name} (${role}) telah diakhiri.`);
    }
  };

  const handleSetResearchTarget = (prodId: ProductId) => {
    if (!player) return;
    onStateUpdate({
      ...state,
      companies: {
        ...state.companies,
        [player.id]: { ...player, activeResearchProduct: prodId },
      },
    });
    notify(`Fokus riset R&D korporat diarahkan ke ${PRODUCTS[prodId].name}.`);
  };

  const execList =
    player?.executives && player.executives.length > 0
      ? player.executives
      : AVAILABLE_EXECUTIVES.map(e => ({ ...e, hired: false }));

  const totalExecPayroll = execList
    .filter(e => e.hired)
    .reduce((sum, e) => sum + e.monthlySalary, 0);

  return (
    <div className="p-4 pb-24 md:pb-6 max-w-7xl mx-auto space-y-4 text-xs select-none">
      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar bg-[#11192c] p-1 rounded-xl border border-slate-800/80">
        {(
          [
            { id: 'profile', label: 'Profil & Merek', icon: Building2 },
            { id: 'executives', label: 'C-Suite', icon: Users },
            { id: 'ranking', label: 'Peringkat', icon: Award },
            { id: 'tech', label: 'Riset & R&D', icon: Cpu },
            { id: 'save_system', label: 'Simpan', icon: Save },
          ] as const
        ).map(tab => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`flex-1 min-w-[96px] min-h-[40px] px-2.5 rounded-lg font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                active
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-sky-950/80 border border-sky-800/80 text-sky-200 flex items-center gap-2 animate-fade-in font-medium">
          <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {activeSection === 'profile' && player && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Executive Dossier Card */}
          <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-3">
              <CEOIcon
                companyId={player.id}
                personality={player.personality}
                color={player.color}
                accentColor={player.accentColor}
                alt={player.name}
                className="w-13 h-13 rounded-2xl shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-black text-base text-white truncate">{player.name}</h2>
                  <span className="font-mono text-xs font-black text-sky-400 shrink-0">
                    ({player.ticker})
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 font-medium mt-0.5">
                  CEO: {player.ceoName} · {player.sectorFocus || 'Konglomerasi Terbuka'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  Didirikan: Jan 2026 · {player.facilitiesCount} Fasilitas Aktif
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-800/80 font-mono tabular-nums text-[10px]">
              <div className="bg-[#0d1526] border border-slate-800/80 p-2.5 rounded-xl">
                <span className="text-slate-400 block">Total Aset</span>
                <span className="text-sm font-bold text-white">
                  {formatMoney(player.totalAssets)}
                </span>
              </div>
              <div className="bg-[#0d1526] border border-slate-800/80 p-2.5 rounded-xl">
                <span className="text-slate-400 block">Ekuitas Bersih</span>
                <span className="text-sm font-bold text-emerald-400">
                  {formatMoney(player.bookValue)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Corporate Brand Rating</span>
                <span className="font-mono tabular-nums font-bold text-amber-400">
                  {player.corporateBrandRating || 45} / 100
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full"
                  style={{ width: `${player.corporateBrandRating || 45}%` }}
                />
              </div>
            </div>
          </div>

          {/* Brand Strategy Selector & Share Structure */}
          <div className="space-y-4">
            <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold text-xs text-white">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Strategi Merek Korporasi (CapLab Brand Strategy)</span>
              </div>
              <div className="space-y-2">
                {(
                  [
                    {
                      id: 'generic',
                      title: 'Merek Unik / Produk Individual',
                      desc: 'Setiap cabang membangun brand sendiri dari awal. Hemat biaya awal.',
                    },
                    {
                      id: 'range',
                      title: 'Range Brand (Lini Kategori)',
                      desc: 'Menjaga keseimbangan brand di tiap kategori produk serupa.',
                    },
                    {
                      id: 'corporate',
                      title: 'Corporate Brand (Payung Korporat)',
                      desc: 'Seluruh cabang mewarisi 35% Corporate Brand & sinergi Stasiun Media.',
                    },
                  ] as const
                ).map(opt => {
                  const selected = player.brandStrategy === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleChangeBrandStrategy(opt.id)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-colors ${
                        selected
                          ? 'bg-sky-950/60 border-sky-500 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs">{opt.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="font-bold text-xs text-slate-200">Struktur Modal & Saham</h3>
              <div className="space-y-1.5 font-mono tabular-nums text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Saham Beredar:</span>
                  <span className="text-slate-200 font-bold">
                    {player.sharesOutstanding.toLocaleString()} lbr
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Saham Buyback:</span>
                  <span className="text-slate-200 font-bold">
                    {player.treasuryShares.toLocaleString()} lbr
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Dividen Aktif:</span>
                  <span className="text-emerald-400 font-bold">
                    ${player.dividendPerShare}/lbr
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'executives' && player && (
        <div className="space-y-3">
          <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-white">Dewan Eksekutif C-Suite</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Rekrut eksekutif untuk mengotomatiskan operasional, mempercepat riset, dan menekan
                bunga pinjaman.
              </p>
            </div>
            <div className="font-mono tabular-nums text-right">
              <div className="text-[10px] text-slate-400">Total Gaji Eksekutif</div>
              <div className="text-sm font-bold text-amber-400">
                ${totalExecPayroll.toLocaleString()}/bln
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {execList.map(exec => (
              <div
                key={exec.id}
                className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-3 ${
                  exec.hired
                    ? 'bg-slate-800/80 border-emerald-500/70'
                    : 'bg-[#11192c] border-slate-800/80'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-[10px] uppercase tracking-wider text-sky-400">
                        {exec.role} · {exec.hired ? 'Aktif' : 'Tersedia'}
                      </span>
                      <h4 className="font-bold text-sm text-white mt-0.5">{exec.name}</h4>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-xs font-bold text-emerald-400">
                        Skill {exec.skillRating}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        ${exec.monthlySalary.toLocaleString()}/bln
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">
                    {exec.specialty}
                  </p>
                </div>

                <button
                  onClick={() => handleToggleExecutive(exec.role)}
                  className={`w-full min-h-[44px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                    exec.hired
                      ? 'bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800'
                      : 'bg-sky-600 hover:bg-sky-500 text-white'
                  }`}
                >
                  {exec.hired ? (
                    <>
                      <UserMinus className="w-4 h-4" />
                      <span>Berhentikan Kontrak</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Rekrut {exec.role} (Bonus ${exec.monthlySalary.toLocaleString()})</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'ranking' && <LeaderboardView state={state} />}

      {activeSection === 'tech' && player && (
        <div className="space-y-3">
          <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-white">Paten &amp; Tingkat Teknologi (R&amp;D)</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Pilih satu produk sebagai <strong>Fokus Riset Utama</strong> agar Pusat R&amp;D terus
                menaikkan kualitasnya.
              </p>
            </div>
            {player.activeResearchProduct && (
              <div className="text-[11px] font-mono text-sky-400 font-bold">
                Riset Aktif: {PRODUCTS[player.activeResearchProduct]?.name}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {(Object.keys(PRODUCTS) as ProductId[]).map(pId => {
              const prod = PRODUCTS[pId];
              const tech = player.techLevels[pId] || 30;
              const isFocus = player.activeResearchProduct === pId;

              return (
                <div
                  key={pId}
                  className={`p-3 rounded-xl border ${
                    isFocus
                      ? 'bg-sky-950/40 border-sky-500'
                      : 'bg-[#11192c] border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ProductIcon
                        id={pId}
                        alt={prod.name}
                        className="w-8 h-8 rounded-lg shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-white truncate">{prod.name}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{prod.category}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tabular-nums text-sky-400 font-bold text-xs">
                        {tech}/100
                      </span>
                      <button
                        onClick={() => handleSetResearchTarget(pId)}
                        className={`min-h-[34px] px-2.5 rounded-lg text-[10px] font-bold transition-colors ${
                          isFocus
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {isFocus ? 'Fokus Aktif' : 'Riset'}
                      </button>
                    </div>
                  </div>

                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mt-2.5">
                    <div className="bg-sky-500 h-full rounded-full" style={{ width: `${tech}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeSection === 'save_system' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-200 font-bold text-xs">
              <Save className="w-4 h-4 text-emerald-400" />
              <span>Penyimpanan Progres Cerdas (LocalStorage)</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Setiap pergantian bulan tersimpan otomatis di perangkat Anda. Gunakan tombol di bawah
              untuk simpan manual atau memulihkan sesi sebelumnya.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleSaveToStorage}
                className="min-h-[44px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Sekarang</span>
              </button>
              <button
                onClick={handleLoadFromStorage}
                className="min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                <span>Muat Terakhir</span>
              </button>
            </div>

            {/* Inline Reset Confirmation */}
            <div className="pt-3 border-t border-slate-800">
              {!confirmReset ? (
                <button
                  onClick={() => setConfirmReset(true)}
                  className="w-full min-h-[44px] rounded-xl bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Mulai Konglomerasi Baru (Reset Total)</span>
                </button>
              ) : (
                <div className="bg-rose-950/50 border border-rose-800 rounded-xl p-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-rose-200 font-semibold">
                    Hapus progres saat ini dan mulai ulang?
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="min-h-[38px] px-3 rounded-lg bg-slate-800 text-slate-200 font-bold"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleConfirmReset}
                      className="min-h-[38px] px-3 rounded-lg bg-rose-600 text-white font-bold"
                    >
                      Ya, Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-200 font-bold text-xs">
              <Download className="w-4 h-4 text-amber-400" />
              <span>Ekspor & Impor Berkas JSON</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Unduh cadangan JSON untuk memindahkan permainan antar ponsel atau komputer.
            </p>

            <button
              onClick={handleExportJSON}
              className="w-full min-h-[44px] rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Cadangan (.JSON)</span>
            </button>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <label
                htmlFor="import-json-textarea"
                className="text-[10px] text-slate-400 font-semibold uppercase block"
              >
                Impor dari Teks JSON:
              </label>
              <textarea
                id="import-json-textarea"
                value={importJsonText}
                onChange={e => setImportJsonText(e.target.value)}
                placeholder="Tempel isi file JSON simpanan di sini..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-[11px] font-mono text-slate-300 focus:outline-hidden focus:border-sky-500"
              />
              <button
                onClick={handleImportJSON}
                disabled={!importJsonText.trim()}
                className={`w-full min-h-[44px] rounded-xl text-xs font-bold transition-colors ${
                  importJsonText.trim()
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                }`}
              >
                Pulihkan dari JSON
              </button>
            </div>
          </div>

          <div className="md:col-span-2 bg-[#11192c] border border-sky-800/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-sky-300 font-bold text-xs">
                <Monitor className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Unduh Edisi Native Windows 11 (.ZIP + game.exe + custom-setup-agent)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed max-w-2xl">
                Paket sumber C++23, kompiler kustom PE32+ (<code className="text-sky-300 font-mono">game.exe</code>),
                serta agen pemulihan otonom (<code className="text-sky-300 font-mono">SetupAgent.ps1</code>).
                Ekstrak ZIP dan klik ganda <code className="text-sky-300 font-mono">game.exe</code> untuk build paralel bebas intervensi.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onOpenExePortal && (
                <button
                  type="button"
                  onClick={onOpenExePortal}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Cpu className="w-4 h-4 shrink-0" />
                  <span>Buka Portal /exe</span>
                </button>
              )}
              <a
                href="/exe/CapLab13_Windows11_Native.zip"
                download="CapLab13_Windows11_Native.zip"
                className="min-h-[44px] px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Unduh Paket .ZIP</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
