import React, { useState, useMemo } from 'react';
import { SimulationState, ProductId } from '../types/game';
import { PRODUCTS } from '../engine/productsData';
import { getOwnershipPercentage } from '../engine/stockMarket';
import { formatMoney } from '../engine/precisionMath';
import { Award, PieChart, FileText } from 'lucide-react';
import { CEOIcon, ProductIcon } from './IconHelper';

interface LeaderboardViewProps {
  state: SimulationState;
}

export function LeaderboardView({ state }: LeaderboardViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'ranking' | 'market_share' | 'financials'>(
    'ranking'
  );
  const [sortBy, setSortBy] = useState<'marketCap' | 'bookValue' | 'revenue'>('marketCap');

  const companiesList = useMemo(() => Object.values(state.companies), [state.companies]);
  const player = state.companies[state.playerCompanyId];

  const sortedCompanies = useMemo(
    () =>
      [...companiesList].sort((a, b) => {
        if (sortBy === 'marketCap') return b.marketCap - a.marketCap;
        if (sortBy === 'bookValue') return b.bookValue - a.bookValue;
        return b.lastMonthRevenue - a.lastMonthRevenue;
      }),
    [companiesList, sortBy]
  );

  const consumerAndDigitalProducts = useMemo(
    () =>
      (Object.keys(PRODUCTS) as ProductId[]).filter(
        id => PRODUCTS[id].category === 'consumer' || PRODUCTS[id].category === 'digital'
      ),
    []
  );

  return (
    <div className="w-full space-y-4 text-xs select-none">
      {/* Sub Tabs */}
      <div className="grid grid-cols-3 bg-[#11192c] p-1 rounded-xl border border-slate-800/80">
        <button
          type="button"
          onClick={() => setActiveSubTab('ranking')}
          className={`min-h-[40px] rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
            activeSubTab === 'ranking'
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Peringkat CEO ({companiesList.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('market_share')}
          className={`min-h-[40px] rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
            activeSubTab === 'market_share'
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PieChart className="w-3.5 h-3.5" />
          <span>Pangsa Pasar</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('financials')}
          className={`min-h-[40px] rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
            activeSubTab === 'financials'
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Laporan</span>
        </button>
      </div>

      {activeSubTab === 'ranking' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] px-1">
            <span className="text-slate-400 font-semibold">
              {companiesList.length} Konglomerasi Aktif · Urutkan:
            </span>
            <div className="flex gap-1.5">
              {(['marketCap', 'bookValue', 'revenue'] as const).map(criteria => (
                <button
                  key={criteria}
                  type="button"
                  onClick={() => setSortBy(criteria)}
                  className={`min-h-[34px] px-2.5 rounded-lg font-mono text-[10px] font-bold transition-colors ${
                    sortBy === criteria
                      ? 'bg-sky-600 text-white'
                      : 'bg-[#11192c] border border-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {criteria === 'marketCap'
                    ? 'Kapitalisasi'
                    : criteria === 'bookValue'
                    ? 'Kekayaan'
                    : 'Omzet'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedCompanies.map((comp, rank) => {
              const isPlayer = comp.isPlayer;
              const heldShares = player?.shareholdings[comp.id] || 0;
              const stakePct = isPlayer ? 100 : getOwnershipPercentage(comp, heldShares);

              return (
                <div
                  key={comp.id}
                  className={`p-3.5 rounded-2xl border transition-colors ${
                    isPlayer
                      ? 'bg-slate-800/85 border-sky-500/80'
                      : 'bg-[#11192c] border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0 ${
                          rank === 0
                            ? 'bg-amber-500 text-slate-950'
                            : rank === 1
                            ? 'bg-slate-300 text-slate-950'
                            : rank === 2
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        #{rank + 1}
                      </div>

                      <CEOIcon
                        companyId={comp.id}
                        personality={comp.personality}
                        color={comp.color}
                        accentColor={comp.accentColor}
                        alt={comp.name}
                        className="w-9 h-9 rounded-xl shrink-0"
                      />

                      <div className="min-w-0">
                        <div className="font-bold text-xs text-white flex items-center gap-1.5 truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: comp.color }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{comp.name}</span>
                          <span
                            className="font-mono text-[10px] font-black shrink-0"
                            style={{ color: comp.color }}
                          >
                            {comp.ticker}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {comp.ceoName} {isPlayer ? '(Anda)' : ''} ·{' '}
                          {comp.sectorFocus || comp.personality || 'Konglomerasi'}
                          {!isPlayer && stakePct > 0 ? ` · Saham Anda ${stakePct}%` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-sm font-black text-emerald-400">
                        {sortBy === 'marketCap'
                          ? formatMoney(comp.marketCap)
                          : sortBy === 'bookValue'
                          ? formatMoney(comp.bookValue)
                          : formatMoney(comp.lastMonthRevenue)}
                      </div>
                      <div className="text-[9px] text-slate-500">
                        {sortBy === 'marketCap'
                          ? 'Kapitalisasi'
                          : sortBy === 'bookValue'
                          ? 'Ekuitas'
                          : 'Omzet/Bln'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-800/80 font-mono tabular-nums text-[10px]">
                    <div>
                      <span className="text-slate-500">Fasilitas: </span>
                      <span className="text-slate-200 font-bold">{comp.facilitiesCount} unit</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Kas: </span>
                      <span className="text-slate-200 font-bold">{formatMoney(comp.cash)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500">Laba: </span>
                      <span
                        className={
                          comp.lastMonthNetProfit >= 0
                            ? 'text-emerald-400 font-bold'
                            : 'text-rose-400 font-bold'
                        }
                      >
                        {formatMoney(comp.lastMonthNetProfit)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeSubTab === 'market_share' && (
        <div className="space-y-3">
          <div className="text-[11px] text-slate-400">
            Pangsa pasar konsumen &amp; digital di {state.city.name} per kategori komoditas:
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {consumerAndDigitalProducts.map(prodId => {
                const prod = PRODUCTS[prodId];
                const stat = state.city.productStats[prodId];
                const playerShare = stat ? stat.playerMarketShare : 0;
                const satisfaction = stat ? stat.satisfactionRate : 0;

                return (
                  <div
                    key={prodId}
                    className="bg-[#11192c] border border-slate-800/80 rounded-xl p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ProductIcon
                          id={prodId}
                          alt={prod.name}
                          className="w-8 h-8 rounded-lg shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-white truncate">{prod.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                            Harga Rata-rata: ${stat?.averageMarketPrice || prod.basePrice}
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums shrink-0">
                        <span className="text-xs font-bold text-sky-400">{playerShare}%</span>
                        <span className="text-[10px] text-slate-400 block">Pangsa Anda</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                        <div
                          className="bg-sky-500 h-full"
                          style={{ width: `${playerShare}%` }}
                          title="Pangsa Perusahaan Anda"
                        />
                        <div
                          className="bg-rose-500/80 h-full"
                          style={{ width: `${Math.max(0, 100 - playerShare)}%` }}
                          title="Pangsa Kompetitor & Impor"
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono tabular-nums">
                        <span>Pemenuhan: {satisfaction}%</span>
                        <span>Permintaan: {(stat?.monthlyDemand || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {activeSubTab === 'financials' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-3.5 space-y-3">
            <h3 className="font-bold text-xs text-sky-400 uppercase tracking-wider">
              Laba Rugi Komparatif (Bulanan)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800/80">
                    <th className="text-left py-1.5">Ticker</th>
                    <th className="text-right py-1.5">Omzet</th>
                    <th className="text-right py-1.5">Laba Bersih</th>
                    <th className="text-right py-1.5">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sortedCompanies.map(comp => {
                    const margin =
                      comp.lastMonthRevenue > 0
                        ? Math.round((comp.lastMonthNetProfit / comp.lastMonthRevenue) * 100)
                        : 0;
                    return (
                      <tr key={comp.id} className={comp.isPlayer ? 'bg-sky-950/30' : ''}>
                        <td className="py-2 font-bold text-white">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: comp.color }}
                              aria-hidden="true"
                            />
                            <span>{comp.ticker}</span>
                          </span>
                        </td>
                        <td className="text-right py-2 text-slate-200">
                          {formatMoney(comp.lastMonthRevenue)}
                        </td>
                        <td
                          className={`text-right py-2 font-bold ${
                            comp.lastMonthNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatMoney(comp.lastMonthNetProfit)}
                        </td>
                        <td className="text-right py-2 text-slate-400">{margin}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-3.5 space-y-3">
            <h3 className="font-bold text-xs text-amber-400 uppercase tracking-wider">
              Neraca Keuangan (Aset &amp; Kewajiban)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800/80">
                    <th className="text-left py-1.5">Ticker</th>
                    <th className="text-right py-1.5">Total Aset</th>
                    <th className="text-right py-1.5">Hutang</th>
                    <th className="text-right py-1.5">Ekuitas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sortedCompanies.map(comp => (
                    <tr key={comp.id} className={comp.isPlayer ? 'bg-sky-950/30' : ''}>
                      <td className="py-2 font-bold text-white">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: comp.color }}
                            aria-hidden="true"
                          />
                          <span>{comp.ticker}</span>
                        </span>
                      </td>
                      <td className="text-right py-2 text-slate-200">
                        {formatMoney(comp.totalAssets)}
                      </td>
                      <td className="text-right py-2 text-rose-400 font-bold">
                        {formatMoney(comp.debt)}
                      </td>
                      <td className="text-right py-2 text-sky-400 font-bold">
                        {formatMoney(comp.bookValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
