#pragma once

#include "../core/Types.hpp"
#include "ProductsData.hpp"

#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace caplab::save {

constexpr int MAP_GRID_SIZE = 32;

std::array<int, PRODUCT_COUNT> build_base_tech_map(
    const std::vector<std::pair<ProductId, int>>& overrides = {}
);

MapParcel* select_parcel_for_zone(
    std::vector<MapParcel>& parcels,
    bool preferIndustrialZone,
    std::optional<std::pair<int, int>> preferredCoord = std::nullopt
);

struct SpawnedCompanyResult {
    Company company;
    std::optional<Facility> facility;
};

SpawnedCompanyResult create_company_and_starter_from_template(
    const AICorporateTemplate& tpl,
    std::vector<MapParcel>& parcels,
    int currentTick,
    const std::string& overrideId = "",
    std::optional<std::pair<int, int>> preferredCoord = std::nullopt,
    const std::string& dateString = "",
    bool isNewEntrant = false
);

std::vector<MapParcel> generate_city_parcels(int gridSize = MAP_GRID_SIZE);

SimulationState generate_default_state();

std::optional<SimulationState> hydrate_state_from_json(std::string_view jsonText);

std::string export_state_as_json(const SimulationState& state);

std::string get_default_autosave_path();
bool save_state_to_file(const SimulationState& state, std::string_view filePath = "");
std::optional<SimulationState> load_state_from_file(std::string_view filePath = "");

// Shared helper to push a news item at front with max 25 items
void push_news_capped(SimulationState& state, NewsItem item);

// Shared helper to keep SimulationState ordering deterministic
void insert_company(SimulationState& state, Company comp);
void erase_company(SimulationState& state, const std::string& companyId);
void insert_facility(SimulationState& state, Facility fac);
void erase_facility(SimulationState& state, const std::string& facilityId);

} // namespace caplab::save
