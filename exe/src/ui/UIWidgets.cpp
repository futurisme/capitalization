#include "UIWidgets.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace caplab::ui {

namespace {
inline uint32_t brighten_argb(uint32_t argb, int delta) noexcept {
    int a = static_cast<int>((argb >> 24) & 0xFFu);
    int r = std::clamp(static_cast<int>((argb >> 16) & 0xFFu) + delta, 0, 255);
    int g = std::clamp(static_cast<int>((argb >> 8) & 0xFFu) + delta, 0, 255);
    int b = std::clamp(static_cast<int>(argb & 0xFFu) + delta, 0, 255);
    return (static_cast<uint32_t>(a) << 24) |
           (static_cast<uint32_t>(r) << 16) |
           (static_cast<uint32_t>(g) << 8) |
           static_cast<uint32_t>(b);
}
} // namespace

void draw_button(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::gfx::RectF& rect,
    std::string_view label,
    uint32_t bgArgb,
    uint32_t borderArgb,
    uint32_t textArgb,
    caplab::gfx::FontStyle font,
    float radius,
    bool hovered
) {
    uint32_t fill = hovered ? brighten_argb(bgArgb, 16) : bgArgb;
    gfx.fill_rounded_rect(rect.x, rect.y, rect.w, rect.h, radius, fill);
    if ((borderArgb & 0xFF000000u) != 0) {
        gfx.draw_rounded_rect(rect.x, rect.y, rect.w, rect.h, radius, borderArgb, 1.0f);
    }
    gfx.draw_text(
        label,
        {rect.x + 6.0f, rect.y, std::max(1.0f, rect.w - 12.0f), rect.h},
        textArgb,
        font,
        caplab::gfx::TextAlign::Center,
        caplab::gfx::TextVAlign::Middle,
        false,
        true);
}

void draw_progress_bar(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::gfx::RectF& rect,
    float ratio01,
    uint32_t trackArgb,
    uint32_t fillArgb,
    float radius
) {
    float clamped = std::clamp(ratio01, 0.0f, 1.0f);
    gfx.fill_rounded_rect(rect.x, rect.y, rect.w, rect.h, radius, trackArgb);
    float fillW = rect.w * clamped;
    if (fillW >= 2.0f) {
        gfx.fill_rounded_rect(rect.x, rect.y, fillW, rect.h, std::min(radius, fillW * 0.5f), fillArgb);
    }
}

void draw_horizontal_slider(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::gfx::RectF& rect,
    double value,
    double minVal,
    double maxVal,
    uint32_t accentArgb
) {
    double span = std::max(1e-6, maxVal - minVal);
    float ratio = static_cast<float>(std::clamp((value - minVal) / span, 0.0, 1.0));
    float trackY = rect.y + rect.h * 0.5f - 3.0f;
    gfx.fill_rounded_rect(rect.x, trackY, rect.w, 6.0f, 3.0f, pal::BG_SLATE_700);
    float fillW = std::max(6.0f, rect.w * ratio);
    gfx.fill_rounded_rect(rect.x, trackY, fillW, 6.0f, 3.0f, accentArgb);
    float thumbX = rect.x + rect.w * ratio;
    float thumbY = rect.y + rect.h * 0.5f;
    gfx.fill_circle(thumbX, thumbY, 8.0f, accentArgb);
    gfx.draw_circle(thumbX, thumbY, 8.0f, 0xFFFFFFFFu, 1.5f);
}

double slider_value_from_x(
    const caplab::gfx::RectF& rect,
    float mouseX,
    double minVal,
    double maxVal,
    double step
) noexcept {
    float ratio = std::clamp((mouseX - rect.x) / std::max(1.0f, rect.w), 0.0f, 1.0f);
    double raw = minVal + static_cast<double>(ratio) * (maxVal - minVal);
    if (step > 0.0) {
        raw = std::round(raw / step) * step;
    }
    return std::clamp(raw, minVal, maxVal);
}

