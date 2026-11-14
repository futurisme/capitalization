#include "D2DRenderer.hpp"
#include "../platform/Win32Hardware.hpp"

#include <algorithm>
#include <array>
#include <cmath>

namespace caplab::gfx {

namespace {

inline D2D1_COLOR_F argb_to_d2d(uint32_t argb) noexcept {
    const float inv = 1.0f / 255.0f;
    return D2D1::ColorF(
        static_cast<float>((argb >> 16) & 0xFFu) * inv,
        static_cast<float>((argb >> 8) & 0xFFu) * inv,
        static_cast<float>(argb & 0xFFu) * inv,
        static_cast<float>((argb >> 24) & 0xFFu) * inv);
}

} // namespace

D2DRenderer::~D2DRenderer() {
    shutdown();
}

bool D2DRenderer::initialize(HWND hwnd, int pixelWidth, int pixelHeight, float dpiScale) {
    hwnd_ = hwnd;
    pixelWidth_ = std::max(1, pixelWidth);
    pixelHeight_ = std::max(1, pixelHeight);
    dpiScale_ = std::max(0.5f, dpiScale);
    logicalWidth_ = static_cast<float>(pixelWidth_) / dpiScale_;
    logicalHeight_ = static_cast<float>(pixelHeight_) / dpiScale_;
    brushCache_.reserve(128);
    bakeBrushCache_.reserve(64);
    transformStack_.reserve(16);
    textScratch_.reserve(256);

    if (!create_device_resources()) {
        return false;
    }
    if (!create_swapchain_and_target()) {
        return false;
    }
    if (!create_text_formats()) {
        return false;
    }
    return true;
}

void D2DRenderer::shutdown() {
    discard_device_resources();
    for (auto& sign : ellipsisSigns_) {
        sign.Reset();
    }
    for (auto& fmt : textFormats_) {
        fmt.Reset();
    }
    dwriteFactory_.Reset();
    d2dFactory_.Reset();
}

void D2DRenderer::discard_device_resources() {
    bakeBrushCache_.clear();
    brushCache_.clear();
    bakedBitmap_.Reset();
    bakeTarget_.Reset();
    dashedStroke_.Reset();
    if (d2dContext_) {
        d2dContext_->SetTarget(nullptr);
    }
    targetBitmap_.Reset();
    d2dContext_.Reset();
    d2dDevice_.Reset();
    swapChain_.Reset();
    d3dContext_.Reset();
    d3dDevice_.Reset();
}

bool D2DRenderer::create_device_resources() {
    if (!d2dFactory_) {
        D2D1_FACTORY_OPTIONS opts{};
        HRESULT hr = D2D1CreateFactory(
            D2D1_FACTORY_TYPE_SINGLE_THREADED,
            __uuidof(ID2D1Factory1),
            &opts,
            reinterpret_cast<void**>(d2dFactory_.GetAddressOf()));
        if (FAILED(hr)) return false;
    }

    if (!dwriteFactory_) {
        HRESULT hr = DWriteCreateFactory(
            DWRITE_FACTORY_TYPE_SHARED,
            __uuidof(IDWriteFactory),
            reinterpret_cast<IUnknown**>(dwriteFactory_.GetAddressOf()));
        if (FAILED(hr)) return false;
    }

    UINT creationFlags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
    const D3D_FEATURE_LEVEL featureLevels[] = {
        D3D_FEATURE_LEVEL_11_1,
        D3D_FEATURE_LEVEL_11_0,
        D3D_FEATURE_LEVEL_10_1,
        D3D_FEATURE_LEVEL_10_0
    };

    // Rank all non-software DXGI adapters by DedicatedVideoMemory so discrete GPUs (NVIDIA/AMD/Arc)
    // are prioritized over integrated graphics while remaining 100% MinGW & MSVC link-safe.
    Microsoft::WRL::ComPtr<IDXGIAdapter1> bestAdapter;
    SIZE_T bestDedicatedVram = 0;
    gpuName_ = "Direct3D 11 Default";
    gpuVramMb_ = 0;
    isDiscreteGpu_ = false;

    Microsoft::WRL::ComPtr<IDXGIFactory1> enumFactory;
    if (SUCCEEDED(CreateDXGIFactory1(__uuidof(IDXGIFactory1), reinterpret_cast<void**>(enumFactory.GetAddressOf()))) && enumFactory) {
        for (UINT idx = 0;; ++idx) {
            Microsoft::WRL::ComPtr<IDXGIAdapter1> candidate;
            if (enumFactory->EnumAdapters1(idx, candidate.GetAddressOf()) == DXGI_ERROR_NOT_FOUND) {
                break;
            }
            if (!candidate) continue;
            DXGI_ADAPTER_DESC1 desc{};
            if (FAILED(candidate->GetDesc1(&desc))) continue;
            if ((desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE) != 0) continue;

            if (!bestAdapter || desc.DedicatedVideoMemory > bestDedicatedVram) {
                bestAdapter = candidate;
                bestDedicatedVram = desc.DedicatedVideoMemory;
                gpuName_ = caplab::platform::wide_to_utf8(desc.Description);
                gpuVramMb_ = static_cast<uint64_t>(desc.DedicatedVideoMemory / (1024ULL * 1024ULL));
                // Discrete GPUs typically report >= 1024 MB dedicated VRAM and non-Intel/non-software vendor,
                // or Intel Arc discrete cards with >= 2048 MB VRAM.
                isDiscreteGpu_ = (gpuVramMb_ >= 1024ULL && desc.VendorId != 0x8086u) || (gpuVramMb_ >= 2048ULL);
            }
        }
    }

    D3D_FEATURE_LEVEL chosenLevel{};
    HRESULT hr = E_FAIL;
    if (bestAdapter) {
        hr = D3D11CreateDevice(
            bestAdapter.Get(),
            D3D_DRIVER_TYPE_UNKNOWN,
            nullptr,
            creationFlags,
            featureLevels,
            static_cast<UINT>(std::size(featureLevels)),
            D3D11_SDK_VERSION,
            d3dDevice_.GetAddressOf(),
            &chosenLevel,
            d3dContext_.GetAddressOf());
    }

    if (FAILED(hr)) {
        hr = D3D11CreateDevice(
            nullptr,
            D3D_DRIVER_TYPE_HARDWARE,
            nullptr,
            creationFlags,
            featureLevels,
            static_cast<UINT>(std::size(featureLevels)),
            D3D11_SDK_VERSION,
            d3dDevice_.GetAddressOf(),
            &chosenLevel,
            d3dContext_.GetAddressOf());
    }

    if (FAILED(hr)) {
        gpuName_ = "Microsoft Basic Render (WARP)";
        gpuVramMb_ = 0;
        isDiscreteGpu_ = false;
        hr = D3D11CreateDevice(
            nullptr,
            D3D_DRIVER_TYPE_WARP,
            nullptr,
            creationFlags,
            featureLevels,
            static_cast<UINT>(std::size(featureLevels)),
            D3D11_SDK_VERSION,
            d3dDevice_.GetAddressOf(),
            &chosenLevel,
            d3dContext_.GetAddressOf());
        if (FAILED(hr)) return false;
    }

    Microsoft::WRL::ComPtr<IDXGIDevice> dxgiDevice;
    hr = d3dDevice_.As(&dxgiDevice);
    if (FAILED(hr)) return false;

    hr = d2dFactory_->CreateDevice(dxgiDevice.Get(), d2dDevice_.GetAddressOf());
    if (FAILED(hr)) return false;

    hr = d2dDevice_->CreateDeviceContext(
        D2D1_DEVICE_CONTEXT_OPTIONS_ENABLE_MULTITHREADED_OPTIMIZATIONS,
        d2dContext_.GetAddressOf());
    if (FAILED(hr)) {
        hr = d2dDevice_->CreateDeviceContext(
            D2D1_DEVICE_CONTEXT_OPTIONS_NONE,
            d2dContext_.GetAddressOf());
        if (FAILED(hr)) return false;
    }

    const float dashes[] = {3.0f, 4.0f};
    D2D1_STROKE_STYLE_PROPERTIES strokeProps = D2D1::StrokeStyleProperties(
        D2D1_CAP_STYLE_FLAT,
        D2D1_CAP_STYLE_FLAT,
        D2D1_CAP_STYLE_FLAT,
        D2D1_LINE_JOIN_MITER,
        10.0f,
        D2D1_DASH_STYLE_CUSTOM,
        0.0f);
    d2dFactory_->CreateStrokeStyle(&strokeProps, dashes, 2, dashedStroke_.GetAddressOf());

    return true;
}

bool D2DRenderer::create_swapchain_and_target() {
    Microsoft::WRL::ComPtr<IDXGIDevice> dxgiDevice;
    if (FAILED(d3dDevice_.As(&dxgiDevice))) return false;

    Microsoft::WRL::ComPtr<IDXGIAdapter> dxgiAdapter;
    if (FAILED(dxgiDevice->GetAdapter(dxgiAdapter.GetAddressOf()))) return false;

    Microsoft::WRL::ComPtr<IDXGIFactory2> dxgiFactory;
    if (FAILED(dxgiAdapter->GetParent(IID_PPV_ARGS(dxgiFactory.GetAddressOf())))) return false;

    tearingSupported_ = false;
    Microsoft::WRL::ComPtr<IDXGIFactory5> dxgiFactory5;
    if (SUCCEEDED(dxgiFactory.As(&dxgiFactory5))) {
        BOOL allowTearing = FALSE;
        if (SUCCEEDED(dxgiFactory5->CheckFeatureSupport(
                DXGI_FEATURE_PRESENT_ALLOW_TEARING, &allowTearing, sizeof(allowTearing)))) {
            tearingSupported_ = (allowTearing == TRUE);
        }
    }

    DXGI_SWAP_CHAIN_DESC1 desc{};
    desc.Width = static_cast<UINT>(pixelWidth_);
    desc.Height = static_cast<UINT>(pixelHeight_);
    desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    desc.Stereo = FALSE;
    desc.SampleDesc.Count = 1;
    desc.SampleDesc.Quality = 0;
    desc.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    desc.BufferCount = 2;
    desc.Scaling = DXGI_SCALING_STRETCH;
    desc.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;
    desc.AlphaMode = DXGI_ALPHA_MODE_IGNORE;
    desc.Flags = tearingSupported_ ? DXGI_SWAP_CHAIN_FLAG_ALLOW_TEARING : 0;

    HRESULT hr = dxgiFactory->CreateSwapChainForHwnd(
        d3dDevice_.Get(),
        hwnd_,
        &desc,
        nullptr,
        nullptr,
        swapChain_.GetAddressOf());
    if (FAILED(hr)) return false;

    dxgiFactory->MakeWindowAssociation(hwnd_, DXGI_MWA_NO_ALT_ENTER);

    // Bind DXGI backbuffer to Direct2D target bitmap
    Microsoft::WRL::ComPtr<IDXGISurface> backBuffer;
    hr = swapChain_->GetBuffer(0, IID_PPV_ARGS(backBuffer.GetAddressOf()));
    if (FAILED(hr)) return false;

    D2D1_BITMAP_PROPERTIES1 bmpProps = D2D1::BitmapProperties1(
        D2D1_BITMAP_OPTIONS_TARGET | D2D1_BITMAP_OPTIONS_CANNOT_DRAW,
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_IGNORE),
        96.0f * dpiScale_,
        96.0f * dpiScale_);

