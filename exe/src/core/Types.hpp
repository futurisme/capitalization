#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace caplab {

enum class ProductId : uint8_t {
    Wheat = 0,
    Livestock,
    CrudeOil,
    IronOre,
    Silicon,
    Flour,
    Steel,
    Plastic,
    ElectronicChip,
    Fabric,
    BatteryCell,
    Bread,
    SoftDrink,
    FashionApparel,
    Medicine,
    Smartphone,
    Laptop,
    Automobile,
    SoftwareOs,
    AiEnterprise,
    Count
};

constexpr size_t PRODUCT_COUNT = static_cast<size_t>(ProductId::Count);

enum class ProductCategory : uint8_t {
    Raw = 0,
    Intermediate,
    Consumer,
    Digital
};

struct ProductAppealWeights {
    double price = 0.45;
    double quality = 0.30;
    double brand = 0.25;
};

struct ProductInput {
    ProductId productId;
    double amount;
};

struct ProductRecipe {
    ProductId id;
    const char* key;
    const char* name;
    ProductCategory category;
    const char* unit;
    double baseCost;
    double basePrice;
    double seaportPrice;
    double elasticity;
    double demandFactor;
    ProductAppealWeights appealWeights;
    std::vector<ProductInput> inputs;
    const char* description;
};

enum class FacilityType : uint8_t {
    StoreConvenience = 0,
    StoreElectronics,
    StoreDepartment,
    StoreAuto,
    StorePharmacy,
    ApartmentComplex,
    CommercialTower,
    CivicHousing,
    FactoryAssembly,
    FactoryProcessing,
    WarehouseLogistics,
    FarmAgriculture,
    MineExtraction,
    PowerPlantGreen,
    RdCenter,
    TechSoftware,
    MediaTelecom,
    CorporateHq,
    Count
};

constexpr size_t FACILITY_TYPE_COUNT = static_cast<size_t>(FacilityType::Count);

enum class FacilityCategory : uint8_t {
    Store = 0,
    RealEstate,
    Factory,
    Raw,
    Digital,
    Corporate
};

enum class UnitType : uint8_t {
    Purchasing = 0,
    Manufacturing,
    Sales,
    Advertising,
    Rd,
    Inventory
};

struct InternalUnit {
    std::string id;
    int slotIndex = 0; // 0..8 in 3x3 matrix
    UnitType type = UnitType::Sales;
    std::string name;
    bool hasTargetProduct = false;
    ProductId targetProductId = ProductId::Bread;
    std::string supplierFacilityId; // "seaport" or specific facilityId
    int level = 1;
    int capacity = 0;
    int currentInventory = 0;
    int maxInventory = 0;
    int monthlyCost = 0;
    double efficiency = 1.0;
};

struct Facility {
    std::string id;
    std::string companyId;
    std::string name;
    FacilityType type = FacilityType::StoreConvenience;
    int tileX = 0;
    int tileY = 0;
    int level = 1;
    int createdMonth = 0;

    std::vector<InternalUnit> units;

    double sellingPrice = 10.0;
    int adBudget = 0;
    int monthlyMaintenance = 0;
    bool autoPricing = false;

    int monthlyProduction = 0;
    int monthlySales = 0;
    int monthlyRevenue = 0;
    int monthlyCostOfGoods = 0;
    int monthlyProfit = 0;
    int lastMonthUnitsSold = 0;
    int inventoryLevel = 0;
    int inventoryCapacity = 0;
    int qualityRating = 50;
    int brandRating = 50;
    std::string supplySourceLabel;
};

enum class ExecutiveRole : uint8_t {
    COO = 0,
    CTO,
    CMO,
    CFO
};

struct ExecutiveOfficer {
    std::string id;
    ExecutiveRole role = ExecutiveRole::COO;
    std::string name;
    std::string specialty;
    int skillRating = 85;
    int monthlySalary = 30000;
    bool hired = false;
};

enum class BrandStrategy : uint8_t {
    Generic = 0,
    Range,
    Corporate
};

enum class AIPersonality : uint8_t {
    None = 0,
    Expansionist,
    QualityFirst,
    SupplyMonopolist,
    TechInnovator,
    BrandTitan,
    RealEstateMogul,
    HealthcarePioneer
};

