#include "EconomyEngine.hpp"
#include "DemandMacro.hpp"
#include "ProductsData.hpp"
#include "SpatialGrid.hpp"
#include "../core/PrecisionMath.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <string>
#include <unordered_map>
#include <vector>

namespace caplab {

namespace {

constexpr const char* MONTH_NAMES[12] = {
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
};

struct ExecBuffs {
    bool hasCOO = false;
    bool hasCTO = false;
    bool hasCMO = false;
    bool hasCFO = false;
    int payroll = 0;
};

struct ProducerMeta {
    double unitCost = 0.0;
    int effectiveOpCost = 0;
    int gridPowerRev = 0;
    ProductId primaryProdId = ProductId::Wheat;
};

int compute_quality_and_brand(
    Facility& f,
    const Company& comp,
    const ExecBuffs& buffs,
    ProductId prodId
) {
    const int effectiveMaint = buffs.hasCOO
        ? math::round_currency(static_cast<double>(f.monthlyMaintenance) * 0.85)
        : math::round_currency(static_cast<double>(f.monthlyMaintenance));
    int totalOpCost = effectiveMaint;

    const int rawTech = comp.techLevels[static_cast<size_t>(prodId)];
    const int techLevel = rawTech > 0 ? rawTech : 30;
    const int ctoQualityBonus = buffs.hasCTO ? 5 : 0;
    f.qualityRating = math::clamp_val(
        math::round_currency(techLevel * 0.72 + f.level * 5.0 + ctoQualityBonus),
        1,
        100
    );

    int adUnits = 0;
    for (const auto& u : f.units) {
        if (u.type == UnitType::Advertising) ++adUnits;
    }

    if (f.adBudget > 0) {
        const double cmoMult = buffs.hasCMO ? 1.35 : 1.0;
        const int adBoost = std::min(
            5,
            static_cast<int>(std::floor((f.adBudget * cmoMult * (1.0 + adUnits * 0.25)) / 4500.0))
        );
        f.brandRating = std::min(100, f.brandRating + adBoost);
        totalOpCost += math::round_currency(static_cast<double>(f.adBudget));
    } else {
        f.brandRating = std::max(10, f.brandRating - 1);
    }

    if (comp.brandStrategy == BrandStrategy::Corporate) {
        f.brandRating = math::round_currency(f.brandRating * 0.65 + comp.corporateBrandRating * 0.35);
    }
    return totalOpCost;
}

const InternalUnit* find_primary_product_unit(const Facility& f) noexcept {
    for (const auto& u : f.units) {
        if (u.hasTargetProduct) return &u;
    }
    return nullptr;
}

const InternalUnit* find_unit_by_type(const Facility& f, UnitType t) noexcept {
    for (const auto& u : f.units) {
        if (u.type == t) return &u;
    }
    return nullptr;
}

struct TrafficGridView {
    const std::vector<uint8_t>& grid;
    int size = 0;

