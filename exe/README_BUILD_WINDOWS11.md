# CapLab 13 Native (Windows 11 x64) — Complete Build & Architecture Guide

A 100% custom, zero-third-party-dependency **C++23** native Windows 11 desktop application (`CapLab13Native.exe`) + standalone **`game.exe` Administrator Script Builder** compiled independently via our in-house **PE32+ x86_64 Macro-Assembler & Linker**.

---

## 0. Quick Start (`game.exe` One-Click Administrator Builder)

1. Extract `CapLab13_Windows11_Native.zip` into any folder on Windows 11 (x64).
2. Double-click **`game.exe`** (`CapLab13_Windows11\game.exe`).
3. Approve the Windows UAC Administrator prompt. **`game.exe`** opens the **Interactive Setup GUI (`installer\InstallerGui.ps1` via `installer\LaunchInstaller.bat`)** with hardware preflight detection (CPU threads, RAM, Dedicated GPU) and the embedded **`custom_setup_agent\SetupAgent.ps1`** self-healing build pipeline:
   - **[1/3] Check & Auto-Download Missing Tools**: Detects installed MSVC (`cl.exe`), Clang (`clang++.exe`), or GCC (`g++.exe`) + Windows 11 SDK. If none exist on your PC, it automatically downloads and unpacks the portable LLVM-MinGW UCRT x86_64 C++23 toolchain into `.toolchain\` (zero MSI installers or CMake/Ninja needed).
   - **[2/3] Parallel Native Build & Parity Verification**: Compiles `resources/resource.rc`, all `CapLabEngine` & `CapLab13Native` C++23 translation units across all CPU cores, links `dist\CapLab13Native.exe`, and executes `CapLab13Tests.exe`.
   - **[3/3] Fast Shortcut Creation & dGPU Preference**: Creates **Desktop** and **Start Menu** shortcuts (`CapLab 13 Native.lnk`) and registers Windows High-Performance Graphics (`GpuPreference=2`) for `dist\CapLab13Native.exe`.

### About the Independent Custom Compiler (`custom_compiler/`)

- **`game.exe` is built 100% independently** by our custom Python-stdlib-only x86_64 macro-assembler and PE32+ binary linker (`custom_compiler/custom_pe64_compiler.py` + `builder/game_src.casm`) — emitting DOS/PE32+ headers, ASLR/DEP flags, `.text` RIP-relative machine code, `.rdata` IAT/UTF-16 tables, `.data` static buffers, `.rsrc` `requireAdministrator` manifest, and PE CheckSum without invoking MSVC, GCC, Clang, or any third-party tool.
- **No CMake/Ninja/MSBuild required**: `builder/CustomBuildOrchestrator.ps1` orchestrates multi-core parallel compilation directly.
- **Full C++23 STL + DirectX/Direct2D Game Binary**: Because `src/` uses full ISO C++23 STL templates (`<unordered_map>`, `<filesystem>`, `<algorithm>`) and Windows 11 COM headers (`d3d11_1.h`, `d2d1_1.h`, `dxgi1_6.h`, `dwrite.h`), Step [1/3] automatically ensures a compliant C++23 + Windows SDK toolchain is available locally to compile `CapLab13Native.exe`.

---

## 1. Architecture & Directory Layout (`/exe`)

```text
/exe
├── game.exe                       # Custom-compiled Win64 UAC launcher -> Interactive GUI Installer
├── installer/
│   ├── LaunchInstaller.bat        # STA WinForms Admin launcher with automatic CLI fallback
│   └── InstallerGui.ps1           # Dark-slate Setup GUI + Hardware Preflight + Embedded Setup Agent
├── custom_setup_agent/
│   └── SetupAgent.ps1             # Autonomous self-healing build & domino-risk repair agent
├── builder/
│   ├── game_src.casm              # x86_64 assembly source for game.exe
│   ├── build_pipeline.bat         # Administrator Command Prompt CLI fallback entry
│   └── CustomBuildOrchestrator.ps1# 3-stage custom parallel builder (Tool Check -> Build -> Shortcuts)
├── custom_compiler/
│   ├── custom_pe64_compiler.py    # Zero-dependency x86_64 assembler + PE32+ linker
│   ├── verify_pe64.py             # PE32+ header, IAT, .rsrc manifest & checksum verifier
│   └── package_zip.py             # Rebuilds game.exe and packages clean ZIP archives
├── CMakeLists.txt                # Optional CMake 3.25+ C++23 build (CapLabEngine, CapLab13Native, CapLab13Tests)
├── build_windows11.bat           # One-click MSVC / CMake Windows 11 Release build script
├── build_windows11.ps1           # PowerShell build pipeline (auto-discovers VS 2022 via vswhere)
├── README_BUILD_WINDOWS11.md     # This guide
├── resources/
│   ├── app.manifest              # PerMonitorV2 DPI, UTF-8 ACP, SegmentHeap, Win11 OS ID, asInvoker UAC
│   └── resource.rc               # Embedded Win32 manifest & version metadata
├── src/
│   ├── main.cpp                  # wWinMain loop with QPC delta timing & Flip-Discard Direct2D frame pacing
│   ├── core/
│   │   ├── Types.hpp             # Enums, POD structs, 20 products, 18 facility types, state structs
│   │   ├── PrecisionMath.hpp     # Deterministic FNV-1a hash, JS-parity Math.round half-up, currency formatters
│   │   └── JsonSerializer.hpp/.cpp # Custom recursive-descent JSON parser (prototype-pollution safe) & exporter
│   ├── engine/
│   │   ├── ProductsData.hpp/.cpp # 20-product supply chain, recipes, base costs/prices, R&D lead multipliers
│   │   ├── SpatialGrid.hpp/.cpp  # 32x32 city map generator, traffic index, 8 Pemkot civic housing blocks
│   │   ├── DemandMacro.hpp/.cpp  # 4-phase macroeconomic cycle, price/quality/brand utility curve
│   │   ├── FacilityUnits.hpp/.cpp# 3x3 internal unit matrix, COO auto-pricing, wholesale/retail routing
│   │   ├── EconomyEngine.hpp/.cpp# Monthly tick simulation (production, sales, R&D, real estate, cashflow)
│   │   ├── StockMarket.hpp/.cpp  # Exchange trades, rights issues, 65%-asset loans, M&A + AI entrant replenishment
│   │   ├── AICompetitor.hpp/.cpp # 9 specialized AI conglomerates with sector-focused autonomous expansion
│   │   └── SaveSystem.hpp/.cpp   # Default world generator, JSON hydration, atomic AppData file save/load
│   ├── platform/
│   │   └── Win32Hardware.hpp/.cpp# Win32 window, DWM dark mode + rounded corners, MMCSS, QPC, file dialogs, clipboard
│   ├── graphics/
│   │   └── D2DRenderer.hpp/.cpp  # Direct3D 11 + DXGI 1.6 Flip-Discard + Direct2D 1.1 + DirectWrite + offscreen bake
│   ├── renderer/
│   │   └── IsometricEngine.hpp/.cpp # 18 procedural 2.5D buildings, offscreen terrain cache, 10 vehicles, 20-slot particle ring
│   └── ui/
│       ├── UIWidgets.hpp/.cpp    # Dark-slate palette, HitRegistry, ScrollState, charts, custom icons & sliders
│       └── GameApp.hpp/.cpp      # Full 5-tab UI, News/Build/Facility Drawer modals, keyboard shortcuts, toasts
└── tests/
    └── NativeParityTests.cpp     # Automated parity checks + 120-month simulation stress benchmark
