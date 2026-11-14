#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <d2d1_1.h>
#include <d2d1_1helper.h>
#include <d3d11_1.h>
#include <dwrite.h>
#include <dxgi1_6.h>

#if !defined(__has_include) || __has_include(<wrl/client.h>)
#include <wrl/client.h>
#else
#include <utility>
namespace Microsoft::WRL {
template <typename T>
class ComPtr {
public:
    ComPtr() noexcept = default;
    ComPtr(std::nullptr_t) noexcept {}
    ComPtr(const ComPtr& other) noexcept : ptr_(other.ptr_) { if (ptr_) ptr_->AddRef(); }
    ComPtr(ComPtr&& other) noexcept : ptr_(other.ptr_) { other.ptr_ = nullptr; }
    ~ComPtr() { Reset(); }
    ComPtr& operator=(const ComPtr& other) noexcept {
        if (this != &other) {
            ComPtr(other).Swap(*this);
        }
        return *this;
    }
    ComPtr& operator=(ComPtr&& other) noexcept {
        if (this != &other) {
            Reset();
            ptr_ = other.ptr_;
            other.ptr_ = nullptr;
        }
        return *this;
    }
    void Swap(ComPtr& other) noexcept { std::swap(ptr_, other.ptr_); }
    void Reset() noexcept {
        if (ptr_) {
            ptr_->Release();
            ptr_ = nullptr;
        }
    }
    T* Get() const noexcept { return ptr_; }
    T** GetAddressOf() noexcept { return &ptr_; }
    T* operator->() const noexcept { return ptr_; }
    explicit operator bool() const noexcept { return ptr_ != nullptr; }
    bool operator==(std::nullptr_t) const noexcept { return ptr_ == nullptr; }
    bool operator!=(std::nullptr_t) const noexcept { return ptr_ != nullptr; }
    template <typename U>
    HRESULT As(ComPtr<U>* p) const noexcept {
        if (!ptr_ || !p) return E_POINTER;
        p->Reset();
        return ptr_->QueryInterface(__uuidof(U), reinterpret_cast<void**>(p->GetAddressOf()));
    }
private:
    T* ptr_ = nullptr;
};
} // namespace Microsoft::WRL
#endif

namespace caplab::gfx {

// ARGB packed color helper (0xAARRGGBB)
constexpr uint32_t rgba(uint8_t r, uint8_t g, uint8_t b, uint8_t a = 255) noexcept {
    return (static_cast<uint32_t>(a) << 24) |
           (static_cast<uint32_t>(r) << 16) |
           (static_cast<uint32_t>(g) << 8) |
           static_cast<uint32_t>(b);
}

constexpr uint32_t rgb_alpha(uint32_t rgbHex, float alpha01) noexcept {
    uint32_t clamped = alpha01 <= 0.0f ? 0u : (alpha01 >= 1.0f ? 255u : static_cast<uint32_t>(alpha01 * 255.0f + 0.5f));
    return (clamped << 24) | (rgbHex & 0x00FFFFFFu);
}

struct Point2F {
    float x = 0.0f;
    float y = 0.0f;
};

struct RectF {
    float x = 0.0f;
    float y = 0.0f;
    float w = 0.0f;
    float h = 0.0f;

    bool contains(float px, float py) const noexcept {
        return px >= x && px <= (x + w) && py >= y && py <= (y + h);
    }
};

enum class FontStyle : uint8_t {
    Regular10 = 0,
    Regular11,
    Regular12,
    Regular14,
    Bold7,
    Bold9,
    Bold10,
    Bold11,
    Bold12,
    Bold14,
    Bold16,
    Bold20,
    Mono9,
    Mono10,
    Mono11,
    Mono12,
    Mono14,
    Count
};

enum class TextAlign : uint8_t {
    Left = 0,
    Center,
    Right
};

enum class TextVAlign : uint8_t {
    Top = 0,
    Middle,
    Bottom
};

class D2DRenderer {
public:
    D2DRenderer() = default;
    ~D2DRenderer();

    D2DRenderer(const D2DRenderer&) = delete;
    D2DRenderer& operator=(const D2DRenderer&) = delete;

    bool initialize(HWND hwnd, int pixelWidth, int pixelHeight, float dpiScale);
    void shutdown();

    bool resize(int pixelWidth, int pixelHeight, float dpiScale);

    void begin_frame(uint32_t clearColorArgb = 0xFF0B1120);
    bool end_frame(bool allowTearingPresent = true);

    float logical_width() const noexcept { return logicalWidth_; }
    float logical_height() const noexcept { return logicalHeight_; }
    float dpi_scale() const noexcept { return dpiScale_; }
    const std::string& gpu_description() const noexcept { return gpuName_; }
    uint64_t gpu_vram_mb() const noexcept { return gpuVramMb_; }
    bool is_discrete_gpu() const noexcept { return isDiscreteGpu_; }

    // Clipping & Transforms
    void push_clip(const RectF& rect);
    void pop_clip();
    void push_transform(float tx, float ty, float scaleX, float scaleY);
    void pop_transform();
    void reset_transform();

