#include "IsometricEngine.hpp"
#include "../engine/ProductsData.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace caplab::iso {

namespace {
constexpr float PI_F = 3.14159265358979323846f;
inline constexpr uint32_t rgb(uint32_t hex) noexcept {
    return 0xFF000000u | (hex & 0x00FFFFFFu);
}
} // namespace

IsometricEngine::IsometricEngine() {
    setup_vehicles();
}

void IsometricEngine::setup_vehicles() {
    vehicles_ = {
        {2.0f, 5.0f, 'x', 5.0f, 1.0f, 1.9f, rgb(0x38bdf8)},
        {24.0f, 13.0f, 'x', 13.0f, -1.0f, 1.7f, rgb(0x34d399)},
        {6.0f, 21.0f, 'x', 21.0f, 1.0f, 1.6f, rgb(0xfbbf24)},
        {14.0f, 27.0f, 'x', 27.0f, -1.0f, 1.5f, rgb(0xe2e8f0)},
        {5.0f, 4.0f, 'y', 5.0f, 1.0f, 1.5f, rgb(0xf87171)},
        {13.0f, 22.0f, 'y', 13.0f, -1.0f, 1.8f, rgb(0xa78bfa)},
        {21.0f, 6.0f, 'y', 21.0f, 1.0f, 1.7f, rgb(0x38bdf8)},
        {27.0f, 16.0f, 'y', 27.0f, -1.0f, 1.4f, rgb(0xfb923c)},
        {16.0f, 13.0f, 'x', 13.0f, 1.0f, 2.0f, rgb(0x2dd4bf)},
        {13.0f, 9.0f, 'y', 13.0f, 1.0f, 1.4f, rgb(0xfacc15)},
    };
}

void IsometricEngine::set_viewport(float viewX, float viewY, float width, float height) {
    float prevW = viewWidth_;
    float prevH = viewHeight_;
    viewX_ = viewX;
    viewY_ = viewY;
    viewWidth_ = std::max(100.0f, width);
    viewHeight_ = std::max(100.0f, height);

    if (!hasInitializedCamera_) {
        center_camera_on(centerTargetTile_.x, centerTargetTile_.y, false);
        hasInitializedCamera_ = true;
    } else if (std::abs(viewWidth_ - prevW) > 0.5f || std::abs(viewHeight_ - prevH) > 0.5f) {
        float dw = (viewWidth_ - prevW) * 0.5f;
        float dh = (viewHeight_ - prevH) * 0.5f;
        camera_.x += dw;
        camera_.y += dh;
        camera_.targetX += dw;
        camera_.targetY += dh;
        clamp_camera();
    }
}

void IsometricEngine::clamp_camera() {
    float maxPanX = static_cast<float>(gridSize_) * TILE_WIDTH * 0.55f * camera_.zoom;
    float minWorldY = -40.0f * camera_.zoom;
    float maxWorldY = static_cast<float>(gridSize_) * TILE_HEIGHT * camera_.zoom;

    float centerX = viewWidth_ * 0.5f;
    float centerY = viewHeight_ * 0.5f;

    float minX = centerX - maxPanX;
    float maxX = centerX + maxPanX;
    float minY = centerY - maxWorldY;
    float maxY = centerY - minWorldY;

    camera_.targetX = std::clamp(camera_.targetX, minX, maxX);
    camera_.targetY = std::clamp(camera_.targetY, minY, maxY);
    camera_.x = std::clamp(camera_.x, minX - 60.0f, maxX + 60.0f);
    camera_.y = std::clamp(camera_.y, minY - 60.0f, maxY + 60.0f);
}

void IsometricEngine::center_camera_on(int tileX, int tileY, bool smooth) {
    centerTargetTile_ = {tileX, tileY};
    float halfW = TILE_WIDTH * 0.5f;
    float halfH = TILE_HEIGHT * 0.5f;
    float sx = static_cast<float>(tileX - tileY) * halfW;
    float sy = static_cast<float>(tileX + tileY) * halfH;

    float targetX = viewWidth_ * 0.5f - sx * camera_.zoom;
    float targetY = viewHeight_ * 0.5f - sy * camera_.zoom;

    if (!smooth) {
        camera_.x = targetX;
        camera_.y = targetY;
        camera_.targetX = targetX;
        camera_.targetY = targetY;
        camera_.velX = 0.0f;
        camera_.velY = 0.0f;
    } else {
        camera_.targetX = targetX;
        camera_.targetY = targetY;
    }
    clamp_camera();
}

void IsometricEngine::set_zoom(float nextZoom) {
    float clamped = std::clamp(nextZoom, 0.4f, 2.2f);
    float cx = viewWidth_ * 0.5f;
    float cy = viewHeight_ * 0.5f;
    float worldX = (cx - camera_.targetX) / std::max(0.01f, camera_.targetZoom);
    float worldY = (cy - camera_.targetY) / std::max(0.01f, camera_.targetZoom);
    camera_.targetZoom = clamped;
    camera_.targetX = cx - worldX * clamped;
    camera_.targetY = cy - worldY * clamped;
    clamp_camera();
}

void IsometricEngine::set_selected_tile(std::optional<TileCoord> tile) {
    selectedTile_ = tile;
}

TileCoord IsometricEngine::screen_to_tile(float localX, float localY) const {
    float wx = (localX - camera_.x) / std::max(0.01f, camera_.zoom);
    float wy = (localY - camera_.y) / std::max(0.01f, camera_.zoom);

    for (int i = static_cast<int>(buildingHitboxes_.size()) - 1; i >= 0; --i) {
        const auto& box = buildingHitboxes_[static_cast<size_t>(i)];
        if (wx >= box.minX && wx <= box.maxX && wy >= box.minY && wy <= box.maxY) {
            return {box.tileX, box.tileY};
        }
    }

    float halfW = TILE_WIDTH * 0.5f;
    float halfH = TILE_HEIGHT * 0.5f;
    float tx = (wx / halfW + wy / halfH) * 0.5f;
    float ty = (wy / halfH - wx / halfW) * 0.5f;
    return {static_cast<int>(std::floor(tx + 0.5f)), static_cast<int>(std::floor(ty + 0.5f))};
}

void IsometricEngine::spawn_particle(
    float x, float y, float vy, float alpha, bool isSmoke,
    std::string text, uint32_t argb, float size
) {
    auto& p = particlePool_[poolCursor_];
    poolCursor_ = (poolCursor_ + 1) % particlePool_.size();
    if (!p.active) activeParticleCount_++;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vy = vy;
    p.alpha = alpha;
    p.isSmoke = isSmoke;
    p.text = std::move(text);
    p.argb = argb;
    p.size = size;
}

void IsometricEngine::add_money_particle(int tileX, int tileY, const std::string& text) {
    float sx = static_cast<float>(tileX - tileY) * (TILE_WIDTH * 0.5f);
    float sy = static_cast<float>(tileX + tileY) * (TILE_HEIGHT * 0.5f);
    spawn_particle(sx, sy - 52.0f, -24.0f, 1.0f, false, text, rgb(0x34d399), 10.0f);
}

