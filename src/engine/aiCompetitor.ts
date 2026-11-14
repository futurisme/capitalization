import {
  SimulationState,
  Company,
  Facility,
  FacilityType,
  ProductId,
  MapParcel,
  UnitType,
} from '../types/game';
import {
  FACILITY_SPECS,
  PRODUCTS,
  MAX_ACTIVE_COMPANIES,
  INITIAL_AI_ROSTER,
  NEW_ENTRANT_POOL,
  AICorporateTemplate,
} from './productsData';
import {
  addUnitToFacilitySlot,
  createDefaultUnitsForFacility,
  getFacilityUpgradeCost,
  getUnitInstallCost,
} from './facilityUnits';
import { recalculateCityTraffic } from './spatialGrid';
import { clamp, deterministicHash, round2, roundCurrency } from './precisionMath';
import { createCompanyAndStarterFromTemplate } from './saveSystem';
import { PRIMARY_CITY_ID } from './governmentEngine';

const GENERATED_ENTRANT_COLORS = [
  { color: '#0369a1', accent: '#38bdf8' },
  { color: '#6d28d9', accent: '#a78bfa' },
  { color: '#047857', accent: '#34d399' },
  { color: '#c2410c', accent: '#fb923c' },
  { color: '#be123c', accent: '#fb7185' },
  { color: '#4338ca', accent: '#818cf8' },
] as const;

export interface AISharedContext {
  facilitiesByCompany: Map<string, Facility[]>;
  suppliersByProduct: Map<ProductId, Facility[]>;
}

function isProducerOrWarehouse(fac: Facility): boolean {
  return (
    fac.type.startsWith('factory_') ||
    fac.type === 'farm_agriculture' ||
    fac.type === 'mine_extraction' ||
    fac.type === 'power_plant_green' ||
    fac.type === 'warehouse_logistics'
  );
}

export function buildAISharedContext(facilities: Record<string, Facility>): AISharedContext {
  const facilitiesByCompany = new Map<string, Facility[]>();
  const suppliersByProduct = new Map<ProductId, Facility[]>();

  const list = Object.values(facilities);
  for (let i = 0; i < list.length; i++) {
    const fac = list[i];
    let compFacs = facilitiesByCompany.get(fac.companyId);
    if (!compFacs) {
      compFacs = [];
      facilitiesByCompany.set(fac.companyId, compFacs);
    }
    compFacs.push(fac);

    if (fac.inventoryLevel > 150 && isProducerOrWarehouse(fac)) {
      for (let u = 0; u < fac.units.length; u++) {
        const pId = fac.units[u].targetProductId;
        if (pId) {
          let supList = suppliersByProduct.get(pId);
          if (!supList) {
            supList = [];
            suppliersByProduct.set(pId, supList);
          }
          supList.push(fac);
          break;
        }
      }
    }
  }

  return { facilitiesByCompany, suppliersByProduct };
}

/**
 * Evaluates available parcels for an AI company using single-pass O(W*H) scoring (zero sort/filter allocations).
 */
export function findAvailableParcel(
  mapParcels: MapParcel[],
  preferredZone: 'commercial' | 'industrial' | 'residential'
): MapParcel | null {
  let firstEmpty: MapParcel | null = null;
  let bestTrafficParcel: MapParcel | null = null;
  let bestTrafficScore = -1;

  for (let i = 0; i < mapParcels.length; i++) {
    const p = mapParcels[i];
    if (
      p.facilityId ||
      p.ownerCompanyId ||
      !p.isZoneAllowed ||
      p.terrainType === 'water' ||
      p.terrainType === 'road'
    ) {
      continue;
    }
    if (!firstEmpty) firstEmpty = p;

    if (preferredZone === 'industrial') {
      if (p.terrainType === 'industrial_zone') {
        return p;
      }
    } else if (p.terrainType === 'pavement' || p.terrainType === 'grass') {
      const traffic = p.trafficIndex || 0;
      if (traffic > bestTrafficScore) {
        bestTrafficScore = traffic;
        bestTrafficParcel = p;
      }
    }
  }

  if (bestTrafficParcel) return bestTrafficParcel;
  return firstEmpty;
}

/**
 * Calculates max allowed facilities per AI company by era to preserve realistic city sprawl
 */
export function getMaxAllowedFacilities(currentTick: number): number {
  if (currentTick < 24) return 3; // Year 1-2: strictly max 3 facilities
  if (currentTick < 60) return 4; // Year 3-5: strictly max 4 facilities
  return 6; // Late game: max 6 facilities
}

/**
 * Picks the highest-opportunity product in a candidate set based on unmet market demand & import gap.
 */
