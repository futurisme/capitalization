#include "StockMarket.hpp"
#include "AICompetitor.hpp"
#include "SaveSystem.hpp"
#include "../core/PrecisionMath.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <unordered_set>

namespace caplab::market {

double get_ownership_percentage(const Company& targetCompany, int64_t sharesOwned) noexcept {
    if (sharesOwned <= 0 || targetCompany.sharesOutstanding <= 0) return 0.0;
    double pct = (static_cast<double>(sharesOwned) / static_cast<double>(targetCompany.sharesOutstanding)) * 1000.0;
    return math::clamp_val(static_cast<double>(math::js_round64(pct)) / 10.0, 0.0, 100.0);
}

MarketActionResult execute_stock_trade(
    const SimulationState& state,
    const std::string& buyerId,
    const std::string& targetId,
    int64_t sharesCount,
    bool isBuy
) {
    auto bIt = state.companies.find(buyerId);
    auto tIt = state.companies.find(targetId);
    if (bIt == state.companies.end() || tIt == state.companies.end()) {
        return {false, "Perusahaan tidak ditemukan.", std::nullopt};
    }
    if (sharesCount <= 0) {
        return {false, "Jumlah saham harus lebih dari 0.", std::nullopt};
    }

    const Company& buyer = bIt->second;
    const Company& target = tIt->second;
    const double pricePerShare = std::max(0.01, math::finite_or(target.stockPrice, 1.0));
    const int64_t totalAmount = math::round_currency64(static_cast<double>(sharesCount) * pricePerShare);

    if (isBuy) {
        if (buyer.cash < totalAmount) {
            return {false,
                    "Kas tidak mencukupi. Diperlukan $" + math::format_int_commas(totalAmount) +
                    ", tersedia $" + math::format_int_commas(buyer.cash) + ".",
                    std::nullopt};
        }

        const int64_t currentHolding = buyer.shareholdings.contains(targetId) ? buyer.shareholdings.at(targetId) : 0;
        const int64_t maxAvailable = (buyerId == targetId)
            ? (target.sharesOutstanding - target.treasuryShares)
            : (target.sharesOutstanding - currentHolding);

        if (sharesCount > maxAvailable) {
            return {false,
                    "Maksimal saham tersedia untuk dibeli: " + math::format_int_commas(std::max<int64_t>(0, maxAvailable)) + " lembar.",
                    std::nullopt};
        }

        SimulationState next = state;
        Company& nextBuyer = next.companies.at(buyerId);
        nextBuyer.cash -= totalAmount;
        nextBuyer.shareholdings[targetId] = currentHolding + sharesCount;

        if (buyerId == targetId) {
            nextBuyer.treasuryShares += sharesCount;
            nextBuyer.stockPrice = math::clamp_val(math::round2(buyer.stockPrice * 1.02), 1.0, 250.0);
        }

        StockTransaction tx;
        tx.id = "tx_buy_" + std::to_string(state.currentTick) + "_" + buyer.ticker + "_" + target.ticker + "_" + std::to_string(sharesCount);
        tx.month = state.currentTick;
        tx.buyerCompanyId = buyerId;
        tx.targetCompanyId = targetId;
        tx.action = StockAction::Buy;
        tx.shares = sharesCount;
        tx.pricePerShare = pricePerShare;
        tx.totalCost = totalAmount;

        next.stockTransactions.insert(next.stockTransactions.begin(), std::move(tx));
        if (next.stockTransactions.size() > 50) next.stockTransactions.resize(50);

        const int64_t newHoldings = nextBuyer.shareholdings[targetId];
        const double ownershipPct = get_ownership_percentage(next.companies.at(targetId), newHoldings);

        std::string takeoverAlert;
        if (buyerId != targetId && ownershipPct >= 50.0) {
            char buf[96];
            std::snprintf(buf, sizeof(buf), " KENDALI MAYORITAS TERCAPAI (%.1f%%). Opsi Merger penuh kini terbuka.", ownershipPct);
            takeoverAlert = buf;
        }

        char pctBuf[32];
        std::snprintf(pctBuf, sizeof(pctBuf), "%.1f", ownershipPct);
        return {true,
                "Membeli " + math::format_int_commas(sharesCount) + " lbr saham " + target.ticker +
                " senilai $" + math::format_int_commas(totalAmount) + " (" + pctBuf + "%)." + takeoverAlert,
                std::move(next)};
    } else {
        const int64_t currentHolding = buyer.shareholdings.contains(targetId) ? buyer.shareholdings.at(targetId) : 0;
        if (currentHolding < sharesCount) {
            return {false,
                    "Saham tidak mencukupi. Anda hanya memiliki " + math::format_int_commas(currentHolding) + " lembar.",
                    std::nullopt};
        }

        SimulationState next = state;
        Company& nextBuyer = next.companies.at(buyerId);
        nextBuyer.cash += totalAmount;
        nextBuyer.shareholdings[targetId] = currentHolding - sharesCount;

        StockTransaction tx;
        tx.id = "tx_sell_" + std::to_string(state.currentTick) + "_" + buyer.ticker + "_" + target.ticker + "_" + std::to_string(sharesCount);
        tx.month = state.currentTick;
        tx.buyerCompanyId = buyerId;
        tx.targetCompanyId = targetId;
        tx.action = StockAction::Sell;
        tx.shares = sharesCount;
        tx.pricePerShare = pricePerShare;
        tx.totalCost = totalAmount;

        next.stockTransactions.insert(next.stockTransactions.begin(), std::move(tx));
        if (next.stockTransactions.size() > 50) next.stockTransactions.resize(50);

        return {true,
                "Menjual " + math::format_int_commas(sharesCount) + " lbr saham " + target.ticker +
                " seharga $" + math::format_int_commas(totalAmount) + ".",
                std::move(next)};
    }
}

MarketActionResult issue_new_shares(
    const SimulationState& state,
    const std::string& companyId,
    int64_t newSharesCount
) {
    auto it = state.companies.find(companyId);
    if (it == state.companies.end()) return {false, "Perusahaan tidak ditemukan.", std::nullopt};
    if (newSharesCount <= 0 || newSharesCount > 500000) {
        return {false, "Jumlah penerbitan saham harus antara 1 hingga 500.000 lembar.", std::nullopt};
    }

    const Company& company = it->second;
    const double issuePrice = std::max(1.0, math::round2(company.stockPrice * 0.94));
    const int64_t capitalRaised = math::round_currency64(static_cast<double>(newSharesCount) * issuePrice);
    const double dilutionFactor = math::safe_divide(
        static_cast<double>(company.sharesOutstanding),
        static_cast<double>(company.sharesOutstanding + newSharesCount),
        1.0
    );
    const double newPrice = std::max(1.0, math::round2(company.stockPrice * (0.5 + 0.5 * dilutionFactor)));

    SimulationState next = state;
    Company& nextComp = next.companies.at(companyId);
    nextComp.cash += capitalRaised;
    nextComp.sharesOutstanding += newSharesCount;
    nextComp.stockPrice = newPrice;

    StockTransaction tx;
    tx.id = "tx_iss_" + std::to_string(state.currentTick) + "_" + company.ticker + "_" + std::to_string(newSharesCount);
    tx.month = state.currentTick;
    tx.buyerCompanyId = companyId;
    tx.targetCompanyId = companyId;
    tx.action = StockAction::Issue;
    tx.shares = newSharesCount;
    tx.pricePerShare = issuePrice;
    tx.totalCost = capitalRaised;

    next.stockTransactions.insert(next.stockTransactions.begin(), std::move(tx));
    if (next.stockTransactions.size() > 50) next.stockTransactions.resize(50);

    char priceBuf[32];
    std::snprintf(priceBuf, sizeof(priceBuf), "%.2f", issuePrice);
    return {true,
            "Menerbitkan " + math::format_int_commas(newSharesCount) + " lbr saham baru di harga $" +
            priceBuf + ". Dana masuk: +$" + math::format_int_commas(capitalRaised) + ".",
            std::move(next)};
}

MarketActionResult execute_subsidiary_merger(
    const SimulationState& state,
    const std::string& acquirerId,
    const std::string& targetId
) {
    if (acquirerId == targetId) return {false, "Tidak bisa merger dengan perusahaan sendiri.", std::nullopt};
    auto aIt = state.companies.find(acquirerId);
    auto tIt = state.companies.find(targetId);
    if (aIt == state.companies.end() || tIt == state.companies.end()) {
        return {false, "Entitas perusahaan tidak valid.", std::nullopt};
    }

    const Company& acquirer = aIt->second;
    const Company& target = tIt->second;
    const int64_t ownedShares = acquirer.shareholdings.contains(targetId) ? acquirer.shareholdings.at(targetId) : 0;
    const double pct = get_ownership_percentage(target, ownedShares);
    if (pct < 50.0) {
        char buf[128];
        std::snprintf(buf, sizeof(buf), "Kepemilikan saat ini %.1f%%. Minimal 50%% saham mayoritas diperlukan untuk Merger Penuh.", pct);
        return {false, buf, std::nullopt};
    }

    const int64_t remainingShares = std::max<int64_t>(0, target.sharesOutstanding - ownedShares);
    const int64_t buyoutCost = math::round_currency64(static_cast<double>(remainingShares) * target.stockPrice * 1.1);

    if (acquirer.cash < buyoutCost) {
        return {false,
                "Biaya pembelian sisa saham minoritas $" + math::format_int_commas(buyoutCost) + " melebihi kas Anda.",
                std::nullopt};
    }

    SimulationState next = state;
    int transferredCount = 0;
    for (const auto& fid : next.facilityOrder) {
        Facility& fac = next.facilities.at(fid);
        if (fac.companyId == targetId) {
            ++transferredCount;
            fac.companyId = acquirerId;
            fac.name = fac.name + " (" + acquirer.ticker + ")";
        }
    }

    Company& nextAcq = next.companies.at(acquirerId);
    for (size_t i = 0; i < PRODUCT_COUNT; ++i) {
        int aT = nextAcq.techLevels[i] > 0 ? nextAcq.techLevels[i] : 30;
        int tT = target.techLevels[i] > 0 ? target.techLevels[i] : 30;
        nextAcq.techLevels[i] = std::max(aT, tT);
    }
    nextAcq.cash = nextAcq.cash - buyoutCost + target.cash;
    nextAcq.debt += target.debt;
    nextAcq.bondDebt += target.bondDebt;
    nextAcq.facilitiesCount += transferredCount;
    nextAcq.shareholdings[targetId] = 0;

    save::erase_company(next, targetId);

    for (auto& p : next.mapParcels) {
        if (p.ownerCompanyId == targetId) p.ownerCompanyId = acquirerId;
    }

    save::push_news_capped(next, {
        "news_merger_" + std::to_string(state.currentTick) + "_" + acquirer.ticker + "_" + target.ticker,
        state.currentTick,
        NewsCategory::Finance,
        "Akuisisi Korporat: " + acquirer.ticker + " Menyerap " + target.ticker,
        acquirer.name + " menuntaskan akuisisi 100% atas " + target.name +
            " dan mengambil alih " + std::to_string(transferredCount) + " fasilitas operasional serta seluruh hak paten R&D."
    });

    std::unordered_set<std::string> excluded{targetId};
    next = ai::replenish_ai_competitors(next, &excluded);

    return {true,
            "Merger Berhasil! " + target.name + " resmi dilebur ke " + acquirer.name +
            " (+" + std::to_string(transferredCount) + " fasilitas & paten R&D).",
            std::move(next)};
}

MarketActionResult handle_corporate_loan(
    const SimulationState& state,
    const std::string& companyId,
    int64_t amount,
    bool isBorrow
) {
    auto it = state.companies.find(companyId);
    if (it == state.companies.end()) return {false, "Perusahaan tidak ditemukan.", std::nullopt};
    if (amount <= 0) return {false, "Nominal harus lebih dari 0.", std::nullopt};

    const Company& company = it->second;
    if (isBorrow) {
        const int64_t maxDebtAllowed = math::round_currency64(static_cast<double>(company.bookValue) * 0.65);
        const int64_t currentTotalDebt = company.debt + company.bondDebt;
        if (currentTotalDebt + amount > maxDebtAllowed) {
            return {false,
                    "Batas plafon kredit terlampaui. Maksimal fasilitas kredit baru: $" +
                    math::format_int_commas(std::max<int64_t>(0, maxDebtAllowed - currentTotalDebt)) + ".",
                    std::nullopt};
        }

        SimulationState next = state;
        Company& nextComp = next.companies.at(companyId);
        nextComp.cash += amount;
        nextComp.debt += amount;

        char rateBuf[32];
        std::snprintf(rateBuf, sizeof(rateBuf), "%.2f", company.monthlyInterestRate * 100.0);
        return {true,
                "Pinjaman $" + math::format_int_commas(amount) + " dicairkan. Bunga aktif: " + rateBuf + "%/bln.",
                std::move(next)};
    } else {
        if (amount > company.debt) {
            return {false,
                    "Nominal pelunasan melebihi sisa hutang ($" + math::format_int_commas(company.debt) + ").",
                    std::nullopt};
        }
        if (amount > company.cash) {
            return {false, "Kas perusahaan tidak mencukupi untuk melunasi hutang.", std::nullopt};
        }

        SimulationState next = state;
        Company& nextComp = next.companies.at(companyId);
        nextComp.cash -= amount;
        nextComp.debt -= amount;

        return {true,
                "Berhasil melunasi $" + math::format_int_commas(amount) +
                ". Sisa hutang bank: $" + math::format_int_commas(nextComp.debt) + ".",
                std::move(next)};
    }
}

} // namespace caplab::market