void IsometricEngine::emit_smoke_at_screen(float sx, float sy, float jitter) {
    int activeSmoke = 0;
    for (const auto& p : particlePool_) {
        if (p.active && p.isSmoke) activeSmoke++;
    }
    if (activeSmoke >= 8) return;
    spawn_particle(sx + jitter, sy, -18.0f, 0.55f, true, {}, rgb(0xcbd5e1), 3.2f);
}

void IsometricEngine::on_mouse_down(float mx, float my) {
    float lx = mx - viewX_;
    float ly = my - viewY_;
    if (lx < 0.0f || lx > viewWidth_ || ly < 0.0f || ly > viewHeight_) return;

    isDragging_ = true;
    dragStartX_ = lx;
    dragStartY_ = ly;
    lastPointerX_ = lx;
    lastPointerY_ = ly;
    camStartX_ = camera_.x;
    camStartY_ = camera_.y;
    camera_.velX = 0.0f;
    camera_.velY = 0.0f;
    hasMovedSignificantly_ = false;
}

void IsometricEngine::on_mouse_move(float mx, float my) {
    float lx = mx - viewX_;
    float ly = my - viewY_;
    if (isDragging_) {
        float dx = lx - dragStartX_;
        float dy = ly - dragStartY_;
        if (std::abs(dx) > 7.0f || std::abs(dy) > 7.0f) {
            hasMovedSignificantly_ = true;
        }
        camera_.velX = lx - lastPointerX_;
        camera_.velY = ly - lastPointerY_;
        lastPointerX_ = lx;
        lastPointerY_ = ly;

        camera_.x = camStartX_ + dx;
        camera_.y = camStartY_ + dy;
        camera_.targetX = camera_.x;
        camera_.targetY = camera_.y;
        clamp_camera();
    } else if (lx >= 0.0f && lx <= viewWidth_ && ly >= 0.0f && ly <= viewHeight_) {
        TileCoord pt = screen_to_tile(lx, ly);
        if (pt.x >= 0 && pt.x < gridSize_ && pt.y >= 0 && pt.y < gridSize_) {
            highlightTile_ = pt;
        } else {
            highlightTile_.reset();
        }
    } else {
        highlightTile_.reset();
    }
}

void IsometricEngine::on_mouse_up(float mx, float my) {
    if (!isDragging_) return;
    float lx = mx - viewX_;
    float ly = my - viewY_;
    if (!hasMovedSignificantly_) {
        TileCoord pt = screen_to_tile(lx, ly);
        if (pt.x >= 0 && pt.x < gridSize_ && pt.y >= 0 && pt.y < gridSize_) {
            selectedTile_ = pt;
            if (onTileSelected) onTileSelected(pt);
        }
    }
    isDragging_ = false;
}

void IsometricEngine::on_mouse_wheel(float mx, float my, float notches) {
    float lx = mx - viewX_;
    float ly = my - viewY_;
    if (lx < 0.0f || lx > viewWidth_ || ly < 0.0f || ly > viewHeight_) return;
    float factor = (notches < 0.0f) ? 0.9f : 1.1f;
    set_zoom(camera_.targetZoom * factor);
}

void IsometricEngine::bake_static_ground(caplab::gfx::D2DRenderer& gfx, const std::vector<MapParcel>& parcels) {
    if (parcels.empty()) return;
    const float pad = 96.0f;
    const float width = static_cast<float>(gridSize_) * TILE_WIDTH + pad * 2.0f;
    const float height = static_cast<float>(gridSize_) * TILE_HEIGHT + pad * 2.0f;
    const float originX = width * 0.5f;
    const float originY = pad + TILE_HEIGHT;
    const float halfW = TILE_WIDTH * 0.5f;
    const float halfH = TILE_HEIGHT * 0.5f;

    if (!gfx.begin_offscreen_bake(static_cast<int>(width), static_cast<int>(height))) {
        return;
    }

    for (int sum = 0; sum <= (gridSize_ - 1) * 2; ++sum) {
        for (int x = 0; x <= sum; ++x) {
            int y = sum - x;
            if (x >= gridSize_ || y >= gridSize_) continue;
            const MapParcel* parcel = parcelGrid_[static_cast<size_t>(y * gridSize_ + x)];
            if (!parcel || parcel->terrainType == TerrainType::Water) continue;

            float px = originX + static_cast<float>(x - y) * halfW;
            float py = originY + static_cast<float>(x + y) * halfH;
            draw_static_ground_tile(gfx, px, py, *parcel);
        }
    }

    gfx.end_offscreen_bake();
    groundOriginX_ = originX;
    groundOriginY_ = originY;
    bakedGridSize_ = gridSize_;
}

void IsometricEngine::draw_static_ground_tile(
    caplab::gfx::D2DRenderer& gfx,
    float px, float py, const MapParcel& parcel
) const {
    float hw = TILE_WIDTH * 0.5f;
    float hh = TILE_HEIGHT * 0.5f;
    caplab::gfx::Point2F pts[4] = {
        {px, py - hh},
        {px + hw, py},
        {px, py + hh},
        {px - hw, py},
    };

    if (parcel.terrainType == TerrainType::Road) {
        gfx.fill_polygon(pts, 4, rgb(0x1b263b));
        gfx.stroke_polygon(pts, 4, rgb(0x2d3b52), 1.0f);
        gfx.draw_dashed_line(px - hw * 0.35f, py - hh * 0.35f, px + hw * 0.35f, py + hh * 0.35f, rgb(0xd97706), 1.0f);
        return;
    }
    if (parcel.terrainType == TerrainType::IndustrialZone) {
        gfx.fill_polygon(pts, 4, rgb(0x262730));
        gfx.stroke_polygon(pts, 4, rgb(0x393b47), 0.8f);
        return;
    }
    if (parcel.terrainType == TerrainType::Pavement) {
        gfx.fill_polygon(pts, 4, rgb(0x2a374b));
        gfx.stroke_polygon(pts, 4, rgb(0x3d4f6a), 0.8f);
        return;
    }

    bool isOdd = ((parcel.x + parcel.y) % 2) == 0;
    gfx.fill_polygon(pts, 4, isOdd ? rgb(0x163826) : rgb(0x122f20));
    gfx.stroke_polygon(pts, 4, rgb(0x0f2519), 0.6f);
}

void IsometricEngine::draw_water_tile(
    caplab::gfx::D2DRenderer& gfx,
    float px, float py, uint32_t fillArgb, uint32_t strokeArgb
) const {
    float hw = TILE_WIDTH * 0.5f;
    float hh = TILE_HEIGHT * 0.5f;
    caplab::gfx::Point2F pts[4] = {
        {px, py - hh},
        {px + hw, py},
        {px, py + hh},
        {px - hw, py},
    };
    gfx.fill_polygon(pts, 4, fillArgb);
    gfx.stroke_polygon(pts, 4, strokeArgb, 0.8f);
}

void IsometricEngine::draw_traffic_heat_tile(
    caplab::gfx::D2DRenderer& gfx,
    float px, float py, int trafficIndex
) const {
    float hw = TILE_WIDTH * 0.5f - 2.0f;
    float hh = TILE_HEIGHT * 0.5f - 1.0f;
    caplab::gfx::Point2F pts[4] = {
        {px, py - hh},
        {px + hw, py},
        {px, py + hh},
        {px - hw, py},
    };
    uint32_t col = caplab::gfx::rgb_alpha(0x64748b, 0.08f);
    if (trafficIndex >= 72) col = caplab::gfx::rgb_alpha(0x10b981, 0.36f);
    else if (trafficIndex >= 48) col = caplab::gfx::rgb_alpha(0xf59e0b, 0.28f);
    else if (trafficIndex >= 28) col = caplab::gfx::rgb_alpha(0x38bdf8, 0.16f);
    gfx.fill_polygon(pts, 4, col);
}

