#pragma once

#include "../core/Types.hpp"

namespace caplab {

int calculate_consumer_demand(
    double baseDemand,
    double sellingPrice,
    double basePrice,
    double qualityRating,
    double brandRating,
    double elasticity,
    const ProductAppealWeights& appealWeights
) noexcept;

MacroEconomy advance_macro_economy(const MacroEconomy& macro, int tick) noexcept;

} // namespace caplab
