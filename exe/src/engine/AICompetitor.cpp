#include "AICompetitor.hpp"
#include "FacilityUnits.hpp"
#include "ProductsData.hpp"
#include "SaveSystem.hpp"
#include "SpatialGrid.hpp"
#include "../core/PrecisionMath.hpp"

#include <algorithm>
#include <limits>
#include <thread>
#include <vector>

namespace caplab::ai {

namespace {

struct Palette {
    uint32_t color;
    uint32_t accent;
};

constexpr Palette GENERATED_ENTRANT_COLORS[6] = {
    {0x0369a1, 0x38bdf8},
    {0x6d28d9, 0xa78bfa},
    {0x047857, 0x34d399},
    {0xc2410c, 0xfb923c},
    {0xbe123c, 0xfb7185},
    {0x4338ca, 0x818cf8},
};

bool is_producer_or_warehouse(const Facility& fac) noexcept {
    return fac.type == FacilityType::FactoryProcessing ||
           fac.type == FacilityType::FactoryAssembly ||
           fac.type == FacilityType::FarmAgriculture ||
           fac.type == FacilityType::MineExtraction ||
           fac.type == FacilityType::PowerPlantGreen ||
           fac.type == FacilityType::WarehouseLogistics;
}

ProductId pick_market_gap_product(
    const SimulationState& state,
    std::initializer_list<ProductId> candidates,
    const std::vector<const Facility*>& aiFacilities
) {
    ProductId best = *candidates.begin();
    double bestScore = -std::numeric_limits<double>::infinity();

    for (ProductId prodId : candidates) {
        const auto& prod = get_product(prodId);
        const auto& stat = state.city.productStats[static_cast<size_t>(prodId)];
        const int importGap = stat.seaportImportShare;
        const int unmetGap = std::max(0, 100 - stat.satisfactionRate);

        bool alreadyOperating = false;
        for (const auto* f : aiFacilities) {
            for (const auto& u : f->units) {
                if (u.hasTargetProduct && u.targetProductId == prodId) {
                    alreadyOperating = true;
                    break;
                }
            }
            if (alreadyOperating) break;
        }

        const double marginBonus = (prod.basePrice > prod.baseCost * 1.8) ? 14.0 : 6.0;
        const double score =
            importGap * 0.55 +
            unmetGap * 0.85 +
            marginBonus -
            (alreadyOperating ? 28.0 : 0.0);

        if (score > bestScore) {
            bestScore = score;
            best = prodId;
        }
    }
    return best;
}

const MapParcel* find_available_parcel_readonly(
    const std::vector<MapParcel>& mapParcels,
    ZonePref preferredZone
) {
    const MapParcel* firstEmpty = nullptr;
    const MapParcel* bestTrafficParcel = nullptr;
    int bestTrafficScore = -1;

    for (const auto& p : mapParcels) {
        if (!p.facilityId.empty() || !p.isZoneAllowed ||
            p.terrainType == TerrainType::Water || p.terrainType == TerrainType::Road) {
            continue;
        }
        if (!firstEmpty) firstEmpty = &p;

        if (preferredZone == ZonePref::Industrial) {
            if (p.terrainType == TerrainType::IndustrialZone) {
                return &p;
            }
        } else if (p.terrainType == TerrainType::Pavement || p.terrainType == TerrainType::Grass) {
            if (p.trafficIndex > bestTrafficScore) {
                bestTrafficScore = p.trafficIndex;
                bestTrafficParcel = &p;
            }
        }
    }

    if (bestTrafficParcel) return bestTrafficParcel;
    return firstEmpty;
}

struct AITurnOutput {
    Company updatedCompany;
    std::vector<Facility> updatedFacilities;
    std::optional<Facility> newFacility;
    ZonePref newFacilityZone = ZonePref::Commercial;
    std::string newFacilityTargetProdName;
    bool parcelsChanged = false;
    std::string newsEvent;
};

AITurnOutput process_ai_company_turn(
    const SimulationState& workingState,
    const Company& aiCompany,
    const AISharedContext& ctx
) {
    AITurnOutput out;
    out.updatedCompany = aiCompany;
    const AIPersonality personality =
        (aiCompany.personality == AIPersonality::None) ? AIPersonality::Expansionist : aiCompany.personality;

    static const std::vector<const Facility*> emptyFacs;
    auto cfIt = ctx.facilitiesByCompany.find(aiCompany.id);
    const auto& aiFacilities = (cfIt != ctx.facilitiesByCompany.end()) ? cfIt->second : emptyFacs;

    // 1. Intelligent Pricing & O(1)-indexed B2B/Internal Supply Chain Linking
    for (const auto* origFac : aiFacilities) {
        Facility f = *origFac;
        bool changed = false;

        const InternalUnit* primaryUnit = nullptr;
        for (const auto& u : f.units) {
            if (u.hasTargetProduct) { primaryUnit = &u; break; }
        }

        if (is_store_facility(f.type) && primaryUnit) {
            const auto& prod = get_product(primaryUnit->targetProductId);
            const double invRatio = static_cast<double>(f.inventoryLevel) / static_cast<double>(std::max(1, f.inventoryCapacity));
            double nextPrice = (f.sellingPrice > 0.0) ? f.sellingPrice : prod.basePrice;

            if (invRatio > 0.78) {
                nextPrice = std::max(
                    static_cast<double>(math::round_currency(prod.baseCost * 1.18)),
                    static_cast<double>(math::round_currency(nextPrice * 0.96))
                );
            } else if (invRatio < 0.18) {
                nextPrice = std::min(
                    static_cast<double>(math::round_currency(prod.basePrice * 1.36)),
                    static_cast<double>(math::round_currency(nextPrice * 1.03))
                );
            }

            if (personality == AIPersonality::Expansionist) {
                nextPrice = std::min(nextPrice, static_cast<double>(math::round_currency(prod.basePrice * 0.95)));
            } else if (personality == AIPersonality::QualityFirst || personality == AIPersonality::BrandTitan) {
                nextPrice = std::max(nextPrice, static_cast<double>(math::round_currency(prod.basePrice * 1.15)));
            }

            if (nextPrice != f.sellingPrice) {
                f.sellingPrice = nextPrice;
                changed = true;
            }
        } else if (f.type == FacilityType::ApartmentComplex || f.type == FacilityType::CommercialTower) {
            const double targetRent = (f.type == FacilityType::CommercialTower) ? 1240.0 : 940.0;
            const double macroFactor =
                workingState.macro.cyclePhase == EconomicCyclePhase::Boom ? 1.08
                : workingState.macro.cyclePhase == EconomicCyclePhase::Recession ? 0.90
                : 1.0;
            const int nextRent = math::round_currency(targetRent * macroFactor);
            if (std::abs(f.sellingPrice - static_cast<double>(nextRent)) > 35.0) {
                f.sellingPrice = static_cast<double>(nextRent);
                changed = true;
            }
        }

        InternalUnit* purchasingUnit = nullptr;
        for (auto& u : f.units) {
            if (u.type == UnitType::Purchasing) { purchasingUnit = &u; break; }
        }
        if (purchasingUnit && primaryUnit) {
            const auto& recipe = get_product(primaryUnit->targetProductId);
            std::vector<ProductId> neededIds;
            if (is_store_facility(f.type) || f.type == FacilityType::WarehouseLogistics) {
                neededIds.push_back(primaryUnit->targetProductId);
            } else {
                for (const auto& inp : recipe.inputs) neededIds.push_back(inp.productId);
            }

            if (!neededIds.empty()) {
                const Facility* ownBest = nullptr;
                const Facility* externalBest = nullptr;
                for (ProductId nId : neededIds) {
                    const auto& candidates = ctx.suppliersByProduct[static_cast<size_t>(nId)];
                    for (const auto* sf : candidates) {
                        if (sf->id == f.id) continue;
                        if (sf->companyId == aiCompany.id) {
                            if (!ownBest || sf->qualityRating > ownBest->qualityRating) ownBest = sf;
                        } else {
                            if (!externalBest || sf->qualityRating > externalBest->qualityRating) externalBest = sf;
                        }
                    }
                }
                const Facility* chosenSupplier = ownBest ? ownBest : externalBest;
                if (chosenSupplier && purchasingUnit->supplierFacilityId != chosenSupplier->id) {
                    purchasingUnit->supplierFacilityId = chosenSupplier->id;
                    f.supplySourceLabel = (chosenSupplier->companyId == aiCompany.id) ? "Pabrik Internal" : "Grosir B2B";
                    changed = true;
                }
            }
        }

        if (changed) out.updatedFacilities.push_back(std::move(f));
    }

    // 2. Smart Debt Reduction
    if (out.updatedCompany.debt > 250000 &&
        out.updatedCompany.cash > 5500000 &&
        workingState.macro.centralBankRate >= 4.5) {
        const int64_t repayAmt = std::min<int64_t>(out.updatedCompany.debt, 500000);
        out.updatedCompany.cash -= repayAmt;
        out.updatedCompany.debt -= repayAmt;
    }

    // 3. Smart C-Suite Executive Hiring
    if (aiFacilities.size() >= 2 &&
        out.updatedCompany.lastMonthNetProfit > 85000 &&
        out.updatedCompany.cash > 6800000 &&
        !out.updatedCompany.executives.empty()) {
        const ExecutiveRole targetRole =
            (personality == AIPersonality::QualityFirst || personality == AIPersonality::TechInnovator) ? ExecutiveRole::CTO
            : (personality == AIPersonality::BrandTitan) ? ExecutiveRole::CMO
            : ExecutiveRole::COO;

        ExecutiveOfficer* targetExec = nullptr;
        for (auto& e : out.updatedCompany.executives) {
            if (e.role == targetRole && !e.hired) { targetExec = &e; break; }
        }
        if (!targetExec) {
            for (auto& e : out.updatedCompany.executives) {
                if (!e.hired) { targetExec = &e; break; }
            }
        }
        if (targetExec && out.updatedCompany.cash > targetExec->monthlySalary + 5000000) {
            targetExec->hired = true;
            out.updatedCompany.cash -= targetExec->monthlySalary;
        }
    }

    const int64_t CASH_SAFETY_BUFFER =
        (workingState.macro.cyclePhase == EconomicCyclePhase::Recession) ? 4500000 : 3000000;

    // 4. Smart Existing Facility Upgrade / 3x3 Slot Installation
    if (out.updatedCompany.lastMonthNetProfit > 30000 &&
        out.updatedCompany.cash > CASH_SAFETY_BUFFER + 600000) {
        const Facility* expandableFac = nullptr;
        for (const auto* f : aiFacilities) {
            if (f->type != FacilityType::CorporateHq && f->monthlyProfit > 25000 && f->units.size() < 7) {
                expandableFac = f;
                break;
            }
        }

        if (expandableFac) {
            bool occupied[9]{};
            for (const auto& u : expandableFac->units) {
                if (u.slotIndex >= 0 && u.slotIndex < 9) occupied[u.slotIndex] = true;
            }
            int freeSlot = -1;
            for (int s : {2, 3, 5, 6, 7, 8}) {
                if (!occupied[s]) { freeSlot = s; break; }
            }
            if (freeSlot >= 0) {
                int salesCount = 0;
                for (const auto& u : expandableFac->units) if (u.type == UnitType::Sales) ++salesCount;
                const UnitType unitToAdd = is_store_facility(expandableFac->type)
                    ? (salesCount < 2 ? UnitType::Sales : UnitType::Advertising)
                    : (expandableFac->type == FacilityType::RdCenter ? UnitType::Rd : UnitType::Manufacturing);

                const int64_t installCost = get_unit_install_cost(unitToAdd);
                if (out.updatedCompany.cash >= installCost + CASH_SAFETY_BUFFER) {
                    int existingIdx = -1;
                    for (size_t i = 0; i < out.updatedFacilities.size(); ++i) {
                        if (out.updatedFacilities[i].id == expandableFac->id) { existingIdx = static_cast<int>(i); break; }
                    }
                    const Facility& baseFac = (existingIdx >= 0) ? out.updatedFacilities[existingIdx] : *expandableFac;
                    Facility upgraded = add_unit_to_facility_slot(baseFac, freeSlot, unitToAdd);
                    if (existingIdx >= 0) out.updatedFacilities[existingIdx] = std::move(upgraded);
                    else out.updatedFacilities.push_back(std::move(upgraded));
                    out.updatedCompany.cash -= installCost;
                }
            }
        } else {
            const Facility* levelUpTarget = nullptr;
            for (const auto* f : aiFacilities) {
                if (f->type != FacilityType::CorporateHq && f->level < 3 && f->monthlyProfit > 60000) {
                    levelUpTarget = f;
                    break;
                }
            }
            if (levelUpTarget) {
                const int64_t upCost = get_facility_upgrade_cost(levelUpTarget->type, levelUpTarget->level);
                if (out.updatedCompany.cash >= upCost + CASH_SAFETY_BUFFER) {
                    int existingIdx = -1;
                    for (size_t i = 0; i < out.updatedFacilities.size(); ++i) {
                        if (out.updatedFacilities[i].id == levelUpTarget->id) { existingIdx = static_cast<int>(i); break; }
                    }
                    Facility leveled = (existingIdx >= 0) ? out.updatedFacilities[existingIdx] : *levelUpTarget;
                    leveled.level += 1;
                    leveled.inventoryCapacity += 6000;
                    leveled.qualityRating = std::min(100, leveled.qualityRating + 5);
                    if (existingIdx >= 0) out.updatedFacilities[existingIdx] = std::move(leveled);
                    else out.updatedFacilities.push_back(std::move(leveled));
                    out.updatedCompany.cash -= upCost;
                }
            }
        }
    }

    // 5. Anti-Cheat & Macro-Aware New Facility Construction Gates
    const int maxAllowed = get_max_allowed_facilities(workingState.currentTick);
    const int lastBuilt = out.updatedCompany.lastConstructedTick;
    const bool canConstructNew =
        static_cast<int>(aiFacilities.size()) < maxAllowed &&
        (workingState.currentTick - lastBuilt) >= 8 &&
        out.updatedCompany.lastMonthNetProfit >= 15000;

    if (canConstructNew) {
        std::optional<FacilityType> facilityToBuild;
        ProductId targetProductToAssign = ProductId::Bread;

        auto countType = [&](FacilityType t) {
            int c = 0;
            for (const auto* f : aiFacilities) if (f->type == t) ++c;
            return c;
        };
        auto hasType = [&](FacilityType t) { return countType(t) > 0; };

        if (personality == AIPersonality::Expansionist) {
            int stores = 0;
            for (const auto* f : aiFacilities) if (is_store_facility(f->type)) ++stores;
            if (stores < 2) {
                facilityToBuild = FacilityType::StoreConvenience;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::Bread, ProductId::SoftDrink}, aiFacilities);
            } else if (stores < 3 && workingState.currentTick > 10) {
                facilityToBuild = FacilityType::StoreDepartment;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::FashionApparel, ProductId::SoftDrink, ProductId::Smartphone}, aiFacilities);
            } else if (!hasType(FacilityType::FactoryAssembly) && workingState.currentTick > 18) {
                facilityToBuild = FacilityType::FactoryAssembly;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::Bread, ProductId::SoftDrink, ProductId::FashionApparel}, aiFacilities);
            } else if (!hasType(FacilityType::MediaTelecom) && workingState.currentTick > 26 && out.updatedCompany.cash > 6800000) {
                facilityToBuild = FacilityType::MediaTelecom;
                targetProductToAssign = ProductId::SoftDrink;
            }
        } else if (personality == AIPersonality::QualityFirst) {
            const bool hasAutoOrElec = hasType(FacilityType::StoreElectronics) || hasType(FacilityType::StoreAuto);
            if (!hasType(FacilityType::RdCenter)) {
                facilityToBuild = FacilityType::RdCenter;
                targetProductToAssign = ProductId::Smartphone;
            } else if (!hasType(FacilityType::FactoryAssembly) && workingState.currentTick > 10) {
                facilityToBuild = FacilityType::FactoryAssembly;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::Smartphone, ProductId::Laptop, ProductId::Automobile}, aiFacilities);
            } else if (!hasAutoOrElec && workingState.currentTick > 16) {
                facilityToBuild = FacilityType::StoreElectronics;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::Smartphone, ProductId::Laptop}, aiFacilities);
            } else if (!hasType(FacilityType::TechSoftware) && workingState.currentTick > 22) {
                facilityToBuild = FacilityType::TechSoftware;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::SoftwareOs, ProductId::AiEnterprise}, aiFacilities);
            }
        } else if (personality == AIPersonality::SupplyMonopolist) {
            if (!hasType(FacilityType::MineExtraction)) {
                facilityToBuild = FacilityType::MineExtraction;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::IronOre, ProductId::CrudeOil, ProductId::Silicon}, aiFacilities);
            } else if (!hasType(FacilityType::FarmAgriculture) && workingState.currentTick > 8) {
                facilityToBuild = FacilityType::FarmAgriculture;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::Wheat, ProductId::Livestock}, aiFacilities);
            } else if (!hasType(FacilityType::FactoryProcessing) && workingState.currentTick > 15) {
                facilityToBuild = FacilityType::FactoryProcessing;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::Steel, ProductId::Plastic, ProductId::Flour, ProductId::Fabric}, aiFacilities);
            } else if (!hasType(FacilityType::PowerPlantGreen) && workingState.currentTick > 20) {
                facilityToBuild = FacilityType::PowerPlantGreen;
                targetProductToAssign = ProductId::BatteryCell;
            } else if (!hasType(FacilityType::WarehouseLogistics) && workingState.currentTick > 26) {
                facilityToBuild = FacilityType::WarehouseLogistics;
                targetProductToAssign = ProductId::Steel;
            }
        } else if (personality == AIPersonality::TechInnovator) {
            if (!hasType(FacilityType::TechSoftware)) {
                facilityToBuild = FacilityType::TechSoftware;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::AiEnterprise, ProductId::SoftwareOs}, aiFacilities);
            } else if (!hasType(FacilityType::RdCenter) && workingState.currentTick > 8) {
                facilityToBuild = FacilityType::RdCenter;
                targetProductToAssign = ProductId::ElectronicChip;
            } else if (!hasType(FacilityType::FactoryAssembly) && workingState.currentTick > 16) {
                facilityToBuild = FacilityType::FactoryAssembly;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::ElectronicChip, ProductId::Laptop, ProductId::Smartphone}, aiFacilities);
            } else if (!hasType(FacilityType::StoreElectronics) && workingState.currentTick > 22) {
                facilityToBuild = FacilityType::StoreElectronics;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::Laptop, ProductId::SoftwareOs, ProductId::Smartphone}, aiFacilities);
            }
        } else if (personality == AIPersonality::BrandTitan) {
            if (!hasType(FacilityType::MediaTelecom)) {
                facilityToBuild = FacilityType::MediaTelecom;
                targetProductToAssign = ProductId::FashionApparel;
            } else if (!hasType(FacilityType::StoreDepartment) && workingState.currentTick > 8) {
                facilityToBuild = FacilityType::StoreDepartment;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::FashionApparel, ProductId::SoftDrink}, aiFacilities);
            } else if (!hasType(FacilityType::StoreConvenience) && workingState.currentTick > 16) {
                facilityToBuild = FacilityType::StoreConvenience;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::SoftDrink, ProductId::Bread}, aiFacilities);
            }
        } else if (personality == AIPersonality::RealEstateMogul) {
            if (countType(FacilityType::ApartmentComplex) < 2) {
                facilityToBuild = FacilityType::ApartmentComplex;
            } else if (countType(FacilityType::CommercialTower) < 2 && workingState.currentTick > 8) {
                facilityToBuild = FacilityType::CommercialTower;
            } else if (!hasType(FacilityType::StoreConvenience) && workingState.currentTick > 18) {
                facilityToBuild = FacilityType::StoreConvenience;
                targetProductToAssign = pick_market_gap_product(workingState, {ProductId::Bread, ProductId::SoftDrink}, aiFacilities);
            }
        } else if (personality == AIPersonality::HealthcarePioneer) {
            if (countType(FacilityType::StorePharmacy) < 2) {
                facilityToBuild = FacilityType::StorePharmacy;
                targetProductToAssign = ProductId::Medicine;
            } else if (!hasType(FacilityType::RdCenter) && workingState.currentTick > 8) {
                facilityToBuild = FacilityType::RdCenter;
                targetProductToAssign = ProductId::Medicine;
            } else if (!hasType(FacilityType::FactoryAssembly) && workingState.currentTick > 16) {
                facilityToBuild = FacilityType::FactoryAssembly;
                targetProductToAssign = ProductId::Medicine;
            }
        }

        if (facilityToBuild) {
            const auto& spec = get_facility_spec(*facilityToBuild);
            const int64_t cost = spec.constructionCost;
            if (out.updatedCompany.cash >= cost + CASH_SAFETY_BUFFER) {
                const bool isIndustrial =
                    (*facilityToBuild == FacilityType::FactoryProcessing ||
                     *facilityToBuild == FacilityType::FactoryAssembly ||
                     *facilityToBuild == FacilityType::MineExtraction ||
                     *facilityToBuild == FacilityType::FarmAgriculture ||
                     *facilityToBuild == FacilityType::PowerPlantGreen ||
                     *facilityToBuild == FacilityType::WarehouseLogistics);
                const ZonePref zonePref = isIndustrial ? ZonePref::Industrial
                    : (*facilityToBuild == FacilityType::ApartmentComplex ? ZonePref::Residential : ZonePref::Commercial);

                if (const MapParcel* parcel = find_available_parcel_readonly(workingState.mapParcels, zonePref)) {
                    const std::string facId = "fac_" + aiCompany.id + "_m" + std::to_string(workingState.currentTick) +
                                              "_" + std::to_string(parcel->x) + "_" + std::to_string(parcel->y);
                    const auto& prod = get_product(targetProductToAssign);
                    const bool isRealEstate = (*facilityToBuild == FacilityType::ApartmentComplex ||
                                               *facilityToBuild == FacilityType::CommercialTower);

                    Facility nf;
                    nf.id = facId;
                    nf.companyId = aiCompany.id;
                    nf.name = std::string(spec.name) + " " + aiCompany.ticker;
                    nf.type = *facilityToBuild;
                    nf.tileX = parcel->x;
                    nf.tileY = parcel->y;
                    nf.level = 1;
                    nf.createdMonth = workingState.currentTick;
                    nf.units = create_default_units_for_facility(*facilityToBuild, targetProductToAssign);
                    nf.sellingPrice = isRealEstate
                        ? (*facilityToBuild == FacilityType::CommercialTower ? 1180.0 : 920.0)
                        : prod.basePrice;
                    nf.adBudget = (personality == AIPersonality::Expansionist || personality == AIPersonality::BrandTitan) ? 9000 : 4500;
                    nf.monthlyMaintenance = spec.monthlyMaintenance;
                    nf.inventoryLevel = isRealEstate ? 0 : 400;
                    nf.inventoryCapacity = isRealEstate ? 0 : 10000;
                    nf.qualityRating = (personality == AIPersonality::QualityFirst) ? 66 : 48;
                    nf.brandRating = (personality == AIPersonality::Expansionist || personality == AIPersonality::BrandTitan) ? 64 : 44;

                    out.updatedCompany.cash -= cost;
                    out.updatedCompany.facilitiesCount += 1;
                    out.updatedCompany.lastConstructedTick = workingState.currentTick;
                    out.newFacilityZone = zonePref;
                    out.newFacilityTargetProdName = prod.name;
                    out.parcelsChanged = true;

                    if (is_store_facility(*facilityToBuild)) {
                        out.newsEvent = aiCompany.name + " membuka gerai baru untuk pasar " + prod.name +
                                        " di zona keramaian " + std::to_string(parcel->trafficIndex) + "/100.";
                    } else if (*facilityToBuild == FacilityType::ApartmentComplex) {
                        out.newsEvent = aiCompany.name + " meresmikan Menara Apartemen baru yang meningkatkan kepadatan pelanggan distrik sekitar.";
                    } else if (*facilityToBuild == FacilityType::CommercialTower) {
                        out.newsEvent = aiCompany.name + " meluncurkan Menara Perkantoran CBD untuk menangkap sewa premium.";
                    } else if (*facilityToBuild == FacilityType::TechSoftware) {
                        out.newsEvent = aiCompany.name + " merilis lini digital " + prod.name + ".";
                    } else if (*facilityToBuild == FacilityType::MediaTelecom) {
                        out.newsEvent = aiCompany.name + " mengoperasikan stasiun media untuk memperluas jangkauan merek.";
                    } else if (*facilityToBuild == FacilityType::RdCenter) {
                        out.newsEvent = aiCompany.name + " membangun laboratorium R&D guna menguasai paten teknologi.";
                    } else {
                        out.newsEvent = aiCompany.name + " memperluas kapasitas rantai pasok melalui " + spec.name + ".";
                    }

                    out.newFacility = std::move(nf);
                    return out;
                }
            }
        }
    }

    // 6. Strategic Stock Market Allocation (Buyback or Peer Investment)
    if (out.updatedCompany.cash > 7500000) {
        const double bookValPerShare = static_cast<double>(out.updatedCompany.bookValue) /
                                       static_cast<double>(std::max<int64_t>(1, out.updatedCompany.sharesOutstanding));
        if (out.updatedCompany.stockPrice < bookValPerShare * 0.85 &&
            out.updatedCompany.sharesOutstanding > out.updatedCompany.treasuryShares + 15000) {
            const int64_t buybackShares = std::min<int64_t>(
                2500,
                static_cast<int64_t>(std::floor((static_cast<double>(out.updatedCompany.cash) * 0.08) / std::max(1.0, out.updatedCompany.stockPrice)))
            );
            if (buybackShares > 500) {
                const int64_t cost = math::round_currency64(static_cast<double>(buybackShares) * out.updatedCompany.stockPrice);
                out.updatedCompany.cash -= cost;
                out.updatedCompany.treasuryShares += buybackShares;
                out.updatedCompany.stockPrice = math::clamp_val(
                    math::round2(out.updatedCompany.stockPrice * 1.01),
                    1.0,
                    250.0
                );
            }
        } else if (out.updatedCompany.cash > 11500000) {
            for (const auto& cid : workingState.companyOrder) {
                const auto& other = workingState.companies.at(cid);
                if (other.id == out.updatedCompany.id || other.isPlayer) continue;
                const double otherBookPerShare = static_cast<double>(other.bookValue) /
                                                 static_cast<double>(std::max<int64_t>(1, other.sharesOutstanding));
                const int64_t currentOwned = out.updatedCompany.shareholdings.contains(other.id)
                    ? out.updatedCompany.shareholdings.at(other.id) : 0;
                if (other.stockPrice < otherBookPerShare * 0.9 &&
                    static_cast<double>(currentOwned) < static_cast<double>(other.sharesOutstanding) * 0.25 &&
                    other.stockPrice * 5000.0 < static_cast<double>(out.updatedCompany.cash - 9000000)) {
                    const int64_t investShares = 5000;
                    const int64_t cost = math::round_currency64(static_cast<double>(investShares) * other.stockPrice);
                    out.updatedCompany.cash -= cost;
                    out.updatedCompany.shareholdings[other.id] = currentOwned + investShares;
                    break;
                }
            }
        }
    }

    return out;
}

} // namespace