void draw_scrollbar(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::gfx::RectF& viewport,
    const ScrollState& scroll
) {
    if (scroll.contentHeight <= scroll.viewHeight + 2.0f) return;
    float barW = 5.0f;
    float barX = viewport.x + viewport.w - barW - 3.0f;
    float trackH = std::max(20.0f, viewport.h - 8.0f);
    float ratioVisible = std::clamp(scroll.viewHeight / scroll.contentHeight, 0.08f, 1.0f);
    float thumbH = std::max(24.0f, trackH * ratioVisible);
    float maxScroll = std::max(1.0f, scroll.contentHeight - scroll.viewHeight);
    float scrollFrac = std::clamp(scroll.offsetY / maxScroll, 0.0f, 1.0f);
    float thumbY = viewport.y + 4.0f + scrollFrac * (trackH - thumbH);

    gfx.fill_rounded_rect(barX, viewport.y + 4.0f, barW, trackH, 2.5f, caplab::gfx::rgb_alpha(0x1e293b, 0.5f));
    gfx.fill_rounded_rect(barX, thumbY, barW, thumbH, 2.5f, caplab::gfx::rgb_alpha(0x64748b, 0.85f));
}

void draw_stock_chart(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::gfx::RectF& bounds,
    const std::vector<double>& history
) {
    gfx.fill_rounded_rect(bounds.x, bounds.y, bounds.w, bounds.h, 4.0f, 0xCC060A14u);
    gfx.draw_rounded_rect(bounds.x, bounds.y, bounds.w, bounds.h, 4.0f, pal::BORDER_SUBTLE, 1.0f);

    double ptsBuf[64]{};
    size_t n = 0;
    if (history.size() >= 2) {
        n = std::min<size_t>(history.size(), 64);
        size_t start = history.size() - n;
        for (size_t i = 0; i < n; ++i) ptsBuf[i] = history[start + i];
    } else {
        n = 2;
        ptsBuf[0] = 10.0;
        ptsBuf[1] = history.empty() ? 10.0 : history[0];
    }

    double minV = ptsBuf[0];
    double maxV = ptsBuf[0];
    for (size_t i = 1; i < n; ++i) {
        if (ptsBuf[i] < minV) minV = ptsBuf[i];
        if (ptsBuf[i] > maxV) maxV = ptsBuf[i];
    }

    char hdrLeft[64], hdrRight[64];
    std::snprintf(hdrLeft, sizeof(hdrLeft), "Harga Saham (%zu Bln)", n);
    std::snprintf(hdrRight, sizeof(hdrRight), "Min $%.2f · Max $%.2f", minV, maxV);
    gfx.draw_text(hdrLeft, {bounds.x + 10.0f, bounds.y + 6.0f, bounds.w * 0.50f, 15.0f}, pal::TEXT_SLATE_400, caplab::gfx::FontStyle::Bold10);
    gfx.draw_text(hdrRight, {bounds.x + bounds.w * 0.45f, bounds.y + 6.0f, bounds.w * 0.55f - 10.0f, 15.0f}, pal::TEXT_SLATE_300, caplab::gfx::FontStyle::Mono9, caplab::gfx::TextAlign::Right);

    double lo = minV * 0.94;
    double hi = maxV * 1.06;
    double range = std::max(0.5, hi - lo);

    float plotX = bounds.x + 10.0f;
    float plotY = bounds.y + 24.0f;
    float plotW = std::max(20.0f, bounds.w - 20.0f);
    float plotH = std::max(24.0f, bounds.h - 32.0f);

    for (int g = 1; g <= 3; ++g) {
        float gy = plotY + plotH * (static_cast<float>(g) / 4.0f);
        gfx.draw_dashed_line(plotX, gy, plotX + plotW, gy, 0x3364748Bu, 0.7f);
    }

    caplab::gfx::Point2F linePts[64]{};
    caplab::gfx::Point2F polyPts[66]{};
    polyPts[0] = {plotX, plotY + plotH};
    for (size_t i = 0; i < n; ++i) {
        float px = plotX + (static_cast<float>(i) / static_cast<float>(std::max<size_t>(1, n - 1))) * plotW;
        float py = plotY + plotH - static_cast<float>((ptsBuf[i] - lo) / range) * (plotH - 6.0f) - 3.0f;
        linePts[i] = {px, py};
        polyPts[i + 1] = {px, py};
    }
    polyPts[n + 1] = {plotX + plotW, plotY + plotH};

    bool positive = ptsBuf[n - 1] >= ptsBuf[0];
    uint32_t strokeCol = positive ? pal::EMERALD_400 : pal::ROSE_400;
    uint32_t areaCol = caplab::gfx::rgb_alpha(positive ? 0x34d399u : 0xfb7185u, 0.14f);

    gfx.fill_polygon(polyPts, n + 2, areaCol);
    gfx.draw_polyline(linePts, n, strokeCol, 1.8f);
}