    hr = d2dContext_->CreateBitmapFromDxgiSurface(
        backBuffer.Get(), &bmpProps, targetBitmap_.GetAddressOf());
    if (FAILED(hr)) return false;

    d2dContext_->SetDpi(96.0f * dpiScale_, 96.0f * dpiScale_);
    d2dContext_->SetTarget(targetBitmap_.Get());
    baseDpiMatrix_ = D2D1::Matrix3x2F::Identity();
    return true;
}

bool D2DRenderer::create_text_formats() {
    if (!dwriteFactory_) return false;

    struct Spec {
        FontStyle style;
        const wchar_t* family;
        DWRITE_FONT_WEIGHT weight;
        float size;
    };

    const Spec specs[] = {
        {FontStyle::Regular10, L"Segoe UI", DWRITE_FONT_WEIGHT_NORMAL, 10.0f},
        {FontStyle::Regular11, L"Segoe UI", DWRITE_FONT_WEIGHT_NORMAL, 11.0f},
        {FontStyle::Regular12, L"Segoe UI", DWRITE_FONT_WEIGHT_NORMAL, 12.0f},
        {FontStyle::Regular14, L"Segoe UI", DWRITE_FONT_WEIGHT_NORMAL, 14.0f},
        {FontStyle::Bold7, L"Segoe UI", DWRITE_FONT_WEIGHT_BOLD, 7.0f},
        {FontStyle::Bold9, L"Segoe UI", DWRITE_FONT_WEIGHT_BOLD, 9.0f},
        {FontStyle::Bold10, L"Segoe UI", DWRITE_FONT_WEIGHT_BOLD, 10.0f},
        {FontStyle::Bold11, L"Segoe UI", DWRITE_FONT_WEIGHT_BOLD, 11.0f},
        {FontStyle::Bold12, L"Segoe UI", DWRITE_FONT_WEIGHT_BOLD, 12.0f},
        {FontStyle::Bold14, L"Segoe UI", DWRITE_FONT_WEIGHT_BOLD, 14.0f},
        {FontStyle::Bold16, L"Segoe UI", DWRITE_FONT_WEIGHT_BOLD, 16.0f},
        {FontStyle::Bold20, L"Segoe UI", DWRITE_FONT_WEIGHT_BOLD, 20.0f},
        {FontStyle::Mono9, L"Consolas", DWRITE_FONT_WEIGHT_BOLD, 9.5f},
        {FontStyle::Mono10, L"Consolas", DWRITE_FONT_WEIGHT_BOLD, 10.5f},
        {FontStyle::Mono11, L"Consolas", DWRITE_FONT_WEIGHT_BOLD, 11.5f},
        {FontStyle::Mono12, L"Consolas", DWRITE_FONT_WEIGHT_BOLD, 12.5f},
        {FontStyle::Mono14, L"Consolas", DWRITE_FONT_WEIGHT_BOLD, 14.5f},
    };

    for (const auto& sp : specs) {
        size_t idx = static_cast<size_t>(sp.style);
        HRESULT hr = dwriteFactory_->CreateTextFormat(
            sp.family,
            nullptr,
            sp.weight,
            DWRITE_FONT_STYLE_NORMAL,
            DWRITE_FONT_STRETCH_NORMAL,
            sp.size,
            L"",
            textFormats_[idx].GetAddressOf());
        if (FAILED(hr)) return false;
        dwriteFactory_->CreateEllipsisTrimmingSign(
            textFormats_[idx].Get(),
            ellipsisSigns_[idx].GetAddressOf());
    }
    return true;
}