AISharedContext build_ai_shared_context(const SimulationState& state) {
    AISharedContext ctx;
    for (const auto& fid : state.facilityOrder) {
        const auto& fac = state.facilities.at(fid);
        ctx.facilitiesByCompany[fac.companyId].push_back(&fac);
        if (fac.inventoryLevel > 150 && is_producer_or_warehouse(fac)) {
            for (const auto& u : fac.units) {
                if (u.hasTargetProduct) {
                    ctx.suppliersByProduct[static_cast<size_t>(u.targetProductId)].push_back(&fac);
                    break;
                }
            }
        }
    }
    return ctx;
}

MapParcel* find_available_parcel(
    std::vector<MapParcel>& mapParcels,
    ZonePref preferredZone
) {
    MapParcel* firstEmpty = nullptr;
    MapParcel* bestTrafficParcel = nullptr;
    int bestTrafficScore = -1;

    for (auto& p : mapParcels) {
        if (!p.facilityId.empty() || !p.isZoneAllowed ||
            p.terrainType == TerrainType::Water || p.terrainType == TerrainType::Road) {
            continue;
        }
        if (!firstEmpty) firstEmpty = &p;

        if (preferredZone == ZonePref::Industrial) {
            if (p.terrainType == TerrainType::IndustrialZone) {
                return &p;
            }
        } else if (p.terrainType == TerrainType::Pavement || p.terrainType == TerrainType::Grass) {
            if (p.trafficIndex > bestTrafficScore) {
                bestTrafficScore = p.trafficIndex;
                bestTrafficParcel = &p;
            }
        }
    }

    if (bestTrafficParcel) return bestTrafficParcel;
    return firstEmpty;
}

