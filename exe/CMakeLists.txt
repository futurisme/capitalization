cmake_minimum_required(VERSION 3.25)
project(CapLab13Native VERSION 13.0.0 LANGUAGES CXX RC)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT WIN32)
    message(FATAL_ERROR "CapLab13Native targets Windows 11 (x86_64) using native Win32, Direct3D 11, DXGI 1.6, Direct2D 1.1, and DirectWrite.")
endif()

add_compile_definitions(
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    UNICODE
    _UNICODE
    _WIN32_WINNT=0x0A00
    NTDDI_VERSION=0x0A000010
)

set(CAPLAB_ENGINE_SOURCES
    src/core/JsonSerializer.cpp
    src/engine/ProductsData.cpp
    src/engine/SpatialGrid.cpp
    src/engine/DemandMacro.cpp
    src/engine/FacilityUnits.cpp
    src/engine/SaveSystem.cpp
    src/engine/EconomyEngine.cpp
    src/engine/StockMarket.cpp
    src/engine/AICompetitor.cpp
    src/engine/SimulationWorker.cpp
)

add_library(CapLabEngine STATIC ${CAPLAB_ENGINE_SOURCES})
target_include_directories(CapLabEngine PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)

add_executable(CapLab13Native WIN32
    src/main.cpp
    src/platform/Win32Hardware.cpp
    src/graphics/D2DRenderer.cpp
    src/renderer/IsometricEngine.cpp
    src/ui/UIWidgets.cpp
    src/ui/GameApp.cpp
    resources/resource.rc
)
target_link_libraries(CapLab13Native PRIVATE
    CapLabEngine
    user32
    gdi32
    d3d11
    dxgi
    d2d1
    dwrite
    dwmapi
    shcore
    shell32
    ole32
    comdlg32
    winmm
    avrt
    uuid
    dxguid
)

# Prevent duplicate manifest errors if MSVC auto-generates one
if(MSVC)
    target_compile_options(CapLabEngine PRIVATE /W4 /O2 /Oi /Ot /GL /utf-8 /EHsc)
    target_compile_options(CapLab13Native PRIVATE /W4 /O2 /Oi /Ot /GL /utf-8 /EHsc)
    target_link_options(CapLab13Native PRIVATE /LTCG /MANIFEST:NO /SUBSYSTEM:WINDOWS)
elseif(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
    target_compile_options(CapLabEngine PRIVATE -Wall -Wextra -O3 -march=x86-64 -mtune=generic)
    target_compile_options(CapLab13Native PRIVATE -Wall -Wextra -O3 -march=x86-64 -mtune=generic)
    target_link_options(CapLab13Native PRIVATE -mwindows -municode -static)
endif()

# Native C++23 Parity & Benchmark Test Runner
enable_testing()
add_executable(CapLab13Tests
    tests/NativeParityTests.cpp
)
target_link_libraries(CapLab13Tests PRIVATE CapLabEngine)
if(MSVC)
    target_compile_options(CapLab13Tests PRIVATE /W4 /O2 /Oi /Ot /utf-8 /EHsc)
elseif(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
    target_compile_options(CapLab13Tests PRIVATE -Wall -Wextra -O3 -march=x86-64 -mtune=generic)
    target_link_options(CapLab13Tests PRIVATE -static)
endif()
add_test(NAME NativeParityTests COMMAND CapLab13Tests)
