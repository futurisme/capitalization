/**
 * Core type definitions for Capitalism Lab 13 Mobile Simulation Engine
 */

export type ProductId =
  | 'wheat'
  | 'livestock'
  | 'crude_oil'
  | 'iron_ore'
  | 'silicon'
  | 'flour'
  | 'steel'
  | 'plastic'
  | 'electronic_chip'
  | 'fabric'
  | 'battery_cell'
  | 'bread'
  | 'soft_drink'
  | 'fashion_apparel'
  | 'medicine'
  | 'smartphone'
  | 'laptop'
  | 'automobile'
  | 'software_os'
  | 'ai_enterprise';

export type ProductCategory = 'raw' | 'intermediate' | 'consumer' | 'digital';

export interface ProductAppealWeights {
  price: number;   // 0.0 - 1.0 (e.g. 0.55 for bread)
  quality: number; // 0.0 - 1.0 (e.g. 0.50 for smartphone)
  brand: number;   // 0.0 - 1.0 (e.g. 0.50 for fashion)
}

export interface ProductRecipe {
  id: ProductId;
  name: string;
  category: ProductCategory;
  unit: string;
  icon: string;
  baseCost: number;
  basePrice: number;
  seaportPrice: number; // Global seaport import baseline
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
  slotIndex: number; // 0 to 8 inside the iconic 3x3 layout matrix
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
  name: string;
  type: FacilityType;
  tileX: number;
  tileY: number;
  level: number;
  createdMonth: number;

  // Operational units (Capitalism Lab 3x3 unit matrix)
  units: InternalUnit[];

  // Commercial settings
  sellingPrice: number;
  adBudget: number;
  monthlyMaintenance: number;
  autoPricing?: boolean; // Managed by COO or user

  // Monthly metrics
  monthlyProduction: number;
  monthlySales: number;
  monthlyRevenue: number;
  monthlyCostOfGoods: number;
  monthlyProfit: number;
  lastMonthUnitsSold: number;
  inventoryLevel: number;
  inventoryCapacity: number;
  qualityRating: number; // 0 to 100
  brandRating: number; // 0 to 100
  supplySourceLabel?: string; // 'Internal' | 'Seaport' | 'B2B'
  housingTier?: 1 | 2 | 3; // For resident_house structures (1=Cottage, 2=Townhouse, 3=Residence)
  residentFamilies?: number; // Number of resident households in residential structure
  depositBonusPct?: number; // Extraction bonus when built on matching natural resource deposit
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
}

export type BrandStrategy = 'generic' | 'range' | 'corporate';

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

  // Executive C-Suite Team
  executives: ExecutiveOfficer[];

  // Financial accounts
  cash: number;
  debt: number;
  bondDebt: number;
  monthlyInterestRate: number;

  // Stock Information
  sharesOutstanding: number;
  treasuryShares: number;
  stockPrice: number;
  sharePriceHistory: number[];
  dividendPerShare: number;

  // Shareholding portfolio: companyId -> shares owned
  shareholdings: Record<string, number>;

  // R&D Tech Levels (ProductId -> Tech Level 1 to 100)
  techLevels: Record<ProductId, number>;
  activeResearchProduct?: ProductId;

  // Historical Records (last 12 months)
  history: {
    months: string[];
    revenue: number[];
    netProfit: number[];
    cash: number[];
    marketCap: number[];
  };

  // Aggregated current stats
  facilitiesCount: number;
  totalAssets: number;
  bookValue: number;
  marketCap: number;
  lastMonthRevenue: number;
  lastMonthNetProfit: number;
  peRatio: number;
  marketSharePercentage: number;
}

export type EconomicCyclePhase = 'boom' | 'normal' | 'recession' | 'recovery';

export interface MacroEconomy {
  cyclePhase: EconomicCyclePhase;
  gdpGrowthRate: number;      // e.g., +3.8% or -1.4%
  inflationRate: number;      // e.g., 2.4%
  centralBankRate: number;    // Annual % rate (e.g., 4.5%)
  importTariffRate: number;   // % added to seaport prices
  monthsInPhase: number;
  consumerPriceIndex?: number; // Cumulative CPI (base 100.0 at start)
  unemploymentRate?: number;   // City unemployment % (e.g., 5.2%)
  realWageRate?: number;       // Real wage index adjusted for CPI
}

export interface CityMarket {
  name: string;
  population: number;
  growthRate: number;
  averageWage: number;
  consumerConfidence: number; // 0 to 100
  housingSupply?: number;     // Total citizen housing capacity across civic, private apts & resident houses
  residentHousesCount?: number; // Active automated resident-owned homes

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
  action: 'buy' | 'sell' | 'issue' | 'merger';
  shares: number;
  pricePerShare: number;
  totalCost: number;
}

export interface MapParcel {
  x: number;
  y: number;
  terrainType: 'grass' | 'road' | 'water' | 'pavement' | 'industrial_zone';
  facilityId?: string;
  ownerCompanyId?: string;
  isZoneAllowed: boolean;
  landValue: number;
  trafficIndex: number; // 0 to 100 CapLab crowd & foot traffic score
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
  city: CityMarket;
  macro: MacroEconomy;
  mapParcels: MapParcel[];
  stockTransactions: StockTransaction[];

  newsFeed: {
    id: string;
    month: number;
    category: 'economy' | 'competitor' | 'finance' | 'rnd';
    title: string;
    detail: string;
  }[];
}
