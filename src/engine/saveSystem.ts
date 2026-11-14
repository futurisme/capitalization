import {
  SimulationState,
  Company,
  MapParcel,
  Facility,
  CityMarket,
  ProductId,
} from '../types/game';
import { createDefaultUnitsForFacility } from './facilityUnits';
import { getParcelAt, recalculateCityTraffic } from './spatialGrid';
import { clamp, finiteOr, round2, roundCurrency } from './precisionMath';
import {
  AVAILABLE_EXECUTIVES,
  FACILITY_SPECS,
  PRODUCTS,
  INITIAL_AI_ROSTER,
  MAX_ACTIVE_COMPANIES,
  GOVT_OWNER_ID,
  RESIDENT_OWNER_ID,
  AICorporateTemplate,
} from './productsData';
import {
  INITIAL_RESIDENT_HOUSE_COORDS,
  seedResourceDepositsOnParcels,
  createResidentHouseFacility,
  computeHousingSummary,
} from './housingEcosystem';

export const MAP_GRID_SIZE = 32;
const SAVE_KEY_PREFIX = 'caplab_mobile_save_v2';
const AUTO_SAVE_KEY = `${SAVE_KEY_PREFIX}_auto`;

function createDefaultExecutives(isHiredFirst = false) {
  return AVAILABLE_EXECUTIVES.map((e, idx) => ({
    ...e,
    hired: isHiredFirst && idx === 0,
  }));
}

export function buildBaseTechMap(
  override: Partial<Record<ProductId, number>> = {}
): Record<ProductId, number> {
  return {
    wheat: 30,
    livestock: 30,
    crude_oil: 30,
    iron_ore: 30,
    silicon: 30,
    flour: 35,
    steel: 35,
    plastic: 35,
    electronic_chip: 40,
    fabric: 35,
    battery_cell: 38,
    bread: 40,
    soft_drink: 40,
    fashion_apparel: 40,
    medicine: 42,
    smartphone: 45,
    laptop: 45,
    automobile: 35,
    software_os: 40,
    ai_enterprise: 35,
    ...override,
  };
}

/**
 * Finds a free valid zone parcel in single O(W*H) pass, honoring O(1) preferred coordinate lookup.
 */
export function selectParcelForZone(
  parcels: MapParcel[],
  preferredZone: 'commercial' | 'industrial',
  preferredCoord?: { x: number; y: number }
): MapParcel | null {
  if (preferredCoord) {
    const exact = getParcelAt(parcels, preferredCoord.x, preferredCoord.y);
    if (
      exact &&
      !exact.facilityId &&
      exact.isZoneAllowed &&
      exact.terrainType !== 'water' &&
      exact.terrainType !== 'road'
    ) {
      return exact;
    }
  }

  let firstEmpty: MapParcel | null = null;
  const industrialList: MapParcel[] = [];
  let bestCommercial: MapParcel | null = null;
  let bestTraffic = -1;

  for (let i = 0; i < parcels.length; i++) {
    const p = parcels[i];
    if (p.facilityId || !p.isZoneAllowed || p.terrainType === 'water' || p.terrainType === 'road') {
      continue;
    }
    if (!firstEmpty) firstEmpty = p;

    if (preferredZone === 'industrial') {
      if (p.terrainType === 'industrial_zone') industrialList.push(p);
    } else if (p.terrainType === 'pavement' || p.terrainType === 'grass') {
      const traffic = p.trafficIndex || 0;
      if (traffic > bestTraffic) {
        bestTraffic = traffic;
        bestCommercial = p;
      }
    }
  }

  if (preferredZone === 'industrial' && industrialList.length > 0) {
    return industrialList[Math.floor((industrialList.length - 1) * 0.35)];
  }
  if (bestCommercial) return bestCommercial;
  return firstEmpty;
}

/**
 * Constructs a balanced, cheat-free AI corporation and its starter operational facility from a template.
 */
