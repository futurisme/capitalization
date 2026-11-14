import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { SimulationState, Facility, MapParcel, FacilityType, ProductId, UnitType } from './types/game';
import {
  generateDefaultState,
  saveGameStateToStorage,
  loadGameStateFromStorage,
} from './engine/saveSystem';
import {
  simulateEconomicMonth,
  createDefaultUnitsForFacility,
  addUnitToFacilitySlot,
  getFacilityUpgradeCost,
  getUnitInstallCost,
  getUnitUpgradeCost,
  recalculateCityTraffic,
  claimResidentProperty,
  demolishResidentProperty,
  buyVacantLandParcel,
  sellOwnedLandParcel,
} from './engine/economyEngine';
import { getDepositYieldBonus } from './engine/housingEcosystem';
import { getParcelAt } from './engine/spatialGrid';
import { roundCurrency, round2 } from './engine/precisionMath';
import { simulateAICompetitors, findAvailableParcel } from './engine/aiCompetitor';
import { FACILITY_SPECS, PRODUCTS } from './engine/productsData';

import { TopHeader } from './components/TopHeader';
import { BottomNav, ActiveTab } from './components/BottomNav';
import { MapView } from './components/MapView';
import { FacilitiesView } from './components/FacilitiesView';
import { MarketAnalysisView } from './components/MarketAnalysisView';
import { StockMarketView } from './components/StockMarketView';
import { CorporateHQView } from './components/CorporateHQView';
import { FacilityDrawer } from './components/FacilityDrawer';
import { BuildModal } from './components/BuildModal';
import { ExePortalView } from './components/ExePortalView';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<SimulationState>(() => {
    const saved = loadGameStateFromStorage();
    return saved || generateDefaultState();
  });

  const [isExeRoute, setIsExeRoute] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return /^\/exe\/?$/.test(window.location.pathname);
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [inspectingFacilityId, setInspectingFacilityId] = useState<string | null>(null);
  const [isBuildModalOpen, setIsBuildModalOpen] = useState(false);
  const [targetBuildParcel, setTargetBuildParcel] = useState<MapParcel | undefined>(undefined);
  const [toastMsg, setToastMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    const onPopState = () => {
      setIsExeRoute(/^\/exe\/?$/.test(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleOpenExePortal = useCallback(() => {
    window.history.pushState(null, '', '/exe');
    setIsExeRoute(true);
  }, []);

  const handleCloseExePortal = useCallback(() => {
    window.history.pushState(null, '', '/');
    setIsExeRoute(false);
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickSinceSaveRef = useRef(0);
  const buildSeqRef = useRef(1);

  const inspectingFacility = inspectingFacilityId
    ? state.facilities[inspectingFacilityId] ?? null
    : null;

  const showToast = useCallback((text: string, isError = false) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMsg({ text, isError });
    toastTimerRef.current = setTimeout(() => {
      setToastMsg(prev => (prev?.text === text ? null : prev));
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Flush latest simulation state on page exit/background
  useEffect(() => {
    const flushState = () => {
      saveGameStateToStorage(stateRef.current);
    };
    window.addEventListener('beforeunload', flushState);
    window.addEventListener('pagehide', flushState);
    return () => {
      window.removeEventListener('beforeunload', flushState);
      window.removeEventListener('pagehide', flushState);
    };
  }, []);

  // Keep document.body.dataset.state synchronized for runtime inspection
  useEffect(() => {
    document.body.dataset.state = state.isPaused ? 'paused' : 'playing';
  }, [state.isPaused]);

  // Simulation timer loop with throttled auto-save at high sim speeds
  useEffect(() => {
    if (state.isPaused) return;

    const intervalMs = state.simSpeed === 5 ? 750 : state.simSpeed === 2 ? 1800 : 3500;
    const saveEveryTicks = state.simSpeed === 5 ? 4 : state.simSpeed === 2 ? 2 : 1;

    const timer = setInterval(() => {
      const current = stateRef.current;
      if (current.isPaused) return;

      const afterEconomy = simulateEconomicMonth(current);
      const afterAI = simulateAICompetitors(afterEconomy);
      tickSinceSaveRef.current += 1;
      if (tickSinceSaveRef.current >= saveEveryTicks) {
        tickSinceSaveRef.current = 0;
        saveGameStateToStorage(afterAI);
      }
      setState(afterAI);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [state.isPaused, state.simSpeed]);

  const handleTogglePause = useCallback(() => {
    setState(prev => {
      const next = { ...prev, isPaused: !prev.isPaused };
      if (next.isPaused) {
        saveGameStateToStorage(next);
      }
      return next;
    });
  }, []);

  const handleChangeSpeed = useCallback((speed: 1 | 2 | 5) => {
    setState(prev => ({ ...prev, simSpeed: speed, isPaused: false }));
  }, []);

  const handleAdvanceMonth = useCallback(() => {
    const current = stateRef.current;
    const afterEconomy = simulateEconomicMonth(current);
    const afterAI = simulateAICompetitors(afterEconomy);
    tickSinceSaveRef.current = 0;
    saveGameStateToStorage(afterAI);
    setState(afterAI);
  }, []);

  const handleBuildFacility = (facilityType: FacilityType, targetProduct?: ProductId) => {
    const spec = FACILITY_SPECS[facilityType];
    const playerComp = state.companies[state.playerCompanyId];

    if (!playerComp || playerComp.cash < spec.constructionCost) {
      showToast('Dana kas tidak mencukupi untuk konstruksi fasilitas ini.', true);
      return;
    }

    let parcel = targetBuildParcel;
    if (
      !parcel ||
      parcel.facilityId ||
      (parcel.ownerCompanyId && parcel.ownerCompanyId !== state.playerCompanyId)
    ) {
      const isIndustrial =
        facilityType.startsWith('factory_') ||
        facilityType === 'mine_extraction' ||
        facilityType === 'farm_agriculture' ||
        facilityType === 'power_plant_green' ||
        facilityType === 'warehouse_logistics';
      const isResidential = facilityType === 'apartment_complex';
      parcel =
        findAvailableParcel(
          state.mapParcels,
          isIndustrial ? 'industrial' : isResidential ? 'residential' : 'commercial'
        ) || undefined;
    }

    if (!parcel) {
      showToast('Tidak ada kavling kosong yang tersedia di kota.', true);
      return;
    }

    const seq = buildSeqRef.current++;
    const facilityId = `fac_plyr_${state.currentTick}_${parcel.x}_${parcel.y}_${seq}`;
    const initialUnits = createDefaultUnitsForFacility(facilityType, targetProduct);
    const prod = targetProduct ? PRODUCTS[targetProduct] : null;
    const isRealEstate =
      facilityType === 'apartment_complex' || facilityType === 'commercial_tower';
    const depositBonusPct = getDepositYieldBonus(facilityType, parcel.resourceDeposit);

    const newFacility: Facility = {
      id: facilityId,
      companyId: state.playerCompanyId,
      name: `${spec.name} ${playerComp.ticker}`,
      type: facilityType,
      tileX: parcel.x,
      tileY: parcel.y,
      level: 1,
      createdMonth: state.currentTick,
      units: initialUnits,
      sellingPrice:
        facilityType === 'apartment_complex'
          ? 920
          : facilityType === 'commercial_tower'
          ? 1180
          : prod
          ? prod.basePrice
          : 50,
      adBudget: 5000,
      monthlyMaintenance: spec.monthlyMaintenance,
      monthlyProduction: 0,
      monthlySales: 0,
      monthlyRevenue: 0,
      monthlyCostOfGoods: 0,
      monthlyProfit: 0,
      lastMonthUnitsSold: 0,
      inventoryLevel: isRealEstate ? 0 : facilityType.startsWith('store_') ? 600 : 800,
      inventoryCapacity: isRealEstate
        ? 0
        : facilityType === 'warehouse_logistics'
        ? 30000
        : 12000,
      qualityRating: 50,
      brandRating: 50,
      depositBonusPct: depositBonusPct > 0 ? depositBonusPct : undefined,
      supplySourceLabel: isRealEstate
        ? 'Siap Huni / Sewa'
        : facilityType.startsWith('store_')
        ? 'Pelabuhan Impor'
        : depositBonusPct > 0
        ? `Deposit +${depositBonusPct}%`
        : 'Produksi Lokal',
    };

    const updatedPlayerComp = {
      ...playerComp,
      cash: roundCurrency(playerComp.cash - spec.constructionCost),
      facilitiesCount: playerComp.facilitiesCount + 1,
    };

    const nextFacilities = {
      ...state.facilities,
      [facilityId]: newFacility,
    };

    const markedParcels = state.mapParcels.map(p =>
      p.x === parcel!.x && p.y === parcel!.y
        ? {
            ...p,
            facilityId,
            ownerCompanyId: state.playerCompanyId,
            landStatus: 'corporate' as const,
          }
        : p
    );
    const updatedParcels = recalculateCityTraffic(markedParcels, nextFacilities);

    const newState: SimulationState = {
      ...state,
      companies: {
        ...state.companies,
        [state.playerCompanyId]: updatedPlayerComp,
      },
      facilities: nextFacilities,
      mapParcels: updatedParcels,
      newsFeed: [
        {
          id: `news_build_${state.currentTick}_${seq}`,
          month: state.currentTick,
          category: 'economy' as const,
          title: `Konstruksi Baru: ${spec.name}`,
          detail: `${playerComp.name} meresmikan ${spec.name} di kavling (${parcel.x}, ${parcel.y}) senilai $${spec.constructionCost.toLocaleString()}.`,
        },
        ...state.newsFeed,
      ].slice(0, 25),
    };

    setState(newState);
    saveGameStateToStorage(newState);
    setIsBuildModalOpen(false);
    setTargetBuildParcel(undefined);
    setInspectingFacilityId(facilityId);
    showToast(`${spec.name} berhasil dibangun di (${parcel.x}, ${parcel.y}).`);
  };

  const handleUpdateFacility = (updated: Facility) => {
    const newState: SimulationState = {
      ...state,
      facilities: {
        ...state.facilities,
        [updated.id]: updated,
      },
    };
    setState(newState);
    saveGameStateToStorage(newState);
  };

  const handleUpgradeFacilityLevel = (facilityId: string) => {
    const fac = state.facilities[facilityId];
    const playerComp = state.companies[state.playerCompanyId];
    if (!fac || !playerComp || fac.companyId !== state.playerCompanyId || fac.level >= 5) return;

    const cost = getFacilityUpgradeCost(fac.type, fac.level);
    if (playerComp.cash < cost) {
      showToast('Dana kas tidak mencukupi untuk menaikkan level fasilitas.', true);
      return;
    }

    const updatedFac: Facility = {
      ...fac,
      level: fac.level + 1,
      inventoryCapacity: fac.inventoryCapacity + 6000,
      qualityRating: Math.min(100, fac.qualityRating + 6),
    };

    const nextState: SimulationState = {
      ...state,
      companies: {
        ...state.companies,
        [state.playerCompanyId]: {
          ...playerComp,
          cash: roundCurrency(playerComp.cash - cost),
        },
      },
      facilities: {
        ...state.facilities,
        [facilityId]: updatedFac,
      },
    };

    setState(nextState);
    saveGameStateToStorage(nextState);
    showToast(`${fac.name} ditingkatkan ke Lv.${updatedFac.level} (-$${cost.toLocaleString()}).`);
  };

  const handleInstallUnit = (facilityId: string, slotIndex: number, unitType: UnitType) => {
    const fac = state.facilities[facilityId];
    const playerComp = state.companies[state.playerCompanyId];
    if (!fac || !playerComp || fac.companyId !== state.playerCompanyId) return;
    if (fac.units.some(u => u.slotIndex === slotIndex)) return;

    const cost = getUnitInstallCost(unitType);
    if (playerComp.cash < cost) {
      showToast('Dana kas tidak mencukupi untuk memasang unit baru.', true);
      return;
    }

    const updatedFac = addUnitToFacilitySlot(fac, slotIndex, unitType);
    const nextState: SimulationState = {
      ...state,
      companies: {
        ...state.companies,
        [state.playerCompanyId]: {
          ...playerComp,
          cash: roundCurrency(playerComp.cash - cost),
        },
      },
      facilities: {
        ...state.facilities,
        [facilityId]: updatedFac,
      },
    };

    setState(nextState);
    saveGameStateToStorage(nextState);
    showToast(`Unit dipasang di Slot #${slotIndex + 1} (-$${cost.toLocaleString()}).`);
  };

  const handleUpgradeUnit = (facilityId: string, unitId: string) => {
    const fac = state.facilities[facilityId];
    const playerComp = state.companies[state.playerCompanyId];
    if (!fac || !playerComp || fac.companyId !== state.playerCompanyId) return;
    const targetUnit = fac.units.find(u => u.id === unitId);
    if (!targetUnit || targetUnit.level >= 5) return;

    const cost = getUnitUpgradeCost(targetUnit.level);
    if (playerComp.cash < cost) {
      showToast('Dana kas tidak mencukupi untuk menaikkan level unit.', true);
      return;
    }

    const updatedFac: Facility = {
      ...fac,
      units: fac.units.map(u => {
        if (u.id !== unitId) return u;
        return {
          ...u,
          level: u.level + 1,
          capacity: Math.round(u.capacity * 1.35),
          monthlyCost: Math.round(u.monthlyCost * 1.25),
          efficiency: Math.min(1.2, round2(u.efficiency + 0.05)),
        };
      }),
    };

    const nextState: SimulationState = {
      ...state,
      companies: {
        ...state.companies,
        [state.playerCompanyId]: {
          ...playerComp,
          cash: roundCurrency(playerComp.cash - cost),
        },
      },
      facilities: {
        ...state.facilities,
        [facilityId]: updatedFac,
      },
    };

    setState(nextState);
    saveGameStateToStorage(nextState);
    showToast(`${targetUnit.name} naik ke Lv.${targetUnit.level + 1} (-$${cost.toLocaleString()}).`);
  };

  const handleDemolishFacility = (facilityId: string) => {
    const fac = state.facilities[facilityId];
    if (!fac) return;

    const spec = FACILITY_SPECS[fac.type];
    const refund = Math.round((spec ? spec.constructionCost : 200000) * 0.35);
    const playerComp = state.companies[state.playerCompanyId];

    const updatedFacilities = { ...state.facilities };
    delete updatedFacilities[facilityId];

    const updatedParcels = recalculateCityTraffic(
      state.mapParcels.map(p =>
        p.facilityId === facilityId
          ? { ...p, facilityId: undefined, ownerCompanyId: undefined }
          : p
      ),
      updatedFacilities
    );

    const updatedPlayerComp = {
      ...playerComp,
      cash: roundCurrency(playerComp.cash + refund),
      facilitiesCount: Math.max(0, playerComp.facilitiesCount - 1),
    };

    const newState: SimulationState = {
      ...state,
      companies: {
        ...state.companies,
        [state.playerCompanyId]: updatedPlayerComp,
      },
      facilities: updatedFacilities,
      mapParcels: updatedParcels,
    };

    setState(newState);
    setInspectingFacilityId(null);
    saveGameStateToStorage(newState);
    showToast(`${fac.name} dibongkar. Dana likuidasi +$${refund.toLocaleString()}.`);
  };

  const handleStateUpdate = useCallback((nextState: SimulationState) => {
    setState(nextState);
    tickSinceSaveRef.current = 0;
    saveGameStateToStorage(nextState);
  }, []);

  const handleClaimResident = useCallback(
    (facilityId: string) => {
      const res = claimResidentProperty(stateRef.current, facilityId);
      if (!res.success || !res.updatedState) {
        showToast(res.reason || 'Gagal mengklaim properti warga.', true);
        return;
      }
      setState(res.updatedState);
      if (inspectingFacilityId === facilityId) setInspectingFacilityId(null);
      saveGameStateToStorage(res.updatedState);
      showToast(`Lahan warga diklaim (-$${res.cost.toLocaleString()}). Siap untuk konstruksi!`);
    },
    [inspectingFacilityId, showToast]
  );

  const handleDemolishResident = useCallback(
    (facilityId: string) => {
      const res = demolishResidentProperty(stateRef.current, facilityId);
      if (!res.success || !res.updatedState) {
        showToast(res.reason || 'Gagal membongkar rumah warga.', true);
        return;
      }
      setState(res.updatedState);
      if (inspectingFacilityId === facilityId) setInspectingFacilityId(null);
      saveGameStateToStorage(res.updatedState);
      showToast(`Struktur warga dibongkar (-$${res.cost.toLocaleString()}). Lahan kembali bebas.`);
    },
    [inspectingFacilityId, showToast]
  );

  const handleBuyLand = useCallback(
    (x: number, y: number) => {
      const res = buyVacantLandParcel(stateRef.current, x, y);
      if (!res.success || !res.updatedState) {
        showToast(res.reason || 'Gagal membeli lahan.', true);
        return;
      }
      setState(res.updatedState);
      saveGameStateToStorage(res.updatedState);
      showToast(`Kavling (${x}, ${y}) kini menjadi milik korporasi Anda (-$${res.cost.toLocaleString()}).`);
    },
    [showToast]
  );

  const handleSellLand = useCallback(
    (x: number, y: number) => {
      const res = sellOwnedLandParcel(stateRef.current, x, y);
      if (!res.success || !res.updatedState) {
        showToast(res.reason || 'Gagal menjual lahan.', true);
        return;
      }
      setState(res.updatedState);
      saveGameStateToStorage(res.updatedState);
      showToast(`Kavling (${x}, ${y}) terjual (+$${Math.abs(res.cost).toLocaleString()}).`);
    },
    [showToast]
  );

  const playerFacilitiesCount = useMemo(
    () =>
      Object.values(state.facilities).filter(f => f.companyId === state.playerCompanyId).length,
    [state.facilities, state.playerCompanyId]
  );
  const activeCompaniesCount = useMemo(
    () => Object.keys(state.companies).length,
    [state.companies]
  );

  const inspectingTileTrafficIndex = inspectingFacility
    ? getParcelAt(state.mapParcels, inspectingFacility.tileX, inspectingFacility.tileY)
        ?.trafficIndex ?? 20
    : 20;

  if (isExeRoute) {
    return <ExePortalView onBackToGame={handleCloseExePortal} />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b1120] text-slate-100 overflow-hidden font-sans">
      <TopHeader
        state={state}
        onTogglePause={handleTogglePause}
        onChangeSpeed={handleChangeSpeed}
        onAdvanceMonth={handleAdvanceMonth}
      />

      {/* Non-blocking In-App Notification Toast */}
      {toastMsg && (
        <div
          className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-24px)] max-w-md px-3.5 py-2.5 rounded-xl border shadow-xl flex items-center gap-2 text-xs animate-fade-in ${
            toastMsg.isError
              ? 'bg-rose-950 border-rose-700 text-rose-200'
              : 'bg-slate-900 border-sky-600/80 text-slate-100'
          }`}
        >
          {toastMsg.isError ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
          )}
          <span className="flex-1 leading-snug">{toastMsg.text}</span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="p-1 text-slate-400 hover:text-white"
            aria-label="Tutup notifikasi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <BottomNav
          activeTab={activeTab}
          onSelectTab={tab => setActiveTab(tab)}
          facilitiesCount={playerFacilitiesCount}
          companiesCount={activeCompaniesCount}
        />

        <main className="flex-1 overflow-y-auto relative no-scrollbar">
          {activeTab === 'map' && (
            <MapView
              state={state}
              onSelectFacility={f => setInspectingFacilityId(f.id)}
              onOpenBuildModal={parcel => {
                setTargetBuildParcel(parcel);
                setIsBuildModalOpen(true);
              }}
              onClaimResident={handleClaimResident}
              onDemolishResident={handleDemolishResident}
              onBuyLand={handleBuyLand}
              onSellLand={handleSellLand}
            />
          )}

          {activeTab === 'facilities' && (
            <FacilitiesView
              state={state}
              onSelectFacility={f => setInspectingFacilityId(f.id)}
              onOpenBuildModal={() => {
                setTargetBuildParcel(undefined);
                setIsBuildModalOpen(true);
              }}
            />
          )}

          {activeTab === 'market' && <MarketAnalysisView state={state} />}

          {activeTab === 'stocks' && (
            <StockMarketView state={state} onStateUpdate={handleStateUpdate} />
          )}

          {activeTab === 'hq' && (
            <CorporateHQView
              state={state}
              onStateUpdate={handleStateUpdate}
              onOpenExePortal={handleOpenExePortal}
            />
          )}
        </main>
      </div>

      {inspectingFacility && (
        <FacilityDrawer
          facility={inspectingFacility}
          company={state.companies[inspectingFacility.companyId]}
          playerCash={state.companies[state.playerCompanyId]?.cash || 0}
          allFacilities={state.facilities}
          allCompanies={state.companies}
          isOwner={inspectingFacility.companyId === state.playerCompanyId}
          tileTrafficIndex={inspectingTileTrafficIndex}
          onClose={() => setInspectingFacilityId(null)}
          onUpdateFacility={handleUpdateFacility}
          onUpgradeFacilityLevel={handleUpgradeFacilityLevel}
          onInstallUnit={handleInstallUnit}
          onUpgradeUnit={handleUpgradeUnit}
          onDemolishFacility={handleDemolishFacility}
        />
      )}

      {isBuildModalOpen && (
        <BuildModal
          playerCash={state.companies[state.playerCompanyId]?.cash || 0}
          selectedParcel={targetBuildParcel}
          onClose={() => {
            setIsBuildModalOpen(false);
            setTargetBuildParcel(undefined);
          }}
          onBuildFacility={handleBuildFacility}
        />
      )}
    </div>
  );
}
