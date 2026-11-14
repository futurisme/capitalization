/**
 * Core type definitions for Capitalism Lab 13 Simulation Engine
 */

export type ProductId =
  | 'wheat'
  | 'livestock'
  | 'crude_oil'
  | 'iron_ore'
  | 'silicon'
  | 'timber'
  | 'coffee_bean'
  | 'flour'
  | 'steel'
  | 'plastic'
  | 'electronic_chip'
  | 'fabric'
  | 'battery_cell'
  | 'lumber'
  | 'solar_panel'
  | 'bread'
  | 'soft_drink'
  | 'roasted_coffee'
  | 'fashion_apparel'
  | 'furniture'
  | 'medicine'
  | 'smartphone'
  | 'laptop'
  | 'automobile'
  | 'ev_suv'
  | 'software_os'
  | 'ai_enterprise'
  | 'fintech_app';

export type ProductCategory = 'raw' | 'intermediate' | 'consumer' | 'digital';

export interface ProductAppealWeights {
  price: number;   // 0.0 - 1.0
  quality: number; // 0.0 - 1.0
  brand: number;   // 0.0 - 1.0
}

export interface ProductRecipe {
  id: ProductId;
  name: string;
  category: ProductCategory;
  unit: string;
  icon: string;
  baseCost: number;
  basePrice: number;
  seaportPrice: number;
  elasticity: number;
  demandFactor: number;
  appealWeights: ProductAppealWeights;
  inputs?: { productId: ProductId; amount: number }[];
  description: string;
}

export type FacilityType =
  | 'store_convenience'
  | 'store_electronics'
  | 'store_department'
  | 'store_auto'
  | 'store_pharmacy'
  | 'apartment_complex'
  | 'commercial_tower'
  | 'civic_housing'
  | 'resident_house'
  | 'factory_assembly'
  | 'factory_processing'
  | 'warehouse_logistics'
  | 'farm_agriculture'
  | 'mine_extraction'
  | 'power_plant_green'
  | 'rd_center'
  | 'tech_software'
  | 'media_telecom'
  | 'corporate_hq';

export type ResourceDepositType =
  | 'iron_ore'
  | 'crude_oil'
  | 'silicon'
  | 'timber'
  | 'fertile_soil';

export interface ResourceDeposit {
  type: ResourceDepositType;
  richness: number; // 45..100 quality/yield bonus score
  discovered: boolean;
}

export type UnitType = 'purchasing' | 'manufacturing' | 'sales' | 'advertising' | 'rd' | 'inventory';

export interface InternalUnit {
  id: string;
  slotIndex: number; // 0 to 8 inside 3x3 layout matrix
  type: UnitType;
  name: string;
  targetProductId?: ProductId;
  supplierFacilityId?: string; // 'seaport' | specific facilityId
  level: number; // 1 to 5
  capacity: number; // Units processed per month
  currentInventory: number;
  maxInventory: number;
  monthlyCost: number;
  efficiency: number; // 0.0 - 1.2
}

export interface Facility {
  id: string;
  companyId: string;
  cityId?: string; // City where facility is located (defaults to primary city)
  name: string;
  type: FacilityType;
  tileX: number;
  tileY: number;
  level: number;
  createdMonth: number;

  units: InternalUnit[];

  sellingPrice: number;
  adBudget: number;
  monthlyMaintenance: number;
  autoPricing?: boolean;

  monthlyProduction: number;
  monthlySales: number;
  monthlyRevenue: number;
  monthlyCostOfGoods: number;
  monthlyProfit: number;
  lastMonthUnitsSold: number;
  inventoryLevel: number;
  inventoryCapacity: number;
  qualityRating: number;
  brandRating: number;
  supplySourceLabel?: string;
  housingTier?: 1 | 2 | 3;
  residentFamilies?: number;
  depositBonusPct?: number;
}

export type ExecutiveRole = 'COO' | 'CTO' | 'CMO' | 'CFO';

export interface ExecutiveOfficer {
  id: string;
  role: ExecutiveRole;
  name: string;
  specialty: string;
  skillRating: number; // 65 to 98
  monthlySalary: number;
  hired: boolean;
  sourceEntityId?: string; // Linked AI Investor entity id if recruited from 100-entity pool
}

export type BrandStrategy = 'generic' | 'range' | 'corporate';

export interface SubsidiaryDirective {
  dividendPayoutRatio: number; // 0.0 to 0.90
  rdFocusRatio: number; // 0.0 to 0.30
  expansionMode: 'aggressive' | 'balanced' | 'cash_cow';
  priceStrategy: 'discount' | 'market' | 'premium';
  allowSupplySync: boolean;
}

export interface Company {
  id: string;
  name: string;
  ticker: string;
  color: string;
  accentColor: string;
  isPlayer: boolean;
  ceoName: string;
  ceoAvatar: string;
  ceoIcon?: string;
  ceoEntityId?: string;
  lastConstructedTick?: number;
  personality?:
    | 'expansionist'
    | 'quality_first'
    | 'supply_monopolist'
    | 'tech_innovator'
    | 'brand_titan'
    | 'real_estate_mogul'
    | 'healthcare_pioneer';
  sectorFocus?: string;
  brandStrategy: BrandStrategy;
  corporateBrandRating: number;

  // Subsidiary & IPO / Board Ownership
  parentCompanyId?: string | null;
  isPublic?: boolean;
  ipoMonth?: number;
  subsidiaryDirective?: SubsidiaryDirective;