bool D2DRenderer::resize(int pixelWidth, int pixelHeight, float dpiScale) {
    pixelWidth_ = std::max(1, pixelWidth);
    pixelHeight_ = std::max(1, pixelHeight);
    dpiScale_ = std::max(0.5f, dpiScale);
    logicalWidth_ = static_cast<float>(pixelWidth_) / dpiScale_;
    logicalHeight_ = static_cast<float>(pixelHeight_) / dpiScale_;

    if (!swapChain_ || !d2dContext_) return false;

    d2dContext_->SetTarget(nullptr);
    targetBitmap_.Reset();

    UINT flags = tearingSupported_ ? DXGI_SWAP_CHAIN_FLAG_ALLOW_TEARING : 0;
    HRESULT hr = swapChain_->ResizeBuffers(
        0,
        static_cast<UINT>(pixelWidth_),
        static_cast<UINT>(pixelHeight_),
        DXGI_FORMAT_B8G8R8A8_UNORM,
        flags);
    if (FAILED(hr)) return false;

    Microsoft::WRL::ComPtr<IDXGISurface> backBuffer;
    hr = swapChain_->GetBuffer(0, IID_PPV_ARGS(backBuffer.GetAddressOf()));
    if (FAILED(hr)) return false;

    D2D1_BITMAP_PROPERTIES1 bmpProps = D2D1::BitmapProperties1(
        D2D1_BITMAP_OPTIONS_TARGET | D2D1_BITMAP_OPTIONS_CANNOT_DRAW,
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_IGNORE),
        96.0f * dpiScale_,
        96.0f * dpiScale_);

    hr = d2dContext_->CreateBitmapFromDxgiSurface(
        backBuffer.Get(), &bmpProps, targetBitmap_.GetAddressOf());
    if (FAILED(hr)) return false;

    d2dContext_->SetDpi(96.0f * dpiScale_, 96.0f * dpiScale_);
    d2dContext_->SetTarget(targetBitmap_.Get());
    return true;
}

