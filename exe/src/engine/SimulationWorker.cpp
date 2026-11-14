#include "SimulationWorker.hpp"
#include "AICompetitor.hpp"
#include "EconomyEngine.hpp"

#include <utility>

namespace caplab {

SimulationWorker::~SimulationWorker() {
    stop();
}

void SimulationWorker::start() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (running_) return;
    running_ = true;
    hasJob_ = false;
    busy_ = false;
    completed_.reset();
    worker_ = std::thread(&SimulationWorker::worker_loop, this);
}

void SimulationWorker::stop() {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!running_) return;
        running_ = false;
        hasJob_ = false;
    }
    cv_.notify_all();
    if (worker_.joinable()) {
        worker_.join();
    }
}

void SimulationWorker::invalidate(uint64_t newEpoch) noexcept {
    activeEpoch_.store(newEpoch, std::memory_order_release);
    std::lock_guard<std::mutex> lock(mutex_);
    if (completed_ && completed_->epoch != newEpoch) {
        completed_.reset();
    }
}

bool SimulationWorker::try_submit(uint64_t epoch, SimulationState snapshot, bool emitParticles) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!running_) {
        running_ = true;
        worker_ = std::thread(&SimulationWorker::worker_loop, this);
    }
    if (busy_ || hasJob_) {
        return false;
    }
    activeEpoch_.store(epoch, std::memory_order_release);
    jobEpoch_ = epoch;
    jobEmitParticles_ = emitParticles;
    jobSnapshot_ = std::move(snapshot);
    hasJob_ = true;
    busy_ = true;
    cv_.notify_one();
    return true;
}

bool SimulationWorker::poll_completed(uint64_t expectedEpoch, CompletedSimulationTick& outTick) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!completed_) return false;
    if (completed_->epoch != expectedEpoch) {
        completed_.reset();
        return false;
    }
    outTick = std::move(*completed_);
    completed_.reset();
    return true;
}

bool SimulationWorker::is_busy() const noexcept {
    std::lock_guard<std::mutex> lock(mutex_);
    return busy_;
}

void SimulationWorker::worker_loop() {
    for (;;) {
        uint64_t localEpoch = 0;
        bool localEmit = true;
        SimulationState inputState;

        {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait(lock, [this]() { return !running_ || hasJob_; });
            if (!running_) break;

            localEpoch = jobEpoch_;
            localEmit = jobEmitParticles_;
            inputState = std::move(jobSnapshot_);
            hasJob_ = false;
        }

        // Skip stale work immediately if UI already mutated state
        if (activeEpoch_.load(std::memory_order_acquire) != localEpoch) {
            std::lock_guard<std::mutex> lock(mutex_);
            busy_ = false;
            continue;
        }

        SimulationState afterEcon = simulate_economic_month(inputState);
        if (activeEpoch_.load(std::memory_order_acquire) != localEpoch) {
            std::lock_guard<std::mutex> lock(mutex_);
            busy_ = false;
            continue;
        }

        SimulationState afterAI = ai::simulate_ai_competitors(afterEcon);

        {
            std::lock_guard<std::mutex> lock(mutex_);
            if (activeEpoch_.load(std::memory_order_acquire) == localEpoch) {
                completed_ = CompletedSimulationTick{localEpoch, localEmit, std::move(afterAI)};
            }
            busy_ = false;
        }
    }
}

} // namespace caplab