function pickMarketGapProduct(
  state: SimulationState,
  candidates: ProductId[],
  aiFacilities: Facility[]
): ProductId {
  let best = candidates[0];
  let bestScore = -Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const prodId = candidates[i];
    const prod = PRODUCTS[prodId];
    const stat = state.city.productStats[prodId];
    const importGap = stat ? stat.seaportImportShare : 90;
    const unmetGap = stat ? Math.max(0, 100 - stat.satisfactionRate) : 50;
    let alreadyOperating = false;
    for (let f = 0; f < aiFacilities.length; f++) {
      if (aiFacilities[f].units.some(u => u.targetProductId === prodId)) {
        alreadyOperating = true;
        break;
      }
    }
    const marginBonus = prod && prod.basePrice > prod.baseCost * 1.8 ? 14 : 6;

    const score =
      importGap * 0.55 +
      unmetGap * 0.85 +
      marginBonus -
      (alreadyOperating ? 28 : 0);

    if (score > bestScore) {
      bestScore = score;
      best = prodId;
    }
  }

  return best;
}

/**
 * Spawns a new AI corporation whenever active companies drop below MAX_ACTIVE_COMPANIES (10).
 * Always initializes with honest finite capital and places a starter facility on a valid parcel.
 */
export function replenishAICompetitors(
  state: SimulationState,
  excludedIds?: Set<string>
): SimulationState {
  let current = state;
  let attempts = 0;
  const combinedPool: AICorporateTemplate[] = [...NEW_ENTRANT_POOL, ...INITIAL_AI_ROSTER];

  while (
    Object.keys(current.companies).length < MAX_ACTIVE_COMPANIES &&
    attempts < MAX_ACTIVE_COMPANIES
  ) {
    attempts += 1;
    const activeTickers = new Set(Object.values(current.companies).map(c => c.ticker));

    let chosenTemplate = combinedPool.find(
      tpl =>
        !current.companies[tpl.id] &&
        !excludedIds?.has(tpl.id) &&
        !activeTickers.has(tpl.ticker)
    );

    let overrideId: string | undefined;
    if (!chosenTemplate) {
      const seq = current.currentTick + Object.keys(current.companies).length + attempts;
      const palette = GENERATED_ENTRANT_COLORS[seq % GENERATED_ENTRANT_COLORS.length];
      const personalities: AICorporateTemplate['personality'][] = [
        'expansionist',
        'quality_first',
        'supply_monopolist',
        'tech_innovator',
        'brand_titan',
        'real_estate_mogul',
        'healthcare_pioneer',
      ];
      const personality = personalities[seq % personalities.length];
      const sectorConfigs: {
        fac: FacilityType;
        prod: ProductId;
        zone: 'commercial' | 'industrial';
        focus: string;
      }[] = [
        { fac: 'store_convenience', prod: 'soft_drink', zone: 'commercial', focus: 'Ritel Konsumen' },
        { fac: 'apartment_complex', prod: 'bread', zone: 'commercial', focus: 'Real Estate Properti' },
        { fac: 'store_pharmacy', prod: 'medicine', zone: 'commercial', focus: 'Farmasi & Klinik' },
        { fac: 'factory_assembly', prod: 'smartphone', zone: 'industrial', focus: 'Perakitan Gadget' },
        { fac: 'tech_software', prod: 'ai_enterprise', zone: 'commercial', focus: 'Platform SaaS AI' },
        { fac: 'power_plant_green', prod: 'battery_cell', zone: 'industrial', focus: 'Energi & Baterai Hijau' },
        { fac: 'factory_processing', prod: 'plastic', zone: 'industrial', focus: 'Material Industri' },
        { fac: 'store_department', prod: 'fashion_apparel', zone: 'commercial', focus: 'Busana & Gaya Hidup' },
      ];
      const cfg = sectorConfigs[seq % sectorConfigs.length];
      let ticker = `NX${String((seq % 90) + 10)}`;
      let suffix = 0;
      while (activeTickers.has(ticker)) {
        suffix += 1;
        const hashNum = 100 + (deterministicHash(`${seq}_${suffix}`) % 899);
        ticker = `E${hashNum}`;
      }
      overrideId = `comp_entrant_${seq}_${ticker}`;

      chosenTemplate = {
        id: overrideId,
        name: `NexaVenture ${ticker} Tbk`,
        ticker,
        color: palette.color,
        accentColor: palette.accent,
        ceoName: `Direktur ${ticker}`,
        personality,
        sectorFocus: cfg.focus,
        brandStrategy: 'corporate',
        corporateBrandRating: 48,
        startingCash: 7800000,
        startingDebt: 0,
        sharesOutstanding: 1000000,
        stockPrice: 10.5,
        starterFacilityType: cfg.fac,
        starterProduct: cfg.prod,
        preferredZone: cfg.zone,
        techBoosts: { [cfg.prod]: 55 },
      };
    }

    const spawned = createCompanyAndStarterFromTemplate(
      chosenTemplate,
      current.mapParcels,
      current.currentTick,
      {
        overrideId,
        dateString: current.dateString,
        isNewEntrant: true,
      }
    );

    if (!spawned.facility) {
      break;
    }

    const newsItem = {
      id: `news_entrant_${current.currentTick}_${attempts}_${spawned.company.ticker}`,
      month: current.currentTick,
      category: 'competitor' as const,
      title: `IPO Pendatang Baru: ${spawned.company.name} (${spawned.company.ticker})`,
      detail: `${spawned.company.ceoName} resmi melantai di bursa dengan fokus ${spawned.company.sectorFocus} serta meresmikan ${spawned.facility.name}.`,
    };

    current = {
      ...current,
      companies: {
        ...current.companies,
        [spawned.company.id]: spawned.company,
      },
      facilities: {
        ...current.facilities,
        [spawned.facility.id]: spawned.facility,
      },
      mapParcels: spawned.updatedParcels,
      newsFeed: [newsItem, ...current.newsFeed].slice(0, 25),
    };
  }

  return current;
}