ID2D1RenderTarget* D2DRenderer::active_rt() const noexcept {
    if (bakingActive_ && bakeTarget_) {
        return bakeTarget_.Get();
    }
    return d2dContext_.Get();
}

ID2D1SolidColorBrush* D2DRenderer::get_brush(uint32_t argb) {
    if (bakingActive_ && bakeTarget_) {
        auto it = bakeBrushCache_.find(argb);
        if (it != bakeBrushCache_.end()) {
            return it->second.Get();
        }
        Microsoft::WRL::ComPtr<ID2D1SolidColorBrush> tmp;
        if (SUCCEEDED(bakeTarget_->CreateSolidColorBrush(argb_to_d2d(argb), tmp.GetAddressOf()))) {
            auto [ins, ok] = bakeBrushCache_.emplace(argb, tmp);
            return ins->second.Get();
        }
        return nullptr;
    }

    auto it = brushCache_.find(argb);
    if (it != brushCache_.end()) {
        return it->second.Get();
    }
    Microsoft::WRL::ComPtr<ID2D1SolidColorBrush> brush;
    if (d2dContext_ && SUCCEEDED(d2dContext_->CreateSolidColorBrush(argb_to_d2d(argb), brush.GetAddressOf()))) {
        if (brushCache_.size() > 512) {
            brushCache_.clear();
        }
        auto [ins, ok] = brushCache_.emplace(argb, brush);
        return ins->second.Get();
    }
    return nullptr;
}