    // Primitives (screen or active-target DIP coordinates)
    void fill_rect(float x, float y, float w, float h, uint32_t argb);
    void draw_rect(float x, float y, float w, float h, uint32_t argb, float strokeWidth = 1.0f);

    void fill_rounded_rect(float x, float y, float w, float h, float radius, uint32_t argb);
    void draw_rounded_rect(float x, float y, float w, float h, float radius, uint32_t argb, float strokeWidth = 1.0f);

    void fill_circle(float cx, float cy, float r, uint32_t argb);
    void draw_circle(float cx, float cy, float r, uint32_t argb, float strokeWidth = 1.0f);

    void fill_ellipse(float cx, float cy, float rx, float ry, uint32_t argb);
    void draw_ellipse(float cx, float cy, float rx, float ry, uint32_t argb, float strokeWidth = 1.0f);

    void draw_line(float x1, float y1, float x2, float y2, uint32_t argb, float strokeWidth = 1.0f);
    void draw_dashed_line(float x1, float y1, float x2, float y2, uint32_t argb, float strokeWidth = 1.0f);

    void fill_polygon(const Point2F* pts, size_t count, uint32_t argb);
    void stroke_polygon(const Point2F* pts, size_t count, uint32_t argb, float strokeWidth = 1.0f);
    void draw_polyline(const Point2F* pts, size_t count, uint32_t argb, float strokeWidth = 1.0f);

    // Specialized geometric helpers for isometric cylinders and upper domes
    void draw_cylinder(
        float cx,
        float cy,
        float rx,
        float ry,
        float height,
        uint32_t bodyArgb,
        uint32_t topArgb,
        uint32_t strokeArgb = 0xFF0F172A,
        float strokeWidth = 0.7f);

    void draw_top_dome_arc(
        float cx,
        float cy,
        float rx,
        float ry,
        uint32_t fillArgb,
        uint32_t strokeArgb,
        float strokeWidth = 0.8f);

    void draw_text(
        std::string_view utf8,
        const RectF& bounds,
        uint32_t argb,
        FontStyle style = FontStyle::Regular12,
        TextAlign align = TextAlign::Left,
        TextVAlign valign = TextVAlign::Top,
        bool wordWrap = false,
        bool ellipsis = true);

    // Offscreen Static Ground Map Cache API
    bool begin_offscreen_bake(int widthPx, int heightPx);
    void end_offscreen_bake();
    bool has_baked_ground() const noexcept { return bakedBitmap_ != nullptr; }
    void invalidate_baked_ground() { bakedBitmap_.Reset(); }
    void draw_baked_ground(float dstX, float dstY);

private:
    bool create_device_resources();
    bool create_swapchain_and_target();
    bool create_text_formats();
    void discard_device_resources();

    ID2D1SolidColorBrush* get_brush(uint32_t argb);
    ID2D1RenderTarget* active_rt() const noexcept;

    HWND hwnd_ = nullptr;
    int pixelWidth_ = 1440;
    int pixelHeight_ = 900;
    float dpiScale_ = 1.0f;
    float logicalWidth_ = 1440.0f;
    float logicalHeight_ = 900.0f;
    bool tearingSupported_ = false;
    bool inFrame_ = false;
    std::string gpuName_ = "Direct3D 11 Hardware";
    uint64_t gpuVramMb_ = 0;
    bool isDiscreteGpu_ = false;

    Microsoft::WRL::ComPtr<ID3D11Device> d3dDevice_;
    Microsoft::WRL::ComPtr<ID3D11DeviceContext> d3dContext_;
    Microsoft::WRL::ComPtr<IDXGISwapChain1> swapChain_;

    Microsoft::WRL::ComPtr<ID2D1Factory1> d2dFactory_;
    Microsoft::WRL::ComPtr<ID2D1Device> d2dDevice_;
    Microsoft::WRL::ComPtr<ID2D1DeviceContext> d2dContext_;
    Microsoft::WRL::ComPtr<ID2D1Bitmap1> targetBitmap_;
    Microsoft::WRL::ComPtr<ID2D1StrokeStyle> dashedStroke_;

    // Offscreen baked ground cache
    Microsoft::WRL::ComPtr<ID2D1BitmapRenderTarget> bakeTarget_;
    Microsoft::WRL::ComPtr<ID2D1Bitmap> bakedBitmap_;
    bool bakingActive_ = false;

    Microsoft::WRL::ComPtr<IDWriteFactory> dwriteFactory_;
    Microsoft::WRL::ComPtr<IDWriteTextFormat> textFormats_[static_cast<size_t>(FontStyle::Count)];
    Microsoft::WRL::ComPtr<IDWriteInlineObject> ellipsisSigns_[static_cast<size_t>(FontStyle::Count)];

    std::unordered_map<uint32_t, Microsoft::WRL::ComPtr<ID2D1SolidColorBrush>> brushCache_;
    std::unordered_map<uint32_t, Microsoft::WRL::ComPtr<ID2D1SolidColorBrush>> bakeBrushCache_;
    std::vector<D2D1_MATRIX_3X2_F> transformStack_;
    std::wstring textScratch_;
    D2D1_MATRIX_3X2_F baseDpiMatrix_{};
};

} // namespace caplab::gfx
