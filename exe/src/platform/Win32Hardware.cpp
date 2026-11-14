#include "Win32Hardware.hpp"

#include <avrt.h>
#include <commdlg.h>
#include <dwmapi.h>
#include <mmsystem.h>
#include <objbase.h>
#include <shellscalingapi.h>
#include <windowsx.h>

#include <algorithm>
#include <vector>

#ifndef DWMWA_USE_IMMERSIVE_DARK_MODE
#define DWMWA_USE_IMMERSIVE_DARK_MODE 20
#endif

#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif

namespace caplab::platform {

std::wstring utf8_to_wide(std::string_view utf8) {
    if (utf8.empty()) return {};
    int needed = MultiByteToWideChar(
        CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), nullptr, 0);
    if (needed <= 0) return {};
    std::wstring out(static_cast<size_t>(needed), L'\0');
    MultiByteToWideChar(
        CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), out.data(), needed);
    return out;
}

std::string wide_to_utf8(std::wstring_view wide) {
    if (wide.empty()) return {};
    int needed = WideCharToMultiByte(
        CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), nullptr, 0, nullptr, nullptr);
    if (needed <= 0) return {};
    std::string out(static_cast<size_t>(needed), '\0');
    WideCharToMultiByte(
        CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), out.data(), needed, nullptr, nullptr);
    return out;
}

Win32Hardware::~Win32Hardware() {
    shutdown();
}

void Win32Hardware::enable_windows11_optimizations() {
    // 1. Per-Monitor V2 DPI Awareness
#ifdef DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
#else
    SetProcessDpiAwareness(PROCESS_PER_MONITOR_DPI_AWARE);
#endif

    // 2. High-precision 1ms Windows scheduler resolution
    if (timeBeginPeriod(1) == TIMERR_NOERROR) {
        timerPeriodActive_ = true;
    }

    // 3. Disable Windows 11 EcoQoS / Efficiency Mode throttling for low-latency active loop
#ifdef PROCESS_POWER_THROTTLING_CURRENT_VERSION
    PROCESS_POWER_THROTTLING_STATE powerState{};
    powerState.Version = PROCESS_POWER_THROTTLING_CURRENT_VERSION;
    powerState.ControlMask = PROCESS_POWER_THROTTLING_EXECUTION_SPEED;
    powerState.StateMask = 0; // Request High Performance (disable EcoQoS throttling)
    SetProcessInformation(
        GetCurrentProcess(),
        ProcessPowerThrottling,
        &powerState,
        sizeof(powerState));
#endif

    // 4. Register main thread with Multimedia Class Scheduler Service ("Games")
    DWORD taskIndex = 0;
    mmcssHandle_ = AvSetMmThreadCharacteristicsW(L"Games", &taskIndex);
}

void Win32Hardware::apply_dwm_dark_and_corners() {
    if (!hwnd_) return;
    BOOL useDark = TRUE;
    DwmSetWindowAttribute(hwnd_, DWMWA_USE_IMMERSIVE_DARK_MODE, &useDark, sizeof(useDark));

    // DWMWCP_ROUND = 2 (Windows 11 rounded corners)
    DWORD cornerPref = 2;
    DwmSetWindowAttribute(hwnd_, DWMWA_WINDOW_CORNER_PREFERENCE, &cornerPref, sizeof(cornerPref));
}