int get_max_allowed_facilities(int currentTick) noexcept {
    if (currentTick < 24) return 3;
    if (currentTick < 60) return 4;
    return 6;
}

SimulationState replenish_ai_competitors(
    const SimulationState& state,
    const std::unordered_set<std::string>* excludedIds
) {
    SimulationState current = state;
    int attempts = 0;

    std::vector<AICorporateTemplate> combinedPool;
    const auto& pool1 = get_new_entrant_pool();
    const auto& pool2 = get_initial_ai_roster();
    combinedPool.reserve(pool1.size() + pool2.size());
    combinedPool.insert(combinedPool.end(), pool1.begin(), pool1.end());
    combinedPool.insert(combinedPool.end(), pool2.begin(), pool2.end());

    while (static_cast<int>(current.companies.size()) < MAX_ACTIVE_COMPANIES &&
           attempts < MAX_ACTIVE_COMPANIES) {
        ++attempts;
        std::unordered_set<std::string> activeTickers;
        for (const auto& cid : current.companyOrder) {
            activeTickers.insert(current.companies.at(cid).ticker);
        }

        const AICorporateTemplate* chosen = nullptr;
        for (const auto& tpl : combinedPool) {
            if (!current.companies.contains(tpl.id) &&
                (!excludedIds || !excludedIds->contains(tpl.id)) &&
                !activeTickers.contains(tpl.ticker)) {
                chosen = &tpl;
                break;
            }
        }

        AICorporateTemplate generated;
        std::string overrideId;
        if (!chosen) {
            const int seq = current.currentTick + static_cast<int>(current.companies.size()) + attempts;
            const auto& pal = GENERATED_ENTRANT_COLORS[seq % 6];
            constexpr AIPersonality personalities[7] = {
                AIPersonality::Expansionist,
                AIPersonality::QualityFirst,
                AIPersonality::SupplyMonopolist,
                AIPersonality::TechInnovator,
                AIPersonality::BrandTitan,
                AIPersonality::RealEstateMogul,
                AIPersonality::HealthcarePioneer,
            };
            const AIPersonality pers = personalities[seq % 7];
            struct SecCfg { FacilityType fac; ProductId prod; bool ind; const char* focus; };
            constexpr SecCfg cfgs[8] = {
                {FacilityType::StoreConvenience,  ProductId::SoftDrink,     false, "Ritel Konsumen"},
                {FacilityType::ApartmentComplex,  ProductId::Bread,         false, "Real Estate Properti"},
                {FacilityType::StorePharmacy,      ProductId::Medicine,      false, "Farmasi & Klinik"},
                {FacilityType::FactoryAssembly,   ProductId::Smartphone,    true,  "Perakitan Gadget"},
                {FacilityType::TechSoftware,      ProductId::AiEnterprise,  false, "Platform SaaS AI"},
                {FacilityType::PowerPlantGreen,   ProductId::BatteryCell,   true,  "Energi & Baterai Hijau"},
                {FacilityType::FactoryProcessing, ProductId::Plastic,       true,  "Material Industri"},
                {FacilityType::StoreDepartment,   ProductId::FashionApparel,false, "Busana & Gaya Hidup"},
            };
            const auto& cfg = cfgs[seq % 8];

            std::string ticker = "NX" + std::to_string((seq % 90) + 10);
            int suffix = 0;
            while (activeTickers.contains(ticker)) {
                ++suffix;
                const uint32_t h = math::deterministic_hash(std::to_string(seq) + "_" + std::to_string(suffix));
                ticker = "E" + std::to_string(100 + (h % 899));
            }
            overrideId = "comp_entrant_" + std::to_string(seq) + "_" + ticker;

            generated = {
                overrideId,
                "NexaVenture " + ticker + " Tbk",
                ticker,
                pal.color,
                pal.accent,
                "Direktur " + ticker,
                pers,
                cfg.focus,
                BrandStrategy::Corporate,
                48,
                7800000,
                0,
                1000000,
                10.5,
                cfg.fac,
                cfg.prod,
                cfg.ind,
                {{cfg.prod, 55}}
            };
            chosen = &generated;
        }

        auto spawned = save::create_company_and_starter_from_template(
            *chosen,
            current.mapParcels,
            current.currentTick,
            overrideId,
            std::nullopt,
            current.dateString,
            true
        );

        if (!spawned.facility) break;

        NewsItem news{
            "news_entrant_" + std::to_string(current.currentTick) + "_" + std::to_string(attempts) + "_" + spawned.company.ticker,
            current.currentTick,
            NewsCategory::Competitor,
            "IPO Pendatang Baru: " + spawned.company.name + " (" + spawned.company.ticker + ")",
            spawned.company.ceoName + " resmi melantai di bursa dengan fokus " + spawned.company.sectorFocus +
                " serta meresmikan " + spawned.facility->name + "."
        };

        save::insert_company(current, std::move(spawned.company));
        save::insert_facility(current, std::move(*spawned.facility));
        save::push_news_capped(current, std::move(news));
    }

    return current;
}

