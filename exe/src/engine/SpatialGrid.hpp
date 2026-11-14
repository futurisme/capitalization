#pragma once

#include "../core/Types.hpp"
#include <cstdint>
#include <unordered_map>
#include <vector>

namespace caplab::spatial {

int infer_grid_size(size_t parcelCount) noexcept;

const MapParcel* get_parcel_at(
    const std::vector<MapParcel>& parcels,
    int x,
    int y,
    int gridSizeHint = 0
) noexcept;

MapParcel* get_parcel_at_mut(
    std::vector<MapParcel>& parcels,
    int x,
    int y,
    int gridSizeHint = 0
) noexcept;

std::vector<uint8_t> build_traffic_lookup_grid(
    const std::vector<MapParcel>& parcels,
    int gridSize
);

double get_traffic_demand_multiplier(int trafficIndex) noexcept;

void recalculate_city_traffic(
    std::vector<MapParcel>& parcels,
    const std::unordered_map<std::string, Facility>& facilities,
    double inflationStepFactor = 1.0
);

} // namespace caplab::spatial
