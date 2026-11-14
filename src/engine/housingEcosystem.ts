import {
  Facility,
  MapParcel,
  ResourceDeposit,
  ResourceDepositType,
  SimulationState,
} from '../types/game';
import { GOVT_OWNER_ID, RESIDENT_OWNER_ID, RESOURCE_DEPOSIT_META } from './productsData';
import { clamp, deterministicHash, finiteOr, round1, round2, roundCurrency } from './precisionMath';
import { recalculateCityTraffic } from './spatialGrid';
import { PRIMARY_CITY_ID } from './governmentEngine';

const RESIDENT_HOUSE_NAMES: Record<1 | 2 | 3, readonly string[]> = {
  1: ['Rumah Warga Asri', 'Pondok Keluarga Suburban', 'Rumah Sederhana Taman'],
  2: ['Townhouse Harmoni', 'Rumah Susun Warga', 'Klaster Keluarga Maju'],
  3: ['Villa Suburban Hijau', 'Kediaman Elit Taman', 'Wisma Keluarga Metro'],
};

const DEPOSIT_SEED_COORDS: readonly {
  x: number;
  y: number;
  type: ResourceDepositType;
  richness: number;
  discovered: boolean;
}[] = [
  { x: 3, y: 3, type: 'iron_ore', richness: 86, discovered: true },
  { x: 9, y: 2, type: 'crude_oil', richness: 82, discovered: true },
  { x: 4, y: 10, type: 'silicon', richness: 91, discovered: true },
  { x: 1, y: 7, type: 'timber', richness: 78, discovered: true },
  { x: 7, y: 24, type: 'fertile_soil', richness: 84, discovered: true },
  { x: 24, y: 8, type: 'timber', richness: 88, discovered: true },
  { x: 2, y: 19, type: 'fertile_soil', richness: 89, discovered: false },
  { x: 11, y: 8, type: 'crude_oil', richness: 92, discovered: false },
  { x: 6, y: 3, type: 'silicon', richness: 85, discovered: false },
  { x: 28, y: 9, type: 'timber', richness: 81, discovered: false },
  { x: 3, y: 26, type: 'iron_ore', richness: 79, discovered: false },
  { x: 26, y: 4, type: 'fertile_soil', richness: 87, discovered: false },
];

export const INITIAL_RESIDENT_HOUSE_COORDS: readonly {
  x: number;
  y: number;
  tier: 1 | 2 | 3;
}[] = [
  { x: 14, y: 22, tier: 1 },
  { x: 12, y: 22, tier: 2 },
  { x: 22, y: 19, tier: 1 },
  { x: 20, y: 22, tier: 2 },
  { x: 6, y: 20, tier: 1 },
  { x: 9, y: 26, tier: 1 },
  { x: 22, y: 14, tier: 2 },
  { x: 26, y: 12, tier: 1 },
  { x: 4, y: 16, tier: 1 },
  { x: 18, y: 26, tier: 1 },
  { x: 24, y: 6, tier: 2 },
  { x: 6, y: 14, tier: 1 },
];

export function isResidentFacility(fac: Facility | null | undefined): boolean {
  if (!fac) return false;
  return fac.companyId === RESIDENT_OWNER_ID || fac.type === 'resident_house';
}

export function getDepositYieldBonus(
  facilityType: Facility['type'],
  deposit: ResourceDeposit | undefined
): number {
  if (!deposit || !deposit.discovered) return 0;
  if (
    facilityType === 'mine_extraction' &&
    (deposit.type === 'iron_ore' || deposit.type === 'crude_oil' || deposit.type === 'silicon')
  ) {
    return Math.round(deposit.richness * 0.45);
  }
  if (
    facilityType === 'farm_agriculture' &&
    (deposit.type === 'fertile_soil' || deposit.type === 'timber')
  ) {
    return Math.round(deposit.richness * 0.42);
  }
  if (facilityType === 'power_plant_green' && deposit.type === 'silicon') {
    return Math.round(deposit.richness * 0.3);
  }
  return 0;
}

