import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Facility, Company, UnitType, ProductId } from '../types/game';
import { PRODUCTS, FACILITY_SPECS, GOVT_OWNER_ID } from '../engine/productsData';
import {
  getFacilityUpgradeCost,
  getUnitInstallCost,
  getUnitUpgradeCost,
  getTrafficDemandMultiplier,
} from '../engine/economyEngine';
import { formatCostShort, formatSignedCurrency } from '../engine/precisionMath';
import {
  X,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Megaphone,
  ArrowUpCircle,
  Trash2,
  ArrowDownToLine,
  Cog,
  Tag,
  FlaskConical,
  Package,
  Plus,
  Link2,
  Anchor,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { FacilityIcon, ProductIcon } from './IconHelper';

interface FacilityDrawerProps {
  facility: Facility;
  company?: Company;
  playerCash: number;
  allFacilities: Record<string, Facility>;
  allCompanies: Record<string, Company>;
  isOwner: boolean;
  tileTrafficIndex?: number;
  onClose: () => void;
  onUpdateFacility: (updated: Facility) => void;
  onUpgradeFacilityLevel: (facilityId: string) => void;
  onInstallUnit: (facilityId: string, slotIndex: number, unitType: UnitType) => void;
  onUpgradeUnit: (facilityId: string, unitId: string) => void;
  onDemolishFacility: (facilityId: string) => void;
}

export function FacilityDrawer({
  facility,
  company,
  playerCash,
  allFacilities,
  allCompanies,
  isOwner,
  tileTrafficIndex = 20,
  onClose,
  onUpdateFacility,
  onUpgradeFacilityLevel,
  onInstallUnit,
  onUpgradeUnit,
  onDemolishFacility,
}: FacilityDrawerProps) {
  const isRealEstate =
    facility.type === 'apartment_complex' ||
    facility.type === 'commercial_tower' ||
    facility.type === 'civic_housing';
  const isGovt = facility.companyId === GOVT_OWNER_ID || facility.type === 'civic_housing';
  const defaultPrice =
    facility.type === 'apartment_complex'
      ? 920
      : facility.type === 'commercial_tower'
      ? 1180
      : 10;
  const [sellingPrice, setSellingPrice] = useState(facility.sellingPrice || defaultPrice);
  const [adBudget, setAdBudget] = useState(facility.adBudget || 5000);
  const [autoPricing, setAutoPricing] = useState(Boolean(facility.autoPricing));
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'units' | 'pricing'>('overview');
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const backdropDownRef = useRef(false);

  useEffect(() => {
    const def =
      facility.type === 'apartment_complex'
        ? 920
        : facility.type === 'commercial_tower'
        ? 1180
        : 10;
    setSellingPrice(facility.sellingPrice || def);
    setAdBudget(facility.adBudget || 5000);
    setAutoPricing(Boolean(facility.autoPricing));
    setSelectedSlot(null);
    setConfirmDemolish(false);
  }, [facility.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const spec = FACILITY_SPECS[facility.type];
  const primaryUnit = facility.units.find(u => u.targetProductId);
  const currentProduct = primaryUnit?.targetProductId
    ? PRODUCTS[primaryUnit.targetProductId]
    : null;
  const hasCOO = Boolean(company?.executives?.some(e => e.role === 'COO' && e.hired));
  const isProfitable = facility.monthlyProfit >= 0;

  const facilityUpgradeCost = getFacilityUpgradeCost(facility.type, facility.level);
  const canAffordFacilityUpgrade = facility.level < 5 && playerCash >= facilityUpgradeCost;

  const handleApplySettings = () => {
    onUpdateFacility({
      ...facility,
      sellingPrice,
      adBudget,
      autoPricing: hasCOO ? autoPricing : false,
    });
  };

  const handleUpgradeLevel = () => {
    if (!canAffordFacilityUpgrade) return;
    onUpgradeFacilityLevel(facility.id);
  };

  const handleUpgradeUnit = (unitId: string) => {
    onUpgradeUnit(facility.id, unitId);
  };

  const handleChangeSupplier = (unitId: string, supplierId: string) => {
    const updatedUnits = facility.units.map(u =>
      u.id === unitId ? { ...u, supplierFacilityId: supplierId } : u
    );
    const supFac = supplierId !== 'seaport' ? allFacilities[supplierId] : null;
    const supplySourceLabel = supFac
      ? supFac.companyId === facility.companyId
        ? 'Pabrik Internal'
        : 'Grosir B2B'
      : 'Pelabuhan Impor';

    onUpdateFacility({
      ...facility,
      units: updatedUnits,
      supplySourceLabel,
    });
  };

  const handleInstallUnit = (slotIndex: number, unitType: UnitType) => {
    onInstallUnit(facility.id, slotIndex, unitType);
    setSelectedSlot(slotIndex);
  };

  const getAllowedUnitTypes = (): { type: UnitType; label: string }[] => {
    if (facility.type.startsWith('store_')) {
      return [
        { type: 'sales', label: 'Konter Penjualan' },
        { type: 'purchasing', label: 'Pengadaan' },
        { type: 'advertising', label: 'Pemasaran' },
        { type: 'inventory', label: 'Gudang Ritel' },
      ];
    }
    if (isRealEstate) {
      return [
        { type: 'sales', label: 'Manajemen Sewa' },
        { type: 'advertising', label: 'Pemasaran Properti' },
        { type: 'inventory', label: 'Utilitas Gedung' },
      ];
    }
    if (facility.type === 'rd_center') {
      return [{ type: 'rd', label: 'Lab Riset Paten' }];
    }
    if (facility.type === 'tech_software') {
      return [
        { type: 'rd', label: 'Tim Arsitektur' },
        { type: 'manufacturing', label: 'Node Cloud' },
        { type: 'sales', label: 'Lisensi B2B' },
      ];
    }
    if (facility.type === 'media_telecom') {
      return [{ type: 'advertising', label: 'Pemancar Iklan' }];
    }
    return [
      { type: 'manufacturing', label: 'Lini Produksi' },
      { type: 'purchasing', label: 'Pengadaan Bahan' },
      { type: 'inventory', label: 'Gudang Ekspedisi' },
      { type: 'sales', label: 'Grosir B2B' },
    ];
  };

  const renderUnitIcon = (uType: UnitType) => {
    if (uType === 'purchasing') return <ArrowDownToLine className="w-4 h-4" />;
    if (uType === 'manufacturing') return <Cog className="w-4 h-4" />;
    if (uType === 'sales') return <Tag className="w-4 h-4" />;
    if (uType === 'advertising') return <Megaphone className="w-4 h-4" />;
    if (uType === 'inventory') return <Package className="w-4 h-4" />;
    return <FlaskConical className="w-4 h-4" />;
  };

  const inspectedSlotUnit =
    selectedSlot !== null
      ? facility.units.find(u => u.slotIndex === selectedSlot)
      : facility.units[0];

  const supplierTargetProdId: ProductId | undefined =
    inspectedSlotUnit?.targetProductId || primaryUnit?.targetProductId;

  const availableSuppliers = useMemo(() => {
    if (!supplierTargetProdId) return [];
    const prod = PRODUCTS[supplierTargetProdId];
    if (!prod) return [];

    const neededProductIds = new Set<string>();
    if (facility.type.startsWith('store_') || facility.type === 'warehouse_logistics') {
      neededProductIds.add(supplierTargetProdId);
    } else if (prod.inputs && prod.inputs.length > 0) {
      prod.inputs.forEach(i => neededProductIds.add(i.productId));
    }

    return Object.values(allFacilities).filter(f => {
      if (f.id === facility.id) return false;
      return f.units.some(
        u =>
          (u.type === 'manufacturing' || u.type === 'inventory') &&
          u.targetProductId &&
          neededProductIds.has(u.targetProductId)
      );
    });
  }, [allFacilities, facility.id, facility.type, supplierTargetProdId]);

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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 animate-fade-in select-none"
    >
      <div
        onPointerDown={e => e.stopPropagation()}
        className="bg-[#11192c] border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-2xl w-full max-w-xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)]"
      >
        {/* Header */}
        <div className="pt-2.5 pb-2.5 px-4 flex flex-col items-center border-b border-slate-800/80 bg-[#0d1526]">
          <div className="w-10 h-1 bg-slate-700 rounded-full mb-2 sm:hidden" />
          <div className="w-full flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <FacilityIcon
                type={facility.type}
                alt={facility.name}
                className="w-10 h-10 rounded-xl shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm text-white truncate">{facility.name}</h3>
                  <span className="text-[10px] font-mono font-bold text-sky-400 shrink-0">
                    · Lv.{facility.level}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                  <span className="font-semibold text-slate-300">
                    {isGovt
                      ? 'Pemkot Metropolis Raya (PEMKOT)'
                      : `${company?.name || 'Korporasi'} (${company?.ticker || 'CORP'})`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    ({facility.tileX}, {facility.tileY})
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 shrink-0"
              aria-label="Tutup Panel Fasilitas"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex border-b border-slate-800/80 text-xs px-3 bg-[#11192c]">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`flex-1 min-h-[44px] py-2 font-bold text-center border-b-2 transition-colors ${
              activeSubTab === 'overview'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Ikhtisar
          </button>
          <button
            onClick={() => setActiveSubTab('units')}
            className={`flex-1 min-h-[44px] py-2 font-bold text-center border-b-2 transition-colors ${
              activeSubTab === 'units'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Matriks 3x3 ({facility.units.length}/9)
          </button>
          {isOwner && (
            <button
              onClick={() => setActiveSubTab('pricing')}
              className={`flex-1 min-h-[44px] py-2 font-bold text-center border-b-2 transition-colors ${
                activeSubTab === 'pricing'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Harga & Iklan
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
          {activeSubTab === 'overview' && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-slate-800/80 border border-slate-700/80 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    Pendapatan Bulanan
                  </div>
                  <div className="text-base font-bold text-emerald-400 font-mono tabular-nums mt-0.5">
                    {formatSignedCurrency(facility.monthlyRevenue)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 font-mono tabular-nums">
                    {isRealEstate
                      ? `Terhuni: ${facility.lastMonthUnitsSold.toLocaleString()} unit`
                      : `Terjual: ${facility.lastMonthUnitsSold.toLocaleString()} unit`}
                  </div>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/80 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    {isGovt ? 'Status Publik' : 'Laba Bersih'}
                  </div>
                  <div
                    className={`text-base font-bold font-mono tabular-nums mt-0.5 flex items-center gap-1 ${
                      isGovt
                        ? 'text-teal-400'
                        : isProfitable
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {isProfitable ? (
                      <TrendingUp className="w-4 h-4 shrink-0" />
                    ) : (
                      <TrendingDown className="w-4 h-4 shrink-0" />
                    )}
                    <span>
                      {isGovt
                        ? 'Fasilitas Kota'
                        : formatSignedCurrency(facility.monthlyProfit)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 font-mono tabular-nums">
                    {isGovt
                      ? 'Subsidi Non-Bursa'
                      : `HPP: ${formatSignedCurrency(facility.monthlyCostOfGoods)}`}
                  </div>
                </div>
              </div>

              {/* Supply Chain, Traffic & Quality Metrics */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">
                    {isRealEstate ? 'Kategori Properti:' : 'Komoditas Fokus:'}
                  </span>
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    {isRealEstate ? (
                      <FacilityIcon type={facility.type} alt={spec?.name} className="w-6 h-6 rounded-md" />
                    ) : (
                      <ProductIcon
                        id={primaryUnit?.targetProductId || 'wheat'}
                        alt={currentProduct?.name}
                        className="w-6 h-6 rounded-md"
                      />
                    )}
                    <span>{currentProduct?.name || spec?.name}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Indeks Keramaian Lokasi:</span>
                  <span className="font-mono font-bold text-amber-400 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" />
                    <span>
                      {tileTrafficIndex}/100 ({Math.round(getTrafficDemandMultiplier(tileTrafficIndex) * 100)}% trafik)
                    </span>
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">
                    {isRealEstate ? 'Ringkasan Hunian:' : 'Sumber Rantai Pasok:'}
                  </span>
                  <span className="font-mono font-semibold text-sky-400 flex items-center gap-1">
                    {facility.supplySourceLabel === 'Pelabuhan Impor' ||
                    !facility.supplySourceLabel ? (
                      <Anchor className="w-3.5 h-3.5 text-teal-400" />
                    ) : (
                      <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>{facility.supplySourceLabel || 'Pelabuhan Impor'}</span>
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-400">
                      {isRealEstate ? 'Kualitas Bangunan & Lokasi' : 'Rating Kualitas Produk'}
                    </span>
                    <span className="font-mono tabular-nums text-sky-400 font-bold">
                      {facility.qualityRating} / 100
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-sky-500 h-full rounded-full"
                      style={{ width: `${facility.qualityRating}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-400">Rating Merek (Brand Power)</span>
                    <span className="font-mono tabular-nums text-amber-400 font-bold">
                      {facility.brandRating} / 100
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full"
                      style={{ width: `${facility.brandRating}%` }}
                    />
                  </div>
                </div>

                {facility.inventoryCapacity > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">Stok Gudang Fasilitas</span>
                      <span className="font-mono tabular-nums text-slate-300 font-bold">
                        {facility.inventoryLevel.toLocaleString()} /{' '}
                        {facility.inventoryCapacity.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (facility.inventoryLevel / Math.max(1, facility.inventoryCapacity)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Expense Breakdown */}
              <div className="bg-slate-800/30 border border-slate-700/60 rounded-xl p-3 space-y-1 text-[11px]">
                <div className="font-bold text-slate-300 mb-1 flex items-center justify-between">
                  <span>Beban Operasional Rutin</span>
                  {hasCOO && (
                    <span className="text-[10px] font-mono text-emerald-400">
                      Diskon COO -15% aktif
                    </span>
                  )}
                </div>
                <div className="flex justify-between text-slate-400 font-mono tabular-nums">
                  <span>Perawatan Bangunan:</span>
                  <span className="text-slate-200">
                    ${(hasCOO
                      ? Math.round(facility.monthlyMaintenance * 0.85)
                      : facility.monthlyMaintenance
                    ).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400 font-mono tabular-nums">
                  <span>Anggaran Iklan:</span>
                  <span className="text-slate-200">${facility.adBudget.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}

          {activeSubTab === 'units' && (
            <div className="space-y-3">
              <div className="text-[11px] text-slate-400 leading-snug">
                Ketuk salah satu dari <strong>9 slot Matriks 3x3</strong> untuk menaikkan level
                unit, memasang unit baru, atau menautkan pemasok bahan baku internal.
              </div>

              {/* Interactive 3x3 Grid Matrix */}
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 9 }).map((_, slotIdx) => {
                  const unit = facility.units.find(u => u.slotIndex === slotIdx);
                  const isSelected = selectedSlot === slotIdx;

                  if (unit) {
                    return (
                      <button
                        key={slotIdx}
                        onClick={() => setSelectedSlot(slotIdx)}
                        className={`min-h-[72px] p-2 rounded-xl border text-left flex flex-col justify-between transition-colors ${
                          isSelected
                            ? 'bg-sky-950/60 border-sky-400 ring-1 ring-sky-400/50'
                            : 'bg-slate-800/90 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-sky-400">{renderUnitIcon(unit.type)}</span>
                          <span className="text-[10px] font-mono font-bold text-emerald-400">
                            Lv.{unit.level}
                          </span>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-white truncate">
                            {unit.type === 'purchasing'
                              ? 'Pengadaan'
                              : unit.type === 'manufacturing'
                              ? 'Produksi'
                              : unit.type === 'sales'
                              ? 'Penjualan'
                              : unit.type === 'advertising'
                              ? 'Promosi'
                              : unit.type === 'inventory'
                              ? 'Gudang'
                              : 'Riset R&D'}
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono tabular-nums">
                            Cap {unit.capacity.toLocaleString()}
                          </div>
                        </div>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={slotIdx}
                      onClick={() => isOwner && setSelectedSlot(slotIdx)}
                      disabled={!isOwner}
                      className={`min-h-[72px] p-2 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-400 text-emerald-300'
                          : isOwner
                          ? 'bg-slate-950/50 border-slate-700/80 text-slate-500 hover:text-slate-300 hover:border-slate-500'
                          : 'bg-slate-950/30 border-slate-800/60 text-slate-700 cursor-not-allowed'
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-[10px] font-medium">Slot {slotIdx + 1}</span>
                    </button>
                  );
                })}
              </div>

              {/* Selected Slot Inspector / Installer */}
              {selectedSlot !== null && !facility.units.find(u => u.slotIndex === selectedSlot) && isOwner ? (
                <div className="bg-slate-800/80 border border-emerald-700/60 rounded-xl p-3 space-y-2 animate-fade-in">
                  <div className="text-[11px] font-bold text-emerald-400">
                    Pasang Unit Baru di Slot #{selectedSlot + 1}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {getAllowedUnitTypes().map(opt => {
                      const installCost = getUnitInstallCost(opt.type);
                      const canAffordInstall = playerCash >= installCost;
                      return (
                        <button
                          key={opt.type}
                          disabled={!canAffordInstall}
                          onClick={() => handleInstallUnit(selectedSlot, opt.type)}
                          className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-left flex items-center justify-between gap-1.5 transition-colors ${
                            canAffordInstall
                              ? 'bg-slate-900 hover:bg-sky-600/20 border-slate-700 hover:border-sky-400 text-slate-200'
                              : 'bg-slate-950/60 border-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={canAffordInstall ? 'text-sky-400' : 'text-slate-600'}>
                              {renderUnitIcon(opt.type)}
                            </span>
                            <span className="text-[11px] font-semibold truncate">{opt.label}</span>
                          </div>
                          <span
                            className={`text-[10px] font-mono tabular-nums shrink-0 ${
                              canAffordInstall ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {formatCostShort(installCost)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : inspectedSlotUnit ? (
                <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-sky-900/50 border border-sky-700/60 flex items-center justify-center text-sky-400">
                        {renderUnitIcon(inspectedSlotUnit.type)}
                      </div>
                      <div>
                        <div className="font-bold text-xs text-white">{inspectedSlotUnit.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                          Slot #{inspectedSlotUnit.slotIndex + 1} · Level {inspectedSlotUnit.level}/5
                          · Efisiensi {Math.round(inspectedSlotUnit.efficiency * 100)}%
                        </div>
                      </div>
                    </div>

                    {isOwner && inspectedSlotUnit.level < 5 && (() => {
                      const unitUpgradeCost = getUnitUpgradeCost(inspectedSlotUnit.level);
                      const canAffordUnitUp = playerCash >= unitUpgradeCost;
                      return (
                        <button
                          disabled={!canAffordUnitUp}
                          onClick={() => handleUpgradeUnit(inspectedSlotUnit.id)}
                          className={`min-h-[38px] px-3 rounded-lg font-bold text-[11px] shrink-0 transition-colors ${
                            canAffordUnitUp
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'bg-slate-900 text-slate-500 border border-slate-700 cursor-not-allowed'
                          }`}
                        >
                          Upgrade Lv.{inspectedSlotUnit.level + 1} ({formatCostShort(unitUpgradeCost)})
                        </button>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/60 text-[10px] font-mono tabular-nums">
                    <div>
                      <span className="text-slate-400">Kapasitas: </span>
                      <span className="text-slate-200 font-bold">
                        {inspectedSlotUnit.capacity.toLocaleString()}/bln
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400">Biaya Unit: </span>
                      <span className="text-slate-200 font-bold">
                        ${inspectedSlotUnit.monthlyCost.toLocaleString()}/bln
                      </span>
                    </div>
                  </div>

                  {/* Supply Chain Link Selector for Purchasing Units */}
                  {isOwner && inspectedSlotUnit.type === 'purchasing' && (
                    <div className="pt-2 border-t border-slate-700/60 space-y-1.5">
                      <label
                        htmlFor="facility-supplier-select"
                        className="text-[11px] font-bold text-sky-400 flex items-center gap-1.5"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Tautkan Pemasok Rantai Pasok:</span>
                      </label>
                      <select
                        id="facility-supplier-select"
                        value={inspectedSlotUnit.supplierFacilityId || 'seaport'}
                        onChange={e => handleChangeSupplier(inspectedSlotUnit.id, e.target.value)}
                        className="w-full min-h-[42px] bg-slate-950 border border-slate-700 rounded-xl px-2.5 text-xs text-slate-100 focus:outline-hidden focus:border-sky-500"
                      >
                        <option value="seaport">
                          Pelabuhan Impor Global (Harga Impor + Tarif{' '}
                          {currentProduct ? `$${currentProduct.seaportPrice}` : ''})
                        </option>
                        {availableSuppliers.map(sup => {
                          const supComp = allCompanies[sup.companyId];
                          const isInternal = sup.companyId === facility.companyId;
                          return (
                            <option key={sup.id} value={sup.id}>
                              {sup.name} ({supComp?.ticker}) ·{' '}
                              {isInternal ? 'Internal / HPP Hemat' : 'B2B Grosir'} · Kualitas{' '}
                              {sup.qualityRating}
                            </option>
                          );
                        })}
                      </select>
                      {availableSuppliers.length === 0 && (
                        <div className="text-[10px] text-slate-400">
                          Bangun Pabrik/Perkebunan penghasil komoditas terkait untuk menautkan
                          pasokan internal berbiaya rendah.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {activeSubTab === 'pricing' && isOwner && (
            <div className="space-y-3.5">
              {/* COO Auto-Pricing Switch */}
              <div className="bg-slate-800/60 border border-slate-700 p-3 rounded-xl flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Otomasi Harga COO (Auto-Pricing)</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {hasCOO
                      ? 'COO aktif: harga otomatis menyesuaikan tingkat stok dan daya beli kota.'
                      : 'Rekrut COO di menu Korporat -> Eksekutif untuk mengaktifkan otomasi harga.'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!hasCOO}
                  onClick={() => setAutoPricing(prev => !prev)}
                  className={`min-h-[38px] px-3 rounded-lg font-bold text-[11px] shrink-0 transition-colors ${
                    !hasCOO
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : autoPricing
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {autoPricing && hasCOO ? 'Aktif' : 'Nonaktif'}
                </button>
              </div>

              {/* Selling Price / Real Estate Rent */}
              <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="facility-price-slider"
                    className="font-bold text-slate-200 flex items-center gap-1"
                  >
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span>{isRealEstate ? 'Tarif Sewa Bulanan / Unit' : 'Harga Jual Satuan'}</span>
                  </label>
                  <span className="font-mono tabular-nums text-emerald-400 font-bold text-sm">
                    ${sellingPrice.toLocaleString()}
                  </span>
                </div>
                <input
                  id="facility-price-slider"
                  type="range"
                  min={
                    isRealEstate
                      ? facility.type === 'commercial_tower'
                        ? 600
                        : 450
                      : Math.max(1, Math.round((currentProduct?.baseCost || 10) * 0.5))
                  }
                  max={
                    isRealEstate
                      ? facility.type === 'commercial_tower'
                        ? 3200
                        : 2400
                      : Math.round((currentProduct?.basePrice || 100) * 2.5)
                  }
                  step={isRealEstate ? 25 : 1}
                  value={sellingPrice}
                  onChange={e => setSellingPrice(Number(e.target.value))}
                  className="w-full accent-sky-500 h-2 bg-slate-700 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono tabular-nums">
                  {isRealEstate ? (
                    <>
                      <span>Utilitas: ${facility.type === 'commercial_tower' ? 285 : 210}</span>
                      <span>Pasar: ${facility.type === 'commercial_tower' ? 1180 : 920}</span>
                      <span>Trafik: {tileTrafficIndex}/100</span>
                    </>
                  ) : (
                    <>
                      <span>Dasar: ${currentProduct?.baseCost || 0}</span>
                      <span>Patokan: ${currentProduct?.basePrice || 0}</span>
                      <span>Impor: ${currentProduct?.seaportPrice || 0}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Ad Budget */}
              <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="facility-ad-slider"
                    className="font-bold text-slate-200 flex items-center gap-1"
                  >
                    <Megaphone className="w-4 h-4 text-amber-400" />
                    <span>Anggaran Iklan Bulanan</span>
                  </label>
                  <span className="font-mono tabular-nums text-amber-400 font-bold text-sm">
                    ${adBudget.toLocaleString()}
                  </span>
                </div>
                <input
                  id="facility-ad-slider"
                  type="range"
                  min={0}
                  max={60000}
                  step={2500}
                  value={adBudget}
                  onChange={e => setAdBudget(Number(e.target.value))}
                  className="w-full accent-amber-500 h-2 bg-slate-700 rounded-lg cursor-pointer"
                />
                <div className="text-[10px] text-slate-400">
                  Meningkatkan Brand Rating cabang untuk produk yang sensitif terhadap merek.
                </div>
              </div>

              <button
                onClick={handleApplySettings}
                className="w-full min-h-[46px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors"
              >
                Simpan Konfigurasi Fasilitas
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions with Inline 2-step Demolish Confirmation */}
        {isOwner && (
          <div className="pt-2.5 px-4 pb-3 border-t border-slate-800 flex items-center gap-2 bg-slate-950/80">
            {!confirmDemolish ? (
              <>
                <button
                  onClick={handleUpgradeLevel}
                  disabled={!canAffordFacilityUpgrade}
                  className={`flex-1 min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                    facility.level >= 5
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : canAffordFacilityUpgrade
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-slate-800 text-rose-400/80 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  <ArrowUpCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {facility.level < 5
                      ? `Naikkan Lv.${facility.level + 1} (${formatCostShort(facilityUpgradeCost)})`
                      : 'Level Maksimal (Lv.5)'}
                  </span>
                </button>

                <button
                  onClick={() => setConfirmDemolish(true)}
                  className="min-h-[44px] px-3.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-xs flex items-center gap-1.5"
                  title="Bongkar Fasilitas"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Bongkar</span>
                </button>
              </>
            ) : (
              <div className="w-full flex items-center justify-between gap-2 bg-rose-950/50 border border-rose-800/80 rounded-xl p-2">
                <span className="text-[11px] font-semibold text-rose-200 pl-1">
                  Bongkar & jual aset (35%)?
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setConfirmDemolish(false)}
                    className="min-h-[38px] px-3 rounded-lg bg-slate-800 text-slate-200 font-bold text-xs"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => onDemolishFacility(facility.id)}
                    className="min-h-[38px] px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
                  >
                    Ya, Bongkar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