bool Win32Hardware::initialize(HINSTANCE hInstance, const WindowConfig& config) {
    hInstance_ = hInstance;
    minWidth_ = config.minWidth;
    minHeight_ = config.minHeight;

    LARGE_INTEGER freq{}, counter{};
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&counter);
    qpcFrequency_ = std::max<int64_t>(1, freq.QuadPart);
    qpcStart_ = counter.QuadPart;

    HRESULT hrCom = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (SUCCEEDED(hrCom)) {
        comInitialized_ = true;
    }

    enable_windows11_optimizations();

    const wchar_t* className = L"CapLab13NativeWindowClass";
    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW | CS_OWNDC;
    wc.lpfnWndProc = Win32Hardware::static_wnd_proc;
    wc.hInstance = hInstance_;
    wc.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    bgBrush_ = CreateSolidBrush(RGB(11, 17, 32)); // #0b1120 prevents white flash
    wc.hbrBackground = bgBrush_;
    wc.lpszClassName = className;
    wc.hIconSm = LoadIconW(nullptr, IDI_APPLICATION);

    if (RegisterClassExW(&wc)) {
        classRegistered_ = true;
    } else {
        DWORD err = GetLastError();
        if (err != ERROR_CLASS_ALREADY_EXISTS) {
            if (bgBrush_) {
                DeleteObject(bgBrush_);
                bgBrush_ = nullptr;
            }
            return false;
        }
    }

    RECT rc{0, 0, config.initialWidth, config.initialHeight};
    AdjustWindowRectEx(&rc, WS_OVERLAPPEDWINDOW, FALSE, 0);

    int screenW = GetSystemMetrics(SM_CXSCREEN);
    int screenH = GetSystemMetrics(SM_CYSCREEN);
    int winW = rc.right - rc.left;
    int winH = rc.bottom - rc.top;
    int posX = std::max(0, (screenW - winW) / 2);
    int posY = std::max(0, (screenH - winH) / 2);

    hwnd_ = CreateWindowExW(
        0,
        className,
        config.title.c_str(),
        WS_OVERLAPPEDWINDOW,
        posX,
        posY,
        winW,
        winH,
        nullptr,
        nullptr,
        hInstance_,
        this);

    if (!hwnd_) {
        return false;
    }

    UINT dpi = GetDpiForWindow(hwnd_);
    dpiScale_ = dpi > 0 ? static_cast<float>(dpi) / 96.0f : 1.0f;

    RECT clientRc{};
    GetClientRect(hwnd_, &clientRc);
    clientWidth_ = std::max(1, static_cast<int>(clientRc.right - clientRc.left));
    clientHeight_ = std::max(1, static_cast<int>(clientRc.bottom - clientRc.top));

    apply_dwm_dark_and_corners();
    ShowWindow(hwnd_, SW_SHOWDEFAULT);
    UpdateWindow(hwnd_);
    return true;
}

void Win32Hardware::shutdown() {
    if (mmcssHandle_) {
        AvRevertMmThreadCharacteristics(mmcssHandle_);
        mmcssHandle_ = nullptr;
    }
    if (timerPeriodActive_) {
        timeEndPeriod(1);
        timerPeriodActive_ = false;
    }
    if (hwnd_) {
        DestroyWindow(hwnd_);
        hwnd_ = nullptr;
    }
    if (classRegistered_ && hInstance_) {
        UnregisterClassW(L"CapLab13NativeWindowClass", hInstance_);
        classRegistered_ = false;
    }
    if (bgBrush_) {
        DeleteObject(bgBrush_);
        bgBrush_ = nullptr;
    }
    if (comInitialized_) {
        CoUninitialize();
        comInitialized_ = false;
    }
}

bool Win32Hardware::pump_messages() {
    MSG msg{};
    while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
        if (msg.message == WM_QUIT) {
            return false;
        }
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    return true;
}

double Win32Hardware::now_seconds() const noexcept {
    LARGE_INTEGER counter{};
    QueryPerformanceCounter(&counter);
    return static_cast<double>(counter.QuadPart - qpcStart_) / static_cast<double>(qpcFrequency_);
}

LRESULT CALLBACK Win32Hardware::static_wnd_proc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    Win32Hardware* self = nullptr;
    if (msg == WM_NCCREATE) {
        auto* cs = reinterpret_cast<CREATESTRUCTW*>(lParam);
        self = reinterpret_cast<Win32Hardware*>(cs->lpCreateParams);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
        if (self) self->hwnd_ = hwnd;
    } else {
        self = reinterpret_cast<Win32Hardware*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    }

    if (self) {
        return self->handle_message(msg, wParam, lParam);
    }
    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