void D2DRenderer::begin_frame(uint32_t clearColorArgb) {
    if (!d2dContext_) return;
    transformStack_.clear();
    clipDepth_ = 0;
    d2dContext_->BeginDraw();
    d2dContext_->SetTransform(D2D1::Matrix3x2F::Identity());
    d2dContext_->Clear(argb_to_d2d(clearColorArgb));
    inFrame_ = true;
}

bool D2DRenderer::end_frame(bool allowTearingPresent) {
    if (!d2dContext_ || !inFrame_) return true;
    while (clipDepth_ > 0) {
        d2dContext_->PopAxisAlignedClip();
        --clipDepth_;
    }
    inFrame_ = false;
    HRESULT hr = d2dContext_->EndDraw();
    if (hr == D2DERR_RECREATE_TARGET) {
        discard_device_resources();
        create_device_resources();
        create_swapchain_and_target();
        return false;
    }

    if (swapChain_) {
        UINT syncInterval = (allowTearingPresent && tearingSupported_) ? 0u : 1u;
        UINT flags = (syncInterval == 0u && tearingSupported_) ? DXGI_PRESENT_ALLOW_TEARING : 0u;
        hr = swapChain_->Present(syncInterval, flags);
        if (hr == DXGI_ERROR_DEVICE_REMOVED || hr == DXGI_ERROR_DEVICE_RESET) {
            discard_device_resources();
            create_device_resources();
            create_swapchain_and_target();
            return false;
        }
    }
    return true;
}

void D2DRenderer::push_clip(const RectF& rect) {
    if (auto* rt = active_rt()) {
        rt->PushAxisAlignedClip(
            D2D1::RectF(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h),
            D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
        ++clipDepth_;
    }
}

void D2DRenderer::pop_clip() {
    if (clipDepth_ <= 0) return;
    if (auto* rt = active_rt()) {
        rt->PopAxisAlignedClip();
        --clipDepth_;
    }
}

void D2DRenderer::push_transform(float tx, float ty, float scaleX, float scaleY) {
    auto* rt = active_rt();
    if (!rt) return;
    D2D1_MATRIX_3X2_F current{};
    rt->GetTransform(&current);
    transformStack_.push_back(current);

    D2D1_MATRIX_3X2_F next =
        D2D1::Matrix3x2F::Scale(scaleX, scaleY) *
        D2D1::Matrix3x2F::Translation(tx, ty) *
        current;
    rt->SetTransform(next);
}

void D2DRenderer::pop_transform() {
    auto* rt = active_rt();
    if (!rt || transformStack_.empty()) return;
    rt->SetTransform(transformStack_.back());
    transformStack_.pop_back();
}

void D2DRenderer::reset_transform() {
    transformStack_.clear();
    if (auto* rt = active_rt()) {
        rt->SetTransform(D2D1::Matrix3x2F::Identity());
    }
}

void D2DRenderer::fill_rect(float x, float y, float w, float h, uint32_t argb) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br) return;
    rt->FillRectangle(D2D1::RectF(x, y, x + w, y + h), br);
}

void D2DRenderer::draw_rect(float x, float y, float w, float h, uint32_t argb, float strokeWidth) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br) return;
    rt->DrawRectangle(D2D1::RectF(x, y, x + w, y + h), br, strokeWidth);
}

void D2DRenderer::fill_rounded_rect(float x, float y, float w, float h, float radius, uint32_t argb) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br) return;
    rt->FillRoundedRectangle(
        D2D1::RoundedRect(D2D1::RectF(x, y, x + w, y + h), radius, radius), br);
}