```

---

## 2. Windows 11 Hardware & OS Capabilities

- **Dedicated GPU Rendering Pipeline**: `D2DRenderer` enumerates non-software DXGI adapters (`CreateDXGIFactory1` / `EnumAdapters1`), selects the hardware adapter with the highest `DedicatedVideoMemory`, and exports `NvOptimusEnablement` + `AmdPowerXpressRequestHighPerformance` -> `IDXGISwapChain1` (`DXGI_SWAP_EFFECT_FLIP_DISCARD`, optional tearing check via `IDXGIFactory5`) -> `ID2D1DeviceContext` (Direct2D 1.1) + DirectWrite (`Segoe UI` & `Consolas`).
- **Multi-Core CPU Offloading**: `SimulationWorker` executes monthly economic calculations and parallelizes AI competitor turns (`AICompetitor.cpp`) on background CPU threads with epoch-based invalidation so rendering stays lock-free.
- **Minimalist Executive HUD**: Compact 44px single-row command bar, 68px icon rail, and Capitalism Lab-style 3×3 mini unit matrix on map & operational cards.
- **Offscreen Static Ground Caching**: The 32×32 static terrain tiles (roads, grass checkerboard, industrial zones, pavements) are baked once into an offscreen `ID2D1Bitmap` (`begin_offscreen_bake` / `end_offscreen_bake`) for constant-time panning and zooming.
- **Windows 11 Scheduling & Power Control**:
  - `SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)` + `WM_DPICHANGED` live rescaling.
  - `DwmSetWindowAttribute` (`DWMWA_USE_IMMERSIVE_DARK_MODE` + `DWMWA_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND`).
  - `SetProcessInformation(..., ProcessPowerThrottling, ...)` disables EcoQoS execution speed throttling during active gameplay.
  - `AvSetMmThreadCharacteristicsW(L"Games", ...)` registers the main loop with MMCSS alongside `timeBeginPeriod(1)` and `QueryPerformanceCounter`.
  - Application manifest opts into Windows Segment Heap (`SegmentHeap`), UTF-8 active code page (`UTF-8`), Long Path Awareness, and standard least-privilege UAC (`asInvoker`).

---

## 3. Prerequisites on Windows 11 (x64)

Install **one** of the following toolchains on Windows 11 (64-bit):

1. **Recommended — Visual Studio 2022 (v17.8+) or Visual Studio Build Tools 2022**
   - Workload: **Desktop development with C++**
   - Components:
     - MSVC v143 - VS 2022 C++ x64/x86 build tools (Latest)
     - **Windows 11 SDK (10.0.22621.0 or newer)**
     - C++ CMake tools for Windows (optional if CMake is installed separately)
2. **CMake 3.25+** (if not using the bundled Visual Studio CMake)
   - Verify with `cmake --version` in PowerShell / Command Prompt.
3. **Alternative Toolchain (LLVM-MinGW / MSYS2 Clang64 or UCRT64)**
   - `x86_64` GCC 13+ or Clang 17+ with Windows 11 Win32/D2D/DXGI/DWrite import libraries (`d3d11`, `dxgi`, `d2d1`, `dwrite`, `dwmapi`, `shcore`, `avrt`, `winmm`, `comdlg32`).

---

## 4. Building `CapLab13Native.exe`

### Option A: Automated PowerShell Pipeline (Recommended)

Open **PowerShell** inside the `/exe` directory and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\build_windows11.ps1
```