export function seedResourceDepositsOnParcels(parcels: MapParcel[]): MapParcel[] {
  const byKey = new Map<string, (typeof DEPOSIT_SEED_COORDS)[number]>();
  for (let i = 0; i < DEPOSIT_SEED_COORDS.length; i++) {
    const d = DEPOSIT_SEED_COORDS[i];
    byKey.set(`${d.x},${d.y}`, d);
  }

  return parcels.map(p => {
    const seeded = byKey.get(`${p.x},${p.y}`);
    if (seeded && p.terrainType !== 'road' && p.terrainType !== 'water') {
      return {
        ...p,
        resourceDeposit: {
          type: seeded.type,
          richness: seeded.richness,
          discovered: seeded.discovered,
        },
        landStatus: p.facilityId
          ? p.ownerCompanyId === RESIDENT_OWNER_ID
            ? 'resident'
            : 'corporate'
          : p.isZoneAllowed
          ? 'for_sale'
          : 'public',
      };
    }
    return {
      ...p,
      landStatus: p.facilityId
        ? p.ownerCompanyId === RESIDENT_OWNER_ID
          ? 'resident'
          : 'corporate'
        : p.isZoneAllowed
        ? p.ownerCompanyId
          ? 'corporate'
          : 'for_sale'
        : 'public',
    };
  });
}

export function createResidentHouseFacility(
  x: number,
  y: number,
  tier: 1 | 2 | 3,
  createdMonth: number,
  seqId: number
): Facility {
  const names = RESIDENT_HOUSE_NAMES[tier];
  const hash = deterministicHash(`res_${x}_${y}_${seqId}`);
  const families = tier === 1 ? 8 : tier === 2 ? 16 : 26;
  const residents = families * 4;
  return {
    id: `fac_res_${x}_${y}_${createdMonth}_${seqId}`,
    companyId: RESIDENT_OWNER_ID,
    name: `${names[hash % names.length]} #${(hash % 89) + 10}`,
    type: 'resident_house',
    tileX: x,
    tileY: y,
    level: tier,
    housingTier: tier,
    residentFamilies: families,
    createdMonth,
    units: [],
    sellingPrice: 0,
    adBudget: 0,
    monthlyMaintenance: 0,
    monthlyProduction: residents,
    monthlySales: residents,
    monthlyRevenue: 0,
    monthlyCostOfGoods: 0,
    monthlyProfit: 0,
    lastMonthUnitsSold: residents,
    inventoryLevel: 0,
    inventoryCapacity: 0,
    qualityRating: 52 + tier * 12,
    brandRating: 40 + tier * 10,
    supplySourceLabel: `Hunian Warga (${families} KK)`,
  };
}

export function calculateResidentClaimCost(
  parcel: MapParcel,
  fac: Facility
): { landCost: number; buyoutComp: number; totalCost: number } {
  const tier = fac.housingTier || clamp(fac.level || 1, 1, 3);
  const families = fac.residentFamilies || tier * 8;
  const landCost = roundCurrency(Math.max(45000, finiteOr(parcel.landValue, 88000)));
  const buyoutComp = roundCurrency(families * (11500 + tier * 3500));
  return {
    landCost,
    buyoutComp,
    totalCost: landCost + buyoutComp,
  };
}

export function calculateResidentDemolishCost(
  parcel: MapParcel,
  fac: Facility
): { demoFee: number; relocationFee: number; totalCost: number } {
  const tier = fac.housingTier || clamp(fac.level || 1, 1, 3);
  const families = fac.residentFamilies || tier * 8;
  const demoFee = roundCurrency(24000 + tier * 14000);
  const relocationFee = roundCurrency(families * 5500 + finiteOr(parcel.landValue, 88000) * 0.15);
  return {
    demoFee,
    relocationFee,
    totalCost: demoFee + relocationFee,
  };
}

