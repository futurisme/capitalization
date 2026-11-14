import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { SimulationState, ProductId, BrandStrategy, ExecutiveRole } from '../types/game';
import { PRODUCTS, AVAILABLE_EXECUTIVES, CITY_BIOME_META } from '../engine/productsData';
import { formatMoney, roundCurrency } from '../engine/precisionMath';
import {
  saveGameStateToStorage,
  loadGameStateFromStorage,
  exportStateAsJSON,
  importStateFromJSON,
  generateDefaultState,
} from '../engine/saveSystem';
import {
  getSubsidiariesOf,
  updateSubsidiaryDirective,
  appointSubsidiaryCEO,
  transferCapitalToSubsidiary,
  spinOffSubsidiaryIPO,
  DEFAULT_SUBSIDIARY_DIRECTIVE,
} from '../engine/subsidiaryEngine';
import { createInitialGovernment, lobbyGovernmentPolicy } from '../engine/governmentEngine';
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
  GitBranch,
  Landmark,
  Shield,
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
    'profile' | 'executives' | 'subsidiaries' | 'government' | 'ranking' | 'tech' | 'save_system'
  >('profile');
  const [confirmReset, setConfirmReset] = useState(false);
  const [spinName, setSpinName] = useState('');
  const [spinTicker, setSpinTicker] = useState('');
  const [selectedSpinFacIds, setSelectedSpinFacIds] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = state.companies[state.playerCompanyId];

  const subsidiaries = useMemo(
    () => getSubsidiariesOf(state, state.playerCompanyId),
    [state, state.playerCompanyId]
  );

  const availableInvestorsForCeo = useMemo(() => {
    return (state.aiEntityOrder || [])
      .map(id => state.aiEntities?.[id])
      .filter((e): e is NonNullable<typeof e> => Boolean(e && e.role === 'investor'))
      .sort((a, b) => b.opsSkill + b.financeSkill - (a.opsSkill + a.financeSkill))
      .slice(0, 12);
  }, [state.aiEntities, state.aiEntityOrder]);

  const playerOperationalFacilities = useMemo(
    () =>
      Object.values(state.facilities).filter(
        f => f.companyId === state.playerCompanyId && f.type !== 'corporate_hq'
      ),
    [state.facilities, state.playerCompanyId]
  );

  const government = useMemo(
    () => state.government || createInitialGovernment(state),
    [state]
  );

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
            { id: 'profile', label: 'Profil', icon: Building2 },
            { id: 'executives', label: 'C-Suite', icon: Users },
            { id: 'subsidiaries', label: `Anak Usaha (${subsidiaries.length})`, icon: GitBranch },
            { id: 'government', label: 'Pemerintah', icon: Landmark },
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
              className={`flex-1 min-w-[92px] min-h-[40px] px-2.5 rounded-lg font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
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

      {activeSection === 'subsidiaries' && player && (
        <div className="space-y-4">
          <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-sky-400" />
                <h3 className="font-bold text-sm text-white">Kendali CEO atas Anak Usaha (&gt;=50%)</h3>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                {subsidiaries.length} Anak Usaha Aktif
              </span>
            </div>

            {subsidiaries.length === 0 ? (
              <div className="text-slate-400 text-[11px] py-3">
                Anda belum menguasai &gt;=50% saham perusahaan lain. Beli &gt;=50% saham di Bursa Efek atau lakukan Spin-Off IPO fasilitas di bawah ini.
              </div>
            ) : (
              <div className="space-y-3">
                {subsidiaries.map(({ company: sub, ownershipPct }) => {
                  const dir = sub.subsidiaryDirective || DEFAULT_SUBSIDIARY_DIRECTIVE;
                  return (
                    <div
                      key={sub.id}
                      className="bg-[#0d1526] border border-slate-800 rounded-xl p-3.5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-xs text-white flex items-center gap-1.5">
                            <span>{sub.name}</span>
                            <span className="font-mono text-sky-400">({sub.ticker})</span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/70 text-emerald-300 text-[9px] font-mono">
                              Kendali {ownershipPct}%
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums">
                            CEO: {sub.ceoName} · Kas {formatMoney(sub.cash)} · Profit {formatMoney(sub.lastMonthNetProfit)}/bln
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const res = transferCapitalToSubsidiary(state, state.playerCompanyId, sub.id, 500000);
                            if (res.success && res.updatedState) onStateUpdate(res.updatedState);
                            notify(res.message);
                          }}
                          className="min-h-[34px] px-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold"
                        >
                          Injeksi Modal +$500K
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                        <div className="space-y-1">
                          <span className="text-slate-400 block">Kebijakan Ekspansi:</span>
                          <div className="flex gap-1">
                            {(['aggressive', 'balanced', 'cash_cow'] as const).map(mode => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => {
                                  const res = updateSubsidiaryDirective(state, state.playerCompanyId, sub.id, { expansionMode: mode });
                                  if (res.success && res.updatedState) onStateUpdate(res.updatedState);
                                  notify(res.message);
                                }}
                                className={`flex-1 min-h-[28px] rounded border font-semibold capitalize ${
                                  dir.expansionMode === mode
                                    ? 'bg-sky-600 border-sky-400 text-white'
                                    : 'bg-slate-900 border-slate-700 text-slate-300'
                                }`}
                              >
                                {mode === 'cash_cow' ? 'Cash' : mode === 'aggressive' ? 'Agresif' : 'Seimbang'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-slate-400 block">Strategi Harga Ritel:</span>
                          <div className="flex gap-1">
                            {(['discount', 'market', 'premium'] as const).map(ps => (
                              <button
                                key={ps}
                                type="button"
                                onClick={() => {
                                  const res = updateSubsidiaryDirective(state, state.playerCompanyId, sub.id, { priceStrategy: ps });
                                  if (res.success && res.updatedState) onStateUpdate(res.updatedState);
                                  notify(res.message);
                                }}
                                className={`flex-1 min-h-[28px] rounded border font-semibold capitalize ${
                                  dir.priceStrategy === ps
                                    ? 'bg-amber-600 border-amber-400 text-white'
                                    : 'bg-slate-900 border-slate-700 text-slate-300'
                                }`}
                              >
                                {ps}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-slate-400 block">Rasio Dividen &amp; CEO:</span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const res = updateSubsidiaryDirective(state, state.playerCompanyId, sub.id, {
                                  dividendPayoutRatio: dir.dividendPayoutRatio >= 0.7 ? 0.25 : 0.75,
                                });
                                if (res.success && res.updatedState) onStateUpdate(res.updatedState);
                                notify(res.message);
                              }}
                              className="px-2 min-h-[28px] rounded border bg-slate-900 border-slate-700 text-emerald-300 font-mono"
                            >
                              Div {Math.round(dir.dividendPayoutRatio * 100)}%
                            </button>
                            {availableInvestorsForCeo[0] && (
                              <button
                                type="button"
                                onClick={() => {
                                  const res = appointSubsidiaryCEO(
                                    state,
                                    state.playerCompanyId,
                                    sub.id,
                                    availableInvestorsForCeo[0].id
                                  );
                                  if (res.success && res.updatedState) onStateUpdate(res.updatedState);
                                  notify(res.message);
                                }}
                                className="flex-1 min-h-[28px] px-2 rounded border bg-slate-900 border-sky-700/70 text-sky-300 font-semibold truncate"
                              >
                                Tunjuk CEO: {availableInvestorsForCeo[0].name.split(' ')[0]}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Spin-Off Facility to New Listed Subsidiary IPO */}
          <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-sm text-white">Spin-Off Fasilitas Menjadi Anak Usaha IPO (70% Induk)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={spinName}
                onChange={e => setSpinName(e.target.value)}
                placeholder="Nama Anak Usaha (mis: Nusantara Tech Tbk)"
                className="min-h-[38px] px-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
              />
              <input
                type="text"
                value={spinTicker}
                onChange={e => setSpinTicker(e.target.value.toUpperCase())}
                maxLength={5}
                placeholder="Ticker Bursa (mis: NTEC)"
                className="min-h-[38px] px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs uppercase"
              />
            </div>

            {playerOperationalFacilities.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto">
                {playerOperationalFacilities.map(fac => {
                  const checked = selectedSpinFacIds.includes(fac.id);
                  return (
                    <button
                      key={fac.id}
                      type="button"
                      onClick={() =>
                        setSelectedSpinFacIds(prev =>
                          prev.includes(fac.id) ? prev.filter(id => id !== fac.id) : [...prev, fac.id]
                        )
                      }
                      className={`p-2 rounded-xl border text-left text-[11px] flex items-center justify-between ${
                        checked
                          ? 'bg-sky-950/60 border-sky-500 text-white'
                          : 'bg-[#0d1526] border-slate-800 text-slate-300'
                      }`}
                    >
                      <span className="truncate font-semibold">{fac.name}</span>
                      <span className="font-mono text-[10px] text-emerald-400 shrink-0">
                        {formatMoney(fac.monthlyProfit)}/bln
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-slate-400">Bangun minimal 1 fasilitas operasional untuk di-spin-off ke bursa.</div>
            )}

            <button
              type="button"
              disabled={selectedSpinFacIds.length === 0}
              onClick={() => {
                const res = spinOffSubsidiaryIPO(
                  state,
                  state.playerCompanyId,
                  spinName || 'Nusa Venture Tbk',
                  spinTicker || `SUB${subsidiaries.length + 1}`,
                  selectedSpinFacIds,
                  1500000
                );
                if (res.success && res.updatedState) {
                  onStateUpdate(res.updatedState);
                  setSelectedSpinFacIds([]);
                  setSpinName('');
                  setSpinTicker('');
                }
                notify(res.message);
              }}
              className="w-full min-h-[42px] rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs"
            >
              Laksanakan Spin-Off IPO ({selectedSpinFacIds.length} Fasilitas · Modal Awal $1.5M)
            </button>
          </div>
        </div>
      )}

      {activeSection === 'government' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-white">
                <Shield className="w-4 h-4 text-rose-400" />
                <span>Kabinet Pemerintahan Nasional</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono tabular-nums text-[10px]">
                <div className="bg-[#0d1526] p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-sans">Presiden Republik</span>
                  <span className="text-xs font-bold text-white font-sans">{government.presidentName}</span>
                </div>
                <div className="bg-[#0d1526] p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-sans">Menteri Ketenagakerjaan</span>
                  <span className="text-xs font-bold text-sky-300 font-sans">{government.ministerOfLaborName}</span>
                </div>
                <div className="bg-[#0d1526] p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-sans">Pajak Korporasi</span>
                  <span className="text-xs font-bold text-amber-400">{(government.corporateTaxRate * 100).toFixed(0)}%</span>
                </div>
                <div className="bg-[#0d1526] p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-sans">Subsidi Riset R&amp;D</span>
                  <span className="text-xs font-bold text-emerald-400">+{(government.rdSubsidyRate * 100).toFixed(0)}%</span>
                </div>
                <div className="bg-[#0d1526] p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-sans">Upah Minimum</span>
                  <span className="text-xs font-bold text-slate-200">${government.minimumWageFloor.toLocaleString()}</span>
                </div>
                <div className="bg-[#0d1526] p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-sans">Pemilu Berikutnya</span>
                  <span className="text-xs font-bold text-teal-300">Bulan #{government.nextElectionTick}</span>
                </div>
              </div>
            </div>

            <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-2.5">
              <div className="font-bold text-sm text-white">Lobi Kebijakan Pemerintah ($350K / Dekrit)</div>
              <p className="text-[11px] text-slate-400">
                Ajukan usulan insentif ekonomi kepada Presiden, Menaker, atau Wali Kota aktif.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'tax_cut', label: 'Potong Pajak (-2%)' },
                    { id: 'rd_grant', label: 'Hibah R&D (+5%)' },
                    { id: 'land_grant', label: 'Diskon Lahan Kota (+5%)' },
                    { id: 'wage_moderation', label: 'Moderasi Upah (-$200)' },
                  ] as const
                ).map(btn => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => {
                      const res = lobbyGovernmentPolicy(state, btn.id);
                      if (res.success && res.updatedState) onStateUpdate(res.updatedState);
                      notify(res.message);
                    }}
                    className="min-h-[42px] px-2.5 rounded-xl bg-slate-800 hover:bg-sky-600 border border-slate-700 text-white font-bold text-[11px] transition-colors"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-2.5">
            <h3 className="font-bold text-sm text-white">
              Kota &amp; Pemerintah Daerah ({(state.cityOrder || ['city_metro_1']).length}/10 Kota)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {(state.cityOrder || ['city_metro_1']).map(cId => {
                const cObj = state.cities?.[cId] || state.city;
                const biomeLabel = cObj.biome ? CITY_BIOME_META[cObj.biome]?.label : 'Metropolis';
                return (
                  <div
                    key={cId}
                    className="bg-[#0d1526] border border-slate-800 rounded-xl p-3 space-y-1 font-mono tabular-nums text-[10px]"
                  >
                    <div className="flex items-center justify-between font-sans">
                      <span className="font-bold text-xs text-white">{cObj.name}</span>
                      <span className="text-sky-400 font-semibold text-[10px]">{biomeLabel}</span>
                    </div>
                    <div className="text-teal-300 font-sans">Wali Kota: {cObj.mayorName || 'Pj. Daerah'}</div>
                    <div className="flex justify-between text-slate-400 pt-1">
                      <span>Pop {(cObj.population / 1_000_000).toFixed(2)}M</span>
                      <span>Diskon Lahan {Math.round((cObj.landGrantDiscount || 0) * 100)}%</span>
                      <span>Publik {cObj.approvalRating || 72}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-2">
            <h3 className="font-bold text-xs text-slate-200">Lembaran Negara &amp; Pemilu</h3>
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto divide-y divide-slate-800/60 text-[11px]">
              {government.policyLog.map(log => (
                <div key={log.id} className="pt-1.5 first:pt-0 flex items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-sky-300">{log.actorName}</span>{' '}
                    <span className="text-slate-500">({log.roleTitle}):</span>{' '}
                    <span className="text-slate-300">{log.summary}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500 shrink-0">Bln {log.month}</span>
                </div>
              ))}
            </div>
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