export function createCompanyAndStarterFromTemplate(
  template: AICorporateTemplate,
  parcels: MapParcel[],
  currentTick: number,
  options?: {
    overrideId?: string;
    preferredCoord?: { x: number; y: number };
    dateString?: string;
    isNewEntrant?: boolean;
  }
): {
  company: Company;
  facility: Facility | null;
  updatedParcels: MapParcel[];
} {
  const compId = options?.overrideId || template.id;
  const spec = FACILITY_SPECS[template.starterFacilityType];
  const parcel = selectParcelForZone(parcels, template.preferredZone, options?.preferredCoord);
  const prod = PRODUCTS[template.starterProduct];

  let starterFacility: Facility | null = null;
  let updatedParcels = parcels;

  if (parcel) {
    const facId = `fac_${compId}_init_${currentTick}`;
    const units = createDefaultUnitsForFacility(
      template.starterFacilityType,
      template.starterProduct
    );
    const isStore = template.starterFacilityType.startsWith('store_');
    const isRD = template.starterFacilityType === 'rd_center';
    const isMedia = template.starterFacilityType === 'media_telecom';
    const isRealEstate =
      template.starterFacilityType === 'apartment_complex' ||
      template.starterFacilityType === 'commercial_tower';

    starterFacility = {
      id: facId,
      companyId: compId,
      name: `${spec.name} ${template.ticker}`,
      type: template.starterFacilityType,
      tileX: parcel.x,
      tileY: parcel.y,
      level: 1,
      createdMonth: currentTick,
      units,
      sellingPrice: isRD || isMedia ? 0 : isRealEstate ? 960 : prod ? prod.basePrice : 50,
      adBudget: isRD ? 0 : template.personality === 'brand_titan' ? 12000 : 6000,
      monthlyMaintenance: spec.monthlyMaintenance,
      monthlyProduction: isStore || isRD ? 0 : isRealEstate ? 165 : 6000,
      monthlySales: isRD ? 0 : isRealEstate ? 165 : 4200,
      monthlyRevenue: isRD ? 0 : isRealEstate ? 158000 : 185000,
      monthlyCostOfGoods: isRD ? spec.monthlyMaintenance : isRealEstate ? 38000 : 110000,
      monthlyProfit: isRD ? -spec.monthlyMaintenance : isRealEstate ? 82000 : 48000,
      lastMonthUnitsSold: isRD ? 0 : isRealEstate ? 165 : 4200,
      inventoryLevel: isRD || isMedia || isRealEstate ? 0 : 3200,
      inventoryCapacity: isRD || isMedia || isRealEstate ? 0 : 14000,
      qualityRating: template.personality === 'quality_first' ? 68 : 56,
      brandRating: template.corporateBrandRating,
      supplySourceLabel: isRealEstate
        ? 'Hunian & Sewa Aktif'
        : isStore
        ? 'Pelabuhan Impor'
        : 'Produksi Mandiri',
    };

    updatedParcels = parcels.map(p =>
      p.x === parcel.x && p.y === parcel.y
        ? { ...p, facilityId: facId, ownerCompanyId: compId }
        : p
    );
  }

  const facilitiesBook = starterFacility ? spec.constructionCost : 0;
  const totalAssets = template.startingCash + facilitiesBook;
  const bookValue = Math.max(500000, totalAssets - template.startingDebt);
  const marketCap = roundCurrency(template.stockPrice * template.sharesOutstanding);
  const founderShares = roundCurrency(template.sharesOutstanding * 0.75);
  const baseProfit = starterFacility ? starterFacility.monthlyProfit : 32000;
  const baseRev = starterFacility ? starterFacility.monthlyRevenue : 150000;

  const company: Company = {
    id: compId,
    name: template.name,
    ticker: template.ticker,
    color: template.color,
    accentColor: template.accentColor,
    isPlayer: false,
    ceoName: template.ceoName,
    ceoAvatar: template.id,
    ceoIcon: template.id,
    lastConstructedTick: currentTick,
    personality: template.personality,
    sectorFocus: template.sectorFocus,
    brandStrategy: template.brandStrategy,
    corporateBrandRating: template.corporateBrandRating,
    executives: createDefaultExecutives(template.personality === 'expansionist'),
    cash: template.startingCash,
    debt: template.startingDebt,
    bondDebt: 0,
    monthlyInterestRate: 0.0058,
    sharesOutstanding: template.sharesOutstanding,
    treasuryShares: 0,
    stockPrice: template.stockPrice,
    sharePriceHistory: [
      round2(template.stockPrice * 0.92),
      round2(template.stockPrice * 0.96),
      round2(template.stockPrice * 0.98),
      template.stockPrice,
    ],
    dividendPerShare: 0.04,
    shareholdings: {
      [compId]: founderShares,
    },
    techLevels: buildBaseTechMap(template.techBoosts),
    activeResearchProduct: template.starterProduct,
    history: {
      months: options?.isNewEntrant
        ? [options.dateString || 'Baru']
        : ['Okt 2025', 'Nov 2025', 'Des 2025'],
      revenue: options?.isNewEntrant
        ? [baseRev]
        : [roundCurrency(baseRev * 0.85), roundCurrency(baseRev * 0.92), baseRev],
      netProfit: options?.isNewEntrant
        ? [baseProfit]
        : [roundCurrency(baseProfit * 0.8), roundCurrency(baseProfit * 0.9), baseProfit],
      cash: options?.isNewEntrant
        ? [template.startingCash]
        : [template.startingCash - 200000, template.startingCash - 100000, template.startingCash],
      marketCap: options?.isNewEntrant
        ? [marketCap]
        : [roundCurrency(marketCap * 0.92), roundCurrency(marketCap * 0.96), marketCap],
    },
    facilitiesCount: starterFacility ? 1 : 0,
    totalAssets,
    bookValue,
    marketCap,
    lastMonthRevenue: baseRev,
    lastMonthNetProfit: baseProfit,
    peRatio: baseProfit > 0 ? Math.round((marketCap / (baseProfit * 12)) * 10) / 10 : 18.0,
    marketSharePercentage: 8,
  };

  return { company, facility: starterFacility, updatedParcels };
}