export interface ResidentActionResult {
  success: boolean;
  reason?: string;
  cost: number;
  updatedState?: SimulationState;
}

/**
 * Claims/buys out a resident-owned home, compensating homeowners and transferring land ownership to the player.
 */
export function claimResidentProperty(
  state: SimulationState,
  facilityId: string
): ResidentActionResult {
  const fac = state.facilities[facilityId];
  if (!fac || !isResidentFacility(fac)) {
    return { success: false, reason: 'Struktur bukan properti milik warga.', cost: 0 };
  }

  const player = state.companies[state.playerCompanyId];
  if (!player) {
    return { success: false, reason: 'Korporasi pemain tidak ditemukan.', cost: 0 };
  }

  const parcel = state.mapParcels.find(p => p.x === fac.tileX && p.y === fac.tileY);
  if (!parcel) {
    return { success: false, reason: 'Kavling tidak ditemukan di peta.', cost: 0 };
  }

  const { totalCost } = calculateResidentClaimCost(parcel, fac);
  if (player.cash < totalCost) {
    return {
      success: false,
      reason: `Dana kas kurang untuk klaim & kompensasi ($${totalCost.toLocaleString()}).`,
      cost: totalCost,
    };
  }

  const nextFacilities = { ...state.facilities };
  delete nextFacilities[facilityId];

  const markedParcels = state.mapParcels.map(p =>
    p.x === parcel.x && p.y === parcel.y
      ? {
          ...p,
          facilityId: undefined,
          ownerCompanyId: state.playerCompanyId,
          landStatus: 'corporate' as const,
        }
      : p
  );
  const activeId = state.activeCityId || PRIMARY_CITY_ID;
  const updatedParcels = recalculateCityTraffic(markedParcels, nextFacilities, 1.0, activeId);
  const displacedResidents = fac.lastMonthUnitsSold || (fac.residentFamilies || 8) * 4;
  const housingSummary = computeHousingSummary(state.city.population, nextFacilities);

  const nextState: SimulationState = {
    ...state,
    companies: {
      ...state.companies,
      [state.playerCompanyId]: {
        ...player,
        cash: roundCurrency(player.cash - totalCost),
      },
    },
    facilities: nextFacilities,
    mapParcels: updatedParcels,
    city: {
      ...state.city,
      population: Math.max(500000, state.city.population - Math.round(displacedResidents * 0.25)),
      housingSupply: housingSummary.housingSupply,
      residentHousesCount: housingSummary.residentHousesCount,
    },
    newsFeed: [
      {
        id: `news_claim_res_${state.currentTick}_${parcel.x}_${parcel.y}`,
        month: state.currentTick,
        category: 'economy' as const,
        title: `Akuisisi Lahan Warga (${parcel.x}, ${parcel.y})`,
        detail: `${player.name} mengakuisisi & merelokasi ${fac.name} senilai $${totalCost.toLocaleString()}. Kavling kini siap dibangun oleh korporasi Anda.`,
      },
      ...state.newsFeed,
    ].slice(0, 25),
  };

  return { success: true, cost: totalCost, updatedState: nextState };
}

/**
 * Demolishes a resident-owned structure after paying demolition & relocation stipend, returning parcel to municipal For Sale status.
 */