void D2DRenderer::draw_rounded_rect(float x, float y, float w, float h, float radius, uint32_t argb, float strokeWidth) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br) return;
    rt->DrawRoundedRectangle(
        D2D1::RoundedRect(D2D1::RectF(x, y, x + w, y + h), radius, radius), br, strokeWidth);
}

void D2DRenderer::fill_circle(float cx, float cy, float r, uint32_t argb) {
    fill_ellipse(cx, cy, r, r, argb);
}

void D2DRenderer::draw_circle(float cx, float cy, float r, uint32_t argb, float strokeWidth) {
    draw_ellipse(cx, cy, r, r, argb, strokeWidth);
}

void D2DRenderer::fill_ellipse(float cx, float cy, float rx, float ry, uint32_t argb) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br) return;
    rt->FillEllipse(D2D1::Ellipse(D2D1::Point2F(cx, cy), rx, ry), br);
}

void D2DRenderer::draw_ellipse(float cx, float cy, float rx, float ry, uint32_t argb, float strokeWidth) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br) return;
    rt->DrawEllipse(D2D1::Ellipse(D2D1::Point2F(cx, cy), rx, ry), br, strokeWidth);
}

void D2DRenderer::draw_line(float x1, float y1, float x2, float y2, uint32_t argb, float strokeWidth) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br) return;
    rt->DrawLine(D2D1::Point2F(x1, y1), D2D1::Point2F(x2, y2), br, strokeWidth);
}

void D2DRenderer::draw_dashed_line(float x1, float y1, float x2, float y2, uint32_t argb, float strokeWidth) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br) return;
    rt->DrawLine(D2D1::Point2F(x1, y1), D2D1::Point2F(x2, y2), br, strokeWidth, dashedStroke_.Get());
}

namespace {
inline bool try_as_axis_aligned_rect(const Point2F* pts, size_t count, D2D1_RECT_F& outRect) noexcept {
    if (count != 4) return false;
    constexpr float eps = 0.01f;
    const bool h01 = std::abs(pts[0].y - pts[1].y) < eps && std::abs(pts[2].y - pts[3].y) < eps &&
                     std::abs(pts[1].x - pts[2].x) < eps && std::abs(pts[3].x - pts[0].x) < eps;
    const bool v01 = std::abs(pts[0].x - pts[1].x) < eps && std::abs(pts[2].x - pts[3].x) < eps &&
                     std::abs(pts[1].y - pts[2].y) < eps && std::abs(pts[3].y - pts[0].y) < eps;
    if (!h01 && !v01) return false;
    float minX = std::min({pts[0].x, pts[1].x, pts[2].x, pts[3].x});
    float maxX = std::max({pts[0].x, pts[1].x, pts[2].x, pts[3].x});
    float minY = std::min({pts[0].y, pts[1].y, pts[2].y, pts[3].y});
    float maxY = std::max({pts[0].y, pts[1].y, pts[2].y, pts[3].y});
    outRect = D2D1::RectF(minX, minY, maxX, maxY);
    return true;
}
} // namespace

void D2DRenderer::fill_polygon(const Point2F* pts, size_t count, uint32_t argb) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br || !d2dFactory_ || count < 3) return;

    D2D1_RECT_F fastRect{};
    if (try_as_axis_aligned_rect(pts, count, fastRect)) {
        rt->FillRectangle(fastRect, br);
        return;
    }

    Microsoft::WRL::ComPtr<ID2D1PathGeometry> geo;
    if (FAILED(d2dFactory_->CreatePathGeometry(geo.GetAddressOf()))) return;
    Microsoft::WRL::ComPtr<ID2D1GeometrySink> sink;
    if (FAILED(geo->Open(sink.GetAddressOf()))) return;

    sink->BeginFigure(D2D1::Point2F(pts[0].x, pts[0].y), D2D1_FIGURE_BEGIN_FILLED);
    for (size_t i = 1; i < count; ++i) {
        sink->AddLine(D2D1::Point2F(pts[i].x, pts[i].y));
    }
    sink->EndFigure(D2D1_FIGURE_END_CLOSED);
    sink->Close();
    rt->FillGeometry(geo.Get(), br);
}

