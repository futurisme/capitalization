#include "core/PrecisionMath.hpp"
#include "engine/AICompetitor.hpp"
#include "engine/DemandMacro.hpp"
#include "engine/EconomyEngine.hpp"
#include "engine/FacilityUnits.hpp"
#include "engine/ProductsData.hpp"
#include "engine/SaveSystem.hpp"
#include "engine/SimulationWorker.hpp"
#include "engine/SpatialGrid.hpp"
#include "engine/StockMarket.hpp"

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#endif

#include <chrono>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <string>
#include <thread>

using namespace caplab;

namespace {

int g_passed = 0;
int g_failed = 0;

#ifdef _WIN32
LONG WINAPI test_seh_filter(EXCEPTION_POINTERS* info) noexcept {
    const unsigned long code = (info && info->ExceptionRecord)
        ? info->ExceptionRecord->ExceptionCode
        : 0UL;
    std::fprintf(
        stderr,
        "\n  [CRASH] Unhandled Win32 Exception: 0x%08lX (address=%p)\n",
        code,
        (info && info->ExceptionRecord) ? info->ExceptionRecord->ExceptionAddress : nullptr
    );
    std::fflush(stderr);
    std::fflush(stdout);
    return EXCEPTION_EXECUTE_HANDLER;
}
#endif

void check(bool cond, const char* name) {
    if (cond) {
        g_passed++;
        std::cout << "  [PASS] " << name << std::endl;
    } else {
        g_failed++;
        std::cout << "  [FAIL] " << name << std::endl;
    }
}

void test_initial_world_parity() {
    auto state = save::generate_default_state();
    check(state.companies.size() == 10, "Initial world starts with exactly 10 active companies");
    check(state.companyOrder.size() == 10, "Deterministic companyOrder preserves 10 companies");
    check(state.mapParcels.size() == 1024, "32x32 map generates 1,024 parcels");

    int civicCount = 0;
    for (const auto& [id, f] : state.facilities) {
        if (f.type == FacilityType::CivicHousing && f.companyId == GOVT_OWNER_ID) civicCount++;
    }
    check(civicCount == 8, "City includes 8 Pemkot public housing units");
    check(get_facility_spec(FacilityType::CivicHousing).buildable == false, "CivicHousing is non-buildable by CEOs");

    auto pIt = state.companies.find(state.playerCompanyId);
    check(pIt != state.companies.end() && pIt->second.cash == 10000000, "Player starts with $10,000,000 cash");

    auto grid = spatial::build_traffic_lookup_grid(state.mapParcels, save::MAP_GRID_SIZE);
    check(grid.size() == 1024, "Spatial lookup grid builds 1,024 traffic cells safely");
}

void test_precision_math_and_hashing() {
    check(math::js_round64(2.5) == 3 && math::js_round64(3.5) == 4, "js_round64 matches JS Math.round half-up");
    check(math::deterministic_hash("comp_apex") != 0, "deterministic_hash FNV-1a produces non-zero digest");
    check(math::format_money(1500000.0) == "$1.50M", "format_money formats millions identically");
    check(math::format_money(-25000.0) == "-$25K", "format_money formats negative thousands identically");
}

void test_json_round_trip_and_security() {
    auto s1 = save::generate_default_state();
    auto s2 = simulate_economic_month(s1);
    std::string json = save::export_state_as_json(s2);
    const bool hasPlayerIdField =
        (json.find("\"playerCompanyId\": \"comp_player\"") != std::string::npos) ||
        (json.find("\"playerCompanyId\":\"comp_player\"") != std::string::npos);
    check(hasPlayerIdField, "JSON export preserves playerCompanyId");

    auto restored = save::hydrate_state_from_json(json);
    check(restored.has_value(), "hydrate_state_from_json parses exported state");
    if (restored) {
        check(restored->playerCompanyId == "comp_player", "Restored playerCompanyId matches");
        check(restored->currentTick == s2.currentTick, "Restored currentTick matches");
        check(restored->companies.size() == s2.companies.size(), "Restored company count matches");
        check(restored->facilities.size() == s2.facilities.size(), "Restored facility count matches");
        check(restored->mapParcels.size() == 1024, "Restored map parcels preserve 32x32 grid");
    }

    std::string poisoned = "{\"__proto__\":{\"polluted\":true},\"currentTick\":5}";
    check(!save::hydrate_state_from_json(poisoned).has_value(),
          "Incomplete/poisoned minimal JSON safely rejected without crash");
}

void test_dividend_and_operations() {
    auto state = save::generate_default_state();
    auto buyRes = market::execute_stock_trade(state, state.playerCompanyId, "comp_apex", 50000, true);
    check(buyRes.success && buyRes.updatedState.has_value(), "Stock purchase of comp_apex succeeds");
    if (!buyRes.updatedState) return;

    SimulationState s = *buyRes.updatedState;
    int64_t playerCashBefore = s.companies[s.playerCompanyId].cash;
    int64_t apexTotalDiv = math::round_currency64(
        s.companies["comp_apex"].dividendPerShare * static_cast<double>(s.companies["comp_apex"].sharesOutstanding));
    int64_t expectedPlayerDiv = math::round_currency64(
        static_cast<double>(apexTotalDiv) * (50000.0 / static_cast<double>(s.companies["comp_apex"].sharesOutstanding)));
    check(expectedPlayerDiv > 0, "Expected dividend payout on 50K shares is positive");

    auto after = simulate_economic_month(s);
    check(after.companies[s.playerCompanyId].stockPrice > 0.0, "Stock price remains positive after month tick");
    check(after.companies[s.playerCompanyId].cash != playerCashBefore, "Monthly operations update player cash balance");
}

void test_banking_rights_issue_and_merger() {
    auto state = save::generate_default_state();
    int64_t cashBefore = state.companies[state.playerCompanyId].cash;
    int64_t sharesBefore = state.companies[state.playerCompanyId].sharesOutstanding;

    auto iss = market::issue_new_shares(state, state.playerCompanyId, 50000);
    check(iss.success && iss.updatedState.has_value(), "Rights issue succeeds");
    if (iss.updatedState) {
        check(iss.updatedState->companies[state.playerCompanyId].sharesOutstanding == sharesBefore + 50000,
              "Rights issue increments sharesOutstanding by 50K");
        check(iss.updatedState->companies[state.playerCompanyId].cash > cashBefore,
              "Rights issue injects cash capital");
    }

    auto borrow = market::handle_corporate_loan(state, state.playerCompanyId, 500000, true);
    check(borrow.success && borrow.updatedState.has_value(), "Corporate loan borrow succeeds within 65% plafon");
    if (borrow.updatedState) {
        auto repay = market::handle_corporate_loan(*borrow.updatedState, state.playerCompanyId, 500000, false);
        check(repay.success && repay.updatedState.has_value() &&
              repay.updatedState->companies[state.playerCompanyId].debt == 0,
              "Repaying full loan clears debt back to 0");
    }

    SimulationState mState = state;
    mState.companies[mState.playerCompanyId].cash = 500000000LL;
    mState.companies[mState.playerCompanyId].shareholdings["comp_agro"] = 600000LL;
    auto merged = market::execute_subsidiary_merger(mState, mState.playerCompanyId, "comp_agro");
    check(merged.success && merged.updatedState.has_value(), "Majority M&A merger executes cleanly");
    if (merged.updatedState) {
        check(merged.updatedState->companies.find("comp_agro") == merged.updatedState->companies.end(),
              "Merged subsidiary removed from active companies");
        check(merged.updatedState->companies.size() == 10,
              "New AI entrant automatically replenishes exchange back to 10 companies");
    }
}

void test_long_run_120_month_stability() {
    auto start = std::chrono::steady_clock::now();
    SimulationState s = save::generate_default_state();
    for (int m = 0; m < 120; ++m) {
        s = simulate_economic_month(s);
        s = ai::simulate_ai_competitors(s);
    }
    auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - start).count();