export function demolishResidentProperty(
  state: SimulationState,
  facilityId: string
): ResidentActionResult {
  const fac = state.facilities[facilityId];
  if (!fac || !isResidentFacility(fac)) {
    return { success: false, reason: 'Struktur bukan properti milik warga.', cost: 0 };
  }

  const player = state.companies[state.playerCompanyId];
  if (!player) {
    return { success: false, reason: 'Korporasi pemain tidak ditemukan.', cost: 0 };
  }

  const parcel = state.mapParcels.find(p => p.x === fac.tileX && p.y === fac.tileY);
  if (!parcel) {
    return { success: false, reason: 'Kavling tidak ditemukan di peta.', cost: 0 };
  }

  const { totalCost } = calculateResidentDemolishCost(parcel, fac);
  if (player.cash < totalCost) {
    return {
      success: false,
      reason: `Dana kas kurang untuk pembongkaran ($${totalCost.toLocaleString()}).`,
      cost: totalCost,
    };
  }

  const nextFacilities = { ...state.facilities };
  delete nextFacilities[facilityId];

  const markedParcels = state.mapParcels.map(p =>
    p.x === parcel.x && p.y === parcel.y
      ? {
          ...p,
          facilityId: undefined,
          ownerCompanyId: undefined,
          landStatus: 'for_sale' as const,
        }
      : p
  );
  const activeId = state.activeCityId || PRIMARY_CITY_ID;
  const updatedParcels = recalculateCityTraffic(markedParcels, nextFacilities, 1.0, activeId);
  const displacedResidents = fac.lastMonthUnitsSold || (fac.residentFamilies || 8) * 4;
  const housingSummary = computeHousingSummary(state.city.population, nextFacilities);

  const nextState: SimulationState = {
    ...state,
    companies: {
      ...state.companies,
      [state.playerCompanyId]: {
        ...player,
        cash: roundCurrency(player.cash - totalCost),
      },
    },
    facilities: nextFacilities,
    mapParcels: updatedParcels,
    city: {
      ...state.city,
      population: Math.max(500000, state.city.population - Math.round(displacedResidents * 0.45)),
      consumerConfidence: clamp(state.city.consumerConfidence - 1, 20, 100),
      housingSupply: housingSummary.housingSupply,
      residentHousesCount: housingSummary.residentHousesCount,
    },
    newsFeed: [
      {
        id: `news_demo_res_${state.currentTick}_${parcel.x}_${parcel.y}`,
        month: state.currentTick,
        category: 'economy' as const,
        title: `Pembongkaran Rumah Warga (${parcel.x}, ${parcel.y})`,
        detail: `${fac.name} dibongkar & warga direlokasi (biaya $${totalCost.toLocaleString()}). Kavling terbuka kembali untuk zona konstruksi.`,
      },
      ...state.newsFeed,
    ].slice(0, 25),
  };

  return { success: true, cost: totalCost, updatedState: nextState };
}

/**
 * Purchases a vacant "FOR SALE" municipal parcel so competitors cannot build on prime land or resource deposits.
 */
export function buyVacantLandParcel(
  state: SimulationState,
  x: number,
  y: number
): ResidentActionResult {
  const player = state.companies[state.playerCompanyId];
  const parcel = state.mapParcels.find(p => p.x === x && p.y === y);
  if (!player || !parcel) {
    return { success: false, reason: 'Kavling tidak ditemukan.', cost: 0 };
  }
  if (!parcel.isZoneAllowed || parcel.terrainType === 'water' || parcel.terrainType === 'road') {
    return { success: false, reason: 'Lahan publik tidak diperjualbelikan.', cost: 0 };
  }
  if (parcel.facilityId) {
    return { success: false, reason: 'Kavling sudah ditempati bangunan.', cost: 0 };
  }
  if (parcel.ownerCompanyId === state.playerCompanyId) {
    return { success: false, reason: 'Kavling ini sudah menjadi milik Anda.', cost: 0 };
  }

  const grantDiscount = clamp(finiteOr(state.city.landGrantDiscount ?? 0, 0), 0, 0.4);
  const price = roundCurrency(Math.max(40000, finiteOr(parcel.landValue, 88000)) * (1 - grantDiscount));
  if (player.cash < price) {
    return {
      success: false,
      reason: `Dana kas kurang untuk membeli lahan ($${price.toLocaleString()}).`,
      cost: price,
    };
  }

  const updatedParcels = state.mapParcels.map(p =>
    p.x === x && p.y === y
      ? { ...p, ownerCompanyId: state.playerCompanyId, landStatus: 'corporate' as const }
      : p
  );

  return {
    success: true,
    cost: price,
    updatedState: {
      ...state,
      companies: {
        ...state.companies,
        [state.playerCompanyId]: {
          ...player,
          cash: roundCurrency(player.cash - price),
        },
      },
      mapParcels: updatedParcels,
      newsFeed: [
        {
          id: `news_buyland_${state.currentTick}_${x}_${y}`,
          month: state.currentTick,
          category: 'finance' as const,
          title: `Pembelian Lahan Kavling (${x}, ${y})`,
          detail: `${player.name} membeli hak milik kavling strategis seharga $${price.toLocaleString()}.`,
        },
        ...state.newsFeed,
      ].slice(0, 25),
    },
  };
}

