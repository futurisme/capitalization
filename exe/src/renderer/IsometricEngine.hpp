#pragma once

#include "../core/Types.hpp"
#include "../graphics/D2DRenderer.hpp"

#include <array>
#include <functional>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace caplab::iso {

struct Camera {
    float x = 0.0f;
    float y = 0.0f;
    float zoom = 1.0f;
    float targetX = 0.0f;
    float targetY = 0.0f;
    float targetZoom = 1.0f;
    float velX = 0.0f;
    float velY = 0.0f;
};

struct PooledParticle {
    bool active = false;
    float x = 0.0f;
    float y = 0.0f;
    float vy = 0.0f;
    float alpha = 0.0f;
    std::string text;
    uint32_t argb = 0xFF34D399;
    float size = 3.0f;
    bool isSmoke = false;
};

struct MiniVehicle {
    float x = 0.0f;
    float y = 0.0f;
    char axis = 'x';
    float laneCoord = 5.0f;
    float dir = 1.0f;
    float speed = 1.5f;
    uint32_t argb = 0xFF38BDF8;
};

struct BuildingHitbox {
    int tileX = 0;
    int tileY = 0;
    float minX = 0.0f;
    float maxX = 0.0f;
    float minY = 0.0f;
    float maxY = 0.0f;
};

struct TileCoord {
    int x = 0;
    int y = 0;
    bool operator==(const TileCoord& o) const noexcept { return x == o.x && y == o.y; }
};

struct IsometricRenderOptions {
    bool showBadges = true;
    std::string focusCompanyId;
    bool showTrafficOverlay = false;
};

class IsometricEngine {
public:
    IsometricEngine();

    void set_viewport(float viewX, float viewY, float width, float height);
    void center_camera_on(int tileX, int tileY, bool smooth = true);
    void set_zoom(float nextZoom);
    float current_zoom() const noexcept { return camera_.targetZoom; }

    void set_selected_tile(std::optional<TileCoord> tile);
    std::optional<TileCoord> selected_tile() const noexcept { return selectedTile_; }

    void add_money_particle(int tileX, int tileY, const std::string& text);
    void invalidate_ground_cache() { bakedGridSize_ = 0; }

    // Pointer interaction inside the viewport region (DIP coordinates relative to window)
    void on_mouse_down(float mx, float my);
    void on_mouse_move(float mx, float my);
    void on_mouse_up(float mx, float my);
    void on_mouse_wheel(float mx, float my, float notches);

    void update_and_render(
        caplab::gfx::D2DRenderer& gfx,
        const caplab::SimulationState& state,
        double dtSeconds,
        const IsometricRenderOptions& options);

    std::function<void(TileCoord)> onTileSelected;

private:
    void setup_vehicles();
    void clamp_camera();
    TileCoord screen_to_tile(float localX, float localY) const;
    void bake_static_ground(caplab::gfx::D2DRenderer& gfx, const std::vector<MapParcel>& parcels);

    void spawn_particle(
        float x, float y, float vy, float alpha, bool isSmoke,
        std::string text, uint32_t argb, float size);
    void emit_smoke_at_screen(float sx, float sy, float jitter);

    void draw_iso_box(
        caplab::gfx::D2DRenderer& gfx,
        float px, float py, float hw, float hh, float h,
        uint32_t leftArgb, uint32_t rightArgb, uint32_t roofArgb) const;
    void draw_iso_wall_quad(
        caplab::gfx::D2DRenderer& gfx,
        float px, float py, float hw, float hh, bool leftSide,
        float u0, float u1, float z0, float z1,
        uint32_t fillArgb, uint32_t strokeArgb = 0) const;
    void draw_ticker_badge(
        caplab::gfx::D2DRenderer& gfx,
        float px, float py, std::string_view text, uint32_t bgArgb) const;

    float draw_diverse_facility(
        caplab::gfx::D2DRenderer& gfx,
        float px, float py,
        const Facility& fac,
        const Company* comp,
        bool emitSmokeNow,
        bool showBadge);

    void draw_static_ground_tile(
        caplab::gfx::D2DRenderer& gfx,
        float px, float py, const MapParcel& parcel) const;
    void draw_water_tile(
        caplab::gfx::D2DRenderer& gfx,
        float px, float py, uint32_t fillArgb, uint32_t strokeArgb) const;
    void draw_traffic_heat_tile(
        caplab::gfx::D2DRenderer& gfx,
        float px, float py, int trafficIndex) const;
    void draw_tile_highlight(
        caplab::gfx::D2DRenderer& gfx,
        float px, float py, uint32_t strokeArgb, float width, bool glow) const;
    void draw_seaport_harbor(
        caplab::gfx::D2DRenderer& gfx, bool showBadge,
        float viewMinX, float viewMaxX, float viewMinY, float viewMaxY) const;
    void update_and_draw_vehicles(
        caplab::gfx::D2DRenderer& gfx, float dt,
        float viewMinX, float viewMaxX, float viewMinY, float viewMaxY);
    void update_and_draw_particles(caplab::gfx::D2DRenderer& gfx, float dt);

    static constexpr float TILE_WIDTH = 64.0f;
    static constexpr float TILE_HEIGHT = 32.0f;

    int gridSize_ = 32;
    Camera camera_{};
    TileCoord centerTargetTile_{16, 16};
    std::optional<TileCoord> selectedTile_;
    std::optional<TileCoord> highlightTile_;

    float viewX_ = 0.0f;
    float viewY_ = 0.0f;
    float viewWidth_ = 1100.0f;
    float viewHeight_ = 760.0f;
    bool hasInitializedCamera_ = false;

    std::array<PooledParticle, 20> particlePool_{};
    size_t poolCursor_ = 0;
    int activeParticleCount_ = 0;

    std::vector<const MapParcel*> parcelGrid_;
    std::vector<BuildingHitbox> buildingHitboxes_;
    std::vector<MiniVehicle> vehicles_;

    double animTime_ = 0.0;
    double smokeTimer_ = 0.0;

    int bakedGridSize_ = 0;
    float groundOriginX_ = 0.0f;
    float groundOriginY_ = 0.0f;

    bool isDragging_ = false;
    float dragStartX_ = 0.0f;
    float dragStartY_ = 0.0f;
    float lastPointerX_ = 0.0f;
    float lastPointerY_ = 0.0f;
    float camStartX_ = 0.0f;
    float camStartY_ = 0.0f;
    bool hasMovedSignificantly_ = false;
};

} // namespace caplab::iso