struct CompanyHistory {
    std::vector<std::string> months;
    std::vector<int> revenue;
    std::vector<int> netProfit;
    std::vector<int64_t> cash;
    std::vector<int64_t> marketCap;
};

struct Company {
    std::string id;
    std::string name;
    std::string ticker;
    uint32_t colorHex = 0x0284c7;
    uint32_t accentColorHex = 0x38bdf8;
    bool isPlayer = false;
    std::string ceoName;
    std::string ceoAvatar;
    std::string ceoIcon;
    int lastConstructedTick = -99;
    AIPersonality personality = AIPersonality::None;
    std::string sectorFocus;
    BrandStrategy brandStrategy = BrandStrategy::Corporate;
    int corporateBrandRating = 50;

    std::vector<ExecutiveOfficer> executives;

    int64_t cash = 0;
    int64_t debt = 0;
    int64_t bondDebt = 0;
    double monthlyInterestRate = 0.0058;

    int64_t sharesOutstanding = 1000000;
    int64_t treasuryShares = 0;
    double stockPrice = 15.0;
    std::vector<double> sharePriceHistory;
    double dividendPerShare = 0.05;

    std::unordered_map<std::string, int64_t> shareholdings;
    std::array<int, PRODUCT_COUNT> techLevels{};
    ProductId activeResearchProduct = ProductId::Smartphone;

    CompanyHistory history;

    int facilitiesCount = 0;
    int64_t totalAssets = 0;
    int64_t bookValue = 0;
    int64_t marketCap = 0;
    int lastMonthRevenue = 0;
    int lastMonthNetProfit = 0;
    double peRatio = 0.0;
    int marketSharePercentage = 0;
};

enum class EconomicCyclePhase : uint8_t {
    Boom = 0,
    Normal,
    Recession,
    Recovery
};

struct MacroEconomy {
    EconomicCyclePhase cyclePhase = EconomicCyclePhase::Normal;
    double gdpGrowthRate = 2.9;
    double inflationRate = 2.3;
    double centralBankRate = 4.5;
    double importTariffRate = 0.05;
    int monthsInPhase = 2;
};

struct ProductMarketStats {
    int monthlyDemand = 0;
    int monthlySupply = 0;
    double averageMarketPrice = 0.0;
    int playerMarketShare = 0;
    int satisfactionRate = 0;
    int seaportImportShare = 100;
};

struct CityMarket {
    std::string name;
    int64_t population = 2150000;
    double growthRate = 0.003;
    int averageWage = 4800;
    int consumerConfidence = 82;
    std::array<ProductMarketStats, PRODUCT_COUNT> productStats{};
};

enum class StockAction : uint8_t {
    Buy = 0,
    Sell,
    Issue,
    Merger
};

struct StockTransaction {
    std::string id;
    int month = 0;
    std::string buyerCompanyId;
    std::string targetCompanyId;
    StockAction action = StockAction::Buy;
    int64_t shares = 0;
    double pricePerShare = 0.0;
    int64_t totalCost = 0;
};

enum class TerrainType : uint8_t {
    Grass = 0,
    Road,
    Water,
    Pavement,
    IndustrialZone
};

struct MapParcel {
    int x = 0;
    int y = 0;
    TerrainType terrainType = TerrainType::Grass;
    std::string facilityId;
    std::string ownerCompanyId;
    bool isZoneAllowed = true;
    int64_t landValue = 88000;
    int trafficIndex = 20;
    std::string districtName;
};

enum class NewsCategory : uint8_t {
    Economy = 0,
    Competitor,
    Finance,
    Rnd
};

struct NewsItem {
    std::string id;
    int month = 0;
    NewsCategory category = NewsCategory::Economy;
    std::string title;
    std::string detail;
};

struct SimulationState {
    int currentTick = 0;
    bool isPaused = false;
    int simSpeed = 1; // 1, 2, or 5
    std::string dateString = "Jan 2026";

    std::string playerCompanyId = "comp_player";
    std::vector<std::string> companyOrder; // preserves deterministic UI & eval ordering
    std::unordered_map<std::string, Company> companies;
    std::vector<std::string> facilityOrder;
    std::unordered_map<std::string, Facility> facilities;

    CityMarket city;
    MacroEconomy macro;
    std::vector<MapParcel> mapParcels;
    std::vector<StockTransaction> stockTransactions;
    std::vector<NewsItem> newsFeed;
};

} // namespace caplab