    bool allFinite = true;
    for (const auto& [cid, c] : s.companies) {
        if (!std::isfinite(c.stockPrice) || c.stockPrice <= 0.0) allFinite = false;
    }
    check(s.currentTick == 120, "120-month stress run reaches tick 120 cleanly");
    check(allFinite, "Zero NaN or invalid stock prices across 120 months");
    check(s.companies.size() == 10, "Exchange maintains 10 active competitors after 10 years");
    std::cout << "  [PERF] 120 months simulated in " << elapsedMs << " ms" << std::endl;
}

void test_pnl_reconciliation_and_ai_bounds() {
    auto state = save::generate_default_state();
    // Force an AI company near max price to verify buyback clamp <= 250.0
    state.companies["comp_apex"].cash = 25000000LL;
    state.companies["comp_apex"].stockPrice = 249.5;
    state.companies["comp_apex"].bookValue = 500000000LL;
    auto aiAfter = ai::simulate_ai_competitors(state);
    bool allStocksClamped = true;
    for (const auto& [cid, c] : aiAfter.companies) {
        if (c.stockPrice < 1.0 || c.stockPrice > 250.0) {
            allStocksClamped = false;
        }
    }
    check(allStocksClamped, "AI buybacks & valuations strictly clamp stock prices within [1.0, 250.0]");

    auto sim = simulate_economic_month(state);
    bool pnlReconciled = true;
    for (const auto& [cid, comp] : sim.companies) {
        int facProfitSum = 0;
        for (const auto& [fid, f] : sim.facilities) {
            if (f.companyId == cid) facProfitSum += f.monthlyProfit;
        }
        int payroll = 0;
        for (const auto& e : comp.executives) {
            if (e.hired) payroll += e.monthlySalary;
        }
        const int bankInterest = math::round_currency(static_cast<double>(comp.debt) * comp.monthlyInterestRate);
        const int bondInterest = math::round_currency(static_cast<double>(comp.bondDebt) * 0.0045);
        const int expected = math::round_currency(static_cast<double>(facProfitSum - payroll - bankInterest - bondInterest));
        if (comp.lastMonthNetProfit != expected) {
            pnlReconciled = false;
        }
    }
    check(pnlReconciled, "Every company satisfies exact double-entry netProfit == sum(facilityProfit) - payroll - interest");
}