void draw_mini_unit_matrix(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::Facility& fac,
    float x,
    float y,
    float size
) {
    gfx.fill_rounded_rect(x, y, size, size, 3.0f, 0xFF0A0F1Cu);
    gfx.draw_rounded_rect(x, y, size, size, 3.0f, pal::BORDER_CARD, 0.8f);

    const float pad = 3.0f;
    const float gap = 2.0f;
    const float cell = std::max(3.0f, (size - pad * 2.0f - gap * 2.0f) / 3.0f);

    uint32_t slotColors[9];
    for (int i = 0; i < 9; ++i) slotColors[i] = 0xFF1A2438u;

    for (const auto& u : fac.units) {
        if (u.slotIndex < 0 || u.slotIndex >= 9) continue;
        uint32_t c = pal::SKY_500;
        switch (u.type) {
        case UnitType::Purchasing:    c = pal::AMBER_500; break;
        case UnitType::Manufacturing: c = pal::SKY_500; break;
        case UnitType::Sales:         c = pal::EMERALD_500; break;
        case UnitType::Advertising:   c = pal::VIOLET_400; break;
        case UnitType::Inventory:     c = pal::TEXT_SLATE_300; break;
        case UnitType::Rd:            c = pal::TEAL_400; break;
        default: break;
        }
        slotColors[u.slotIndex] = c;
    }

    for (int s = 0; s < 9; ++s) {
        int col = s % 3;
        int row = s / 3;
        float cx = x + pad + static_cast<float>(col) * (cell + gap);
        float cy = y + pad + static_cast<float>(row) * (cell + gap);
        gfx.fill_rect(cx, cy, cell, cell, slotColors[s]);
    }
}

