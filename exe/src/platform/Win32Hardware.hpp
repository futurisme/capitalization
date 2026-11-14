#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <string_view>

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

namespace caplab::platform {

struct InputEvent {
    enum class Type : uint8_t {
        MouseMove = 0,
        MouseDown,
        MouseUp,
        MouseWheel,
        KeyDown,
        CharInput
    };
    Type type = Type::MouseMove;
    float x = 0.0f;
    float y = 0.0f;
    int button = 0;       // 0=left, 1=right, 2=middle
    float wheelDelta = 0.0f;
    uint32_t keyCode = 0; // VK_*
    uint32_t charCode = 0;
    bool ctrlDown = false;
    bool shiftDown = false;
};

struct WindowConfig {
    std::wstring title = L"CapLab 13 — Simulasi Ekonomi & Konglomerasi 2.5D";
    int initialWidth = 1440;
    int initialHeight = 900;
    int minWidth = 960;
    int minHeight = 640;
};

std::wstring utf8_to_wide(std::string_view utf8);
std::string wide_to_utf8(std::wstring_view wide);

class Win32Hardware {
public:
    Win32Hardware() = default;
    ~Win32Hardware();

    Win32Hardware(const Win32Hardware&) = delete;
    Win32Hardware& operator=(const Win32Hardware&) = delete;

    bool initialize(HINSTANCE hInstance, const WindowConfig& config);
    void shutdown();

    // Processes all pending Win32 messages; returns false on WM_QUIT
    bool pump_messages();

    HWND hwnd() const noexcept { return hwnd_; }
    int client_width() const noexcept { return clientWidth_; }
    int client_height() const noexcept { return clientHeight_; }
    float dpi_scale() const noexcept { return dpiScale_; }
    bool is_minimized() const noexcept { return minimized_; }

    // High-resolution QPC timing in seconds
    double now_seconds() const noexcept;

    // Native Windows 11 File Dialogs (JSON Save/Export)
    bool show_open_json_dialog(std::string& outFilePath) const;
    bool show_save_json_dialog(std::string& outFilePath, std::string_view defaultName) const;

    // Win32 Unicode Clipboard
    bool copy_text_to_clipboard(std::string_view utf8Text) const;
    std::string read_text_from_clipboard() const;

    std::function<void(int width, int height, float dpiScale)> onResize;
    std::function<void(const InputEvent& ev)> onInput;
    std::function<void()> onCloseRequested;

private:
    static LRESULT CALLBACK static_wnd_proc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
    LRESULT handle_message(UINT msg, WPARAM wParam, LPARAM lParam);

    void enable_windows11_optimizations();
    void apply_dwm_dark_and_corners();

    HINSTANCE hInstance_ = nullptr;
    HWND hwnd_ = nullptr;
    HBRUSH bgBrush_ = nullptr;
    HANDLE mmcssHandle_ = nullptr;
    bool classRegistered_ = false;
    bool timerPeriodActive_ = false;
    bool comInitialized_ = false;

    int clientWidth_ = 1440;
    int clientHeight_ = 900;
    int minWidth_ = 960;
    int minHeight_ = 640;
    float dpiScale_ = 1.0f;
    bool minimized_ = false;

    int64_t qpcFrequency_ = 1;
    int64_t qpcStart_ = 0;
};

} // namespace caplab::platform
