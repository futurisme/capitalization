#pragma once

#include "../core/Types.hpp"
#include "../engine/SimulationWorker.hpp"
#include "../graphics/D2DRenderer.hpp"
#include "../platform/Win32Hardware.hpp"
#include "../renderer/IsometricEngine.hpp"
#include "UIWidgets.hpp"

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace caplab::ui {

enum class MainTab : uint8_t {
    Map = 0,
    Facilities,
    Market,
    Stocks,
    HQ
};

enum class FacilityDrawerTab : uint8_t {
    Overview = 0,
    Units,
    Pricing
};

enum class StockSubTab : uint8_t {
    Stocks = 0,
    Banking
};

enum class HQSubTab : uint8_t {
    Profile = 0,
    Executives,
    Ranking,
    Tech,
    SaveSystem
};

enum class RankSubTab : uint8_t {
    Ranking = 0,
    MarketShare,
    Financials
};

enum class RankSortBy : uint8_t {
    MarketCap = 0,
    BookValue,
    Revenue
};

class GameApp {
public:
    explicit GameApp(caplab::platform::Win32Hardware& platform);

    void initialize();
    void on_close();

    void handle_input(const caplab::platform::InputEvent& ev);
    void update_and_render(caplab::gfx::D2DRenderer& gfx, double dtSeconds);

private:
    enum ActionId : int {
        ACT_NONE = 0,
        ACT_TOGGLE_PAUSE,
        ACT_SET_SPEED,
        ACT_ADVANCE_MONTH,
        ACT_OPEN_NEWS,
        ACT_CLOSE_NEWS,
        ACT_NAV_TAB,
        // Map controls
        ACT_MAP_FILTER_MINE,
        ACT_MAP_TOGGLE_TRAFFIC,
        ACT_MAP_TOGGLE_BADGES,
        ACT_MAP_FOCUS_HQ,
        ACT_MAP_ZOOM_IN,
        ACT_MAP_ZOOM_OUT,
        ACT_OPEN_BUILD_MODAL,
        ACT_INSPECT_FACILITY,
        ACT_DISMISS_TOAST,
        // Facilities view
        ACT_FAC_VIEW_MODE,
        ACT_FAC_FILTER,
        // Market view
        ACT_MKT_FILTER,
        // Stocks view
        ACT_STK_SUBTAB,
        ACT_STK_SELECT_COMP,
        ACT_STK_LOT_SHARES,
        ACT_STK_BUY,
        ACT_STK_SELL,
        ACT_STK_MERGER_CONFIRM,
        ACT_STK_MERGER_EXEC,
        ACT_STK_MERGER_CANCEL,
        ACT_STK_LOAN_AMT,
        ACT_STK_BORROW,
        ACT_STK_REPAY,
        ACT_STK_ISSUE_CNT,
        ACT_STK_ISSUE_EXEC,
        ACT_STK_DIVIDEND,
        // HQ view
        ACT_HQ_SUBTAB,
        ACT_HQ_BRAND_STRATEGY,
        ACT_HQ_TOGGLE_EXEC,
        ACT_HQ_RANK_SUBTAB,
        ACT_HQ_RANK_SORT,
        ACT_HQ_SET_RESEARCH,
        ACT_HQ_SAVE_LOCAL,
        ACT_HQ_LOAD_LOCAL,
        ACT_HQ_RESET_CONFIRM,
        ACT_HQ_RESET_EXEC,
        ACT_HQ_RESET_CANCEL,
        ACT_HQ_EXPORT_FILE,
        ACT_HQ_IMPORT_FILE,
        ACT_HQ_IMPORT_CLIPBOARD,
        // Build modal
        ACT_BUILD_CLOSE,
        ACT_BUILD_CAT,
        ACT_BUILD_SELECT_TYPE,
        ACT_BUILD_SELECT_PROD,
        ACT_BUILD_CONFIRM,
        ACT_BUILD_BACKDROP,
        // Facility Drawer modal
        ACT_DRAWER_CLOSE,
        ACT_DRAWER_BACKDROP,
        ACT_DRAWER_TAB,
        ACT_DRAWER_SLOT,
        ACT_DRAWER_INSTALL_UNIT,
        ACT_DRAWER_UPGRADE_UNIT,
        ACT_DRAWER_CYCLE_SUPPLIER,
        ACT_DRAWER_TOGGLE_AUTOPRICE,
        ACT_DRAWER_PRICE_SLIDER,
        ACT_DRAWER_AD_SLIDER,
        ACT_DRAWER_APPLY_CONFIG,
        ACT_DRAWER_UPGRADE_FAC,
        ACT_DRAWER_DEMOLISH_CONFIRM,
        ACT_DRAWER_DEMOLISH_EXEC,
        ACT_DRAWER_DEMOLISH_CANCEL,
    };

    void advance_simulation_month(bool emitParticles);
    void submit_background_month_tick(bool emitParticles);
    void apply_simulation_result(caplab::SimulationState nextState, bool emitParticles);
    void invalidate_and_persist();
    void show_toast(std::string text, bool isError = false);
    void focus_camera_on_player_hq(bool smooth);
    void open_facility_drawer(const std::string& facilityId);
    void open_build_modal(std::optional<caplab::iso::TileCoord> parcelCoord);

    void execute_action(const HitRegion& hit, float mx, float my);

    // Action handlers (1:1 parity with browser App.tsx & views)
    void action_build_facility(FacilityType type, ProductId targetProduct);
    void action_upgrade_facility(const std::string& facilityId);
    void action_install_unit(const std::string& facilityId, int slotIndex, UnitType unitType);
    void action_upgrade_unit(const std::string& facilityId, const std::string& unitId);
    void action_cycle_supplier(const std::string& facilityId, const std::string& unitId);
    void action_demolish_facility(const std::string& facilityId);

    // Rendering sections
    void render_top_header(caplab::gfx::D2DRenderer& gfx, float w);
    void render_left_rail(caplab::gfx::D2DRenderer& gfx, float topY, float h);
    void render_map_view(caplab::gfx::D2DRenderer& gfx, const caplab::gfx::RectF& area, double dt);
    void render_facilities_view(caplab::gfx::D2DRenderer& gfx, const caplab::gfx::RectF& area);
    void render_market_view(caplab::gfx::D2DRenderer& gfx, const caplab::gfx::RectF& area);
    void render_stocks_view(caplab::gfx::D2DRenderer& gfx, const caplab::gfx::RectF& area);
    void render_hq_view(caplab::gfx::D2DRenderer& gfx, const caplab::gfx::RectF& area);

    void render_news_modal(caplab::gfx::D2DRenderer& gfx, float w, float h);
    void render_build_modal(caplab::gfx::D2DRenderer& gfx, float w, float h);
    void render_facility_drawer_modal(caplab::gfx::D2DRenderer& gfx, float w, float h);
    void render_toast(caplab::gfx::D2DRenderer& gfx, float w);

    caplab::platform::Win32Hardware& platform_;
    caplab::SimulationState state_;
    caplab::iso::IsometricEngine isoEngine_;

    HitRegistry hits_;
    caplab::gfx::RectF mapArea_{};
    caplab::gfx::RectF activeScrollArea_{};

    MainTab activeTab_ = MainTab::Map;
    bool showNewsModal_ = false;
    bool showBuildModal_ = false;
    std::string inspectingFacilityId_;

    // Map overlay toggles
    bool filterMyFacilitiesOnly_ = false;
    bool showTrafficOverlay_ = false;
    bool showBadges_ = true;

    // Facilities view state
    bool facSupplyChainMode_ = false;
    int facFilterCat_ = -1; // -1 = all, otherwise FacilityCategory int

    // Market view state
    int mktFilterCat_ = -1; // -1 = all, otherwise ProductCategory int

    // Stocks view state
    StockSubTab stockSubTab_ = StockSubTab::Stocks;
    std::string selectedStockCompanyId_ = "comp_apex";
    int64_t tradeShares_ = 5000;
    int64_t issueCount_ = 50000;
    int64_t loanAmount_ = 500000;
    bool confirmMerger_ = false;
    std::string stockFeedback_;
    bool stockFeedbackErr_ = false;

    // HQ view state
    HQSubTab hqSubTab_ = HQSubTab::Profile;
    RankSubTab rankSubTab_ = RankSubTab::Ranking;
    RankSortBy rankSortBy_ = RankSortBy::MarketCap;
    bool confirmReset_ = false;

    // Build modal state
    FacilityCategory buildCat_ = FacilityCategory::Store;
    FacilityType buildChosenType_ = FacilityType::StoreConvenience;
    ProductId buildChosenProduct_ = ProductId::Bread;
    std::optional<caplab::iso::TileCoord> buildTargetCoord_;

    // Facility drawer state
    FacilityDrawerTab drawerTab_ = FacilityDrawerTab::Overview;
    std::optional<int> drawerSelectedSlot_;
    bool drawerConfirmDemolish_ = false;
    double drawerEditPrice_ = 10.0;
    int drawerEditAdBudget_ = 5000;
    bool drawerEditAutoPricing_ = false;
    double drawerPriceMin_ = 1.0;
    double drawerPriceMax_ = 100.0;
    double drawerPriceStep_ = 1.0;
    caplab::gfx::RectF priceSliderRect_{};
    caplab::gfx::RectF adSliderRect_{};
    int activeSliderDrag_ = 0; // 0=none, 1=price, 2=ad

    // Scroll states
    ScrollState mainScroll_{};
    ScrollState stockListScroll_{};
    ScrollState stockDetailScroll_{};
    ScrollState newsScroll_{};
    ScrollState buildScroll_{};
    ScrollState drawerScroll_{};
    caplab::gfx::RectF stockListRect_{};

    // Toast notification
    std::string toastText_;
    bool toastIsError_ = false;
    double toastTimerSec_ = 0.0;

    // CPU background simulation worker + epoch guard
    caplab::SimulationWorker worker_;
    uint64_t stateEpoch_ = 1;

    // Simulation cadence & throttled autosave
    double simAccumSec_ = 0.0;
    int ticksSinceSave_ = 0;
    int buildSeq_ = 1;

    // Pointer hover coordinates
    float mouseX_ = -1.0f;
    float mouseY_ = -1.0f;
};

} // namespace caplab::ui