export function sellOwnedLandParcel(
  state: SimulationState,
  x: number,
  y: number
): ResidentActionResult {
  const player = state.companies[state.playerCompanyId];
  const parcel = state.mapParcels.find(p => p.x === x && p.y === y);
  if (!player || !parcel || parcel.ownerCompanyId !== state.playerCompanyId || parcel.facilityId) {
    return { success: false, reason: 'Hanya lahan kosong milik sendiri yang dapat dijual.', cost: 0 };
  }

  const saleProceeds = roundCurrency(Math.max(30000, finiteOr(parcel.landValue, 88000) * 0.92));
  const updatedParcels = state.mapParcels.map(p =>
    p.x === x && p.y === y
      ? { ...p, ownerCompanyId: undefined, landStatus: 'for_sale' as const }
      : p
  );

  return {
    success: true,
    cost: -saleProceeds,
    updatedState: {
      ...state,
      companies: {
        ...state.companies,
        [state.playerCompanyId]: {
          ...player,
          cash: roundCurrency(player.cash + saleProceeds),
        },
      },
      mapParcels: updatedParcels,
    },
  };
}

export function computeHousingSummary(
  cityPopulation: number,
  facilities: Record<string, Facility>
): { housingSupply: number; residentHousesCount: number } {
  let supply = Math.round(cityPopulation * 0.72); // Baseline city background neighborhoods
  let residentHousesCount = 0;

  const list = Object.values(facilities);
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.type === 'civic_housing') {
      supply += 42000 * f.level;
    } else if (f.type === 'apartment_complex') {
      supply += 55000 * f.level;
    } else if (f.type === 'resident_house' || f.companyId === RESIDENT_OWNER_ID) {
      residentHousesCount += 1;
      const tier = f.housingTier || f.level || 1;
      supply += 14000 * tier;
    }
  }

  return {
    housingSupply: supply,
    residentHousesCount,
  };
}

/**
 * Automated Resident Housing, Natural Resource Discovery, and CapLab 13 Labor/CPI Ecosystem step.
 * Runs at the close of each monthly tick deterministically with bounded city housing density.
 */