void draw_nav_icon(
    caplab::gfx::D2DRenderer& gfx,
    int tabIndex,
    float cx,
    float cy,
    float size,
    uint32_t colorArgb
) {
    float h = size * 0.5f;
    if (tabIndex == 0) {
        // Isometric diamond city grid icon
        caplab::gfx::Point2F pts[4] = {
            {cx, cy - h * 0.78f},
            {cx + h, cy},
            {cx, cy + h * 0.78f},
            {cx - h, cy}
        };
        gfx.stroke_polygon(pts, 4, colorArgb, 1.4f);
        gfx.draw_line(cx - h * 0.45f, cy - h * 0.35f, cx + h * 0.45f, cy + h * 0.35f, colorArgb, 1.0f);
        gfx.draw_line(cx + h * 0.45f, cy - h * 0.35f, cx - h * 0.45f, cy + h * 0.35f, colorArgb, 1.0f);
    } else if (tabIndex == 1) {
        // 3x3 modular unit matrix icon
        float cell = size * 0.24f;
        float gap = size * 0.08f;
        float startX = cx - (cell * 1.5f + gap);
        float startY = cy - (cell * 1.5f + gap);
        for (int r = 0; r < 3; ++r) {
            for (int c = 0; c < 3; ++c) {
                float bx = startX + static_cast<float>(c) * (cell + gap);
                float by = startY + static_cast<float>(r) * (cell + gap);
                if ((r + c) % 2 == 0) gfx.fill_rect(bx, by, cell, cell, colorArgb);
                else gfx.draw_rect(bx, by, cell, cell, colorArgb, 1.0f);
            }
        }
    } else if (tabIndex == 2) {
        // Market vertical bar chart
        float bw = size * 0.22f;
        gfx.fill_rect(cx - h * 0.8f, cy + h * 0.1f, bw, h * 0.65f, colorArgb);
        gfx.fill_rect(cx - bw * 0.5f, cy - h * 0.55f, bw, h * 1.3f, colorArgb);
        gfx.fill_rect(cx + h * 0.8f - bw, cy - h * 0.2f, bw, h * 0.95f, colorArgb);
        gfx.draw_line(cx - h * 0.95f, cy + h * 0.8f, cx + h * 0.95f, cy + h * 0.8f, colorArgb, 1.2f);
    } else if (tabIndex == 3) {
        // Stock exchange trend line
        caplab::gfx::Point2F pts[4] = {
            {cx - h * 0.85f, cy + h * 0.45f},
            {cx - h * 0.25f, cy - h * 0.15f},
            {cx + h * 0.2f, cy + h * 0.25f},
            {cx + h * 0.85f, cy - h * 0.55f}
        };
        gfx.draw_polyline(pts, 4, colorArgb, 1.6f);
        gfx.fill_circle(pts[3].x, pts[3].y, 2.2f, colorArgb);
        gfx.draw_line(cx - h * 0.9f, cy + h * 0.8f, cx + h * 0.9f, cy + h * 0.8f, colorArgb, 1.1f);
    } else {
        // Corporate HQ building silhouette
        gfx.draw_rect(cx - h * 0.55f, cy - h * 0.65f, size * 0.55f, size * 0.72f, colorArgb, 1.4f);
        gfx.fill_rect(cx - h * 0.28f, cy - h * 0.38f, size * 0.11f, size * 0.11f, colorArgb);
        gfx.fill_rect(cx + h * 0.08f, cy - h * 0.38f, size * 0.11f, size * 0.11f, colorArgb);
        gfx.fill_rect(cx - h * 0.28f, cy - h * 0.08f, size * 0.11f, size * 0.11f, colorArgb);
        gfx.fill_rect(cx + h * 0.08f, cy - h * 0.08f, size * 0.11f, size * 0.11f, colorArgb);
        gfx.draw_line(cx - h * 0.85f, cy + h * 0.78f, cx + h * 0.85f, cy + h * 0.78f, colorArgb, 1.3f);
    }
}

