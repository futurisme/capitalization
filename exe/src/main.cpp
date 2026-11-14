#include "platform/Win32Hardware.hpp"
#include "graphics/D2DRenderer.hpp"
#include "ui/GameApp.hpp"

#include <algorithm>
#include <windows.h>

#ifndef _In_
#define _In_
#endif
#ifndef _In_opt_
#define _In_opt_
#endif

// Request high-performance discrete GPU on hybrid/Optimus/PowerXpress laptops & Windows 11
extern "C" {
__declspec(dllexport) unsigned long NvOptimusEnablement = 0x00000001u;
__declspec(dllexport) int AmdPowerXpressRequestHighPerformance = 1;
}

int WINAPI wWinMain(
    _In_ HINSTANCE hInstance,
    _In_opt_ HINSTANCE /*hPrevInstance*/,
    _In_ LPWSTR /*lpCmdLine*/,
    _In_ int /*nShowCmd*/
) {
    caplab::platform::Win32Hardware hardware;
    caplab::platform::WindowConfig winCfg{};
    winCfg.title = L"CapLab 13 \u2014 Simulasi Ekonomi & Konglomerasi 2.5D (Native Windows 11)";
    winCfg.initialWidth = 1440;
    winCfg.initialHeight = 900;
    winCfg.minWidth = 960;
    winCfg.minHeight = 640;

    if (!hardware.initialize(hInstance, winCfg)) {
        MessageBoxW(
            nullptr,
            L"Gagal menginisialisasi jendela native Windows 11.",
            L"CapLab 13 Error",
            MB_OK | MB_ICONERROR);
        return 1;
    }

    caplab::gfx::D2DRenderer renderer;
    if (!renderer.initialize(
            hardware.hwnd(),
            hardware.client_width(),
            hardware.client_height(),
            hardware.dpi_scale())) {
        MessageBoxW(
            hardware.hwnd(),
            L"Gagal menginisialisasi Direct3D 11 / Direct2D 1.1 hardware renderer.",
            L"CapLab 13 Graphics Error",
            MB_OK | MB_ICONERROR);
        return 2;
    }

    caplab::ui::GameApp app(hardware);
    app.initialize();

    hardware.onResize = [&](int w, int h, float dpi) {
        renderer.resize(w, h, dpi);
    };

    hardware.onInput = [&](const caplab::platform::InputEvent& ev) {
        app.handle_input(ev);
    };

    hardware.onCloseRequested = [&]() {
        app.on_close();
    };

    double prevTime = hardware.now_seconds();
    while (hardware.pump_messages()) {
        double now = hardware.now_seconds();
        double dt = std::clamp(now - prevTime, 0.0001, 0.1);
        prevTime = now;

        if (!hardware.is_minimized()) {
            renderer.begin_frame(0xFF0B1120u);
            app.update_and_render(renderer, dt);
            renderer.end_frame(false); // Smooth VSync / Flip-Discard desktop cadence
        } else {
            Sleep(16);
        }
    }

    renderer.shutdown();
    hardware.shutdown();
    return 0;
}
