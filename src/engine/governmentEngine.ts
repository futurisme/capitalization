import {
  CityBiome,
  CityMarket,
  Facility,
  GovernmentPolicyLog,
  GovernmentState,
  MapParcel,
  ProductId,
  SimulationState,
} from '../types/game';
import {
  CITY_BIOME_META,
  GOVT_OWNER_ID,
  MAX_CITIES,
  PRODUCTS,
  RESIDENT_OWNER_ID,
} from './productsData';
import { clamp, deterministicHash, round2, roundCurrency } from './precisionMath';
import { recalculateCityTraffic } from './spatialGrid';
import { ensureAiEntitiesPopulated } from './investorEngine';
import { createDefaultUnitsForFacility } from './facilityUnits';
import { computeHousingSummary, createResidentHouseFacility, seedResourceDepositsOnParcels } from './housingEcosystem';

export const PRIMARY_CITY_ID = 'city_metro_1';

const CITY_NAME_POOL = [
  'Metropolis Raya',
  'Pelabuhan Timur',
  'Surya Industri',
  'Lembah Nusantara',
  'Silicon Timur',
  'Karya Mineral',
  'Bintang Samudra',
  'Puncak Mandiri',
  'Agri Harmoni',
  'Delta Inovasi',
] as const;

export function buildInitialProductStats(): CityMarket['productStats'] {
  const stats = {} as CityMarket['productStats'];
  const keys = Object.keys(PRODUCTS) as ProductId[];
  for (let i = 0; i < keys.length; i++) {
    const id = keys[i];
    const p = PRODUCTS[id];
    const demandBase = Math.max(1200, roundCurrency(p.demandFactor * 82000));
    stats[id] = {
      monthlyDemand: demandBase,
      monthlySupply: roundCurrency(demandBase * 0.72),
      averageMarketPrice: p.basePrice,
      playerMarketShare: 0,
      satisfactionRate: 72,
      seaportImportShare: 100,
    };
  }
  return stats;
}

/**
 * Generates an expanded 40x40 (1,600-tile) biome-aware city map with
 * flat-textured variants (meadow, forest, fertile, rocky, plaza, concrete).
 */
export function generateBiomeCityParcels(
  gridSize = 40,
  biome: CityBiome = 'coastal_metro',
  citySeedOffset = 0
): MapParcel[] {
  const parcels: MapParcel[] = new Array(gridSize * gridSize);
  let idx = 0;

  const isRoadCoord = (c: number) => (c - 5) % 8 === 0 && c >= 5 && c < gridSize - 3;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      let terrain: MapParcel['terrainType'] = 'grass';
      let variant: MapParcel['terrainVariant'] = 'meadow';
      let isAllowed = true;
      let districtName = 'Kawasan Hunian Suburban';

      const waterCutoff =
        biome === 'coastal_metro'
          ? gridSize * 2 - 9
          : biome === 'tech_corridor'
          ? gridSize * 2 - 6
          : gridSize * 2 - 4;

      if (x + y >= waterCutoff) {
        terrain = 'water';
        variant = 'harbor';
        isAllowed = false;
        districtName = 'Pelabuhan & Perairan';
      } else if (isRoadCoord(x) || isRoadCoord(y)) {
        terrain = 'road';
        variant = 'concrete';
        isAllowed = false;
        districtName = 'Jalan Arteri Utama';
      } else if (
        (biome === 'industrial_heartland' && x <= 18 && y <= 18) ||
        (biome !== 'agri_valley' && x <= 14 && y <= 14) ||
        (biome === 'agri_valley' && x <= 9 && y <= 9)
      ) {
        terrain = 'industrial_zone';
        variant = 'concrete';
        districtName = 'Zona Industri & Logistik';
      } else if (x >= 7 && x <= gridSize - 9 && y >= 7 && y <= gridSize - 9) {
        terrain = 'pavement';
        variant = 'plaza';
        districtName = 'Pusat Bisnis CBD';
      } else {
        const h = deterministicHash(`var_${biome}_${citySeedOffset}_${x}_${y}`);
        if (biome === 'agri_valley') {
          variant = h % 5 < 3 ? 'fertile' : h % 5 === 3 ? 'forest' : 'meadow';
        } else if (biome === 'highland_mining') {
          variant = h % 5 < 2 ? 'rocky' : h % 5 === 2 ? 'forest' : 'meadow';
        } else {
          variant = h % 6 === 0 ? 'forest' : h % 6 === 1 ? 'fertile' : 'meadow';
        }
      }

      const baseTraffic =
        terrain === 'water'
          ? 0
          : terrain === 'road'
          ? 34
          : terrain === 'pavement'
          ? 24
          : terrain === 'industrial_zone'
          ? 12
          : 14;

      parcels[idx++] = {
        x,
        y,
        terrainType: terrain,
        terrainVariant: variant,
        isZoneAllowed: isAllowed,
        trafficIndex: baseTraffic,
        districtName,
        landValue:
          terrain === 'pavement'
            ? 245000
            : terrain === 'industrial_zone'
            ? 120000
            : variant === 'rocky'
            ? 105000
            : 88000,
        landStatus: isAllowed ? 'for_sale' : 'public',
      };
    }
  }

  return seedResourceDepositsOnParcels(parcels);
}