void draw_product_icon(
    caplab::gfx::D2DRenderer& gfx,
    caplab::ProductId id,
    float x,
    float y,
    float size
) {
    uint32_t bg = 0xFF1E293Bu;
    uint32_t accent = pal::SKY_400;
    const char* glyph = "PR";
    switch (id) {
    case ProductId::Wheat:          bg = 0xFF3F2E12u; accent = 0xFFFBBF24u; glyph = "WH"; break;
    case ProductId::Livestock:      bg = 0xFF3F1D24u; accent = 0xFFFB7185u; glyph = "LV"; break;
    case ProductId::CrudeOil:       bg = 0xFF1E293Bu; accent = 0xFFF59E0Bu; glyph = "OIL"; break;
    case ProductId::IronOre:        bg = 0xFF27272Au; accent = 0xFFA1A1AAu; glyph = "FE"; break;
    case ProductId::Silicon:        bg = 0xFF164E63u; accent = 0xFF22D3EEu; glyph = "SI"; break;
    case ProductId::Flour:          bg = 0xFF422006u; accent = 0xFFFDE68Au; glyph = "FL"; break;
    case ProductId::Steel:          bg = 0xFF334155u; accent = 0xFFCBD5E1u; glyph = "ST"; break;
    case ProductId::Plastic:        bg = 0xFF1E3A8Au; accent = 0xFF60A5FAu; glyph = "PL"; break;
    case ProductId::ElectronicChip: bg = 0xFF064E3Bu; accent = 0xFF34D399u; glyph = "IC"; break;
    case ProductId::Fabric:         bg = 0xFF4C1D95u; accent = 0xFFC4B5FDu; glyph = "FB"; break;
    case ProductId::BatteryCell:    bg = 0xFF065F46u; accent = 0xFF10B981u; glyph = "EV"; break;
    case ProductId::Bread:          bg = 0xFF451A03u; accent = 0xFFFBBF24u; glyph = "BR"; break;
    case ProductId::SoftDrink:      bg = 0xFF0C4A6Eu; accent = 0xFF38BDF8u; glyph = "SD"; break;
    case ProductId::FashionApparel: bg = 0xFF581C87u; accent = 0xFFE879F9u; glyph = "FA"; break;
    case ProductId::Medicine:       bg = 0xFF064E3Bu; accent = 0xFF6EE7B7u; glyph = "RX"; break;
    case ProductId::Smartphone:     bg = 0xFF0F172Au; accent = 0xFF38BDF8u; glyph = "PH"; break;
    case ProductId::Laptop:         bg = 0xFF1E1B4Bu; accent = 0xFF818CF8u; glyph = "PC"; break;
    case ProductId::Automobile:     bg = 0xFF7F1D1Du; accent = 0xFFF87171u; glyph = "AU"; break;
    case ProductId::SoftwareOs:     bg = 0xFF042F2Eu; accent = 0xFF2DD4BFu; glyph = "OS"; break;
    case ProductId::AiEnterprise:   bg = 0xFF312E81u; accent = 0xFFA5B4FCu; glyph = "AI"; break;
    default: break;
    }

    float rad = std::max(4.0f, size * 0.22f);
    gfx.fill_rounded_rect(x, y, size, size, rad, bg);
    gfx.draw_rounded_rect(x, y, size, size, rad, caplab::gfx::rgb_alpha(accent, 0.55f), 1.0f);
    float cx = x + size * 0.5f;
    float cy = y + size * 0.5f;

    // Subtle crisp inner symbol + short monospaced code for instant legibility
    if (id == ProductId::Medicine) {
        gfx.fill_rect(cx - size * 0.08f, cy - size * 0.24f, size * 0.16f, size * 0.48f, accent);
        gfx.fill_rect(cx - size * 0.24f, cy - size * 0.08f, size * 0.48f, size * 0.16f, accent);
        return;
    }
    gfx.draw_text(
        glyph,
        {x + 1.0f, y + 1.0f, size - 2.0f, size - 2.0f},
        accent,
        size <= 24.0f ? caplab::gfx::FontStyle::Bold7 : caplab::gfx::FontStyle::Mono9,
        caplab::gfx::TextAlign::Center,
        caplab::gfx::TextVAlign::Middle,
        false,
        false);
}

