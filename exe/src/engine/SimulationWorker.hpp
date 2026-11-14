#pragma once

#include "../core/Types.hpp"

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <mutex>
#include <optional>
#include <thread>

namespace caplab {

struct CompletedSimulationTick {
    uint64_t epoch = 0;
    bool emitParticles = true;
    SimulationState nextState;
};

// Offloads monthly economic simulation + multi-core AI competitor evaluation off the GPU render thread.
// Epoch versioning guarantees player UI mutations never race or get overwritten by stale background ticks.
class SimulationWorker {
public:
    SimulationWorker() = default;
    ~SimulationWorker();

    SimulationWorker(const SimulationWorker&) = delete;
    SimulationWorker& operator=(const SimulationWorker&) = delete;

    void start();
    void stop();

    void invalidate(uint64_t newEpoch) noexcept;
    bool try_submit(uint64_t epoch, SimulationState snapshot, bool emitParticles);
    bool poll_completed(uint64_t expectedEpoch, CompletedSimulationTick& outTick);
    bool is_busy() const noexcept;

private:
    void worker_loop();

    mutable std::mutex mutex_;
    std::condition_variable cv_;
    std::thread worker_;
    bool running_ = false;
    bool hasJob_ = false;
    bool busy_ = false;

    uint64_t jobEpoch_ = 0;
    bool jobEmitParticles_ = true;
    SimulationState jobSnapshot_;

    std::optional<CompletedSimulationTick> completed_;
    std::atomic<uint64_t> activeEpoch_{1};
};

} // namespace caplab