    int at(int tx, int ty) const noexcept {
        if (tx < 0 || tx >= size || ty < 0 || ty >= size) return 25;
        return static_cast<int>(grid[static_cast<size_t>(ty) * static_cast<size_t>(size) + static_cast<size_t>(tx)]);
    }
};

void prepare_companies_and_buffs(
    SimulationState& next,
    std::unordered_map<std::string, ExecBuffs>& execBuffs
) {
    execBuffs.reserve(next.companies.size());

    for (const auto& cid : next.companyOrder) {
        auto& comp = next.companies.at(cid);
        ExecBuffs buffs;
        for (const auto& e : comp.executives) {
            if (e.hired) {
                buffs.payroll += e.monthlySalary;
                if (e.role == ExecutiveRole::COO) buffs.hasCOO = true;
                else if (e.role == ExecutiveRole::CTO) buffs.hasCTO = true;
                else if (e.role == ExecutiveRole::CMO) buffs.hasCMO = true;
                else if (e.role == ExecutiveRole::CFO) buffs.hasCFO = true;
            }
        }
        execBuffs[cid] = buffs;

        const double baseMonthlyRate = (next.macro.centralBankRate + 2.5) / 100.0 / 12.0;
        const double effectiveInterestRate = buffs.hasCFO ? baseMonthlyRate * 0.75 : baseMonthlyRate;
        comp.debt = std::max<int64_t>(0, comp.debt);
        comp.bondDebt = std::max<int64_t>(0, comp.bondDebt);
        comp.monthlyInterestRate = math::round4(effectiveInterestRate);
    }

    // Single O(F) pass for media corporate brand bonuses
    std::unordered_map<std::string, int> mediaBoostByCompany;
    mediaBoostByCompany.reserve(next.companies.size());
    for (const auto& fid : next.facilityOrder) {
        const auto& fac = next.facilities.at(fid);
        if (fac.type == FacilityType::MediaTelecom) {
            mediaBoostByCompany[fac.companyId] += 4 * fac.level;
        }
    }

    for (const auto& cid : next.companyOrder) {
        auto& comp = next.companies.at(cid);
        const auto& buffs = execBuffs[cid];
        const auto mbIt = mediaBoostByCompany.find(cid);
        const int mediaBonus = (mbIt != mediaBoostByCompany.end()) ? mbIt->second : 0;
        const double cmoBonus = buffs.hasCMO ? 2.5 : 0.0;
        const int baseBrand = comp.corporateBrandRating > 0 ? comp.corporateBrandRating : 45;
        comp.corporateBrandRating = math::clamp_val(
            math::round_currency(baseBrand * 0.98 + (mediaBonus + cmoBonus) * 0.35),
            15,
            100
        );
    }
}

void process_stage1_non_factories(
    SimulationState& next,
    const std::unordered_map<std::string, ExecBuffs>& execBuffs,
    const TrafficGridView& traffic,
    std::unordered_map<std::string, ProducerMeta>& producerMeta,
    std::vector<Facility*>& processingQueue,
    std::vector<Facility*>& assemblyQueue,
    std::array<std::vector<Facility*>, PRODUCT_COUNT>& storesByProduct
) {
    for (const auto& fid : next.facilityOrder) {
        Facility& f = next.facilities.at(fid);

        if (f.companyId == GOVT_OWNER_ID || f.type == FacilityType::CivicHousing) {
            const int tileTraffic = traffic.at(f.tileX, f.tileY);
            int cap = 0;
            for (const auto& u : f.units) {
                if (u.type == UnitType::Sales) cap += u.capacity * u.level;
            }
            if (cap <= 0) cap = 320;
            const double occupancy = std::min(
                0.98,
                0.74 + (static_cast<double>(next.city.consumerConfidence) / 100.0) * 0.14 +
                       (static_cast<double>(tileTraffic) / 100.0) * 0.08
            );
            f.lastMonthUnitsSold = math::round_currency(cap * occupancy);
            f.monthlyProduction = f.lastMonthUnitsSold;
            f.monthlyRevenue = 0;
            f.monthlyCostOfGoods = 0;
            f.monthlyProfit = 0;
            f.qualityRating = std::min(100, math::round_currency(58 + f.level * 6));
            continue;
        }

        auto compIt = next.companies.find(f.companyId);
        if (compIt == next.companies.end()) continue;
        Company& comp = compIt->second;

        if (f.type == FacilityType::FactoryProcessing) {
            processingQueue.push_back(&f);
            continue;
        }
        if (f.type == FacilityType::FactoryAssembly) {
            assemblyQueue.push_back(&f);
            continue;
        }

        const auto& buffs = execBuffs.at(comp.id);
        const int effectiveMaint = buffs.hasCOO
            ? math::round_currency(static_cast<double>(f.monthlyMaintenance) * 0.85)
            : math::round_currency(static_cast<double>(f.monthlyMaintenance));
        int totalOpCost = effectiveMaint;

        // Real Estate
        if (f.type == FacilityType::ApartmentComplex || f.type == FacilityType::CommercialTower) {
            const int tileTraffic = traffic.at(f.tileX, f.tileY);
            int adUnits = 0;
            int unitCap = 0;
            for (const auto& u : f.units) {
                if (u.type == UnitType::Advertising) ++adUnits;
                else if (u.type == UnitType::Sales) unitCap += u.capacity * u.level;
            }
            if (unitCap <= 0) unitCap = (f.type == FacilityType::CommercialTower) ? 240 : 180;

            if (f.adBudget > 0) {
                const double cmoMult = buffs.hasCMO ? 1.35 : 1.0;
                const int adBoost = std::min(4, static_cast<int>(std::floor((f.adBudget * cmoMult * (1.0 + adUnits * 0.25)) / 5000.0)));
                f.brandRating = std::min(100, f.brandRating + adBoost);
                totalOpCost += math::round_currency(static_cast<double>(f.adBudget));
            } else {
                f.brandRating = std::max(15, f.brandRating - 1);
            }

            const int totalUnitsAvailable = unitCap * f.level;
            double occupancy = 0.72;
            double baseRate = 900.0;
            double serviceCostPerUnit = 220.0;

            if (f.type == FacilityType::ApartmentComplex) {
                occupancy = math::clamp_val(
                    0.6 + (next.city.consumerConfidence / 100.0) * 0.18 +
                          (tileTraffic / 100.0) * 0.16 +
                          (f.brandRating / 100.0) * 0.08,
                    0.55,
                    0.98
                );
                const double setRent = f.sellingPrice > 100.0 ? f.sellingPrice : 880.0;
                baseRate = setRent * (0.85 + tileTraffic / 240.0);
                serviceCostPerUnit = 210.0;
                f.qualityRating = std::min(100, math::round_currency(52 + f.level * 8 + tileTraffic * 0.16));
            } else {
                const double macroBoost =
                    next.macro.cyclePhase == EconomicCyclePhase::Boom ? 0.10
                    : next.macro.cyclePhase == EconomicCyclePhase::Recession ? -0.14
                    : 0.02;
                occupancy = math::clamp_val(
                    0.48 + (tileTraffic / 100.0) * 0.36 + macroBoost + (f.brandRating / 100.0) * 0.08,
                    0.42,
                    0.98
                );
                const double setLease = f.sellingPrice > 100.0 ? f.sellingPrice : 1180.0;
                baseRate = setLease * (0.72 + tileTraffic / 115.0);
                serviceCostPerUnit = 285.0;
                f.qualityRating = std::min(100, math::round_currency(54 + f.level * 8 + tileTraffic * 0.2));
            }

            const int occupied = math::round_currency(totalUnitsAvailable * occupancy);
            f.monthlyProduction = occupied;
            f.monthlySales = occupied;
            f.lastMonthUnitsSold = occupied;
            f.monthlyRevenue = math::round_currency(occupied * baseRate);
            f.monthlyCostOfGoods = math::round_currency(occupied * serviceCostPerUnit);
            f.monthlyProfit = f.monthlyRevenue - f.monthlyCostOfGoods - totalOpCost;
            f.supplySourceLabel = "Keramaian " + std::to_string(tileTraffic) +
                "/100 · Okupansi " + std::to_string(math::js_round64(occupancy * 100.0)) + "%";
            continue;
        }

        // R&D Center
        if (f.type == FacilityType::RdCenter) {
            int unitCostSum = 0;
            for (const auto& rdUnit : f.units) {
                if (rdUnit.type != UnitType::Rd) continue;
                const ProductId prod = rdUnit.hasTargetProduct ? rdUnit.targetProductId : comp.activeResearchProduct;
                const int rawTech = comp.techLevels[static_cast<size_t>(prod)];
                const int currentTech = rawTech > 0 ? rawTech : 25;
                if (currentTech < 100 && comp.cash >= rdUnit.monthlyCost) {
                    const double speedMult = buffs.hasCTO ? 1.45 : 1.0;
                    const int techGain = std::max(1, math::round_currency(2.0 * rdUnit.level * f.level * speedMult));
                    comp.techLevels[static_cast<size_t>(prod)] = std::min(100, currentTech + techGain);
                    unitCostSum += rdUnit.monthlyCost;
                }
            }
            f.monthlyProduction = 0;
            f.monthlySales = 0;
            f.monthlyRevenue = 0;
            f.monthlyCostOfGoods = unitCostSum;
            f.monthlyProfit = -(totalOpCost + unitCostSum);
            continue;
        }

        // Media & Telecom
        if (f.type == FacilityType::MediaTelecom) {
            const int viewers = math::round_currency(static_cast<double>(next.city.population) * 0.14 * (0.7 + f.level * 0.2));
            const int adRev = math::round_currency(viewers * 0.55 * (next.city.consumerConfidence / 80.0));
            f.monthlyProduction = viewers;
            f.monthlySales = viewers;
            f.lastMonthUnitsSold = viewers;
            f.monthlyRevenue = adRev;
            f.monthlyCostOfGoods = math::round_currency(adRev * 0.22);
            f.monthlyProfit = f.monthlyRevenue - f.monthlyCostOfGoods - totalOpCost;
            continue;
        }

        const InternalUnit* primaryUnit = find_primary_product_unit(f);
        if (!primaryUnit) {
            f.monthlyProduction = 0;
            f.monthlyRevenue = 0;
            f.monthlyCostOfGoods = 0;
            f.monthlyProfit = -totalOpCost;
            continue;
        }

        const ProductId prodId = primaryUnit->targetProductId;
        const auto& prodRecipe = get_product(prodId);
        totalOpCost = compute_quality_and_brand(f, comp, buffs, prodId);

        // Tech Software
        if (f.type == FacilityType::TechSoftware) {
            int totalCap = 0;
            for (const auto& u : f.units) {
                if (u.type == UnitType::Manufacturing) totalCap += u.capacity * u.level;
            }
            if (totalCap <= 0) totalCap = 4500;
            const double effPrice = f.sellingPrice > 0.0 ? f.sellingPrice : prodRecipe.basePrice;
            const int demand = calculate_consumer_demand(
                static_cast<double>(math::round_currency(static_cast<double>(next.city.population) * 0.015 * prodRecipe.demandFactor * 10.0)),
                effPrice,
                prodRecipe.basePrice,
                static_cast<double>(f.qualityRating),
                static_cast<double>(f.brandRating),
                prodRecipe.elasticity,
                prodRecipe.appealWeights
            );
            const int soldLicenses = std::min(totalCap * f.level, std::max(200, demand));
            const double unitCost = prodRecipe.baseCost;
            f.monthlyProduction = soldLicenses;
            f.monthlySales = soldLicenses;
            f.lastMonthUnitsSold = soldLicenses;
            f.monthlyRevenue = math::round_currency(soldLicenses * effPrice);
            f.monthlyCostOfGoods = math::round_currency(soldLicenses * unitCost);
            f.monthlyProfit = f.monthlyRevenue - f.monthlyCostOfGoods - totalOpCost;
            continue;
        }

        // Warehouse & Logistics
        if (f.type == FacilityType::WarehouseLogistics) {
            int invCapBonus = 0;
            for (const auto& u : f.units) {
                if (u.type == UnitType::Inventory) invCapBonus += u.capacity;
            }
            f.inventoryCapacity = std::max(f.inventoryCapacity, invCapBonus);
            const int throughput = math::round_currency(std::min(f.inventoryCapacity * 0.4, 8000.0 * f.level));
            f.inventoryLevel = std::min(
                f.inventoryCapacity,
                math::round_currency(f.inventoryLevel * 0.6 + throughput)
            );
            f.monthlyProduction = throughput;
            f.lastMonthUnitsSold = math::round_currency(throughput * 0.8);
            f.monthlyRevenue = math::round_currency(f.lastMonthUnitsSold * (prodRecipe.basePrice * 0.12));
            f.monthlyCostOfGoods = math::round_currency(f.monthlyRevenue * 0.35);
            f.monthlyProfit = f.monthlyRevenue - f.monthlyCostOfGoods - totalOpCost;
            continue;
        }

        // Primary Extractors (Farm, Mine, Green Power Plant)
        if (f.type == FacilityType::FarmAgriculture ||
            f.type == FacilityType::MineExtraction ||
            f.type == FacilityType::PowerPlantGreen) {
            double totalMfgCapacity = 0.0;
            for (const auto& u : f.units) {
                if (u.type == UnitType::Manufacturing) {
                    totalMfgCapacity += u.capacity * u.level * u.efficiency;
                }
            }
            const double unitCost = prodRecipe.baseCost * (1.08 - f.level * 0.03);
            f.supplySourceLabel = "Ekstraksi Mandiri";

            const int producedUnits = math::round_currency(totalMfgCapacity * f.level);
            f.monthlyProduction = producedUnits;
            f.inventoryLevel = std::min(f.inventoryCapacity, f.inventoryLevel + producedUnits);
            f.lastMonthUnitsSold = 0;
            f.monthlyRevenue = 0;
            f.monthlyCostOfGoods = 0;
            f.monthlyProfit = -totalOpCost;

            const int gridPowerRev = (f.type == FacilityType::PowerPlantGreen)
                ? math::round_currency(static_cast<double>(next.city.population) * 0.032 * (0.85 + f.level * 0.22))
                : 0;

            producerMeta.emplace(fid, ProducerMeta{unitCost, totalOpCost, gridPowerRev, prodId});
            continue;
        }

        // Retail Store baseline (Stage 2)
        f.monthlyProduction = 0;
        if (is_store_facility(f.type)) {
            storesByProduct[static_cast<size_t>(prodId)].push_back(&f);
        }
    }
}

void process_stage1b_factories(
    SimulationState& next,
    const std::unordered_map<std::string, ExecBuffs>& execBuffs,
    const std::vector<Facility*>& processingQueue,
    const std::vector<Facility*>& assemblyQueue,
    std::unordered_map<std::string, ProducerMeta>& producerMeta
) {
    auto run_factory = [&](Facility& f) {
        auto compIt = next.companies.find(f.companyId);
        if (compIt == next.companies.end()) return;
        const Company& comp = compIt->second;
        const auto& buffs = execBuffs.at(f.companyId);
        const InternalUnit* primaryUnit = find_primary_product_unit(f);

        const int effectiveMaint = buffs.hasCOO
            ? math::round_currency(static_cast<double>(f.monthlyMaintenance) * 0.85)
            : math::round_currency(static_cast<double>(f.monthlyMaintenance));

        if (!primaryUnit) {
            f.monthlyProduction = 0;
            f.monthlyRevenue = 0;
            f.monthlyCostOfGoods = 0;
            f.monthlyProfit = -(effectiveMaint + math::round_currency(static_cast<double>(f.adBudget)));
            return;
        }

        const ProductId prodId = primaryUnit->targetProductId;
        const auto& prodRecipe = get_product(prodId);
        const int totalOpCost = compute_quality_and_brand(f, comp, buffs, prodId);

        double totalMfgCapacity = 0.0;
        const InternalUnit* purchasingUnit = nullptr;
        for (const auto& u : f.units) {
            if (u.type == UnitType::Manufacturing) {
                totalMfgCapacity += u.capacity * u.level * u.efficiency;
            } else if (u.type == UnitType::Purchasing && !purchasingUnit) {
                purchasingUnit = &u;
            }
        }

        double unitCost = prodRecipe.baseCost * (1.08 - f.level * 0.03);
        const int producedUnits = math::round_currency(totalMfgCapacity * f.level);

        Facility* supplierFac = nullptr;
        if (purchasingUnit && !purchasingUnit->supplierFacilityId.empty() &&
            purchasingUnit->supplierFacilityId != "seaport" &&
            purchasingUnit->supplierFacilityId != f.id) {
            auto sIt = next.facilities.find(purchasingUnit->supplierFacilityId);
            if (sIt != next.facilities.end()) supplierFac = &sIt->second;
        }
        const bool isInternalSupplier = (supplierFac != nullptr && supplierFac->companyId == f.companyId);

        if (!prodRecipe.inputs.empty()) {
            const InternalUnit* sPrim = supplierFac ? find_primary_product_unit(*supplierFac) : nullptr;
            double inputCost = 0.0;

            for (const auto& inp : prodRecipe.inputs) {
                const auto& inpRecipe = get_product(inp.productId);
                const bool canPull = (supplierFac != nullptr && sPrim != nullptr &&
                                      sPrim->targetProductId == inp.productId &&
                                      supplierFac->inventoryLevel > 10 && producedUnits > 0);
                if (canPull) {
                    const int neededQty = math::round_currency(producedUnits * inp.amount);
                    const int pulled = std::min(neededQty, supplierFac->inventoryLevel);
                    supplierFac->inventoryLevel -= pulled;

                    const double transferPrice = isInternalSupplier
                        ? math::round2(inpRecipe.baseCost * 1.02)
                        : math::round2(supplierFac->sellingPrice > 0.0 ? supplierFac->sellingPrice : inpRecipe.basePrice * 0.85);

                    auto metaIt = producerMeta.find(supplierFac->id);
                    if (metaIt != producerMeta.end() && pulled > 0) {
                        supplierFac->lastMonthUnitsSold += pulled;
                        supplierFac->monthlyRevenue += math::round_currency(pulled * transferPrice);
                        supplierFac->monthlyCostOfGoods += math::round_currency(pulled * metaIt->second.unitCost);
                    }

                    const int remainder = std::max(0, neededQty - pulled);
                    const double seaportCost = inpRecipe.basePrice * (1.0 + next.macro.importTariffRate);
                    const double blendedUnitInputCost = neededQty > 0
                        ? (pulled * transferPrice + remainder * seaportCost) / static_cast<double>(neededQty)
                        : transferPrice;
                    inputCost += blendedUnitInputCost * inp.amount;
                } else {
                    const double marketInputPrice = isInternalSupplier ? inpRecipe.baseCost * 1.05 : inpRecipe.basePrice;
                    inputCost += marketInputPrice * inp.amount;
                }
            }

            unitCost = std::max(unitCost * 0.8, inputCost * (isInternalSupplier ? 0.88 : 1.02));
            f.supplySourceLabel = isInternalSupplier ? "Internal"
                : supplierFac ? "B2B Domestik" : "Pelabuhan Impor";

            if (supplierFac) {
                f.qualityRating = std::min(100, math::round_currency(f.qualityRating * 0.7 + supplierFac->qualityRating * 0.3));
            }
        } else {
            f.supplySourceLabel = "Ekstraksi Mandiri";
        }

        f.monthlyProduction = producedUnits;
        f.inventoryLevel = std::min(f.inventoryCapacity, f.inventoryLevel + producedUnits);
        f.lastMonthUnitsSold = 0;
        f.monthlyRevenue = 0;
        f.monthlyCostOfGoods = 0;
        f.monthlyProfit = -totalOpCost;

        producerMeta.emplace(f.id, ProducerMeta{unitCost, totalOpCost, 0, prodId});
    };

    for (Facility* pf : processingQueue) run_factory(*pf);
    for (Facility* af : assemblyQueue) run_factory(*af);
}

void process_stage2_retail_competition(
    SimulationState& next,
    const SimulationState& prevState,
    const std::unordered_map<std::string, ExecBuffs>& execBuffs,
    const TrafficGridView& traffic,
    const std::array<std::vector<Facility*>, PRODUCT_COUNT>& storesByProduct,
    const std::unordered_map<std::string, ProducerMeta>& producerMeta
) {
    const double popGrowth = (next.macro.cyclePhase == EconomicCyclePhase::Recession) ? 0.001 : 0.0035;
    const double confTarget =
        next.macro.cyclePhase == EconomicCyclePhase::Boom ? 92.0
        : next.macro.cyclePhase == EconomicCyclePhase::Recession ? 62.0
        : next.macro.cyclePhase == EconomicCyclePhase::Recovery ? 78.0
        : 82.0;

    next.city.population = math::round_currency64(static_cast<double>(prevState.city.population) * (1.0 + popGrowth));
    next.city.averageWage = math::round_currency(static_cast<double>(prevState.city.averageWage) * (1.0 + next.macro.inflationRate / 1200.0));
    next.city.consumerConfidence = math::clamp_val(
        math::round_currency(prevState.city.consumerConfidence * 0.85 + confTarget * 0.15),
        20,
        100
    );

    struct StoreScore {
        Facility* store;
        int score;
        double trafficMult;
    };

    for (size_t pIdx = 0; pIdx < PRODUCT_COUNT; ++pIdx) {
        const auto prodId = static_cast<ProductId>(pIdx);
        const auto& prod = get_product(prodId);
        if (prod.category != ProductCategory::Consumer && prod.category != ProductCategory::Digital) continue;

        const int baseDemand = math::round_currency(
            static_cast<double>(next.city.population) *
            0.042 *
            (prod.demandFactor > 0.0 ? prod.demandFactor : 0.25) *
            (static_cast<double>(next.city.averageWage) / 4200.0) *
            (static_cast<double>(next.city.consumerConfidence) / 100.0)
        );

        const auto& stores = storesByProduct[pIdx];
        if (stores.empty()) {
            next.city.productStats[pIdx] = {baseDemand, 0, prod.basePrice, 0, 0, 100};
            continue;
        }

        std::vector<StoreScore> scores;
        scores.reserve(stores.size());
        double totalScore = 0.0;
        double totalSellingPrice = 0.0;
        int seaportVolume = 0;

        for (Facility* storePtr : stores) {
            Facility& store = *storePtr;
            auto compIt = next.companies.find(store.companyId);
            const Company* comp = (compIt != next.companies.end()) ? &compIt->second : nullptr;
            const auto& buffs = execBuffs.at(store.companyId);

            if (store.autoPricing && buffs.hasCOO) {
                const double invRatio = math::safe_divide(
                    static_cast<double>(store.inventoryLevel),
                    static_cast<double>(std::max(1, store.inventoryCapacity)),
                    0.0
                );
                if (invRatio > 0.75) {
                    store.sellingPrice = std::max(
                        static_cast<double>(math::round_currency(prod.baseCost * 1.15)),
                        static_cast<double>(math::round_currency(store.sellingPrice * 0.96))
                    );
                } else if (invRatio < 0.2) {
                    store.sellingPrice = std::min(
                        static_cast<double>(math::round_currency(prod.basePrice * 1.35)),
                        static_cast<double>(math::round_currency(store.sellingPrice * 1.03))
                    );
                }
            }

            const InternalUnit* purchasingUnit = find_unit_by_type(store, UnitType::Purchasing);
            Facility* supplierFac = nullptr;
            if (purchasingUnit && !purchasingUnit->supplierFacilityId.empty() &&
                purchasingUnit->supplierFacilityId != "seaport") {
                auto sIt = next.facilities.find(purchasingUnit->supplierFacilityId);
                if (sIt != next.facilities.end()) supplierFac = &sIt->second;
            }

            if (supplierFac && supplierFac->inventoryLevel > 0) {
                const bool isInternal = (supplierFac->companyId == store.companyId);
                store.supplySourceLabel = isInternal ? "Pabrik Internal" : "Grosir B2B";
                store.qualityRating = std::min(
                    100,
                    math::round_currency(supplierFac->qualityRating * 0.8 + store.level * 4.0)
                );
            } else {
                store.supplySourceLabel = "Pelabuhan Impor";
                const int rawTech = comp ? comp->techLevels[pIdx] : 30;
                const int techLevel = rawTech > 0 ? rawTech : 30;
                store.qualityRating = std::min(
                    100,
                    math::round_currency(45.0 + store.level * 3.0 + techLevel * 0.2)
                );
            }

            const double price = std::max(1.0, math::finite_or(store.sellingPrice, prod.basePrice));
            totalSellingPrice += price;

            const int tileTraffic = traffic.at(store.tileX, store.tileY);
            const double trafficMult = spatial::get_traffic_demand_multiplier(tileTraffic);

            const int rawDemandScore = calculate_consumer_demand(
                static_cast<double>(baseDemand),
                price,
                prod.basePrice,
                static_cast<double>(store.qualityRating),
                static_cast<double>(store.brandRating),
                prod.elasticity,
                prod.appealWeights
            );
            const int demandScore = rawDemandScore > 0
                ? std::max(1, math::round_currency(static_cast<double>(rawDemandScore) * trafficMult))
                : 0;

            scores.push_back({storePtr, demandScore, trafficMult});
            totalScore += demandScore;
        }

        const double averageMarketPrice = math::round2(totalSellingPrice / static_cast<double>(stores.size()));
        int totalSoldInCity = 0;
        int playerSoldInCity = 0;

        for (const auto& item : scores) {
            Facility& store = *item.store;
            const double marketShareFrac = totalScore > 0.0
                ? math::safe_divide(static_cast<double>(item.score), totalScore, 0.0)
                : 0.0;
            const int allocatedCustomerDemand = std::min({
                item.score,
                baseDemand,
                math::round_currency(baseDemand * marketShareFrac * (0.85 + item.trafficMult * 0.16))
            });

            int salesCapacity = 0;
            int purchasingCap = 0;
            const InternalUnit* purchasingUnit = nullptr;
            for (const auto& u : store.units) {
                if (u.type == UnitType::Sales) salesCapacity += u.capacity * u.level;
                else if (u.type == UnitType::Purchasing) {
                    purchasingCap += u.capacity * u.level;
                    if (!purchasingUnit) purchasingUnit = &u;
                }
            }
            if (salesCapacity <= 0) salesCapacity = 6500;
            if (purchasingCap <= 0) purchasingCap = 8000;

            const int storeMaxCapacity = salesCapacity * store.level;
            Facility* supplierFac = nullptr;
            if (purchasingUnit && !purchasingUnit->supplierFacilityId.empty() &&
                purchasingUnit->supplierFacilityId != "seaport") {
                auto sIt = next.facilities.find(purchasingUnit->supplierFacilityId);
                if (sIt != next.facilities.end()) supplierFac = &sIt->second;
            }

            double procurementUnitCost = math::round2(prod.seaportPrice * (1.0 + next.macro.importTariffRate));

            const int restockHeadroom = std::max(
                0,
                store.inventoryCapacity - store.inventoryLevel + allocatedCustomerDemand
            );
            int supplyProcured = std::min(math::round_currency(purchasingCap * store.level), restockHeadroom);

            if (supplierFac && supplierFac->inventoryLevel > 10 && supplyProcured > 0) {
                const int pulled = std::min(supplyProcured, supplierFac->inventoryLevel);
                supplierFac->inventoryLevel -= pulled;
                supplyProcured = pulled;
                const bool isInternal = (supplierFac->companyId == store.companyId);
                const double transferPrice = isInternal
                    ? math::round2(prod.baseCost * 1.02)
                    : math::round2(supplierFac->sellingPrice > 0.0 ? supplierFac->sellingPrice : prod.basePrice * 0.72);
                procurementUnitCost = transferPrice;

                auto metaIt = producerMeta.find(supplierFac->id);
                if (metaIt != producerMeta.end()) {
                    supplierFac->lastMonthUnitsSold += pulled;
                    supplierFac->monthlyRevenue += math::round_currency(pulled * transferPrice);
                    supplierFac->monthlyCostOfGoods += math::round_currency(pulled * metaIt->second.unitCost);
                }
            } else if (supplyProcured > 0) {
                seaportVolume += supplyProcured;
            }

            store.inventoryLevel = std::min(store.inventoryCapacity, store.inventoryLevel + supplyProcured);

            const int actualSales = std::min({allocatedCustomerDemand, store.inventoryLevel, storeMaxCapacity});
            store.inventoryLevel = std::max(0, store.inventoryLevel - actualSales);
            store.lastMonthUnitsSold = actualSales;

            const int effectiveMaint = execBuffs.at(store.companyId).hasCOO
                ? math::round_currency(static_cast<double>(store.monthlyMaintenance) * 0.85)
                : math::round_currency(static_cast<double>(store.monthlyMaintenance));

            store.monthlyRevenue = math::round_currency(actualSales * store.sellingPrice);
            store.monthlyCostOfGoods = math::round_currency(actualSales * procurementUnitCost);
            store.monthlyProfit = store.monthlyRevenue - store.monthlyCostOfGoods - effectiveMaint - math::round_currency(static_cast<double>(store.adBudget));

            totalSoldInCity += actualSales;
            if (store.companyId == next.playerCompanyId) {
                playerSoldInCity += actualSales;
            }
        }

        next.city.productStats[pIdx] = {
            baseDemand,
            totalSoldInCity,
            averageMarketPrice,
            totalSoldInCity > 0 ? math::round_currency((static_cast<double>(playerSoldInCity) / totalSoldInCity) * 100.0) : 0,
            std::min(100, math::round_currency((static_cast<double>(totalSoldInCity) / std::max(1, baseDemand)) * 100.0)),
            totalSoldInCity > 0
                ? std::min(100, math::round_currency((static_cast<double>(seaportVolume) / std::max(1, totalSoldInCity + seaportVolume)) * 100.0))
                : 100
        };
    }
}

void finalize_stage3_upstream_surplus(
    SimulationState& next,
    const std::unordered_map<std::string, ProducerMeta>& producerMeta
) {
    for (const auto& [fId, meta] : producerMeta) {
        auto fIt = next.facilities.find(fId);
        if (fIt == next.facilities.end()) continue;
        Facility& f = fIt->second;
        const auto& prodRecipe = get_product(meta.primaryProdId);

        const double wholesalePrice = math::round2(f.sellingPrice > 0.0 ? f.sellingPrice : prodRecipe.basePrice);
        const int surplusDemand = math::round_currency(f.inventoryLevel * 0.65 * (static_cast<double>(next.city.consumerConfidence) / 85.0));
        const int surplusSold = std::min(f.inventoryLevel, surplusDemand);

        f.inventoryLevel -= surplusSold;
        f.lastMonthUnitsSold += surplusSold;
        f.monthlySales = f.lastMonthUnitsSold;
        f.monthlyRevenue += math::round_currency(surplusSold * wholesalePrice) + meta.gridPowerRev;
        f.monthlyCostOfGoods += math::round_currency(surplusSold * meta.unitCost);
        f.monthlyProfit = f.monthlyRevenue - f.monthlyCostOfGoods - meta.effectiveOpCost;
    }
}

void settle_stage4_corporate_pnl_and_valuation(
    SimulationState& next,
    const std::unordered_map<std::string, ExecBuffs>& execBuffs,
    const std::string& monthStr,
    int nextMonth
) {
    std::unordered_map<std::string, std::vector<const Facility*>> facilitiesByCompany;
    facilitiesByCompany.reserve(next.companies.size());
    int64_t totalMarketRevenue = 0;

    for (const auto& fid : next.facilityOrder) {
        const auto& fac = next.facilities.at(fid);
        totalMarketRevenue += fac.monthlyRevenue;
        facilitiesByCompany[fac.companyId].push_back(&fac);
    }

    std::unordered_map<std::string, double> paidDividendsByCompany;
    std::unordered_map<std::string, int> companyNetProfits;
    std::unordered_map<std::string, int> companyTotalRevenues;
    paidDividendsByCompany.reserve(next.companies.size());
    companyNetProfits.reserve(next.companies.size());
    companyTotalRevenues.reserve(next.companies.size());

    // Pass 4A
    for (const auto& cid : next.companyOrder) {
        auto& company = next.companies.at(cid);
        const auto& owned = facilitiesByCompany[cid];
        company.facilitiesCount = static_cast<int>(owned.size());

        int totalRevenue = 0;
        int sumFacilityProfit = 0;
        for (const auto* f : owned) {
            totalRevenue += f->monthlyRevenue;
            sumFacilityProfit += f->monthlyProfit;
        }

        const int execPayroll = execBuffs.at(cid).payroll;
        const int bankInterest = math::round_currency(static_cast<double>(company.debt) * company.monthlyInterestRate);
        const int bondInterest = math::round_currency(static_cast<double>(company.bondDebt) * 0.0045);
        const int loanInterest = bankInterest + bondInterest;

        const int netProfit = math::round_currency(static_cast<double>(sumFacilityProfit - execPayroll - loanInterest));
        companyNetProfits[cid] = netProfit;
        companyTotalRevenues[cid] = totalRevenue;

        company.cash = math::round_currency64(static_cast<double>(company.cash) + netProfit);

        const int64_t founderHeld = company.shareholdings.contains(cid) ? company.shareholdings.at(cid) : 0;
        const int64_t externalShares = std::max<int64_t>(0, company.sharesOutstanding - company.treasuryShares - founderHeld);
        if (company.dividendPerShare > 0.0 && externalShares > 0 && company.cash > 500000) {
            const int64_t totalDividend = math::round_currency64(static_cast<double>(externalShares) * company.dividendPerShare);
            if (company.cash >= totalDividend) {
                company.cash -= totalDividend;
                paidDividendsByCompany[cid] = company.dividendPerShare;
            }
        }
    }

    // Pass 4B: Verified cross-holding dividends (conservation guaranteed)
    for (const auto& cid : next.companyOrder) {
        auto& company = next.companies.at(cid);
        for (const auto& [targetId, sharesOwned] : company.shareholdings) {
            if (targetId != cid && sharesOwned > 0) {
                auto pIt = paidDividendsByCompany.find(targetId);
                if (pIt != paidDividendsByCompany.end() && pIt->second > 0.0) {
                    company.cash += math::round_currency64(static_cast<double>(sharesOwned) * pIt->second);
                }
            }
        }
    }

    // Pass 4C: History, Assets, Equity & Deterministic Stock Valuation
    for (const auto& cid : next.companyOrder) {
        auto& company = next.companies.at(cid);
        const auto& owned = facilitiesByCompany[cid];
        const int totalRevenue = companyTotalRevenues[cid];
        const int netProfit = companyNetProfits[cid];
        const int64_t totalDebt = company.debt + company.bondDebt;

        company.history.months.push_back(monthStr);
        company.history.revenue.push_back(totalRevenue);
        company.history.netProfit.push_back(netProfit);
        company.history.cash.push_back(company.cash);

        if (company.history.months.size() > 12) {
            company.history.months.erase(company.history.months.begin());
            company.history.revenue.erase(company.history.revenue.begin());
            company.history.netProfit.erase(company.history.netProfit.begin());
            company.history.cash.erase(company.history.cash.begin());
            if (!company.history.marketCap.empty()) {
                company.history.marketCap.erase(company.history.marketCap.begin());
            }
        }

        company.lastMonthRevenue = totalRevenue;
        company.lastMonthNetProfit = netProfit;
        company.marketSharePercentage = totalMarketRevenue > 0
            ? math::round_currency((static_cast<double>(totalRevenue) / static_cast<double>(totalMarketRevenue)) * 100.0)
            : 0;

        double facilitiesBookValue = 0.0;
        for (const auto* f : owned) {
            const auto& spec = get_facility_spec(f->type);
            const double cost = spec.constructionCost > 0 ? static_cast<double>(spec.constructionCost) : 500000.0;
            facilitiesBookValue += cost * (0.85 + f->level * 0.1);
        }

        double portfolioValue = 0.0;
        for (const auto& [tId, cnt] : company.shareholdings) {
            if (tId != cid && cnt > 0) {
                auto targetIt = next.companies.find(tId);
                if (targetIt != next.companies.end()) {
                    portfolioValue += static_cast<double>(cnt) * targetIt->second.stockPrice;
                }
            }
        }

        company.totalAssets = math::round_currency64(static_cast<double>(company.cash) + facilitiesBookValue + portfolioValue);
        company.bookValue = std::max<int64_t>(100000, company.totalAssets - totalDebt);

        const double annualNetProfit = static_cast<double>(netProfit) * 12.0;
        const int64_t effectiveShares = std::max<int64_t>(100000, company.sharesOutstanding - company.treasuryShares);
        const double eps = math::clamp_val(annualNetProfit / static_cast<double>(effectiveShares), -5.0, 20.0);
        const double macroPEBias =
            next.macro.cyclePhase == EconomicCyclePhase::Boom ? 3.0
            : next.macro.cyclePhase == EconomicCyclePhase::Recession ? -3.0
            : 0.0;
        const double peMultiple = math::clamp_val(14.0 + (netProfit > 0 ? 3.0 : -2.0) + macroPEBias, 7.0, 24.0);

        const double earningsValuation = std::max(3.0, eps * peMultiple);
        const double bookValuePerShare = std::max(
            2.0,
            math::safe_divide(static_cast<double>(company.bookValue), static_cast<double>(company.sharesOutstanding), 2.0)
        );

        const double targetPrice = math::clamp_val(
            math::round2(bookValuePerShare * 0.42 + earningsValuation * 0.58),
            1.0,
            160.0
        );

        const uint32_t idSeed = math::deterministic_hash(company.ticker) % 256;
        const double sentimentWave = 1.0 + std::sin((nextMonth * 1.3 + idSeed) * 0.7) * 0.012;
        company.stockPrice = math::clamp_val(
            math::round2((company.stockPrice * 0.85 + targetPrice * 0.15) * sentimentWave),
            1.0,
            250.0
        );
        company.sharePriceHistory.push_back(company.stockPrice);
        if (company.sharePriceHistory.size() > 24) {
            company.sharePriceHistory.erase(company.sharePriceHistory.begin());
        }

        company.marketCap = math::round_currency64(company.stockPrice * static_cast<double>(company.sharesOutstanding));
        company.history.marketCap.push_back(company.marketCap);
        company.peRatio = eps > 0.0 ? math::round1(company.stockPrice / eps) : 0.0;
    }
}

} // namespace

SimulationState simulate_economic_month(const SimulationState& state) {
    const int nextMonth = state.currentTick + 1;
    const int year = 2026 + (nextMonth / 12);
    const std::string monthStr = std::string(MONTH_NAMES[nextMonth % 12]) + " " + std::to_string(year);

    SimulationState next = state;
    next.currentTick = nextMonth;
    next.dateString = monthStr;
    next.macro = advance_macro_economy(state.macro, nextMonth);

    std::unordered_map<std::string, ExecBuffs> execBuffs;
    prepare_companies_and_buffs(next, execBuffs);

    const int parcelGridSize = spatial::infer_grid_size(next.mapParcels.size());
    const auto trafficGrid = spatial::build_traffic_lookup_grid(next.mapParcels, parcelGridSize);
    const TrafficGridView traffic{trafficGrid, parcelGridSize};

    std::unordered_map<std::string, ProducerMeta> producerMeta;
    producerMeta.reserve(next.facilities.size());
    std::vector<Facility*> processingQueue;
    std::vector<Facility*> assemblyQueue;
    std::array<std::vector<Facility*>, PRODUCT_COUNT> storesByProduct;

    process_stage1_non_factories(
        next, execBuffs, traffic, producerMeta, processingQueue, assemblyQueue, storesByProduct);
    process_stage1b_factories(
        next, execBuffs, processingQueue, assemblyQueue, producerMeta);
    process_stage2_retail_competition(
        next, state, execBuffs, traffic, storesByProduct, producerMeta);
    finalize_stage3_upstream_surplus(next, producerMeta);
    settle_stage4_corporate_pnl_and_valuation(next, execBuffs, monthStr, nextMonth);

    const double inflationStepFactor = 1.0 + next.macro.inflationRate / 2400.0;
    spatial::recalculate_city_traffic(next.mapParcels, next.facilities, inflationStepFactor);

    return next;
}

} // namespace caplab
