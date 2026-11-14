import React, { useState, useMemo } from 'react';
import { SimulationState, ProductId, ProductCategory } from '../types/game';
import { PRODUCTS } from '../engine/productsData';
import { ProductIcon } from './IconHelper';
import { BarChart3, Anchor, Layers } from 'lucide-react';

interface MarketAnalysisViewProps {
  state: SimulationState;
}

export function MarketAnalysisView({ state }: MarketAnalysisViewProps) {
  const [filterCat, setFilterCat] = useState<'all' | ProductCategory>('all');

  const productList = useMemo(
    () =>
      (Object.keys(PRODUCTS) as ProductId[]).filter(id => {
        if (filterCat === 'all') return true;
        return PRODUCTS[id].category === filterCat;
      }),
    [filterCat]
  );

  const cycleLabel =
    state.macro.cyclePhase === 'boom'
      ? 'Ekspansi Ekonomi (Permintaan Tinggi)'
      : state.macro.cyclePhase === 'recession'
      ? 'Resesi Ekonomi (Konsumen Hemat)'
      : state.macro.cyclePhase === 'recovery'
      ? 'Pemulihan Ekonomi'
      : 'Pertumbuhan Stabil';

  return (
    <div className="p-4 pb-24 md:pb-6 max-w-7xl mx-auto space-y-4 text-xs">
      {/* Macro & City Economic Pulse Summary */}
      <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-sm text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-sky-400" />
              <span>Analisis Pasar &amp; Panduan {Object.keys(PRODUCTS).length} Produk Kota</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {state.city.name} ({(state.cityOrder || ['city_metro_1']).length}/10 Kota) · {cycleLabel}
            </p>
          </div>

          <div className="flex items-center gap-3 font-mono tabular-nums text-[11px] text-slate-300">
            <span>
              Upah Rata-rata <strong className="text-white">${state.city.averageWage.toLocaleString()}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Tarif Impor <strong className="text-amber-400">{(state.macro.importTariffRate * 100).toFixed(0)}%</strong>
            </span>
          </div>
        </div>

        {state.cities && (state.cityOrder || []).length > 1 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/80 font-mono tabular-nums text-[10px]">
            {(state.cityOrder || []).map(cId => {
              const cityObj = state.cities?.[cId];
              if (!cityObj) return null;
              const isAct = cId === (state.activeCityId || 'city_metro_1');
              return (
                <div
                  key={cId}
                  className={`px-2 py-1 rounded-lg border ${
                    isAct
                      ? 'bg-sky-950/60 border-sky-500/70 text-sky-200 font-bold'
                      : 'bg-[#0d1526] border-slate-800 text-slate-400'
                  }`}
                >
                  {cityObj.name} · {(cityObj.population / 1_000_000).toFixed(2)}M
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Category Segmented Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-[#11192c] p-1.5 rounded-xl border border-slate-800/80">
        {(
          [
            { id: 'all', label: 'Semua Produk' },
            { id: 'consumer', label: 'Barang Konsumen' },
            { id: 'digital', label: 'Digital Age' },
            { id: 'intermediate', label: 'Barang Antara' },
            { id: 'raw', label: 'Bahan Baku' },
          ] as const
        ).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterCat(tab.id)}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
              filterCat === tab.id
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Responsive Multi-Column Product Market Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {productList.map(prodId => {
          const prod = PRODUCTS[prodId];
          const stat = state.city.productStats[prodId];
          const seaportEffective =
            Math.round(prod.seaportPrice * (1 + state.macro.importTariffRate) * 100) / 100;
          const satisfaction = stat?.satisfactionRate ?? 0;
          const playerShare = stat?.playerMarketShare ?? 0;
          const importShare = stat?.seaportImportShare ?? 100;

          return (
            <div
              key={prodId}
              className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-3.5 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProductIcon
                      id={prodId}
                      alt={prod.name}
                      className="w-11 h-11 rounded-xl shrink-0"
                    />
                    <div className="min-w-0">
                      <h3 className="font-bold text-xs text-white truncate">{prod.name}</h3>
                      <div className="text-[10px] text-slate-400 mt-0.5 capitalize">
                        {prod.category === 'digital'
                          ? 'Digital Age'
                          : prod.category === 'consumer'
                          ? 'Konsumen'
                          : prod.category === 'intermediate'
                          ? 'Intermediate'
                          : 'Bahan Baku'}{' '}
                        · Satuan {prod.unit}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="text-xs font-bold text-emerald-400">
                      ${stat?.averageMarketPrice || prod.basePrice}
                    </div>
                    <div className="text-[10px] text-slate-500">Harga Pasar</div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  {prod.description}
                </p>

                {/* Consumer Appeal Breakdown (Price / Quality / Brand) */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Bobot Daya Tarik Pembeli</span>
                    <span className="font-mono tabular-nums text-slate-300">
                      H {Math.round(prod.appealWeights.price * 100)}% · K{' '}
                      {Math.round(prod.appealWeights.quality * 100)}% · M{' '}
                      {Math.round(prod.appealWeights.brand * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden flex bg-slate-800">
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: `${prod.appealWeights.price * 100}%` }}
                      title="Sensitivitas Harga"
                    />
                    <div
                      className="bg-sky-500 h-full"
                      style={{ width: `${prod.appealWeights.quality * 100}%` }}
                      title="Sensitivitas Kualitas"
                    />
                    <div
                      className="bg-amber-500 h-full"
                      style={{ width: `${prod.appealWeights.brand * 100}%` }}
                      title="Sensitivitas Merek"
                    />
                  </div>
                </div>

                {/* Supply Chain Recipe Inputs */}
                {prod.inputs && prod.inputs.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1">
                      <Layers className="w-3 h-3 text-sky-400" />
                      <span>Bahan Baku Manufaktur:</span>
                    </div>
                    <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-slate-200 font-mono tabular-nums">
                      {prod.inputs.map(inp => (
                        <span key={inp.productId}>
                          {PRODUCTS[inp.productId]?.name} ({inp.amount}x)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Market Share & Seaport Import Telemetry */}
              <div className="pt-2.5 border-t border-slate-800/80 grid grid-cols-3 gap-2 font-mono tabular-nums text-[10px]">
                <div>
                  <span className="text-slate-500 block">Permintaan</span>
                  <span className="text-slate-200 font-bold">
                    {(stat?.monthlyDemand || 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 flex items-center gap-0.5">
                    <Anchor className="w-2.5 h-2.5 text-teal-400" /> Impor Port
                  </span>
                  <span className="text-amber-400 font-bold">
                    ${seaportEffective} ({importShare}%)
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">Pangsa Anda</span>
                  <span
                    className={`font-bold ${
                      playerShare > 0 ? 'text-sky-400' : 'text-slate-400'
                    }`}
                  >
                    {prod.category === 'consumer' || prod.category === 'digital'
                      ? `${playerShare}%`
                      : `Penuhi ${satisfaction}%`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
