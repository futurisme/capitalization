#pragma once

#include "../core/Types.hpp"
#include <array>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace caplab {

struct FacilityBuildingSpec {
    FacilityType type;
    const char* key;
    const char* name;
    FacilityCategory category;
    int64_t constructionCost;
    int monthlyMaintenance;
    const char* description;
    std::vector<ProductId> allowedProducts;
    bool buildable = true;
};

struct AICorporateTemplate {
    std::string id;
    std::string name;
    std::string ticker;
    uint32_t colorHex;
    uint32_t accentColorHex;
    std::string ceoName;
    AIPersonality personality;
    std::string sectorFocus;
    BrandStrategy brandStrategy;
    int corporateBrandRating;
    int64_t startingCash;
    int64_t startingDebt;
    int64_t sharesOutstanding;
    double stockPrice;
    FacilityType starterFacilityType;
    ProductId starterProduct;
    bool preferIndustrialZone;
    std::vector<std::pair<ProductId, int>> techBoosts;
};

constexpr int MAX_ACTIVE_COMPANIES = 10;
inline constexpr const char* GOVT_OWNER_ID = "govt_city";

const std::array<ProductRecipe, PRODUCT_COUNT>& get_all_products();
const ProductRecipe& get_product(ProductId id);

const std::array<FacilityBuildingSpec, FACILITY_TYPE_COUNT>& get_all_facility_specs();
const FacilityBuildingSpec& get_facility_spec(FacilityType type);

const std::vector<ExecutiveOfficer>& get_available_executives();
const std::vector<AICorporateTemplate>& get_initial_ai_roster();
const std::vector<AICorporateTemplate>& get_new_entrant_pool();

// String <-> Enum converters (exact match with browser TypeScript union strings)
const char* product_id_to_str(ProductId id) noexcept;
std::optional<ProductId> str_to_product_id(std::string_view s) noexcept;

const char* facility_type_to_str(FacilityType type) noexcept;
std::optional<FacilityType> str_to_facility_type(std::string_view s) noexcept;

const char* unit_type_to_str(UnitType type) noexcept;
std::optional<UnitType> str_to_unit_type(std::string_view s) noexcept;

const char* exec_role_to_str(ExecutiveRole r) noexcept;
std::optional<ExecutiveRole> str_to_exec_role(std::string_view s) noexcept;

const char* brand_strategy_to_str(BrandStrategy bs) noexcept;
std::optional<BrandStrategy> str_to_brand_strategy(std::string_view s) noexcept;

const char* ai_personality_to_str(AIPersonality p) noexcept;
std::optional<AIPersonality> str_to_ai_personality(std::string_view s) noexcept;

const char* macro_phase_to_str(EconomicCyclePhase p) noexcept;
std::optional<EconomicCyclePhase> str_to_macro_phase(std::string_view s) noexcept;

const char* terrain_to_str(TerrainType t) noexcept;
std::optional<TerrainType> str_to_terrain(std::string_view s) noexcept;

const char* news_category_to_str(NewsCategory c) noexcept;
std::optional<NewsCategory> str_to_news_category(std::string_view s) noexcept;

const char* stock_action_to_str(StockAction a) noexcept;
std::optional<StockAction> str_to_stock_action(std::string_view s) noexcept;

uint32_t parse_css_hex(std::string_view s, uint32_t fallback = 0x0284c7) noexcept;
std::string hex_to_css(uint32_t rgb);

inline bool is_store_facility(FacilityType t) noexcept {
    return t == FacilityType::StoreConvenience ||
           t == FacilityType::StoreElectronics ||
           t == FacilityType::StoreDepartment ||
           t == FacilityType::StoreAuto ||
           t == FacilityType::StorePharmacy;
}

inline bool is_real_estate_facility(FacilityType t) noexcept {
    return t == FacilityType::ApartmentComplex ||
           t == FacilityType::CommercialTower ||
           t == FacilityType::CivicHousing;
}

} // namespace caplab