/**
 * Generates an expanded 32x32 (1,024-tile) metropolitan zoning layout with
 * 4x4 arterial highways, heavy industrial district, central CBD, residential suburbs, and river harbor.
 */
export function generateCityParcels(gridSize = MAP_GRID_SIZE): MapParcel[] {
  const parcels: MapParcel[] = new Array(gridSize * gridSize);
  let idx = 0;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      let terrain: MapParcel['terrainType'] = 'grass';
      let isAllowed = true;
      let districtName = 'Kawasan Hunian Suburban';

      if (x + y >= gridSize * 2 - 7) {
        terrain = 'water';
        isAllowed = false;
        districtName = 'Pelabuhan Sungai';
      } else if (
        x === 5 ||
        y === 5 ||
        x === 13 ||
        y === 13 ||
        x === 21 ||
        y === 21 ||
        x === 27 ||
        y === 27
      ) {
        terrain = 'road';
        isAllowed = false;
        districtName = 'Jalan Arteri Utama';
      } else if (x <= 12 && y <= 12) {
        terrain = 'industrial_zone';
        districtName = 'Zona Industri Berat';
      } else if (x >= 6 && x <= 25 && y >= 6 && y <= 25) {
        terrain = 'pavement';
        districtName = 'Pusat Bisnis CBD';
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
        isZoneAllowed: isAllowed,
        trafficIndex: baseTraffic,
        districtName,
        landValue:
          terrain === 'pavement' ? 245000 : terrain === 'industrial_zone' ? 120000 : 88000,
        landStatus: isAllowed ? 'for_sale' : 'public',
      };
    }
  }

  return seedResourceDepositsOnParcels(parcels);
}

const CIVIC_HOUSING_COORDS: { x: number; y: number; name: string }[] = [
  { x: 15, y: 17, name: 'Rusunawa Pemkot Sentral' },
  { x: 18, y: 19, name: 'Apartemen Rakyat Metro Selatan' },
  { x: 11, y: 17, name: 'Perumahan Pemkot Barat' },
  { x: 23, y: 11, name: 'Rusunawa Timur Jaya' },
  { x: 24, y: 18, name: 'Kompleks Hunian Pelabuhan' },
  { x: 8, y: 23, name: 'Perumahan Suburban Hijau' },
  { x: 16, y: 24, name: 'Apartemen Pemkot Anggrek' },
  { x: 22, y: 23, name: 'Hunian Terpadu Harapan' },
];

const INITIAL_AI_SPAWN_COORDS: Record<string, { x: number; y: number }> = {
  comp_apex: { x: 18, y: 15 },
  comp_nova: { x: 19, y: 11 },
  comp_omni: { x: 8, y: 8 },
  comp_land: { x: 15, y: 18 },
  comp_medx: { x: 16, y: 14 },
  comp_agro: { x: 10, y: 4 },
  comp_velo: { x: 12, y: 19 },
  comp_cloud: { x: 20, y: 14 },
  comp_media: { x: 14, y: 16 },
};