/**
 * Executes smart, realistic, cheat-free AI decision cycle for one competitor
 */
export function processAICompanyTurn(
  state: SimulationState,
  aiCompany: Company,
  sharedCtx?: AISharedContext
): {
  updatedCompany: Company;
  updatedFacilities?: Facility[];
  newFacility?: Facility;
  updatedParcels?: MapParcel[];
  newsEvent?: string;
} {
  const ctx = sharedCtx || buildAISharedContext(state.facilities);

  const updatedComp: Company = {
    ...aiCompany,
    executives: (aiCompany.executives || []).map(e => ({ ...e })),
    shareholdings: { ...aiCompany.shareholdings },
  };
  const personality = aiCompany.personality || 'expansionist';
  const aiFacilities = ctx.facilitiesByCompany.get(aiCompany.id) || [];
  const modifiedFacilities: Facility[] = [];

  // 1. Intelligent Pricing & O(1)-indexed B2B/Internal Supply Chain Linking
  for (let i = 0; i < aiFacilities.length; i++) {
    const origFac = aiFacilities[i];
    const f: Facility = { ...origFac, units: origFac.units.map(u => ({ ...u })) };
    let changed = false;

    const primaryUnit = f.units.find(u => u.targetProductId);
    const prodId = primaryUnit?.targetProductId;

    if (f.type.startsWith('store_') && prodId && PRODUCTS[prodId]) {
      const prod = PRODUCTS[prodId];
      const invRatio = f.inventoryLevel / Math.max(1, f.inventoryCapacity);

      let nextPrice = f.sellingPrice || prod.basePrice;
      if (invRatio > 0.78) {
        nextPrice = Math.max(roundCurrency(prod.baseCost * 1.18), roundCurrency(nextPrice * 0.96));
      } else if (invRatio < 0.18) {
        nextPrice = Math.min(roundCurrency(prod.basePrice * 1.36), roundCurrency(nextPrice * 1.03));
      }

      if (personality === 'expansionist') {
        nextPrice = Math.min(nextPrice, roundCurrency(prod.basePrice * 0.95));
      } else if (personality === 'quality_first' || personality === 'brand_titan') {
        nextPrice = Math.max(nextPrice, roundCurrency(prod.basePrice * 1.15));
      }

      if (updatedComp.subsidiaryDirective?.priceStrategy === 'discount') {
        nextPrice = Math.min(nextPrice, roundCurrency(prod.basePrice * 0.9));
      } else if (updatedComp.subsidiaryDirective?.priceStrategy === 'premium') {
        nextPrice = Math.max(nextPrice, roundCurrency(prod.basePrice * 1.18));
      }

      if (nextPrice !== f.sellingPrice) {
        f.sellingPrice = nextPrice;
        changed = true;
      }
    } else if (f.type === 'apartment_complex' || f.type === 'commercial_tower') {
      const targetRent = f.type === 'commercial_tower' ? 1240 : 940;
      const macroFactor =
        state.macro.cyclePhase === 'boom' ? 1.08 : state.macro.cyclePhase === 'recession' ? 0.9 : 1.0;
      const nextRent = roundCurrency(targetRent * macroFactor);
      if (Math.abs((f.sellingPrice || 0) - nextRent) > 35) {
        f.sellingPrice = nextRent;
        changed = true;
      }
    }

    // Link purchasing units via pre-indexed suppliersByProduct Map (O(neededProducts) instead of O(F))
    const purchasingUnit = f.units.find(u => u.type === 'purchasing');
    if (purchasingUnit && prodId && PRODUCTS[prodId]) {
      const recipe = PRODUCTS[prodId];
      const neededIds: ProductId[] = [];
      if (f.type.startsWith('store_') || f.type === 'warehouse_logistics') {
        neededIds.push(prodId);
      } else if (recipe.inputs) {
        for (let k = 0; k < recipe.inputs.length; k++) {
          neededIds.push(recipe.inputs[k].productId);
        }
      }

      if (neededIds.length > 0) {
        let ownBest: Facility | undefined;
        let parentBest: Facility | undefined;
        let externalBest: Facility | undefined;
        const allowParentSync =
          Boolean(updatedComp.parentCompanyId) &&
          (updatedComp.subsidiaryDirective?.allowSupplySync ?? true);

        for (let k = 0; k < neededIds.length; k++) {
          const candidates = ctx.suppliersByProduct.get(neededIds[k]);
          if (!candidates) continue;
          for (let c = 0; c < candidates.length; c++) {
            const sf = candidates[c];
            if (sf.id === f.id) continue;
            if (sf.companyId === aiCompany.id) {
              if (!ownBest || sf.qualityRating > ownBest.qualityRating) ownBest = sf;
            } else if (allowParentSync && sf.companyId === updatedComp.parentCompanyId) {
              if (!parentBest || sf.qualityRating > parentBest.qualityRating) parentBest = sf;
            } else {
              if (!externalBest || sf.qualityRating > externalBest.qualityRating) {
                externalBest = sf;
              }
            }
          }
        }

        const chosenSupplier = ownBest || parentBest || externalBest;
        if (chosenSupplier && purchasingUnit.supplierFacilityId !== chosenSupplier.id) {
          purchasingUnit.supplierFacilityId = chosenSupplier.id;
          f.supplySourceLabel =
            chosenSupplier.companyId === aiCompany.id
              ? 'Pabrik Internal'
              : chosenSupplier.companyId === updatedComp.parentCompanyId
              ? 'Sinergi Induk'
              : 'Grosir B2B';
          changed = true;
        }
      }
    }

    if (changed) modifiedFacilities.push(f);
  }

  // 2. Smart Debt Reduction (Real cash, zero cheating)
  if (
    updatedComp.debt > 250000 &&
    updatedComp.cash > 5500000 &&
    state.macro.centralBankRate >= 4.5
  ) {
    const repayAmt = Math.min(updatedComp.debt, 500000);
    updatedComp.cash = roundCurrency(updatedComp.cash - repayAmt);
    updatedComp.debt = roundCurrency(updatedComp.debt - repayAmt);
  }

  // 3. Smart C-Suite Executive Hiring when mature & profitable
  if (
    aiFacilities.length >= 2 &&
    updatedComp.lastMonthNetProfit > 85000 &&
    updatedComp.cash > 6800000 &&
    updatedComp.executives.length > 0
  ) {
    const targetRole =
      personality === 'quality_first' || personality === 'tech_innovator'
        ? 'CTO'
        : personality === 'brand_titan'
        ? 'CMO'
        : 'COO';

    const targetExec =
      updatedComp.executives.find(e => e.role === targetRole && !e.hired) ||
      updatedComp.executives.find(e => !e.hired);

    if (targetExec && updatedComp.cash > targetExec.monthlySalary + 5000000) {
      targetExec.hired = true;
      updatedComp.cash = roundCurrency(updatedComp.cash - targetExec.monthlySalary);
    }
  }

  const expansionMode = updatedComp.subsidiaryDirective?.expansionMode || 'balanced';
  const CASH_SAFETY_BUFFER =
    expansionMode === 'aggressive'
      ? 1800000
      : state.macro.cyclePhase === 'recession'
      ? 4500000
      : 3000000;

  // 4. Smart Existing Facility Capacity Upgrade / 3x3 Slot Installation
  if (updatedComp.lastMonthNetProfit > 30000 && updatedComp.cash > CASH_SAFETY_BUFFER + 600000) {
    const expandableFac = aiFacilities.find(
      f => f.type !== 'corporate_hq' && f.monthlyProfit > 25000 && f.units.length < 7
    );
    if (expandableFac) {
      const occupied = new Set(expandableFac.units.map(u => u.slotIndex));
      const freeSlot = [2, 3, 5, 6, 7, 8].find(s => !occupied.has(s));
      if (freeSlot !== undefined) {
        const unitToAdd: UnitType = expandableFac.type.startsWith('store_')
          ? expandableFac.units.filter(u => u.type === 'sales').length < 2
            ? 'sales'
            : 'advertising'
          : expandableFac.type === 'rd_center'
          ? 'rd'
          : 'manufacturing';

        const installCost = getUnitInstallCost(unitToAdd);
        if (updatedComp.cash >= installCost + CASH_SAFETY_BUFFER) {
          const idx = modifiedFacilities.findIndex(m => m.id === expandableFac.id);
          const baseFac = idx >= 0 ? modifiedFacilities[idx] : expandableFac;
          const upgraded = addUnitToFacilitySlot(baseFac, freeSlot, unitToAdd);
          if (idx >= 0) modifiedFacilities[idx] = upgraded;
          else modifiedFacilities.push(upgraded);
          updatedComp.cash = roundCurrency(updatedComp.cash - installCost);
        }
      }
    } else {
      const levelUpTarget = aiFacilities.find(
        f => f.type !== 'corporate_hq' && f.level < 3 && f.monthlyProfit > 60000
      );
      if (levelUpTarget) {
        const upCost = getFacilityUpgradeCost(levelUpTarget.type, levelUpTarget.level);
        if (updatedComp.cash >= upCost + CASH_SAFETY_BUFFER) {
          const idx = modifiedFacilities.findIndex(m => m.id === levelUpTarget.id);
          const baseFac = idx >= 0 ? modifiedFacilities[idx] : levelUpTarget;
          const leveled: Facility = {
            ...baseFac,
            level: baseFac.level + 1,
            inventoryCapacity: baseFac.inventoryCapacity + 6000,
            qualityRating: Math.min(100, baseFac.qualityRating + 5),
          };
          if (idx >= 0) modifiedFacilities[idx] = leveled;
          else modifiedFacilities.push(leveled);
          updatedComp.cash = roundCurrency(updatedComp.cash - upCost);
        }
      }
    }
  }

  // 5. Anti-Cheat & Macro-Aware New Facility Construction Gates
  const maxAllowed = getMaxAllowedFacilities(state.currentTick) + (expansionMode === 'aggressive' ? 2 : 0);
  const lastBuilt = updatedComp.lastConstructedTick ?? -99;
  const canConstructNew =
    expansionMode !== 'cash_cow' &&
    aiFacilities.length < maxAllowed &&
    state.currentTick - lastBuilt >= (expansionMode === 'aggressive' ? 4 : 8) &&
    updatedComp.lastMonthNetProfit >= 15000;

  if (canConstructNew) {
    let facilityToBuild: FacilityType | null = null;
    let targetProductToAssign: ProductId = 'bread';

    if (personality === 'expansionist') {
      const stores = aiFacilities.filter(f => f.type.startsWith('store_'));
      const hasMedia = aiFacilities.some(f => f.type === 'media_telecom');
      const hasFoodFac = aiFacilities.some(f => f.type === 'factory_assembly');

      if (stores.length < 2) {
        facilityToBuild = 'store_convenience';
        targetProductToAssign = pickMarketGapProduct(state, ['bread', 'soft_drink'], aiFacilities);
      } else if (stores.length < 3 && state.currentTick > 10) {
        facilityToBuild = 'store_department';
        targetProductToAssign = pickMarketGapProduct(
          state,
          ['fashion_apparel', 'soft_drink', 'smartphone'],
          aiFacilities
        );
      } else if (!hasFoodFac && state.currentTick > 18) {
        facilityToBuild = 'factory_assembly';
        targetProductToAssign = pickMarketGapProduct(
          state,
          ['bread', 'soft_drink', 'fashion_apparel'],
          aiFacilities
        );
      } else if (!hasMedia && state.currentTick > 26 && updatedComp.cash > 6800000) {
        facilityToBuild = 'media_telecom';
        targetProductToAssign = 'soft_drink';
      }
    } else if (personality === 'quality_first') {
      const hasRD = aiFacilities.some(f => f.type === 'rd_center');
      const hasSoftware = aiFacilities.some(f => f.type === 'tech_software');
      const hasFactory = aiFacilities.some(f => f.type === 'factory_assembly');
      const hasAutoOrElec = aiFacilities.some(
        f => f.type === 'store_electronics' || f.type === 'store_auto'
      );

      if (!hasRD) {
        facilityToBuild = 'rd_center';
        targetProductToAssign = 'smartphone';
      } else if (!hasFactory && state.currentTick > 10) {
        facilityToBuild = 'factory_assembly';
        targetProductToAssign = pickMarketGapProduct(
          state,
          ['smartphone', 'laptop', 'automobile'],
          aiFacilities
        );
      } else if (!hasAutoOrElec && state.currentTick > 16) {
        facilityToBuild = 'store_electronics';
        targetProductToAssign = pickMarketGapProduct(state, ['smartphone', 'laptop'], aiFacilities);
      } else if (!hasSoftware && state.currentTick > 22) {
        facilityToBuild = 'tech_software';
        targetProductToAssign = pickMarketGapProduct(
          state,
          ['software_os', 'ai_enterprise'],
          aiFacilities
        );
      }
    } else if (personality === 'supply_monopolist') {
      const hasMine = aiFacilities.some(f => f.type === 'mine_extraction');
      const hasFarm = aiFacilities.some(f => f.type === 'farm_agriculture');
      const hasFactory = aiFacilities.some(f => f.type === 'factory_processing');
      const hasGreenPlant = aiFacilities.some(f => f.type === 'power_plant_green');
      const hasWarehouse = aiFacilities.some(f => f.type === 'warehouse_logistics');

      if (!hasMine) {
        facilityToBuild = 'mine_extraction';
        targetProductToAssign = pickMarketGapProduct(
          state,
          ['iron_ore', 'crude_oil', 'silicon'],
          aiFacilities
        );
      } else if (!hasFarm && state.currentTick > 8) {
        facilityToBuild = 'farm_agriculture';
        targetProductToAssign = pickMarketGapProduct(state, ['wheat', 'livestock'], aiFacilities);
      } else if (!hasFactory && state.currentTick > 15) {
        facilityToBuild = 'factory_processing';
        targetProductToAssign = pickMarketGapProduct(
          state,
          ['steel', 'plastic', 'flour', 'fabric'],
          aiFacilities
        );
      } else if (!hasGreenPlant && state.currentTick > 20) {
        facilityToBuild = 'power_plant_green';
        targetProductToAssign = 'battery_cell';
      } else if (!hasWarehouse && state.currentTick > 26) {
        facilityToBuild = 'warehouse_logistics';
        targetProductToAssign = 'steel';
      }
    } else if (personality === 'tech_innovator') {
      const hasSoftware = aiFacilities.some(f => f.type === 'tech_software');
      const hasRD = aiFacilities.some(f => f.type === 'rd_center');
      const hasAssembly = aiFacilities.some(f => f.type === 'factory_assembly');
      const hasStore = aiFacilities.some(f => f.type === 'store_electronics');

      if (!hasSoftware) {
        facilityToBuild = 'tech_software';
        targetProductToAssign = pickMarketGapProduct(
          state,
          ['ai_enterprise', 'software_os'],
          aiFacilities
        );
      } else if (!hasRD && state.currentTick > 8) {
        facilityToBuild = 'rd_center';
        targetProductToAssign = 'electronic_chip';
      } else if (!hasAssembly && state.currentTick > 16) {
        facilityToBuild = 'factory_assembly';
        targetProductToAssign = pickMarketGapProduct(
          state,
          ['electronic_chip', 'laptop', 'smartphone'],
          aiFacilities
        );
      } else if (!hasStore && state.currentTick > 22) {
        facilityToBuild = 'store_electronics';
        targetProductToAssign = pickMarketGapProduct(
          state,
          ['laptop', 'software_os', 'smartphone'],
          aiFacilities
        );
      }
    } else if (personality === 'brand_titan') {
      const hasMedia = aiFacilities.some(f => f.type === 'media_telecom');
      const hasDept = aiFacilities.some(f => f.type === 'store_department');
      const hasConv = aiFacilities.some(f => f.type === 'store_convenience');

      if (!hasMedia) {
        facilityToBuild = 'media_telecom';
        targetProductToAssign = 'fashion_apparel';
      } else if (!hasDept && state.currentTick > 8) {
        facilityToBuild = 'store_department';
        targetProductToAssign = pickMarketGapProduct(
          state,
          ['fashion_apparel', 'soft_drink'],
          aiFacilities
        );
      } else if (!hasConv && state.currentTick > 16) {
        facilityToBuild = 'store_convenience';
        targetProductToAssign = pickMarketGapProduct(state, ['soft_drink', 'bread'], aiFacilities);
      }
    } else if (personality === 'real_estate_mogul') {
      const apartments = aiFacilities.filter(f => f.type === 'apartment_complex');
      const offices = aiFacilities.filter(f => f.type === 'commercial_tower');
      const hasRetail = aiFacilities.some(f => f.type === 'store_convenience');

      if (apartments.length < 2) {
        facilityToBuild = 'apartment_complex';
      } else if (offices.length < 2 && state.currentTick > 8) {
        facilityToBuild = 'commercial_tower';
      } else if (!hasRetail && state.currentTick > 18) {
        facilityToBuild = 'store_convenience';
        targetProductToAssign = pickMarketGapProduct(state, ['bread', 'soft_drink'], aiFacilities);
      }
    } else if (personality === 'healthcare_pioneer') {
      const pharmacies = aiFacilities.filter(f => f.type === 'store_pharmacy');
      const hasRD = aiFacilities.some(f => f.type === 'rd_center');
      const hasPharmaFactory = aiFacilities.some(f => f.type === 'factory_assembly');

      if (pharmacies.length < 2) {
        facilityToBuild = 'store_pharmacy';
        targetProductToAssign = 'medicine';
      } else if (!hasRD && state.currentTick > 8) {
        facilityToBuild = 'rd_center';
        targetProductToAssign = 'medicine';
      } else if (!hasPharmaFactory && state.currentTick > 16) {
        facilityToBuild = 'factory_assembly';
        targetProductToAssign = 'medicine';
      }
    }

    if (facilityToBuild) {
      const spec = FACILITY_SPECS[facilityToBuild];
      const cost = spec.constructionCost;

      if (updatedComp.cash >= cost + CASH_SAFETY_BUFFER) {
        const isIndustrial =
          facilityToBuild.startsWith('factory_') ||
          facilityToBuild === 'mine_extraction' ||
          facilityToBuild === 'farm_agriculture' ||
          facilityToBuild === 'power_plant_green' ||
          facilityToBuild === 'warehouse_logistics';
        const zonePref = isIndustrial
          ? 'industrial'
          : facilityToBuild === 'apartment_complex'
          ? 'residential'
          : 'commercial';
        const parcel = findAvailableParcel(state.mapParcels, zonePref);

        if (parcel) {
          const facilityId = `fac_${aiCompany.id}_m${state.currentTick}_${parcel.x}_${parcel.y}`;
          const initialUnits = createDefaultUnitsForFacility(
            facilityToBuild,
            targetProductToAssign
          );
          const prod = PRODUCTS[targetProductToAssign];
          const isRealEstate =
            facilityToBuild === 'apartment_complex' || facilityToBuild === 'commercial_tower';

          const activeCityId = state.activeCityId || PRIMARY_CITY_ID;
          const newFacility: Facility = {
            id: facilityId,
            companyId: aiCompany.id,
            cityId: activeCityId,
            name: `${spec.name} ${aiCompany.ticker}`,
            type: facilityToBuild,
            tileX: parcel.x,
            tileY: parcel.y,
            level: 1,
            createdMonth: state.currentTick,
            units: initialUnits,
            sellingPrice: isRealEstate
              ? facilityToBuild === 'commercial_tower'
                ? 1180
                : 920
              : prod
              ? prod.basePrice
              : 500,
            adBudget:
              personality === 'expansionist' || personality === 'brand_titan' ? 9000 : 4500,
            monthlyMaintenance: spec.monthlyMaintenance,
            monthlyProduction: 0,
            monthlySales: 0,
            monthlyRevenue: 0,
            monthlyCostOfGoods: 0,
            monthlyProfit: 0,
            lastMonthUnitsSold: 0,
            inventoryLevel: isRealEstate ? 0 : 400,
            inventoryCapacity: isRealEstate ? 0 : 10000,
            qualityRating: personality === 'quality_first' ? 66 : 48,
            brandRating:
              personality === 'expansionist' || personality === 'brand_titan' ? 64 : 44,
          };

          updatedComp.cash = roundCurrency(updatedComp.cash - cost);
          updatedComp.facilitiesCount += 1;
          updatedComp.lastConstructedTick = state.currentTick;

          const updatedParcels = recalculateCityTraffic(
            state.mapParcels.map(p =>
              p.x === parcel.x && p.y === parcel.y
                ? { ...p, facilityId, ownerCompanyId: aiCompany.id }
                : p
            ),
            { ...state.facilities, [facilityId]: newFacility },
            1.0,
            activeCityId
          );

          let newsEvent = '';
          if (facilityToBuild.startsWith('store_')) {
            newsEvent = `${aiCompany.name} membuka gerai baru untuk pasar ${prod ? prod.name : 'konsumen'} di zona keramaian ${parcel.trafficIndex}/100.`;
          } else if (facilityToBuild === 'apartment_complex') {
            newsEvent = `${aiCompany.name} meresmikan Menara Apartemen baru yang meningkatkan kepadatan pelanggan distrik sekitar.`;
          } else if (facilityToBuild === 'commercial_tower') {
            newsEvent = `${aiCompany.name} meluncurkan Menara Perkantoran CBD untuk menangkap sewa premium.`;
          } else if (facilityToBuild === 'tech_software') {
            newsEvent = `${aiCompany.name} merilis lini digital ${prod ? prod.name : 'cloud'}.`;
          } else if (facilityToBuild === 'media_telecom') {
            newsEvent = `${aiCompany.name} mengoperasikan stasiun media untuk memperluas jangkauan merek.`;
          } else if (facilityToBuild === 'rd_center') {
            newsEvent = `${aiCompany.name} membangun laboratorium R&D guna menguasai paten teknologi.`;
          } else {
            newsEvent = `${aiCompany.name} memperluas kapasitas rantai pasok melalui ${spec.name}.`;
          }

          return {
            updatedCompany: updatedComp,
            updatedFacilities: modifiedFacilities,
            newFacility,
            updatedParcels,
            newsEvent,
          };
        }
      }
    }
  }

  // 6. Strategic Stock Market Allocation (Buyback or Undervalued Peer Investment)
  if (updatedComp.cash > 7500000) {
    const bookValPerShare = updatedComp.bookValue / Math.max(1, updatedComp.sharesOutstanding);
    if (
      updatedComp.stockPrice < bookValPerShare * 0.85 &&
      updatedComp.sharesOutstanding > updatedComp.treasuryShares + 15000
    ) {
      const buybackShares = Math.min(
        2500,
        Math.floor((updatedComp.cash * 0.08) / Math.max(1, updatedComp.stockPrice))
      );
      if (buybackShares > 500) {
        const cost = roundCurrency(buybackShares * updatedComp.stockPrice);
        updatedComp.cash = roundCurrency(updatedComp.cash - cost);
        updatedComp.treasuryShares += buybackShares;
        updatedComp.stockPrice = clamp(round2(updatedComp.stockPrice * 1.01), 1.0, 250.0);
      }
    } else if (updatedComp.cash > 11500000) {
      const peer = Object.values(state.companies).find(other => {
        if (other.id === updatedComp.id || other.isPlayer) return false;
        const otherBookPerShare = other.bookValue / Math.max(1, other.sharesOutstanding);
        const currentOwned = updatedComp.shareholdings[other.id] || 0;
        return (
          other.stockPrice < otherBookPerShare * 0.9 &&
          currentOwned < other.sharesOutstanding * 0.25 &&
          other.stockPrice * 5000 < updatedComp.cash - 9000000
        );
      });
      if (peer) {
        const investShares = 5000;
        const cost = roundCurrency(investShares * peer.stockPrice);
        updatedComp.cash = roundCurrency(updatedComp.cash - cost);
        updatedComp.shareholdings[peer.id] = (updatedComp.shareholdings[peer.id] || 0) + investShares;
      }
    }
  }

  return { updatedCompany: updatedComp, updatedFacilities: modifiedFacilities };
}