What this script does automatically:
1. Locates Visual Studio 2022 x64 environment via `vswhere.exe` (if `cl.exe`/`clang++` is not already on `PATH`).
2. Configures a C++23 Release build (`cmake -S . -B build -DCMAKE_BUILD_TYPE=Release`).
3. Compiles `CapLabEngine`, `CapLab13Native.exe`, and `CapLab13Tests.exe` in parallel with AVX2 + LTCG/LTO.
4. Runs `ctest --test-dir build -C Release --output-on-failure` to verify 100% pass on parity & 120-month stress tests.
5. Copies the final standalone executable to `.\dist\CapLab13Native.exe`.

### Option B: Direct Batch Script (`x64 Native Tools Command Prompt for VS 2022`)

Open **x64 Native Tools Command Prompt for VS 2022**, change into `/exe`, and run:

```bat
build_windows11.bat
```

If CMake is unavailable, `build_windows11.bat` automatically falls back to invoking `rc.exe` + `cl.exe /std:c++23 /O2 /GL /arch:AVX2` directly and outputs `.\dist\CapLab13Native.exe`.

### Option C: Manual CMake Commands (Ninja or Visual Studio Generator)

```powershell
cd exe
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release --parallel
ctest --test-dir build -C Release --output-on-failure
```

The built binary is at `build\Release\CapLab13Native.exe`.

---

## 5. Save Data & Browser <-> Native JSON Compatibility

- **Automatic Local Save Location**:
  `%LOCALAPPDATA%\CapLab13Native\autosave.json`
  Written atomically via `.tmp` write + flush + rename on throttled ticks and clean window close.
- **Bidirectional JSON Interoperability**:
  - From **Korporat -> Simpan & Data**:
    - **Ekspor JSON Cadangan (.json)**: Opens native Windows Save File dialog to export a `.json` file loadable in the browser version.
    - **Muat JSON dari Berkas (.json)**: Opens native Windows Open File dialog to load a `.json` save exported from either the browser or native app.
    - **Tempel JSON dari Clipboard (`Ctrl+V`)**: Imports save JSON directly from the Windows Unicode clipboard.

---

## 6. Controls & Keyboard Shortcuts

- **Map Navigation**: Left-click & drag to pan (with velocity inertia), Mouse Wheel to zoom (`0.4x`–`2.2x`), Left-click tile or 2.5D building to select.
- **`Space`**: Toggle Simulation Pause / Resume
- **`1` / `2` / `3`**: Switch simulation speed (`1x`, `2x`, `5x`)
- **`5`**: Quick-switch to `5x` simulation speed
- **`N`**: Advance 1 simulation month immediately (`Next Month`)
- **`B`**: Open Build Facility Modal (`Bangun Fasilitas`)
- **`Esc`**: Close active modal / Facility Drawer
- **`Ctrl+V`**: Import JSON save state from Windows Clipboard (when on `Korporat -> Simpan & Data`)
