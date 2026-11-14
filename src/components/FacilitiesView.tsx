import React, { useState, useMemo } from 'react';
import { Facility, SimulationState } from '../types/game';
import { FACILITY_SPECS, PRODUCTS } from '../engine/productsData';
import { formatSignedCurrency } from '../engine/precisionMath';
import {
  Store,
  ArrowUpRight,
  Plus,
  TrendingUp,
  TrendingDown,
  Layers,
  Link2,
  Anchor,
} from 'lucide-react';
import { FacilityIcon, ProductIcon } from './IconHelper';

interface FacilitiesViewProps {
  state: SimulationState;
  onSelectFacility: (facility: Facility) => void;
  onOpenBuildModal: () => void;
}

export function FacilitiesView({
  state,
  onSelectFacility,
  onOpenBuildModal,
}: FacilitiesViewProps) {
  const [viewMode, setViewMode] = useState<'portfolio' | 'supply_chain'>('portfolio');
  const [filterType, setFilterType] = useState<
    'all' | 'store' | 'real_estate' | 'factory' | 'raw' | 'digital' | 'corporate'
  >('all');

  const playerFacilities = useMemo(
    () => Object.values(state.facilities).filter(f => f.companyId === state.playerCompanyId),
    [state.facilities, state.playerCompanyId]
  );

  const filtered = useMemo(
    () =>
      playerFacilities.filter(f => {
        if (filterType === 'all') return true;
        const spec = FACILITY_SPECS[f.type];
        return spec?.category === filterType;
      }),
    [playerFacilities, filterType]
  );

  const { totalRevenue, totalProfit } = useMemo(
    () =>
      playerFacilities.reduce(
        (acc, f) => ({
          totalRevenue: acc.totalRevenue + f.monthlyRevenue,
          totalProfit: acc.totalProfit + f.monthlyProfit,
        }),
        { totalRevenue: 0, totalProfit: 0 }
      ),
    [playerFacilities]
  );

  return (
    <div className="p-4 pb-24 md:pb-6 max-w-7xl mx-auto space-y-4 text-xs select-none">
      {/* Portfolio Summary Header */}
      <div className="bg-[#11192c] border border-slate-800/80 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <h2 className="font-bold text-sm text-white">Portofolio Fasilitas &amp; Rantai Pasok</h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono tabular-nums text-[11px] font-bold text-sky-400">
              {playerFacilities.length} Unit Aktif
            </span>
            <button
              type="button"
              onClick={onOpenBuildModal}
              className="min-h-[38px] px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Bangun</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-800/80 font-mono tabular-nums">
          <div>
            <div className="text-[10px] text-slate-400">Total Omzet Bulanan</div>
            <div className="text-base font-bold text-emerald-400 mt-0.5">
              {formatSignedCurrency(totalRevenue)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">Laba Operasional Bersih</div>
            <div
              className={`text-base font-bold mt-0.5 flex items-center gap-1 ${
                totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {totalProfit >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{formatSignedCurrency(totalProfit)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Switcher: Portofolio vs Rantai Pasok */}
      <div className="grid grid-cols-2 bg-[#11192c] p-1 rounded-xl border border-slate-800/80">
        <button
          type="button"
          onClick={() => setViewMode('portfolio')}
          className={`min-h-[40px] rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
            viewMode === 'portfolio'
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Daftar Fasilitas</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('supply_chain')}
          className={`min-h-[40px] rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
            viewMode === 'supply_chain'
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>Aliran Rantai Pasok</span>
        </button>
      </div>

      {viewMode === 'portfolio' && (
        <>
          {/* Category Filter Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-[#11192c] p-1.5 rounded-xl border border-slate-800/80">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'store', label: 'Ritel' },
                { id: 'real_estate', label: 'Properti' },
                { id: 'factory', label: 'Pabrik & Gudang' },
                { id: 'raw', label: 'Hulu' },
                { id: 'digital', label: 'Digital & Media' },
                { id: 'corporate', label: 'Riset & HQ' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                  filterType === tab.id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Facilities Responsive Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-10 bg-[#11192c] rounded-2xl border border-slate-800/80 text-slate-400">
              <Store className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="font-semibold">Belum ada fasilitas di kategori ini.</p>
              <button
                onClick={onOpenBuildModal}
                className="mt-3 min-h-[44px] px-4 py-2 rounded-xl bg-sky-600 text-white font-bold text-xs inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Bangun Fasilitas Baru</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map(fac => {
                const primaryUnit = fac.units.find(u => u.targetProductId);
                const prod = primaryUnit?.targetProductId
                  ? PRODUCTS[primaryUnit.targetProductId]
                  : null;
                const isProfitable = fac.monthlyProfit >= 0;

                return (
                  <button
                    key={fac.id}
                    type="button"
                    onClick={() => onSelectFacility(fac)}
                    className="text-left bg-[#11192c] border border-slate-800/80 hover:border-slate-700 p-3.5 rounded-2xl transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <FacilityIcon
                          type={fac.type}
                          alt={fac.name}
                          className="w-11 h-11 rounded-xl shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-white flex items-center gap-1.5 truncate">
                            <span className="truncate">{fac.name}</span>
                            <span className="text-[10px] font-mono font-bold text-sky-400 shrink-0">
                              · Lv.{fac.level}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                            {prod && (
                              <span className="flex items-center gap-1 text-slate-300 font-medium">
                                <ProductIcon id={prod.id} alt={prod.name} className="w-5 h-5 rounded" />
                                <span>{prod.name}</span>
                              </span>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              ({fac.tileX}, {fac.tileY})
                            </span>
                          </div>
                        </div>
                      </div>

                      <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-800 font-mono tabular-nums text-[10px]">
                      <div>
                        <div className="text-slate-500">Pendapatan</div>
                        <div className="text-slate-200 font-bold">
                          {formatSignedCurrency(fac.monthlyRevenue)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Laba Bersih</div>
                        <div
                          className={`font-bold ${
                            isProfitable ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatSignedCurrency(fac.monthlyProfit)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-500">Slot 3x3</div>
                        <div className="text-sky-400 font-bold">{fac.units.length}/9 Unit</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 mt-2.5 pt-2 border-t border-slate-800/60 text-[10px]">
                      <div>
                        <div className="flex justify-between text-slate-400 mb-0.5">
                          <span>Kualitas</span>
                          <span className="font-mono tabular-nums text-sky-400">
                            {fac.qualityRating}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-sky-500 h-full rounded-full"
                            style={{ width: `${fac.qualityRating}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-slate-400 mb-0.5">
                          <span>Merek</span>
                          <span className="font-mono tabular-nums text-amber-400">
                            {fac.brandRating}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-amber-500 h-full rounded-full"
                            style={{ width: `${fac.brandRating}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {viewMode === 'supply_chain' && (
        <div className="space-y-3">
          <div className="text-[11px] text-slate-400 leading-relaxed">
            Ringkasan sumber pasokan setiap toko dan pabrik Anda. Ketuk fasilitas untuk mengganti
            pemasok antara Pelabuhan Impor, Pabrik Internal, atau Grosir B2B.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {playerFacilities.map(fac => {
              const purchasingUnit = fac.units.find(u => u.type === 'purchasing');
              const supplierId = purchasingUnit?.supplierFacilityId;
              const supplierFac =
                supplierId && supplierId !== 'seaport' ? state.facilities[supplierId] : null;
              const primaryUnit = fac.units.find(u => u.targetProductId);
              const prod = primaryUnit?.targetProductId
                ? PRODUCTS[primaryUnit.targetProductId]
                : null;

              return (
                <button
                  key={fac.id}
                  type="button"
                  onClick={() => onSelectFacility(fac)}
                  className="text-left bg-[#11192c] border border-slate-800/80 hover:border-sky-500/60 p-3.5 rounded-2xl space-y-2.5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FacilityIcon type={fac.type} alt={fac.name} className="w-8 h-8 rounded-lg shrink-0" />
                      <span className="font-bold text-white truncate">{fac.name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {prod?.name || 'Korporat'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-[#0d1526] border border-slate-800/80 rounded-xl px-3 py-2 text-[11px]">
                    <span className="text-slate-400">Sumber Pasok:</span>
                    {supplierFac ? (
                      <span className="font-semibold text-emerald-400 flex items-center gap-1">
                        <Link2 className="w-3.5 h-3.5" />
                        <span>
                          {supplierFac.name} (Q:{supplierFac.qualityRating})
                        </span>
                      </span>
                    ) : purchasingUnit ? (
                      <span className="font-semibold text-amber-400 flex items-center gap-1">
                        <Anchor className="w-3.5 h-3.5" />
                        <span>Pelabuhan Impor Global</span>
                      </span>
                    ) : (
                      <span className="text-slate-400">Produksi / Riset Hulu</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