void D2DRenderer::stroke_polygon(const Point2F* pts, size_t count, uint32_t argb, float strokeWidth) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br || !d2dFactory_ || count < 2) return;

    D2D1_RECT_F fastRect{};
    if (try_as_axis_aligned_rect(pts, count, fastRect)) {
        rt->DrawRectangle(fastRect, br, strokeWidth);
        return;
    }

    Microsoft::WRL::ComPtr<ID2D1PathGeometry> geo;
    if (FAILED(d2dFactory_->CreatePathGeometry(geo.GetAddressOf()))) return;
    Microsoft::WRL::ComPtr<ID2D1GeometrySink> sink;
    if (FAILED(geo->Open(sink.GetAddressOf()))) return;

    sink->BeginFigure(D2D1::Point2F(pts[0].x, pts[0].y), D2D1_FIGURE_BEGIN_HOLLOW);
    for (size_t i = 1; i < count; ++i) {
        sink->AddLine(D2D1::Point2F(pts[i].x, pts[i].y));
    }
    sink->EndFigure(D2D1_FIGURE_END_CLOSED);
    sink->Close();
    rt->DrawGeometry(geo.Get(), br, strokeWidth);
}

void D2DRenderer::draw_polyline(const Point2F* pts, size_t count, uint32_t argb, float strokeWidth) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br || count < 2) return;
    for (size_t i = 0; i + 1 < count; ++i) {
        rt->DrawLine(D2D1::Point2F(pts[i].x, pts[i].y), D2D1::Point2F(pts[i + 1].x, pts[i + 1].y), br, strokeWidth);
    }
}

void D2DRenderer::draw_cylinder(
    float cx,
    float cy,
    float rx,
    float ry,
    float height,
    uint32_t bodyArgb,
    uint32_t topArgb,
    uint32_t strokeArgb,
    float strokeWidth
) {
    auto* rt = active_rt();
    auto* bodyBr = get_brush(bodyArgb);
    auto* strokeBr = get_brush(strokeArgb);
    if (!rt || !bodyBr || !d2dFactory_) return;

    Microsoft::WRL::ComPtr<ID2D1PathGeometry> geo;
    if (SUCCEEDED(d2dFactory_->CreatePathGeometry(geo.GetAddressOf()))) {
        Microsoft::WRL::ComPtr<ID2D1GeometrySink> sink;
        if (SUCCEEDED(geo->Open(sink.GetAddressOf()))) {
            sink->BeginFigure(D2D1::Point2F(cx + rx, cy), D2D1_FIGURE_BEGIN_FILLED);
            sink->AddArc(D2D1::ArcSegment(
                D2D1::Point2F(cx - rx, cy),
                D2D1::SizeF(rx, ry),
                0.0f,
                D2D1_SWEEP_DIRECTION_CLOCKWISE,
                D2D1_ARC_SIZE_SMALL));
            sink->AddLine(D2D1::Point2F(cx - rx, cy - height));
            sink->AddLine(D2D1::Point2F(cx + rx, cy - height));
            sink->EndFigure(D2D1_FIGURE_END_CLOSED);
            sink->Close();
            rt->FillGeometry(geo.Get(), bodyBr);
            if (strokeBr) rt->DrawGeometry(geo.Get(), strokeBr, strokeWidth);
        }
    }

    fill_ellipse(cx, cy - height, rx, ry, topArgb);
    draw_ellipse(cx, cy - height, rx, ry, strokeArgb, strokeWidth);
}

void D2DRenderer::draw_top_dome_arc(
    float cx,
    float cy,
    float rx,
    float ry,
    uint32_t fillArgb,
    uint32_t strokeArgb,
    float strokeWidth
) {
    auto* rt = active_rt();
    auto* fillBr = get_brush(fillArgb);
    auto* strokeBr = get_brush(strokeArgb);
    if (!rt || !fillBr || !d2dFactory_) return;

    Microsoft::WRL::ComPtr<ID2D1PathGeometry> geo;
    if (SUCCEEDED(d2dFactory_->CreatePathGeometry(geo.GetAddressOf()))) {
        Microsoft::WRL::ComPtr<ID2D1GeometrySink> sink;
        if (SUCCEEDED(geo->Open(sink.GetAddressOf()))) {
            sink->BeginFigure(D2D1::Point2F(cx - rx, cy), D2D1_FIGURE_BEGIN_FILLED);
            sink->AddArc(D2D1::ArcSegment(
                D2D1::Point2F(cx + rx, cy),
                D2D1::SizeF(rx, ry),
                0.0f,
                D2D1_SWEEP_DIRECTION_CLOCKWISE,
                D2D1_ARC_SIZE_SMALL));
            sink->EndFigure(D2D1_FIGURE_END_CLOSED);
            sink->Close();
            rt->FillGeometry(geo.Get(), fillBr);
            if (strokeBr) rt->DrawGeometry(geo.Get(), strokeBr, strokeWidth);
        }
    }
}

