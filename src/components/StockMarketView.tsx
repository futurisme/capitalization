import React, { useState } from 'react';
import { SimulationState } from '../types/game';
import {
  executeStockTrade,
  handleCorporateLoan,
  getOwnershipPercentage,
  issueNewShares,
  executeSubsidiaryMerger,
} from '../engine/stockMarket';
import { formatMoney } from '../engine/precisionMath';
import {
  TrendingUp,
  TrendingDown,
  Landmark,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  GitMerge,
  PlusCircle,
} from 'lucide-react';
import { CEOIcon } from './IconHelper';

interface StockMarketViewProps {
  state: SimulationState;
  onStateUpdate: (newState: SimulationState) => void;
}

export function StockMarketView({ state, onStateUpdate }: StockMarketViewProps) {
  const companyIds = Object.keys(state.companies);
  const defaultSelected =
    state.companies['comp_apex'] ? 'comp_apex' : companyIds[0] || state.playerCompanyId;

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(defaultSelected);
  const [tradeShares, setTradeShares] = useState<number>(5000);
  const [issueCount, setIssueCount] = useState<number>(50000);
  const [loanAmount, setLoanAmount] = useState<number>(500000);
  const [activeTab, setActiveTab] = useState<'stocks' | 'banking'>('stocks');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmMerger, setConfirmMerger] = useState(false);

  const player = state.companies[state.playerCompanyId];
  const targetCompany = state.companies[selectedCompanyId] || player;

  const playerHeldShares = player?.shareholdings[targetCompany?.id || ''] || 0;
  const ownershipPct = targetCompany
    ? getOwnershipPercentage(targetCompany, playerHeldShares)
    : 0;

  const handleTrade = (isBuy: boolean) => {
    if (!targetCompany) return;
    setFeedbackMsg(null);
    const result = executeStockTrade(
      state,
      state.playerCompanyId,
      targetCompany.id,
      tradeShares,
      isBuy
    );
    if (result.success && result.updatedState) {
      onStateUpdate(result.updatedState);
      setFeedbackMsg({ text: result.message });
    } else {
      setFeedbackMsg({ text: result.message, error: true });
    }
  };

  const handleRightsIssue = () => {
    setFeedbackMsg(null);
    const result = issueNewShares(state, state.playerCompanyId, issueCount);
    if (result.success && result.updatedState) {
      onStateUpdate(result.updatedState);
      setFeedbackMsg({ text: result.message });
    } else {
      setFeedbackMsg({ text: result.message, error: true });
    }
  };

  const handleMerger = () => {
    if (!targetCompany) return;
    setFeedbackMsg(null);
    const result = executeSubsidiaryMerger(state, state.playerCompanyId, targetCompany.id);
    setConfirmMerger(false);
    if (result.success && result.updatedState) {
      onStateUpdate(result.updatedState);
      setSelectedCompanyId(state.playerCompanyId);
      setFeedbackMsg({ text: result.message });
    } else {
      setFeedbackMsg({ text: result.message, error: true });
    }
  };

  const handleLoan = (isBorrow: boolean) => {
    setFeedbackMsg(null);
    const result = handleCorporateLoan(state, state.playerCompanyId, loanAmount, isBorrow);
    if (result.success && result.updatedState) {
      onStateUpdate(result.updatedState);
      setFeedbackMsg({ text: result.message });
    } else {
      setFeedbackMsg({ text: result.message, error: true });
    }
  };

  const handleDividendChange = (newDiv: number) => {
    if (!player) return;
    onStateUpdate({
      ...state,
      companies: {
        ...state.companies,
        [player.id]: { ...player, dividendPerShare: newDiv },
      },
    });
  };

  // Build custom native SVG stock chart points
  const renderPriceSvgChart = (history: number[]) => {
    const pts = history.length >= 2 ? history : [10, history[0] || 10];
    const min = Math.min(...pts) * 0.94;
    const max = Math.max(...pts) * 1.06;
    const range = Math.max(0.5, max - min);
    const width = 320;
    const height = 84;

    const coords = pts.map((val, i) => {
      const x = (i / Math.max(1, pts.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 14) - 7;
      return { x, y };
    });

    const linePath = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPath = `0,${height} ${linePath} ${width},${height}`;
    const isPositive = pts[pts.length - 1] >= pts[0];
    const strokeColor = isPositive ? '#34d399' : '#fb7185';
    const fillColor = isPositive ? 'rgba(52,211,153,0.16)' : 'rgba(251,113,133,0.16)';

    return (
      <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between text-[10px] mb-1.5">
          <span className="text-slate-400 font-semibold">Grafik Harga Saham ({pts.length} Bln)</span>
          <span className="font-mono tabular-nums text-slate-300">
            Min ${Math.min(...pts).toFixed(2)} · Max ${Math.max(...pts).toFixed(2)}
          </span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20 overflow-visible">
          <polygon points={areaPath} fill={fillColor} />
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={linePath}
          />
        </svg>
      </div>
    );
  };

  return (
    <div className="p-4 pb-24 md:pb-6 max-w-7xl mx-auto space-y-4 text-xs select-none">
      {/* Sub-Tabs */}
      <div className="grid grid-cols-2 bg-[#11192c] p-1 rounded-xl border border-slate-800/80">
        <button
          type="button"
          onClick={() => setActiveTab('stocks')}
          className={`min-h-[42px] rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'stocks'
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Bursa Saham &amp; M&amp;A</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('banking')}
          className={`min-h-[42px] rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'banking'
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Perbankan &amp; Emisi Saham</span>
        </button>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3 rounded-xl border flex items-center gap-2 animate-fade-in ${
            feedbackMsg.error
              ? 'bg-rose-950/70 border-rose-800/80 text-rose-200'
              : 'bg-emerald-950/70 border-emerald-800/80 text-emerald-200'
          }`}
        >
          {feedbackMsg.error ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="text-xs leading-snug flex-1">{feedbackMsg.text}</span>
        </div>
      )}

      {activeTab === 'stocks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Panel: 10-Company Emiten Selector */}
          <div className="lg:col-span-5 bg-[#11192c] border border-slate-800/80 rounded-2xl p-3 space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="font-bold text-xs text-slate-200">
                Bursa Efek ({companyIds.length}/10 Emiten Aktif)
              </h2>
              <span className="text-[10px] font-mono text-slate-400">Pilih emiten</span>
            </div>

            <div className="max-h-[270px] lg:max-h-[640px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 pr-0.5">
              {Object.values(state.companies).map(comp => {
                const isSelected = targetCompany?.id === comp.id;
                const priceHistory = comp.sharePriceHistory;
                const priceChange =
                  priceHistory.length >= 2
                    ? comp.stockPrice - priceHistory[priceHistory.length - 2]
                    : 0;
                const isUp = priceChange >= 0;
                const held = player?.shareholdings[comp.id] || 0;
                const stakePct = getOwnershipPercentage(comp, held);

                return (
                  <button
                    key={comp.id}
                    type="button"
                    onClick={() => {
                      setSelectedCompanyId(comp.id);
                      setConfirmMerger(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border transition-colors flex items-center justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-slate-800/90 border-sky-500/80'
                        : 'bg-[#0d1526] border-slate-800/70 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CEOIcon
                        companyId={comp.id}
                        personality={comp.personality}
                        color={comp.color}
                        accentColor={comp.accentColor}
                        alt={comp.name}
                        className="w-9 h-9 rounded-xl shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: comp.color }}
                            aria-hidden="true"
                          />
                          <span className="font-mono text-[11px]" style={{ color: comp.color }}>
                            {comp.ticker}
                          </span>
                          <span className="text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <span className="truncate">{comp.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {comp.sectorFocus || comp.personality || 'Konglomerasi'}
                          {comp.isPlayer
                            ? ' · Anda'
                            : stakePct > 0
                            ? ` · Milik Anda ${stakePct}%`
                            : ''}
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-sm font-black text-white">
                        ${comp.stockPrice.toFixed(2)}
                      </div>
                      <div
                        className={`text-[10px] font-bold flex items-center justify-end gap-0.5 ${
                          isUp ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isUp ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        <span>
                          {isUp ? '+' : ''}
                          {priceChange.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-500">MCap {formatMoney(comp.marketCap)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Selected Company Trading & M&A Terminal */}
          {targetCompany && (
            <div className="lg:col-span-7 bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                <div className="flex items-center gap-3 min-w-0">
                  <CEOIcon
                    companyId={targetCompany.id}
                    personality={targetCompany.personality}
                    color={targetCompany.color}
                    accentColor={targetCompany.accentColor}
                    alt={targetCompany.name}
                    className="w-11 h-11 rounded-xl shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate">
                      <h3 className="font-bold text-sm text-white truncate">
                        {targetCompany.name}
                      </h3>
                      <span
                        className="font-mono text-xs font-black shrink-0"
                        style={{ color: targetCompany.color }}
                      >
                        ({targetCompany.ticker})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      CEO: {targetCompany.ceoName} ·{' '}
                      {targetCompany.sectorFocus || targetCompany.personality || 'Konglomerasi'}
                    </div>
                  </div>
                </div>

                {!targetCompany.isPlayer && ownershipPct >= 50 && (
                  <div className="text-emerald-400 font-bold text-[11px] flex items-center gap-1 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Kendali Mayoritas ({ownershipPct}%)</span>
                  </div>
                )}
              </div>

              {/* Ownership Progress */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Kepemilikan Anda:</span>
                  <span className="font-mono tabular-nums text-sky-400 font-bold">
                    {playerHeldShares.toLocaleString()} lbr ({ownershipPct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                  <div
                    className="bg-sky-500 h-full"
                    style={{ width: `${Math.min(100, ownershipPct)}%` }}
                  />
                </div>
              </div>

              {/* Valuation Metrics */}
              <div className="grid grid-cols-3 gap-2 bg-[#0d1526] p-3 rounded-xl border border-slate-800/80 font-mono tabular-nums text-[10px]">
                <div>
                  <div className="text-slate-400">P/E Ratio</div>
                  <div className="text-slate-100 font-bold text-xs">{targetCompany.peRatio}x</div>
                </div>
                <div>
                  <div className="text-slate-400">Nilai Buku/Lbr</div>
                  <div className="text-slate-100 font-bold text-xs">
                    ${(targetCompany.bookValue / Math.max(1, targetCompany.sharesOutstanding)).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Dividen/Lbr</div>
                  <div className="text-emerald-400 font-bold text-xs">
                    ${targetCompany.dividendPerShare}
                  </div>
                </div>
              </div>

              {/* Custom Native SVG Stock Chart */}
              {renderPriceSvgChart(targetCompany.sharePriceHistory)}

              {/* Trade Execution */}
              <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300">Jumlah Lot Saham:</span>
                  <span className="font-mono tabular-nums text-sky-400 font-bold text-sm">
                    {tradeShares.toLocaleString()} lbr
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 font-mono tabular-nums text-[11px]">
                  {[1000, 5000, 20000, 50000].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setTradeShares(cnt)}
                      className={`min-h-[40px] rounded-lg border transition-colors ${
                        tradeShares === cnt
                          ? 'bg-sky-600 border-sky-400 text-white font-bold'
                          : 'bg-[#0d1526] border-slate-700/80 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      {cnt / 1000}K
                    </button>
                  ))}
                </div>

                <div className="text-[11px] text-slate-400 font-mono tabular-nums text-right">
                  Nilai Transaksi:{' '}
                  <strong className="text-white">
                    ${Math.round(tradeShares * targetCompany.stockPrice).toLocaleString()}
                  </strong>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTrade(true)}
                    className="min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
                  >
                    Beli Saham
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTrade(false)}
                    disabled={playerHeldShares < tradeShares}
                    className={`min-h-[46px] rounded-xl font-bold transition-colors ${
                      playerHeldShares >= tradeShares
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                    }`}
                  >
                    Jual Saham
                  </button>
                </div>

                {/* Hostile Takeover / Full Subsidiary Merger when >= 50% */}
                {!targetCompany.isPlayer && ownershipPct >= 50 && (
                  <div className="pt-2 border-t border-slate-800/80">
                    {!confirmMerger ? (
                      <button
                        type="button"
                        onClick={() => setConfirmMerger(true)}
                        className="w-full min-h-[46px] rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center justify-center gap-2 transition-colors"
                      >
                        <GitMerge className="w-4 h-4" />
                        <span>Lakukan Merger &amp; Akuisisi Penuh (100%)</span>
                      </button>
                    ) : (
                      <div className="bg-amber-950/40 border border-amber-700/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-amber-200">
                          Beli sisa saham publik (+10% premi) &amp; serap semua aset {targetCompany.ticker}?
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmMerger(false)}
                            className="min-h-[38px] px-3 rounded-lg bg-slate-800 text-slate-200 font-bold"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={handleMerger}
                            className="min-h-[38px] px-3 rounded-lg bg-amber-600 text-white font-bold"
                          >
                            Eksekusi Merger
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'banking' && player && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Bank Credit Facility */}
          <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-800/80">
              <Landmark className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h3 className="font-bold text-sm text-white">Kredit Perbankan Korporasi</h3>
                <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                  Acuan Bank Sentral: {state.macro.centralBankRate}%/thn · Bunga Anda:{' '}
                  <span className="text-amber-400 font-bold">
                    {(player.monthlyInterestRate * 100).toFixed(2)}%/bln
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 font-mono tabular-nums">
              <div className="bg-[#0d1526] p-3 rounded-xl border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Hutang Berjalan</div>
                <div className="text-sm font-bold text-rose-400 mt-0.5">
                  ${player.debt.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Bunga ${Math.round(player.debt * player.monthlyInterestRate).toLocaleString()}/bln
                </div>
              </div>

              <div className="bg-[#0d1526] p-3 rounded-xl border border-slate-800/80">
                <div className="text-[10px] text-slate-400">Plafon Kredit (65%)</div>
                <div className="text-sm font-bold text-sky-400 mt-0.5">
                  ${Math.round(player.bookValue * 0.65).toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Berdasarkan Nilai Buku</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-slate-300">
                <span className="font-semibold">Nominal Kredit:</span>
                <span className="font-mono tabular-nums text-amber-400 font-bold">
                  ${loanAmount.toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 font-mono tabular-nums text-[11px]">
                {[250000, 500000, 1000000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setLoanAmount(amt)}
                    className={`min-h-[40px] rounded-lg border transition-colors ${
                      loanAmount === amt
                        ? 'bg-amber-600/30 border-amber-500 text-white font-bold'
                        : 'bg-[#0d1526] border-slate-700/80 text-slate-300'
                    }`}
                  >
                    ${amt / 1000}K
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleLoan(true)}
                  className="min-h-[46px] rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors"
                >
                  Cairkan Pinjaman
                </button>
                <button
                  type="button"
                  onClick={() => handleLoan(false)}
                  disabled={player.debt === 0 || player.cash < loanAmount}
                  className={`min-h-[46px] rounded-xl font-bold transition-colors ${
                    player.debt > 0 && player.cash >= loanAmount
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  Lunasi Hutang
                </button>
              </div>
            </div>
          </div>

          {/* Equity Capital Raising (Rights Issue & Dividend Policy) */}
          <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-800/80">
              <PlusCircle className="w-5 h-5 text-sky-400 shrink-0" />
              <div>
                <h3 className="font-bold text-sm text-white">Pasar Modal &amp; Kebijakan Dividen</h3>
                <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                  Saham Beredar: {player.sharesOutstanding.toLocaleString()} lbr
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-slate-300">
                <span className="font-semibold">Emisi Saham Baru (Rights Issue):</span>
                <span className="font-mono tabular-nums text-sky-400 font-bold">
                  {issueCount.toLocaleString()} lbr
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 font-mono tabular-nums text-[11px]">
                {[25000, 50000, 150000].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setIssueCount(cnt)}
                    className={`min-h-[40px] rounded-lg border transition-colors ${
                      issueCount === cnt
                        ? 'bg-sky-600/30 border-sky-500 text-white font-bold'
                        : 'bg-[#0d1526] border-slate-700/80 text-slate-300'
                    }`}
                  >
                    +{cnt / 1000}K
                  </button>
                ))}
              </div>

              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                Estimasi dana masuk (diskon 6%):{' '}
                <strong className="text-emerald-400">
                  +${Math.round(issueCount * player.stockPrice * 0.94).toLocaleString()}
                </strong>
              </div>

              <button
                type="button"
                onClick={handleRightsIssue}
                className="w-full min-h-[46px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition-colors"
              >
                Terbitkan Saham Baru (Tanpa Bunga)
              </button>
            </div>

            {/* Dividend per share selector */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-300">Dividen Bulanan per Lembar:</span>
                <span className="font-mono tabular-nums text-emerald-400 font-bold">
                  ${player.dividendPerShare}/lbr
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 font-mono tabular-nums text-[11px]">
                {[0, 0.25, 0.5, 1.0].map(divVal => (
                  <button
                    key={divVal}
                    type="button"
                    onClick={() => handleDividendChange(divVal)}
                    className={`min-h-[40px] rounded-lg border transition-colors ${
                      player.dividendPerShare === divVal
                        ? 'bg-emerald-600/30 border-emerald-500 text-white font-bold'
                        : 'bg-[#0d1526] border-slate-700/80 text-slate-300'
                    }`}
                  >
                    ${divVal}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
