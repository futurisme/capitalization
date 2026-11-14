#pragma once

#include "../core/Types.hpp"
#include <optional>
#include <string>

namespace caplab::market {

struct MarketActionResult {
    bool success = false;
    std::string message;
    std::optional<SimulationState> updatedState;
};

double get_ownership_percentage(const Company& targetCompany, int64_t sharesOwned) noexcept;

MarketActionResult execute_stock_trade(
    const SimulationState& state,
    const std::string& buyerId,
    const std::string& targetId,
    int64_t sharesCount,
    bool isBuy
);

MarketActionResult issue_new_shares(
    const SimulationState& state,
    const std::string& companyId,
    int64_t newSharesCount
);

MarketActionResult execute_subsidiary_merger(
    const SimulationState& state,
    const std::string& acquirerId,
    const std::string& targetId
);

MarketActionResult handle_corporate_loan(
    const SimulationState& state,
    const std::string& companyId,
    int64_t amount,
    bool isBorrow
);

} // namespace caplab::market