LRESULT Win32Hardware::handle_message(UINT msg, WPARAM wParam, LPARAM lParam) {
    auto dispatch_mouse = [&](InputEvent::Type type, int button, float wheel = 0.0f) {
        if (!onInput) return;
        InputEvent ev{};
        ev.type = type;
        ev.button = button;
        ev.wheelDelta = wheel;
        ev.ctrlDown = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
        ev.shiftDown = (GetKeyState(VK_SHIFT) & 0x8000) != 0;

        if (type == InputEvent::Type::MouseWheel) {
            POINT pt{GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)};
            ScreenToClient(hwnd_, &pt);
            ev.x = static_cast<float>(pt.x) / dpiScale_;
            ev.y = static_cast<float>(pt.y) / dpiScale_;
        } else {
            ev.x = static_cast<float>(GET_X_LPARAM(lParam)) / dpiScale_;
            ev.y = static_cast<float>(GET_Y_LPARAM(lParam)) / dpiScale_;
        }
        onInput(ev);
    };

    switch (msg) {
    case WM_GETMINMAXINFO: {
        auto* mmi = reinterpret_cast<MINMAXINFO*>(lParam);
        mmi->ptMinTrackSize.x = static_cast<LONG>(minWidth_ * dpiScale_);
        mmi->ptMinTrackSize.y = static_cast<LONG>(minHeight_ * dpiScale_);
        return 0;
    }
    case WM_SIZE: {
        minimized_ = (wParam == SIZE_MINIMIZED);
        int w = LOWORD(lParam);
        int h = HIWORD(lParam);
        if (!minimized_ && w > 0 && h > 0) {
            clientWidth_ = w;
            clientHeight_ = h;
            if (onResize) {
                onResize(w, h, dpiScale_);
            }
        }
        return 0;
    }
    case WM_DPICHANGED: {
        UINT newDpi = HIWORD(wParam);
        dpiScale_ = newDpi > 0 ? static_cast<float>(newDpi) / 96.0f : 1.0f;
        const RECT* suggested = reinterpret_cast<const RECT*>(lParam);
        if (suggested) {
            SetWindowPos(
                hwnd_,
                nullptr,
                suggested->left,
                suggested->top,
                suggested->right - suggested->left,
                suggested->bottom - suggested->top,
                SWP_NOZORDER | SWP_NOACTIVATE);
        }
        if (onResize) {
            onResize(clientWidth_, clientHeight_, dpiScale_);
        }
        return 0;
    }
    case WM_MOUSEMOVE:
        dispatch_mouse(InputEvent::Type::MouseMove, 0);
        return 0;
    case WM_LBUTTONDOWN:
        SetCapture(hwnd_);
        dispatch_mouse(InputEvent::Type::MouseDown, 0);
        return 0;
    case WM_LBUTTONUP:
        if (GetCapture() == hwnd_) ReleaseCapture();
        dispatch_mouse(InputEvent::Type::MouseUp, 0);
        return 0;
    case WM_RBUTTONDOWN:
        dispatch_mouse(InputEvent::Type::MouseDown, 1);
        return 0;
    case WM_RBUTTONUP:
        dispatch_mouse(InputEvent::Type::MouseUp, 1);
        return 0;
    case WM_MBUTTONDOWN:
        dispatch_mouse(InputEvent::Type::MouseDown, 2);
        return 0;
    case WM_MBUTTONUP:
        dispatch_mouse(InputEvent::Type::MouseUp, 2);
        return 0;
    case WM_MOUSEWHEEL: {
        float notches = static_cast<float>(GET_WHEEL_DELTA_WPARAM(wParam)) / static_cast<float>(WHEEL_DELTA);
        dispatch_mouse(InputEvent::Type::MouseWheel, 0, notches);
        return 0;
    }
    case WM_KEYDOWN: {
        if (onInput) {
            InputEvent ev{};
            ev.type = InputEvent::Type::KeyDown;
            ev.keyCode = static_cast<uint32_t>(wParam);
            ev.ctrlDown = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
            ev.shiftDown = (GetKeyState(VK_SHIFT) & 0x8000) != 0;
            onInput(ev);
        }
        return 0;
    }
    case WM_CHAR: {
        if (onInput) {
            InputEvent ev{};
            ev.type = InputEvent::Type::CharInput;
            ev.charCode = static_cast<uint32_t>(wParam);
            ev.ctrlDown = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
            onInput(ev);
        }
        return 0;
    }
    case WM_CLOSE:
        if (onCloseRequested) {
            onCloseRequested();
        }
        DestroyWindow(hwnd_);
        hwnd_ = nullptr;
        return 0;
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    default:
        break;
    }
    return DefWindowProcW(hwnd_, msg, wParam, lParam);
}

