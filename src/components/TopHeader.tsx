import { useState, useRef, useEffect } from 'react';
import { SimulationState } from '../types/game';
import { formatMoney } from '../engine/precisionMath';
import {
  Play,
  Pause,
  SkipForward,
  Bell,
  TrendingUp,
  TrendingDown,
  X,
} from 'lucide-react';
import { CEOIcon } from './IconHelper';

interface TopHeaderProps {
  state: SimulationState;
  onTogglePause: () => void;
  onChangeSpeed: (speed: 1 | 2 | 5) => void;
  onAdvanceMonth: () => void;
}

export function TopHeader({
  state,
  onTogglePause,
  onChangeSpeed,
  onAdvanceMonth,
}: TopHeaderProps) {
  const [showNewsModal, setShowNewsModal] = useState(false);
  const backdropDownRef = useRef(false);

  useEffect(() => {
    if (!showNewsModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNewsModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showNewsModal]);

  const player = state.companies[state.playerCompanyId];
  const monthlyProfit = player ? player.lastMonthNetProfit : 0;
  const isProfit = monthlyProfit >= 0;

  const cycleLabel =
    state.macro.cyclePhase === 'boom'
      ? 'Ekspansi'
      : state.macro.cyclePhase === 'recession'
      ? 'Resesi'
      : state.macro.cyclePhase === 'recovery'
      ? 'Pemulihan'
      : 'Stabil';

  const cycleColor =
    state.macro.cyclePhase === 'boom'
      ? 'text-emerald-400'
      : state.macro.cyclePhase === 'recession'
      ? 'text-rose-400'
      : state.macro.cyclePhase === 'recovery'
      ? 'text-amber-400'
      : 'text-sky-400';

  return (
    <>
      <header className="bg-[#0d1526] border-b border-slate-800/80 text-slate-100 px-3 sm:px-4 py-2 z-30 sticky top-0 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col gap-1.5">
          {/* Top Line: Corporate Crest + Name + Date + Macro + Cash + News */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CEOIcon
                companyId={player?.id || 'comp_player'}
                personality={player?.personality}
                color={player?.color}
                accentColor={player?.accentColor}
                alt={player?.ticker || 'NUSA'}
                className="w-7 h-7 rounded-lg shrink-0"
              />
              <span className="font-extrabold text-xs tracking-tight text-sky-400 whitespace-nowrap shrink-0">
                {player?.ticker || 'NUSA'}
              </span>
              <div className="min-w-0 flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                <span className="font-semibold text-slate-100 truncate">
                  {player?.name || 'Nusantara Holdings'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-300 shrink-0">
                  {state.dateString}
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-sky-300 font-medium truncate">
                  {state.city.name} ({(state.cityOrder || ['city_metro_1']).length}/10)
                </span>
                <span className="hidden md:inline" aria-hidden="true">·</span>
                <span className={`hidden md:inline font-medium shrink-0 ${cycleColor}`}>
                  Makro: {cycleLabel} ({state.macro.gdpGrowthRate >= 0 ? '+' : ''}
                  {state.macro.gdpGrowthRate}%)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="text-right font-mono tabular-nums leading-tight">
                <div className="text-xs font-bold text-emerald-400">
                  {formatMoney(player?.cash || 0)}
                </div>
                <div
                  className={`text-[10px] flex items-center justify-end gap-0.5 ${
                    isProfit ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isProfit ? (
                    <TrendingUp className="w-2.5 h-2.5" />
                  ) : (
                    <TrendingDown className="w-2.5 h-2.5" />
                  )}
                  <span>
                    {isProfit ? '+' : ''}
                    {formatMoney(monthlyProfit)}/bln
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowNewsModal(true)}
                className="relative min-w-[40px] min-h-[36px] flex items-center justify-center rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 transition-colors"
                title="Warta Ekonomi"
                aria-label="Warta Ekonomi"
              >
                <Bell className="w-4 h-4" />
                {state.newsFeed.length > 0 && (
                  <span className="ml-0.5 text-[10px] font-mono font-bold text-sky-400">
                    {Math.min(99, state.newsFeed.length)}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Second Line: Simulation Playback & Stock/Macro Summary */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-900 text-[11px]">
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onTogglePause}
                className={`min-w-[36px] min-h-[28px] px-2 rounded-md flex items-center justify-center gap-1 font-semibold transition-colors ${
                  state.isPaused
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
                title={state.isPaused ? 'Lanjutkan (Play)' : 'Jeda (Pause)'}
                aria-label={state.isPaused ? 'Lanjutkan' : 'Jeda'}
              >
                {state.isPaused ? (
                  <Play className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Pause className="w-3.5 h-3.5 fill-current" />
                )}
              </button>

              <div className="flex items-center bg-slate-900 rounded-md p-0.5 border border-slate-800">
                {([1, 2, 5] as const).map(s => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => onChangeSpeed(s)}
                    className={`min-h-[26px] px-2 rounded text-[10px] font-bold font-mono tabular-nums transition-colors ${
                      state.simSpeed === s && !state.isPaused
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onAdvanceMonth}
                className="min-h-[28px] px-2 rounded-md bg-slate-900 border border-slate-800 text-slate-200 hover:bg-slate-800 active:scale-95 text-[10px] flex items-center gap-1 font-mono font-semibold whitespace-nowrap"
                title="Lewati 1 Bulan"
                aria-label="Lewati 1 Bulan"
              >
                <SkipForward className="w-3 h-3" />
                <span>+1 Bln</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums text-slate-400 shrink-0 whitespace-nowrap">
              <span className={`hidden sm:inline font-sans font-semibold ${cycleColor}`}>
                {cycleLabel}
              </span>
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <span>
                Saham <strong className="text-sky-400">${player?.stockPrice.toFixed(2)}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="sm:hidden">BI</span>
                <span className="hidden sm:inline">Bunga</span>{' '}
                <strong className="text-amber-400">{state.macro.centralBankRate.toFixed(1)}%</strong>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* News & Macroeconomic Alerts Modal */}
      {showNewsModal && (
        <div
          onPointerDown={e => {
            backdropDownRef.current = e.target === e.currentTarget;
          }}
          onClick={e => {
            if (backdropDownRef.current && e.target === e.currentTarget) {
              setShowNewsModal(false);
            }
            backdropDownRef.current = false;
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-fade-in"
        >
          <div
            onPointerDown={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[82vh] flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-sky-400" />
                <h3 className="font-bold text-sm text-white">Warta Ekonomi & Pasar Global</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewsModal(false)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                aria-label="Tutup Warta"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1 divide-y divide-slate-800/70">
              {state.newsFeed.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Belum ada berita terbaru bulan ini.
                </div>
              ) : (
                state.newsFeed.map(news => (
                  <div key={news.id} className="pt-3 first:pt-0">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span
                        className={`font-sans font-bold uppercase tracking-wider ${
                          news.category === 'competitor'
                            ? 'text-rose-400'
                            : news.category === 'finance'
                            ? 'text-amber-400'
                            : 'text-sky-400'
                        }`}
                      >
                        {news.category}
                      </span>
                      <span>Bulan #{news.month}</span>
                    </div>
                    <div className="font-semibold text-xs text-slate-100 mt-1">{news.title}</div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {news.detail}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-950/60">
              <button
                type="button"
                onClick={() => setShowNewsModal(false)}
                className="w-full min-h-[44px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
              >
                Tutup Warta
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