void IsometricEngine::draw_tile_highlight(
    caplab::gfx::D2DRenderer& gfx,
    float px, float py, uint32_t strokeArgb, float width, bool glow
) const {
    float hw = TILE_WIDTH * 0.5f;
    float hh = TILE_HEIGHT * 0.5f;
    caplab::gfx::Point2F pts[4] = {
        {px, py - hh},
        {px + hw, py},
        {px, py + hh},
        {px - hw, py},
    };
    if (glow) {
        gfx.fill_polygon(pts, 4, caplab::gfx::rgb_alpha(0x38bdf8, 0.18f));
    }
    gfx.stroke_polygon(pts, 4, strokeArgb, width);
}

void IsometricEngine::draw_iso_box(
    caplab::gfx::D2DRenderer& gfx,
    float px, float py, float hw, float hh, float h,
    uint32_t leftArgb, uint32_t rightArgb, uint32_t roofArgb
) const {
    caplab::gfx::Point2F leftPts[4] = {
        {px - hw, py},
        {px, py + hh},
        {px, py + hh - h},
        {px - hw, py - h},
    };
    gfx.fill_polygon(leftPts, 4, leftArgb);
    gfx.stroke_polygon(leftPts, 4, rgb(0x090e1a), 0.8f);

    caplab::gfx::Point2F rightPts[4] = {
        {px, py + hh},
        {px + hw, py},
        {px + hw, py - h},
        {px, py + hh - h},
    };
    gfx.fill_polygon(rightPts, 4, rightArgb);
    gfx.stroke_polygon(rightPts, 4, rgb(0x090e1a), 0.8f);

    caplab::gfx::Point2F roofPts[4] = {
        {px, py - hh - h},
        {px + hw, py - h},
        {px, py + hh - h},
        {px - hw, py - h},
    };
    gfx.fill_polygon(roofPts, 4, roofArgb);
    gfx.stroke_polygon(roofPts, 4, rgb(0x1e293b), 0.8f);
}

void IsometricEngine::draw_iso_wall_quad(
    caplab::gfx::D2DRenderer& gfx,
    float px, float py, float hw, float hh, bool leftSide,
    float u0, float u1, float z0, float z1,
    uint32_t fillArgb, uint32_t strokeArgb
) const {
    float x0 = 0.0f, x1 = 0.0f, y00 = 0.0f, y10 = 0.0f;
    if (leftSide) {
        x0 = px - hw + u0 * hw;
        x1 = px - hw + u1 * hw;
        y00 = py + u0 * hh;
        y10 = py + u1 * hh;
    } else {
        x0 = px + u0 * hw;
        x1 = px + u1 * hw;
        y00 = py + hh - u0 * hh;
        y10 = py + hh - u1 * hh;
    }

    caplab::gfx::Point2F pts[4] = {
        {x0, y00 - z0},
        {x1, y10 - z0},
        {x1, y10 - z1},
        {x0, y00 - z1},
    };
    gfx.fill_polygon(pts, 4, fillArgb);
    if ((strokeArgb & 0xFF000000u) != 0) {
        gfx.stroke_polygon(pts, 4, strokeArgb, 0.6f);
    }
}

void IsometricEngine::draw_ticker_badge(
    caplab::gfx::D2DRenderer& gfx,
    float px, float py, std::string_view text, uint32_t bgArgb
) const {
    gfx.fill_rounded_rect(px - 16.0f, py, 32.0f, 9.5f, 2.5f, bgArgb);
    gfx.draw_rounded_rect(px - 16.0f, py, 32.0f, 9.5f, 2.5f, caplab::gfx::rgb_alpha(0xFFFFFF, 0.85f), 0.55f);
    gfx.draw_text(
        text,
        {px - 15.5f, py, 31.0f, 9.5f},
        0xFFFFFFFFu,
        caplab::gfx::FontStyle::Bold7,
        caplab::gfx::TextAlign::Center,
        caplab::gfx::TextVAlign::Middle,
        false,
        false);
}