bool Win32Hardware::show_open_json_dialog(std::string& outFilePath) const {
    wchar_t fileBuf[MAX_PATH * 2]{};
    OPENFILENAMEW ofn{};
    ofn.lStructSize = sizeof(ofn);
    ofn.hwndOwner = hwnd_;
    ofn.lpstrFilter = L"CapLab Save JSON (*.json)\0*.json\0All Files (*.*)\0*.*\0";
    ofn.lpstrFile = fileBuf;
    ofn.nMaxFile = static_cast<DWORD>(std::size(fileBuf));
    ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST | OFN_NOCHANGEDIR;
    ofn.lpstrDefExt = L"json";

    if (!GetOpenFileNameW(&ofn)) {
        return false;
    }
    outFilePath = wide_to_utf8(fileBuf);
    return !outFilePath.empty();
}

bool Win32Hardware::show_save_json_dialog(std::string& outFilePath, std::string_view defaultName) const {
    wchar_t fileBuf[MAX_PATH * 2]{};
    std::wstring wideDefault = utf8_to_wide(defaultName);
    if (!wideDefault.empty()) {
        size_t copyLen = std::min(wideDefault.size(), std::size(fileBuf) - 1);
        std::copy_n(wideDefault.data(), copyLen, fileBuf);
        fileBuf[copyLen] = L'\0';
    }

    OPENFILENAMEW ofn{};
    ofn.lStructSize = sizeof(ofn);
    ofn.hwndOwner = hwnd_;
    ofn.lpstrFilter = L"CapLab Save JSON (*.json)\0*.json\0All Files (*.*)\0*.*\0";
    ofn.lpstrFile = fileBuf;
    ofn.nMaxFile = static_cast<DWORD>(std::size(fileBuf));
    ofn.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    ofn.lpstrDefExt = L"json";

    if (!GetSaveFileNameW(&ofn)) {
        return false;
    }
    outFilePath = wide_to_utf8(fileBuf);
    return !outFilePath.empty();
}

bool Win32Hardware::copy_text_to_clipboard(std::string_view utf8Text) const {
    if (!OpenClipboard(hwnd_)) return false;
    EmptyClipboard();

    std::wstring wide = utf8_to_wide(utf8Text);
    size_t bytes = (wide.size() + 1) * sizeof(wchar_t);
    HGLOBAL hMem = GlobalAlloc(GMEM_MOVEABLE, bytes);
    if (!hMem) {
        CloseClipboard();
        return false;
    }
    void* ptr = GlobalLock(hMem);
    if (!ptr) {
        GlobalFree(hMem);
        CloseClipboard();
        return false;
    }
    std::copy_n(wide.c_str(), wide.size() + 1, static_cast<wchar_t*>(ptr));
    GlobalUnlock(hMem);
    SetClipboardData(CF_UNICODETEXT, hMem);
    CloseClipboard();
    return true;
}

std::string Win32Hardware::read_text_from_clipboard() const {
    if (!IsClipboardFormatAvailable(CF_UNICODETEXT)) return {};
    if (!OpenClipboard(hwnd_)) return {};
    std::string result;
    HANDLE hData = GetClipboardData(CF_UNICODETEXT);
    if (hData) {
        const wchar_t* wide = static_cast<const wchar_t*>(GlobalLock(hData));
        if (wide) {
            result = wide_to_utf8(wide);
            GlobalUnlock(hData);
        }
    }
    CloseClipboard();
    return result;
}

} // namespace caplab::platform
