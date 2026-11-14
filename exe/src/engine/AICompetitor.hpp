#pragma once

#include "../core/Types.hpp"
#include <array>
#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace caplab::ai {

enum class ZonePref : uint8_t {
    Commercial = 0,
    Industrial,
    Residential
};

struct AISharedContext {
    std::unordered_map<std::string, std::vector<const Facility*>> facilitiesByCompany;
    std::array<std::vector<const Facility*>, PRODUCT_COUNT> suppliersByProduct;
};

AISharedContext build_ai_shared_context(const SimulationState& state);

MapParcel* find_available_parcel(
    std::vector<MapParcel>& mapParcels,
    ZonePref preferredZone
);

int get_max_allowed_facilities(int currentTick) noexcept;

SimulationState replenish_ai_competitors(
    const SimulationState& state,
    const std::unordered_set<std::string>* excludedIds = nullptr
);

SimulationState simulate_ai_competitors(const SimulationState& state);

} // namespace caplab::ai