float IsometricEngine::draw_diverse_facility(
    caplab::gfx::D2DRenderer& gfx,
    float px, float py,
    const Facility& fac,
    const Company* comp,
    bool emitSmokeNow,
    bool showBadge
) {
    float hw = TILE_WIDTH * 0.5f - 4.0f;
    float hh = TILE_HEIGHT * 0.5f - 2.0f;
    uint32_t compCol = rgb(comp ? comp->colorHex : 0x0284c7u);
    uint32_t accCol = rgb(comp ? comp->accentColorHex : 0x38bdf8u);
    std::string_view ticker = comp && !comp->ticker.empty() ? std::string_view(comp->ticker) : std::string_view("CORP");
    float lvlExtra = static_cast<float>(std::max(0, fac.level - 1));

    switch (fac.type) {
    case FacilityType::StoreConvenience: {
        float bH = 26.0f + lvlExtra * 4.0f;
        float w = hw * 0.92f, d = hh * 0.92f;
        draw_iso_box(gfx, px, py, w, d, bH, rgb(0x1e293b), rgb(0x334155), rgb(0x475569));
        draw_iso_wall_quad(gfx, px, py, w, d, true, 0.14f, 0.86f, 2.0f, 10.0f, rgb(0xfef08a));
        draw_iso_wall_quad(gfx, px, py, w, d, false, 0.16f, 0.56f, 1.0f, 10.0f, rgb(0xbae6fd));
        draw_iso_wall_quad(gfx, px, py, w, d, true, 0.08f, 0.92f, 11.0f, 16.0f, rgb(0x10b981), rgb(0x065f46));
        draw_iso_wall_quad(gfx, px, py, w, d, false, 0.08f, 0.92f, 11.0f, 15.0f, compCol);
        draw_iso_box(gfx, px - 2.0f, py - bH - 1.0f, 7.0f, 3.5f, 4.0f, rgb(0x475569), rgb(0x64748b), rgb(0x94a3b8));
        if (showBadge) draw_ticker_badge(gfx, px, py - bH - 19.0f, ticker, compCol);
        return bH + 12.0f;
    }
    case FacilityType::StoreElectronics: {
        float bH = 36.0f + lvlExtra * 5.0f;
        float w = hw * 0.94f, d = hh * 0.94f;
        draw_iso_box(gfx, px, py, w, d, bH, rgb(0x0f172a), rgb(0x1e293b), rgb(0x0c4a6e));
        draw_iso_wall_quad(gfx, px, py, w, d, true, 0.12f, 0.88f, 3.0f, 13.0f, rgb(0x38bdf8));
        draw_iso_wall_quad(gfx, px, py, w, d, false, 0.12f, 0.88f, 3.0f, 13.0f, rgb(0x0ea5e9));
        draw_iso_wall_quad(gfx, px, py, w, d, true, 0.10f, 0.90f, 18.0f, 25.0f, rgb(0x0284c7));
        draw_iso_wall_quad(gfx, px, py, w, d, false, 0.10f, 0.90f, 18.0f, 25.0f, rgb(0x38bdf8));
        draw_iso_box(gfx, px, py - bH, hw * 0.52f, hh * 0.52f, 6.0f, rgb(0x0284c7), rgb(0x0369a1), rgb(0x38bdf8));
        if (showBadge) draw_ticker_badge(gfx, px, py - bH - 20.0f, ticker, compCol);
        return bH + 14.0f;
    }
    case FacilityType::StoreDepartment: {
        float h1 = 22.0f + lvlExtra * 3.0f;
        float h2 = 18.0f + lvlExtra * 3.0f;
        float totH = h1 + h2;
        draw_iso_box(gfx, px, py, hw, hh, h1, rgb(0x1e1b4b), rgb(0x312e81), rgb(0x4338ca));
        draw_iso_wall_quad(gfx, px, py, hw, hh, true, 0.10f, 0.90f, 2.0f, 11.0f, rgb(0xc7d2fe));
        draw_iso_wall_quad(gfx, px, py, hw, hh, false, 0.10f, 0.90f, 2.0f, 11.0f, rgb(0xa5b4fc));
        draw_iso_box(gfx, px, py - h1, hw * 0.72f, hh * 0.72f, h2, rgb(0x312e81), rgb(0x3730a3), rgb(0x4f46e5));
        draw_iso_wall_quad(gfx, px, py - h1, hw * 0.72f, hh * 0.72f, true, 0.15f, 0.85f, 3.0f, 11.0f, rgb(0xe0e7ff));
        gfx.draw_top_dome_arc(px, py - totH - 1.0f, 10.0f, 5.0f, rgb(0xa5b4fc), rgb(0xe0e7ff), 0.8f);
        if (showBadge) draw_ticker_badge(gfx, px, py - totH - 19.0f, ticker, compCol);
        return totH + 12.0f;
    }
    case FacilityType::StoreAuto: {
        float bH = 28.0f + lvlExtra * 4.0f;
        float w = hw * 0.96f, d = hh * 0.96f;
        draw_iso_box(gfx, px, py, w, d, bH, rgb(0x0c4a6e), rgb(0x0369a1), rgb(0xcbd5e1));
        draw_iso_wall_quad(gfx, px, py, w, d, true, 0.10f, 0.90f, 2.0f, bH - 6.0f, rgb(0xbae6fd), rgb(0x0284c7));
        draw_iso_wall_quad(gfx, px, py, w, d, false, 0.10f, 0.90f, 2.0f, bH - 6.0f, rgb(0xe0f2fe), rgb(0x0284c7));
        gfx.draw_cylinder(px, py - bH - 1.0f, 9.0f, 4.5f, 3.0f, rgb(0x1e293b), rgb(0x38bdf8));
        draw_iso_box(gfx, px, py - bH - 4.0f, 6.0f, 3.0f, 4.0f, rgb(0x0f172a), accCol, rgb(0xf8fafc));
        if (showBadge) draw_ticker_badge(gfx, px, py - bH - 20.0f, ticker, compCol);
        return bH + 14.0f;
    }
    case FacilityType::StorePharmacy: {
        float bH = 28.0f + lvlExtra * 4.0f;
        float w = hw * 0.92f, d = hh * 0.92f;
        draw_iso_box(gfx, px, py, w, d, bH, rgb(0xcbd5e1), rgb(0xe2e8f0), rgb(0xf8fafc));
        draw_iso_wall_quad(gfx, px, py, w, d, true, 0.14f, 0.86f, 2.0f, 11.0f, rgb(0xa7f3d0), rgb(0x059669));
        draw_iso_wall_quad(gfx, px, py, w, d, false, 0.14f, 0.86f, 2.0f, 11.0f, rgb(0xd1fae5), rgb(0x059669));
        draw_iso_wall_quad(gfx, px, py, w, d, true, 0.06f, 0.94f, 13.0f, 19.0f, rgb(0x059669));
        draw_iso_wall_quad(gfx, px, py, w, d, false, 0.06f, 0.94f, 13.0f, 19.0f, rgb(0x10b981));
        float crossY = py - bH - 6.0f;
        gfx.fill_rect(px - 6.0f, crossY - 3.0f, 12.0f, 6.0f, rgb(0x059669));
        gfx.fill_rect(px - 1.4f, crossY - 2.0f, 2.8f, 4.2f, 0xFFFFFFFFu);
        gfx.fill_rect(px - 3.0f, crossY - 0.9f, 6.0f, 1.8f, 0xFFFFFFFFu);
        if (showBadge) draw_ticker_badge(gfx, px, crossY - 16.0f, ticker, compCol);
        return bH + 14.0f;
    }
    case FacilityType::ApartmentComplex: {
        float podH = 12.0f;
        float shaftH = 38.0f + lvlExtra * 6.0f;
        float totH = podH + shaftH;
        float sw = hw * 0.82f, sd = hh * 0.82f;
        draw_iso_box(gfx, px, py, hw * 0.96f, hh * 0.96f, podH, rgb(0x334155), rgb(0x475569), rgb(0x64748b));
        draw_iso_box(gfx, px, py - podH, sw, sd, shaftH, rgb(0x1e293b), rgb(0x334155), rgb(0x10b981));
        int floors = static_cast<int>(shaftH / 8.0f);
        for (int f = 0; f < floors; ++f) {
            float z0 = 3.0f + static_cast<float>(f) * 7.5f;
            float z1 = z0 + 3.5f;
            draw_iso_wall_quad(gfx, px, py - podH, sw, sd, true, 0.14f, 0.45f, z0, z1, rgb(0xfde68a));
            draw_iso_wall_quad(gfx, px, py - podH, sw, sd, true, 0.55f, 0.86f, z0, z1, rgb(0xfcd34d));
            draw_iso_wall_quad(gfx, px, py - podH, sw, sd, false, 0.14f, 0.45f, z0, z1, rgb(0xfef08a));
            draw_iso_wall_quad(gfx, px, py - podH, sw, sd, false, 0.55f, 0.86f, z0, z1, rgb(0xfde047));
        }
        draw_iso_box(gfx, px, py - totH - 1.0f, hw * 0.45f, hh * 0.45f, 6.0f, rgb(0x065f46), rgb(0x047857), rgb(0x34d399));
        if (showBadge) draw_ticker_badge(gfx, px, py - totH - 20.0f, ticker, compCol);
        return totH + 14.0f;
    }
    case FacilityType::CommercialTower: {
        float podH = 14.0f;
        float shaftH = 48.0f + lvlExtra * 7.0f;
        float crownH = 10.0f;
        float totH = podH + shaftH + crownH;
        float sw = hw * 0.82f, sd = hh * 0.82f;
        draw_iso_box(gfx, px, py, hw * 0.98f, hh * 0.98f, podH, rgb(0x0f172a), rgb(0x1e293b), rgb(0x38bdf8));
        draw_iso_box(gfx, px, py - podH, sw, sd, shaftH, rgb(0x0c4a6e), rgb(0x0369a1), rgb(0x0ea5e9));
        int floors = static_cast<int>(shaftH / 9.0f);
        for (int f = 0; f < floors; ++f) {
            float z0 = 3.0f + static_cast<float>(f) * 8.5f;
            float z1 = z0 + 4.5f;
            draw_iso_wall_quad(gfx, px, py - podH, sw, sd, true, 0.12f, 0.88f, z0, z1, rgb(0x7dd3fc));
            draw_iso_wall_quad(gfx, px, py - podH, sw, sd, false, 0.12f, 0.88f, z0, z1, rgb(0xbae6fd));
        }
        draw_iso_box(gfx, px, py - podH - shaftH, hw * 0.55f, hh * 0.55f, crownH, rgb(0x0284c7), rgb(0x38bdf8), rgb(0xe0f2fe));
        if (showBadge) draw_ticker_badge(gfx, px, py - totH - 15.0f, ticker, compCol);
        return totH + 14.0f;
    }
    case FacilityType::CivicHousing: {
        float bH = 25.0f + lvlExtra * 3.0f;
        draw_iso_box(gfx, px - 5.0f, py - 2.0f, hw * 0.58f, hh * 0.58f, bH, rgb(0x7c2d12), rgb(0x9a3412), rgb(0xd97706));
        draw_iso_box(gfx, px + 6.0f, py + 2.0f, hw * 0.54f, hh * 0.54f, bH - 4.0f, rgb(0x9a3412), rgb(0xc2410c), rgb(0xf59e0b));
        draw_iso_wall_quad(gfx, px - 5.0f, py - 2.0f, hw * 0.58f, hh * 0.58f, true, 0.18f, 0.82f, 5.0f, 10.0f, rgb(0xfef3c7));
        draw_iso_wall_quad(gfx, px - 5.0f, py - 2.0f, hw * 0.58f, hh * 0.58f, true, 0.18f, 0.82f, 14.0f, 19.0f, rgb(0xfde68a));
        draw_iso_wall_quad(gfx, px + 6.0f, py + 2.0f, hw * 0.54f, hh * 0.54f, false, 0.18f, 0.82f, 5.0f, 10.0f, rgb(0xfef3c7));
        draw_iso_wall_quad(gfx, px + 6.0f, py + 2.0f, hw * 0.54f, hh * 0.54f, false, 0.18f, 0.82f, 13.0f, 18.0f, rgb(0xfde68a));
        if (showBadge) draw_ticker_badge(gfx, px, py - bH - 17.0f, "PEMKOT", rgb(0x0f766e));
        return bH + 12.0f;
    }
    case FacilityType::PowerPlantGreen: {
        float bH = 16.0f + lvlExtra * 3.0f;
        draw_iso_box(gfx, px - 4.0f, py - 1.0f, hw * 0.65f, hh * 0.65f, bH, rgb(0x064e3b), rgb(0x047857), rgb(0x1e3a8a));
        gfx.draw_line(px - 10.0f, py - bH - 2.0f, px + 2.0f, py - bH + 4.0f, rgb(0x38bdf8), 0.8f);
        gfx.draw_line(px - 6.0f, py - bH - 5.0f, px + 6.0f, py - bH + 1.0f, rgb(0x38bdf8), 0.8f);
        gfx.draw_cylinder(px + 11.0f, py - 1.0f, 4.5f, 2.5f, bH + 6.0f, rgb(0xe2e8f0), rgb(0x34d399));
        gfx.draw_cylinder(px + 11.0f, py + 6.0f, 4.5f, 2.5f, bH + 4.0f, rgb(0xcbd5e1), rgb(0x10b981));
        if (showBadge) draw_ticker_badge(gfx, px, py - bH - 20.0f, ticker, compCol);
        return bH + 14.0f;
    }
    case FacilityType::FactoryProcessing: {
        float bH = 30.0f + lvlExtra * 4.0f;
        draw_iso_box(gfx, px + 3.0f, py, hw * 0.78f, hh * 0.78f, bH, rgb(0x18181b), rgb(0x27272a), rgb(0x3f3f46));
        draw_iso_wall_quad(gfx, px + 3.0f, py, hw * 0.78f, hh * 0.78f, false, 0.25f, 0.75f, 1.0f, 11.0f, rgb(0xf59e0b), rgb(0x78350f));
        gfx.draw_cylinder(px - hw * 0.56f, py - 2.0f, 5.0f, 2.8f, 22.0f, rgb(0x52525b), rgb(0xa1a1aa));
        gfx.draw_cylinder(px - hw * 0.34f, py + 4.0f, 5.0f, 2.8f, 20.0f, rgb(0x3f3f46), rgb(0x71717a));
        float stackX = px + hw * 0.38f;
        float stackBaseY = py - bH - 1.0f;
        float stackH = 16.0f;
        gfx.draw_cylinder(stackX, stackBaseY, 3.0f, 1.8f, stackH, rgb(0x52525b), rgb(0xef4444));
        if (emitSmokeNow) {
            float jitter = static_cast<float>(((fac.tileX * 7 + static_cast<int>(std::round(animTime_ * 3.0))) % 5) - 2);
            emit_smoke_at_screen(stackX, stackBaseY - stackH, jitter);
        }
        if (showBadge) draw_ticker_badge(gfx, px, py - bH - stackH - 12.0f, ticker, compCol);
        return bH + stackH + 6.0f;
    }
    case FacilityType::FactoryAssembly: {
        float bH = 32.0f + lvlExtra * 4.0f;
        float w = hw * 0.94f, d = hh * 0.94f;
        draw_iso_box(gfx, px, py, w, d, bH, rgb(0x0f172a), rgb(0x1e3a5f), rgb(0x1d4ed8));
        draw_iso_wall_quad(gfx, px, py, w, d, true, 0.14f, 0.86f, 15.0f, 22.0f, rgb(0x60a5fa));
        draw_iso_wall_quad(gfx, px, py, w, d, false, 0.16f, 0.44f, 1.0f, 11.0f, rgb(0x3b82f6));
        draw_iso_wall_quad(gfx, px, py, w, d, false, 0.56f, 0.84f, 1.0f, 11.0f, rgb(0xf97316));
        for (int i = -1; i <= 1; ++i) {
            float rx = px + static_cast<float>(i) * 7.0f;
            float ry = py - bH - static_cast<float>(std::abs(i)) * 2.0f;
            draw_iso_box(gfx, rx, ry, 5.0f, 6.0f, 7.0f, rgb(0x1e40af), rgb(0x2563eb), rgb(0x93c5fd));
        }
        if (showBadge) draw_ticker_badge(gfx, px, py - bH - 20.0f, ticker, compCol);
        return bH + 14.0f;
    }
    case FacilityType::WarehouseLogistics: {
        float bH = 20.0f + lvlExtra * 3.0f;
        float w = hw * 0.88f, d = hh * 0.88f;
        draw_iso_box(gfx, px - 2.0f, py - 1.0f, w, d, bH, rgb(0x334155), rgb(0x475569), rgb(0x64748b));
        draw_iso_wall_quad(gfx, px - 2.0f, py - 1.0f, w, d, false, 0.12f, 0.34f, 1.0f, 9.0f, rgb(0x0f172a), rgb(0xf59e0b));
        draw_iso_wall_quad(gfx, px - 2.0f, py - 1.0f, w, d, false, 0.40f, 0.62f, 1.0f, 9.0f, rgb(0x0f172a), rgb(0xf59e0b));
        draw_iso_wall_quad(gfx, px - 2.0f, py - 1.0f, w, d, false, 0.68f, 0.90f, 1.0f, 9.0f, rgb(0x0f172a), rgb(0xf59e0b));
        for (int i = -1; i <= 1; ++i) {
            float fi = static_cast<float>(i);
            gfx.draw_line(
                px - 10.0f + fi * 6.0f, py - bH - 3.0f + fi * 3.0f,
                px + 4.0f + fi * 6.0f, py - bH - 10.0f + fi * 3.0f,
                rgb(0x94a3b8), 1.0f);
        }
        draw_iso_box(gfx, px + 11.0f, py + 5.0f, 6.0f, 3.0f, 5.0f, rgb(0x0369a1), rgb(0x0284c7), rgb(0x38bdf8));
        if (showBadge) draw_ticker_badge(gfx, px, py - bH - 19.0f, ticker, compCol);
        return bH + 12.0f;
    }
    case FacilityType::FarmAgriculture: {
        float bH = 19.0f + lvlExtra * 3.0f;
        for (int r = -1; r <= 2; ++r) {
            float fr = static_cast<float>(r);
            gfx.draw_line(px - 16.0f + fr * 4.0f, py + 2.0f + fr * 2.0f,
                          px - 4.0f + fr * 4.0f, py + 8.0f + fr * 2.0f, rgb(0x84cc16), 1.4f);
        }
        draw_iso_box(gfx, px - 3.0f, py - 2.0f, hw * 0.58f, hh * 0.58f, bH, rgb(0x991b1b), rgb(0xb91c1c), rgb(0xdc2626));
        draw_iso_wall_quad(gfx, px - 3.0f, py - 2.0f, hw * 0.58f, hh * 0.58f, false, 0.30f, 0.70f, 1.0f, 9.0f, rgb(0xfef2f2), rgb(0x7f1d1d));
        gfx.draw_cylinder(px + 11.0f, py - 2.0f, 4.5f, 2.4f, bH + 6.0f, rgb(0x94a3b8), rgb(0xe2e8f0));
        float wmX = px + hw * 0.58f;
        float wmBaseY = py + 3.0f;
        float wmTopY = wmBaseY - 26.0f;
        gfx.draw_line(wmX, wmBaseY, wmX, wmTopY, rgb(0xcbd5e1), 1.6f);
        double rot = animTime_ * 2.4;
        for (int b = 0; b < 4; ++b) {
            double a = rot + (static_cast<double>(b) * 3.14159265358979323846) * 0.5;
            gfx.draw_line(wmX, wmTopY,
                          wmX + static_cast<float>(std::cos(a) * 6.5),
                          wmTopY + static_cast<float>(std::sin(a) * 6.5),
                          rgb(0xf8fafc), 1.3f);
        }
        if (showBadge) draw_ticker_badge(gfx, px, py - std::max(bH + 25.0f, 44.0f), ticker, compCol);
        return std::max(bH + 16.0f, 34.0f);
    }
    case FacilityType::MineExtraction: {
        float bH = 22.0f + lvlExtra * 3.0f;
        caplab::gfx::Point2F pitPts[4] = {
            {px, py - hh * 0.75f},
            {px + hw * 0.75f, py},
            {px, py + hh * 0.75f},
            {px - hw * 0.75f, py},
        };
        gfx.fill_polygon(pitPts, 4, rgb(0x18181b));
        gfx.stroke_polygon(pitPts, 4, rgb(0x71717a), 1.0f);
        draw_iso_box(gfx, px - 5.0f, py - 1.0f, hw * 0.56f, hh * 0.56f, bH, rgb(0x27272a), rgb(0x3f3f46), rgb(0x52525b));
        float rigTopY = py - bH - 16.0f;
        gfx.draw_line(px - 10.0f, py - bH, px - 5.0f, rigTopY, rgb(0xd4d4d8), 1.4f);
        gfx.draw_line(px - 5.0f, rigTopY, px, py - bH, rgb(0xd4d4d8), 1.4f);
        gfx.draw_line(px - 8.0f, py - bH - 8.0f, px - 2.0f, py - bH - 8.0f, rgb(0xd4d4d8), 1.4f);
        gfx.fill_circle(px - 5.0f, rigTopY, 3.0f, rgb(0xfbbf24));
        gfx.draw_cylinder(px + 11.0f, py + 2.0f, 4.0f, 2.2f, 10.0f, rgb(0xb45309), rgb(0xf59e0b));
        if (showBadge) draw_ticker_badge(gfx, px, rigTopY - 13.0f, ticker, compCol);
        return bH + 20.0f;
    }
    case FacilityType::TechSoftware: {
        float bH = 34.0f + lvlExtra * 5.0f;
        float w = hw * 0.92f, d = hh * 0.92f;
        draw_iso_box(gfx, px, py, w, d, bH, rgb(0x064e3b), rgb(0x047857), rgb(0x059669));
        draw_iso_wall_quad(gfx, px, py, w, d, true, 0.14f, 0.86f, 6.0f, 12.0f, rgb(0x34d399));
        draw_iso_wall_quad(gfx, px, py, w, d, true, 0.14f, 0.86f, 17.0f, 23.0f, rgb(0x6ee7b7));
        draw_iso_wall_quad(gfx, px, py, w, d, false, 0.14f, 0.86f, 6.0f, 12.0f, rgb(0x2dd4bf));
        draw_iso_wall_quad(gfx, px, py, w, d, false, 0.14f, 0.86f, 17.0f, 23.0f, rgb(0x5eead4));
        draw_iso_box(gfx, px - 2.0f, py - bH - 1.0f, hw * 0.55f, hh * 0.55f, 10.0f, rgb(0x022c22), rgb(0x065f46), rgb(0x10b981));
        if (showBadge) draw_ticker_badge(gfx, px, py - bH - 22.0f, ticker, compCol);
        return bH + 16.0f;
    }
    case FacilityType::MediaTelecom: {
        float bH = 28.0f + lvlExtra * 4.0f;
        draw_iso_box(gfx, px, py, hw * 0.84f, hh * 0.84f, bH, rgb(0x4c1d95), rgb(0x5b21b6), rgb(0x6d28d9));
        draw_iso_wall_quad(gfx, px, py, hw * 0.84f, hh * 0.84f, true, 0.15f, 0.85f, 6.0f, 14.0f, rgb(0xc4b5fd));
        draw_iso_wall_quad(gfx, px, py, hw * 0.84f, hh * 0.84f, false, 0.15f, 0.85f, 6.0f, 14.0f, rgb(0xddd6fe));
        float mastBase = py - bH - 2.0f;
        float mastTop = mastBase - 26.0f;
        gfx.draw_line(px - 5.0f, mastBase, px, mastTop, rgb(0xe2e8f0), 1.5f);
        gfx.draw_line(px, mastTop, px + 5.0f, mastBase, rgb(0xe2e8f0), 1.5f);
        gfx.draw_line(px - 3.0f, mastBase - 10.0f, px + 3.0f, mastBase - 10.0f, rgb(0xe2e8f0), 1.5f);
        float pulse = static_cast<float>(std::fmod(animTime_ * 1.4, 1.0));
        gfx.draw_circle(px, mastTop, 2.5f + pulse * 8.0f, caplab::gfx::rgb_alpha(0xc4b5fd, 1.0f - pulse), 1.2f);
        if (showBadge) draw_ticker_badge(gfx, px, mastTop - 16.0f, ticker, compCol);
        return bH + 30.0f;
    }
    case FacilityType::RdCenter: {
        float baseH = 22.0f + lvlExtra * 4.0f;
        draw_iso_box(gfx, px, py, hw * 0.94f, hh * 0.94f, baseH, rgb(0x082f49), rgb(0x0369a1), rgb(0x0284c7));
        draw_iso_wall_quad(gfx, px, py, hw * 0.94f, hh * 0.94f, true, 0.14f, 0.86f, 5.0f, 13.0f, rgb(0xbae6fd));
        draw_iso_wall_quad(gfx, px, py, hw * 0.94f, hh * 0.94f, false, 0.14f, 0.86f, 5.0f, 13.0f, rgb(0x7dd3fc));
        float roofY = py - baseH - 1.0f;
        gfx.fill_ellipse(px, roofY, 12.0f, 6.0f, rgb(0x0c4a6e));
        gfx.draw_ellipse(px, roofY, 12.0f, 6.0f, rgb(0x7dd3fc), 1.0f);
        gfx.draw_top_dome_arc(px, roofY, 10.0f, 10.0f, rgb(0x38bdf8), rgb(0xe0f2fe), 1.0f);
        if (showBadge) draw_ticker_badge(gfx, px, roofY - 21.0f, ticker, compCol);
        return baseH + 14.0f;
    }
    case FacilityType::CorporateHq:
    default: {
        float podiumH = 18.0f;
        float shaftH = 44.0f + lvlExtra * 7.0f;
        float totH = podiumH + shaftH;
        draw_iso_box(gfx, px, py, hw * 0.98f, hh * 0.98f, podiumH, rgb(0x0f172a), rgb(0x1e293b), rgb(0x334155));
        draw_iso_box(gfx, px, py - podiumH, hw * 0.78f, hh * 0.78f, shaftH, rgb(0x0f172a), rgb(0x1e293b), rgb(0x475569));
        int floors = static_cast<int>(shaftH / 10.0f);
        for (int f = 0; f < floors; ++f) {
            float z0 = 4.0f + static_cast<float>(f) * 9.0f;
            float z1 = z0 + 4.0f;
            draw_iso_wall_quad(gfx, px, py - podiumH, hw * 0.78f, hh * 0.78f, true, 0.14f, 0.86f, z0, z1, rgb(0x67e8f9));
            draw_iso_wall_quad(gfx, px, py - podiumH, hw * 0.78f, hh * 0.78f, false, 0.14f, 0.86f, z0, z1, rgb(0xa5f3fc));
        }
        float roofTop = py - totH - 1.0f;
        gfx.fill_ellipse(px, roofTop, 9.0f, 4.5f, rgb(0x0f172a));
        gfx.draw_ellipse(px, roofTop, 9.0f, 4.5f, accCol, 1.4f);
        float spireTop = roofTop - 16.0f;
        gfx.draw_line(px, roofTop, px, spireTop, rgb(0xcbd5e1), 1.5f);
        if (std::sin(animTime_ * 4.0) > 0.0) {
            gfx.fill_circle(px, spireTop, 2.3f, rgb(0xef4444));
        }
        if (showBadge) draw_ticker_badge(gfx, px, spireTop - 14.0f, ticker, compCol);
        return totH + 20.0f;
    }
    }
}

