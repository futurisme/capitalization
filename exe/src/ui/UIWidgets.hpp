#pragma once

#include "../core/Types.hpp"
#include "../graphics/D2DRenderer.hpp"

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace caplab::ui {

namespace pal {
inline constexpr uint32_t BG_VOID = 0xFF090E1Au;
inline constexpr uint32_t BG_HEADER = 0xFF0E1525u;
inline constexpr uint32_t BG_CARD = 0xFF121C30u;
inline constexpr uint32_t BG_ROW_ALT = 0xFF0F182Au;
inline constexpr uint32_t BG_ELEVATED = 0xFF0D1422u;
inline constexpr uint32_t BG_SLATE_800 = 0xFF1A253Au;
inline constexpr uint32_t BG_SLATE_700 = 0xFF334155u;
inline constexpr uint32_t BORDER_SUBTLE = 0xFF1E293Bu;
inline constexpr uint32_t BORDER_CARD = 0xFF334155u;

inline constexpr uint32_t SKY_500 = 0xFF0EA5E9u;
inline constexpr uint32_t SKY_600 = 0xFF0284C7u;
inline constexpr uint32_t SKY_400 = 0xFF38BDF8u;
inline constexpr uint32_t EMERALD_600 = 0xFF059669u;
inline constexpr uint32_t EMERALD_500 = 0xFF10B981u;
inline constexpr uint32_t EMERALD_400 = 0xFF34D399u;
inline constexpr uint32_t AMBER_600 = 0xFFD97706u;
inline constexpr uint32_t AMBER_500 = 0xFFF59E0Bu;
inline constexpr uint32_t AMBER_400 = 0xFFFBBF24u;
inline constexpr uint32_t ROSE_600 = 0xFFE11D48u;
inline constexpr uint32_t ROSE_400 = 0xFFFB7185u;
inline constexpr uint32_t TEAL_400 = 0xFF2DD4BFu;
inline constexpr uint32_t VIOLET_400 = 0xFFA78BFAu;

inline constexpr uint32_t TEXT_WHITE = 0xFFF8FAFCu;
inline constexpr uint32_t TEXT_SLATE_200 = 0xFFE2E8F0u;
inline constexpr uint32_t TEXT_SLATE_300 = 0xFFCBD5E1u;
inline constexpr uint32_t TEXT_SLATE_400 = 0xFF94A3B8u;
inline constexpr uint32_t TEXT_SLATE_500 = 0xFF64748Bu;
} // namespace pal

struct HitRegion {
    caplab::gfx::RectF rect;
    int actionId = 0;
    int arg1 = 0;
    int arg2 = 0;
    std::string strArg;
};

class HitRegistry {
public:
    void clear() noexcept { regions_.clear(); }

    void add(const caplab::gfx::RectF& rect, int actionId, int arg1 = 0, int arg2 = 0, std::string strArg = {}) {
        regions_.push_back({rect, actionId, arg1, arg2, std::move(strArg)});
    }

    // Reverse scan so topmost layered element receives the hit
    const HitRegion* hit_test(float x, float y) const noexcept {
        for (int i = static_cast<int>(regions_.size()) - 1; i >= 0; --i) {
            if (regions_[static_cast<size_t>(i)].rect.contains(x, y)) {
                return &regions_[static_cast<size_t>(i)];
            }
        }
        return nullptr;
    }

private:
    std::vector<HitRegion> regions_;
};

struct ScrollState {
    float offsetY = 0.0f;
    float contentHeight = 0.0f;
    float viewHeight = 1.0f;

    void clamp() noexcept {
        float maxScroll = contentHeight - viewHeight;
        if (maxScroll < 0.0f) maxScroll = 0.0f;
        if (offsetY < 0.0f) offsetY = 0.0f;
        if (offsetY > maxScroll) offsetY = maxScroll;
    }

    void scroll_by(float deltaPx) noexcept {
        offsetY += deltaPx;
        clamp();
    }
};

void draw_button(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::gfx::RectF& rect,
    std::string_view label,
    uint32_t bgArgb,
    uint32_t borderArgb,
    uint32_t textArgb,
    caplab::gfx::FontStyle font = caplab::gfx::FontStyle::Bold11,
    float radius = 4.0f,
    bool hovered = false);

void draw_progress_bar(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::gfx::RectF& rect,
    float ratio01,
    uint32_t trackArgb,
    uint32_t fillArgb,
    float radius = 2.0f);

void draw_horizontal_slider(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::gfx::RectF& rect,
    double value,
    double minVal,
    double maxVal,
    uint32_t accentArgb);

double slider_value_from_x(
    const caplab::gfx::RectF& rect,
    float mouseX,
    double minVal,
    double maxVal,
    double step) noexcept;

void draw_scrollbar(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::gfx::RectF& viewport,
    const ScrollState& scroll);

void draw_stock_chart(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::gfx::RectF& bounds,
    const std::vector<double>& history);

// Minimalist Capitalism Lab 3x3 slot occupancy diagram + crisp vector rail icons
void draw_mini_unit_matrix(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::Facility& fac,
    float x,
    float y,
    float size);

void draw_nav_icon(
    caplab::gfx::D2DRenderer& gfx,
    int tabIndex,
    float cx,
    float cy,
    float size,
    uint32_t colorArgb);

// Procedural crisp vector icons matching browser IconHelper
void draw_product_icon(
    caplab::gfx::D2DRenderer& gfx,
    caplab::ProductId id,
    float x,
    float y,
    float size);

void draw_facility_icon(
    caplab::gfx::D2DRenderer& gfx,
    caplab::FacilityType type,
    float x,
    float y,
    float size);

void draw_ceo_emblem(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::Company& comp,
    float x,
    float y,
    float size);

} // namespace caplab::ui
