#include "SpatialGrid.hpp"
#include "ProductsData.hpp"
#include "../core/PrecisionMath.hpp"

#include <algorithm>
#include <cmath>

namespace caplab::spatial {

// Intentionally uses compact local buffers (1-4 KB on 32x32 grids) to avoid
// static TLS initialization quirks under statically linked MinGW runtimes.

int infer_grid_size(size_t parcelCount) noexcept {
    if (parcelCount == 0) return 32;
    int root = static_cast<int>(math::js_round64(std::sqrt(static_cast<double>(parcelCount))));
    return root > 0 ? root : 32;
}

const MapParcel* get_parcel_at(
    const std::vector<MapParcel>& parcels,
    int x,
    int y,
    int gridSizeHint
) noexcept {
    const size_t len = parcels.size();
    if (len == 0) return nullptr;
    const int gridSize = gridSizeHint > 0 ? gridSizeHint : infer_grid_size(len);
    if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
        const size_t idx = static_cast<size_t>(y) * static_cast<size_t>(gridSize) + static_cast<size_t>(x);
        if (idx < len && parcels[idx].x == x && parcels[idx].y == y) {
            return &parcels[idx];
        }
    }
    for (size_t i = 0; i < len; ++i) {
        if (parcels[i].x == x && parcels[i].y == y) return &parcels[i];
    }
    return nullptr;
}

MapParcel* get_parcel_at_mut(
    std::vector<MapParcel>& parcels,
    int x,
    int y,
    int gridSizeHint
) noexcept {
    return const_cast<MapParcel*>(get_parcel_at(parcels, x, y, gridSizeHint));
}

std::vector<uint8_t> build_traffic_lookup_grid(
    const std::vector<MapParcel>& parcels,
    int gridSize
) {
    const int safeSize = std::max(1, gridSize);
    const size_t total = static_cast<size_t>(safeSize) * static_cast<size_t>(safeSize);
    std::vector<uint8_t> lookupGrid(total, static_cast<uint8_t>(25));

    for (const auto& p : parcels) {
        if (p.x >= 0 && p.x < safeSize && p.y >= 0 && p.y < safeSize) {
            const int clamped = math::clamp_val(p.trafficIndex, 0, 100);
            lookupGrid[static_cast<size_t>(p.y) * static_cast<size_t>(safeSize) + static_cast<size_t>(p.x)] =
                static_cast<uint8_t>(clamped);
        }
    }
    return lookupGrid;
}

double get_traffic_demand_multiplier(int trafficIndex) noexcept {
    const double clamped = math::clamp_val(static_cast<double>(trafficIndex), 0.0, 100.0);
    return math::round2(0.7 + (clamped / 100.0) * 0.75);
}

