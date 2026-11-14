#pragma once

#include "../core/Types.hpp"
#include <optional>
#include <vector>

namespace caplab {

int64_t get_facility_upgrade_cost(FacilityType type, int currentLevel) noexcept;
int64_t get_unit_install_cost(UnitType unitType) noexcept;
int64_t get_unit_upgrade_cost(int currentLevel) noexcept;

std::vector<InternalUnit> create_default_units_for_facility(
    FacilityType type,
    std::optional<ProductId> targetProduct = std::nullopt
);

Facility add_unit_to_facility_slot(
    const Facility& facility,
    int slotIndex,
    UnitType unitType
);

} // namespace caplab