void IsometricEngine::draw_seaport_harbor(
    caplab::gfx::D2DRenderer& gfx, bool showBadge,
    float viewMinX, float viewMaxX, float viewMinY, float viewMaxY
) const {
    int portCoord = std::max(12, gridSize_ - 3);
    float sx = 0.0f;
    float sy = static_cast<float>(portCoord + portCoord) * (TILE_HEIGHT * 0.5f);
    if (sx < viewMinX || sx > viewMaxX || sy < viewMinY || sy > viewMaxY) return;

    draw_iso_box(gfx, sx, sy, 22.0f, 11.0f, 5.0f, rgb(0x334155), rgb(0x475569), rgb(0x64748b));
    draw_iso_box(gfx, sx - 8.0f, sy - 5.0f, 7.0f, 3.5f, 5.0f, rgb(0xbe123c), rgb(0xe11d48), rgb(0xfb7185));
    draw_iso_box(gfx, sx + 7.0f, sy - 5.0f, 7.0f, 3.5f, 5.0f, rgb(0x0369a1), rgb(0x0284c7), rgb(0x38bdf8));
    gfx.draw_line(sx - 10.0f, sy - 6.0f, sx - 10.0f, sy - 26.0f, rgb(0xf59e0b), 2.0f);
    gfx.draw_line(sx - 10.0f, sy - 26.0f, sx + 14.0f, sy - 26.0f, rgb(0xf59e0b), 2.0f);
    gfx.draw_line(sx - 10.0f, sy - 20.0f, sx + 2.0f, sy - 26.0f, rgb(0xf59e0b), 2.0f);
    if (showBadge) {
        draw_ticker_badge(gfx, sx, sy - 38.0f, "PORT", rgb(0x0f766e));
    }
}