void D2DRenderer::draw_text(
    std::string_view utf8,
    const RectF& bounds,
    uint32_t argb,
    FontStyle style,
    TextAlign align,
    TextVAlign valign,
    bool wordWrap,
    bool ellipsis
) {
    auto* rt = active_rt();
    auto* br = get_brush(argb);
    if (!rt || !br || !dwriteFactory_ || utf8.empty()) return;

    size_t idx = static_cast<size_t>(style);
    if (idx >= static_cast<size_t>(FontStyle::Count)) idx = 0;
    IDWriteTextFormat* fmt = textFormats_[idx].Get();
    if (!fmt) return;

    DWRITE_TEXT_ALIGNMENT hAlign = DWRITE_TEXT_ALIGNMENT_LEADING;
    if (align == TextAlign::Center) hAlign = DWRITE_TEXT_ALIGNMENT_CENTER;
    else if (align == TextAlign::Right) hAlign = DWRITE_TEXT_ALIGNMENT_TRAILING;

    DWRITE_PARAGRAPH_ALIGNMENT pAlign = DWRITE_PARAGRAPH_ALIGNMENT_NEAR;
    if (valign == TextVAlign::Middle) pAlign = DWRITE_PARAGRAPH_ALIGNMENT_CENTER;
    else if (valign == TextVAlign::Bottom) pAlign = DWRITE_PARAGRAPH_ALIGNMENT_FAR;

    fmt->SetTextAlignment(hAlign);
    fmt->SetParagraphAlignment(pAlign);
    fmt->SetWordWrapping(wordWrap ? DWRITE_WORD_WRAPPING_WRAP : DWRITE_WORD_WRAPPING_NO_WRAP);

    DWRITE_TRIMMING trimming{};
    if (ellipsis && !wordWrap && ellipsisSigns_[idx]) {
        trimming.granularity = DWRITE_TRIMMING_GRANULARITY_CHARACTER;
        fmt->SetTrimming(&trimming, ellipsisSigns_[idx].Get());
    } else {
        trimming.granularity = DWRITE_TRIMMING_GRANULARITY_NONE;
        fmt->SetTrimming(&trimming, nullptr);
    }

    const int wideNeeded = MultiByteToWideChar(
        CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), nullptr, 0);
    if (wideNeeded <= 0) return;
    textScratch_.resize(static_cast<size_t>(wideNeeded));
    MultiByteToWideChar(
        CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), textScratch_.data(), wideNeeded);

    D2D1_RECT_F layoutRect = D2D1::RectF(bounds.x, bounds.y, bounds.x + bounds.w, bounds.y + bounds.h);
    rt->DrawText(
        textScratch_.data(),
        static_cast<UINT32>(textScratch_.size()),
        fmt,
        layoutRect,
        br,
        D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT | D2D1_DRAW_TEXT_OPTIONS_CLIP);
}

bool D2DRenderer::begin_offscreen_bake(int widthPx, int heightPx) {
    if (!d2dContext_) return false;
    bakeTarget_.Reset();
    bakedBitmap_.Reset();

    HRESULT hr = d2dContext_->CreateCompatibleRenderTarget(
        D2D1::SizeF(static_cast<float>(widthPx), static_cast<float>(heightPx)),
        bakeTarget_.GetAddressOf());
    if (FAILED(hr) || !bakeTarget_) return false;

    bakeTarget_->BeginDraw();
    bakeTarget_->Clear(D2D1::ColorF(0, 0, 0, 0));
    bakingActive_ = true;
    return true;
}

void D2DRenderer::end_offscreen_bake() {
    if (!bakingActive_ || !bakeTarget_) return;
    bakingActive_ = false;
    HRESULT hr = bakeTarget_->EndDraw();
    if (SUCCEEDED(hr)) {
        bakeTarget_->GetBitmap(bakedBitmap_.GetAddressOf());
    }
    bakeBrushCache_.clear();
    bakeTarget_.Reset();
}

void D2DRenderer::draw_baked_ground(float dstX, float dstY) {
    if (!d2dContext_ || !bakedBitmap_) return;
    D2D1_SIZE_F sz = bakedBitmap_->GetSize();
    d2dContext_->DrawBitmap(
        bakedBitmap_.Get(),
        D2D1::RectF(dstX, dstY, dstX + sz.width, dstY + sz.height));
}

} // namespace caplab::gfx