void recalculate_city_traffic(
    std::vector<MapParcel>& parcels,
    const std::unordered_map<std::string, Facility>& facilities,
    double inflationStepFactor
) {
    const size_t len = parcels.size();
    if (len == 0) return;

    const int gridSize = infer_grid_size(len);
    const size_t totalTiles = static_cast<size_t>(gridSize) * static_cast<size_t>(gridSize);
    std::vector<float> trafficBuf(totalTiles, 0.0f);
    std::vector<uint8_t> roadFlags(totalTiles, static_cast<uint8_t>(0));

    for (size_t i = 0; i < len; ++i) {
        const auto& p = parcels[i];
        if (p.x < 0 || p.x >= gridSize || p.y < 0 || p.y >= gridSize) continue;
        const size_t idx = static_cast<size_t>(p.y) * static_cast<size_t>(gridSize) + static_cast<size_t>(p.x);

        if (p.terrainType == TerrainType::Water) {
            trafficBuf[idx] = 0.0f;
        } else if (p.terrainType == TerrainType::Road) {
            trafficBuf[idx] = 34.0f;
            roadFlags[idx] = 1;
        } else if (p.terrainType == TerrainType::Pavement) {
            trafficBuf[idx] = 24.0f;
        } else if (p.terrainType == TerrainType::IndustrialZone) {
            trafficBuf[idx] = 12.0f;
        } else {
            trafficBuf[idx] = 14.0f;
        }
    }

    // Orthogonal road adjacency visibility boost
    for (size_t i = 0; i < len; ++i) {
        const auto& p = parcels[i];
        if (p.terrainType == TerrainType::Water || p.terrainType == TerrainType::Road) continue;
        const int x = p.x;
        const int y = p.y;
        if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) continue;

        const bool nearRoad =
            (x > 0 && roadFlags[static_cast<size_t>(y) * gridSize + (x - 1)] == 1) ||
            (x + 1 < gridSize && roadFlags[static_cast<size_t>(y) * gridSize + (x + 1)] == 1) ||
            (y > 0 && roadFlags[static_cast<size_t>(y - 1) * gridSize + x] == 1) ||
            (y + 1 < gridSize && roadFlags[static_cast<size_t>(y + 1) * gridSize + x] == 1);

        if (nearRoad) {
            trafficBuf[static_cast<size_t>(y) * gridSize + x] += 16.0f;
        }
    }

    // Spatial crowd ripple from Real Estate, Civic Housing, Retail & Corporate Towers
    for (const auto& [fId, fac] : facilities) {
        (void)fId;
        double peak = 0.0;
        int radius = 0;

        if (fac.type == FacilityType::ApartmentComplex) {
            peak = 30.0 + (fac.level - 1) * 5.0;
            radius = 5;
        } else if (fac.type == FacilityType::CivicHousing) {
            peak = 28.0 + (fac.level - 1) * 4.0;
            radius = 5;
        } else if (fac.type == FacilityType::CommercialTower) {
            peak = 26.0 + (fac.level - 1) * 4.0;
            radius = 4;
        } else if (fac.type == FacilityType::StoreDepartment) {
            peak = 22.0 + (fac.level - 1) * 3.0;
            radius = 4;
        } else if (fac.type == FacilityType::CorporateHq) {
            peak = 18.0;
            radius = 3;
        } else if (is_store_facility(fac.type)) {
            peak = 14.0 + (fac.level - 1) * 2.0;
            radius = 3;
        } else if (
            fac.type == FacilityType::MediaTelecom ||
            fac.type == FacilityType::TechSoftware ||
            fac.type == FacilityType::RdCenter
        ) {
            peak = 10.0;
            radius = 3;
        } else if (
            fac.type == FacilityType::FactoryProcessing ||
            fac.type == FacilityType::FactoryAssembly ||
            fac.type == FacilityType::MineExtraction
        ) {
            peak = -8.0;
            radius = 2;
        }

        if (peak == 0.0) continue;

        const int minX = std::max(0, fac.tileX - radius);
        const int maxX = std::min(gridSize - 1, fac.tileX + radius);
        const int minY = std::max(0, fac.tileY - radius);
        const int maxY = std::min(gridSize - 1, fac.tileY + radius);

        for (int ny = minY; ny <= maxY; ++ny) {
            const int dy = std::abs(ny - fac.tileY);
            const size_t rowOffset = static_cast<size_t>(ny) * static_cast<size_t>(gridSize);
            for (int nx = minX; nx <= maxX; ++nx) {
                const int dist = std::abs(nx - fac.tileX) + dy;
                if (dist > radius) continue;
                const size_t nIdx = rowOffset + static_cast<size_t>(nx);
                if (roadFlags[nIdx] == 1) continue;
                trafficBuf[nIdx] += static_cast<float>(peak * (1.0 - static_cast<double>(dist) / (radius + 1)));
            }
        }
    }

    const bool isMonthlyTick = (inflationStepFactor != 1.0);
    for (size_t i = 0; i < len; ++i) {
        auto& p = parcels[i];
        if (p.terrainType == TerrainType::Water) {
            p.trafficIndex = 0;
            if (isMonthlyTick) {
                p.landValue = math::round_currency64(static_cast<double>(p.landValue) * inflationStepFactor);
            }
            continue;
        }

        const bool inBounds = (p.x >= 0 && p.x < gridSize && p.y >= 0 && p.y < gridSize);
        const double rawTraffic = inBounds
            ? static_cast<double>(trafficBuf[static_cast<size_t>(p.y) * static_cast<size_t>(gridSize) + static_cast<size_t>(p.x)])
            : 15.0;
        const int trafficIndex = static_cast<int>(math::js_round64(math::clamp_val(rawTraffic, 5.0, 100.0)));

        const int64_t adjustedLand = isMonthlyTick
            ? math::round_currency64(static_cast<double>(p.landValue) * inflationStepFactor * 0.995)
            : p.landValue;

        const double zoneBase =
            p.terrainType == TerrainType::Pavement
                ? 220000.0
                : p.terrainType == TerrainType::IndustrialZone
                ? 120000.0
                : p.terrainType == TerrainType::Grass
                ? 88000.0
                : 0.0;

        const int64_t floorValue = math::round_currency64(zoneBase * (0.72 + static_cast<double>(trafficIndex) / 115.0));
        p.trafficIndex = trafficIndex;
        p.landValue = p.isZoneAllowed ? std::max(adjustedLand, floorValue) : adjustedLand;
    }
}

} // namespace caplab::spatial
