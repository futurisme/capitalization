#include "SaveSystem.hpp"
#include "FacilityUnits.hpp"
#include "SpatialGrid.hpp"
#include "../core/JsonSerializer.hpp"
#include "../core/PrecisionMath.hpp"

#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>

namespace caplab::save {

namespace {

std::vector<ExecutiveOfficer> create_default_executives(bool isHiredFirst = false) {
    auto execs = get_available_executives();
    for (size_t i = 0; i < execs.size(); ++i) {
        execs[i].hired = (isHiredFirst && i == 0);
    }
    return execs;
}

struct CivicCoord {
    int x;
    int y;
    const char* name;
};

constexpr CivicCoord CIVIC_HOUSING_COORDS[8] = {
    {15, 17, "Rusunawa Pemkot Sentral"},
    {18, 19, "Apartemen Rakyat Metro Selatan"},
    {11, 17, "Perumahan Pemkot Barat"},
    {23, 11, "Rusunawa Timur Jaya"},
    {24, 18, "Kompleks Hunian Pelabuhan"},
    {8,  23, "Perumahan Suburban Hijau"},
    {16, 24, "Apartemen Pemkot Anggrek"},
    {22, 23, "Hunian Terpadu Harapan"},
};

std::optional<std::pair<int, int>> get_initial_ai_spawn_coord(std::string_view id) noexcept {
    if (id == "comp_apex")  return std::pair{18, 15};
    if (id == "comp_nova")  return std::pair{19, 11};
    if (id == "comp_omni")  return std::pair{8, 8};
    if (id == "comp_land")  return std::pair{15, 18};
    if (id == "comp_medx")  return std::pair{16, 14};
    if (id == "comp_agro")  return std::pair{10, 4};
    if (id == "comp_velo")  return std::pair{12, 19};
    if (id == "comp_cloud") return std::pair{20, 14};
    if (id == "comp_media") return std::pair{14, 16};
    return std::nullopt;
}

} // namespace

void push_news_capped(SimulationState& state, NewsItem item) {
    state.newsFeed.insert(state.newsFeed.begin(), std::move(item));
    if (state.newsFeed.size() > 25) state.newsFeed.resize(25);
}

void insert_company(SimulationState& state, Company comp) {
    std::string id = comp.id;
    bool exists = state.companies.contains(id);
    state.companies.insert_or_assign(id, std::move(comp));
    if (!exists) state.companyOrder.push_back(std::move(id));
}

void erase_company(SimulationState& state, const std::string& companyId) {
    state.companies.erase(companyId);
    state.companyOrder.erase(
        std::remove(state.companyOrder.begin(), state.companyOrder.end(), companyId),
        state.companyOrder.end()
    );
}

void insert_facility(SimulationState& state, Facility fac) {
    std::string id = fac.id;
    bool exists = state.facilities.contains(id);
    state.facilities.insert_or_assign(id, std::move(fac));
    if (!exists) state.facilityOrder.push_back(std::move(id));
}

void erase_facility(SimulationState& state, const std::string& facilityId) {
    state.facilities.erase(facilityId);
    state.facilityOrder.erase(
        std::remove(state.facilityOrder.begin(), state.facilityOrder.end(), facilityId),
        state.facilityOrder.end()
    );
}

std::array<int, PRODUCT_COUNT> build_base_tech_map(
    const std::vector<std::pair<ProductId, int>>& overrides
) {
    std::array<int, PRODUCT_COUNT> map{};
    map[static_cast<size_t>(ProductId::Wheat)] = 30;
    map[static_cast<size_t>(ProductId::Livestock)] = 30;
    map[static_cast<size_t>(ProductId::CrudeOil)] = 30;
    map[static_cast<size_t>(ProductId::IronOre)] = 30;
    map[static_cast<size_t>(ProductId::Silicon)] = 30;
    map[static_cast<size_t>(ProductId::Flour)] = 35;
    map[static_cast<size_t>(ProductId::Steel)] = 35;
    map[static_cast<size_t>(ProductId::Plastic)] = 35;
    map[static_cast<size_t>(ProductId::ElectronicChip)] = 40;
    map[static_cast<size_t>(ProductId::Fabric)] = 35;
    map[static_cast<size_t>(ProductId::BatteryCell)] = 38;
    map[static_cast<size_t>(ProductId::Bread)] = 40;
    map[static_cast<size_t>(ProductId::SoftDrink)] = 40;
    map[static_cast<size_t>(ProductId::FashionApparel)] = 40;
    map[static_cast<size_t>(ProductId::Medicine)] = 42;
    map[static_cast<size_t>(ProductId::Smartphone)] = 45;
    map[static_cast<size_t>(ProductId::Laptop)] = 45;
    map[static_cast<size_t>(ProductId::Automobile)] = 35;
    map[static_cast<size_t>(ProductId::SoftwareOs)] = 40;
    map[static_cast<size_t>(ProductId::AiEnterprise)] = 35;
    for (const auto& [pid, val] : overrides) {
        map[static_cast<size_t>(pid)] = val;
    }
    return map;
}

MapParcel* select_parcel_for_zone(
    std::vector<MapParcel>& parcels,
    bool preferIndustrialZone,
    std::optional<std::pair<int, int>> preferredCoord
) {
    if (preferredCoord) {
        MapParcel* exact = spatial::get_parcel_at_mut(parcels, preferredCoord->first, preferredCoord->second);
        if (exact &&
            exact->facilityId.empty() &&
            exact->isZoneAllowed &&
            exact->terrainType != TerrainType::Water &&
            exact->terrainType != TerrainType::Road) {
            return exact;
        }
    }

    MapParcel* firstEmpty = nullptr;
    std::vector<MapParcel*> industrialList;
    MapParcel* bestCommercial = nullptr;
    int bestTraffic = -1;

    for (auto& p : parcels) {
        if (!p.facilityId.empty() || !p.isZoneAllowed ||
            p.terrainType == TerrainType::Water || p.terrainType == TerrainType::Road) {
            continue;
        }
        if (!firstEmpty) firstEmpty = &p;

        if (preferIndustrialZone) {
            if (p.terrainType == TerrainType::IndustrialZone) industrialList.push_back(&p);
        } else if (p.terrainType == TerrainType::Pavement || p.terrainType == TerrainType::Grass) {
            if (p.trafficIndex > bestTraffic) {
                bestTraffic = p.trafficIndex;
                bestCommercial = &p;
            }
        }
    }

    if (preferIndustrialZone && !industrialList.empty()) {
        const size_t idx = static_cast<size_t>(std::floor(static_cast<double>(industrialList.size() - 1) * 0.35));
        return industrialList[std::min(idx, industrialList.size() - 1)];
    }
    if (bestCommercial) return bestCommercial;
    return firstEmpty;
}

SpawnedCompanyResult create_company_and_starter_from_template(
    const AICorporateTemplate& tpl,
    std::vector<MapParcel>& parcels,
    int currentTick,
    const std::string& overrideId,
    std::optional<std::pair<int, int>> preferredCoord,
    const std::string& dateString,
    bool isNewEntrant
) {
    const std::string compId = overrideId.empty() ? tpl.id : overrideId;
    const auto& spec = get_facility_spec(tpl.starterFacilityType);
    MapParcel* parcel = select_parcel_for_zone(parcels, tpl.preferIndustrialZone, preferredCoord);
    const auto& prod = get_product(tpl.starterProduct);

    std::optional<Facility> starterFacility;
    if (parcel) {
        std::string facId = "fac_" + compId + "_init_" + std::to_string(currentTick);
        auto units = create_default_units_for_facility(tpl.starterFacilityType, tpl.starterProduct);
        const bool isStore = is_store_facility(tpl.starterFacilityType);
        const bool isRD = (tpl.starterFacilityType == FacilityType::RdCenter);
        const bool isMedia = (tpl.starterFacilityType == FacilityType::MediaTelecom);
        const bool isRealEstate =
            (tpl.starterFacilityType == FacilityType::ApartmentComplex ||
             tpl.starterFacilityType == FacilityType::CommercialTower);

        Facility f;
        f.id = facId;
        f.companyId = compId;
        f.name = std::string(spec.name) + " " + tpl.ticker;
        f.type = tpl.starterFacilityType;
        f.tileX = parcel->x;
        f.tileY = parcel->y;
        f.level = 1;
        f.createdMonth = currentTick;
        f.units = std::move(units);
        f.sellingPrice = (isRD || isMedia) ? 0.0 : isRealEstate ? 960.0 : prod.basePrice;
        f.adBudget = isRD ? 0 : (tpl.personality == AIPersonality::BrandTitan ? 12000 : 6000);
        f.monthlyMaintenance = spec.monthlyMaintenance;
        f.monthlyProduction = (isStore || isRD) ? 0 : isRealEstate ? 165 : 6000;
        f.monthlySales = isRD ? 0 : isRealEstate ? 165 : 4200;
        f.monthlyRevenue = isRD ? 0 : isRealEstate ? 158000 : 185000;
        f.monthlyCostOfGoods = isRD ? spec.monthlyMaintenance : isRealEstate ? 38000 : 110000;
        f.monthlyProfit = isRD ? -spec.monthlyMaintenance : isRealEstate ? 82000 : 48000;
        f.lastMonthUnitsSold = isRD ? 0 : isRealEstate ? 165 : 4200;
        f.inventoryLevel = (isRD || isMedia || isRealEstate) ? 0 : 3200;
        f.inventoryCapacity = (isRD || isMedia || isRealEstate) ? 0 : 14000;
        f.qualityRating = (tpl.personality == AIPersonality::QualityFirst) ? 68 : 56;
        f.brandRating = tpl.corporateBrandRating;
        f.supplySourceLabel = isRealEstate ? "Hunian & Sewa Aktif"
            : isStore ? "Pelabuhan Impor" : "Produksi Mandiri";

        parcel->facilityId = facId;
        parcel->ownerCompanyId = compId;
        starterFacility = std::move(f);
    }

    const int64_t facilitiesBook = starterFacility ? spec.constructionCost : 0;
    const int64_t totalAssets = tpl.startingCash + facilitiesBook;
    const int64_t bookValue = std::max<int64_t>(500000, totalAssets - tpl.startingDebt);
    const int64_t marketCap = math::round_currency64(tpl.stockPrice * static_cast<double>(tpl.sharesOutstanding));
    const int64_t founderShares = math::round_currency64(static_cast<double>(tpl.sharesOutstanding) * 0.75);
    const int baseProfit = starterFacility ? starterFacility->monthlyProfit : 32000;
    const int baseRev = starterFacility ? starterFacility->monthlyRevenue : 150000;

    Company c;
    c.id = compId;
    c.name = tpl.name;
    c.ticker = tpl.ticker;
    c.colorHex = tpl.colorHex;
    c.accentColorHex = tpl.accentColorHex;
    c.isPlayer = false;
    c.ceoName = tpl.ceoName;
    c.ceoAvatar = tpl.id;
    c.ceoIcon = tpl.id;
    c.lastConstructedTick = currentTick;
    c.personality = tpl.personality;
    c.sectorFocus = tpl.sectorFocus;
    c.brandStrategy = tpl.brandStrategy;
    c.corporateBrandRating = tpl.corporateBrandRating;
    c.executives = create_default_executives(tpl.personality == AIPersonality::Expansionist);
    c.cash = tpl.startingCash;
    c.debt = tpl.startingDebt;
    c.bondDebt = 0;
    c.monthlyInterestRate = 0.0058;
    c.sharesOutstanding = tpl.sharesOutstanding;
    c.treasuryShares = 0;
    c.stockPrice = tpl.stockPrice;
    c.sharePriceHistory = {
        math::round2(tpl.stockPrice * 0.92),
        math::round2(tpl.stockPrice * 0.96),
        math::round2(tpl.stockPrice * 0.98),
        tpl.stockPrice,
    };
    c.dividendPerShare = 0.04;
    c.shareholdings[compId] = founderShares;
    c.techLevels = build_base_tech_map(tpl.techBoosts);
    c.activeResearchProduct = tpl.starterProduct;

    if (isNewEntrant) {
        c.history.months = { dateString.empty() ? "Baru" : dateString };
        c.history.revenue = { baseRev };
        c.history.netProfit = { baseProfit };
        c.history.cash = { tpl.startingCash };
        c.history.marketCap = { marketCap };
    } else {
        c.history.months = { "Okt 2025", "Nov 2025", "Des 2025" };
        c.history.revenue = { math::round_currency(baseRev * 0.85), math::round_currency(baseRev * 0.92), baseRev };
        c.history.netProfit = { math::round_currency(baseProfit * 0.8), math::round_currency(baseProfit * 0.9), baseProfit };
        c.history.cash = { tpl.startingCash - 200000, tpl.startingCash - 100000, tpl.startingCash };
        c.history.marketCap = {
            math::round_currency64(static_cast<double>(marketCap) * 0.92),
            math::round_currency64(static_cast<double>(marketCap) * 0.96),
            marketCap
        };
    }

    c.facilitiesCount = starterFacility ? 1 : 0;
    c.totalAssets = totalAssets;
    c.bookValue = bookValue;
    c.marketCap = marketCap;
    c.lastMonthRevenue = baseRev;
    c.lastMonthNetProfit = baseProfit;
    c.peRatio = baseProfit > 0
        ? math::round1(static_cast<double>(marketCap) / (static_cast<double>(baseProfit) * 12.0))
        : 18.0;
    c.marketSharePercentage = 8;

    return {std::move(c), std::move(starterFacility)};
}

std::vector<MapParcel> generate_city_parcels(int gridSize) {
    std::vector<MapParcel> parcels;
    parcels.resize(static_cast<size_t>(gridSize) * static_cast<size_t>(gridSize));
    size_t idx = 0;

    for (int y = 0; y < gridSize; ++y) {
        for (int x = 0; x < gridSize; ++x) {
            TerrainType terrain = TerrainType::Grass;
            bool isAllowed = true;
            std::string districtName = "Kawasan Hunian Suburban";

            if (x + y >= gridSize * 2 - 7) {
                terrain = TerrainType::Water;
                isAllowed = false;
                districtName = "Pelabuhan Sungai";
            } else if (x == 5 || y == 5 || x == 13 || y == 13 || x == 21 || y == 21 || x == 27 || y == 27) {
                terrain = TerrainType::Road;
                isAllowed = false;
                districtName = "Jalan Arteri Utama";
            } else if (x <= 12 && y <= 12) {
                terrain = TerrainType::IndustrialZone;
                districtName = "Zona Industri Berat";
            } else if (x >= 6 && x <= 25 && y >= 6 && y <= 25) {
                terrain = TerrainType::Pavement;
                districtName = "Pusat Bisnis CBD";
            }

            const int baseTraffic =
                terrain == TerrainType::Water ? 0
                : terrain == TerrainType::Road ? 34
                : terrain == TerrainType::Pavement ? 24
                : terrain == TerrainType::IndustrialZone ? 12
                : 14;

            MapParcel p;
            p.x = x;
            p.y = y;
            p.terrainType = terrain;
            p.isZoneAllowed = isAllowed;
            p.trafficIndex = baseTraffic;
            p.districtName = std::move(districtName);
            p.landValue = (terrain == TerrainType::Pavement) ? 245000
                : (terrain == TerrainType::IndustrialZone) ? 120000 : 88000;
            parcels[idx++] = std::move(p);
        }
    }
    return parcels;
}

SimulationState generate_default_state() {
    SimulationState state;
    state.currentTick = 0;
    state.isPaused = false;
    state.simSpeed = 1;
    state.dateString = "Jan 2026";
    state.playerCompanyId = "comp_player";
    state.mapParcels = generate_city_parcels(MAP_GRID_SIZE);

    Company player;
    player.id = "comp_player";
    player.name = "Nusantara Holdings";
    player.ticker = "NUSA";
    player.colorHex = 0x0284c7;
    player.accentColorHex = 0x38bdf8;
    player.isPlayer = true;
    player.ceoName = "Konglomerat Anda";
    player.ceoAvatar = "comp_player";
    player.ceoIcon = "comp_player";
    player.lastConstructedTick = 0;
    player.personality = AIPersonality::None;
    player.sectorFocus = "Konglomerasi Multi-Sektor";
    player.brandStrategy = BrandStrategy::Corporate;
    player.corporateBrandRating = 52;
    player.executives = create_default_executives(false);
    player.cash = 10000000;
    player.debt = 0;
    player.bondDebt = 0;
    player.monthlyInterestRate = 0.0058;
    player.sharesOutstanding = 1000000;
    player.treasuryShares = 0;
    player.stockPrice = 15.0;
    player.sharePriceHistory = {14.2, 14.5, 14.8, 15.0};
    player.dividendPerShare = 0.05;
    player.shareholdings["comp_player"] = 1000000;
    player.techLevels = build_base_tech_map();
    player.activeResearchProduct = ProductId::Smartphone;
    player.history.months = {"Okt 2025", "Nov 2025", "Des 2025"};
    player.history.revenue = {150000, 180000, 210000};
    player.history.netProfit = {45000, 55000, 70000};
    player.history.cash = {9800000, 9920000, 10000000};
    player.history.marketCap = {14200000, 14500000, 15000000};
    player.facilitiesCount = 2;
    player.totalAssets = 12500000;
    player.bookValue = 12500000;
    player.marketCap = 15000000;
    player.lastMonthRevenue = 210000;
    player.lastMonthNetProfit = 70000;
    player.peRatio = 17.8;
    player.marketSharePercentage = 14;
    insert_company(state, std::move(player));

    Facility hq;
    hq.id = "fac_player_hq";
    hq.companyId = "comp_player";
    hq.name = "Menara Kantor Pusat NUSA";
    hq.type = FacilityType::CorporateHq;
    hq.tileX = 16;
    hq.tileY = 16;
    hq.level = 1;
    hq.createdMonth = 0;
    hq.monthlyMaintenance = 35000;
    hq.monthlyProfit = -35000;
    hq.qualityRating = 80;
    hq.brandRating = 52;
    insert_facility(state, std::move(hq));

    Facility store;
    store.id = "fac_player_store";
    store.companyId = "comp_player";
    store.name = "Nusantara Mart Utama";
    store.type = FacilityType::StoreConvenience;
    store.tileX = 17;
    store.tileY = 16;
    store.level = 1;
    store.createdMonth = 0;
    store.units = create_default_units_for_facility(FacilityType::StoreConvenience, ProductId::Bread);
    store.sellingPrice = 8.5;
    store.adBudget = 10000;
    store.monthlyMaintenance = 15000;
    store.monthlySales = 28000;
    store.monthlyRevenue = 238000;
    store.monthlyCostOfGoods = 140000;
    store.monthlyProfit = 73000;
    store.lastMonthUnitsSold = 28000;
    store.inventoryLevel = 4500;
    store.inventoryCapacity = 10000;
    store.qualityRating = 55;
    store.brandRating = 60;
    store.supplySourceLabel = "Pelabuhan Impor";
    insert_facility(state, std::move(store));

    for (int idx = 0; idx < 8; ++idx) {
        const auto& cc = CIVIC_HOUSING_COORDS[idx];
        Facility civic;
        civic.id = "fac_civic_" + std::to_string(idx);
        civic.companyId = GOVT_OWNER_ID;
        civic.name = cc.name;
        civic.type = FacilityType::CivicHousing;
        civic.tileX = cc.x;
        civic.tileY = cc.y;
        civic.level = 1;
        civic.createdMonth = 0;
        civic.units = create_default_units_for_facility(FacilityType::CivicHousing);
        civic.sellingPrice = 0;
        civic.adBudget = 0;
        civic.monthlyMaintenance = 0;
        civic.monthlyProduction = 280;
        civic.monthlySales = 280;
        civic.lastMonthUnitsSold = 280;
        civic.qualityRating = 64;
        civic.brandRating = 50;
        civic.supplySourceLabel = "Hunian Pemerintah Kota";
        insert_facility(state, std::move(civic));
    }

    // Mark parcel occupancy O(F)
    for (const auto& fid : state.facilityOrder) {
        const auto& f = state.facilities.at(fid);
        if (auto* p = spatial::get_parcel_at_mut(state.mapParcels, f.tileX, f.tileY, MAP_GRID_SIZE)) {
            p->facilityId = f.id;
            p->ownerCompanyId = f.companyId;
        }
    }

    spatial::recalculate_city_traffic(state.mapParcels, state.facilities);

    const auto& roster = get_initial_ai_roster();
    const size_t spawnCount = std::min<size_t>(roster.size(), MAX_ACTIVE_COMPANIES - 1);
    for (size_t i = 0; i < spawnCount; ++i) {
        const auto& tpl = roster[i];
        auto spawned = create_company_and_starter_from_template(
            tpl,
            state.mapParcels,
            0,
            "",
            get_initial_ai_spawn_coord(tpl.id)
        );
        insert_company(state, std::move(spawned.company));
        if (spawned.facility) {
            insert_facility(state, std::move(*spawned.facility));
        }
    }

    spatial::recalculate_city_traffic(state.mapParcels, state.facilities);

    state.city.name = "Metropolis Raya";
    state.city.population = 2150000;
    state.city.growthRate = 0.003;
    state.city.averageWage = 4800;
    state.city.consumerConfidence = 82;

    auto setStat = [&](ProductId id, int d, int s, double p, int pms, int sat, int imp) {
        state.city.productStats[static_cast<size_t>(id)] = {d, s, p, pms, sat, imp};
    };
    setStat(ProductId::Wheat,          22000, 18000, 120.0,   0, 81, 100);
    setStat(ProductId::Livestock,      12000, 10500, 310.0,   0, 87, 100);
    setStat(ProductId::CrudeOil,       15000, 14000, 75.0,    0, 93, 100);
    setStat(ProductId::IronOre,        18000, 16500, 100.0,   0, 91, 50);
    setStat(ProductId::Silicon,        9000,  7200,  190.0,   0, 80, 100);
    setStat(ProductId::Flour,          16000, 14000, 210.0,   0, 87, 100);
    setStat(ProductId::Steel,          14000, 12500, 340.0,   0, 89, 100);
    setStat(ProductId::Plastic,        13000, 12000, 175.0,   0, 92, 100);
    setStat(ProductId::ElectronicChip, 8000,  6500,  580.0,   0, 81, 100);
    setStat(ProductId::Fabric,         15000, 13500, 145.0,   0, 90, 100);
    setStat(ProductId::BatteryCell,    9500,  6200,  315.0,   0, 65, 100);
    setStat(ProductId::Bread,          75000, 62000, 8.5,    45, 82, 100);
    setStat(ProductId::SoftDrink,      65000, 48000, 14.0,    0, 73, 100);
    setStat(ProductId::FashionApparel, 28000, 22000, 65.0,    0, 78, 100);
    setStat(ProductId::Medicine,       32000, 19500, 36.0,    0, 61, 100);
    setStat(ProductId::Smartphone,     18000, 13000, 650.0,   0, 72, 100);
    setStat(ProductId::Laptop,         9500,  6800,  1150.0,  0, 71, 100);
    setStat(ProductId::Automobile,     1200,  850,   28500.0, 0, 70, 100);
    setStat(ProductId::SoftwareOs,     14000, 4500,  120.0,   0, 32, 100);
    setStat(ProductId::AiEnterprise,   4800,  1200,  380.0,   0, 25, 100);

    state.macro = {EconomicCyclePhase::Normal, 2.9, 2.3, 4.5, 0.05, 2};
    state.newsFeed = {
        {"news_init_1", 0, NewsCategory::Economy,
         "Metropolis Raya Diperluas: Peta 32x32 & Zona Keramaian",
         "Bursa Metropolis Raya beroperasi dengan 10 korporasi lintas sektor—termasuk Real Estate Properti & Farmasi—didukung 8 blok Rusunawa Pemkot pemicu arus pelanggan."},
        {"news_init_2", 0, NewsCategory::Competitor,
         "Persaingan Spesialisasi 9 Konglomerat AI",
         "Masing-masing kompetitor AI memfokuskan modal nyata pada sektor unggulannya—termasuk Sinar Properti (LAND), BioMedika (MEDX), NovaTech (NOVA), dan OmniSupply (OMNI)."}
    };

    return state;
}

std::optional<SimulationState> hydrate_state_from_json(std::string_view jsonText) {
    json::JsonValue root;
    if (!json::parse_simulation_state_json(jsonText, root)) return std::nullopt;

    const auto* companiesVal = root.find("companies");
    const auto* facilitiesVal = root.find("facilities");
    if (!companiesVal || !companiesVal->is_object() || !facilitiesVal || !facilitiesVal->is_object()) {
        return std::nullopt;
    }

    SimulationState fresh = generate_default_state();
    SimulationState out;
    out.currentTick = std::max(0, root.find("currentTick") ? root.find("currentTick")->as_int(0) : 0);
    out.isPaused = root.find("isPaused") ? root.find("isPaused")->as_bool(false) : false;
    int spd = root.find("simSpeed") ? root.find("simSpeed")->as_int(1) : 1;
    out.simSpeed = (spd == 2 || spd == 5) ? spd : 1;
    out.dateString = root.find("dateString") && root.find("dateString")->is_string()
        ? root.find("dateString")->as_string()
        : fresh.dateString;
    out.playerCompanyId = root.find("playerCompanyId") && root.find("playerCompanyId")->is_string()
        ? root.find("playerCompanyId")->as_string()
        : "comp_player";

    const auto& fallbackApexIt = fresh.companies.find("comp_apex");
    const Company& fallbackBase = (fallbackApexIt != fresh.companies.end())
        ? fallbackApexIt->second
        : fresh.companies.at("comp_player");

    for (const auto& [cid, cv] : *companiesVal->as_object()) {
        if (!cv.is_object()) continue;
        auto itFb = fresh.companies.find(cid);
        const Company& fb = (itFb != fresh.companies.end()) ? itFb->second : fallbackBase;

        Company c = fb;
        c.id = cv.find("id") && cv.find("id")->is_string() ? cv.find("id")->as_string() : cid;
        if (auto* v = cv.find("name"); v && v->is_string()) c.name = v->as_string();
        if (auto* v = cv.find("ticker"); v && v->is_string()) c.ticker = v->as_string();
        if (auto* v = cv.find("color"); v && v->is_string()) c.colorHex = parse_css_hex(v->as_string(), fb.colorHex);
        if (auto* v = cv.find("accentColor"); v && v->is_string()) c.accentColorHex = parse_css_hex(v->as_string(), fb.accentColorHex);
        c.isPlayer = (cid == out.playerCompanyId) ? true : (cv.find("isPlayer") ? cv.find("isPlayer")->as_bool(false) : false);
        if (auto* v = cv.find("ceoName"); v && v->is_string()) c.ceoName = v->as_string();
        if (auto* v = cv.find("ceoAvatar"); v && v->is_string()) c.ceoAvatar = v->as_string();
        if (auto* v = cv.find("ceoIcon"); v && v->is_string()) c.ceoIcon = v->as_string();
        if (auto* v = cv.find("lastConstructedTick"); v && v->is_number()) c.lastConstructedTick = v->as_int(fb.lastConstructedTick);
        if (auto* v = cv.find("personality"); v && v->is_string()) {
            c.personality = str_to_ai_personality(v->as_string()).value_or(fb.personality);
        }
        if (auto* v = cv.find("sectorFocus"); v && v->is_string()) c.sectorFocus = v->as_string();
        if (auto* v = cv.find("brandStrategy"); v && v->is_string()) {
            c.brandStrategy = str_to_brand_strategy(v->as_string()).value_or(BrandStrategy::Corporate);
        } else {
            c.brandStrategy = BrandStrategy::Corporate;
        }
        c.corporateBrandRating = math::clamp_val(cv.find("corporateBrandRating") ? cv.find("corporateBrandRating")->as_int(50) : 50, 10, 100);

        if (auto* ev = cv.find("executives"); ev && ev->is_array()) {
            c.executives.clear();
            for (const auto& eo : *ev->as_array()) {
                if (!eo.is_object()) continue;
                ExecutiveOfficer exec;
                exec.id = eo.find("id") ? eo.find("id")->as_string() : "";
                exec.role = eo.find("role") ? str_to_exec_role(eo.find("role")->as_string()).value_or(ExecutiveRole::COO) : ExecutiveRole::COO;
                exec.name = eo.find("name") ? eo.find("name")->as_string() : "";
                exec.specialty = eo.find("specialty") ? eo.find("specialty")->as_string() : "";
                exec.skillRating = eo.find("skillRating") ? eo.find("skillRating")->as_int(85) : 85;
                exec.monthlySalary = eo.find("monthlySalary") ? eo.find("monthlySalary")->as_int(30000) : 30000;
                exec.hired = eo.find("hired") ? eo.find("hired")->as_bool(false) : false;
                c.executives.push_back(std::move(exec));
            }
        } else {
            c.executives = create_default_executives(false);
        }

        c.cash = cv.find("cash") ? cv.find("cash")->as_i64(fb.cash) : fb.cash;
        c.debt = std::max<int64_t>(0, cv.find("debt") ? cv.find("debt")->as_i64(0) : 0);
        c.bondDebt = std::max<int64_t>(0, cv.find("bondDebt") ? cv.find("bondDebt")->as_i64(0) : 0);
        if (auto* v = cv.find("monthlyInterestRate"); v && v->is_number()) c.monthlyInterestRate = v->as_double(0.0058);
        c.sharesOutstanding = std::max<int64_t>(10000, math::round_currency64(cv.find("sharesOutstanding") ? cv.find("sharesOutstanding")->as_double(static_cast<double>(fb.sharesOutstanding)) : static_cast<double>(fb.sharesOutstanding)));
        c.treasuryShares = std::max<int64_t>(0, math::round_currency64(cv.find("treasuryShares") ? cv.find("treasuryShares")->as_double(0.0) : 0.0));
        c.stockPrice = math::clamp_val(cv.find("stockPrice") ? cv.find("stockPrice")->as_double(fb.stockPrice) : fb.stockPrice, 1.0, 250.0);
        c.dividendPerShare = math::clamp_val(cv.find("dividendPerShare") ? cv.find("dividendPerShare")->as_double(0.0) : 0.0, 0.0, 10.0);

        if (auto* sphv = cv.find("sharePriceHistory"); sphv && sphv->is_array()) {
            c.sharePriceHistory.clear();
            for (const auto& item : *sphv->as_array()) c.sharePriceHistory.push_back(item.as_double(c.stockPrice));
        }
        if (auto* shv = cv.find("shareholdings"); shv && shv->is_object()) {
            c.shareholdings.clear();
            for (const auto& [tid, cnt] : *shv->as_object()) {
                c.shareholdings[tid] = cnt.as_i64(0);
            }
        }
        if (auto* tlv = cv.find("techLevels"); tlv && tlv->is_object()) {
            for (const auto& [pk, pv] : *tlv->as_object()) {
                if (auto pid = str_to_product_id(pk)) {
                    c.techLevels[static_cast<size_t>(*pid)] = pv.as_int(35);
                }
            }
        }
        if (auto* arp = cv.find("activeResearchProduct"); arp && arp->is_string()) {
            c.activeResearchProduct = str_to_product_id(arp->as_string()).value_or(fb.activeResearchProduct);
        }
        if (auto* hv = cv.find("history"); hv && hv->is_object()) {
            c.history = {};
            if (auto* arr = hv->find("months"); arr && arr->is_array()) {
                for (const auto& x : *arr->as_array()) c.history.months.push_back(x.as_string());
            }
            if (auto* arr = hv->find("revenue"); arr && arr->is_array()) {
                for (const auto& x : *arr->as_array()) c.history.revenue.push_back(x.as_int(0));
            }
            if (auto* arr = hv->find("netProfit"); arr && arr->is_array()) {
                for (const auto& x : *arr->as_array()) c.history.netProfit.push_back(x.as_int(0));
            }
            if (auto* arr = hv->find("cash"); arr && arr->is_array()) {
                for (const auto& x : *arr->as_array()) c.history.cash.push_back(x.as_i64(0));
            }
            if (auto* arr = hv->find("marketCap"); arr && arr->is_array()) {
                for (const auto& x : *arr->as_array()) c.history.marketCap.push_back(x.as_i64(0));
            }
        }
        if (auto* v = cv.find("facilitiesCount")) c.facilitiesCount = v->as_int(0);
        if (auto* v = cv.find("totalAssets")) c.totalAssets = v->as_i64(0);
        if (auto* v = cv.find("bookValue")) c.bookValue = v->as_i64(100000);
        if (auto* v = cv.find("marketCap")) c.marketCap = v->as_i64(0);
        if (auto* v = cv.find("lastMonthRevenue")) c.lastMonthRevenue = v->as_int(0);
        if (auto* v = cv.find("lastMonthNetProfit")) c.lastMonthNetProfit = v->as_int(0);
        if (auto* v = cv.find("peRatio")) c.peRatio = v->as_double(0.0);
        if (auto* v = cv.find("marketSharePercentage")) c.marketSharePercentage = v->as_int(0);

        insert_company(out, std::move(c));
    }

    if (out.companies.empty()) return std::nullopt;

    for (const auto& [fid, fv] : *facilitiesVal->as_object()) {
        if (!fv.is_object()) continue;
        Facility f;
        f.id = fv.find("id") && fv.find("id")->is_string() ? fv.find("id")->as_string() : fid;
        f.companyId = fv.find("companyId") ? fv.find("companyId")->as_string() : "";
        f.name = fv.find("name") ? fv.find("name")->as_string() : "";
        if (auto* v = fv.find("type"); v && v->is_string()) {
            f.type = str_to_facility_type(v->as_string()).value_or(FacilityType::StoreConvenience);
        }
        f.tileX = math::clamp_val(fv.find("tileX") ? fv.find("tileX")->as_int(0) : 0, 0, MAP_GRID_SIZE - 1);
        f.tileY = math::clamp_val(fv.find("tileY") ? fv.find("tileY")->as_int(0) : 0, 0, MAP_GRID_SIZE - 1);
        f.level = math::clamp_val(fv.find("level") ? fv.find("level")->as_int(1) : 1, 1, 5);
        f.createdMonth = fv.find("createdMonth") ? fv.find("createdMonth")->as_int(0) : 0;

        if (auto* uv = fv.find("units"); uv && uv->is_array()) {
            int idx = 0;
            for (const auto& uo : *uv->as_array()) {
                if (!uo.is_object()) { ++idx; continue; }
                InternalUnit u;
                u.id = uo.find("id") ? uo.find("id")->as_string() : "";
                u.slotIndex = uo.find("slotIndex") && uo.find("slotIndex")->is_number()
                    ? math::clamp_val(uo.find("slotIndex")->as_int(idx % 9), 0, 8)
                    : (idx % 9);
                if (auto* t = uo.find("type"); t && t->is_string()) {
                    u.type = str_to_unit_type(t->as_string()).value_or(UnitType::Sales);
                }
                u.name = uo.find("name") ? uo.find("name")->as_string() : "";
                if (auto* tp = uo.find("targetProductId"); tp && tp->is_string()) {
                    if (auto pid = str_to_product_id(tp->as_string())) {
                        u.hasTargetProduct = true;
                        u.targetProductId = *pid;
                    }
                }
                if (auto* sf = uo.find("supplierFacilityId"); sf && sf->is_string()) {
                    u.supplierFacilityId = sf->as_string();
                }
                u.level = std::max(1, uo.find("level") ? uo.find("level")->as_int(1) : 1);
                u.capacity = uo.find("capacity") ? uo.find("capacity")->as_int(0) : 0;
                u.currentInventory = uo.find("currentInventory") ? uo.find("currentInventory")->as_int(0) : 0;
                u.maxInventory = uo.find("maxInventory") ? uo.find("maxInventory")->as_int(0) : 0;
                u.monthlyCost = uo.find("monthlyCost") ? uo.find("monthlyCost")->as_int(0) : 0;
                u.efficiency = uo.find("efficiency") ? uo.find("efficiency")->as_double(1.0) : 1.0;
                f.units.push_back(std::move(u));
                ++idx;
            }
        }

        f.sellingPrice = std::max(0.0, fv.find("sellingPrice") ? fv.find("sellingPrice")->as_double(10.0) : 10.0);
        f.adBudget = std::max(0, math::round_currency(fv.find("adBudget") ? fv.find("adBudget")->as_double(0.0) : 0.0));
        f.monthlyMaintenance = fv.find("monthlyMaintenance") ? fv.find("monthlyMaintenance")->as_int(0) : 0;
        f.autoPricing = fv.find("autoPricing") ? fv.find("autoPricing")->as_bool(false) : false;
        f.monthlyProduction = fv.find("monthlyProduction") ? fv.find("monthlyProduction")->as_int(0) : 0;
        f.monthlySales = fv.find("monthlySales") ? fv.find("monthlySales")->as_int(0) : 0;
        f.monthlyRevenue = fv.find("monthlyRevenue") ? fv.find("monthlyRevenue")->as_int(0) : 0;
        f.monthlyCostOfGoods = fv.find("monthlyCostOfGoods") ? fv.find("monthlyCostOfGoods")->as_int(0) : 0;
        f.monthlyProfit = fv.find("monthlyProfit") ? fv.find("monthlyProfit")->as_int(0) : 0;
        f.lastMonthUnitsSold = fv.find("lastMonthUnitsSold") ? fv.find("lastMonthUnitsSold")->as_int(0) : 0;
        f.inventoryLevel = std::max(0, math::round_currency(fv.find("inventoryLevel") ? fv.find("inventoryLevel")->as_double(0.0) : 0.0));
        f.inventoryCapacity = std::max(0, math::round_currency(fv.find("inventoryCapacity") ? fv.find("inventoryCapacity")->as_double(0.0) : 0.0));
        f.qualityRating = math::clamp_val(fv.find("qualityRating") ? fv.find("qualityRating")->as_int(50) : 50, 1, 100);
        f.brandRating = math::clamp_val(fv.find("brandRating") ? fv.find("brandRating")->as_int(50) : 50, 1, 100);
        if (auto* v = fv.find("supplySourceLabel"); v && v->is_string()) f.supplySourceLabel = v->as_string();

        insert_facility(out, std::move(f));
    }

    // Map parcels (upgrade legacy <32x32 grids seamlessly)
    const size_t expectedTiles = static_cast<size_t>(MAP_GRID_SIZE) * MAP_GRID_SIZE;
    if (auto* pv = root.find("mapParcels"); pv && pv->is_array() && pv->as_array()->size() == expectedTiles) {
        out.mapParcels.reserve(expectedTiles);
        for (const auto& po : *pv->as_array()) {
            MapParcel mp;
            mp.x = po.find("x") ? po.find("x")->as_int(0) : 0;
            mp.y = po.find("y") ? po.find("y")->as_int(0) : 0;
            if (auto* t = po.find("terrainType"); t && t->is_string()) {
                mp.terrainType = str_to_terrain(t->as_string()).value_or(TerrainType::Grass);
            }
            if (auto* v = po.find("facilityId"); v && v->is_string()) mp.facilityId = v->as_string();
            if (auto* v = po.find("ownerCompanyId"); v && v->is_string()) mp.ownerCompanyId = v->as_string();
            mp.isZoneAllowed = po.find("isZoneAllowed") ? po.find("isZoneAllowed")->as_bool(true) : true;
            mp.landValue = std::max<int64_t>(0, po.find("landValue") ? po.find("landValue")->as_i64(88000) : 88000);
            mp.trafficIndex = math::clamp_val(po.find("trafficIndex") ? po.find("trafficIndex")->as_int(20) : 20, 0, 100);
            if (auto* v = po.find("districtName"); v && v->is_string()) mp.districtName = v->as_string();
            out.mapParcels.push_back(std::move(mp));
        }
    } else {
        out.mapParcels = generate_city_parcels(MAP_GRID_SIZE);
        for (const auto& fid : out.facilityOrder) {
            const auto& f = out.facilities.at(fid);
            if (auto* p = spatial::get_parcel_at_mut(out.mapParcels, f.tileX, f.tileY, MAP_GRID_SIZE)) {
                p->facilityId = f.id;
                p->ownerCompanyId = f.companyId;
            }
        }
    }

    bool hasCivic = false;
    for (const auto& fid : out.facilityOrder) {
        const auto& f = out.facilities.at(fid);
        if (f.type == FacilityType::CivicHousing || f.companyId == GOVT_OWNER_ID) {
            hasCivic = true;
            break;
        }
    }
    if (!hasCivic) {
        for (const auto& fid : fresh.facilityOrder) {
            const auto& ff = fresh.facilities.at(fid);
            if (ff.type == FacilityType::CivicHousing) {
                const size_t idx = static_cast<size_t>(ff.tileY) * MAP_GRID_SIZE + static_cast<size_t>(ff.tileX);
                if (idx < out.mapParcels.size() && out.mapParcels[idx].facilityId.empty() && out.mapParcels[idx].isZoneAllowed) {
                    insert_facility(out, ff);
                    out.mapParcels[idx].facilityId = ff.id;
                    out.mapParcels[idx].ownerCompanyId = GOVT_OWNER_ID;
                }
            }
        }
    }

    spatial::recalculate_city_traffic(out.mapParcels, out.facilities);

    // Macro
    out.macro = fresh.macro;
    if (auto* mv = root.find("macro"); mv && mv->is_object()) {
        if (auto* v = mv->find("cyclePhase"); v && v->is_string()) {
            out.macro.cyclePhase = str_to_macro_phase(v->as_string()).value_or(EconomicCyclePhase::Normal);
        }
        if (auto* v = mv->find("gdpGrowthRate")) out.macro.gdpGrowthRate = v->as_double(fresh.macro.gdpGrowthRate);
        if (auto* v = mv->find("inflationRate")) out.macro.inflationRate = v->as_double(fresh.macro.inflationRate);
        if (auto* v = mv->find("centralBankRate")) out.macro.centralBankRate = v->as_double(fresh.macro.centralBankRate);
        if (auto* v = mv->find("importTariffRate")) out.macro.importTariffRate = v->as_double(fresh.macro.importTariffRate);
        if (auto* v = mv->find("monthsInPhase")) out.macro.monthsInPhase = v->as_int(fresh.macro.monthsInPhase);
    }

    // City
    out.city = fresh.city;
    if (auto* cv = root.find("city"); cv && cv->is_object()) {
        if (auto* v = cv->find("name"); v && v->is_string()) out.city.name = v->as_string();
        if (auto* v = cv->find("population")) out.city.population = v->as_i64(fresh.city.population);
        if (auto* v = cv->find("growthRate")) out.city.growthRate = v->as_double(fresh.city.growthRate);
        if (auto* v = cv->find("averageWage")) out.city.averageWage = v->as_int(fresh.city.averageWage);
        if (auto* v = cv->find("consumerConfidence")) out.city.consumerConfidence = v->as_int(fresh.city.consumerConfidence);
        if (auto* psv = cv->find("productStats"); psv && psv->is_object()) {
            for (const auto& [pk, pv] : *psv->as_object()) {
                if (auto pid = str_to_product_id(pk)) {
                    auto& ps = out.city.productStats[static_cast<size_t>(*pid)];
                    if (auto* x = pv.find("monthlyDemand")) ps.monthlyDemand = x->as_int(ps.monthlyDemand);
                    if (auto* x = pv.find("monthlySupply")) ps.monthlySupply = x->as_int(ps.monthlySupply);
                    if (auto* x = pv.find("averageMarketPrice")) ps.averageMarketPrice = x->as_double(ps.averageMarketPrice);
                    if (auto* x = pv.find("playerMarketShare")) ps.playerMarketShare = x->as_int(ps.playerMarketShare);
                    if (auto* x = pv.find("satisfactionRate")) ps.satisfactionRate = x->as_int(ps.satisfactionRate);
                    if (auto* x = pv.find("seaportImportShare")) ps.seaportImportShare = x->as_int(ps.seaportImportShare);
                }
            }
        }
    }

    if (auto* txv = root.find("stockTransactions"); txv && txv->is_array()) {
        for (const auto& to : *txv->as_array()) {
            StockTransaction t;
            t.id = to.find("id") ? to.find("id")->as_string() : "";
            t.month = to.find("month") ? to.find("month")->as_int(0) : 0;
            t.buyerCompanyId = to.find("buyerCompanyId") ? to.find("buyerCompanyId")->as_string() : "";
            t.targetCompanyId = to.find("targetCompanyId") ? to.find("targetCompanyId")->as_string() : "";
            if (auto* a = to.find("action"); a && a->is_string()) {
                t.action = str_to_stock_action(a->as_string()).value_or(StockAction::Buy);
            }
            t.shares = to.find("shares") ? to.find("shares")->as_i64(0) : 0;
            t.pricePerShare = to.find("pricePerShare") ? to.find("pricePerShare")->as_double(0.0) : 0.0;
            t.totalCost = to.find("totalCost") ? to.find("totalCost")->as_i64(0) : 0;
            out.stockTransactions.push_back(std::move(t));
        }
    }

    if (auto* nv = root.find("newsFeed"); nv && nv->is_array()) {
        for (const auto& no : *nv->as_array()) {
            NewsItem n;
            n.id = no.find("id") ? no.find("id")->as_string() : "";
            n.month = no.find("month") ? no.find("month")->as_int(0) : 0;
            if (auto* c = no.find("category"); c && c->is_string()) {
                n.category = str_to_news_category(c->as_string()).value_or(NewsCategory::Economy);
            }
            n.title = no.find("title") ? no.find("title")->as_string() : "";
            n.detail = no.find("detail") ? no.find("detail")->as_string() : "";
            out.newsFeed.push_back(std::move(n));
        }
    } else {
        out.newsFeed = fresh.newsFeed;
    }

    return out;
}

std::string export_state_as_json(const SimulationState& state) {
    return json::export_simulation_state_json(state, true);
}

namespace {

inline std::filesystem::path path_from_utf8(std::string_view utf8) {
    return std::filesystem::path(
        std::u8string_view(reinterpret_cast<const char8_t*>(utf8.data()), utf8.size())
    );
}

inline std::string path_to_utf8(const std::filesystem::path& p) {
    auto u8 = p.u8string();
    return std::string(reinterpret_cast<const char*>(u8.data()), u8.size());
}

} // namespace

std::string get_default_autosave_path() {
    namespace fs = std::filesystem;
#ifdef _WIN32
    wchar_t* wideApp = nullptr;
    size_t wideLen = 0;
    if (_wdupenv_s(&wideApp, &wideLen, L"LOCALAPPDATA") == 0 && wideApp != nullptr) {
        fs::path dir = fs::path(wideApp) / L"CapLab13Native";
        std::free(wideApp);
        std::error_code ec;
        fs::create_directories(dir, ec);
        return path_to_utf8(dir / L"autosave.json");
    }
    if (wideApp) std::free(wideApp);
#else
    if (const char* localApp = std::getenv("LOCALAPPDATA")) {
        fs::path dir = path_from_utf8(localApp) / "CapLab13Native";
        std::error_code ec;
        fs::create_directories(dir, ec);
        return path_to_utf8(dir / "autosave.json");
    }
    if (const char* home = std::getenv("HOME")) {
        fs::path dir = path_from_utf8(home) / ".caplab13native";
        std::error_code ec;
        fs::create_directories(dir, ec);
        return path_to_utf8(dir / "autosave.json");
    }
#endif
    return "caplab13_autosave.json";
}

bool save_state_to_file(const SimulationState& state, std::string_view filePath) {
    namespace fs = std::filesystem;
    std::string targetPath = filePath.empty() ? get_default_autosave_path() : std::string(filePath);
    fs::path p = path_from_utf8(targetPath);
    std::error_code ec;
    if (p.has_parent_path()) fs::create_directories(p.parent_path(), ec);

    std::string serialized = json::export_simulation_state_json(state, false);
    fs::path tmpPath = path_from_utf8(targetPath + ".tmp");
    {
        std::ofstream ofs(tmpPath, std::ios::binary | std::ios::trunc);
        if (!ofs.is_open()) return false;
        ofs.write(serialized.data(), static_cast<std::streamsize>(serialized.size()));
        ofs.flush();
        if (!ofs.good()) return false;
    }
    fs::rename(tmpPath, p, ec);
    if (ec) {
        fs::remove(p, ec);
        ec.clear();
        fs::rename(tmpPath, p, ec);
    }
    return !ec;
}

std::optional<SimulationState> load_state_from_file(std::string_view filePath) {
    namespace fs = std::filesystem;
    std::string targetPath = filePath.empty() ? get_default_autosave_path() : std::string(filePath);
    fs::path p = path_from_utf8(targetPath);
    std::ifstream ifs(p, std::ios::binary);
    if (!ifs.is_open()) return std::nullopt;
    std::ostringstream ss;
    ss << ifs.rdbuf();
    return hydrate_state_from_json(ss.str());
}

} // namespace caplab::save
