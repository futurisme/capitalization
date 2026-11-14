import React, { useState, useRef, useMemo, useEffect } from 'react';
import { FacilityType, MapParcel, ProductId } from '../types/game';
import { FACILITY_SPECS, PRODUCTS, RESOURCE_DEPOSIT_META } from '../engine/productsData';
import { getDepositYieldBonus } from '../engine/housingEcosystem';
import { FacilityIcon, ProductIcon } from './IconHelper';
import {
  X,
  Hammer,
  Store,
  Factory,
  Tractor,
  Building2,
  Building,
  AlertCircle,
  Cpu,
  Home,
  Gem,
} from 'lucide-react';

interface BuildModalProps {
  playerCash: number;
  selectedParcel?: MapParcel;
  onClose: () => void;
  onBuildFacility: (facilityType: FacilityType, targetProduct?: ProductId) => void;
}

export function BuildModal({
  playerCash,
  selectedParcel,
  onClose,
  onBuildFacility,
}: BuildModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    'store' | 'real_estate' | 'factory' | 'raw' | 'digital' | 'corporate'
  >('store');
  const [chosenType, setChosenType] = useState<FacilityType>('store_convenience');
  const [chosenProduct, setChosenProduct] = useState<ProductId>('bread');
  const backdropDownRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const categories = [
    { id: 'store' as const, label: 'Ritel', icon: Store },
    { id: 'real_estate' as const, label: 'Properti', icon: Home },
    { id: 'factory' as const, label: 'Pabrik', icon: Factory },
    { id: 'raw' as const, label: 'Hulu', icon: Tractor },
    { id: 'digital' as const, label: 'Digital', icon: Cpu },
    { id: 'corporate' as const, label: 'Riset/HQ', icon: Building2 },
  ];

  const filteredSpecs = useMemo(
    () =>
      Object.values(FACILITY_SPECS).filter(
        s => s.category === selectedCategory && s.buildable !== false
      ),
    [selectedCategory]
  );
  const currentSpec = FACILITY_SPECS[chosenType];
  const canAfford = playerCash >= (currentSpec?.constructionCost || 0);

  const handleSelectType = (type: FacilityType) => {
    setChosenType(type);
    const spec = FACILITY_SPECS[type];
    if (spec.allowedProducts && spec.allowedProducts.length > 0) {
      setChosenProduct(spec.allowedProducts[0]);
    }
  };

  return (
    <div
      onPointerDown={e => {
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onClick={e => {
        if (backdropDownRef.current && e.target === e.currentTarget) {
          onClose();
        }
        backdropDownRef.current = false;
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 animate-fade-in"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Konstruksi Fasilitas Bisnis"
        onPointerDown={e => e.stopPropagation()}
        className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)]"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-600/20 border border-sky-500/40 text-sky-400">
              <Hammer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Konstruksi Fasilitas Bisnis</h3>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                Kas Tersedia:{' '}
                <strong className="text-emerald-400">${Math.round(playerCash).toLocaleString()}</strong>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700"
            aria-label="Tutup Konstruksi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 6 Category Tabs (3x2 on narrow mobile, 6x1 on sm+) */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-2 bg-slate-950/70 border-b border-slate-800 text-xs">
          {categories.map(c => {
            const Icon = c.icon;
            const isSelected = selectedCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(c.id);
                  const firstOfType = Object.values(FACILITY_SPECS).find(
                    s => s.category === c.id && s.buildable !== false
                  );
                  if (firstOfType) handleSelectType(firstOfType.type);
                }}
                className={`min-h-[44px] flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-colors ${
                  isSelected
                    ? 'bg-sky-600 text-white font-bold'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="text-[10px] truncate">{c.label}</span>
              </button>
            );
          })}
        </div>

        {/* Building Cards List (semantic button header + sibling product grid, zero nested buttons) */}
        <div className="p-3.5 overflow-y-auto space-y-2.5 flex-1">
          {filteredSpecs.map(spec => {
            const isSelected = chosenType === spec.type;
            const affordable = playerCash >= spec.constructionCost;

            return (
              <div
                key={spec.type}
                className={`p-3.5 rounded-2xl border transition-colors ${
                  isSelected
                    ? 'bg-slate-800 border-sky-500'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelectType(spec.type)}
                  aria-pressed={isSelected}
                  className="w-full text-left block"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-3">
                      <FacilityIcon
                        type={spec.type}
                        alt={spec.name}
                        className="w-12 h-12 rounded-xl shrink-0"
                      />
                      <div>
                        <div className="font-bold text-xs text-white">{spec.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          {spec.description}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <div>
                      <span className="text-slate-400">Investasi: </span>
                      <strong className={affordable ? 'text-emerald-400' : 'text-rose-400'}>
                        ${spec.constructionCost.toLocaleString()}
                      </strong>
                    </div>
                    <div className="text-slate-400">
                      Biaya Tetap:{' '}
                      <span className="text-slate-200">
                        ${spec.monthlyMaintenance.toLocaleString()}/bln
                      </span>
                    </div>
                  </div>
                </button>

                {isSelected && spec.allowedProducts && spec.allowedProducts.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-700/60 animate-fade-in">
                    <div className="text-[11px] font-semibold text-sky-400 mb-2">
                      Pilih Fokus Produk / Riset Utama:
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {spec.allowedProducts.map(pId => {
                        const prod = PRODUCTS[pId];
                        if (!prod) return null;
                        const isProdSelected = chosenProduct === pId;
                        return (
                          <button
                            key={pId}
                            type="button"
                            onClick={() => setChosenProduct(pId)}
                            className={`min-h-[44px] p-2 rounded-xl border text-left flex items-center gap-2 transition-colors ${
                              isProdSelected
                                ? 'bg-sky-600/25 border-sky-400 text-white font-bold'
                                : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                            }`}
                          >
                            <ProductIcon
                              id={pId}
                              alt={prod.name}
                              className="w-7 h-7 rounded-lg shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-[10px] truncate">{prod.name}</div>
                              <div className="text-[9px] text-slate-400 font-mono tabular-nums">
                                ${prod.basePrice}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Build Confirmation */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/80">
          {selectedParcel && selectedParcel.isZoneAllowed && !selectedParcel.facilityId ? (
            <div className="mb-2 space-y-1">
              <div className="text-[11px] text-slate-400 font-mono tabular-nums flex items-center gap-1.5 flex-wrap">
                <Building className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>
                  Kavling ({selectedParcel.x}, {selectedParcel.y}) · Keramaian{' '}
                  <strong className="text-amber-400">{selectedParcel.trafficIndex ?? 20}/100</strong> · Lahan $
                  {Math.round(selectedParcel.landValue / 1000)}K
                </span>
                {selectedParcel.ownerCompanyId && (
                  <span className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 text-[10px] font-sans font-semibold">
                    Milik Anda
                  </span>
                )}
              </div>
              {selectedParcel.resourceDeposit?.discovered && (
                <div className="text-[11px] font-medium text-emerald-300 flex items-center gap-1.5 bg-emerald-950/50 border border-emerald-700/50 rounded-lg px-2.5 py-1">
                  <Gem className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  <span>
                    Deposit {RESOURCE_DEPOSIT_META[selectedParcel.resourceDeposit.type].label} (Kadar{' '}
                    {selectedParcel.resourceDeposit.richness}%)
                    {(() => {
                      const bonus = getDepositYieldBonus(chosenType, selectedParcel.resourceDeposit);
                      return bonus > 0
                        ? ` · Bonus +${bonus}% output untuk fasilitas ini!`
                        : ' · Bangun Tambang / Perkebunan untuk bonus hasil';
                    })()}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 mb-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Sistem akan menempatkan fasilitas di kavling zona terbaik yang tersedia.</span>
            </div>
          )}

          <button
            onClick={() => onBuildFacility(chosenType, chosenProduct)}
            disabled={!canAfford}
            className={`w-full min-h-[46px] rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
              canAfford
                ? 'bg-sky-600 hover:bg-sky-500 text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <Hammer className="w-4 h-4" />
            <span>
              {canAfford
                ? `Bangun ${currentSpec?.name} ($${currentSpec?.constructionCost.toLocaleString()})`
                : 'Dana Kas Tidak Mencukupi'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