  executives: ExecutiveOfficer[];

  cash: number;
  debt: number;
  bondDebt: number;
  monthlyInterestRate: number;

  sharesOutstanding: number;
  treasuryShares: number;
  stockPrice: number;
  sharePriceHistory: number[];
  dividendPerShare: number;

  shareholdings: Record<string, number>;
  techLevels: Record<ProductId, number>;
  activeResearchProduct?: ProductId;

  history: {
    months: string[];
    revenue: number[];
    netProfit: number[];
    cash: number[];
    marketCap: number[];
  };

  facilitiesCount: number;
  totalAssets: number;
  bookValue: number;
  marketCap: number;
  lastMonthRevenue: number;
  lastMonthNetProfit: number;
  peRatio: number;
  marketSharePercentage: number;
}

export type AiEntityRole =
  | 'investor'
  | 'ceo'
  | 'c_suite'
  | 'mayor'
  | 'minister_of_labor'
  | 'president';

export interface AiPersonEntity {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: AiEntityRole;
  specialty: 'finance' | 'operations' | 'technology' | 'marketing' | 'governance';
  ambition: 'empire_builder' | 'activist_investor' | 'public_servant' | 'tech_visionary';
  cash: number;
  portfolio: Record<string, number>; // companyId -> shares owned
  netWorth: number;
  financeSkill: number;
  opsSkill: number;
  rdSkill: number;
  marketingSkill: number;
  politicalClout: number;
  companyId?: string;
  executiveRole?: ExecutiveRole;
  governedCityId?: string;
  lastActionMonth: number;
  careerHistory: string[];
}

export interface GovernmentPolicyLog {
  id: string;
  month: number;
  actorName: string;
  roleTitle: string;
  summary: string;
}

export interface GovernmentState {
  presidentEntityId?: string;
  presidentName: string;
  ministerOfLaborEntityId?: string;
  ministerOfLaborName: string;
  corporateTaxRate: number; // e.g., 0.15
  dividendTaxRate: number; // e.g., 0.10
  minimumWageFloor: number; // e.g., 3200
  rdSubsidyRate: number; // e.g., 0.15
  laborUnionStrength: number; // 10 - 90
  nationalApproval: number; // 20 - 95
  nextElectionTick: number;
  policyLog: GovernmentPolicyLog[];
}

export type EconomicCyclePhase = 'boom' | 'normal' | 'recession' | 'recovery';

export interface MacroEconomy {
  cyclePhase: EconomicCyclePhase;
  gdpGrowthRate: number;
  inflationRate: number;
  centralBankRate: number;
  importTariffRate: number;
  monthsInPhase: number;
  consumerPriceIndex?: number;
  unemploymentRate?: number;
  realWageRate?: number;
}

export type CityBiome =
  | 'coastal_metro'
  | 'industrial_heartland'
  | 'highland_mining'
  | 'agri_valley'
  | 'tech_corridor';

export interface CityMarket {
  id?: string;
  name: string;
  biome?: CityBiome;
  population: number;
  growthRate: number;
  averageWage: number;
  consumerConfidence: number;
  housingSupply?: number;
  residentHousesCount?: number;
  gridSize?: number;
  mapParcels?: MapParcel[];
  mayorEntityId?: string;
  mayorName?: string;
  cityTaxRate?: number;
  publicHousingBudget?: number;
  landGrantDiscount?: number;
  approvalRating?: number;
  foundedMonth?: number;

  productStats: Record<ProductId, {
    monthlyDemand: number;
    monthlySupply: number;
    averageMarketPrice: number;
    playerMarketShare: number;
    satisfactionRate: number;
    seaportImportShare: number;
  }>;
}

export interface StockTransaction {
  id: string;
  month: number;
  buyerCompanyId: string;
  targetCompanyId: string;
  action: 'buy' | 'sell' | 'issue' | 'merger' | 'ipo' | 'spinoff' | 'takeover';
  shares: number;
  pricePerShare: number;
  totalCost: number;
}

export interface MapParcel {
  x: number;
  y: number;
  terrainType: 'grass' | 'road' | 'water' | 'pavement' | 'industrial_zone';
  terrainVariant?: 'meadow' | 'forest' | 'fertile' | 'rocky' | 'plaza' | 'concrete' | 'harbor';
  facilityId?: string;
  ownerCompanyId?: string;
  isZoneAllowed: boolean;
  landValue: number;
  trafficIndex: number;
  districtName?: string;
  resourceDeposit?: ResourceDeposit;
  landStatus?: 'public' | 'for_sale' | 'corporate' | 'resident';
}

export interface SimulationState {
  currentTick: number;
  isPaused: boolean;
  simSpeed: 1 | 2 | 5;
  dateString: string;

  playerCompanyId: string;
  companies: Record<string, Company>;
  facilities: Record<string, Facility>;
  city: CityMarket; // Active/primary city alias kept synchronized with cities[activeCityId]
  cities?: Record<string, CityMarket>;
  cityOrder?: string[];
  activeCityId?: string;
  macro: MacroEconomy;
  mapParcels: MapParcel[]; // Active city parcels alias kept synchronized with active city
  stockTransactions: StockTransaction[];
  aiEntities?: Record<string, AiPersonEntity>;
  aiEntityOrder?: string[];
  government?: GovernmentState;

  newsFeed: {
    id: string;
    month: number;
    category: 'economy' | 'competitor' | 'finance' | 'rnd' | 'politics';
    title: string;
    detail: string;
  }[];
}