export function simulateAutomatedHousingAndResources(state: SimulationState): SimulationState {
  const MAX_RESIDENT_HOUSES = 44;
  const gridSize = Math.round(Math.sqrt(state.mapParcels.length)) || 40;
  const activeCityId = state.activeCityId || PRIMARY_CITY_ID;

  const nextFacilities = { ...state.facilities };
  let nextParcels = state.mapParcels;
  const newsToAdd: SimulationState['newsFeed'] = [];

  const residentHouses: Facility[] = [];
  let corporateFacilitiesCount = 0;
  const facilityValues = Object.values(nextFacilities);

  for (let i = 0; i < facilityValues.length; i++) {
    const f = facilityValues[i];
    if ((f.cityId || PRIMARY_CITY_ID) === activeCityId) {
      if (isResidentFacility(f)) {
        residentHouses.push(f);
      } else if (f.companyId !== GOVT_OWNER_ID) {
        corporateFacilitiesCount++;
      }
    } else if (!isResidentFacility(f) && f.companyId !== GOVT_OWNER_ID) {
      corporateFacilitiesCount++;
    }
  }

  // Update resident houses organically & track housing balance
  const summaryBefore = computeHousingSummary(state.city.population, nextFacilities);
  const housingTightness = state.city.population - summaryBefore.housingSupply;

  // Determine whether residents auto-build a new house (or 2 during strong boom)
  const shouldSpawnHouse =
    residentHouses.length < MAX_RESIDENT_HOUSES &&
    (housingTightness > 0 || state.currentTick % 2 === 1) &&
    state.macro.cyclePhase !== 'recession';

  let spawnedParcelsDirty = false;
  if (shouldSpawnHouse) {
    // Score empty suburban/grass or edge pavement lots near roads for authentic suburban sprawl
    let bestParcel: MapParcel | null = null;
    let bestScore = -9999;
    const roadSet = new Set<number>();
    for (let i = 0; i < nextParcels.length; i++) {
      if (nextParcels[i].terrainType === 'road') {
        roadSet.add(nextParcels[i].y * gridSize + nextParcels[i].x);
      }
    }

    for (let i = 0; i < nextParcels.length; i++) {
      const p = nextParcels[i];
      if (
        p.facilityId ||
        p.ownerCompanyId || // Never build resident houses over player/corporate bought land!
        !p.isZoneAllowed ||
        p.terrainType === 'water' ||
        p.terrainType === 'road' ||
        p.terrainType === 'industrial_zone' ||
        p.resourceDeposit?.discovered
      ) {
        continue;
      }

      const nearRoad =
        roadSet.has(p.y * gridSize + (p.x - 1)) ||
        roadSet.has(p.y * gridSize + (p.x + 1)) ||
        roadSet.has((p.y - 1) * gridSize + p.x) ||
        roadSet.has((p.y + 1) * gridSize + p.x);

      const zoneScore = p.terrainType === 'grass' ? 28 : 10;
      const roadScore = nearRoad ? 24 : 0;
      const trafficScore = (p.trafficIndex || 20) * 0.45;
      const jitter = (deterministicHash(`${state.currentTick}_${p.x}_${p.y}`) % 19) - 9;
      const score = zoneScore + roadScore + trafficScore + jitter;

      if (score > bestScore) {
        bestScore = score;
        bestParcel = p;
      }
    }

    if (bestParcel) {
      const tier: 1 | 2 | 3 = bestParcel.terrainType === 'pavement' ? 2 : 1;
      const house = createResidentHouseFacility(
        bestParcel.x,
        bestParcel.y,
        tier,
        state.currentTick,
        residentHouses.length + 1
      );
      house.cityId = activeCityId;
      nextFacilities[house.id] = house;
      residentHouses.push(house);
      nextParcels = nextParcels.map(p =>
        p.x === bestParcel!.x && p.y === bestParcel!.y
          ? {
              ...p,
              facilityId: house.id,
              ownerCompanyId: RESIDENT_OWNER_ID,
              landStatus: 'resident' as const,
            }
          : p
      );
      spawnedParcelsDirty = true;

      if (state.currentTick % 3 === 0 || state.currentTick <= 3) {
        newsToAdd.push({
          id: `news_reshouse_${state.currentTick}_${bestParcel.x}_${bestParcel.y}`,
          month: state.currentTick,
          category: 'economy',
          title: `Permukiman Warga Baru di (${bestParcel.x}, ${bestParcel.y})`,
          detail: `Pertumbuhan populasi mendorong warga membangun ${house.name} di ${bestParcel.districtName || 'Suburban'}.`,
        });
      }
    }
  }

  // Auto-upgrade existing resident houses in healthy economies every 4 months
  if (
    residentHouses.length > 0 &&
    state.currentTick > 0 &&
    state.currentTick % 4 === 0 &&
    state.city.consumerConfidence >= 72
  ) {
    const candidateIdx = state.currentTick % residentHouses.length;
    const candidate = residentHouses[candidateIdx];
    const currentTier = (candidate.housingTier || candidate.level || 1) as 1 | 2 | 3;
    if (currentTier < 3) {
      const nextTier = (currentTier + 1) as 1 | 2 | 3;
      const nextFamilies = nextTier === 2 ? 16 : 26;
      const nextResidents = nextFamilies * 4;
      nextFacilities[candidate.id] = {
        ...candidate,
        level: nextTier,
        housingTier: nextTier,
        residentFamilies: nextFamilies,
        monthlyProduction: nextResidents,
        monthlySales: nextResidents,
        lastMonthUnitsSold: nextResidents,
        qualityRating: 52 + nextTier * 12,
        supplySourceLabel: `Hunian Warga (${nextFamilies} KK · Lv.${nextTier})`,
      };
      spawnedParcelsDirty = true;
    }
  }

  // Periodic natural resource deposit discovery (Capitalism Lab signature!)
  if (state.currentTick > 0 && state.currentTick % 5 === 0) {
    let discoveredIdx = -1;
    for (let i = 0; i < nextParcels.length; i++) {
      const d = nextParcels[i].resourceDeposit;
      if (d && !d.discovered) {
        discoveredIdx = i;
        break;
      }
    }
    if (discoveredIdx >= 0) {
      const targetParcel = nextParcels[discoveredIdx];
      const dep = targetParcel.resourceDeposit!;
      nextParcels = nextParcels.map((p, idx) =>
        idx === discoveredIdx
          ? { ...p, resourceDeposit: { ...dep, discovered: true } }
          : p
      );
      const meta = RESOURCE_DEPOSIT_META[dep.type];
      newsToAdd.push({
        id: `news_deposit_${state.currentTick}_${targetParcel.x}_${targetParcel.y}`,
        month: state.currentTick,
        category: 'economy',
        title: `Penemuan Deposit ${meta.label} (${targetParcel.x}, ${targetParcel.y})`,
        detail: `Survei geologi menemukan cadangan ${meta.label} berkadar ${dep.richness}% di (${targetParcel.x}, ${targetParcel.y}) — ideal untuk ekspansi hulu.`,
      });
    }
  }

  if (spawnedParcelsDirty) {
    nextParcels = recalculateCityTraffic(nextParcels, nextFacilities, 1.0, activeCityId);
  }

  // Compute Capitalism Lab 13 Macro Labor & CPI indicators
  const prevCpi = finiteOr(state.macro.consumerPriceIndex ?? 100.0, 100.0);
  const nextCpi = round2(prevCpi * (1 + state.macro.inflationRate / 1200));

  const targetUnemployment =
    state.macro.cyclePhase === 'boom'
      ? 3.2
      : state.macro.cyclePhase === 'recession'
      ? 8.9
      : state.macro.cyclePhase === 'recovery'
      ? 5.6
      : 4.8;
  const jobRelief = clamp((corporateFacilitiesCount - 10) * 0.08, -0.5, 2.2);
  const prevUnemployment = finiteOr(state.macro.unemploymentRate ?? 5.15, 5.15);
  const nextUnemployment = clamp(
    round2(prevUnemployment * 0.8 + (targetUnemployment - jobRelief) * 0.2),
    2.1,
    14.5
  );

  // Real wage index (in CapLab 13 style, nominal wage adjusted by CPI)
  const realWageRate = round2((state.city.averageWage / Math.max(85, nextCpi)) * 0.85);
  const housingSummaryAfter = computeHousingSummary(state.city.population, nextFacilities);

  return {
    ...state,
    facilities: nextFacilities,
    mapParcels: nextParcels,
    macro: {
      ...state.macro,
      consumerPriceIndex: nextCpi,
      unemploymentRate: nextUnemployment,
      realWageRate,
    },
    city: {
      ...state.city,
      housingSupply: housingSummaryAfter.housingSupply,
      residentHousesCount: housingSummaryAfter.residentHousesCount,
    },
    newsFeed: [...newsToAdd, ...state.newsFeed].slice(0, 25),
  };
}