void IsometricEngine::update_and_draw_vehicles(
    caplab::gfx::D2DRenderer& gfx, float dt,
    float viewMinX, float viewMaxX, float viewMinY, float viewMaxY
) {
    float maxCoord = static_cast<float>(gridSize_ - 2);
    float halfW = TILE_WIDTH * 0.5f;
    float halfH = TILE_HEIGHT * 0.5f;

    for (auto& v : vehicles_) {
        if (v.axis == 'x') {
            v.x += v.dir * v.speed * dt;
            if (v.x >= maxCoord) v.dir = -1.0f;
            else if (v.x <= 1.0f) v.dir = 1.0f;
            v.y = v.laneCoord;
        } else {
            v.y += v.dir * v.speed * dt;
            if (v.y >= maxCoord) v.dir = -1.0f;
            else if (v.y <= 1.0f) v.dir = 1.0f;
            v.x = v.laneCoord;
        }

        float sx = (v.x - v.y) * halfW;
        float sy = (v.x + v.y) * halfH;
        if (sx < viewMinX || sx > viewMaxX || sy < viewMinY || sy > viewMaxY) continue;
        gfx.fill_circle(sx, sy - 2.5f, 2.3f, v.argb);
    }
}

void IsometricEngine::update_and_draw_particles(caplab::gfx::D2DRenderer& gfx, float dt) {
    if (activeParticleCount_ == 0) return;

    for (auto& p : particlePool_) {
        if (!p.active) continue;
        p.y += p.vy * dt;
        p.alpha -= dt * 0.9f;
        if (p.alpha <= 0.0f) {
            p.active = false;
            activeParticleCount_ = std::max(0, activeParticleCount_ - 1);
            continue;
        }

        uint32_t col = caplab::gfx::rgb_alpha(p.argb, p.alpha);
        if (p.isSmoke) {
            gfx.fill_circle(p.x, p.y, p.size, col);
        } else if (!p.text.empty()) {
            gfx.draw_text(
                p.text,
                {p.x - 42.0f, p.y - 8.0f, 84.0f, 16.0f},
                col,
                caplab::gfx::FontStyle::Mono10,
                caplab::gfx::TextAlign::Center,
                caplab::gfx::TextVAlign::Middle,
                false,
                false);
        }
    }
}