function indexFacilitiesByCoord(
  facilities: Record<string, Facility>,
  gridSize = MAP_GRID_SIZE
): Map<number, Facility> {
  const byCoord = new Map<number, Facility>();
  const list = Object.values(facilities);
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    byCoord.set(f.tileY * gridSize + f.tileX, f);
  }
  return byCoord;
}

export function generateDefaultState(): SimulationState {
  let parcels = generateCityParcels(MAP_GRID_SIZE);

  const companies: Record<string, Company> = {
    comp_player: {
      id: 'comp_player',
      name: 'Nusantara Holdings',
      ticker: 'NUSA',
      color: '#0284c7',
      accentColor: '#38bdf8',
      isPlayer: true,
      ceoName: 'Konglomerat Anda',
      ceoAvatar: 'comp_player',
      ceoIcon: 'comp_player',
      lastConstructedTick: 0,
      sectorFocus: 'Konglomerasi Multi-Sektor',
      brandStrategy: 'corporate',
      corporateBrandRating: 52,
      executives: createDefaultExecutives(false),
      cash: 10000000,
      debt: 0,
      bondDebt: 0,
      monthlyInterestRate: 0.0058,
      sharesOutstanding: 1000000,
      treasuryShares: 0,
      stockPrice: 15.0,
      sharePriceHistory: [14.2, 14.5, 14.8, 15.0],
      dividendPerShare: 0.05,
      shareholdings: {
        comp_player: 1000000,
      },
      techLevels: buildBaseTechMap({}),
      activeResearchProduct: 'smartphone',
      history: {
        months: ['Okt 2025', 'Nov 2025', 'Des 2025'],
        revenue: [150000, 180000, 210000],
        netProfit: [45000, 55000, 70000],
        cash: [9800000, 9920000, 10000000],
        marketCap: [14200000, 14500000, 15000000],
      },
      facilitiesCount: 2,
      totalAssets: 12500000,
      bookValue: 12500000,
      marketCap: 15000000,
      lastMonthRevenue: 210000,
      lastMonthNetProfit: 70000,
      peRatio: 17.8,
      marketSharePercentage: 14,
    },
  };

  const facilities: Record<string, Facility> = {
    fac_player_hq: {
      id: 'fac_player_hq',
      companyId: 'comp_player',
      name: 'Menara Kantor Pusat NUSA',
      type: 'corporate_hq',
      tileX: 16,
      tileY: 16,
      level: 1,
      createdMonth: 0,
      units: [],
      sellingPrice: 0,
      adBudget: 0,
      monthlyMaintenance: 35000,
      monthlyProduction: 0,
      monthlySales: 0,
      monthlyRevenue: 0,
      monthlyCostOfGoods: 0,
      monthlyProfit: -35000,
      lastMonthUnitsSold: 0,
      inventoryLevel: 0,
      inventoryCapacity: 0,
      qualityRating: 80,
      brandRating: 52,
    },
    fac_player_store: {
      id: 'fac_player_store',
      companyId: 'comp_player',
      name: 'Nusantara Mart Utama',
      type: 'store_convenience',
      tileX: 17,
      tileY: 16,
      level: 1,
      createdMonth: 0,
      units: createDefaultUnitsForFacility('store_convenience', 'bread'),
      sellingPrice: 8.5,
      adBudget: 10000,
      monthlyMaintenance: 15000,
      monthlyProduction: 0,
      monthlySales: 28000,
      monthlyRevenue: 238000,
      monthlyCostOfGoods: 140000,
      monthlyProfit: 73000,
      lastMonthUnitsSold: 28000,
      inventoryLevel: 4500,
      inventoryCapacity: 10000,
      qualityRating: 55,
      brandRating: 60,
      supplySourceLabel: 'Pelabuhan Impor',
    },
  };

  // Seed Government-managed Civic Housing & Public Apartments across urban neighborhoods
  CIVIC_HOUSING_COORDS.forEach((c, idx) => {
    const facId = `fac_civic_${idx}`;
    facilities[facId] = {
      id: facId,
      companyId: GOVT_OWNER_ID,
      name: c.name,
      type: 'civic_housing',
      tileX: c.x,
      tileY: c.y,
      level: 1,
      createdMonth: 0,
      units: createDefaultUnitsForFacility('civic_housing'),
      sellingPrice: 0,
      adBudget: 0,
      monthlyMaintenance: 0,
      monthlyProduction: 280,
      monthlySales: 280,
      monthlyRevenue: 0,
      monthlyCostOfGoods: 0,
      monthlyProfit: 0,
      lastMonthUnitsSold: 280,
      inventoryLevel: 0,
      inventoryCapacity: 0,
      qualityRating: 64,
      brandRating: 50,
      supplySourceLabel: 'Hunian Pemerintah Kota',
    };
  });

  // Seed initial citizen-owned Resident Houses across suburban/urban neighborhoods
  INITIAL_RESIDENT_HOUSE_COORDS.forEach((rc, idx) => {
    const house = createResidentHouseFacility(rc.x, rc.y, rc.tier, 0, idx + 1);
    facilities[house.id] = house;
  });

  // O(F + W*H) parcel occupancy marking
  const coordMap = indexFacilitiesByCoord(facilities, MAP_GRID_SIZE);
  parcels = parcels.map(p => {
    const pf = coordMap.get(p.y * MAP_GRID_SIZE + p.x);
    return pf
      ? {
          ...p,
          facilityId: pf.id,
          ownerCompanyId: pf.companyId,
          landStatus: pf.companyId === RESIDENT_OWNER_ID ? ('resident' as const) : ('corporate' as const),
        }
      : p;
  });

  // Compute initial city crowd traffic so AI spawns smartly appreciate foot traffic
  parcels = recalculateCityTraffic(parcels, facilities);

  // Populate 9 distinct AI competitors to reach MAX_ACTIVE_COMPANIES (10 total active firms)
  for (const template of INITIAL_AI_ROSTER.slice(0, MAX_ACTIVE_COMPANIES - 1)) {
    const spawned = createCompanyAndStarterFromTemplate(template, parcels, 0, {
      preferredCoord: INITIAL_AI_SPAWN_COORDS[template.id],
    });
    companies[spawned.company.id] = spawned.company;
    if (spawned.facility) {
      facilities[spawned.facility.id] = spawned.facility;
    }
    parcels = spawned.updatedParcels;
  }

  parcels = recalculateCityTraffic(parcels, facilities);
  const housingSummary = computeHousingSummary(2150000, facilities);

  const city: CityMarket = {
    name: 'Metropolis Raya',
    population: 2150000,
    growthRate: 0.003,
    averageWage: 4800,
    consumerConfidence: 82,
    housingSupply: housingSummary.housingSupply,
    residentHousesCount: housingSummary.residentHousesCount,
    productStats: {
      wheat: { monthlyDemand: 22000, monthlySupply: 18000, averageMarketPrice: 120, playerMarketShare: 0, satisfactionRate: 81, seaportImportShare: 100 },
      livestock: { monthlyDemand: 12000, monthlySupply: 10500, averageMarketPrice: 310, playerMarketShare: 0, satisfactionRate: 87, seaportImportShare: 100 },
      crude_oil: { monthlyDemand: 15000, monthlySupply: 14000, averageMarketPrice: 75, playerMarketShare: 0, satisfactionRate: 93, seaportImportShare: 100 },
      iron_ore: { monthlyDemand: 18000, monthlySupply: 16500, averageMarketPrice: 100, playerMarketShare: 0, satisfactionRate: 91, seaportImportShare: 50 },
      silicon: { monthlyDemand: 9000, monthlySupply: 7200, averageMarketPrice: 190, playerMarketShare: 0, satisfactionRate: 80, seaportImportShare: 100 },
      flour: { monthlyDemand: 16000, monthlySupply: 14000, averageMarketPrice: 210, playerMarketShare: 0, satisfactionRate: 87, seaportImportShare: 100 },
      steel: { monthlyDemand: 14000, monthlySupply: 12500, averageMarketPrice: 340, playerMarketShare: 0, satisfactionRate: 89, seaportImportShare: 100 },
      plastic: { monthlyDemand: 13000, monthlySupply: 12000, averageMarketPrice: 175, playerMarketShare: 0, satisfactionRate: 92, seaportImportShare: 100 },
      electronic_chip: { monthlyDemand: 8000, monthlySupply: 6500, averageMarketPrice: 580, playerMarketShare: 0, satisfactionRate: 81, seaportImportShare: 100 },
      fabric: { monthlyDemand: 15000, monthlySupply: 13500, averageMarketPrice: 145, playerMarketShare: 0, satisfactionRate: 90, seaportImportShare: 100 },
      battery_cell: { monthlyDemand: 9500, monthlySupply: 6200, averageMarketPrice: 315, playerMarketShare: 0, satisfactionRate: 65, seaportImportShare: 100 },
      bread: { monthlyDemand: 75000, monthlySupply: 62000, averageMarketPrice: 8.5, playerMarketShare: 45, satisfactionRate: 82, seaportImportShare: 100 },
      soft_drink: { monthlyDemand: 65000, monthlySupply: 48000, averageMarketPrice: 14.0, playerMarketShare: 0, satisfactionRate: 73, seaportImportShare: 100 },
      fashion_apparel: { monthlyDemand: 28000, monthlySupply: 22000, averageMarketPrice: 65.0, playerMarketShare: 0, satisfactionRate: 78, seaportImportShare: 100 },
      medicine: { monthlyDemand: 32000, monthlySupply: 19500, averageMarketPrice: 36.0, playerMarketShare: 0, satisfactionRate: 61, seaportImportShare: 100 },
      smartphone: { monthlyDemand: 18000, monthlySupply: 13000, averageMarketPrice: 650.0, playerMarketShare: 0, satisfactionRate: 72, seaportImportShare: 100 },
      laptop: { monthlyDemand: 9500, monthlySupply: 6800, averageMarketPrice: 1150.0, playerMarketShare: 0, satisfactionRate: 71, seaportImportShare: 100 },
      automobile: { monthlyDemand: 1200, monthlySupply: 850, averageMarketPrice: 28500.0, playerMarketShare: 0, satisfactionRate: 70, seaportImportShare: 100 },
      software_os: { monthlyDemand: 14000, monthlySupply: 4500, averageMarketPrice: 120.0, playerMarketShare: 0, satisfactionRate: 32, seaportImportShare: 100 },
      ai_enterprise: { monthlyDemand: 4800, monthlySupply: 1200, averageMarketPrice: 380.0, playerMarketShare: 0, satisfactionRate: 25, seaportImportShare: 100 },
    },
  };

  return {
    currentTick: 0,
    isPaused: false,
    simSpeed: 1,
    dateString: 'Jan 2026',
    playerCompanyId: 'comp_player',
    companies,
    facilities,
    city,
    macro: {
      cyclePhase: 'normal',
      gdpGrowthRate: 2.9,
      inflationRate: 2.3,
      centralBankRate: 4.5,
      importTariffRate: 0.05,
      monthsInPhase: 2,
      consumerPriceIndex: 100.0,
      unemploymentRate: 5.15,
      realWageRate: 40.8,
    },
    mapParcels: parcels,
    stockTransactions: [],
    newsFeed: [
      {
        id: 'news_init_1',
        month: 0,
        category: 'economy',
        title: 'Metropolis Raya Diperluas: Peta 32x32, Deposit & Permukiman Warga',
        detail:
          'Bursa Metropolis Raya beroperasi dengan 10 korporasi lintas sektor, deposit sumber daya alam strategis, 8 Rusunawa Pemkot, dan sistem hunian warga otomatis.',
      },
      {
        id: 'news_init_2',
        month: 0,
        category: 'competitor',
        title: 'Persaingan Spesialisasi 9 Konglomerat AI',
        detail:
          'Masing-masing kompetitor AI memfokuskan modal nyata pada sektor unggulannya—termasuk Sinar Properti (LAND), BioMedika (MEDX), NovaTech (NOVA), dan OmniSupply (OMNI).',
      },
    ],
  };
}