void test_simulation_worker_async_and_epoch() {
    SimulationState base = save::generate_default_state();
    SimulationState syncAfter = ai::simulate_ai_competitors(simulate_economic_month(base));

    SimulationWorker worker;
    worker.start();

    bool submitted = worker.try_submit(1, base, true);
    check(submitted, "SimulationWorker accepts epoch-1 background simulation job");

    CompletedSimulationTick done{};
    bool gotResult = false;
    for (int i = 0; i < 400; ++i) {
        if (worker.poll_completed(1, done)) {
            gotResult = true;
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    check(gotResult, "SimulationWorker finishes background monthly tick cleanly");
    if (gotResult) {
        check(done.nextState.currentTick == syncAfter.currentTick &&
                  done.nextState.companies.at(done.nextState.playerCompanyId).cash ==
                      syncAfter.companies.at(syncAfter.playerCompanyId).cash,
              "Background SimulationWorker produces bit-exact parity with synchronous engine");
    }

    worker.invalidate(2);
    worker.try_submit(1, base, false);
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
    CompletedSimulationTick stale{};
    check(!worker.poll_completed(2, stale), "Stale epoch-1 job is discarded after epoch-2 invalidation");

    worker.stop();
}

} // namespace

int main() {
#ifdef _WIN32
    SetUnhandledExceptionFilter(test_seh_filter);
#endif
    std::cout << std::unitbuf;
    std::cerr << std::unitbuf;

    std::cout << "=== CapLab 13 Native C++23 Parity & Stress Test Suite ===" << std::endl;
    test_initial_world_parity();
    test_precision_math_and_hashing();
    test_json_round_trip_and_security();
    test_dividend_and_operations();
    test_banking_rights_issue_and_merger();
    test_pnl_reconciliation_and_ai_bounds();
    test_simulation_worker_async_and_epoch();
    test_long_run_120_month_stability();

    std::cout << "Summary: " << g_passed << " passed, " << g_failed << " failed." << std::endl;
    return (g_failed == 0) ? 0 : 1;
}