/**
 * Initializes the National Cabinet (President + Minister of Labor) and per-city Mayors using candidates from the 100 AI Entity pool.
 */
export function createInitialGovernment(state: SimulationState): GovernmentState {
  const entities = state.aiEntities || {};
  const ordered = (state.aiEntityOrder || [])
    .map(id => entities[id])
    .filter(e => e && e.role === 'investor');

  const govCandidates = [...ordered].sort((a, b) => b.politicalClout - a.politicalClout);
  const pres = govCandidates[0];
  const labor = govCandidates[1];

  return {
    presidentEntityId: pres?.id,
    presidentName: pres?.name || 'Budi Subrata',
    ministerOfLaborEntityId: labor?.id,
    ministerOfLaborName: labor?.name || 'Kartika Salim',
    corporateTaxRate: 0.15,
    dividendTaxRate: 0.10,
    minimumWageFloor: 3600,
    rdSubsidyRate: 0.15,
    laborUnionStrength: 42,
    nationalApproval: 68,
    nextElectionTick: 24,
    policyLog: [
      {
        id: 'gov_init_1',
        month: 0,
        actorName: pres?.name || 'Budi Subrata',
        roleTitle: 'Presiden Republik',
        summary: 'Kabinet Ekonomi Nasional resmi dilantik (Pajak Korporasi 15%, Subsidi R&D 15%).',
      },
      {
        id: 'gov_init_2',
        month: 0,
        actorName: labor?.name || 'Kartika Salim',
        roleTitle: 'Menteri Ketenagakerjaan',
        summary: 'Upah minimum nasional ditetapkan di $3,600 dengan keseimbangan serikat pekerja.',
      },
    ],
  };
}

export function syncActiveCityView(state: SimulationState): SimulationState {
  const cities = state.cities;
  const activeId = state.activeCityId || PRIMARY_CITY_ID;
  if (!cities || !cities[activeId]) return state;

  const activeCity = cities[activeId];
  return {
    ...state,
    activeCityId: activeId,
    city: activeCity,
    mapParcels: activeCity.mapParcels || state.mapParcels,
  };
}

/**
 * Switches the active inspected/buildable city canvas without losing state in sibling cities.
 */
export function switchActiveCity(
  state: SimulationState,
  cityId: string
): { success: boolean; message: string; updatedState?: SimulationState } {
  const cities = state.cities || { [PRIMARY_CITY_ID]: state.city };
  const target = cities[cityId];
  if (!target) {
    return { success: false, message: 'Kota tujuan tidak ditemukan.' };
  }

  // Persist current city mapParcels & city stats back before switching
  const prevId = state.activeCityId || PRIMARY_CITY_ID;
  const updatedCities: Record<string, CityMarket> = {
    ...cities,
    ...(cities[prevId]
      ? {
          [prevId]: {
            ...state.city,
            id: prevId,
            mapParcels: state.mapParcels,
          },
        }
      : {}),
  };

  const nextActive = updatedCities[cityId];
  return {
    success: true,
    message: `Berpindah ke ${nextActive.name}.`,
    updatedState: {
      ...state,
      cities: updatedCities,
      activeCityId: cityId,
      city: nextActive,
      mapParcels: nextActive.mapParcels || generateBiomeCityParcels(40, nextActive.biome || 'coastal_metro'),
    },
  };
}