/**
 * Runs staggered AI competitor evaluation (up to 3 AI companies evaluated per monthly tick)
 * and organically replenishes active corporations toward MAX_ACTIVE_COMPANIES (10).
 */
export function simulateAICompetitors(state: SimulationState): SimulationState {
  let currentState: SimulationState = {
    ...state,
    companies: { ...state.companies },
    facilities: { ...state.facilities },
  };

  if (Object.keys(currentState.companies).length < MAX_ACTIVE_COMPANIES) {
    currentState = replenishAICompetitors(currentState);
  }

  const newsUpdates = [...currentState.newsFeed];
  const aiList = Object.values(currentState.companies).filter(c => !c.isPlayer);
  if (aiList.length === 0) return currentState;

  // Build O(F) facility & supplier index once per tick
  const sharedCtx = buildAISharedContext(currentState.facilities);
  const evalCount = Math.min(3, aiList.length);

  for (let slot = 0; slot < evalCount; slot++) {
    const idx = (currentState.currentTick * evalCount + slot) % aiList.length;
    const activeCompany = aiList[idx];
    if (!activeCompany) continue;

    const result = processAICompanyTurn(currentState, activeCompany, sharedCtx);
    currentState.companies[activeCompany.id] = result.updatedCompany;

    if (result.updatedFacilities && result.updatedFacilities.length > 0) {
      for (let u = 0; u < result.updatedFacilities.length; u++) {
        const uf = result.updatedFacilities[u];
        currentState.facilities[uf.id] = uf;
      }
      // Update company facility slice in sharedCtx cleanly
      const compList = sharedCtx.facilitiesByCompany.get(activeCompany.id);
      if (compList) {
        const updatedMap = new Map(result.updatedFacilities.map(uf => [uf.id, uf]));
        for (let c = 0; c < compList.length; c++) {
          const rep = updatedMap.get(compList[c].id);
          if (rep) compList[c] = rep;
        }
      }
    }

    if (result.newFacility) {
      const nf = result.newFacility;
      currentState.facilities[nf.id] = nf;
      let compList = sharedCtx.facilitiesByCompany.get(activeCompany.id);
      if (!compList) {
        compList = [];
        sharedCtx.facilitiesByCompany.set(activeCompany.id, compList);
      }
      compList.push(nf);
    }

    if (result.updatedParcels) {
      currentState.mapParcels = result.updatedParcels;
    }

    if (result.newsEvent) {
      newsUpdates.unshift({
        id: `news_ai_${currentState.currentTick}_${slot}_${activeCompany.ticker}`,
        month: currentState.currentTick,
        category: 'competitor',
        title: `Langkah Korporasi: ${activeCompany.ticker}`,
        detail: result.newsEvent,
      });
    }
  }

  return {
    ...currentState,
    newsFeed: newsUpdates.slice(0, 25),
  };
}
