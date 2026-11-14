#include "GameApp.hpp"

#include "../core/PrecisionMath.hpp"
#include "../engine/AICompetitor.hpp"
#include "../engine/DemandMacro.hpp"
#include "../engine/EconomyEngine.hpp"
#include "../engine/FacilityUnits.hpp"
#include "../engine/ProductsData.hpp"
#include "../engine/SaveSystem.hpp"
#include "../engine/SpatialGrid.hpp"
#include "../engine/StockMarket.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <unordered_set>

namespace caplab::ui {

namespace {

std::vector<std::pair<UnitType, const char*>> allowed_unit_types_for(FacilityType ft) {
    if (is_store_facility(ft)) {
        return {
            {UnitType::Sales, "Konter Penjualan"},
            {UnitType::Purchasing, "Pengadaan"},
            {UnitType::Advertising, "Pemasaran"},
            {UnitType::Inventory, "Gudang Ritel"},
        };
    }
    if (is_real_estate_facility(ft)) {
        return {
            {UnitType::Sales, "Manajemen Sewa"},
            {UnitType::Advertising, "Pemasaran Properti"},
            {UnitType::Inventory, "Utilitas Gedung"},
        };
    }
    if (ft == FacilityType::RdCenter) {
        return {{UnitType::Rd, "Lab Riset Paten"}};
    }
    if (ft == FacilityType::TechSoftware) {
        return {
            {UnitType::Rd, "Tim Arsitektur"},
            {UnitType::Manufacturing, "Node Cloud"},
            {UnitType::Sales, "Lisensi B2B"},
        };
    }
    if (ft == FacilityType::MediaTelecom) {
        return {{UnitType::Advertising, "Pemancar Iklan"}};
    }
    return {
        {UnitType::Manufacturing, "Lini Produksi"},
        {UnitType::Purchasing, "Pengadaan Bahan"},
        {UnitType::Inventory, "Gudang Ekspedisi"},
        {UnitType::Sales, "Grosir B2B"},
    };
}

const char* unit_short_label(UnitType ut) noexcept {
    switch (ut) {
    case UnitType::Purchasing: return "Pengadaan";
    case UnitType::Manufacturing: return "Produksi";
    case UnitType::Sales: return "Penjualan";
    case UnitType::Advertising: return "Promosi";
    case UnitType::Inventory: return "Gudang";
    case UnitType::Rd:
    default: return "Riset R&D";
    }
}

std::vector<const Facility*> find_available_suppliers(
    const SimulationState& state,
    const Facility& fac,
    std::optional<ProductId> targetProd
) {
    std::vector<const Facility*> out;
    if (!targetProd) return out;

    const ProductRecipe& prod = get_product(*targetProd);
    bool isRetailOrWarehouse = is_store_facility(fac.type) || fac.type == FacilityType::WarehouseLogistics;

    auto needs_product = [&](ProductId candidate) -> bool {
        if (isRetailOrWarehouse) return candidate == *targetProd;
        for (const auto& inp : prod.inputs) {
            if (inp.productId == candidate) return true;
        }
        return false;
    };

    for (const auto& fId : state.facilityOrder) {
        auto it = state.facilities.find(fId);
        if (it == state.facilities.end()) continue;
        const Facility& f = it->second;
        if (f.id == fac.id) continue;
        bool matches = false;
        for (const auto& u : f.units) {
            if ((u.type == UnitType::Manufacturing || u.type == UnitType::Inventory) &&
                u.hasTargetProduct && needs_product(u.targetProductId)) {
                matches = true;
                break;
            }
        }
        if (matches) out.push_back(&f);
    }
    return out;
}

} // namespace

GameApp::GameApp(caplab::platform::Win32Hardware& platform)
    : platform_(platform) {}

void GameApp::initialize() {
    auto loaded = caplab::save::load_state_from_file();
    if (loaded) {
        state_ = std::move(*loaded);
    } else {
        state_ = caplab::save::generate_default_state();
    }

    if (state_.companies.find("comp_apex") != state_.companies.end()) {
        selectedStockCompanyId_ = "comp_apex";
    } else if (!state_.companyOrder.empty()) {
        selectedStockCompanyId_ = state_.companyOrder[0];
    } else {
        selectedStockCompanyId_ = state_.playerCompanyId;
    }

    isoEngine_.onTileSelected = [this](caplab::iso::TileCoord coord) {
        const MapParcel* p = caplab::spatial::get_parcel_at(state_.mapParcels, coord.x, coord.y);
        if (p && !p->facilityId.empty()) {
            // Clicking facility once selects tile; bottom-left bar allows opening Kelola/Detail cleanly
        }
    };

    focus_camera_on_player_hq(false);
    worker_.start();
}

void GameApp::on_close() {
    worker_.stop();
    caplab::save::save_state_to_file(state_);
}

void GameApp::invalidate_and_persist() {
    ++stateEpoch_;
    worker_.invalidate(stateEpoch_);
    caplab::save::save_state_to_file(state_);
}

void GameApp::focus_camera_on_player_hq(bool smooth) {
    for (const auto& fId : state_.facilityOrder) {
        auto it = state_.facilities.find(fId);
        if (it != state_.facilities.end() &&
            it->second.companyId == state_.playerCompanyId &&
            it->second.type == FacilityType::CorporateHq) {
            isoEngine_.center_camera_on(it->second.tileX, it->second.tileY, smooth);
            isoEngine_.set_selected_tile(caplab::iso::TileCoord{it->second.tileX, it->second.tileY});
            return;
        }
    }
    isoEngine_.center_camera_on(16, 16, smooth);
}

void GameApp::show_toast(std::string text, bool isError) {
    toastText_ = std::move(text);
    toastIsError_ = isError;
    toastTimerSec_ = 3.5;
}

void GameApp::apply_simulation_result(caplab::SimulationState nextState, bool emitParticles) {
    // Preserve interactive camera/playback flags across async tick merge
    nextState.isPaused = state_.isPaused;
    nextState.simSpeed = state_.simSpeed;
    state_ = std::move(nextState);

    if (emitParticles && activeTab_ == MainTab::Map) {
        for (const auto& fId : state_.facilityOrder) {
            auto it = state_.facilities.find(fId);
            if (it == state_.facilities.end()) continue;
            const Facility& fac = it->second;
            if (fac.companyId == state_.playerCompanyId && fac.monthlyRevenue > 0) {
                isoEngine_.add_money_particle(
                    fac.tileX, fac.tileY, "+" + caplab::math::format_money(fac.monthlyRevenue));
            }
        }
    }

    int saveEveryTicks = (state_.simSpeed == 5) ? 4 : (state_.simSpeed == 2 ? 2 : 1);
    ticksSinceSave_ += 1;
    if (ticksSinceSave_ >= saveEveryTicks) {
        ticksSinceSave_ = 0;
        caplab::save::save_state_to_file(state_);
    }
}

void GameApp::submit_background_month_tick(bool emitParticles) {
    if (!worker_.try_submit(stateEpoch_, state_, emitParticles)) {
        // Fallback if worker queue already holds a tick
        return;
    }
}

void GameApp::advance_simulation_month(bool emitParticles) {
    SimulationState afterEcon = caplab::simulate_economic_month(state_);
    SimulationState afterAI = caplab::ai::simulate_ai_competitors(afterEcon);
    apply_simulation_result(std::move(afterAI), emitParticles);
}

void GameApp::open_facility_drawer(const std::string& facilityId) {
    auto it = state_.facilities.find(facilityId);
    if (it == state_.facilities.end()) return;
    const Facility& fac = it->second;
    inspectingFacilityId_ = facilityId;
    drawerTab_ = FacilityDrawerTab::Overview;
    drawerSelectedSlot_.reset();
    drawerConfirmDemolish_ = false;
    drawerScroll_.offsetY = 0.0f;

    double defPrice = (fac.type == FacilityType::ApartmentComplex) ? 920.0
                    : (fac.type == FacilityType::CommercialTower) ? 1180.0
                                                                  : 10.0;
    drawerEditPrice_ = fac.sellingPrice > 0.0 ? fac.sellingPrice : defPrice;
    drawerEditAdBudget_ = fac.adBudget > 0 ? fac.adBudget : 5000;
    drawerEditAutoPricing_ = fac.autoPricing;

    std::optional<ProductId> prodId;
    for (const auto& u : fac.units) {
        if (u.hasTargetProduct) {
            prodId = u.targetProductId;
            break;
        }
    }
    if (is_real_estate_facility(fac.type)) {
        drawerPriceMin_ = (fac.type == FacilityType::CommercialTower) ? 600.0 : 450.0;
        drawerPriceMax_ = (fac.type == FacilityType::CommercialTower) ? 3200.0 : 2400.0;
        drawerPriceStep_ = 25.0;
    } else if (prodId) {
        const ProductRecipe& prod = get_product(*prodId);
        drawerPriceMin_ = std::max(1.0, static_cast<double>(caplab::math::round_currency(prod.baseCost * 0.5)));
        drawerPriceMax_ = static_cast<double>(caplab::math::round_currency(prod.basePrice * 2.5));
        drawerPriceStep_ = 1.0;
    } else {
        drawerPriceMin_ = 5.0;
        drawerPriceMax_ = 250.0;
        drawerPriceStep_ = 1.0;
    }
}

void GameApp::open_build_modal(std::optional<caplab::iso::TileCoord> parcelCoord) {
    buildTargetCoord_ = parcelCoord;
    buildCat_ = FacilityCategory::Store;
    buildChosenType_ = FacilityType::StoreConvenience;
    buildChosenProduct_ = ProductId::Bread;
    buildScroll_.offsetY = 0.0f;
    showBuildModal_ = true;
}

void GameApp::action_build_facility(FacilityType type, ProductId targetProduct) {
    const FacilityBuildingSpec& spec = get_facility_spec(type);
    auto compIt = state_.companies.find(state_.playerCompanyId);
    if (compIt == state_.companies.end() || compIt->second.cash < spec.constructionCost) {
        show_toast("Dana kas tidak mencukupi untuk konstruksi fasilitas ini.", true);
        return;
    }

    MapParcel* parcel = nullptr;
    if (buildTargetCoord_) {
        parcel = caplab::spatial::get_parcel_at_mut(
            state_.mapParcels, buildTargetCoord_->x, buildTargetCoord_->y);
        if (parcel && (!parcel->facilityId.empty() || !parcel->isZoneAllowed)) {
            parcel = nullptr;
        }
    }
    if (!parcel) {
        bool isInd = (type == FacilityType::FactoryAssembly ||
                      type == FacilityType::FactoryProcessing ||
                      type == FacilityType::MineExtraction ||
                      type == FacilityType::FarmAgriculture ||
                      type == FacilityType::PowerPlantGreen ||
                      type == FacilityType::WarehouseLogistics);
        bool isRes = (type == FacilityType::ApartmentComplex);
        parcel = caplab::ai::find_available_parcel(
            state_.mapParcels,
            isInd ? caplab::ai::ZonePref::Industrial
                  : (isRes ? caplab::ai::ZonePref::Residential : caplab::ai::ZonePref::Commercial));
    }

    if (!parcel) {
        show_toast("Tidak ada kavling kosong yang tersedia di kota.", true);
        return;
    }

    int seq = buildSeq_++;
    std::string facilityId = "fac_plyr_" + std::to_string(state_.currentTick) + "_" +
                             std::to_string(parcel->x) + "_" + std::to_string(parcel->y) + "_" +
                             std::to_string(seq);

    bool hasAllowed = !spec.allowedProducts.empty();
    std::optional<ProductId> prodOpt = hasAllowed ? std::optional<ProductId>(targetProduct) : std::nullopt;
    std::vector<InternalUnit> units = caplab::create_default_units_for_facility(type, prodOpt);
    bool isRE = (type == FacilityType::ApartmentComplex || type == FacilityType::CommercialTower);
    bool isStore = is_store_facility(type);

    Facility newFac{};
    newFac.id = facilityId;
    newFac.companyId = state_.playerCompanyId;
    newFac.name = std::string(spec.name) + " " + compIt->second.ticker;
    newFac.type = type;
    newFac.tileX = parcel->x;
    newFac.tileY = parcel->y;
    newFac.level = 1;
    newFac.createdMonth = state_.currentTick;
    newFac.units = std::move(units);
    newFac.sellingPrice =
        (type == FacilityType::ApartmentComplex) ? 920.0
      : (type == FacilityType::CommercialTower) ? 1180.0
      : (prodOpt ? get_product(*prodOpt).basePrice : 50.0);
    newFac.adBudget = 5000;
    newFac.monthlyMaintenance = spec.monthlyMaintenance;
    newFac.inventoryLevel = isRE ? 0 : (isStore ? 600 : 800);
    newFac.inventoryCapacity = isRE ? 0 : (type == FacilityType::WarehouseLogistics ? 30000 : 12000);
    newFac.qualityRating = 50;
    newFac.brandRating = 50;
    newFac.supplySourceLabel = isRE ? "Siap Huni / Sewa" : (isStore ? "Pelabuhan Impor" : "Produksi Lokal");

    compIt->second.cash -= spec.constructionCost;
    compIt->second.facilitiesCount += 1;

    parcel->facilityId = facilityId;
    parcel->ownerCompanyId = state_.playerCompanyId;
    int px = parcel->x;
    int py = parcel->y;

    caplab::save::insert_facility(state_, std::move(newFac));
    caplab::spatial::recalculate_city_traffic(state_.mapParcels, state_.facilities);

    NewsItem ni{};
    ni.id = "news_build_" + std::to_string(state_.currentTick) + "_" + std::to_string(seq);
    ni.month = state_.currentTick;
    ni.category = NewsCategory::Economy;
    ni.title = std::string("Konstruksi Baru: ") + spec.name;
    ni.detail = compIt->second.name + " meresmikan " + spec.name + " di kavling (" +
                std::to_string(px) + ", " + std::to_string(py) + ") senilai $" +
                caplab::math::format_int_commas(spec.constructionCost) + ".";
    caplab::save::push_news_capped(state_, std::move(ni));

    invalidate_and_persist();
    showBuildModal_ = false;
    buildTargetCoord_.reset();
    open_facility_drawer(facilityId);
    show_toast(std::string(spec.name) + " berhasil dibangun di (" + std::to_string(px) + ", " + std::to_string(py) + ").");
}

void GameApp::action_upgrade_facility(const std::string& facilityId) {
    auto fIt = state_.facilities.find(facilityId);
    auto cIt = state_.companies.find(state_.playerCompanyId);
    if (fIt == state_.facilities.end() || cIt == state_.companies.end()) return;
    if (fIt->second.companyId != state_.playerCompanyId || fIt->second.level >= 5) return;

    int64_t cost = caplab::get_facility_upgrade_cost(fIt->second.type, fIt->second.level);
    if (cIt->second.cash < cost) {
        show_toast("Dana kas tidak mencukupi untuk menaikkan level fasilitas.", true);
        return;
    }

    cIt->second.cash -= cost;
    fIt->second.level += 1;
    fIt->second.inventoryCapacity += 6000;
    fIt->second.qualityRating = std::min(100, fIt->second.qualityRating + 6);
    invalidate_and_persist();
    show_toast(fIt->second.name + " ditingkatkan ke Lv." + std::to_string(fIt->second.level) +
               " (-$" + caplab::math::format_int_commas(cost) + ").");
}

void GameApp::action_install_unit(const std::string& facilityId, int slotIndex, UnitType unitType) {
    auto fIt = state_.facilities.find(facilityId);
    auto cIt = state_.companies.find(state_.playerCompanyId);
    if (fIt == state_.facilities.end() || cIt == state_.companies.end()) return;
    if (fIt->second.companyId != state_.playerCompanyId) return;
    for (const auto& u : fIt->second.units) {
        if (u.slotIndex == slotIndex) return;
    }

    int64_t cost = caplab::get_unit_install_cost(unitType);
    if (cIt->second.cash < cost) {
        show_toast("Dana kas tidak mencukupi untuk memasang unit baru.", true);
        return;
    }

    cIt->second.cash -= cost;
    fIt->second.units = caplab::add_unit_to_facility_slot(fIt->second, slotIndex, unitType).units;
    drawerSelectedSlot_ = slotIndex;
    invalidate_and_persist();
    show_toast("Unit dipasang di Slot #" + std::to_string(slotIndex + 1) +
               " (-$" + caplab::math::format_int_commas(cost) + ").");
}

void GameApp::action_upgrade_unit(const std::string& facilityId, const std::string& unitId) {
    auto fIt = state_.facilities.find(facilityId);
    auto cIt = state_.companies.find(state_.playerCompanyId);
    if (fIt == state_.facilities.end() || cIt == state_.companies.end()) return;
    if (fIt->second.companyId != state_.playerCompanyId) return;

    InternalUnit* target = nullptr;
    for (auto& u : fIt->second.units) {
        if (u.id == unitId) {
            target = &u;
            break;
        }
    }
    if (!target || target->level >= 5) return;

    int64_t cost = caplab::get_unit_upgrade_cost(target->level);
    if (cIt->second.cash < cost) {
        show_toast("Dana kas tidak mencukupi untuk menaikkan level unit.", true);
        return;
    }

    cIt->second.cash -= cost;
    target->level += 1;
    target->capacity = caplab::math::round_currency(static_cast<double>(target->capacity) * 1.35);
    target->monthlyCost = caplab::math::round_currency(static_cast<double>(target->monthlyCost) * 1.25);
    target->efficiency = std::min(1.2, caplab::math::round2(target->efficiency + 0.05));
    invalidate_and_persist();
    show_toast(target->name + " naik ke Lv." + std::to_string(target->level) +
               " (-$" + caplab::math::format_int_commas(cost) + ").");
}

void GameApp::action_cycle_supplier(const std::string& facilityId, const std::string& unitId) {
    auto fIt = state_.facilities.find(facilityId);
    if (fIt == state_.facilities.end()) return;
    Facility& fac = fIt->second;

    InternalUnit* targetUnit = nullptr;
    for (auto& u : fac.units) {
        if (u.id == unitId) {
            targetUnit = &u;
            break;
        }
    }
    if (!targetUnit) return;

    std::optional<ProductId> prodOpt = targetUnit->hasTargetProduct
        ? std::optional<ProductId>(targetUnit->targetProductId)
        : std::nullopt;
    if (!prodOpt) {
        for (const auto& u : fac.units) {
            if (u.hasTargetProduct) {
                prodOpt = u.targetProductId;
                break;
            }
        }
    }
    auto suppliers = find_available_suppliers(state_, fac, prodOpt);
    if (suppliers.empty()) {
        targetUnit->supplierFacilityId = "seaport";
        fac.supplySourceLabel = "Pelabuhan Impor";
        show_toast("Tidak ada pemasok domestik; tetap menggunakan Pelabuhan Impor.");
        return;
    }

    // Cycle: seaport -> suppliers[0] -> ... -> seaport
    std::vector<std::string> cycleIds;
    cycleIds.push_back("seaport");
    for (const auto* s : suppliers) cycleIds.push_back(s->id);

    size_t idx = 0;
    for (size_t i = 0; i < cycleIds.size(); ++i) {
        if (cycleIds[i] == targetUnit->supplierFacilityId) {
            idx = i;
            break;
        }
    }
    std::string nextId = cycleIds[(idx + 1) % cycleIds.size()];
    targetUnit->supplierFacilityId = nextId;
    if (nextId == "seaport") {
        fac.supplySourceLabel = "Pelabuhan Impor";
    } else {
        auto sIt = state_.facilities.find(nextId);
        if (sIt != state_.facilities.end()) {
            fac.supplySourceLabel = (sIt->second.companyId == fac.companyId)
                ? "Pabrik Internal"
                : "Grosir B2B";
        }
    }
    invalidate_and_persist();
    show_toast("Sumber pasok diperbarui ke: " + fac.supplySourceLabel);
}

void GameApp::action_demolish_facility(const std::string& facilityId) {
    auto fIt = state_.facilities.find(facilityId);
    if (fIt == state_.facilities.end()) return;
    std::string fName = fIt->second.name;
    FacilityType fType = fIt->second.type;

    const auto& spec = get_facility_spec(fType);
    int64_t refund = caplab::math::round_currency64(static_cast<double>(spec.constructionCost) * 0.35);

    auto cIt = state_.companies.find(state_.playerCompanyId);
    if (cIt != state_.companies.end()) {
        cIt->second.cash += refund;
        cIt->second.facilitiesCount = std::max(0, cIt->second.facilitiesCount - 1);
    }

    for (auto& p : state_.mapParcels) {
        if (p.facilityId == facilityId) {
            p.facilityId.clear();
            p.ownerCompanyId.clear();
        }
    }

    caplab::save::erase_facility(state_, facilityId);
    caplab::spatial::recalculate_city_traffic(state_.mapParcels, state_.facilities);
    inspectingFacilityId_.clear();
    drawerConfirmDemolish_ = false;
    invalidate_and_persist();
    show_toast(fName + " dibongkar. Dana likuidasi +$" + caplab::math::format_int_commas(refund) + ".");
}

void GameApp::handle_input(const caplab::platform::InputEvent& ev) {
    using Type = caplab::platform::InputEvent::Type;

    if (ev.type == Type::KeyDown) {
        if (ev.keyCode == VK_ESCAPE) {
            if (showBuildModal_) showBuildModal_ = false;
            else if (!inspectingFacilityId_.empty()) inspectingFacilityId_.clear();
            else if (showNewsModal_) showNewsModal_ = false;
            return;
        }
        if (ev.keyCode == VK_SPACE) {
            state_.isPaused = !state_.isPaused;
            if (state_.isPaused) caplab::save::save_state_to_file(state_);
            return;
        }
        if (ev.keyCode == '1') { state_.simSpeed = 1; state_.isPaused = false; return; }
        if (ev.keyCode == '2') { state_.simSpeed = 2; state_.isPaused = false; return; }
        if (ev.keyCode == '3' || ev.keyCode == '5') { state_.simSpeed = 5; state_.isPaused = false; return; }
        if (ev.keyCode == 'N') {
            simAccumSec_ = 0.0;
            submit_background_month_tick(true);
            return;
        }
        if (ev.keyCode == 'B' && !showNewsModal_ && inspectingFacilityId_.empty()) {
            open_build_modal(isoEngine_.selected_tile());
            return;
        }
        if (ev.keyCode == 'V' && ev.ctrlDown && activeTab_ == MainTab::HQ && hqSubTab_ == HQSubTab::SaveSystem) {
            std::string clip = platform_.read_text_from_clipboard();
            if (!clip.empty()) {
                auto restored = caplab::save::hydrate_state_from_json(clip);
                if (restored) {
                    state_ = std::move(*restored);
                    isoEngine_.invalidate_ground_cache();
                    invalidate_and_persist();
                    show_toast("Progres JSON dari clipboard berhasil dipulihkan.");
                } else {
                    show_toast("Format JSON clipboard tidak valid.", true);
                }
            }
            return;
        }
        return;
    }

    if (ev.type == Type::MouseMove) {
        mouseX_ = ev.x;
        mouseY_ = ev.y;

        if (activeSliderDrag_ == 1 && !inspectingFacilityId_.empty()) {
            drawerEditPrice_ = slider_value_from_x(
                priceSliderRect_, ev.x, drawerPriceMin_, drawerPriceMax_, drawerPriceStep_);
            return;
        }
        if (activeSliderDrag_ == 2 && !inspectingFacilityId_.empty()) {
            drawerEditAdBudget_ = static_cast<int>(slider_value_from_x(
                adSliderRect_, ev.x, 0.0, 60000.0, 2500.0));
            return;
        }

        if (activeTab_ == MainTab::Map &&
            !showNewsModal_ && !showBuildModal_ && inspectingFacilityId_.empty()) {
            isoEngine_.on_mouse_move(ev.x, ev.y);
        }
        return;
    }

    if (ev.type == Type::MouseWheel) {
        float scrollStep = -ev.wheelDelta * 46.0f;
        if (showNewsModal_) { newsScroll_.scroll_by(scrollStep); return; }
        if (showBuildModal_) { buildScroll_.scroll_by(scrollStep); return; }
        if (!inspectingFacilityId_.empty()) { drawerScroll_.scroll_by(scrollStep); return; }

        if (activeTab_ == MainTab::Map) {
            if (mapArea_.contains(ev.x, ev.y)) {
                isoEngine_.on_mouse_wheel(ev.x, ev.y, ev.wheelDelta);
            }
        } else if (activeTab_ == MainTab::Stocks && stockSubTab_ == StockSubTab::Stocks) {
            if (stockListRect_.contains(ev.x, ev.y)) {
                stockListScroll_.scroll_by(scrollStep);
            } else if (activeScrollArea_.contains(ev.x, ev.y)) {
                stockDetailScroll_.scroll_by(scrollStep);
            }
        } else if (activeScrollArea_.contains(ev.x, ev.y)) {
            mainScroll_.scroll_by(scrollStep);
        }
        return;
    }

    if (ev.type == Type::MouseDown && ev.button == 0) {
        mouseX_ = ev.x;
        mouseY_ = ev.y;
        const HitRegion* hit = hits_.hit_test(ev.x, ev.y);
        if (hit) {
            if (hit->actionId == ACT_DRAWER_PRICE_SLIDER) {
                activeSliderDrag_ = 1;
                drawerEditPrice_ = slider_value_from_x(
                    priceSliderRect_, ev.x, drawerPriceMin_, drawerPriceMax_, drawerPriceStep_);
                return;
            }
            if (hit->actionId == ACT_DRAWER_AD_SLIDER) {
                activeSliderDrag_ = 2;
                drawerEditAdBudget_ = static_cast<int>(slider_value_from_x(
                    adSliderRect_, ev.x, 0.0, 60000.0, 2500.0));
                return;
            }
            execute_action(*hit, ev.x, ev.y);
            return;
        }

        if (activeTab_ == MainTab::Map &&
            !showNewsModal_ && !showBuildModal_ && inspectingFacilityId_.empty() &&
            mapArea_.contains(ev.x, ev.y)) {
            isoEngine_.on_mouse_down(ev.x, ev.y);
        }
        return;
    }

    if (ev.type == Type::MouseUp && ev.button == 0) {
        activeSliderDrag_ = 0;
        if (activeTab_ == MainTab::Map) {
            isoEngine_.on_mouse_up(ev.x, ev.y);
        }
        return;
    }
}

void GameApp::execute_action(const HitRegion& hit, float /*mx*/, float /*my*/) {
    switch (hit.actionId) {
    case ACT_TOGGLE_PAUSE:
        state_.isPaused = !state_.isPaused;
        if (state_.isPaused) caplab::save::save_state_to_file(state_);
        break;
    case ACT_SET_SPEED:
        state_.simSpeed = (hit.arg1 == 5) ? 5 : (hit.arg1 == 2 ? 2 : 1);
        state_.isPaused = false;
        break;
    case ACT_ADVANCE_MONTH:
        simAccumSec_ = 0.0;
        submit_background_month_tick(true);
        break;
    case ACT_OPEN_NEWS:
        newsScroll_.offsetY = 0.0f;
        showNewsModal_ = true;
        break;
    case ACT_CLOSE_NEWS:
        showNewsModal_ = false;
        break;
    case ACT_NAV_TAB:
        activeTab_ = static_cast<MainTab>(hit.arg1);
        mainScroll_.offsetY = 0.0f;
        stockListScroll_.offsetY = 0.0f;
        stockDetailScroll_.offsetY = 0.0f;
        break;
    case ACT_MAP_FILTER_MINE:
        filterMyFacilitiesOnly_ = !filterMyFacilitiesOnly_;
        break;
    case ACT_MAP_TOGGLE_TRAFFIC:
        showTrafficOverlay_ = !showTrafficOverlay_;
        break;
    case ACT_MAP_TOGGLE_BADGES:
        showBadges_ = !showBadges_;
        break;
    case ACT_MAP_FOCUS_HQ:
        focus_camera_on_player_hq(true);
        break;
    case ACT_MAP_ZOOM_IN:
        isoEngine_.set_zoom(isoEngine_.current_zoom() + 0.25f);
        break;
    case ACT_MAP_ZOOM_OUT:
        isoEngine_.set_zoom(isoEngine_.current_zoom() - 0.25f);
        break;
    case ACT_OPEN_BUILD_MODAL: {
        std::optional<caplab::iso::TileCoord> coord;
        if (hit.arg1 >= 0 && hit.arg2 >= 0) {
            coord = caplab::iso::TileCoord{hit.arg1, hit.arg2};
        }
        open_build_modal(coord);
        break;
    }
    case ACT_INSPECT_FACILITY:
        open_facility_drawer(hit.strArg);
        break;
    case ACT_DISMISS_TOAST:
        toastText_.clear();
        break;
    case ACT_FAC_VIEW_MODE:
        facSupplyChainMode_ = (hit.arg1 == 1);
        mainScroll_.offsetY = 0.0f;
        break;
    case ACT_FAC_FILTER:
        facFilterCat_ = hit.arg1;
        mainScroll_.offsetY = 0.0f;
        break;
    case ACT_MKT_FILTER:
        mktFilterCat_ = hit.arg1;
        mainScroll_.offsetY = 0.0f;
        break;
    case ACT_STK_SUBTAB:
        stockSubTab_ = static_cast<StockSubTab>(hit.arg1);
        stockFeedback_.clear();
        mainScroll_.offsetY = 0.0f;
        break;
    case ACT_STK_SELECT_COMP:
        selectedStockCompanyId_ = hit.strArg;
        confirmMerger_ = false;
        stockFeedback_.clear();
        break;
    case ACT_STK_LOT_SHARES:
        tradeShares_ = hit.arg1;
        break;
    case ACT_STK_BUY:
    case ACT_STK_SELL: {
        bool isBuy = (hit.actionId == ACT_STK_BUY);
        auto res = caplab::market::execute_stock_trade(
            state_, state_.playerCompanyId, selectedStockCompanyId_, tradeShares_, isBuy);
        if (res.success && res.updatedState) {
            state_ = std::move(*res.updatedState);
            invalidate_and_persist();
            stockFeedbackErr_ = false;
        } else {
            stockFeedbackErr_ = true;
        }
        stockFeedback_ = res.message;
        break;
    }
    case ACT_STK_MERGER_CONFIRM:
        confirmMerger_ = true;
        break;
    case ACT_STK_MERGER_CANCEL:
        confirmMerger_ = false;
        break;
    case ACT_STK_MERGER_EXEC: {
        auto res = caplab::market::execute_subsidiary_merger(
            state_, state_.playerCompanyId, selectedStockCompanyId_);
        confirmMerger_ = false;
        if (res.success && res.updatedState) {
            state_ = std::move(*res.updatedState);
            selectedStockCompanyId_ = state_.playerCompanyId;
            invalidate_and_persist();
            stockFeedbackErr_ = false;
        } else {
            stockFeedbackErr_ = true;
        }
        stockFeedback_ = res.message;
        break;
    }
    case ACT_STK_LOAN_AMT:
        loanAmount_ = static_cast<int64_t>(hit.arg1);
        break;
    case ACT_STK_BORROW:
    case ACT_STK_REPAY: {
        bool isBorrow = (hit.actionId == ACT_STK_BORROW);
        auto res = caplab::market::handle_corporate_loan(
            state_, state_.playerCompanyId, loanAmount_, isBorrow);
        if (res.success && res.updatedState) {
            state_ = std::move(*res.updatedState);
            invalidate_and_persist();
            stockFeedbackErr_ = false;
        } else {
            stockFeedbackErr_ = true;
        }
        stockFeedback_ = res.message;
        break;
    }
    case ACT_STK_ISSUE_CNT:
        issueCount_ = static_cast<int64_t>(hit.arg1);
        break;
    case ACT_STK_ISSUE_EXEC: {
        auto res = caplab::market::issue_new_shares(state_, state_.playerCompanyId, issueCount_);
        if (res.success && res.updatedState) {
            state_ = std::move(*res.updatedState);
            invalidate_and_persist();
            stockFeedbackErr_ = false;
        } else {
            stockFeedbackErr_ = true;
        }
        stockFeedback_ = res.message;
        break;
    }
    case ACT_STK_DIVIDEND: {
        auto cIt = state_.companies.find(state_.playerCompanyId);
        if (cIt != state_.companies.end()) {
            cIt->second.dividendPerShare = static_cast<double>(hit.arg1) / 100.0;
            invalidate_and_persist();
        }
        break;
    }
    case ACT_HQ_SUBTAB:
        hqSubTab_ = static_cast<HQSubTab>(hit.arg1);
        mainScroll_.offsetY = 0.0f;
        break;
    case ACT_HQ_BRAND_STRATEGY: {
        auto cIt = state_.companies.find(state_.playerCompanyId);
        if (cIt != state_.companies.end()) {
            cIt->second.brandStrategy = static_cast<BrandStrategy>(hit.arg1);
            invalidate_and_persist();
            show_toast(std::string("Strategi merek diubah ke mode ") +
                       brand_strategy_to_str(cIt->second.brandStrategy) + ".");
        }
        break;
    }
    case ACT_HQ_TOGGLE_EXEC: {
        auto cIt = state_.companies.find(state_.playerCompanyId);
        if (cIt == state_.companies.end()) break;
        Company& player = cIt->second;
        if (player.executives.empty()) {
            player.executives = get_available_executives();
        }
        ExecutiveRole role = static_cast<ExecutiveRole>(hit.arg1);
        for (auto& ex : player.executives) {
            if (ex.role != role) continue;
            if (!ex.hired) {
                if (player.cash < ex.monthlySalary) {
                    show_toast("Kas tidak cukup untuk biaya kontrak awal $" +
                               caplab::math::format_int_commas(ex.monthlySalary) + ".", true);
                    break;
                }
                player.cash -= ex.monthlySalary;
                ex.hired = true;
                NewsItem ni{};
                ni.id = "news_exec_" + std::to_string(state_.currentTick) + "_" + std::to_string(hit.arg1);
                ni.month = state_.currentTick;
                ni.category = NewsCategory::Economy;
                ni.title = std::string("Pengangkatan ") + exec_role_to_str(role) + ": " + ex.name;
                ni.detail = player.name + " resmi merekrut " + ex.name + " sebagai " +
                            exec_role_to_str(role) + " untuk memperkuat efisiensi korporasi.";
                caplab::save::push_news_capped(state_, std::move(ni));
                show_toast(ex.name + " resmi bergabung sebagai " + exec_role_to_str(role) + ".");
            } else {
                ex.hired = false;
                show_toast("Kontrak " + ex.name + " (" + exec_role_to_str(role) + ") diakhiri.");
            }
            invalidate_and_persist();
            break;
        }
        break;
    }
    case ACT_HQ_RANK_SUBTAB:
        rankSubTab_ = static_cast<RankSubTab>(hit.arg1);
        mainScroll_.offsetY = 0.0f;
        break;
    case ACT_HQ_RANK_SORT:
        rankSortBy_ = static_cast<RankSortBy>(hit.arg1);
        break;
    case ACT_HQ_SET_RESEARCH: {
        auto cIt = state_.companies.find(state_.playerCompanyId);
        if (cIt != state_.companies.end()) {
            ProductId pid = static_cast<ProductId>(hit.arg1);
            cIt->second.activeResearchProduct = pid;
            invalidate_and_persist();
            show_toast(std::string("Fokus riset R&D diarahkan ke ") + get_product(pid).name + ".");
        }
        break;
    }
    case ACT_HQ_SAVE_LOCAL:
        if (caplab::save::save_state_to_file(state_)) {
            show_toast("Progres berhasil disimpan ke AppData lokal Windows.");
        } else {
            show_toast("Gagal menulis berkas simpanan lokal.", true);
        }
        break;
    case ACT_HQ_LOAD_LOCAL: {
        auto loaded = caplab::save::load_state_from_file();
        if (loaded) {
            state_ = std::move(*loaded);
            isoEngine_.invalidate_ground_cache();
            invalidate_and_persist();
            show_toast("Progres permainan berhasil dimuat ulang.");
        } else {
            show_toast("Belum ditemukan data simpanan lokal.", true);
        }
        break;
    }
    case ACT_HQ_RESET_CONFIRM:
        confirmReset_ = true;
        break;
    case ACT_HQ_RESET_CANCEL:
        confirmReset_ = false;
        break;
    case ACT_HQ_RESET_EXEC:
        state_ = caplab::save::generate_default_state();
        isoEngine_.invalidate_ground_cache();
        invalidate_and_persist();
        confirmReset_ = false;
        focus_camera_on_player_hq(false);
        show_toast("Konglomerasi baru berhasil dimulai dari awal.");
        break;
    case ACT_HQ_EXPORT_FILE: {
        std::string defaultName = "caplab13_save_" + state_.dateString + ".json";
        std::replace(defaultName.begin(), defaultName.end(), ' ', '_');
        std::string path;
        if (platform_.show_save_json_dialog(path, defaultName)) {
            if (caplab::save::save_state_to_file(state_, path)) {
                show_toast("Berkas JSON cadangan berhasil diekspor.");
            } else {
                show_toast("Gagal mengekspor berkas JSON.", true);
            }
        }
        break;
    }
    case ACT_HQ_IMPORT_FILE: {
        std::string path;
        if (platform_.show_open_json_dialog(path)) {
            auto restored = caplab::save::load_state_from_file(path);
            if (restored) {
                state_ = std::move(*restored);
                isoEngine_.invalidate_ground_cache();
                invalidate_and_persist();
                focus_camera_on_player_hq(false);
                show_toast("Progres JSON berhasil dimuat dari berkas.");
            } else {
                show_toast("Format berkas JSON tidak valid atau rusak.", true);
            }
        }
        break;
    }
    case ACT_HQ_IMPORT_CLIPBOARD: {
        std::string clip = platform_.read_text_from_clipboard();
        if (clip.empty()) {
            show_toast("Clipboard tidak berisi teks JSON.", true);
        } else {
            auto restored = caplab::save::hydrate_state_from_json(clip);
            if (restored) {
                state_ = std::move(*restored);
                isoEngine_.invalidate_ground_cache();
                invalidate_and_persist();
                focus_camera_on_player_hq(false);
                show_toast("Progres JSON berhasil diimpor dari clipboard.");
            } else {
                show_toast("Format JSON di clipboard tidak valid.", true);
            }
        }
        break;
    }
    case ACT_BUILD_CLOSE:
    case ACT_BUILD_BACKDROP:
        showBuildModal_ = false;
        break;
    case ACT_BUILD_CAT: {
        buildCat_ = static_cast<FacilityCategory>(hit.arg1);
        for (const auto& sp : get_all_facility_specs()) {
            if (sp.category == buildCat_ && sp.buildable) {
                buildChosenType_ = sp.type;
                if (!sp.allowedProducts.empty()) {
                    buildChosenProduct_ = sp.allowedProducts[0];
                }
                break;
            }
        }
        buildScroll_.offsetY = 0.0f;
        break;
    }
    case ACT_BUILD_SELECT_TYPE: {
        buildChosenType_ = static_cast<FacilityType>(hit.arg1);
        const auto& sp = get_facility_spec(buildChosenType_);
        if (!sp.allowedProducts.empty()) {
            buildChosenProduct_ = sp.allowedProducts[0];
        }
        break;
    }
    case ACT_BUILD_SELECT_PROD:
        buildChosenProduct_ = static_cast<ProductId>(hit.arg1);
        break;
    case ACT_BUILD_CONFIRM:
        action_build_facility(buildChosenType_, buildChosenProduct_);
        break;
    case ACT_DRAWER_CLOSE:
    case ACT_DRAWER_BACKDROP:
        inspectingFacilityId_.clear();
        drawerConfirmDemolish_ = false;
        break;
    case ACT_DRAWER_TAB:
        drawerTab_ = static_cast<FacilityDrawerTab>(hit.arg1);
        drawerScroll_.offsetY = 0.0f;
        break;
    case ACT_DRAWER_SLOT:
        drawerSelectedSlot_ = hit.arg1;
        break;
    case ACT_DRAWER_INSTALL_UNIT:
        action_install_unit(inspectingFacilityId_, hit.arg1, static_cast<UnitType>(hit.arg2));
        break;
    case ACT_DRAWER_UPGRADE_UNIT:
        action_upgrade_unit(inspectingFacilityId_, hit.strArg);
        break;
    case ACT_DRAWER_CYCLE_SUPPLIER:
        action_cycle_supplier(inspectingFacilityId_, hit.strArg);
        break;
    case ACT_DRAWER_TOGGLE_AUTOPRICE:
        drawerEditAutoPricing_ = !drawerEditAutoPricing_;
        break;
    case ACT_DRAWER_APPLY_CONFIG: {
        auto fIt = state_.facilities.find(inspectingFacilityId_);
        if (fIt != state_.facilities.end()) {
            fIt->second.sellingPrice = drawerEditPrice_;
            fIt->second.adBudget = drawerEditAdBudget_;
            auto cIt = state_.companies.find(state_.playerCompanyId);
            bool hasCOO = false;
            if (cIt != state_.companies.end()) {
                for (const auto& ex : cIt->second.executives) {
                    if (ex.role == ExecutiveRole::COO && ex.hired) {
                        hasCOO = true;
                        break;
                    }
                }
            }
            fIt->second.autoPricing = hasCOO ? drawerEditAutoPricing_ : false;
            invalidate_and_persist();
            show_toast("Konfigurasi harga & iklan fasilitas disimpan.");
        }
        break;
    }
    case ACT_DRAWER_UPGRADE_FAC:
        action_upgrade_facility(inspectingFacilityId_);
        break;
    case ACT_DRAWER_DEMOLISH_CONFIRM:
        drawerConfirmDemolish_ = true;
        break;
    case ACT_DRAWER_DEMOLISH_CANCEL:
        drawerConfirmDemolish_ = false;
        break;
    case ACT_DRAWER_DEMOLISH_EXEC:
        action_demolish_facility(inspectingFacilityId_);
        break;
    default:
        break;
    }
}

void GameApp::update_and_render(caplab::gfx::D2DRenderer& gfx, double dtSeconds) {
    // 1. Drain completed async CPU simulation tick (zero render blocking)
    caplab::CompletedSimulationTick done;
    if (worker_.poll_completed(stateEpoch_, done)) {
        apply_simulation_result(std::move(done.nextState), done.emitParticles);
    }

    // 2. Schedule next monthly tick asynchronously on CPU worker thread
    if (!state_.isPaused) {
        double intervalSec = (state_.simSpeed == 5) ? 0.75 : (state_.simSpeed == 2 ? 1.80 : 3.50);
        simAccumSec_ += dtSeconds;
        if (simAccumSec_ >= intervalSec && !worker_.is_busy()) {
            simAccumSec_ = std::fmod(simAccumSec_, intervalSec);
            submit_background_month_tick(true);
        }
    }

    if (!toastText_.empty()) {
        toastTimerSec_ -= dtSeconds;
        if (toastTimerSec_ <= 0.0) {
            toastText_.clear();
        }
    }

    hits_.clear();
    float w = gfx.logical_width();
    float h = gfx.logical_height();

    constexpr float HEADER_H = 44.0f;
    constexpr float RAIL_W = 68.0f;

    caplab::gfx::RectF contentArea{RAIL_W, HEADER_H, std::max(200.0f, w - RAIL_W), std::max(200.0f, h - HEADER_H)};
    mapArea_ = contentArea;
    activeScrollArea_ = contentArea;

    if (activeTab_ == MainTab::Map) {
        render_map_view(gfx, contentArea, dtSeconds);
    } else if (activeTab_ == MainTab::Facilities) {
        render_facilities_view(gfx, contentArea);
    } else if (activeTab_ == MainTab::Market) {
        render_market_view(gfx, contentArea);
    } else if (activeTab_ == MainTab::Stocks) {
        render_stocks_view(gfx, contentArea);
    } else {
        render_hq_view(gfx, contentArea);
    }

    render_left_rail(gfx, HEADER_H, h - HEADER_H);
    render_top_header(gfx, w);

    if (showNewsModal_) {
        render_news_modal(gfx, w, h);
    } else if (showBuildModal_) {
        render_build_modal(gfx, w, h);
    } else if (!inspectingFacilityId_.empty()) {
        render_facility_drawer_modal(gfx, w, h);
    }

    if (!toastText_.empty()) {
        render_toast(gfx, w);
    }
}

void GameApp::render_top_header(caplab::gfx::D2DRenderer& gfx, float w) {
    constexpr float H = 44.0f;
    gfx.fill_rect(0.0f, 0.0f, w, H, pal::BG_HEADER);
    gfx.draw_line(0.0f, H - 1.0f, w, H - 1.0f, pal::BORDER_CARD, 1.0f);

    const Company* player = nullptr;
    auto pIt = state_.companies.find(state_.playerCompanyId);
    if (pIt != state_.companies.end()) player = &pIt->second;

    if (player) {
        draw_ceo_emblem(gfx, *player, 10.0f, 9.0f, 26.0f);
    }

    const char* ticker = player ? player->ticker.c_str() : "NUSA";
    const char* compName = player ? player->name.c_str() : "Nusantara Holdings";

    const char* cycleLabel = "Stabil";
    uint32_t cycleCol = pal::SKY_400;
    if (state_.macro.cyclePhase == EconomicCyclePhase::Boom) {
        cycleLabel = "Ekspansi";
        cycleCol = pal::EMERALD_400;
    } else if (state_.macro.cyclePhase == EconomicCyclePhase::Recession) {
        cycleLabel = "Resesi";
        cycleCol = pal::ROSE_400;
    } else if (state_.macro.cyclePhase == EconomicCyclePhase::Recovery) {
        cycleLabel = "Pemulihan";
        cycleCol = pal::AMBER_400;
    }

    // Left Executive Ticker & Date/Macro strip
    char lineLeft[192];
    std::snprintf(
        lineLeft,
        sizeof(lineLeft),
        "%s  ·  %s",
        ticker,
        compName);
    gfx.draw_text(
        lineLeft,
        {42.0f, 5.0f, 280.0f, 17.0f},
        pal::TEXT_WHITE,
        caplab::gfx::FontStyle::Bold11,
        caplab::gfx::TextAlign::Left,
        caplab::gfx::TextVAlign::Middle,
        false,
        true);

    char subLeft[192];
    std::snprintf(
        subLeft,
        sizeof(subLeft),
        "%s  ·  %s (%+.1f%%)  ·  BI %.1f%%",
        state_.dateString.c_str(),
        cycleLabel,
        state_.macro.gdpGrowthRate,
        state_.macro.centralBankRate);
    gfx.draw_text(
        subLeft,
        {42.0f, 22.0f, 300.0f, 16.0f},
        cycleCol,
        caplab::gfx::FontStyle::Mono9,
        caplab::gfx::TextAlign::Left,
        caplab::gfx::TextVAlign::Middle,
        false,
        true);

    // Center Compact Segmented Speed Cluster (Capitalism Lab command bar)
    float ctrlW = 212.0f;
    float cx = std::max(336.0f, (w - ctrlW) * 0.5f - 40.0f);
    gfx.fill_rounded_rect(cx - 2.0f, 8.0f, ctrlW + 4.0f, 28.0f, 4.0f, pal::BG_VOID);
    gfx.draw_rounded_rect(cx - 2.0f, 8.0f, ctrlW + 4.0f, 28.0f, 4.0f, pal::BORDER_SUBTLE, 1.0f);

    caplab::gfx::RectF pauseBtn{cx, 10.0f, 52.0f, 24.0f};
    draw_button(
        gfx, pauseBtn,
        state_.isPaused ? "Play" : "Jeda",
        state_.isPaused ? pal::AMBER_600 : pal::BG_SLATE_800,
        pal::BORDER_SUBTLE,
        state_.isPaused ? pal::TEXT_WHITE : pal::TEXT_SLATE_200,
        caplab::gfx::FontStyle::Bold10, 3.0f, pauseBtn.contains(mouseX_, mouseY_));
    hits_.add(pauseBtn, ACT_TOGGLE_PAUSE);

    const int speeds[3] = {1, 2, 5};
    float sx = cx + 55.0f;
    for (int sp : speeds) {
        caplab::gfx::RectF spBtn{sx, 10.0f, 30.0f, 24.0f};
        bool active = (!state_.isPaused && state_.simSpeed == sp);
        char spLbl[8];
        std::snprintf(spLbl, sizeof(spLbl), "%dx", sp);
        draw_button(
            gfx, spBtn, spLbl,
            active ? pal::SKY_600 : pal::BG_ELEVATED,
            pal::BORDER_SUBTLE,
            active ? pal::TEXT_WHITE : pal::TEXT_SLATE_400,
            caplab::gfx::FontStyle::Mono10, 3.0f, spBtn.contains(mouseX_, mouseY_));
        hits_.add(spBtn, ACT_SET_SPEED, sp);
        sx += 33.0f;
    }

    caplab::gfx::RectF advBtn{sx + 2.0f, 10.0f, 52.0f, 24.0f};
    draw_button(
        gfx, advBtn, "+1 Bln",
        pal::BG_SLATE_800, pal::BORDER_CARD, pal::SKY_400,
        caplab::gfx::FontStyle::Mono10, 3.0f, advBtn.contains(mouseX_, mouseY_));
    hits_.add(advBtn, ACT_ADVANCE_MONTH);

    // Right Executive Telemetry Strip: Cash | Monthly Profit | Stock Price | News
    caplab::gfx::RectF bellRect{w - 76.0f, 9.0f, 66.0f, 26.0f};
    bool bellHover = bellRect.contains(mouseX_, mouseY_);
    char bellTxt[32];
    std::snprintf(bellTxt, sizeof(bellTxt), "Warta %zu", std::min<size_t>(99, state_.newsFeed.size()));
    draw_button(gfx, bellRect, bellTxt, pal::BG_ELEVATED, pal::BORDER_CARD, pal::SKY_400, caplab::gfx::FontStyle::Mono9, 4.0f, bellHover);
    hits_.add(bellRect, ACT_OPEN_NEWS);

    int64_t cashVal = player ? player->cash : 0;
    int profVal = player ? player->lastMonthNetProfit : 0;
    double stockP = player ? player->stockPrice : 15.0;

    std::string cashStr = caplab::math::format_money(static_cast<double>(cashVal));
    std::string profStr = std::string(profVal >= 0 ? "+" : "") +
                          caplab::math::format_money(static_cast<double>(profVal)) + "/bln";
    char stockStr[32];
    std::snprintf(stockStr, sizeof(stockStr), "Saham $%.2f", stockP);

    gfx.draw_text(cashStr, {w - 280.0f, 6.0f, 110.0f, 16.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono12, caplab::gfx::TextAlign::Right);
    gfx.draw_text(profStr, {w - 280.0f, 22.0f, 110.0f, 15.0f}, profVal >= 0 ? pal::EMERALD_400 : pal::ROSE_400, caplab::gfx::FontStyle::Mono9, caplab::gfx::TextAlign::Right);

    gfx.draw_line(w - 163.0f, 9.0f, w - 163.0f, H - 9.0f, pal::BORDER_SUBTLE, 1.0f);
    gfx.draw_text(stockStr, {w - 158.0f, 13.0f, 76.0f, 18.0f}, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right, caplab::gfx::TextVAlign::Middle);
}

void GameApp::render_left_rail(caplab::gfx::D2DRenderer& gfx, float topY, float h) {
    constexpr float W = 68.0f;
    gfx.fill_rect(0.0f, topY, W, h, pal::BG_HEADER);
    gfx.draw_line(W - 1.0f, topY, W - 1.0f, topY + h, pal::BORDER_CARD, 1.0f);

    int playerFacCount = 0;
    for (const auto& fid : state_.facilityOrder) {
        auto it = state_.facilities.find(fid);
        if (it != state_.facilities.end() && it->second.companyId == state_.playerCompanyId) {
            playerFacCount++;
        }
    }

    struct RailItem {
        MainTab tab;
        const char* title;
        char badge[16];
    };
    RailItem items[5] = {
        {MainTab::Map, "Peta", "32x32"},
        {MainTab::Facilities, "Unit", ""},
        {MainTab::Market, "Pasar", "20"},
        {MainTab::Stocks, "Bursa", ""},
        {MainTab::HQ, "HQ", "Corp"},
    };
    std::snprintf(items[1].badge, sizeof(items[1].badge), "%d", playerFacCount);
    std::snprintf(items[3].badge, sizeof(items[3].badge), "%zu/10", state_.companies.size());

    float y = topY + 8.0f;
    for (int i = 0; i < 5; ++i) {
        caplab::gfx::RectF btn{6.0f, y, W - 12.0f, 54.0f};
        bool active = (activeTab_ == items[i].tab);
        bool hov = btn.contains(mouseX_, mouseY_);
        uint32_t bg = active ? 0x260EA5E9u : (hov ? pal::BG_SLATE_800 : pal::BG_HEADER);
        uint32_t brd = active ? pal::SKY_500 : pal::BORDER_SUBTLE;
        gfx.fill_rounded_rect(btn.x, btn.y, btn.w, btn.h, 4.0f, bg);
        gfx.draw_rounded_rect(btn.x, btn.y, btn.w, btn.h, 4.0f, brd, active ? 1.2f : 0.7f);
        if (active) {
            gfx.fill_rect(0.0f, btn.y + 4.0f, 3.0f, btn.h - 8.0f, pal::SKY_400);
        }

        draw_nav_icon(gfx, i, btn.x + btn.w * 0.5f, btn.y + 17.0f, 16.0f,
                      active ? pal::SKY_400 : (hov ? pal::TEXT_WHITE : pal::TEXT_SLATE_400));

        gfx.draw_text(
            items[i].title,
            {btn.x + 2.0f, btn.y + 27.0f, btn.w - 4.0f, 14.0f},
            active ? pal::TEXT_WHITE : pal::TEXT_SLATE_300,
            caplab::gfx::FontStyle::Bold9,
            caplab::gfx::TextAlign::Center,
            caplab::gfx::TextVAlign::Middle,
            false,
            false);

        gfx.draw_text(
            items[i].badge,
            {btn.x + 2.0f, btn.y + 40.0f, btn.w - 4.0f, 12.0f},
            active ? pal::SKY_400 : pal::TEXT_SLATE_500,
            caplab::gfx::FontStyle::Mono9,
            caplab::gfx::TextAlign::Center,
            caplab::gfx::TextVAlign::Middle,
            false,
            false);

        hits_.add(btn, ACT_NAV_TAB, static_cast<int>(items[i].tab));
        y += 60.0f;
    }

    // Bottom hardware & city counter
    char footBuf[64];
    std::snprintf(footBuf, sizeof(footBuf), "%zu Fac\n%s",
                  state_.facilities.size(),
                  gfx.is_discrete_gpu() ? "dGPU" : "GPU");
    gfx.draw_text(
        footBuf,
        {4.0f, topY + h - 38.0f, W - 8.0f, 32.0f},
        pal::TEXT_SLATE_500,
        caplab::gfx::FontStyle::Mono9,
        caplab::gfx::TextAlign::Center,
        caplab::gfx::TextVAlign::Middle,
        true,
        false);
}

void GameApp::render_map_view(caplab::gfx::D2DRenderer& gfx, const caplab::gfx::RectF& area, double dt) {
    isoEngine_.set_viewport(area.x, area.y, area.w, area.h);

    caplab::iso::IsometricRenderOptions opts{};
    opts.showBadges = showBadges_;
    opts.focusCompanyId = filterMyFacilitiesOnly_ ? state_.playerCompanyId : "";
    opts.showTrafficOverlay = showTrafficOverlay_;
    isoEngine_.update_and_render(gfx, state_, dt, opts);

    // Top-left City Telemetry Strip (generous width, zero truncation)
    float pillW = std::min(430.0f, std::max(240.0f, area.w - 140.0f));
    caplab::gfx::RectF cityPill{area.x + 12.0f, area.y + 10.0f, pillW, 24.0f};
    gfx.fill_rounded_rect(cityPill.x, cityPill.y, cityPill.w, cityPill.h, 4.0f, 0xD8090E1Au);
    gfx.draw_rounded_rect(cityPill.x, cityPill.y, cityPill.w, cityPill.h, 4.0f, pal::BORDER_CARD, 1.0f);
    char cityTxt[128];
    std::snprintf(
        cityTxt, sizeof(cityTxt), "%s  ·  %s Jiwa  ·  Indeks Konsumen %d",
        state_.city.name.c_str(),
        caplab::math::format_int_commas(state_.city.population).c_str(),
        state_.city.consumerConfidence);
    gfx.draw_text(
        cityTxt, {cityPill.x + 10.0f, cityPill.y, cityPill.w - 20.0f, cityPill.h},
        pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Mono10,
        caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Middle, false, false);

    // Compact 24px Map Overlay Filter Strip
    float px = area.x + 12.0f;
    float py = area.y + 40.0f;
    caplab::gfx::RectF fBtn{px, py, 122.0f, 24.0f};
    draw_button(gfx, fBtn, filterMyFacilitiesOnly_ ? "Milik Saya" : "Semua Korporasi",
                filterMyFacilitiesOnly_ ? pal::SKY_600 : 0xD80E1525u, pal::BORDER_CARD,
                filterMyFacilitiesOnly_ ? pal::TEXT_WHITE : pal::TEXT_SLATE_300,
                caplab::gfx::FontStyle::Bold10, 4.0f, fBtn.contains(mouseX_, mouseY_));
    hits_.add(fBtn, ACT_MAP_FILTER_MINE);

    caplab::gfx::RectF tBtn{px + 128.0f, py, 98.0f, 24.0f};
    draw_button(gfx, tBtn, showTrafficOverlay_ ? "Keramaian On" : "Keramaian",
                showTrafficOverlay_ ? pal::AMBER_600 : 0xD80E1525u, pal::BORDER_CARD,
                showTrafficOverlay_ ? pal::TEXT_WHITE : pal::TEXT_SLATE_300,
                caplab::gfx::FontStyle::Bold10, 4.0f, tBtn.contains(mouseX_, mouseY_));
    hits_.add(tBtn, ACT_MAP_TOGGLE_TRAFFIC);

    caplab::gfx::RectF bBtn{px + 232.0f, py, 82.0f, 24.0f};
    draw_button(gfx, bBtn, showBadges_ ? "Label On" : "Label Off",
                showBadges_ ? 0xD80E1525u : 0xD81A253Au, pal::BORDER_CARD,
                showBadges_ ? pal::SKY_400 : pal::TEXT_SLATE_400,
                caplab::gfx::FontStyle::Bold10, 4.0f, bBtn.contains(mouseX_, mouseY_));
    hits_.add(bBtn, ACT_MAP_TOGGLE_BADGES);

    // Top-right Camera Cluster: Fokus HQ, +, -
    float rx = area.x + area.w - 46.0f;
    float ry = area.y + 10.0f;
    caplab::gfx::RectF hqBtn{rx - 36.0f, ry, 70.0f, 26.0f};
    draw_button(gfx, hqBtn, "Fokus HQ", 0xDE090E1Au, pal::BORDER_CARD, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Bold10, 4.0f, hqBtn.contains(mouseX_, mouseY_));
    hits_.add(hqBtn, ACT_MAP_FOCUS_HQ);

    caplab::gfx::RectF zinBtn{rx + 4.0f, ry + 32.0f, 30.0f, 28.0f};
    draw_button(gfx, zinBtn, "+", 0xDE090E1Au, pal::BORDER_CARD, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12, 4.0f, zinBtn.contains(mouseX_, mouseY_));
    hits_.add(zinBtn, ACT_MAP_ZOOM_IN);

    caplab::gfx::RectF zoutBtn{rx + 4.0f, ry + 64.0f, 30.0f, 28.0f};
    draw_button(gfx, zoutBtn, "-", 0xDE090E1Au, pal::BORDER_CARD, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12, 4.0f, zoutBtn.contains(mouseX_, mouseY_));
    hits_.add(zoutBtn, ACT_MAP_ZOOM_OUT);

    // Bottom-right Compact Build CTA
    caplab::gfx::RectF fab{area.x + area.w - 140.0f, area.y + area.h - 48.0f, 128.0f, 36.0f};
    draw_button(gfx, fab, "+ Konstruksi", pal::SKY_600, pal::SKY_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, 4.0f, fab.contains(mouseX_, mouseY_));
    auto selTile = isoEngine_.selected_tile();
    hits_.add(fab, ACT_OPEN_BUILD_MODAL, selTile ? selTile->x : -1, selTile ? selTile->y : -1);

    // Bottom-left Capitalism Lab Executive Quick-Inspector (zero text truncation + 3x3 unit matrix)
    if (selTile) {
        const MapParcel* parcel = caplab::spatial::get_parcel_at(state_.mapParcels, selTile->x, selTile->y);
        if (parcel) {
            const Facility* selFac = nullptr;
            if (!parcel->facilityId.empty()) {
                auto fIt = state_.facilities.find(parcel->facilityId);
                if (fIt != state_.facilities.end()) selFac = &fIt->second;
            }
            const Company* owner = nullptr;
            if (selFac) {
                auto cIt = state_.companies.find(selFac->companyId);
                if (cIt != state_.companies.end()) owner = &cIt->second;
            }

            float cardW = std::min(560.0f, std::max(360.0f, area.w - 168.0f));
            caplab::gfx::RectF infoCard{area.x + 12.0f, area.y + area.h - 94.0f, cardW, 82.0f};
            gfx.fill_rounded_rect(infoCard.x, infoCard.y, infoCard.w, infoCard.h, 5.0f, 0xEC090E1Au);
            gfx.draw_rounded_rect(infoCard.x, infoCard.y, infoCard.w, infoCard.h, 5.0f, pal::BORDER_CARD, 1.0f);

            if (selFac) {
                draw_facility_icon(gfx, selFac->type, infoCard.x + 10.0f, infoCard.y + 10.0f, 38.0f);
                draw_mini_unit_matrix(gfx, *selFac, infoCard.x + 54.0f, infoCard.y + 10.0f, 44.0f);

                float textX = infoCard.x + 108.0f;
                float textW = std::max(140.0f, infoCard.w - 226.0f);

                char titleLine[128];
                std::snprintf(titleLine, sizeof(titleLine), "%s · Lv.%d", selFac->name.c_str(), selFac->level);
                gfx.draw_text(titleLine, {textX, infoCard.y + 10.0f, textW, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11);

                char subLine[160];
                std::snprintf(
                    subLine, sizeof(subLine), "%s (%s) · Laba %s/bln · Omzet %s",
                    owner ? owner->ticker.c_str() : "PEMKOT",
                    parcel->districtName.c_str(),
                    caplab::math::format_money(selFac->monthlyProfit).c_str(),
                    caplab::math::format_money(selFac->monthlyRevenue).c_str());
                gfx.draw_text(subLine, {textX, infoCard.y + 32.0f, textW, 16.0f},
                              selFac->monthlyProfit >= 0 ? pal::EMERALD_400 : pal::ROSE_400, caplab::gfx::FontStyle::Mono10);

                char coordLine[128];
                std::snprintf(coordLine, sizeof(coordLine), "Kavling (%d,%d) · Trafik %d/100 · %zu/9 Unit",
                              parcel->x, parcel->y, parcel->trafficIndex, selFac->units.size());
                gfx.draw_text(coordLine, {textX, infoCard.y + 52.0f, textW, 15.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono9);

                bool isPlayerOwned = (selFac->companyId == state_.playerCompanyId);
                caplab::gfx::RectF actBtn{infoCard.x + infoCard.w - 108.0f, infoCard.y + 22.0f, 96.0f, 38.0f};
                draw_button(gfx, actBtn, isPlayerOwned ? "Kelola" : "Detail",
                            isPlayerOwned ? pal::SKY_600 : pal::BG_SLATE_800, pal::BORDER_CARD, pal::TEXT_WHITE,
                            caplab::gfx::FontStyle::Bold11, 4.0f, actBtn.contains(mouseX_, mouseY_));
                hits_.add(actBtn, ACT_INSPECT_FACILITY, 0, 0, selFac->id);
            } else {
                const char* terrainDesc = "Kavling Komersial Siap Bangun";
                if (parcel->terrainType == TerrainType::Water) terrainDesc = "Kawasan Sungai / Pelabuhan";
                else if (parcel->terrainType == TerrainType::Road) terrainDesc = "Jalur Jalan Raya Kota";
                else if (parcel->terrainType == TerrainType::IndustrialZone) terrainDesc = "Zona Industri & Manufaktur";

                float textW = std::max(180.0f, infoCard.w - 144.0f);
                char tTitle[96];
                std::snprintf(tTitle, sizeof(tTitle), "%s (%d, %d)", terrainDesc, parcel->x, parcel->y);
                gfx.draw_text(tTitle, {infoCard.x + 14.0f, infoCard.y + 14.0f, textW, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11);

                char tSub[128];
                std::snprintf(
                    tSub, sizeof(tSub), "%s · Keramaian %d/100 · Lahan %s",
                    parcel->districtName.c_str(), parcel->trafficIndex,
                    caplab::math::format_cost_short(static_cast<double>(parcel->landValue)).c_str());
                gfx.draw_text(tSub, {infoCard.x + 14.0f, infoCard.y + 38.0f, textW, 18.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono10);

                if (parcel->isZoneAllowed) {
                    caplab::gfx::RectF buildBtn{infoCard.x + infoCard.w - 118.0f, infoCard.y + 22.0f, 106.0f, 38.0f};
                    draw_button(gfx, buildBtn, "Bangun Sini", pal::EMERALD_600, pal::EMERALD_400, pal::TEXT_WHITE,
                                caplab::gfx::FontStyle::Bold11, 4.0f, buildBtn.contains(mouseX_, mouseY_));
                    hits_.add(buildBtn, ACT_OPEN_BUILD_MODAL, parcel->x, parcel->y);
                }
            }
        }
    }
}

void GameApp::render_facilities_view(caplab::gfx::D2DRenderer& gfx, const caplab::gfx::RectF& area) {
    gfx.fill_rect(area.x, area.y, area.w, area.h, pal::BG_VOID);

    std::vector<const Facility*> playerFacs;
    int64_t totalRev = 0, totalProf = 0;
    for (const auto& fid : state_.facilityOrder) {
        auto it = state_.facilities.find(fid);
        if (it == state_.facilities.end()) continue;
        if (it->second.companyId == state_.playerCompanyId) {
            playerFacs.push_back(&it->second);
            totalRev += it->second.monthlyRevenue;
            totalProf += it->second.monthlyProfit;
        }
    }

    mainScroll_.viewHeight = area.h;
    gfx.push_clip(area);
    float pad = 20.0f;
    float cw = std::min(1160.0f, area.w - pad * 2.0f);
    float cx = area.x + (area.w - cw) * 0.5f;
    float y = area.y + pad - mainScroll_.offsetY;

    // Summary header card
    gfx.fill_rounded_rect(cx, y, cw, 112.0f, 5.0f, pal::BG_CARD);
    gfx.draw_rounded_rect(cx, y, cw, 112.0f, 5.0f, pal::BORDER_SUBTLE, 1.0f);
    gfx.draw_text("Portofolio Fasilitas & Rantai Pasok", {cx + 18.0f, y + 14.0f, 400.0f, 22.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);

    char cntTxt[32];
    std::snprintf(cntTxt, sizeof(cntTxt), "%zu Unit Aktif", playerFacs.size());
    gfx.draw_text(cntTxt, {cx + cw - 220.0f, y + 16.0f, 92.0f, 20.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono11, caplab::gfx::TextAlign::Right);

    caplab::gfx::RectF bldBtn{cx + cw - 118.0f, y + 10.0f, 100.0f, 34.0f};
    draw_button(gfx, bldBtn, "+ Bangun", pal::SKY_600, pal::SKY_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, 10.0f, bldBtn.contains(mouseX_, mouseY_));
    hits_.add(bldBtn, ACT_OPEN_BUILD_MODAL, -1, -1);

    gfx.draw_line(cx + 18.0f, y + 54.0f, cx + cw - 18.0f, y + 54.0f, pal::BORDER_SUBTLE, 1.0f);
    gfx.draw_text("Total Omzet Bulanan", {cx + 18.0f, y + 62.0f, 220.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
    gfx.draw_text(caplab::math::format_signed_currency(static_cast<double>(totalRev)),
                  {cx + 18.0f, y + 79.0f, 260.0f, 24.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono14);

    gfx.draw_text("Laba Operasional Bersih", {cx + cw * 0.5f, y + 62.0f, 220.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
    gfx.draw_text(caplab::math::format_signed_currency(static_cast<double>(totalProf)),
                  {cx + cw * 0.5f, y + 79.0f, 260.0f, 24.0f}, totalProf >= 0 ? pal::EMERALD_400 : pal::ROSE_400, caplab::gfx::FontStyle::Mono14);
    y += 124.0f;

    // Mode Switcher
    gfx.fill_rounded_rect(cx, y, cw, 44.0f, 12.0f, pal::BG_CARD);
    gfx.draw_rounded_rect(cx, y, cw, 44.0f, 12.0f, pal::BORDER_SUBTLE, 1.0f);
    float halfW = (cw - 12.0f) * 0.5f;
    caplab::gfx::RectF m0{cx + 4.0f, y + 4.0f, halfW, 36.0f};
    caplab::gfx::RectF m1{cx + 8.0f + halfW, y + 4.0f, halfW, 36.0f};
    draw_button(gfx, m0, "Daftar Fasilitas", !facSupplyChainMode_ ? pal::SKY_600 : pal::BG_CARD, 0,
                !facSupplyChainMode_ ? pal::TEXT_WHITE : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold11, 8.0f);
    draw_button(gfx, m1, "Aliran Rantai Pasok", facSupplyChainMode_ ? pal::SKY_600 : pal::BG_CARD, 0,
                facSupplyChainMode_ ? pal::TEXT_WHITE : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold11, 8.0f);
    hits_.add(m0, ACT_FAC_VIEW_MODE, 0);
    hits_.add(m1, ACT_FAC_VIEW_MODE, 1);
    y += 56.0f;

    if (!facSupplyChainMode_) {
        struct CatTab { int cat; const char* lbl; };
        const CatTab cats[7] = {
            {-1, "Semua"},
            {static_cast<int>(FacilityCategory::Store), "Ritel"},
            {static_cast<int>(FacilityCategory::RealEstate), "Properti"},
            {static_cast<int>(FacilityCategory::Factory), "Pabrik & Gudang"},
            {static_cast<int>(FacilityCategory::Raw), "Hulu"},
            {static_cast<int>(FacilityCategory::Digital), "Digital & Media"},
            {static_cast<int>(FacilityCategory::Corporate), "Riset & HQ"},
        };
        gfx.fill_rounded_rect(cx, y, cw, 42.0f, 12.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(cx, y, cw, 42.0f, 12.0f, pal::BORDER_SUBTLE, 1.0f);
        float fx = cx + 6.0f;
        float pillW = (cw - 12.0f - 6.0f * 6.0f) / 7.0f;
        for (const auto& c : cats) {
            caplab::gfx::RectF fb{fx, y + 5.0f, pillW, 32.0f};
            bool active = (facFilterCat_ == c.cat);
            draw_button(gfx, fb, c.lbl, active ? pal::SKY_600 : pal::BG_CARD, 0,
                        active ? pal::TEXT_WHITE : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold10, 8.0f);
            hits_.add(fb, ACT_FAC_FILTER, c.cat);
            fx += pillW + 6.0f;
        }
        y += 54.0f;

        std::vector<const Facility*> filtered;
        for (const auto* f : playerFacs) {
            if (facFilterCat_ < 0 || static_cast<int>(get_facility_spec(f->type).category) == facFilterCat_) {
                filtered.push_back(f);
            }
        }

        if (filtered.empty()) {
            gfx.fill_rounded_rect(cx, y, cw, 120.0f, 5.0f, pal::BG_CARD);
            gfx.draw_text("Belum ada fasilitas di kategori ini.", {cx, y + 36.0f, cw, 24.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold12, caplab::gfx::TextAlign::Center);
            y += 136.0f;
        } else {
            int cols = (cw >= 720.0f) ? 2 : 1;
            float gap = 12.0f;
            float cardW = (cw - gap * static_cast<float>(cols - 1)) / static_cast<float>(cols);
            float cardH = 166.0f;

            for (size_t i = 0; i < filtered.size(); ++i) {
                int col = static_cast<int>(i % static_cast<size_t>(cols));
                int row = static_cast<int>(i / static_cast<size_t>(cols));
                float bx = cx + static_cast<float>(col) * (cardW + gap);
                float by = y + static_cast<float>(row) * (cardH + gap);

                const Facility& fac = *filtered[i];
                caplab::gfx::RectF card{bx, by, cardW, cardH};
                bool hov = card.contains(mouseX_, mouseY_);
                gfx.fill_rounded_rect(card.x, card.y, card.w, card.h, 5.0f, pal::BG_CARD);
                gfx.draw_rounded_rect(card.x, card.y, card.w, card.h, 5.0f, hov ? pal::SKY_500 : pal::BORDER_SUBTLE, 1.0f);

                draw_facility_icon(gfx, fac.type, card.x + 12.0f, card.y + 12.0f, 38.0f);
                draw_mini_unit_matrix(gfx, fac, card.x + card.w - 50.0f, card.y + 10.0f, 38.0f);
                char ttl[128];
                std::snprintf(ttl, sizeof(ttl), "%s · Lv.%d", fac.name.c_str(), fac.level);
                gfx.draw_text(ttl, {card.x + 58.0f, card.y + 12.0f, card.w - 118.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);

                const char* prodName = "Korporat";
                for (const auto& u : fac.units) {
                    if (u.hasTargetProduct) {
                        prodName = get_product(u.targetProductId).name;
                        break;
                    }
                }
                char sub[96];
                std::snprintf(sub, sizeof(sub), "%s · (%d, %d)", prodName, fac.tileX, fac.tileY);
                gfx.draw_text(sub, {card.x + 58.0f, card.y + 32.0f, card.w - 118.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono10);

                gfx.draw_line(card.x + 14.0f, card.y + 66.0f, card.x + card.w - 14.0f, card.y + 66.0f, pal::BORDER_SUBTLE, 1.0f);

                float c3 = (card.w - 28.0f) / 3.0f;
                gfx.draw_text("Pendapatan", {card.x + 14.0f, card.y + 72.0f, c3, 14.0f}, pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Regular10);
                gfx.draw_text(caplab::math::format_signed_currency(fac.monthlyRevenue),
                              {card.x + 14.0f, card.y + 87.0f, c3, 16.0f}, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Mono10);

                gfx.draw_text("Laba Bersih", {card.x + 14.0f + c3, card.y + 72.0f, c3, 14.0f}, pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Regular10);
                gfx.draw_text(caplab::math::format_signed_currency(fac.monthlyProfit),
                              {card.x + 14.0f + c3, card.y + 87.0f, c3, 16.0f}, fac.monthlyProfit >= 0 ? pal::EMERALD_400 : pal::ROSE_400, caplab::gfx::FontStyle::Mono10);

                char slotTxt[24];
                std::snprintf(slotTxt, sizeof(slotTxt), "%zu/9 Unit", fac.units.size());
                gfx.draw_text("Slot 3x3", {card.x + 14.0f + c3 * 2.0f, card.y + 72.0f, c3, 14.0f}, pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Regular10, caplab::gfx::TextAlign::Right);
                gfx.draw_text(slotTxt, {card.x + 14.0f + c3 * 2.0f, card.y + 87.0f, c3, 16.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);

                // Quality & Brand mini bars
                float bw = (card.w - 40.0f) * 0.5f;
                char ql[24], bl[24];
                std::snprintf(ql, sizeof(ql), "Kualitas %d%%", fac.qualityRating);
                std::snprintf(bl, sizeof(bl), "Merek %d%%", fac.brandRating);
                gfx.draw_text(ql, {card.x + 14.0f, card.y + 116.0f, bw, 14.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono9);
                draw_progress_bar(gfx, {card.x + 14.0f, card.y + 134.0f, bw, 6.0f}, static_cast<float>(fac.qualityRating) / 100.0f, pal::BG_SLATE_800, pal::SKY_500);

                gfx.draw_text(bl, {card.x + 26.0f + bw, card.y + 116.0f, bw, 14.0f}, pal::AMBER_400, caplab::gfx::FontStyle::Mono9);
                draw_progress_bar(gfx, {card.x + 26.0f + bw, card.y + 134.0f, bw, 6.0f}, static_cast<float>(fac.brandRating) / 100.0f, pal::BG_SLATE_800, pal::AMBER_500);

                hits_.add(card, ACT_INSPECT_FACILITY, 0, 0, fac.id);
            }

            int totalRows = static_cast<int>((filtered.size() + static_cast<size_t>(cols) - 1) / static_cast<size_t>(cols));
            y += static_cast<float>(totalRows) * (cardH + gap) + 12.0f;
        }
    } else {
        int cols = (cw >= 720.0f) ? 2 : 1;
        float gap = 12.0f;
        float cardW = (cw - gap * static_cast<float>(cols - 1)) / static_cast<float>(cols);
        float cardH = 104.0f;

        for (size_t i = 0; i < playerFacs.size(); ++i) {
            int col = static_cast<int>(i % static_cast<size_t>(cols));
            int row = static_cast<int>(i / static_cast<size_t>(cols));
            float bx = cx + static_cast<float>(col) * (cardW + gap);
            float by = y + static_cast<float>(row) * (cardH + gap);

            const Facility& fac = *playerFacs[i];
            caplab::gfx::RectF card{bx, by, cardW, cardH};
            gfx.fill_rounded_rect(card.x, card.y, card.w, card.h, 5.0f, pal::BG_CARD);
            gfx.draw_rounded_rect(card.x, card.y, card.w, card.h, 5.0f, card.contains(mouseX_, mouseY_) ? pal::SKY_500 : pal::BORDER_SUBTLE, 1.0f);

            draw_facility_icon(gfx, fac.type, card.x + 14.0f, card.y + 12.0f, 32.0f);
            gfx.draw_text(fac.name, {card.x + 54.0f, card.y + 16.0f, card.w - 140.0f, 22.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);

            const InternalUnit* purch = nullptr;
            const char* prodName = "Korporat";
            for (const auto& u : fac.units) {
                if (u.type == UnitType::Purchasing && !purch) purch = &u;
                if (u.hasTargetProduct) prodName = get_product(u.targetProductId).name;
            }
            gfx.draw_text(prodName, {card.x + card.w - 130.0f, card.y + 18.0f, 116.0f, 18.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);

            gfx.fill_rounded_rect(card.x + 14.0f, card.y + 54.0f, card.w - 28.0f, 34.0f, 10.0f, pal::BG_HEADER);
            gfx.draw_text("Sumber Pasok:", {card.x + 24.0f, card.y + 62.0f, 110.0f, 18.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11);

            std::string srcTxt = "Produksi / Riset Hulu";
            uint32_t srcCol = pal::TEXT_SLATE_400;
            if (purch) {
                auto sIt = state_.facilities.find(purch->supplierFacilityId);
                if (sIt != state_.facilities.end()) {
                    srcTxt = sIt->second.name + " (Q:" + std::to_string(sIt->second.qualityRating) + ")";
                    srcCol = pal::EMERALD_400;
                } else {
                    srcTxt = "Pelabuhan Impor Global";
                    srcCol = pal::AMBER_400;
                }
            }
            gfx.draw_text(srcTxt, {card.x + 135.0f, card.y + 62.0f, card.w - 160.0f, 18.0f}, srcCol, caplab::gfx::FontStyle::Bold11, caplab::gfx::TextAlign::Right);
            hits_.add(card, ACT_INSPECT_FACILITY, 0, 0, fac.id);
        }

        int totalRows = static_cast<int>((playerFacs.size() + static_cast<size_t>(cols) - 1) / static_cast<size_t>(cols));
        y += static_cast<float>(totalRows) * (cardH + gap) + 12.0f;
    }

    mainScroll_.contentHeight = std::max(area.h, (y + mainScroll_.offsetY) - area.y + 20.0f);
    mainScroll_.clamp();
    draw_scrollbar(gfx, area, mainScroll_);
    gfx.pop_clip();
}

void GameApp::render_market_view(caplab::gfx::D2DRenderer& gfx, const caplab::gfx::RectF& area) {
    gfx.fill_rect(area.x, area.y, area.w, area.h, pal::BG_VOID);

    mainScroll_.viewHeight = area.h;
    gfx.push_clip(area);
    float pad = 20.0f;
    float cw = std::min(1160.0f, area.w - pad * 2.0f);
    float cx = area.x + (area.w - cw) * 0.5f;
    float y = area.y + pad - mainScroll_.offsetY;

    // Header
    gfx.fill_rounded_rect(cx, y, cw, 64.0f, 5.0f, pal::BG_CARD);
    gfx.draw_rounded_rect(cx, y, cw, 64.0f, 5.0f, pal::BORDER_SUBTLE, 1.0f);
    gfx.draw_text("Analisis Pasar & Panduan Produk Kota", {cx + 18.0f, y + 12.0f, 420.0f, 20.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
    char macroSub[128];
    std::snprintf(macroSub, sizeof(macroSub), "%s · Upah $%s · Tarif Impor %.0f%%",
                  state_.city.name.c_str(),
                  caplab::math::format_int_commas(state_.city.averageWage).c_str(),
                  state_.macro.importTariffRate * 100.0);
    gfx.draw_text(macroSub, {cx + 18.0f, y + 36.0f, cw - 36.0f, 18.0f}, pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Mono10);
    y += 76.0f;

    // 5 Category filter tabs
    struct MCat { int id; const char* lbl; };
    const MCat mcats[5] = {
        {-1, "Semua Produk"},
        {static_cast<int>(ProductCategory::Consumer), "Barang Konsumen"},
        {static_cast<int>(ProductCategory::Digital), "Digital Age"},
        {static_cast<int>(ProductCategory::Intermediate), "Barang Antara"},
        {static_cast<int>(ProductCategory::Raw), "Bahan Baku"},
    };
    gfx.fill_rounded_rect(cx, y, cw, 42.0f, 12.0f, pal::BG_CARD);
    gfx.draw_rounded_rect(cx, y, cw, 42.0f, 12.0f, pal::BORDER_SUBTLE, 1.0f);
    float mx = cx + 6.0f;
    float pw = (cw - 12.0f - 24.0f) / 5.0f;
    for (const auto& c : mcats) {
        caplab::gfx::RectF mb{mx, y + 5.0f, pw, 32.0f};
        bool act = (mktFilterCat_ == c.id);
        draw_button(gfx, mb, c.lbl, act ? pal::SKY_600 : pal::BG_CARD, 0,
                    act ? pal::TEXT_WHITE : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold10, 8.0f);
        hits_.add(mb, ACT_MKT_FILTER, c.id);
        mx += pw + 6.0f;
    }
    y += 54.0f;

    std::vector<const ProductRecipe*> prods;
    for (const auto& p : get_all_products()) {
        if (mktFilterCat_ < 0 || static_cast<int>(p.category) == mktFilterCat_) {
            prods.push_back(&p);
        }
    }

    int cols = (cw >= 960.0f) ? 3 : ((cw >= 620.0f) ? 2 : 1);
    float gap = 12.0f;
    float cardW = (cw - gap * static_cast<float>(cols - 1)) / static_cast<float>(cols);
    float cardH = 212.0f;

    for (size_t i = 0; i < prods.size(); ++i) {
        int col = static_cast<int>(i % static_cast<size_t>(cols));
        int row = static_cast<int>(i / static_cast<size_t>(cols));
        float bx = cx + static_cast<float>(col) * (cardW + gap);
        float by = y + static_cast<float>(row) * (cardH + gap);

        const ProductRecipe& prod = *prods[i];
        const ProductMarketStats& stat = state_.city.productStats[static_cast<size_t>(prod.id)];
        double avgP = stat.averageMarketPrice > 0.0 ? stat.averageMarketPrice : prod.basePrice;
        double seaportEff = caplab::math::round2(prod.seaportPrice * (1.0 + state_.macro.importTariffRate));

        gfx.fill_rounded_rect(bx, by, cardW, cardH, 5.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(bx, by, cardW, cardH, 5.0f, pal::BORDER_SUBTLE, 1.0f);

        draw_product_icon(gfx, prod.id, bx + 14.0f, by + 14.0f, 40.0f);
        gfx.draw_text(prod.name, {bx + 62.0f, by + 14.0f, cardW - 140.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);
        const char* catLbl = prod.category == ProductCategory::Digital ? "Digital Age"
                           : prod.category == ProductCategory::Consumer ? "Konsumen"
                           : prod.category == ProductCategory::Intermediate ? "Intermediate" : "Bahan Baku";
        char unitBuf[64];
        std::snprintf(unitBuf, sizeof(unitBuf), "%s · %s", catLbl, prod.unit);
        gfx.draw_text(unitBuf, {bx + 62.0f, by + 34.0f, cardW - 140.0f, 15.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);

        char priceBuf[32];
        std::snprintf(priceBuf, sizeof(priceBuf), "$%.2f", avgP);
        gfx.draw_text(priceBuf, {bx + cardW - 90.0f, by + 14.0f, 76.0f, 18.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono12, caplab::gfx::TextAlign::Right);
        gfx.draw_text("Harga Pasar", {bx + cardW - 90.0f, by + 34.0f, 76.0f, 14.0f}, pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Regular10, caplab::gfx::TextAlign::Right);

        gfx.draw_text(prod.description, {bx + 14.0f, by + 60.0f, cardW - 28.0f, 34.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10, caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Top, true, false);

        // 3-segment appeal weight bar
        char wTxt[64];
        std::snprintf(wTxt, sizeof(wTxt), "H %.0f%% · K %.0f%% · M %.0f%%",
                      prod.appealWeights.price * 100.0,
                      prod.appealWeights.quality * 100.0,
                      prod.appealWeights.brand * 100.0);
        gfx.draw_text("Daya Tarik", {bx + 14.0f, by + 100.0f, 100.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
        gfx.draw_text(wTxt, {bx + 100.0f, by + 100.0f, cardW - 114.0f, 14.0f}, pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Mono9, caplab::gfx::TextAlign::Right);

        float barW = cardW - 28.0f;
        float w1 = barW * static_cast<float>(prod.appealWeights.price);
        float w2 = barW * static_cast<float>(prod.appealWeights.quality);
        float w3 = std::max(0.0f, barW - w1 - w2);
        gfx.fill_rect(bx + 14.0f, by + 118.0f, w1, 6.0f, pal::EMERALD_500);
        gfx.fill_rect(bx + 14.0f + w1, by + 118.0f, w2, 6.0f, pal::SKY_500);
        gfx.fill_rect(bx + 14.0f + w1 + w2, by + 118.0f, w3, 6.0f, pal::AMBER_500);

        // Recipe inputs
        if (!prod.inputs.empty()) {
            std::string inpStr = "Bahan: ";
            for (size_t k = 0; k < prod.inputs.size(); ++k) {
                if (k > 0) inpStr += ", ";
                char amtBuf[16];
                std::snprintf(amtBuf, sizeof(amtBuf), " (%.1fx)", prod.inputs[k].amount);
                inpStr += get_product(prod.inputs[k].productId).name;
                inpStr += amtBuf;
            }
            gfx.draw_text(inpStr, {bx + 14.0f, by + 132.0f, cardW - 28.0f, 24.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono9, caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Top, true, false);
        }

        gfx.draw_line(bx + 14.0f, by + 162.0f, bx + cardW - 14.0f, by + 162.0f, pal::BORDER_SUBTLE, 1.0f);
        float c3 = (cardW - 28.0f) / 3.0f;
        gfx.draw_text("Permintaan", {bx + 14.0f, by + 168.0f, c3, 14.0f}, pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Regular10);
        gfx.draw_text(caplab::math::format_int_commas(stat.monthlyDemand),
                      {bx + 14.0f, by + 184.0f, c3, 16.0f}, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Mono10);

        gfx.draw_text("Impor Port", {bx + 14.0f + c3, by + 168.0f, c3, 14.0f}, pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Regular10);
        char impBuf[32];
        std::snprintf(impBuf, sizeof(impBuf), "$%.1f (%d%%)", seaportEff, stat.seaportImportShare);
        gfx.draw_text(impBuf, {bx + 14.0f + c3, by + 184.0f, c3, 16.0f}, pal::AMBER_400, caplab::gfx::FontStyle::Mono10);

        gfx.draw_text("Pangsa Anda", {bx + 14.0f + c3 * 2.0f, by + 168.0f, c3, 14.0f}, pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Regular10, caplab::gfx::TextAlign::Right);
        char shBuf[32];
        if (prod.category == ProductCategory::Consumer || prod.category == ProductCategory::Digital) {
            std::snprintf(shBuf, sizeof(shBuf), "%d%%", stat.playerMarketShare);
        } else {
            std::snprintf(shBuf, sizeof(shBuf), "Penuhi %d%%", stat.satisfactionRate);
        }
        gfx.draw_text(shBuf, {bx + 14.0f + c3 * 2.0f, by + 184.0f, c3, 16.0f}, stat.playerMarketShare > 0 ? pal::SKY_400 : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);
    }

    int totalRows = static_cast<int>((prods.size() + static_cast<size_t>(cols) - 1) / static_cast<size_t>(cols));
    y += static_cast<float>(totalRows) * (cardH + gap) + 12.0f;
    mainScroll_.contentHeight = std::max(area.h, (y + mainScroll_.offsetY) - area.y + 20.0f);
    mainScroll_.clamp();
    draw_scrollbar(gfx, area, mainScroll_);
    gfx.pop_clip();
}

void GameApp::render_stocks_view(caplab::gfx::D2DRenderer& gfx, const caplab::gfx::RectF& area) {
    gfx.fill_rect(area.x, area.y, area.w, area.h, pal::BG_VOID);

    float pad = 20.0f;
    float cw = std::min(1160.0f, area.w - pad * 2.0f);
    float cx = area.x + (area.w - cw) * 0.5f;
    float y = area.y + pad;

    // Sub-tabs
    gfx.fill_rounded_rect(cx, y, cw, 46.0f, 12.0f, pal::BG_CARD);
    gfx.draw_rounded_rect(cx, y, cw, 46.0f, 12.0f, pal::BORDER_SUBTLE, 1.0f);
    float halfW = (cw - 12.0f) * 0.5f;
    caplab::gfx::RectF st0{cx + 4.0f, y + 4.0f, halfW, 38.0f};
    caplab::gfx::RectF st1{cx + 8.0f + halfW, y + 4.0f, halfW, 38.0f};
    draw_button(gfx, st0, "Bursa Saham & M&A", stockSubTab_ == StockSubTab::Stocks ? pal::SKY_600 : pal::BG_CARD,
                0, stockSubTab_ == StockSubTab::Stocks ? pal::TEXT_WHITE : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold12, 8.0f);
    draw_button(gfx, st1, "Perbankan & Emisi Saham", stockSubTab_ == StockSubTab::Banking ? pal::SKY_600 : pal::BG_CARD,
                0, stockSubTab_ == StockSubTab::Banking ? pal::TEXT_WHITE : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold12, 8.0f);
    hits_.add(st0, ACT_STK_SUBTAB, 0);
    hits_.add(st1, ACT_STK_SUBTAB, 1);
    y += 58.0f;

    if (!stockFeedback_.empty()) {
        uint32_t fBg = stockFeedbackErr_ ? 0xCC4C0519u : 0xCC064E3Bu;
        uint32_t fBrd = stockFeedbackErr_ ? pal::ROSE_400 : pal::EMERALD_400;
        gfx.fill_rounded_rect(cx, y, cw, 38.0f, 10.0f, fBg);
        gfx.draw_rounded_rect(cx, y, cw, 38.0f, 10.0f, fBrd, 1.0f);
        gfx.draw_text(stockFeedback_, {cx + 12.0f, y, cw - 24.0f, 38.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Middle);
        y += 48.0f;
    }

    auto playerIt = state_.companies.find(state_.playerCompanyId);
    if (playerIt == state_.companies.end()) return;
    const Company& player = playerIt->second;

    if (stockSubTab_ == StockSubTab::Stocks) {
        float panelH = std::max(280.0f, (area.y + area.h - 14.0f) - y);
        float leftW = std::min(440.0f, cw * 0.42f);
        float rightW = cw - leftW - 14.0f;

        // Left Panel: 10-Company Emiten list
        stockListRect_ = {cx, y, leftW, panelH};
        gfx.fill_rounded_rect(stockListRect_.x, stockListRect_.y, stockListRect_.w, stockListRect_.h, 5.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(stockListRect_.x, stockListRect_.y, stockListRect_.w, stockListRect_.h, 5.0f, pal::BORDER_SUBTLE, 1.0f);
        char listHdr[48];
        std::snprintf(listHdr, sizeof(listHdr), "Bursa Efek (%zu/10 Emiten Aktif)", state_.companyOrder.size());
        gfx.draw_text(listHdr, {cx + 14.0f, y + 12.0f, leftW - 28.0f, 20.0f}, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Bold12);

        caplab::gfx::RectF listViewport{cx + 6.0f, y + 38.0f, leftW - 12.0f, panelH - 46.0f};
        stockListScroll_.viewHeight = listViewport.h;
        gfx.push_clip(listViewport);

        float itemY = listViewport.y - stockListScroll_.offsetY;
        float itemH = 66.0f;
        for (const auto& cid : state_.companyOrder) {
            auto cIt = state_.companies.find(cid);
            if (cIt == state_.companies.end()) continue;
            const Company& comp = cIt->second;
            bool isSel = (comp.id == selectedStockCompanyId_);

            caplab::gfx::RectF row{listViewport.x + 6.0f, itemY, listViewport.w - 14.0f, itemH - 6.0f};
            gfx.fill_rounded_rect(row.x, row.y, row.w, row.h, 11.0f, isSel ? pal::BG_SLATE_800 : pal::BG_HEADER);
            gfx.draw_rounded_rect(row.x, row.y, row.w, row.h, 11.0f, isSel ? pal::SKY_500 : pal::BORDER_SUBTLE, isSel ? 1.3f : 0.8f);

            draw_ceo_emblem(gfx, comp, row.x + 10.0f, row.y + 11.0f, 36.0f);
            char nameLine[96];
            std::snprintf(nameLine, sizeof(nameLine), "%s · %s", comp.ticker.c_str(), comp.name.c_str());
            gfx.draw_text(nameLine, {row.x + 54.0f, row.y + 10.0f, row.w - 148.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11);

            int64_t held = 0;
            auto hIt = player.shareholdings.find(comp.id);
            if (hIt != player.shareholdings.end()) held = hIt->second;
            double stake = caplab::market::get_ownership_percentage(comp, held);
            char secLine[96];
            if (comp.isPlayer) std::snprintf(secLine, sizeof(secLine), "%s · Anda", comp.sectorFocus.c_str());
            else if (stake > 0.0) std::snprintf(secLine, sizeof(secLine), "%s · Milik %.1f%%", comp.sectorFocus.c_str(), stake);
            else std::snprintf(secLine, sizeof(secLine), "%s", comp.sectorFocus.c_str());
            gfx.draw_text(secLine, {row.x + 54.0f, row.y + 30.0f, row.w - 148.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);

            char pStr[24], chgStr[24];
            std::snprintf(pStr, sizeof(pStr), "$%.2f", comp.stockPrice);
            double dChg = (comp.sharePriceHistory.size() >= 2)
                ? (comp.stockPrice - comp.sharePriceHistory[comp.sharePriceHistory.size() - 2])
                : 0.0;
            std::snprintf(chgStr, sizeof(chgStr), "%+.2f", dChg);
            gfx.draw_text(pStr, {row.x + row.w - 94.0f, row.y + 9.0f, 84.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Mono12, caplab::gfx::TextAlign::Right);
            gfx.draw_text(chgStr, {row.x + row.w - 94.0f, row.y + 29.0f, 84.0f, 15.0f},
                          dChg >= 0.0 ? pal::EMERALD_400 : pal::ROSE_400, caplab::gfx::FontStyle::Mono9, caplab::gfx::TextAlign::Right);

            hits_.add(row, ACT_STK_SELECT_COMP, 0, 0, comp.id);
            itemY += itemH;
        }
        stockListScroll_.contentHeight = static_cast<float>(state_.companyOrder.size()) * itemH + 8.0f;
        stockListScroll_.clamp();
        draw_scrollbar(gfx, listViewport, stockListScroll_);
        gfx.pop_clip();

        // Right Panel: Trading & M&A Terminal
        auto tIt = state_.companies.find(selectedStockCompanyId_);
        const Company& target = (tIt != state_.companies.end()) ? tIt->second : player;
        caplab::gfx::RectF detailArea{cx + leftW + 14.0f, y, rightW, panelH};
        gfx.fill_rounded_rect(detailArea.x, detailArea.y, detailArea.w, detailArea.h, 5.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(detailArea.x, detailArea.y, detailArea.w, detailArea.h, 5.0f, pal::BORDER_SUBTLE, 1.0f);

        stockDetailScroll_.viewHeight = detailArea.h;
        gfx.push_clip(detailArea);
        float dy = detailArea.y + 16.0f - stockDetailScroll_.offsetY;
        float dx = detailArea.x + 16.0f;
        float dw = detailArea.w - 32.0f;

        draw_ceo_emblem(gfx, target, dx, dy, 44.0f);
        char dtTitle[96];
        std::snprintf(dtTitle, sizeof(dtTitle), "%s (%s)", target.name.c_str(), target.ticker.c_str());
        gfx.draw_text(dtTitle, {dx + 54.0f, dy + 2.0f, dw - 54.0f, 20.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
        char dtSub[128];
        std::snprintf(dtSub, sizeof(dtSub), "CEO: %s · %s", target.ceoName.c_str(), target.sectorFocus.c_str());
        gfx.draw_text(dtSub, {dx + 54.0f, dy + 24.0f, dw - 54.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11);
        dy += 56.0f;

        int64_t playerHeld = 0;
        auto hIt = player.shareholdings.find(target.id);
        if (hIt != player.shareholdings.end()) playerHeld = hIt->second;
        double ownPct = caplab::market::get_ownership_percentage(target, playerHeld);

        char ownTxt[64];
        std::snprintf(ownTxt, sizeof(ownTxt), "%s lbr (%.1f%%)", caplab::math::format_int_commas(playerHeld).c_str(), ownPct);
        gfx.draw_text("Kepemilikan Anda:", {dx, dy, 160.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11);
        gfx.draw_text(ownTxt, {dx + 160.0f, dy, dw - 160.0f, 16.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono11, caplab::gfx::TextAlign::Right);
        dy += 20.0f;
        draw_progress_bar(gfx, {dx, dy, dw, 8.0f}, static_cast<float>(ownPct / 100.0), pal::BG_SLATE_800, pal::SKY_500, 4.0f);
        dy += 18.0f;

        // Metrics Grid
        gfx.fill_rounded_rect(dx, dy, dw, 50.0f, 12.0f, pal::BG_HEADER);
        float c3 = dw / 3.0f;
        char peBuf[32], bvBuf[32], dvBuf[32];
        std::snprintf(peBuf, sizeof(peBuf), "%.1fx", target.peRatio);
        std::snprintf(bvBuf, sizeof(bvBuf), "$%.2f", static_cast<double>(target.bookValue) / std::max<double>(1.0, static_cast<double>(target.sharesOutstanding)));
        std::snprintf(dvBuf, sizeof(dvBuf), "$%.2f", target.dividendPerShare);

        gfx.draw_text("P/E Ratio", {dx + 12.0f, dy + 8.0f, c3 - 12.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
        gfx.draw_text(peBuf, {dx + 12.0f, dy + 25.0f, c3 - 12.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Mono12);
        gfx.draw_text("Nilai Buku/Lbr", {dx + c3, dy + 8.0f, c3, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
        gfx.draw_text(bvBuf, {dx + c3, dy + 25.0f, c3, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Mono12);
        gfx.draw_text("Dividen/Lbr", {dx + c3 * 2.0f, dy + 8.0f, c3 - 12.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
        gfx.draw_text(dvBuf, {dx + c3 * 2.0f, dy + 25.0f, c3 - 12.0f, 18.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono12);
        dy += 60.0f;

        draw_stock_chart(gfx, {dx, dy, dw, 114.0f}, target.sharePriceHistory);
        dy += 126.0f;

        // Trade Lot Selector
        const int64_t lots[4] = {1000, 5000, 20000, 50000};
        float lotW = (dw - 18.0f) / 4.0f;
        for (int i = 0; i < 4; ++i) {
            caplab::gfx::RectF lb{dx + static_cast<float>(i) * (lotW + 6.0f), dy, lotW, 36.0f};
            bool act = (tradeShares_ == lots[i]);
            char lTxt[16];
            std::snprintf(lTxt, sizeof(lTxt), "%lldK", static_cast<long long>(lots[i] / 1000));
            draw_button(gfx, lb, lTxt, act ? pal::SKY_600 : pal::BG_HEADER,
                        act ? pal::SKY_400 : pal::BORDER_CARD, act ? pal::TEXT_WHITE : pal::TEXT_SLATE_300,
                        caplab::gfx::FontStyle::Mono11, 8.0f, lb.contains(mouseX_, mouseY_));
            hits_.add(lb, ACT_STK_LOT_SHARES, static_cast<int>(lots[i]));
        }
        dy += 44.0f;

        int64_t txVal = caplab::math::round_currency64(static_cast<double>(tradeShares_) * target.stockPrice);
        char valStr[64];
        std::snprintf(valStr, sizeof(valStr), "Nilai Transaksi: $%s", caplab::math::format_int_commas(txVal).c_str());
        gfx.draw_text(valStr, {dx, dy, dw, 18.0f}, pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Mono11, caplab::gfx::TextAlign::Right);
        dy += 24.0f;

        float btnW = (dw - 10.0f) * 0.5f;
        caplab::gfx::RectF buyBtn{dx, dy, btnW, 42.0f};
        caplab::gfx::RectF sellBtn{dx + btnW + 10.0f, dy, btnW, 42.0f};
        draw_button(gfx, buyBtn, "Beli Saham", pal::EMERALD_600, pal::EMERALD_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12, 10.0f, buyBtn.contains(mouseX_, mouseY_));
        hits_.add(buyBtn, ACT_STK_BUY);

        bool canSell = (playerHeld >= tradeShares_);
        draw_button(gfx, sellBtn, "Jual Saham", canSell ? pal::ROSE_600 : pal::BG_SLATE_800,
                    canSell ? pal::ROSE_400 : pal::BORDER_CARD, canSell ? pal::TEXT_WHITE : pal::TEXT_SLATE_500,
                    caplab::gfx::FontStyle::Bold12, 10.0f, canSell && sellBtn.contains(mouseX_, mouseY_));
        if (canSell) hits_.add(sellBtn, ACT_STK_SELL);
        dy += 52.0f;

        if (!target.isPlayer && ownPct >= 50.0) {
            if (!confirmMerger_) {
                caplab::gfx::RectF mBtn{dx, dy, dw, 42.0f};
                draw_button(gfx, mBtn, "Lakukan Merger & Akuisisi Penuh (100%)", pal::AMBER_600, pal::AMBER_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12, 10.0f, mBtn.contains(mouseX_, mouseY_));
                hits_.add(mBtn, ACT_STK_MERGER_CONFIRM);
                dy += 50.0f;
            } else {
                gfx.fill_rounded_rect(dx, dy, dw, 54.0f, 12.0f, 0xCC451A03u);
                gfx.draw_rounded_rect(dx, dy, dw, 54.0f, 12.0f, pal::AMBER_500, 1.0f);
                gfx.draw_text("Beli sisa saham publik (+10% premi) & serap semua aset?",
                              {dx + 12.0f, dy + 8.0f, dw - 210.0f, 38.0f}, pal::AMBER_400, caplab::gfx::FontStyle::Bold10,
                              caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Middle, true, false);
                caplab::gfx::RectF cnl{dx + dw - 190.0f, dy + 10.0f, 76.0f, 34.0f};
                caplab::gfx::RectF go{dx + dw - 106.0f, dy + 10.0f, 94.0f, 34.0f};
                draw_button(gfx, cnl, "Batal", pal::BG_SLATE_800, pal::BORDER_CARD, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Bold10, 8.0f);
                draw_button(gfx, go, "Eksekusi", pal::AMBER_600, pal::AMBER_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold10, 8.0f);
                hits_.add(cnl, ACT_STK_MERGER_CANCEL);
                hits_.add(go, ACT_STK_MERGER_EXEC);
                dy += 62.0f;
            }
        }

        stockDetailScroll_.contentHeight = std::max(detailArea.h, (dy + stockDetailScroll_.offsetY) - detailArea.y + 16.0f);
        stockDetailScroll_.clamp();
        draw_scrollbar(gfx, detailArea, stockDetailScroll_);
        gfx.pop_clip();
    } else {
        // Banking & Equity Capital Raising Tab
        float colW = (cw - 14.0f) * 0.5f;
        float bx0 = cx;
        float bx1 = cx + colW + 14.0f;
        float cardH = 336.0f;

        // Left Card: Bank Credit Facility
        gfx.fill_rounded_rect(bx0, y, colW, cardH, 5.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(bx0, y, colW, cardH, 5.0f, pal::BORDER_SUBTLE, 1.0f);
        gfx.draw_text("Kredit Perbankan Korporasi", {bx0 + 18.0f, y + 16.0f, colW - 36.0f, 20.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
        char bRate[96];
        std::snprintf(bRate, sizeof(bRate), "Acuan Bank Sentral: %.1f%%/thn · Bunga Anda: %.2f%%/bln",
                      state_.macro.centralBankRate, player.monthlyInterestRate * 100.0);
        gfx.draw_text(bRate, {bx0 + 18.0f, y + 38.0f, colW - 36.0f, 16.0f}, pal::AMBER_400, caplab::gfx::FontStyle::Mono10);

        float statW = (colW - 46.0f) * 0.5f;
        gfx.fill_rounded_rect(bx0 + 18.0f, y + 66.0f, statW, 70.0f, 12.0f, pal::BG_HEADER);
        gfx.draw_text("Hutang Berjalan", {bx0 + 28.0f, y + 74.0f, statW - 20.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
        gfx.draw_text("$" + caplab::math::format_int_commas(player.debt), {bx0 + 28.0f, y + 92.0f, statW - 20.0f, 20.0f}, pal::ROSE_400, caplab::gfx::FontStyle::Mono12);
        int64_t mInt = caplab::math::round_currency64(static_cast<double>(player.debt) * player.monthlyInterestRate);
        gfx.draw_text("Bunga $" + caplab::math::format_int_commas(mInt) + "/bln", {bx0 + 28.0f, y + 114.0f, statW - 20.0f, 14.0f}, pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Mono9);

        gfx.fill_rounded_rect(bx0 + 28.0f + statW, y + 66.0f, statW, 70.0f, 12.0f, pal::BG_HEADER);
        gfx.draw_text("Plafon Kredit (65%)", {bx0 + 38.0f + statW, y + 74.0f, statW - 20.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
        int64_t plafon = caplab::math::round_currency64(static_cast<double>(player.bookValue) * 0.65);
        gfx.draw_text("$" + caplab::math::format_int_commas(plafon), {bx0 + 38.0f + statW, y + 92.0f, statW - 20.0f, 20.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono12);
        gfx.draw_text("Berdasarkan Nilai Buku", {bx0 + 38.0f + statW, y + 114.0f, statW - 20.0f, 14.0f}, pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Regular10);

        const int64_t loanOpts[3] = {250000, 500000, 1000000};
        float lw = (colW - 48.0f) / 3.0f;
        for (int i = 0; i < 3; ++i) {
            caplab::gfx::RectF lb{bx0 + 18.0f + static_cast<float>(i) * (lw + 6.0f), y + 160.0f, lw, 38.0f};
            bool act = (loanAmount_ == loanOpts[i]);
            char lTxt[16];
            std::snprintf(lTxt, sizeof(lTxt), "$%lldK", static_cast<long long>(loanOpts[i] / 1000));
            draw_button(gfx, lb, lTxt, act ? 0x55D97706u : pal::BG_HEADER, act ? pal::AMBER_500 : pal::BORDER_CARD,
                        act ? pal::TEXT_WHITE : pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Mono11, 8.0f);
            hits_.add(lb, ACT_STK_LOAN_AMT, static_cast<int>(loanOpts[i]));
        }

        caplab::gfx::RectF borrowBtn{bx0 + 18.0f, y + 216.0f, (colW - 46.0f) * 0.5f, 44.0f};
        caplab::gfx::RectF repayBtn{bx0 + 28.0f + (colW - 46.0f) * 0.5f, y + 216.0f, (colW - 46.0f) * 0.5f, 44.0f};
        draw_button(gfx, borrowBtn, "Cairkan Pinjaman", pal::AMBER_600, pal::AMBER_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, 10.0f, borrowBtn.contains(mouseX_, mouseY_));
        hits_.add(borrowBtn, ACT_STK_BORROW);

        bool canRepay = (player.debt > 0 && player.cash >= loanAmount_);
        draw_button(gfx, repayBtn, "Lunasi Hutang", canRepay ? pal::EMERALD_600 : pal::BG_SLATE_800,
                    canRepay ? pal::EMERALD_400 : pal::BORDER_CARD, canRepay ? pal::TEXT_WHITE : pal::TEXT_SLATE_500,
                    caplab::gfx::FontStyle::Bold11, 10.0f, canRepay && repayBtn.contains(mouseX_, mouseY_));
        if (canRepay) hits_.add(repayBtn, ACT_STK_REPAY);

        // Right Card: Rights Issue & Dividend Policy
        gfx.fill_rounded_rect(bx1, y, colW, cardH, 5.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(bx1, y, colW, cardH, 5.0f, pal::BORDER_SUBTLE, 1.0f);
        gfx.draw_text("Pasar Modal & Kebijakan Dividen", {bx1 + 18.0f, y + 16.0f, colW - 36.0f, 20.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
        gfx.draw_text("Saham Beredar: " + caplab::math::format_int_commas(player.sharesOutstanding) + " lbr",
                      {bx1 + 18.0f, y + 38.0f, colW - 36.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono10);

        const int64_t issOpts[3] = {25000, 50000, 150000};
        for (int i = 0; i < 3; ++i) {
            caplab::gfx::RectF ib{bx1 + 18.0f + static_cast<float>(i) * (lw + 6.0f), y + 72.0f, lw, 38.0f};
            bool act = (issueCount_ == issOpts[i]);
            char iTxt[16];
            std::snprintf(iTxt, sizeof(iTxt), "+%lldK", static_cast<long long>(issOpts[i] / 1000));
            draw_button(gfx, ib, iTxt, act ? 0x550284C7u : pal::BG_HEADER, act ? pal::SKY_500 : pal::BORDER_CARD,
                        act ? pal::TEXT_WHITE : pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Mono11, 8.0f);
            hits_.add(ib, ACT_STK_ISSUE_CNT, static_cast<int>(issOpts[i]));
        }

        int64_t proceeds = caplab::math::round_currency64(static_cast<double>(issueCount_) * player.stockPrice * 0.94);
        gfx.draw_text("Estimasi dana masuk (diskon 6%): +$" + caplab::math::format_int_commas(proceeds),
                      {bx1 + 18.0f, y + 120.0f, colW - 36.0f, 18.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono10);

        caplab::gfx::RectF issExec{bx1 + 18.0f, y + 144.0f, colW - 36.0f, 44.0f};
        draw_button(gfx, issExec, "Terbitkan Saham Baru (Tanpa Bunga)", pal::SKY_600, pal::SKY_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, 10.0f, issExec.contains(mouseX_, mouseY_));
        hits_.add(issExec, ACT_STK_ISSUE_EXEC);

        gfx.draw_line(bx1 + 18.0f, y + 204.0f, bx1 + colW - 18.0f, y + 204.0f, pal::BORDER_SUBTLE, 1.0f);
        char divCur[48];
        std::snprintf(divCur, sizeof(divCur), "Dividen Bulanan per Lembar: $%.2f/lbr", player.dividendPerShare);
        gfx.draw_text(divCur, {bx1 + 18.0f, y + 216.0f, colW - 36.0f, 18.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Bold11);

        const int divCents[4] = {0, 25, 50, 100};
        float dw4 = (colW - 54.0f) * 0.25f;
        for (int i = 0; i < 4; ++i) {
            caplab::gfx::RectF db{bx1 + 18.0f + static_cast<float>(i) * (dw4 + 6.0f), y + 244.0f, dw4, 38.0f};
            bool act = (std::abs(player.dividendPerShare - static_cast<double>(divCents[i]) / 100.0) < 0.01);
            char dTxt[16];
            std::snprintf(dTxt, sizeof(dTxt), "$%.2f", static_cast<double>(divCents[i]) / 100.0);
            draw_button(gfx, db, dTxt, act ? 0x55059669u : pal::BG_HEADER, act ? pal::EMERALD_500 : pal::BORDER_CARD,
                        act ? pal::TEXT_WHITE : pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Mono11, 8.0f);
            hits_.add(db, ACT_STK_DIVIDEND, divCents[i]);
        }
    }
}

void GameApp::render_hq_view(caplab::gfx::D2DRenderer& gfx, const caplab::gfx::RectF& area) {
    gfx.fill_rect(area.x, area.y, area.w, area.h, pal::BG_VOID);

    mainScroll_.viewHeight = area.h;
    gfx.push_clip(area);
    float pad = 20.0f;
    float cw = std::min(1160.0f, area.w - pad * 2.0f);
    float cx = area.x + (area.w - cw) * 0.5f;
    float y = area.y + pad - mainScroll_.offsetY;

    // 5 HQ Sub-Tabs
    const char* hqLabels[5] = {"Profil & Merek", "C-Suite", "Peringkat", "Riset & R&D", "Simpan"};
    gfx.fill_rounded_rect(cx, y, cw, 46.0f, 12.0f, pal::BG_CARD);
    gfx.draw_rounded_rect(cx, y, cw, 46.0f, 12.0f, pal::BORDER_SUBTLE, 1.0f);
    float tw = (cw - 32.0f) / 5.0f;
    for (int i = 0; i < 5; ++i) {
        caplab::gfx::RectF tb{cx + 4.0f + static_cast<float>(i) * (tw + 6.0f), y + 5.0f, tw, 36.0f};
        bool act = (static_cast<int>(hqSubTab_) == i);
        draw_button(gfx, tb, hqLabels[i], act ? pal::SKY_600 : pal::BG_CARD, 0,
                    act ? pal::TEXT_WHITE : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold11, 8.0f);
        hits_.add(tb, ACT_HQ_SUBTAB, i);
    }
    y += 58.0f;

    auto pIt = state_.companies.find(state_.playerCompanyId);
    if (pIt == state_.companies.end()) { gfx.pop_clip(); return; }
    const Company& player = pIt->second;

    if (hqSubTab_ == HQSubTab::Profile) {
        float colW = (cw - 14.0f) * 0.5f;
        float bx0 = cx;
        float bx1 = cx + colW + 14.0f;

        // Left: Executive Dossier
        gfx.fill_rounded_rect(bx0, y, colW, 248.0f, 5.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(bx0, y, colW, 248.0f, 5.0f, pal::BORDER_SUBTLE, 1.0f);
        draw_ceo_emblem(gfx, player, bx0 + 18.0f, y + 18.0f, 52.0f);
        gfx.draw_text(player.name + " (" + player.ticker + ")", {bx0 + 82.0f, y + 18.0f, colW - 100.0f, 22.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
        gfx.draw_text("CEO: " + player.ceoName + " · " + player.sectorFocus, {bx0 + 82.0f, y + 42.0f, colW - 100.0f, 16.0f}, pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Regular11);
        gfx.draw_text("Didirikan: Jan 2026 · " + std::to_string(player.facilitiesCount) + " Fasilitas Aktif",
                      {bx0 + 82.0f, y + 60.0f, colW - 100.0f, 15.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono10);

        float sw = (colW - 46.0f) * 0.5f;
        gfx.fill_rounded_rect(bx0 + 18.0f, y + 92.0f, sw, 64.0f, 12.0f, pal::BG_HEADER);
        gfx.draw_text("Total Aset", {bx0 + 28.0f, y + 100.0f, sw - 20.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
        gfx.draw_text(caplab::math::format_money(static_cast<double>(player.totalAssets)), {bx0 + 28.0f, y + 120.0f, sw - 20.0f, 22.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Mono14);

        gfx.fill_rounded_rect(bx0 + 28.0f + sw, y + 92.0f, sw, 64.0f, 12.0f, pal::BG_HEADER);
        gfx.draw_text("Ekuitas Bersih", {bx0 + 38.0f + sw, y + 100.0f, sw - 20.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
        gfx.draw_text(caplab::math::format_money(static_cast<double>(player.bookValue)), {bx0 + 38.0f + sw, y + 120.0f, sw - 20.0f, 22.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono14);

        gfx.draw_text("Corporate Brand Rating", {bx0 + 18.0f, y + 174.0f, 200.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11);
        gfx.draw_text(std::to_string(player.corporateBrandRating) + " / 100", {bx0 + 210.0f, y + 174.0f, colW - 228.0f, 16.0f}, pal::AMBER_400, caplab::gfx::FontStyle::Mono11, caplab::gfx::TextAlign::Right);
        draw_progress_bar(gfx, {bx0 + 18.0f, y + 198.0f, colW - 36.0f, 9.0f}, static_cast<float>(player.corporateBrandRating) / 100.0f, pal::BG_SLATE_800, pal::AMBER_500, 4.5f);

        // Right: Brand Strategy + Share Structure
        gfx.fill_rounded_rect(bx1, y, colW, 248.0f, 5.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(bx1, y, colW, 248.0f, 5.0f, pal::BORDER_SUBTLE, 1.0f);
        gfx.draw_text("Strategi Merek Korporasi", {bx1 + 18.0f, y + 16.0f, colW - 36.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);

        struct BStrat { BrandStrategy s; const char* t; const char* d; };
        const BStrat strats[3] = {
            {BrandStrategy::Generic, "Merek Unik / Produk Individual", "Setiap cabang membangun brand sendiri dari awal. Hemat biaya."},
            {BrandStrategy::Range, "Range Brand (Lini Kategori)", "Menjaga keseimbangan brand di tiap kategori produk serupa."},
            {BrandStrategy::Corporate, "Corporate Brand (Payung Korporat)", "Seluruh cabang mewarisi 35% Corporate Brand & sinergi Media."},
        };
        float sy = y + 44.0f;
        for (const auto& bs : strats) {
            caplab::gfx::RectF sb{bx1 + 18.0f, sy, colW - 36.0f, 58.0f};
            bool sel = (player.brandStrategy == bs.s);
            gfx.fill_rounded_rect(sb.x, sb.y, sb.w, sb.h, 11.0f, sel ? 0x550284C7u : pal::BG_HEADER);
            gfx.draw_rounded_rect(sb.x, sb.y, sb.w, sb.h, 11.0f, sel ? pal::SKY_500 : pal::BORDER_SUBTLE, 1.0f);
            gfx.draw_text(bs.t, {sb.x + 12.0f, sb.y + 8.0f, sb.w - 24.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11);
            gfx.draw_text(bs.d, {sb.x + 12.0f, sb.y + 28.0f, sb.w - 24.0f, 22.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
            hits_.add(sb, ACT_HQ_BRAND_STRATEGY, static_cast<int>(bs.s));
            sy += 64.0f;
        }
        y += 264.0f;
    } else if (hqSubTab_ == HQSubTab::Executives) {
        const auto& execs = player.executives.empty() ? get_available_executives() : player.executives;
        int64_t payroll = 0;
        for (const auto& ex : execs) if (ex.hired) payroll += ex.monthlySalary;

        gfx.fill_rounded_rect(cx, y, cw, 64.0f, 5.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(cx, y, cw, 64.0f, 5.0f, pal::BORDER_SUBTLE, 1.0f);
        gfx.draw_text("Dewan Eksekutif C-Suite", {cx + 18.0f, y + 12.0f, 360.0f, 20.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
        gfx.draw_text("Rekrut eksekutif untuk mengotomatiskan operasional, mempercepat riset, dan menekan bunga.",
                      {cx + 18.0f, y + 36.0f, cw - 220.0f, 18.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11);
        gfx.draw_text("Total Gaji: $" + caplab::math::format_int_commas(payroll) + "/bln",
                      {cx + cw - 220.0f, y + 22.0f, 202.0f, 20.0f}, pal::AMBER_400, caplab::gfx::FontStyle::Mono12, caplab::gfx::TextAlign::Right);
        y += 76.0f;

        float colW = (cw - 14.0f) * 0.5f;
        float cardH = 152.0f;
        for (size_t i = 0; i < execs.size(); ++i) {
            int col = static_cast<int>(i % 2);
            int row = static_cast<int>(i / 2);
            float exX = cx + static_cast<float>(col) * (colW + 14.0f);
            float exY = y + static_cast<float>(row) * (cardH + 14.0f);
            const auto& ex = execs[i];

            gfx.fill_rounded_rect(exX, exY, colW, cardH, 5.0f, pal::BG_CARD);
            gfx.draw_rounded_rect(exX, exY, colW, cardH, 5.0f, ex.hired ? pal::EMERALD_500 : pal::BORDER_SUBTLE, ex.hired ? 1.4f : 1.0f);

            char roleTxt[48];
            std::snprintf(roleTxt, sizeof(roleTxt), "%s · %s", exec_role_to_str(ex.role), ex.hired ? "Aktif" : "Tersedia");
            gfx.draw_text(roleTxt, {exX + 16.0f, exY + 12.0f, colW - 140.0f, 15.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono10);
            gfx.draw_text(ex.name, {exX + 16.0f, exY + 30.0f, colW - 140.0f, 20.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);

            gfx.draw_text("Skill " + std::to_string(ex.skillRating), {exX + colW - 140.0f, exY + 12.0f, 124.0f, 16.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono11, caplab::gfx::TextAlign::Right);
            gfx.draw_text("$" + caplab::math::format_int_commas(ex.monthlySalary) + "/bln", {exX + colW - 140.0f, exY + 30.0f, 124.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);

            gfx.draw_text(ex.specialty, {exX + 16.0f, exY + 56.0f, colW - 32.0f, 36.0f}, pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Regular11, caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Top, true, false);

            caplab::gfx::RectF btn{exX + 16.0f, exY + cardH - 50.0f, colW - 32.0f, 38.0f};
            std::string btnLbl = ex.hired
                ? "Berhentikan Kontrak"
                : (std::string("Rekrut ") + exec_role_to_str(ex.role) + " (Bonus $" + caplab::math::format_int_commas(ex.monthlySalary) + ")");
            draw_button(gfx, btn, btnLbl, ex.hired ? 0xCC4C0519u : pal::SKY_600,
                        ex.hired ? pal::ROSE_400 : pal::SKY_400,
                        ex.hired ? pal::ROSE_400 : pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, 10.0f, btn.contains(mouseX_, mouseY_));
            hits_.add(btn, ACT_HQ_TOGGLE_EXEC, static_cast<int>(ex.role));
        }
        y += 2.0f * (cardH + 14.0f) + 12.0f;
    } else if (hqSubTab_ == HQSubTab::Ranking) {
        // Subtabs: Peringkat CEO / Pangsa Pasar / Laporan
        gfx.fill_rounded_rect(cx, y, cw, 44.0f, 12.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(cx, y, cw, 44.0f, 12.0f, pal::BORDER_SUBTLE, 1.0f);
        float w3 = (cw - 20.0f) / 3.0f;
        char r0Lbl[40];
        std::snprintf(r0Lbl, sizeof(r0Lbl), "Peringkat CEO (%zu)", state_.companyOrder.size());
        const char* rLbls[3] = {r0Lbl, "Pangsa Pasar", "Laporan Keuangan"};
        for (int i = 0; i < 3; ++i) {
            caplab::gfx::RectF rb{cx + 4.0f + static_cast<float>(i) * (w3 + 6.0f), y + 4.0f, w3, 36.0f};
            bool act = (static_cast<int>(rankSubTab_) == i);
            draw_button(gfx, rb, rLbls[i], act ? pal::SKY_600 : pal::BG_CARD, 0,
                        act ? pal::TEXT_WHITE : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold11, 8.0f);
            hits_.add(rb, ACT_HQ_RANK_SUBTAB, i);
        }
        y += 56.0f;

        std::vector<const Company*> sorted;
        for (const auto& cid : state_.companyOrder) {
            auto it = state_.companies.find(cid);
            if (it != state_.companies.end()) sorted.push_back(&it->second);
        }
        std::sort(sorted.begin(), sorted.end(), [&](const Company* a, const Company* b) {
            if (rankSortBy_ == RankSortBy::MarketCap) return a->marketCap > b->marketCap;
            if (rankSortBy_ == RankSortBy::BookValue) return a->bookValue > b->bookValue;
            return a->lastMonthRevenue > b->lastMonthRevenue;
        });

        if (rankSubTab_ == RankSubTab::Ranking) {
            const char* sortNames[3] = {"Kapitalisasi", "Kekayaan", "Omzet"};
            gfx.draw_text(std::to_string(sorted.size()) + " Konglomerasi Aktif", {cx + 4.0f, y + 6.0f, 240.0f, 20.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold11);
            float sx = cx + cw - 300.0f;
            for (int i = 0; i < 3; ++i) {
                caplab::gfx::RectF sb{sx + static_cast<float>(i) * 100.0f, y, 94.0f, 30.0f};
                bool act = (static_cast<int>(rankSortBy_) == i);
                draw_button(gfx, sb, sortNames[i], act ? pal::SKY_600 : pal::BG_CARD, pal::BORDER_SUBTLE,
                            act ? pal::TEXT_WHITE : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono10, 8.0f);
                hits_.add(sb, ACT_HQ_RANK_SORT, i);
            }
            y += 40.0f;

            float colW = (cw - 12.0f) * 0.5f;
            float cardH = 104.0f;
            for (size_t i = 0; i < sorted.size(); ++i) {
                int col = static_cast<int>(i % 2);
                int row = static_cast<int>(i / 2);
                float rx = cx + static_cast<float>(col) * (colW + 12.0f);
                float ry = y + static_cast<float>(row) * (cardH + 12.0f);
                const Company& c = *sorted[i];

                gfx.fill_rounded_rect(rx, ry, colW, cardH, 14.0f, pal::BG_CARD);
                gfx.draw_rounded_rect(rx, ry, colW, cardH, 14.0f, c.isPlayer ? pal::SKY_500 : pal::BORDER_SUBTLE, c.isPlayer ? 1.4f : 1.0f);

                uint32_t rankBg = (i == 0) ? pal::AMBER_500 : (i == 1 ? 0xFFCBD5E1u : (i == 2 ? 0xFFB45309u : pal::BG_SLATE_800));
                uint32_t rankFg = (i <= 1) ? pal::BG_VOID : pal::TEXT_WHITE;
                gfx.fill_rounded_rect(rx + 12.0f, ry + 14.0f, 30.0f, 28.0f, 7.0f, rankBg);
                gfx.draw_text("#" + std::to_string(i + 1), {rx + 12.0f, ry + 14.0f, 30.0f, 28.0f}, rankFg, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Center, caplab::gfx::TextVAlign::Middle);

                draw_ceo_emblem(gfx, c, rx + 50.0f, ry + 12.0f, 34.0f);
                gfx.draw_text(c.name + " (" + c.ticker + ")", {rx + 92.0f, ry + 12.0f, colW - 210.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11);
                gfx.draw_text(c.ceoName + (c.isPlayer ? " (Anda)" : ""), {rx + 92.0f, ry + 32.0f, colW - 210.0f, 15.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);

                int64_t val = (rankSortBy_ == RankSortBy::MarketCap) ? c.marketCap
                            : (rankSortBy_ == RankSortBy::BookValue ? c.bookValue : c.lastMonthRevenue);
                gfx.draw_text(caplab::math::format_money(static_cast<double>(val)),
                              {rx + colW - 120.0f, ry + 14.0f, 108.0f, 20.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono12, caplab::gfx::TextAlign::Right);

                gfx.draw_line(rx + 12.0f, ry + 58.0f, rx + colW - 12.0f, ry + 58.0f, pal::BORDER_SUBTLE, 1.0f);
                float f3 = (colW - 24.0f) / 3.0f;
                gfx.draw_text("Fasilitas: " + std::to_string(c.facilitiesCount), {rx + 12.0f, ry + 68.0f, f3, 18.0f}, pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Mono10);
                gfx.draw_text("Kas: " + caplab::math::format_money(static_cast<double>(c.cash)), {rx + 12.0f + f3, ry + 68.0f, f3, 18.0f}, pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Mono10);
                gfx.draw_text("Laba: " + caplab::math::format_money(c.lastMonthNetProfit), {rx + 12.0f + f3 * 2.0f, ry + 68.0f, f3, 18.0f},
                              c.lastMonthNetProfit >= 0 ? pal::EMERALD_400 : pal::ROSE_400, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);
            }
            int rows = static_cast<int>((sorted.size() + 1) / 2);
            y += static_cast<float>(rows) * (cardH + 12.0f) + 12.0f;
        } else if (rankSubTab_ == RankSubTab::MarketShare) {
            std::vector<const ProductRecipe*> cdProds;
            for (const auto& p : get_all_products()) {
                if (p.category == ProductCategory::Consumer || p.category == ProductCategory::Digital) {
                    cdProds.push_back(&p);
                }
            }
            float colW = (cw - 12.0f) * 0.5f;
            float cardH = 98.0f;
            for (size_t i = 0; i < cdProds.size(); ++i) {
                int col = static_cast<int>(i % 2);
                int row = static_cast<int>(i / 2);
                float mx = cx + static_cast<float>(col) * (colW + 12.0f);
                float my = y + static_cast<float>(row) * (cardH + 12.0f);
                const ProductRecipe& p = *cdProds[i];
                const ProductMarketStats& st = state_.city.productStats[static_cast<size_t>(p.id)];

                gfx.fill_rounded_rect(mx, my, colW, cardH, 12.0f, pal::BG_CARD);
                gfx.draw_rounded_rect(mx, my, colW, cardH, 12.0f, pal::BORDER_SUBTLE, 1.0f);
                draw_product_icon(gfx, p.id, mx + 12.0f, my + 12.0f, 34.0f);
                gfx.draw_text(p.name, {mx + 54.0f, my + 12.0f, colW - 140.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);
                char pavg[32];
                std::snprintf(pavg, sizeof(pavg), "Harga: $%.2f", st.averageMarketPrice > 0.0 ? st.averageMarketPrice : p.basePrice);
                gfx.draw_text(pavg, {mx + 54.0f, my + 31.0f, colW - 140.0f, 15.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono9);
                gfx.draw_text(std::to_string(st.playerMarketShare) + "%", {mx + colW - 84.0f, my + 14.0f, 70.0f, 20.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono12, caplab::gfx::TextAlign::Right);

                float barW = colW - 24.0f;
                float pShareW = barW * (static_cast<float>(st.playerMarketShare) / 100.0f);
                gfx.fill_rect(mx + 12.0f, my + 58.0f, barW, 8.0f, pal::ROSE_600);
                if (pShareW > 0.0f) gfx.fill_rect(mx + 12.0f, my + 58.0f, pShareW, 8.0f, pal::SKY_500);
                gfx.draw_text("Pemenuhan: " + std::to_string(st.satisfactionRate) + "%  ·  Permintaan: " + caplab::math::format_int_commas(st.monthlyDemand),
                              {mx + 12.0f, my + 72.0f, barW, 16.0f}, pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Mono9);
            }
            int rows = static_cast<int>((cdProds.size() + 1) / 2);
            y += static_cast<float>(rows) * (cardH + 12.0f) + 12.0f;
        } else {
            // Financial Tables: Income Statement + Balance Sheet side-by-side
            float colW = (cw - 14.0f) * 0.5f;
            float rowH = 30.0f;
            float tblH = 54.0f + static_cast<float>(sorted.size()) * rowH + 12.0f;

            gfx.fill_rounded_rect(cx, y, colW, tblH, 5.0f, pal::BG_CARD);
            gfx.draw_rounded_rect(cx, y, colW, tblH, 5.0f, pal::BORDER_SUBTLE, 1.0f);
            gfx.draw_text("LABA RUGI KOMPARATIF (BULANAN)", {cx + 16.0f, y + 14.0f, colW - 32.0f, 18.0f}, pal::SKY_400, caplab::gfx::FontStyle::Bold11);

            gfx.fill_rounded_rect(cx + colW + 14.0f, y, colW, tblH, 5.0f, pal::BG_CARD);
            gfx.draw_rounded_rect(cx + colW + 14.0f, y, colW, tblH, 5.0f, pal::BORDER_SUBTLE, 1.0f);
            gfx.draw_text("NERACA KEUANGAN (ASET & KEWAJIBAN)", {cx + colW + 30.0f, y + 14.0f, colW - 32.0f, 18.0f}, pal::AMBER_400, caplab::gfx::FontStyle::Bold11);

            float ty = y + 44.0f;
            for (const Company* c : sorted) {
                float c4 = (colW - 32.0f) * 0.25f;
                if (c->isPlayer) gfx.fill_rect(cx + 8.0f, ty, colW - 16.0f, rowH - 2.0f, 0x300EA5E9u);
                gfx.draw_text(c->ticker, {cx + 16.0f, ty + 6.0f, c4, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Mono11);
                gfx.draw_text(caplab::math::format_money(c->lastMonthRevenue), {cx + 16.0f + c4, ty + 6.0f, c4, 18.0f}, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);
                gfx.draw_text(caplab::math::format_money(c->lastMonthNetProfit), {cx + 16.0f + c4 * 2.0f, ty + 6.0f, c4, 18.0f}, c->lastMonthNetProfit >= 0 ? pal::EMERALD_400 : pal::ROSE_400, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);
                int margin = c->lastMonthRevenue > 0 ? caplab::math::round_currency((static_cast<double>(c->lastMonthNetProfit) / static_cast<double>(c->lastMonthRevenue)) * 100.0) : 0;
                gfx.draw_text(std::to_string(margin) + "%", {cx + 16.0f + c4 * 3.0f, ty + 6.0f, c4, 18.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);

                float bx = cx + colW + 14.0f;
                if (c->isPlayer) gfx.fill_rect(bx + 8.0f, ty, colW - 16.0f, rowH - 2.0f, 0x300EA5E9u);
                gfx.draw_text(c->ticker, {bx + 16.0f, ty + 6.0f, c4, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Mono11);
                gfx.draw_text(caplab::math::format_money(static_cast<double>(c->totalAssets)), {bx + 16.0f + c4, ty + 6.0f, c4, 18.0f}, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);
                gfx.draw_text(caplab::math::format_money(static_cast<double>(c->debt)), {bx + 16.0f + c4 * 2.0f, ty + 6.0f, c4, 18.0f}, pal::ROSE_400, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);
                gfx.draw_text(caplab::math::format_money(static_cast<double>(c->bookValue)), {bx + 16.0f + c4 * 3.0f, ty + 6.0f, c4, 18.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);
                ty += rowH;
            }
            y += tblH + 14.0f;
        }
    } else if (hqSubTab_ == HQSubTab::Tech) {
        gfx.fill_rounded_rect(cx, y, cw, 58.0f, 5.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(cx, y, cw, 58.0f, 5.0f, pal::BORDER_SUBTLE, 1.0f);
        gfx.draw_text("Paten & Tingkat Teknologi (R&D)", {cx + 18.0f, y + 10.0f, 400.0f, 20.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
        gfx.draw_text(std::string("Riset Aktif: ") + get_product(player.activeResearchProduct).name,
                      {cx + cw - 300.0f, y + 18.0f, 282.0f, 20.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono11, caplab::gfx::TextAlign::Right);
        y += 70.0f;

        const auto& prods = get_all_products();
        float colW = (cw - 12.0f) * 0.5f;
        float cardH = 82.0f;
        for (size_t i = 0; i < prods.size(); ++i) {
            int col = static_cast<int>(i % 2);
            int row = static_cast<int>(i / 2);
            float tx = cx + static_cast<float>(col) * (colW + 12.0f);
            float ty = y + static_cast<float>(row) * (cardH + 10.0f);
            const auto& p = prods[i];
            int tech = player.techLevels[static_cast<size_t>(p.id)];
            bool isFocus = (player.activeResearchProduct == p.id);

            gfx.fill_rounded_rect(tx, ty, colW, cardH, 12.0f, isFocus ? 0x400284C7u : pal::BG_CARD);
            gfx.draw_rounded_rect(tx, ty, colW, cardH, 12.0f, isFocus ? pal::SKY_500 : pal::BORDER_SUBTLE, 1.0f);
            draw_product_icon(gfx, p.id, tx + 12.0f, ty + 12.0f, 34.0f);
            gfx.draw_text(p.name, {tx + 54.0f, ty + 14.0f, colW - 210.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);
            gfx.draw_text(std::to_string(tech) + "/100", {tx + colW - 160.0f, ty + 15.0f, 52.0f, 18.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono11, caplab::gfx::TextAlign::Right);

            caplab::gfx::RectF rb{tx + colW - 102.0f, ty + 10.0f, 90.0f, 30.0f};
            draw_button(gfx, rb, isFocus ? "Fokus Aktif" : "Riset", isFocus ? pal::SKY_600 : pal::BG_SLATE_800,
                        pal::BORDER_CARD, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold10, 8.0f);
            hits_.add(rb, ACT_HQ_SET_RESEARCH, static_cast<int>(p.id));

            draw_progress_bar(gfx, {tx + 12.0f, ty + 60.0f, colW - 24.0f, 7.0f}, static_cast<float>(tech) / 100.0f, pal::BG_SLATE_800, pal::SKY_500, 3.5f);
        }
        int rows = static_cast<int>((prods.size() + 1) / 2);
        y += static_cast<float>(rows) * (cardH + 10.0f) + 12.0f;
    } else {
        // Save System Tab
        float colW = (cw - 14.0f) * 0.5f;
        float bx0 = cx;
        float bx1 = cx + colW + 14.0f;

        gfx.fill_rounded_rect(bx0, y, colW, 250.0f, 5.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(bx0, y, colW, 250.0f, 5.0f, pal::BORDER_SUBTLE, 1.0f);
        gfx.draw_text("Penyimpanan Progres Lokal (AppData)", {bx0 + 18.0f, y + 16.0f, colW - 36.0f, 20.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
        gfx.draw_text("Setiap pergantian bulan tersimpan otomatis ke %LOCALAPPDATA%\\CapLab13Native\\autosave.json.",
                      {bx0 + 18.0f, y + 44.0f, colW - 36.0f, 38.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11, caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Top, true, false);

        float bw = (colW - 46.0f) * 0.5f;
        caplab::gfx::RectF sBtn{bx0 + 18.0f, y + 98.0f, bw, 44.0f};
        caplab::gfx::RectF lBtn{bx0 + 28.0f + bw, y + 98.0f, bw, 44.0f};
        draw_button(gfx, sBtn, "Simpan Sekarang", pal::SKY_600, pal::SKY_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, 10.0f, sBtn.contains(mouseX_, mouseY_));
        draw_button(gfx, lBtn, "Muat Terakhir", pal::BG_SLATE_800, pal::BORDER_CARD, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Bold11, 10.0f, lBtn.contains(mouseX_, mouseY_));
        hits_.add(sBtn, ACT_HQ_SAVE_LOCAL);
        hits_.add(lBtn, ACT_HQ_LOAD_LOCAL);

        if (!confirmReset_) {
            caplab::gfx::RectF rBtn{bx0 + 18.0f, y + 168.0f, colW - 36.0f, 44.0f};
            draw_button(gfx, rBtn, "Mulai Konglomerasi Baru (Reset Total)", 0xCC4C0519u, pal::ROSE_400, pal::ROSE_400, caplab::gfx::FontStyle::Bold11, 10.0f, rBtn.contains(mouseX_, mouseY_));
            hits_.add(rBtn, ACT_HQ_RESET_CONFIRM);
        } else {
            gfx.fill_rounded_rect(bx0 + 18.0f, y + 164.0f, colW - 36.0f, 52.0f, 12.0f, 0xCC4C0519u);
            gfx.draw_text("Hapus progres & mulai ulang?", {bx0 + 28.0f, y + 178.0f, 180.0f, 24.0f}, pal::ROSE_400, caplab::gfx::FontStyle::Bold11);
            caplab::gfx::RectF cnl{bx0 + colW - 190.0f, y + 172.0f, 74.0f, 36.0f};
            caplab::gfx::RectF go{bx0 + colW - 108.0f, y + 172.0f, 80.0f, 36.0f};
            draw_button(gfx, cnl, "Batal", pal::BG_SLATE_800, pal::BORDER_CARD, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Bold10, 8.0f);
            draw_button(gfx, go, "Ya, Reset", pal::ROSE_600, pal::ROSE_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold10, 8.0f);
            hits_.add(cnl, ACT_HQ_RESET_CANCEL);
            hits_.add(go, ACT_HQ_RESET_EXEC);
        }

        // Right Card: Export / Import JSON File & Clipboard (100% compatible with browser saves)
        gfx.fill_rounded_rect(bx1, y, colW, 250.0f, 5.0f, pal::BG_CARD);
        gfx.draw_rounded_rect(bx1, y, colW, 250.0f, 5.0f, pal::BORDER_SUBTLE, 1.0f);
        gfx.draw_text("Ekspor & Impor Berkas JSON", {bx1 + 18.0f, y + 16.0f, colW - 36.0f, 20.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
        gfx.draw_text("Gunakan dialog berkas Windows 11 untuk menukar save JSON antara versi Browser dan Native .EXE.",
                      {bx1 + 18.0f, y + 44.0f, colW - 36.0f, 38.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11, caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Top, true, false);

        caplab::gfx::RectF expBtn{bx1 + 18.0f, y + 98.0f, colW - 36.0f, 44.0f};
        draw_button(gfx, expBtn, "Ekspor Cadangan (.JSON) ...", pal::AMBER_600, pal::AMBER_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, 10.0f, expBtn.contains(mouseX_, mouseY_));
        hits_.add(expBtn, ACT_HQ_EXPORT_FILE);

        caplab::gfx::RectF impFileBtn{bx1 + 18.0f, y + 158.0f, bw, 44.0f};
        caplab::gfx::RectF impClipBtn{bx1 + 28.0f + bw, y + 158.0f, bw, 44.0f};
        draw_button(gfx, impFileBtn, "Buka File (.JSON) ...", pal::EMERALD_600, pal::EMERALD_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, 10.0f, impFileBtn.contains(mouseX_, mouseY_));
        draw_button(gfx, impClipBtn, "Tempel Clipboard", pal::BG_SLATE_800, pal::BORDER_CARD, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Bold11, 10.0f, impClipBtn.contains(mouseX_, mouseY_));
        hits_.add(impFileBtn, ACT_HQ_IMPORT_FILE);
        hits_.add(impClipBtn, ACT_HQ_IMPORT_CLIPBOARD);
        y += 266.0f;
    }

    mainScroll_.contentHeight = std::max(area.h, (y + mainScroll_.offsetY) - area.y + 20.0f);
    mainScroll_.clamp();
    draw_scrollbar(gfx, area, mainScroll_);
    gfx.pop_clip();
}

void GameApp::render_news_modal(caplab::gfx::D2DRenderer& gfx, float w, float h) {
    gfx.fill_rect(0.0f, 0.0f, w, h, 0xB8000000u);
    hits_.add({0.0f, 0.0f, w, h}, ACT_CLOSE_NEWS);

    float mw = std::min(520.0f, w - 40.0f);
    float mh = std::min(620.0f, h - 60.0f);
    float mx = (w - mw) * 0.5f;
    float my = (h - mh) * 0.5f;
    caplab::gfx::RectF dlg{mx, my, mw, mh};
    hits_.add(dlg, ACT_NONE);

    gfx.fill_rounded_rect(mx, my, mw, mh, 6.0f, pal::BG_ELEVATED);
    gfx.draw_rounded_rect(mx, my, mw, mh, 6.0f, pal::BORDER_CARD, 1.2f);

    gfx.draw_text("Warta Ekonomi & Pasar Global", {mx + 20.0f, my + 16.0f, mw - 80.0f, 22.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
    caplab::gfx::RectF xBtn{mx + mw - 48.0f, my + 12.0f, 34.0f, 30.0f};
    draw_button(gfx, xBtn, "X", pal::BG_SLATE_800, pal::BORDER_CARD, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Bold11, 8.0f);
    hits_.add(xBtn, ACT_CLOSE_NEWS);
    gfx.draw_line(mx, my + 52.0f, mx + mw, my + 52.0f, pal::BORDER_SUBTLE, 1.0f);

    caplab::gfx::RectF body{mx + 12.0f, my + 58.0f, mw - 24.0f, mh - 126.0f};
    newsScroll_.viewHeight = body.h;
    gfx.push_clip(body);
    float ny = body.y + 6.0f - newsScroll_.offsetY;
    for (const auto& item : state_.newsFeed) {
        uint32_t catCol = (item.category == NewsCategory::Competitor) ? pal::ROSE_400
                        : (item.category == NewsCategory::Finance ? pal::AMBER_400 : pal::SKY_400);
        gfx.draw_text(news_category_to_str(item.category), {body.x + 8.0f, ny, 140.0f, 15.0f}, catCol, caplab::gfx::FontStyle::Bold9);
        gfx.draw_text("Bulan #" + std::to_string(item.month), {body.x + body.w - 110.0f, ny, 100.0f, 15.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono9, caplab::gfx::TextAlign::Right);
        gfx.draw_text(item.title, {body.x + 8.0f, ny + 18.0f, body.w - 20.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);
        gfx.draw_text(item.detail, {body.x + 8.0f, ny + 38.0f, body.w - 20.0f, 38.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11, caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Top, true, false);
        gfx.draw_line(body.x + 8.0f, ny + 82.0f, body.x + body.w - 14.0f, ny + 82.0f, pal::BORDER_SUBTLE, 1.0f);
        ny += 90.0f;
    }
    newsScroll_.contentHeight = std::max(body.h, (ny + newsScroll_.offsetY) - body.y + 8.0f);
    newsScroll_.clamp();
    draw_scrollbar(gfx, body, newsScroll_);
    gfx.pop_clip();

    caplab::gfx::RectF clsBtn{mx + 16.0f, my + mh - 54.0f, mw - 32.0f, 40.0f};
    draw_button(gfx, clsBtn, "Tutup Warta", pal::SKY_600, pal::SKY_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12, 10.0f);
    hits_.add(clsBtn, ACT_CLOSE_NEWS);
}

void GameApp::render_build_modal(caplab::gfx::D2DRenderer& gfx, float w, float h) {
    gfx.fill_rect(0.0f, 0.0f, w, h, 0xC0000000u);
    hits_.add({0.0f, 0.0f, w, h}, ACT_BUILD_BACKDROP);

    float mw = std::min(720.0f, w - 40.0f);
    float mh = std::min(700.0f, h - 50.0f);
    float mx = (w - mw) * 0.5f;
    float my = (h - mh) * 0.5f;
    caplab::gfx::RectF dlg{mx, my, mw, mh};
    hits_.add(dlg, ACT_NONE);

    gfx.fill_rounded_rect(mx, my, mw, mh, 6.0f, pal::BG_ELEVATED);
    gfx.draw_rounded_rect(mx, my, mw, mh, 6.0f, pal::BORDER_CARD, 1.2f);

    auto pIt = state_.companies.find(state_.playerCompanyId);
    int64_t cash = (pIt != state_.companies.end()) ? pIt->second.cash : 0;

    gfx.draw_text("Konstruksi Fasilitas Bisnis", {mx + 20.0f, my + 14.0f, mw - 90.0f, 20.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
    gfx.draw_text("Kas Tersedia: $" + caplab::math::format_int_commas(cash), {mx + 20.0f, my + 36.0f, mw - 90.0f, 16.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono11);

    caplab::gfx::RectF xBtn{mx + mw - 48.0f, my + 14.0f, 34.0f, 32.0f};
    draw_button(gfx, xBtn, "X", pal::BG_SLATE_800, pal::BORDER_CARD, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Bold11, 8.0f);
    hits_.add(xBtn, ACT_BUILD_CLOSE);

    // 6 Category Tabs
    struct BTab { FacilityCategory cat; const char* lbl; };
    const BTab btabs[6] = {
        {FacilityCategory::Store, "Ritel"},
        {FacilityCategory::RealEstate, "Properti"},
        {FacilityCategory::Factory, "Pabrik"},
        {FacilityCategory::Raw, "Hulu"},
        {FacilityCategory::Digital, "Digital"},
        {FacilityCategory::Corporate, "Riset/HQ"},
    };
    float ty = my + 64.0f;
    float bw = (mw - 50.0f) / 6.0f;
    for (int i = 0; i < 6; ++i) {
        caplab::gfx::RectF tb{mx + 14.0f + static_cast<float>(i) * (bw + 4.0f), ty, bw, 38.0f};
        bool act = (buildCat_ == btabs[i].cat);
        draw_button(gfx, tb, btabs[i].lbl, act ? pal::SKY_600 : pal::BG_CARD, pal::BORDER_SUBTLE,
                    act ? pal::TEXT_WHITE : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold11, 8.0f);
        hits_.add(tb, ACT_BUILD_CAT, static_cast<int>(btabs[i].cat));
    }

    caplab::gfx::RectF body{mx + 14.0f, ty + 48.0f, mw - 28.0f, mh - (ty + 48.0f - my) - 82.0f};
    buildScroll_.viewHeight = body.h;
    gfx.push_clip(body);

    float by = body.y + 4.0f - buildScroll_.offsetY;
    for (const auto& sp : get_all_facility_specs()) {
        if (sp.category != buildCat_ || !sp.buildable) continue;
        bool isSel = (buildChosenType_ == sp.type);
        bool aff = (cash >= sp.constructionCost);

        size_t prodRows = (isSel && !sp.allowedProducts.empty()) ? ((sp.allowedProducts.size() + 2) / 3) : 0;
        float extraH = prodRows > 0 ? (30.0f + static_cast<float>(prodRows) * 46.0f) : 0.0f;
        float cardH = 104.0f + extraH;

        caplab::gfx::RectF card{body.x + 2.0f, by, body.w - 12.0f, cardH};
        gfx.fill_rounded_rect(card.x, card.y, card.w, card.h, 14.0f, isSel ? pal::BG_SLATE_800 : pal::BG_CARD);
        gfx.draw_rounded_rect(card.x, card.y, card.w, card.h, 14.0f, isSel ? pal::SKY_500 : pal::BORDER_SUBTLE, isSel ? 1.5f : 1.0f);

        caplab::gfx::RectF headerBtn{card.x, card.y, card.w, 100.0f};
        draw_facility_icon(gfx, sp.type, card.x + 14.0f, card.y + 14.0f, 44.0f);
        gfx.draw_text(sp.name, {card.x + 68.0f, card.y + 14.0f, card.w - 86.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);
        gfx.draw_text(sp.description, {card.x + 68.0f, card.y + 34.0f, card.w - 86.0f, 32.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10, caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Top, true, false);
        gfx.draw_text("Investasi: $" + caplab::math::format_int_commas(sp.constructionCost), {card.x + 14.0f, card.y + 74.0f, 240.0f, 18.0f}, aff ? pal::EMERALD_400 : pal::ROSE_400, caplab::gfx::FontStyle::Mono11);
        gfx.draw_text("Biaya Tetap: $" + caplab::math::format_int_commas(sp.monthlyMaintenance) + "/bln", {card.x + 240.0f, card.y + 74.0f, card.w - 254.0f, 18.0f}, pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);
        hits_.add(headerBtn, ACT_BUILD_SELECT_TYPE, static_cast<int>(sp.type));

        if (isSel && !sp.allowedProducts.empty()) {
            gfx.draw_line(card.x + 14.0f, card.y + 100.0f, card.x + card.w - 14.0f, card.y + 100.0f, pal::BORDER_SUBTLE, 1.0f);
            gfx.draw_text("Pilih Fokus Produk / Riset Utama:", {card.x + 14.0f, card.y + 106.0f, card.w - 28.0f, 18.0f}, pal::SKY_400, caplab::gfx::FontStyle::Bold11);
            float pw = (card.w - 44.0f) / 3.0f;
            for (size_t k = 0; k < sp.allowedProducts.size(); ++k) {
                ProductId pid = sp.allowedProducts[k];
                const auto& prod = get_product(pid);
                int pc = static_cast<int>(k % 3);
                int pr = static_cast<int>(k / 3);
                caplab::gfx::RectF pb{card.x + 14.0f + static_cast<float>(pc) * (pw + 8.0f), card.y + 128.0f + static_cast<float>(pr) * 46.0f, pw, 40.0f};
                bool pSel = (buildChosenProduct_ == pid);
                gfx.fill_rounded_rect(pb.x, pb.y, pb.w, pb.h, 10.0f, pSel ? 0x440EA5E9u : pal::BG_ELEVATED);
                gfx.draw_rounded_rect(pb.x, pb.y, pb.w, pb.h, 10.0f, pSel ? pal::SKY_400 : pal::BORDER_CARD, 1.0f);
                draw_product_icon(gfx, pid, pb.x + 6.0f, pb.y + 6.0f, 28.0f);
                gfx.draw_text(prod.name, {pb.x + 40.0f, pb.y + 5.0f, pb.w - 46.0f, 16.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold10);
                char bp[24];
                std::snprintf(bp, sizeof(bp), "$%.0f", prod.basePrice);
                gfx.draw_text(bp, {pb.x + 40.0f, pb.y + 21.0f, pb.w - 46.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono9);
                hits_.add(pb, ACT_BUILD_SELECT_PROD, static_cast<int>(pid));
            }
        }
        by += cardH + 10.0f;
    }

    buildScroll_.contentHeight = std::max(body.h, (by + buildScroll_.offsetY) - body.y + 8.0f);
    buildScroll_.clamp();
    draw_scrollbar(gfx, body, buildScroll_);
    gfx.pop_clip();

    // Footer CTA
    const auto& chosenSpec = get_facility_spec(buildChosenType_);
    bool canAff = (cash >= chosenSpec.constructionCost);
    std::string cta = canAff
        ? std::string("Bangun ") + chosenSpec.name + " ($" + caplab::math::format_int_commas(chosenSpec.constructionCost) + ")"
        : "Dana Kas Tidak Mencukupi";

    caplab::gfx::RectF goBtn{mx + 16.0f, my + mh - 56.0f, mw - 32.0f, 44.0f};
    draw_button(gfx, goBtn, cta, canAff ? pal::SKY_600 : pal::BG_SLATE_800,
                canAff ? pal::SKY_400 : pal::BORDER_CARD, canAff ? pal::TEXT_WHITE : pal::TEXT_SLATE_500,
                caplab::gfx::FontStyle::Bold12, 10.0f, canAff && goBtn.contains(mouseX_, mouseY_));
    if (canAff) hits_.add(goBtn, ACT_BUILD_CONFIRM);
}

void GameApp::render_facility_drawer_modal(caplab::gfx::D2DRenderer& gfx, float w, float h) {
    auto fIt = state_.facilities.find(inspectingFacilityId_);
    if (fIt == state_.facilities.end()) {
        inspectingFacilityId_.clear();
        return;
    }
    const Facility& fac = fIt->second;
    auto cIt = state_.companies.find(fac.companyId);
    const Company* comp = (cIt != state_.companies.end()) ? &cIt->second : nullptr;
    auto pIt = state_.companies.find(state_.playerCompanyId);
    int64_t playerCash = (pIt != state_.companies.end()) ? pIt->second.cash : 0;
    bool isOwner = (fac.companyId == state_.playerCompanyId);
    bool isRE = is_real_estate_facility(fac.type);
    bool isGovt = (fac.companyId == GOVT_OWNER_ID || fac.type == FacilityType::CivicHousing);

    gfx.fill_rect(0.0f, 0.0f, w, h, 0xB8000000u);
    hits_.add({0.0f, 0.0f, w, h}, ACT_DRAWER_BACKDROP);

    float mw = std::min(620.0f, w - 40.0f);
    float mh = std::min(700.0f, h - 50.0f);
    float mx = (w - mw) * 0.5f;
    float my = (h - mh) * 0.5f;
    caplab::gfx::RectF dlg{mx, my, mw, mh};
    hits_.add(dlg, ACT_NONE);

    gfx.fill_rounded_rect(mx, my, mw, mh, 6.0f, pal::BG_CARD);
    gfx.draw_rounded_rect(mx, my, mw, mh, 6.0f, pal::BORDER_CARD, 1.2f);

    draw_facility_icon(gfx, fac.type, mx + 16.0f, my + 14.0f, 40.0f);
    gfx.draw_text(fac.name + " · Lv." + std::to_string(fac.level), {mx + 66.0f, my + 14.0f, mw - 120.0f, 20.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold14);
    std::string subHdr = isGovt ? "Pemkot Metropolis Raya (PEMKOT)"
                                : ((comp ? comp->name : "Korporasi") + " (" + (comp ? comp->ticker : "CORP") + ")");
    subHdr += " · (" + std::to_string(fac.tileX) + ", " + std::to_string(fac.tileY) + ")";
    gfx.draw_text(subHdr, {mx + 66.0f, my + 35.0f, mw - 120.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11);

    caplab::gfx::RectF xBtn{mx + mw - 48.0f, my + 14.0f, 34.0f, 34.0f};
    draw_button(gfx, xBtn, "X", pal::BG_SLATE_800, pal::BORDER_CARD, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Bold11, 8.0f);
    hits_.add(xBtn, ACT_DRAWER_CLOSE);

    // Sub-tabs
    float ty = my + 64.0f;
    gfx.draw_line(mx, ty, mx + mw, ty, pal::BORDER_SUBTLE, 1.0f);
    int tabCount = isOwner ? 3 : 2;
    float tabW = mw / static_cast<float>(tabCount);
    char uTabLbl[32];
    std::snprintf(uTabLbl, sizeof(uTabLbl), "Matriks 3x3 (%zu/9)", fac.units.size());
    const char* tNames[3] = {"Ikhtisar", uTabLbl, "Harga & Iklan"};
    for (int i = 0; i < tabCount; ++i) {
        caplab::gfx::RectF tb{mx + static_cast<float>(i) * tabW, ty, tabW, 40.0f};
        bool act = (static_cast<int>(drawerTab_) == i);
        gfx.draw_text(tNames[i], tb, act ? pal::SKY_400 : pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold12, caplab::gfx::TextAlign::Center, caplab::gfx::TextVAlign::Middle);
        if (act) gfx.fill_rect(tb.x + 12.0f, ty + 38.0f, tb.w - 24.0f, 2.0f, pal::SKY_500);
        hits_.add(tb, ACT_DRAWER_TAB, i);
    }
    gfx.draw_line(mx, ty + 40.0f, mx + mw, ty + 40.0f, pal::BORDER_SUBTLE, 1.0f);

    float footerH = isOwner ? 64.0f : 14.0f;
    caplab::gfx::RectF body{mx + 16.0f, ty + 46.0f, mw - 32.0f, mh - (ty + 46.0f - my) - footerH};
    drawerScroll_.viewHeight = body.h;
    gfx.push_clip(body);

    float by = body.y + 8.0f - drawerScroll_.offsetY;
    float bw = body.w - 10.0f;

    const MapParcel* tileParcel = caplab::spatial::get_parcel_at(state_.mapParcels, fac.tileX, fac.tileY);
    int tileTraffic = tileParcel ? tileParcel->trafficIndex : 20;

    std::optional<ProductId> primaryProdId;
    for (const auto& u : fac.units) {
        if (u.hasTargetProduct) { primaryProdId = u.targetProductId; break; }
    }

    if (drawerTab_ == FacilityDrawerTab::Overview) {
        float hw = (bw - 10.0f) * 0.5f;
        gfx.fill_rounded_rect(body.x, by, hw, 76.0f, 12.0f, pal::BG_SLATE_800);
        gfx.draw_text("PENDAPATAN BULANAN", {body.x + 12.0f, by + 10.0f, hw - 24.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold9);
        gfx.draw_text(caplab::math::format_signed_currency(fac.monthlyRevenue), {body.x + 12.0f, by + 28.0f, hw - 24.0f, 22.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono14);
        gfx.draw_text((isRE ? "Terhuni: " : "Terjual: ") + caplab::math::format_int_commas(fac.lastMonthUnitsSold) + " unit",
                      {body.x + 12.0f, by + 53.0f, hw - 24.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono9);

        gfx.fill_rounded_rect(body.x + hw + 10.0f, by, hw, 76.0f, 12.0f, pal::BG_SLATE_800);
        gfx.draw_text(isGovt ? "STATUS PUBLIK" : "LABA BERSIH", {body.x + hw + 22.0f, by + 10.0f, hw - 24.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold9);
        gfx.draw_text(isGovt ? "Fasilitas Kota" : caplab::math::format_signed_currency(fac.monthlyProfit),
                      {body.x + hw + 22.0f, by + 28.0f, hw - 24.0f, 22.0f}, isGovt ? pal::TEAL_400 : (fac.monthlyProfit >= 0 ? pal::EMERALD_400 : pal::ROSE_400), caplab::gfx::FontStyle::Mono14);
        gfx.draw_text(isGovt ? "Subsidi Non-Bursa" : ("HPP: " + caplab::math::format_signed_currency(fac.monthlyCostOfGoods)),
                      {body.x + hw + 22.0f, by + 53.0f, hw - 24.0f, 14.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono9);
        by += 88.0f;

        gfx.fill_rounded_rect(body.x, by, bw, 174.0f, 12.0f, pal::BG_HEADER);
        gfx.draw_rounded_rect(body.x, by, bw, 174.0f, 12.0f, pal::BORDER_CARD, 1.0f);
        gfx.draw_text(isRE ? "Kategori Properti:" : "Komoditas Fokus:", {body.x + 14.0f, by + 12.0f, 180.0f, 18.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11);
        gfx.draw_text(primaryProdId ? get_product(*primaryProdId).name : get_facility_spec(fac.type).name,
                      {body.x + 190.0f, by + 12.0f, bw - 204.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, caplab::gfx::TextAlign::Right);

        char trafBuf[64];
        std::snprintf(trafBuf, sizeof(trafBuf), "%d/100 (%.0f%% trafik)", tileTraffic, caplab::spatial::get_traffic_demand_multiplier(tileTraffic) * 100.0);
        gfx.draw_text("Indeks Keramaian Lokasi:", {body.x + 14.0f, by + 36.0f, 180.0f, 18.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11);
        gfx.draw_text(trafBuf, {body.x + 190.0f, by + 36.0f, bw - 204.0f, 18.0f}, pal::AMBER_400, caplab::gfx::FontStyle::Mono11, caplab::gfx::TextAlign::Right);

        gfx.draw_text("Sumber Rantai Pasok:", {body.x + 14.0f, by + 60.0f, 180.0f, 18.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11);
        gfx.draw_text(fac.supplySourceLabel.empty() ? "Pelabuhan Impor" : fac.supplySourceLabel,
                      {body.x + 190.0f, by + 60.0f, bw - 204.0f, 18.0f}, pal::SKY_400, caplab::gfx::FontStyle::Bold11, caplab::gfx::TextAlign::Right);

        gfx.draw_text("Rating Kualitas: " + std::to_string(fac.qualityRating) + "/100", {body.x + 14.0f, by + 88.0f, bw - 28.0f, 16.0f}, pal::SKY_400, caplab::gfx::FontStyle::Mono10);
        draw_progress_bar(gfx, {body.x + 14.0f, by + 106.0f, bw - 28.0f, 7.0f}, static_cast<float>(fac.qualityRating) / 100.0f, pal::BG_SLATE_800, pal::SKY_500);

        gfx.draw_text("Rating Merek: " + std::to_string(fac.brandRating) + "/100", {body.x + 14.0f, by + 122.0f, bw - 28.0f, 16.0f}, pal::AMBER_400, caplab::gfx::FontStyle::Mono10);
        draw_progress_bar(gfx, {body.x + 14.0f, by + 140.0f, bw - 28.0f, 7.0f}, static_cast<float>(fac.brandRating) / 100.0f, pal::BG_SLATE_800, pal::AMBER_500);
        by += 186.0f;

        if (fac.inventoryCapacity > 0) {
            gfx.fill_rounded_rect(body.x, by, bw, 56.0f, 12.0f, pal::BG_HEADER);
            gfx.draw_text("Stok Gudang Fasilitas", {body.x + 14.0f, by + 10.0f, 180.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11);
            gfx.draw_text(caplab::math::format_int_commas(fac.inventoryLevel) + " / " + caplab::math::format_int_commas(fac.inventoryCapacity),
                          {body.x + 190.0f, by + 10.0f, bw - 204.0f, 16.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);
            draw_progress_bar(gfx, {body.x + 14.0f, by + 34.0f, bw - 28.0f, 7.0f},
                              static_cast<float>(fac.inventoryLevel) / static_cast<float>(std::max(1, fac.inventoryCapacity)),
                              pal::BG_SLATE_800, pal::EMERALD_500);
            by += 68.0f;
        }
    } else if (drawerTab_ == FacilityDrawerTab::Units) {
        gfx.draw_text("Ketuk slot 3x3 untuk memasang unit, upgrade level, atau menautkan pemasok.",
                      {body.x, by, bw, 18.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular11);
        by += 26.0f;

        float sw = (bw - 16.0f) / 3.0f;
        float sh = 68.0f;
        for (int s = 0; s < 9; ++s) {
            int col = s % 3;
            int row = s / 3;
            caplab::gfx::RectF sb{body.x + static_cast<float>(col) * (sw + 8.0f), by + static_cast<float>(row) * (sh + 8.0f), sw, sh};
            const InternalUnit* u = nullptr;
            for (const auto& candidate : fac.units) {
                if (candidate.slotIndex == s) { u = &candidate; break; }
            }
            bool sel = (drawerSelectedSlot_ && *drawerSelectedSlot_ == s);
            if (u) {
                gfx.fill_rounded_rect(sb.x, sb.y, sb.w, sb.h, 11.0f, sel ? 0x500284C7u : pal::BG_SLATE_800);
                gfx.draw_rounded_rect(sb.x, sb.y, sb.w, sb.h, 11.0f, sel ? pal::SKY_400 : pal::BORDER_CARD, sel ? 1.5f : 1.0f);
                gfx.draw_text(unit_short_label(u->type), {sb.x + 10.0f, sb.y + 10.0f, sb.w - 48.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11);
                gfx.draw_text("Lv." + std::to_string(u->level), {sb.x + sb.w - 44.0f, sb.y + 10.0f, 34.0f, 18.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono10, caplab::gfx::TextAlign::Right);
                gfx.draw_text("Cap " + caplab::math::format_int_commas(u->capacity), {sb.x + 10.0f, sb.y + 38.0f, sb.w - 20.0f, 16.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono9);
                hits_.add(sb, ACT_DRAWER_SLOT, s);
            } else {
                gfx.fill_rounded_rect(sb.x, sb.y, sb.w, sb.h, 11.0f, sel ? 0x3010B981u : pal::BG_HEADER);
                gfx.draw_rounded_rect(sb.x, sb.y, sb.w, sb.h, 11.0f, sel ? pal::EMERALD_400 : pal::BORDER_SUBTLE, 1.0f);
                gfx.draw_text("+ Slot " + std::to_string(s + 1), sb, isOwner ? pal::TEXT_SLATE_300 : pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Bold10, caplab::gfx::TextAlign::Center, caplab::gfx::TextVAlign::Middle);
                if (isOwner) hits_.add(sb, ACT_DRAWER_SLOT, s);
            }
        }
        by += 3.0f * (sh + 8.0f) + 10.0f;

        const InternalUnit* inspectedUnit = nullptr;
        if (drawerSelectedSlot_) {
            for (const auto& candidate : fac.units) {
                if (candidate.slotIndex == *drawerSelectedSlot_) { inspectedUnit = &candidate; break; }
            }
        } else if (!fac.units.empty()) {
            inspectedUnit = &fac.units[0];
        }

        if (drawerSelectedSlot_ && !inspectedUnit && isOwner) {
            auto allowed = allowed_unit_types_for(fac.type);
            float insH = 44.0f + static_cast<float>((allowed.size() + 1) / 2) * 48.0f;
            gfx.fill_rounded_rect(body.x, by, bw, insH, 12.0f, pal::BG_SLATE_800);
            gfx.draw_rounded_rect(body.x, by, bw, insH, 12.0f, pal::EMERALD_500, 1.0f);
            gfx.draw_text("Pasang Unit Baru di Slot #" + std::to_string(*drawerSelectedSlot_ + 1),
                          {body.x + 12.0f, by + 10.0f, bw - 24.0f, 18.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Bold11);
            float uw = (bw - 32.0f) * 0.5f;
            for (size_t k = 0; k < allowed.size(); ++k) {
                int64_t icost = caplab::get_unit_install_cost(allowed[k].first);
                bool aff = (playerCash >= icost);
                caplab::gfx::RectF ib{body.x + 12.0f + static_cast<float>(k % 2) * (uw + 8.0f), by + 36.0f + static_cast<float>(k / 2) * 48.0f, uw, 40.0f};
                std::string lbl = std::string(allowed[k].second) + " (" + caplab::math::format_cost_short(static_cast<double>(icost)) + ")";
                draw_button(gfx, ib, lbl, aff ? pal::BG_HEADER : pal::BG_VOID, aff ? pal::BORDER_CARD : pal::BORDER_SUBTLE,
                            aff ? pal::TEXT_SLATE_200 : pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Bold10, 9.0f);
                if (aff) hits_.add(ib, ACT_DRAWER_INSTALL_UNIT, *drawerSelectedSlot_, static_cast<int>(allowed[k].first));
            }
            by += insH + 12.0f;
        } else if (inspectedUnit) {
            float boxH = (isOwner && inspectedUnit->type == UnitType::Purchasing) ? 164.0f : 100.0f;
            gfx.fill_rounded_rect(body.x, by, bw, boxH, 12.0f, pal::BG_SLATE_800);
            gfx.draw_rounded_rect(body.x, by, bw, boxH, 12.0f, pal::BORDER_CARD, 1.0f);
            gfx.draw_text(inspectedUnit->name, {body.x + 14.0f, by + 12.0f, bw - 200.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);
            char uSub[64];
            std::snprintf(uSub, sizeof(uSub), "Slot #%d · Lv.%d/5 · Efisiensi %.0f%% · Cap %s",
                          inspectedUnit->slotIndex + 1, inspectedUnit->level,
                          inspectedUnit->efficiency * 100.0,
                          caplab::math::format_int_commas(inspectedUnit->capacity).c_str());
            gfx.draw_text(uSub, {body.x + 14.0f, by + 34.0f, bw - 200.0f, 18.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono10);

            if (isOwner && inspectedUnit->level < 5) {
                int64_t uc = caplab::get_unit_upgrade_cost(inspectedUnit->level);
                bool aff = (playerCash >= uc);
                caplab::gfx::RectF ub{body.x + bw - 186.0f, by + 14.0f, 172.0f, 36.0f};
                std::string ulbl = "Upgrade Lv." + std::to_string(inspectedUnit->level + 1) + " (" + caplab::math::format_cost_short(static_cast<double>(uc)) + ")";
                draw_button(gfx, ub, ulbl, aff ? pal::EMERALD_600 : pal::BG_HEADER,
                            aff ? pal::EMERALD_400 : pal::BORDER_CARD, aff ? pal::TEXT_WHITE : pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Bold10, 8.0f);
                if (aff) hits_.add(ub, ACT_DRAWER_UPGRADE_UNIT, 0, 0, inspectedUnit->id);
            }

            if (isOwner && inspectedUnit->type == UnitType::Purchasing) {
                gfx.draw_line(body.x + 14.0f, by + 66.0f, body.x + bw - 14.0f, by + 66.0f, pal::BORDER_SUBTLE, 1.0f);
                gfx.draw_text("Pemasok Rantai Pasok Aktif:", {body.x + 14.0f, by + 76.0f, bw - 28.0f, 16.0f}, pal::SKY_400, caplab::gfx::FontStyle::Bold11);
                std::string supName = "Pelabuhan Impor Global";
                if (inspectedUnit->supplierFacilityId != "seaport") {
                    auto sIt = state_.facilities.find(inspectedUnit->supplierFacilityId);
                    if (sIt != state_.facilities.end()) {
                        supName = sIt->second.name + " (Q:" + std::to_string(sIt->second.qualityRating) + ")";
                    }
                }
                caplab::gfx::RectF cycBtn{body.x + 14.0f, by + 100.0f, bw - 28.0f, 40.0f};
                draw_button(gfx, cycBtn, supName + "  [Ketuk untuk Ganti Pemasok]", pal::BG_HEADER, pal::SKY_500, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Bold10, 9.0f, cycBtn.contains(mouseX_, mouseY_));
                hits_.add(cycBtn, ACT_DRAWER_CYCLE_SUPPLIER, 0, 0, inspectedUnit->id);
            }
            by += boxH + 12.0f;
        }
    } else if (drawerTab_ == FacilityDrawerTab::Pricing && isOwner) {
        bool hasCOO = false;
        if (comp) {
            for (const auto& ex : comp->executives) {
                if (ex.role == ExecutiveRole::COO && ex.hired) { hasCOO = true; break; }
            }
        }

        // COO Auto-Pricing Switch
        gfx.fill_rounded_rect(body.x, by, bw, 66.0f, 12.0f, pal::BG_SLATE_800);
        gfx.draw_rounded_rect(body.x, by, bw, 66.0f, 12.0f, pal::BORDER_CARD, 1.0f);
        gfx.draw_text("Otomasi Harga COO (Auto-Pricing)", {body.x + 14.0f, by + 12.0f, bw - 130.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);
        gfx.draw_text(hasCOO ? "COO aktif: harga otomatis menyesuaikan stok." : "Rekrut COO di Korporat -> C-Suite.",
                      {body.x + 14.0f, by + 34.0f, bw - 130.0f, 18.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
        caplab::gfx::RectF cooBtn{body.x + bw - 104.0f, by + 15.0f, 90.0f, 36.0f};
        draw_button(gfx, cooBtn, (hasCOO && drawerEditAutoPricing_) ? "Aktif" : "Nonaktif",
                    !hasCOO ? pal::BG_HEADER : (drawerEditAutoPricing_ ? pal::EMERALD_600 : pal::BG_SLATE_700),
                    pal::BORDER_CARD, !hasCOO ? pal::TEXT_SLATE_500 : pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, 8.0f);
        if (hasCOO) hits_.add(cooBtn, ACT_DRAWER_TOGGLE_AUTOPRICE);
        by += 78.0f;

        // Price Slider
        gfx.fill_rounded_rect(body.x, by, bw, 92.0f, 12.0f, pal::BG_SLATE_800);
        gfx.draw_rounded_rect(body.x, by, bw, 92.0f, 12.0f, pal::BORDER_CARD, 1.0f);
        gfx.draw_text(isRE ? "Tarif Sewa Bulanan / Unit" : "Harga Jual Satuan", {body.x + 14.0f, by + 12.0f, 240.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);
        char pCur[32];
        std::snprintf(pCur, sizeof(pCur), "$%.0f", drawerEditPrice_);
        gfx.draw_text(pCur, {body.x + 250.0f, by + 10.0f, bw - 264.0f, 22.0f}, pal::EMERALD_400, caplab::gfx::FontStyle::Mono14, caplab::gfx::TextAlign::Right);
        priceSliderRect_ = {body.x + 18.0f, by + 40.0f, bw - 36.0f, 22.0f};
        draw_horizontal_slider(gfx, priceSliderRect_, drawerEditPrice_, drawerPriceMin_, drawerPriceMax_, pal::SKY_500);
        hits_.add(priceSliderRect_, ACT_DRAWER_PRICE_SLIDER);
        char pRange[64];
        std::snprintf(pRange, sizeof(pRange), "Min $%.0f · Max $%.0f", drawerPriceMin_, drawerPriceMax_);
        gfx.draw_text(pRange, {body.x + 14.0f, by + 68.0f, bw - 28.0f, 15.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Mono9);
        by += 104.0f;

        // Ad Budget Slider
        gfx.fill_rounded_rect(body.x, by, bw, 92.0f, 12.0f, pal::BG_SLATE_800);
        gfx.draw_rounded_rect(body.x, by, bw, 92.0f, 12.0f, pal::BORDER_CARD, 1.0f);
        gfx.draw_text("Anggaran Iklan Bulanan", {body.x + 14.0f, by + 12.0f, 240.0f, 18.0f}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12);
        gfx.draw_text("$" + caplab::math::format_int_commas(drawerEditAdBudget_),
                      {body.x + 250.0f, by + 10.0f, bw - 264.0f, 22.0f}, pal::AMBER_400, caplab::gfx::FontStyle::Mono14, caplab::gfx::TextAlign::Right);
        adSliderRect_ = {body.x + 18.0f, by + 40.0f, bw - 36.0f, 22.0f};
        draw_horizontal_slider(gfx, adSliderRect_, static_cast<double>(drawerEditAdBudget_), 0.0, 60000.0, pal::AMBER_500);
        hits_.add(adSliderRect_, ACT_DRAWER_AD_SLIDER);
        gfx.draw_text("Meningkatkan Brand Rating cabang untuk produk yang sensitif terhadap merek.",
                      {body.x + 14.0f, by + 68.0f, bw - 28.0f, 15.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Regular10);
        by += 104.0f;

        caplab::gfx::RectF appBtn{body.x, by, bw, 44.0f};
        draw_button(gfx, appBtn, "Simpan Konfigurasi Fasilitas", pal::SKY_600, pal::SKY_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold12, 10.0f, appBtn.contains(mouseX_, mouseY_));
        hits_.add(appBtn, ACT_DRAWER_APPLY_CONFIG);
        by += 54.0f;
    }

    drawerScroll_.contentHeight = std::max(body.h, (by + drawerScroll_.offsetY) - body.y + 8.0f);
    drawerScroll_.clamp();
    draw_scrollbar(gfx, body, drawerScroll_);
    gfx.pop_clip();

    if (isOwner) {
        float fy = my + mh - 56.0f;
        gfx.draw_line(mx, fy - 6.0f, mx + mw, fy - 6.0f, pal::BORDER_SUBTLE, 1.0f);
        if (!drawerConfirmDemolish_) {
            int64_t upgCost = caplab::get_facility_upgrade_cost(fac.type, fac.level);
            bool canUp = (fac.level < 5 && playerCash >= upgCost);
            std::string upLbl = (fac.level < 5)
                ? ("Naikkan Lv." + std::to_string(fac.level + 1) + " (" + caplab::math::format_cost_short(static_cast<double>(upgCost)) + ")")
                : "Level Maksimal (Lv.5)";
            caplab::gfx::RectF uBtn{mx + 16.0f, fy, mw - 150.0f, 42.0f};
            draw_button(gfx, uBtn, upLbl, canUp ? pal::EMERALD_600 : pal::BG_SLATE_800,
                        canUp ? pal::EMERALD_400 : pal::BORDER_CARD, canUp ? pal::TEXT_WHITE : pal::TEXT_SLATE_500, caplab::gfx::FontStyle::Bold11, 10.0f);
            if (canUp) hits_.add(uBtn, ACT_DRAWER_UPGRADE_FAC);

            caplab::gfx::RectF dBtn{mx + mw - 124.0f, fy, 108.0f, 42.0f};
            draw_button(gfx, dBtn, "Bongkar", 0xCC4C0519u, pal::ROSE_400, pal::ROSE_400, caplab::gfx::FontStyle::Bold11, 10.0f);
            hits_.add(dBtn, ACT_DRAWER_DEMOLISH_CONFIRM);
        } else {
            gfx.fill_rounded_rect(mx + 16.0f, fy, mw - 32.0f, 42.0f, 10.0f, 0xCC4C0519u);
            gfx.draw_text("Bongkar & jual aset (35%)?", {mx + 28.0f, fy, 220.0f, 42.0f}, pal::ROSE_400, caplab::gfx::FontStyle::Bold11, caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Middle);
            caplab::gfx::RectF cnl{mx + mw - 216.0f, fy + 4.0f, 84.0f, 34.0f};
            caplab::gfx::RectF go{mx + mw - 124.0f, fy + 4.0f, 98.0f, 34.0f};
            draw_button(gfx, cnl, "Batal", pal::BG_SLATE_800, pal::BORDER_CARD, pal::TEXT_SLATE_200, caplab::gfx::FontStyle::Bold10, 8.0f);
            draw_button(gfx, go, "Ya, Bongkar", pal::ROSE_600, pal::ROSE_400, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold10, 8.0f);
            hits_.add(cnl, ACT_DRAWER_DEMOLISH_CANCEL);
            hits_.add(go, ACT_DRAWER_DEMOLISH_EXEC);
        }
    }
}

void GameApp::render_toast(caplab::gfx::D2DRenderer& gfx, float w) {
    float tw = std::min(460.0f, w - 40.0f);
    float tx = (w - tw) * 0.5f;
    float ty = 52.0f;
    caplab::gfx::RectF r{tx, ty, tw, 36.0f};
    gfx.fill_rounded_rect(r.x, r.y, r.w, r.h, 5.0f, toastIsError_ ? 0xEE4C0519u : 0xEE0D1526u);
    gfx.draw_rounded_rect(r.x, r.y, r.w, r.h, 5.0f, toastIsError_ ? pal::ROSE_400 : pal::SKY_500, 1.0f);
    gfx.draw_text(toastText_, {r.x + 12.0f, r.y, r.w - 44.0f, r.h}, pal::TEXT_WHITE, caplab::gfx::FontStyle::Bold11, caplab::gfx::TextAlign::Left, caplab::gfx::TextVAlign::Middle);
    caplab::gfx::RectF xBtn{r.x + r.w - 30.0f, r.y + 4.0f, 26.0f, 26.0f};
    draw_button(gfx, xBtn, "X", 0x00000000u, 0, pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Bold10, 3.0f);
    hits_.add(xBtn, ACT_DISMISS_TOAST);
}

} // namespace caplab::ui