/**
 * Founds a new city (up to MAX_CITIES = 10) with its own 40x40 zoning map, Mayoral appointment, civic housing, and biome demand profile.
 */
export function createNewCity(
  state: SimulationState,
  customName: string,
  biome: CityBiome = 'agri_valley'
): { success: boolean; message: string; updatedState?: SimulationState } {
  const ensured = ensureAiEntitiesPopulated(state);
  const currentCities = ensured.cities || {
    [PRIMARY_CITY_ID]: {
      ...ensured.city,
      id: PRIMARY_CITY_ID,
      biome: ensured.city.biome || 'coastal_metro',
      gridSize: Math.round(Math.sqrt(ensured.mapParcels.length)) || 40,
      mapParcels: ensured.mapParcels,
    },
  };
  const order = ensured.cityOrder || [PRIMARY_CITY_ID];

  if (order.length >= MAX_CITIES) {
    return {
      success: false,
      message: `Batas maksimal ${MAX_CITIES} kota tercapai dalam satu peta nasional.`,
    };
  }

  const player = ensured.companies[ensured.playerCompanyId];
  const meta = CITY_BIOME_META[biome] || CITY_BIOME_META.agri_valley;
  const cleanName = (customName || '').trim() || CITY_NAME_POOL[order.length % CITY_NAME_POOL.length];

  if (player && player.cash < meta.foundCost) {
    return {
      success: false,
      message: `Kas korporasi ($${roundCurrency(player.cash).toLocaleString()}) tidak cukup untuk hibah kota baru ($${meta.foundCost.toLocaleString()}).`,
    };
  }

  const cityIdx = order.length + 1;
  const cityId = `city_node_${cityIdx}`;
  let parcels = generateBiomeCityParcels(40, biome, cityIdx * 17);
  const nextFacilities = { ...ensured.facilities };

  // Seed 4 Pemkot civic housing towers + 6 citizen starter homes in the newly founded city
  const civicSpots = [
    { x: 16, y: 16, name: `Rusunawa ${cleanName} Sentral` },
    { x: 20, y: 18, name: `Apartemen Publik ${cleanName}` },
    { x: 14, y: 20, name: `Perumahan Pemkot ${cleanName}` },
    { x: 24, y: 16, name: `Hunian Pelabuhan ${cleanName}` },
  ];

  civicSpots.forEach((c, idx) => {
    const pIdx = c.y * 40 + c.x;
    if (parcels[pIdx] && !parcels[pIdx].facilityId && parcels[pIdx].isZoneAllowed) {
      const fId = `fac_civic_${cityId}_${idx}`;
      nextFacilities[fId] = {
        id: fId,
        companyId: GOVT_OWNER_ID,
        cityId,
        name: c.name,
        type: 'civic_housing',
        tileX: c.x,
        tileY: c.y,
        level: 1,
        createdMonth: ensured.currentTick,
        units: createDefaultUnitsForFacility('civic_housing'),
        sellingPrice: 0,
        adBudget: 0,
        monthlyMaintenance: 0,
        monthlyProduction: 260,
        monthlySales: 260,
        monthlyRevenue: 0,
        monthlyCostOfGoods: 0,
        monthlyProfit: 0,
        lastMonthUnitsSold: 260,
        inventoryLevel: 0,
        inventoryCapacity: 0,
        qualityRating: 64,
        brandRating: 50,
        supplySourceLabel: 'Hunian Pemerintah Kota',
      };
      parcels[pIdx] = {
        ...parcels[pIdx],
        facilityId: fId,
        ownerCompanyId: GOVT_OWNER_ID,
        landStatus: 'corporate',
      };
    }
  });

  const starterHomeCoords = [
    { x: 10, y: 26, tier: 1 as const },
    { x: 18, y: 28, tier: 2 as const },
    { x: 26, y: 24, tier: 1 as const },
    { x: 8, y: 18, tier: 1 as const },
    { x: 28, y: 14, tier: 2 as const },
    { x: 16, y: 31, tier: 1 as const },
  ];

  starterHomeCoords.forEach((rc, idx) => {
    const pIdx = rc.y * 40 + rc.x;
    if (parcels[pIdx] && !parcels[pIdx].facilityId && parcels[pIdx].isZoneAllowed) {
      const house = createResidentHouseFacility(rc.x, rc.y, rc.tier, ensured.currentTick, cityIdx * 100 + idx);
      house.id = `fac_res_${cityId}_${idx}`;
      house.cityId = cityId;
      nextFacilities[house.id] = house;
      parcels[pIdx] = {
        ...parcels[pIdx],
        facilityId: house.id,
        ownerCompanyId: RESIDENT_OWNER_ID,
        landStatus: 'resident',
      };
    }
  });

  const cityFacilitiesMap: Record<string, Facility> = {};
  for (const [fId, f] of Object.entries(nextFacilities)) {
    if ((f.cityId || PRIMARY_CITY_ID) === cityId) {
      cityFacilitiesMap[fId] = f;
    }
  }
  parcels = recalculateCityTraffic(parcels, cityFacilitiesMap);
  const housingSummary = computeHousingSummary(meta.popBase, cityFacilitiesMap);

  // Appoint an ambitious Investor from the 100-entity pool as the founding Mayor!
  const aiEntities = { ...ensured.aiEntities! };
  const candidateMayor = (ensured.aiEntityOrder || [])
    .map(id => aiEntities[id])
    .filter(e => e && e.role === 'investor')
    .sort((a, b) => b.politicalClout - a.politicalClout)[0];

  if (candidateMayor) {
    aiEntities[candidateMayor.id] = {
      ...candidateMayor,
      role: 'mayor',
      governedCityId: cityId,
      lastActionMonth: ensured.currentTick,
      careerHistory: [
        `Dilantik menjadi Wali Kota pendiri ${cleanName} pada ${ensured.dateString}.`,
        ...candidateMayor.careerHistory,
      ].slice(0, 8),
    };
  }

  const newCity: CityMarket = {
    id: cityId,
    name: cleanName,
    biome,
    population: meta.popBase,
    growthRate: 0.004,
    averageWage: meta.wageBase,
    consumerConfidence: 84,
    housingSupply: housingSummary.housingSupply,
    residentHousesCount: housingSummary.residentHousesCount,
    gridSize: 40,
    mapParcels: parcels,
    mayorEntityId: candidateMayor?.id,
    mayorName: candidateMayor?.name || `Wali Kota ${cleanName}`,
    cityTaxRate: 0.08,
    publicHousingBudget: 250000,
    landGrantDiscount: 0.12,
    approvalRating: 74,
    foundedMonth: ensured.currentTick,
    productStats: buildInitialProductStats(),
  };

  // Persist current active city before switching to new city
  const prevId = ensured.activeCityId || PRIMARY_CITY_ID;
  const savedCities: Record<string, CityMarket> = {
    ...currentCities,
    ...(currentCities[prevId]
      ? { [prevId]: { ...ensured.city, id: prevId, mapParcels: ensured.mapParcels } }
      : {}),
    [cityId]: newCity,
  };

  const nextCompanies = player
    ? {
        ...ensured.companies,
        [player.id]: {
          ...player,
          cash: roundCurrency(player.cash - meta.foundCost),
        },
      }
    : ensured.companies;

  const logEntry: GovernmentPolicyLog = {
    id: `gov_city_${ensured.currentTick}_${cityId}`,
    month: ensured.currentTick,
    actorName: candidateMayor?.name || 'Pemerintah Pusat',
    roleTitle: `Wali Kota ${cleanName}`,
    summary: `Kota baru ${cleanName} (${meta.label}) resmi berdiri dengan 4 Rusunawa & insentif lahan 12%.`,
  };

  const nextGov: GovernmentState = ensured.government
    ? {
        ...ensured.government,
        policyLog: [logEntry, ...ensured.government.policyLog].slice(0, 20),
      }
    : createInitialGovernment(ensured);

  return {
    success: true,
    message: `Kota ${cleanName} berhasil didirikan (${order.length + 1}/${MAX_CITIES} Kota). Wali Kota: ${newCity.mayorName}.`,
    updatedState: {
      ...ensured,
      companies: nextCompanies,
      facilities: nextFacilities,
      aiEntities,
      government: nextGov,
      cities: savedCities,
      cityOrder: [...order, cityId],
      activeCityId: cityId,
      city: newCity,
      mapParcels: parcels,
      newsFeed: [
        {
          id: `news_newcity_${ensured.currentTick}_${cityId}`,
          month: ensured.currentTick,
          category: 'politics' as const,
          title: `Ekspansi Wilayah: Kota ${cleanName} Diresmikan`,
          detail: `${meta.label} kini terbuka bagi investor dengan ${newCity.mayorName} sebagai Wali Kota dan populasi awal ${(meta.popBase / 1_000_000).toFixed(2)}M jiwa.`,
        },
        ...ensured.newsFeed,
      ].slice(0, 25),
    },
  };
}