SimulationState simulate_ai_competitors(const SimulationState& state) {
    SimulationState current = state;
    if (static_cast<int>(current.companies.size()) < MAX_ACTIVE_COMPANIES) {
        current = replenish_ai_competitors(current);
    }

    std::vector<std::string> aiIds;
    for (const auto& cid : current.companyOrder) {
        if (!current.companies.at(cid).isPlayer) aiIds.push_back(cid);
    }
    if (aiIds.empty()) return current;

    auto sharedCtx = build_ai_shared_context(current);
    const int evalCount = std::min(3, static_cast<int>(aiIds.size()));

    std::vector<std::string> slotIds(static_cast<size_t>(evalCount));
    std::vector<Company> slotCompanies(static_cast<size_t>(evalCount));
    std::vector<AITurnOutput> slotOutputs(static_cast<size_t>(evalCount));

    for (int slot = 0; slot < evalCount; ++slot) {
        const size_t idx = static_cast<size_t>((current.currentTick * evalCount + slot) % static_cast<int>(aiIds.size()));
        slotIds[static_cast<size_t>(slot)] = aiIds[idx];
        slotCompanies[static_cast<size_t>(slot)] = current.companies.at(aiIds[idx]);
    }

    // Parallelize independent read-only AI company turns across CPU cores when hardware concurrency allows
    if (evalCount >= 2 && std::thread::hardware_concurrency() >= 2) {
        std::vector<std::thread> workers;
        workers.reserve(static_cast<size_t>(evalCount - 1));
        for (int slot = 1; slot < evalCount; ++slot) {
            workers.emplace_back([&, slot]() {
                slotOutputs[static_cast<size_t>(slot)] =
                    process_ai_company_turn(current, slotCompanies[static_cast<size_t>(slot)], sharedCtx);
            });
        }
        slotOutputs[0] = process_ai_company_turn(current, slotCompanies[0], sharedCtx);
        for (auto& th : workers) {
            if (th.joinable()) th.join();
        }
    } else {
        for (int slot = 0; slot < evalCount; ++slot) {
            slotOutputs[static_cast<size_t>(slot)] =
                process_ai_company_turn(current, slotCompanies[static_cast<size_t>(slot)], sharedCtx);
        }
    }

    bool anyParcelsChanged = false;
    for (int slot = 0; slot < evalCount; ++slot) {
        const std::string& activeId = slotIds[static_cast<size_t>(slot)];
        const Company& activeCompany = slotCompanies[static_cast<size_t>(slot)];
        AITurnOutput& res = slotOutputs[static_cast<size_t>(slot)];

        current.companies.at(activeId) = std::move(res.updatedCompany);

        if (!res.updatedFacilities.empty()) {
            for (auto& uf : res.updatedFacilities) {
                current.facilities.at(uf.id) = std::move(uf);
            }
        }

        if (res.newFacility) {
            Facility nf = std::move(*res.newFacility);
            MapParcel* claimed = spatial::get_parcel_at_mut(current.mapParcels, nf.tileX, nf.tileY);
            if (!claimed || !claimed->facilityId.empty()) {
                // Earlier slot claimed the same parcel; allocate next best parcel deterministically
                claimed = find_available_parcel(current.mapParcels, res.newFacilityZone);
                if (claimed) {
                    nf.tileX = claimed->x;
                    nf.tileY = claimed->y;
                    nf.id = "fac_" + activeId + "_m" + std::to_string(current.currentTick) +
                            "_" + std::to_string(claimed->x) + "_" + std::to_string(claimed->y);
                    if (is_store_facility(nf.type) && !res.newFacilityTargetProdName.empty()) {
                        res.newsEvent = activeCompany.name + " membuka gerai baru untuk pasar " + res.newFacilityTargetProdName +
                                        " di zona keramaian " + std::to_string(claimed->trafficIndex) + "/100.";
                    }
                }
            }
            if (claimed && claimed->facilityId.empty()) {
                claimed->facilityId = nf.id;
                claimed->ownerCompanyId = activeId;
                save::insert_facility(current, std::move(nf));
                anyParcelsChanged = true;
            } else {
                // Roll back construction deduction if city became completely full mid-tick
                const auto& spec = get_facility_spec(nf.type);
                current.companies.at(activeId).cash += spec.constructionCost;
                current.companies.at(activeId).facilitiesCount = std::max(0, current.companies.at(activeId).facilitiesCount - 1);
                res.newsEvent.clear();
            }
        }

        if (!res.newsEvent.empty()) {
            save::push_news_capped(current, {
                "news_ai_" + std::to_string(current.currentTick) + "_" + std::to_string(slot) + "_" + activeCompany.ticker,
                current.currentTick,
                NewsCategory::Competitor,
                "Langkah Korporasi: " + activeCompany.ticker,
                res.newsEvent
            });
        }
    }

    if (anyParcelsChanged) {
        spatial::recalculate_city_traffic(current.mapParcels, current.facilities);
    }

    return current;
}

} // namespace caplab::ai