void IsometricEngine::update_and_render(
    caplab::gfx::D2DRenderer& gfx,
    const caplab::SimulationState& state,
    double dtSeconds,
    const IsometricRenderOptions& options
) {
    float dt = static_cast<float>(std::min(dtSeconds, 0.09));
    animTime_ += static_cast<double>(dt) * 1.5;
    smokeTimer_ += static_cast<double>(dt);

    int detectedSize = static_cast<int>(std::round(std::sqrt(static_cast<double>(state.mapParcels.size()))));
    if (detectedSize <= 0) detectedSize = 32;
    if (detectedSize != gridSize_) {
        gridSize_ = detectedSize;
        bakedGridSize_ = 0;
    }

    size_t total = static_cast<size_t>(gridSize_ * gridSize_);
    if (parcelGrid_.size() != total) parcelGrid_.assign(total, nullptr);
    else std::fill(parcelGrid_.begin(), parcelGrid_.end(), nullptr);

    for (const auto& p : state.mapParcels) {
        if (p.x >= 0 && p.x < gridSize_ && p.y >= 0 && p.y < gridSize_) {
            parcelGrid_[static_cast<size_t>(p.y * gridSize_ + p.x)] = &p;
        }
    }

    if ((bakedGridSize_ != gridSize_ || !gfx.has_baked_ground()) && !state.mapParcels.empty()) {
        bake_static_ground(gfx, state.mapParcels);
    }

    if (!isDragging_) {
        if (std::abs(camera_.velX) > 0.1f || std::abs(camera_.velY) > 0.1f) {
            camera_.targetX += camera_.velX;
            camera_.targetY += camera_.velY;
            float friction = std::pow(0.92f, dt * 60.0f);
            camera_.velX *= friction;
            camera_.velY *= friction;
            clamp_camera();
        }
        float lerp = 1.0f - std::pow(0.001f, dt);
        camera_.x += (camera_.targetX - camera_.x) * lerp;
        camera_.y += (camera_.targetY - camera_.y) * lerp;
    }
    float zoomLerp = 1.0f - std::pow(0.0005f, dt);
    camera_.zoom += (camera_.targetZoom - camera_.zoom) * zoomLerp;

    gfx.push_clip({viewX_, viewY_, viewWidth_, viewHeight_});
    gfx.fill_rect(viewX_, viewY_, viewWidth_, viewHeight_, rgb(0x0b1120));

    gfx.push_transform(viewX_ + camera_.x, viewY_ + camera_.y, camera_.zoom, camera_.zoom);

    if (gfx.has_baked_ground()) {
        gfx.draw_baked_ground(-groundOriginX_, -groundOriginY_);
    }

    float invZ = 1.0f / std::max(0.01f, camera_.zoom);
    float viewMinX = -camera_.x * invZ - 110.0f;
    float viewMaxX = (viewWidth_ - camera_.x) * invZ + 110.0f;
    float viewMinY = -camera_.y * invZ - 130.0f;
    float viewMaxY = (viewHeight_ - camera_.y) * invZ + 160.0f;

    uint8_t waterBlue = static_cast<uint8_t>(std::clamp<int>(static_cast<int>(std::round(136.0 + std::sin(animTime_) * 12.0)), 90, 200));
    uint32_t waterFill = caplab::gfx::rgba(14, 72, waterBlue, 255);
    uint32_t waterStroke = caplab::gfx::rgb_alpha(0x7dd3fc, 0.25f);

    bool emitSmokeNow = smokeTimer_ >= 0.45;
    if (emitSmokeNow) smokeTimer_ = 0.0;

    buildingHitboxes_.clear();
    float halfW = TILE_WIDTH * 0.5f;
    float halfH = TILE_HEIGHT * 0.5f;
    int maxSum = (gridSize_ - 1) * 2;
    int selX = selectedTile_ ? selectedTile_->x : -1;
    int selY = selectedTile_ ? selectedTile_->y : -1;
    int hiX = highlightTile_ ? highlightTile_->x : -1;
    int hiY = highlightTile_ ? highlightTile_->y : -1;

    for (int sum = 0; sum <= maxSum; ++sum) {
        int xStart = std::max(0, sum - (gridSize_ - 1));
        int xEnd = std::min(gridSize_ - 1, sum);

        for (int x = xStart; x <= xEnd; ++x) {
            int y = sum - x;
            const MapParcel* parcel = parcelGrid_[static_cast<size_t>(y * gridSize_ + x)];
            if (!parcel) continue;

            float px = static_cast<float>(x - y) * halfW;
            float py = static_cast<float>(x + y) * halfH;
            if (px < viewMinX || px > viewMaxX || py < viewMinY || py > viewMaxY) continue;

            if (parcel->terrainType == TerrainType::Water) {
                draw_water_tile(gfx, px, py, waterFill, waterStroke);
            } else if (options.showTrafficOverlay && parcel->terrainType != TerrainType::Road) {
                draw_traffic_heat_tile(gfx, px, py, parcel->trafficIndex);
            }

            if (x == selX && y == selY) {
                draw_tile_highlight(gfx, px, py, rgb(0x38bdf8), 2.4f, true);
            } else if (x == hiX && y == hiY) {
                draw_tile_highlight(gfx, px, py, rgb(0x94a3b8), 1.2f, false);
            }

            if (!parcel->facilityId.empty()) {
                auto facIt = state.facilities.find(parcel->facilityId);
                if (facIt != state.facilities.end()) {
                    const Facility& fac = facIt->second;
                    auto compIt = state.companies.find(fac.companyId);
                    const Company* comp = (compIt != state.companies.end()) ? &compIt->second : nullptr;
                    bool drawBadge = options.showBadges &&
                                     (options.focusCompanyId.empty() || fac.companyId == options.focusCompanyId);
                    float bHeight = draw_diverse_facility(gfx, px, py, fac, comp, emitSmokeNow, drawBadge);

                    if (!options.focusCompanyId.empty() && fac.companyId != options.focusCompanyId) {
                        // Subtle translucent dim veil on non-focused buildings in Direct2D
                        caplab::gfx::Point2F dimDiamond[4] = {
                            {px, py - halfH},
                            {px + halfW, py},
                            {px, py + halfH},
                            {px - halfW, py},
                        };
                        gfx.fill_polygon(dimDiamond, 4, caplab::gfx::rgb_alpha(0x0b1120, 0.35f));
                    }

                    buildingHitboxes_.push_back({
                        x, y,
                        px - (halfW - 2.0f),
                        px + (halfW - 2.0f),
                        py - bHeight - TILE_HEIGHT * 0.55f,
                        py + TILE_HEIGHT * 0.45f
                    });
                }
            }
        }
    }

    draw_seaport_harbor(gfx, options.showBadges, viewMinX, viewMaxX, viewMinY, viewMaxY);
    update_and_draw_vehicles(gfx, dt, viewMinX, viewMaxX, viewMinY, viewMaxY);
    update_and_draw_particles(gfx, dt);

    gfx.pop_transform();
    gfx.pop_clip();
}

} // namespace caplab::iso