/**
 * Allows player to lobby or adjust municipal/national policy incentives (spending cash for political leverage).
 */
export function lobbyGovernmentPolicy(
  state: SimulationState,
  policyType: 'tax_cut' | 'rd_grant' | 'land_grant' | 'wage_moderation'
): { success: boolean; message: string; updatedState?: SimulationState } {
  const ensured = ensureAiEntitiesPopulated(state);
  const player = ensured.companies[ensured.playerCompanyId];
  const gov = ensured.government || createInitialGovernment(ensured);
  const lobbyCost = 350000;

  if (!player || player.cash < lobbyCost) {
    return {
      success: false,
      message: `Dana lobi kebijakan ($${lobbyCost.toLocaleString()}) melebihi kas korporasi.`,
    };
  }

  let updatedGov = { ...gov };
  let updatedCity = { ...ensured.city };
  let summary = '';

  if (policyType === 'tax_cut') {
    updatedGov.corporateTaxRate = round2(Math.max(0.06, gov.corporateTaxRate - 0.02));
    summary = `Tarif Pajak Korporasi Nasional diturunkan menjadi ${(updatedGov.corporateTaxRate * 100).toFixed(0)}%.`;
  } else if (policyType === 'rd_grant') {
    updatedGov.rdSubsidyRate = round2(Math.min(0.45, gov.rdSubsidyRate + 0.05));
    summary = `Subsidi Riset & Inovasi R&D Nasional naik menjadi ${(updatedGov.rdSubsidyRate * 100).toFixed(0)}%.`;
  } else if (policyType === 'land_grant') {
    const nextDisc = round2(Math.min(0.35, (updatedCity.landGrantDiscount || 0.1) + 0.05));
    updatedCity.landGrantDiscount = nextDisc;
    summary = `Diskon Zona Kavling ${updatedCity.name} dinaikkan menjadi ${(nextDisc * 100).toFixed(0)}%.`;
  } else {
    updatedGov.minimumWageFloor = Math.max(2400, gov.minimumWageFloor - 200);
    summary = `Menteri Ketenagakerjaan menyetujui penyesuaian upah dasar menjadi $${updatedGov.minimumWageFloor.toLocaleString()}.`;
  }

  const logEntry: GovernmentPolicyLog = {
    id: `gov_lobby_${ensured.currentTick}_${policyType}`,
    month: ensured.currentTick,
    actorName: updatedGov.presidentName,
    roleTitle: 'Kebijakan Publik',
    summary,
  };
  updatedGov.policyLog = [logEntry, ...gov.policyLog].slice(0, 20);

  const activeId = ensured.activeCityId || PRIMARY_CITY_ID;
  const cities = ensured.cities
    ? { ...ensured.cities, [activeId]: updatedCity }
    : { [activeId]: updatedCity };

  return {
    success: true,
    message: summary,
    updatedState: {
      ...ensured,
      companies: {
        ...ensured.companies,
        [player.id]: { ...player, cash: roundCurrency(player.cash - lobbyCost) },
      },
      city: updatedCity,
      cities,
      government: updatedGov,
      newsFeed: [
        {
          id: `news_gov_pol_${ensured.currentTick}_${policyType}`,
          month: ensured.currentTick,
          category: 'politics' as const,
          title: 'Dekrit Kebijakan Ekonomi Pemerintah',
          detail: summary,
        },
        ...ensured.newsFeed,
      ].slice(0, 25),
    },
  };
}

