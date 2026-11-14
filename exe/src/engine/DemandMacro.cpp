#include "DemandMacro.hpp"
#include "../core/PrecisionMath.hpp"

#include <algorithm>
#include <cmath>

namespace caplab {

int calculate_consumer_demand(
    double baseDemand,
    double sellingPrice,
    double basePrice,
    double qualityRating,
    double brandRating,
    double elasticity,
    const ProductAppealWeights& appealWeights
) noexcept {
    const double safeBaseDemand = math::finite_or(baseDemand, 0.0);
    const double safeSellingPrice = math::finite_or(sellingPrice, 0.0);
    const double safeBasePrice = math::finite_or(basePrice, 0.0);
    if (safeBaseDemand <= 0.0 || safeSellingPrice <= 0.0 || safeBasePrice <= 0.0) return 0;

    const double priceRatio = safeBasePrice / std::max(safeSellingPrice, safeBasePrice * 0.15);
    const double boundedElasticity = math::clamp_val(math::finite_or(elasticity, 1.0), 0.1, 2.5);
    const double priceEffect = std::pow(priceRatio, boundedElasticity);

    const double qualityEffect = 0.4 + (math::clamp_val(qualityRating, 0.0, 100.0) / 100.0) * 1.1;
    const double brandEffect = 0.5 + (math::clamp_val(brandRating, 0.0, 100.0) / 100.0) * 1.0;

    const double weightedScore =
        priceEffect * math::finite_or(appealWeights.price, 0.45) +
        qualityEffect * math::finite_or(appealWeights.quality, 0.30) +
        brandEffect * math::finite_or(appealWeights.brand, 0.25);

    const double rawPriceRatio = safeBasePrice / safeSellingPrice;
    const double affordabilityGate = rawPriceRatio < 0.5 ? std::pow(rawPriceRatio * 2.0, 2.0) : 1.0;

    const double estimatedDemand =
        safeBaseDemand * std::max(0.05, math::finite_or(weightedScore, 0.05)) * affordabilityGate;
    return std::max(0, math::round_currency(estimatedDemand));
}

MacroEconomy advance_macro_economy(const MacroEconomy& macro, int tick) noexcept {
    MacroEconomy next = macro;
    next.monthsInPhase = std::max(0, macro.monthsInPhase) + 1;

    if (next.monthsInPhase >= 16) {
        const int roll = std::abs(tick * 17) % 10;
        if (next.cyclePhase == EconomicCyclePhase::Normal && roll >= 5) {
            next.cyclePhase = EconomicCyclePhase::Boom;
            next.monthsInPhase = 0;
        } else if (next.cyclePhase == EconomicCyclePhase::Boom && roll >= 4) {
            next.cyclePhase = EconomicCyclePhase::Recession;
            next.monthsInPhase = 0;
        } else if (next.cyclePhase == EconomicCyclePhase::Recession && next.monthsInPhase >= 14) {
            next.cyclePhase = EconomicCyclePhase::Recovery;
            next.monthsInPhase = 0;
        } else if (next.cyclePhase == EconomicCyclePhase::Recovery) {
            next.cyclePhase = EconomicCyclePhase::Normal;
            next.monthsInPhase = 0;
        }
    }

    double tGdp = 2.9;
    double tInf = 2.3;
    double tCbr = 4.5;
    switch (next.cyclePhase) {
        case EconomicCyclePhase::Boom:      tGdp = 4.8;  tInf = 4.1; tCbr = 6.2; break;
        case EconomicCyclePhase::Normal:    tGdp = 2.9;  tInf = 2.3; tCbr = 4.5; break;
        case EconomicCyclePhase::Recession: tGdp = -1.4; tInf = 1.1; tCbr = 2.5; break;
        case EconomicCyclePhase::Recovery:  tGdp = 3.4;  tInf = 1.9; tCbr = 3.5; break;
    }

    next.gdpGrowthRate = math::clamp_val(math::round1(math::finite_or(next.gdpGrowthRate, tGdp) * 0.8 + tGdp * 0.2), -5.0, 10.0);
    next.inflationRate = math::clamp_val(math::round1(math::finite_or(next.inflationRate, tInf) * 0.8 + tInf * 0.2), 0.0, 15.0);
    next.centralBankRate = math::clamp_val(math::round1(math::finite_or(next.centralBankRate, tCbr) * 0.85 + tCbr * 0.15), 0.5, 18.0);

    return next;
}

} // namespace caplab