/**
 * Strips prototype-pollution vectors and validates imported JSON safely
 */
function sanitizeParsedJson(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(item => sanitizeParsedJson(item));
  }
  if (input && typeof input === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      clean[key] = sanitizeParsedJson(val);
    }
    return clean;
  }
  return input;
}

/**
 * Safely migrates & validates saved states to 32x32 CapLab 13 schema with O(F + W*H) lookup.
 */
export function hydrateState(rawParsed: unknown): SimulationState | null {
  const parsed = sanitizeParsedJson(rawParsed) as Partial<SimulationState> | null;
  if (!parsed || typeof parsed !== 'object' || !parsed.companies || !parsed.facilities) {
    return null;
  }
  const fresh = generateDefaultState();

  const hydratedCompanies: Record<string, Company> = {};
  const playerId = parsed.playerCompanyId || 'comp_player';
  const companyKeys = Object.keys(parsed.companies);

  for (let i = 0; i < companyKeys.length; i++) {
    const id = companyKeys[i];
    const c = parsed.companies[id];
    if (!c || typeof c !== 'object') continue;
    const fallback = fresh.companies[id] || fresh.companies.comp_apex || fresh.companies.comp_player;
    hydratedCompanies[id] = {
      ...fallback,
      ...c,
      isPlayer: id === playerId ? true : Boolean(c.isPlayer),
      cash: finiteOr(c.cash, fallback.cash),
      debt: Math.max(0, finiteOr(c.debt, 0)),
      bondDebt: Math.max(0, finiteOr(c.bondDebt, 0)),
      stockPrice: clamp(finiteOr(c.stockPrice, fallback.stockPrice), 1, 250),
      sharesOutstanding: Math.max(10000, roundCurrency(finiteOr(c.sharesOutstanding, fallback.sharesOutstanding))),
      treasuryShares: Math.max(0, roundCurrency(finiteOr(c.treasuryShares, 0))),
      dividendPerShare: clamp(finiteOr(c.dividendPerShare, 0), 0, 10),
      executives: Array.isArray(c.executives) ? c.executives : createDefaultExecutives(false),
      brandStrategy: c.brandStrategy || 'corporate',
      corporateBrandRating: clamp(finiteOr(c.corporateBrandRating, 50), 10, 100),
      techLevels: { ...fallback.techLevels, ...(c.techLevels || {}) },
    };
  }

  if (Object.keys(hydratedCompanies).length === 0) return null;

  const hydratedFacilities: Record<string, Facility> = {};
  const facilityKeys = Object.keys(parsed.facilities);
  for (let i = 0; i < facilityKeys.length; i++) {
    const fId = facilityKeys[i];
    const f = parsed.facilities[fId];
    if (!f || typeof f !== 'object') continue;
    hydratedFacilities[fId] = {
      ...f,
      level: clamp(Math.floor(finiteOr(f.level, 1)), 1, 5),
      tileX: clamp(Math.floor(finiteOr(f.tileX, 0)), 0, MAP_GRID_SIZE - 1),
      tileY: clamp(Math.floor(finiteOr(f.tileY, 0)), 0, MAP_GRID_SIZE - 1),
      sellingPrice: Math.max(0, finiteOr(f.sellingPrice, 10)),
      adBudget: Math.max(0, roundCurrency(finiteOr(f.adBudget, 0))),
      inventoryLevel: Math.max(0, roundCurrency(finiteOr(f.inventoryLevel, 0))),
      inventoryCapacity: Math.max(0, roundCurrency(finiteOr(f.inventoryCapacity, 0))),
      qualityRating: clamp(finiteOr(f.qualityRating, 50), 1, 100),
      brandRating: clamp(finiteOr(f.brandRating, 50), 1, 100),
      units: (f.units || []).map((u, idx) => ({
        ...u,
        slotIndex: typeof u.slotIndex === 'number' ? clamp(Math.floor(u.slotIndex), 0, 8) : idx % 9,
      })),
    };
  }

  // Upgrade legacy 14x14 or 24x24 maps seamlessly to expanded 32x32 grid in O(F + W*H)
  const expectedTiles = MAP_GRID_SIZE * MAP_GRID_SIZE;
  let rawParcels: MapParcel[];

  if (Array.isArray(parsed.mapParcels) && parsed.mapParcels.length === expectedTiles) {
    rawParcels = parsed.mapParcels.map(p => ({
      ...p,
      trafficIndex: typeof p.trafficIndex === 'number' ? clamp(p.trafficIndex, 0, 100) : 20,
      landValue: Math.max(0, finiteOr(p.landValue, 88000)),
    }));
  } else {
    const coordMap = indexFacilitiesByCoord(hydratedFacilities, MAP_GRID_SIZE);
    rawParcels = generateCityParcels(MAP_GRID_SIZE).map(p => {
      const occupying = coordMap.get(p.y * MAP_GRID_SIZE + p.x);
      return occupying
        ? { ...p, facilityId: occupying.id, ownerCompanyId: occupying.companyId }
        : p;
    });
  }

  const hasCivic = Object.values(hydratedFacilities).some(
    f => f.type === 'civic_housing' || f.companyId === GOVT_OWNER_ID
  );
  if (!hasCivic) {
    Object.values(fresh.facilities).forEach(ff => {
      if (ff.type === 'civic_housing') {
        const idx = ff.tileY * MAP_GRID_SIZE + ff.tileX;
        if (idx >= 0 && idx < rawParcels.length && !rawParcels[idx].facilityId && rawParcels[idx].isZoneAllowed) {
          hydratedFacilities[ff.id] = ff;
          rawParcels[idx] = {
            ...rawParcels[idx],
            facilityId: ff.id,
            ownerCompanyId: GOVT_OWNER_ID,
          };
        }
      }
    });
  }

  const hasResident = Object.values(hydratedFacilities).some(
    f => f.type === 'resident_house' || f.companyId === RESIDENT_OWNER_ID
  );
  if (!hasResident) {
    Object.values(fresh.facilities).forEach(rf => {
      if (rf.type === 'resident_house') {
        const idx = rf.tileY * MAP_GRID_SIZE + rf.tileX;
        if (idx >= 0 && idx < rawParcels.length && !rawParcels[idx].facilityId && rawParcels[idx].isZoneAllowed) {
          hydratedFacilities[rf.id] = rf;
          rawParcels[idx] = {
            ...rawParcels[idx],
            facilityId: rf.id,
            ownerCompanyId: RESIDENT_OWNER_ID,
            landStatus: 'resident',
          };
        }
      }
    });
  }

  const parcelsWithDeposits = rawParcels.some(p => p.resourceDeposit)
    ? rawParcels
    : seedResourceDepositsOnParcels(rawParcels);

  const parcels = recalculateCityTraffic(parcelsWithDeposits, hydratedFacilities);
  const hydratedCityPop = finiteOr(parsed.city?.population, fresh.city.population);
  const housingSummary = computeHousingSummary(hydratedCityPop, hydratedFacilities);

  return {
    ...fresh,
    ...parsed,
    currentTick: Math.max(0, Math.floor(finiteOr(parsed.currentTick ?? 0, 0))),
    companies: hydratedCompanies,
    facilities: hydratedFacilities,
    mapParcels: parcels,
    macro: {
      ...fresh.macro,
      ...(parsed.macro || {}),
      consumerPriceIndex: finiteOr(parsed.macro?.consumerPriceIndex, fresh.macro.consumerPriceIndex || 100),
      unemploymentRate: finiteOr(parsed.macro?.unemploymentRate, fresh.macro.unemploymentRate || 5.15),
      realWageRate: finiteOr(parsed.macro?.realWageRate, fresh.macro.realWageRate || 40.8),
    },
    city: {
      ...fresh.city,
      ...(parsed.city || {}),
      housingSupply: housingSummary.housingSupply,
      residentHousesCount: housingSummary.residentHousesCount,
      productStats: {
        ...fresh.city.productStats,
        ...((parsed.city && parsed.city.productStats) || {}),
      },
    },
  };
}

export function saveGameStateToStorage(state: SimulationState, slotKey = AUTO_SAVE_KEY): boolean {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(slotKey, serialized);
    return true;
  } catch (e) {
    console.error('Failed to save state to localStorage:', e);
    return false;
  }
}

export function loadGameStateFromStorage(slotKey = AUTO_SAVE_KEY): SimulationState | null {
  try {
    const raw = localStorage.getItem(slotKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return hydrateState(parsed);
  } catch (e) {
    console.error('Failed to load state from localStorage:', e);
    return null;
  }
}

export function exportStateAsJSON(state: SimulationState): string {
  return JSON.stringify(state, null, 2);
}

export function importStateFromJSON(jsonString: string): SimulationState | null {
  try {
    if (jsonString.length > 2_000_000) return null;
    const parsed = JSON.parse(jsonString);
    return hydrateState(parsed);
  } catch (e) {
    console.error('Failed to parse imported JSON state:', e);
    return null;
  }
}