/**
 * Runs periodic Government & Election simulation:
 * - Ensures cabinet posts (President, Minister of Labor, City Mayors) stay staffed from the 100-entity AI pool
 * - Conducts periodic 24-month elections where high-clout AI Investors ascend to President / Minister of Labor / Mayor
 * - Adjusts national approval, wage floor, and municipal budgets deterministically
 */
export function simulateGovernmentMonth(state: SimulationState): SimulationState {
  const ensured = ensureAiEntitiesPopulated(state);
  const gov: GovernmentState = ensured.government
    ? { ...ensured.government, policyLog: [...ensured.government.policyLog] }
    : createInitialGovernment(ensured);

  const aiEntities = { ...ensured.aiEntities! };
  const order = ensured.aiEntityOrder!;
  const month = ensured.currentTick;
  const newsToAdd: SimulationState['newsFeed'] = [];

  // Ensure initial Mayor/President/Minister have proper roles reflected in aiEntities
  if (gov.presidentEntityId && aiEntities[gov.presidentEntityId] && aiEntities[gov.presidentEntityId].role !== 'president') {
    aiEntities[gov.presidentEntityId] = {
      ...aiEntities[gov.presidentEntityId],
      role: 'president',
    };
  }
  if (
    gov.ministerOfLaborEntityId &&
    aiEntities[gov.ministerOfLaborEntityId] &&
    aiEntities[gov.ministerOfLaborEntityId].role !== 'minister_of_labor'
  ) {
    aiEntities[gov.ministerOfLaborEntityId] = {
      ...aiEntities[gov.ministerOfLaborEntityId],
      role: 'minister_of_labor',
    };
  }

  // Ensure every city has a mayor assigned
  const activeId = ensured.activeCityId || PRIMARY_CITY_ID;
  const baseCities = ensured.cities
    ? { ...ensured.cities }
    : {
        [activeId]: {
          ...ensured.city,
          id: activeId,
          biome: ensured.city.biome || 'coastal_metro',
          gridSize: Math.round(Math.sqrt(ensured.mapParcels.length)) || 40,
          mapParcels: ensured.mapParcels,
        },
      };
  const cityOrder = ensured.cityOrder || [activeId];

  for (let i = 0; i < cityOrder.length; i++) {
    const cId = cityOrder[i];
    const cityObj = baseCities[cId];
    if (!cityObj) continue;
    if (!cityObj.mayorEntityId) {
      const candidate = order
        .map(id => aiEntities[id])
        .filter(e => e && e.role === 'investor')
        .sort((a, b) => b.politicalClout - a.politicalClout)[0];
      if (candidate) {
        aiEntities[candidate.id] = {
          ...candidate,
          role: 'mayor',
          governedCityId: cId,
          careerHistory: [
            `Diangkat menjadi Wali Kota ${cityObj.name} pada ${ensured.dateString}.`,
            ...candidate.careerHistory,
          ].slice(0, 8),
        };
        baseCities[cId] = {
          ...cityObj,
          mayorEntityId: candidate.id,
          mayorName: candidate.name,
          cityTaxRate: cityObj.cityTaxRate ?? 0.08,
          landGrantDiscount: cityObj.landGrantDiscount ?? 0.08,
          approvalRating: cityObj.approvalRating ?? 72,
        };
      }
    }
  }

  // Election Cycle every 24 months: top politicalClout AI investors compete for President & Minister of Labor
  if (month > 0 && month >= gov.nextElectionTick) {
    const candidates = order
      .map(id => aiEntities[id])
      .filter(e => e && (e.role === 'investor' || e.role === 'mayor' || e.role === 'minister_of_labor'))
      .sort((a, b) => b.politicalClout + (b.financeSkill * 0.25) - (a.politicalClout + a.financeSkill * 0.25));

    const winnerPres = candidates[0];
    const winnerLabor = candidates[1];

    if (winnerPres && winnerPres.id !== gov.presidentEntityId) {
      if (gov.presidentEntityId && aiEntities[gov.presidentEntityId]) {
        const prev = aiEntities[gov.presidentEntityId];
        aiEntities[prev.id] = {
          ...prev,
          role: 'investor',
          careerHistory: [`Menyelesaikan masa jabatan Presiden (${ensured.dateString}).`, ...prev.careerHistory].slice(0, 8),
        };
      }
      aiEntities[winnerPres.id] = {
        ...winnerPres,
        role: 'president',
        governedCityId: undefined,
        lastActionMonth: month,
        careerHistory: [`Menang Pemilu & Dilantik sebagai Presiden (${ensured.dateString}).`, ...winnerPres.careerHistory].slice(0, 8),
      };
      gov.presidentEntityId = winnerPres.id;
      gov.presidentName = winnerPres.name;
    }

    if (winnerLabor && winnerLabor.id !== gov.ministerOfLaborEntityId && winnerLabor.id !== gov.presidentEntityId) {
      if (gov.ministerOfLaborEntityId && aiEntities[gov.ministerOfLaborEntityId]) {
        const prevL = aiEntities[gov.ministerOfLaborEntityId];
        aiEntities[prevL.id] = {
          ...prevL,
          role: 'investor',
          careerHistory: [`Menyelesaikan masa jabatan Menteri Ketenagakerjaan.`, ...prevL.careerHistory].slice(0, 8),
        };
      }
      aiEntities[winnerLabor.id] = {
        ...winnerLabor,
        role: 'minister_of_labor',
        governedCityId: undefined,
        lastActionMonth: month,
        careerHistory: [`Diangkat sebagai Menteri Ketenagakerjaan (${ensured.dateString}).`, ...winnerLabor.careerHistory].slice(0, 8),
      };
      gov.ministerOfLaborEntityId = winnerLabor.id;
      gov.ministerOfLaborName = winnerLabor.name;
    }

    gov.nextElectionTick = month + 24;
    const summary = `Pemilu Nasional: ${gov.presidentName} menjabat Presiden & ${gov.ministerOfLaborName} sebagai Menaker.`;
    gov.policyLog = [
      {
        id: `gov_elec_${month}`,
        month,
        actorName: gov.presidentName,
        roleTitle: 'Presiden Terpilih',
        summary,
      },
      ...gov.policyLog,
    ].slice(0, 20);

    newsToAdd.push({
      id: `news_elec_${month}`,
      month,
      category: 'politics',
      title: `Hasil Pemilu Nasional: Presiden ${gov.presidentName}`,
      detail: summary,
    });
  }

  // Enforce Minister of Labor wage floor & update national approval rating
  const syncedCity = baseCities[activeId] || ensured.city;
  const effectiveCityWage = Math.max(syncedCity.averageWage, gov.minimumWageFloor);
  baseCities[activeId] = {
    ...syncedCity,
    id: activeId,
    averageWage: effectiveCityWage,
    mapParcels: ensured.mapParcels,
  };

  gov.nationalApproval = clamp(
    roundCurrency(
      gov.nationalApproval * 0.85 +
        (ensured.macro.cyclePhase === 'boom' ? 84 : ensured.macro.cyclePhase === 'recession' ? 48 : 70) * 0.15
    ),
    22,
    95
  );

  return {
    ...ensured,
    aiEntities,
    government: gov,
    cities: baseCities,
    cityOrder,
    activeCityId: activeId,
    city: baseCities[activeId],
    newsFeed: [...newsToAdd, ...ensured.newsFeed].slice(0, 25),
  };
}