void draw_facility_icon(
    caplab::gfx::D2DRenderer& gfx,
    caplab::FacilityType type,
    float x,
    float y,
    float size
) {
    uint32_t bg = 0xFF0F172Au;
    uint32_t accent = pal::SKY_400;
    const char* code = "FAC";
    switch (type) {
    case FacilityType::StoreConvenience:   bg = 0xFF064E3Bu; accent = 0xFF34D399u; code = "MART"; break;
    case FacilityType::StoreElectronics:   bg = 0xFF0C4A6Eu; accent = 0xFF38BDF8u; code = "TECH"; break;
    case FacilityType::StoreDepartment:    bg = 0xFF312E81u; accent = 0xFFA5B4FCu; code = "MALL"; break;
    case FacilityType::StoreAuto:          bg = 0xFF0369A1u; accent = 0xFFBAE6FDu; code = "AUTO"; break;
    case FacilityType::StorePharmacy:      bg = 0xFF065F46u; accent = 0xFF6EE7B7u; code = "MED"; break;
    case FacilityType::ApartmentComplex:   bg = 0xFF1E293Bu; accent = 0xFFFCD34Du; code = "APT"; break;
    case FacilityType::CommercialTower:    bg = 0xFF082F49u; accent = 0xFF7DD3FCu; code = "CBD"; break;
    case FacilityType::CivicHousing:       bg = 0xFF7C2D12u; accent = 0xFFFBBF24u; code = "KOT"; break;
    case FacilityType::FactoryAssembly:    bg = 0xFF1E3A8Au; accent = 0xFF60A5FAu; code = "MFG"; break;
    case FacilityType::FactoryProcessing:  bg = 0xFF27272Au; accent = 0xFFF59E0Bu; code = "PROC"; break;
    case FacilityType::WarehouseLogistics: bg = 0xFF334155u; accent = 0xFFF59E0Bu; code = "LOG"; break;
    case FacilityType::FarmAgriculture:    bg = 0xFF365314u; accent = 0xFFA3E635u; code = "FARM"; break;
    case FacilityType::MineExtraction:     bg = 0xFF3F3F46u; accent = 0xFFFBBF24u; code = "MINE"; break;
    case FacilityType::PowerPlantGreen:    bg = 0xFF064E3Bu; accent = 0xFF2DD4BFu; code = "VOLT"; break;
    case FacilityType::RdCenter:           bg = 0xFF0C4A6Eu; accent = 0xFF7DD3FCu; code = "R&D"; break;
    case FacilityType::TechSoftware:       bg = 0xFF042F2Eu; accent = 0xFF34D399u; code = "SOFT"; break;
    case FacilityType::MediaTelecom:       bg = 0xFF4C1D95u; accent = 0xFFC4B5FDu; code = "MEDI"; break;
    case FacilityType::CorporateHq:        bg = 0xFF0F172Au; accent = 0xFF67E8F9u; code = "HQ"; break;
    default: break;
    }

    float rad = std::max(5.0f, size * 0.24f);
    gfx.fill_rounded_rect(x, y, size, size, rad, bg);
    gfx.draw_rounded_rect(x, y, size, size, rad, caplab::gfx::rgb_alpha(accent, 0.7f), 1.2f);
    gfx.draw_text(
        code,
        {x + 1.0f, y + 1.0f, size - 2.0f, size - 2.0f},
        accent,
        size <= 30.0f ? caplab::gfx::FontStyle::Bold7 : caplab::gfx::FontStyle::Mono9,
        caplab::gfx::TextAlign::Center,
        caplab::gfx::TextVAlign::Middle,
        false,
        false);
}

void draw_ceo_emblem(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::Company& comp,
    float x,
    float y,
    float size
) {
    uint32_t col = 0xFF000000u | (comp.colorHex & 0x00FFFFFFu);
    uint32_t acc = 0xFF000000u | (comp.accentColorHex & 0x00FFFFFFu);
    float rad = std::max(5.0f, size * 0.24f);
    gfx.fill_rounded_rect(x, y, size, size, rad, caplab::gfx::rgb_alpha(comp.colorHex, 0.22f));
    gfx.draw_rounded_rect(x, y, size, size, rad, col, 1.4f);

    float cx = x + size * 0.5f;
    float cy = y + size * 0.38f;
    gfx.fill_circle(cx, cy, size * 0.16f, acc);
    gfx.fill_rounded_rect(cx - size * 0.24f, y + size * 0.56f, size * 0.48f, size * 0.26f, size * 0.12f, col);
}

} // namespace caplab::ui
