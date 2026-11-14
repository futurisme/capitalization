#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <limits>
#include <string>
#include <string_view>

namespace caplab::math {

inline double finite_or(double value, double fallback = 0.0) noexcept {
    if (!std::isfinite(value)) return fallback;
    return (value == 0.0) ? 0.0 : value;
}

template <typename T>
inline T clamp_val(T value, T min_v, T max_v) noexcept {
    if constexpr (std::is_floating_point_v<T>) {
        if (!std::isfinite(value)) return min_v;
    }
    if (value < min_v) return min_v;
    if (value > max_v) return max_v;
    if constexpr (std::is_floating_point_v<T>) {
        return (value == static_cast<T>(0)) ? static_cast<T>(0) : value;
    }
    return value;
}

// JavaScript Math.round(x) semantics: round half towards +infinity
inline int64_t js_round64(double value) noexcept {
    if (!std::isfinite(value)) return 0;
    double r = std::floor(value + 0.5);
    if (r == 0.0) return 0;
    if (r >= static_cast<double>(std::numeric_limits<int64_t>::max())) {
        return std::numeric_limits<int64_t>::max();
    }
    if (r <= static_cast<double>(std::numeric_limits<int64_t>::min())) {
        return std::numeric_limits<int64_t>::min();
    }
    return static_cast<int64_t>(r);
}

inline int round_currency(double value) noexcept {
    int64_t r = js_round64(value);
    if (r > std::numeric_limits<int>::max()) return std::numeric_limits<int>::max();
    if (r < std::numeric_limits<int>::min()) return std::numeric_limits<int>::min();
    return static_cast<int>(r);
}

inline int64_t round_currency64(double value) noexcept {
    return js_round64(value);
}

inline double round1(double value) noexcept {
    if (!std::isfinite(value)) return 0.0;
    double r = std::floor((value + 1e-12) * 10.0 + 0.5) / 10.0;
    return (r == 0.0) ? 0.0 : r;
}

inline double round2(double value) noexcept {
    if (!std::isfinite(value)) return 0.0;
    double r = std::floor((value + 1e-12) * 100.0 + 0.5) / 100.0;
    return (r == 0.0) ? 0.0 : r;
}

inline double round4(double value) noexcept {
    if (!std::isfinite(value)) return 0.0;
    double r = std::floor((value + 1e-12) * 10000.0 + 0.5) / 10000.0;
    return (r == 0.0) ? 0.0 : r;
}

inline double safe_divide(double numerator, double denominator, double fallback = 0.0) noexcept {
    if (!std::isfinite(numerator) || !std::isfinite(denominator) || denominator == 0.0) {
        return fallback;
    }
    double result = numerator / denominator;
    if (!std::isfinite(result)) return fallback;
    return (result == 0.0) ? 0.0 : result;
}

// Exact 32-bit FNV-1a hash matching precisionMath.ts deterministicHash
inline uint32_t deterministic_hash(std::string_view input, uint32_t seed = 2166136261u) noexcept {
    uint32_t h = seed;
    for (unsigned char ch : input) {
        h ^= static_cast<uint32_t>(ch);
        h *= 16777619u;
    }
    return h;
}

inline std::string format_int_commas(int64_t value) {
    bool neg = value < 0;
    uint64_t abs_val = neg ? static_cast<uint64_t>(-value) : static_cast<uint64_t>(value);
    std::string digits = std::to_string(abs_val);
    std::string out;
    out.reserve(digits.size() + digits.size() / 3 + 2);
    if (neg) out.push_back('-');
    size_t len = digits.size();
    for (size_t i = 0; i < len; ++i) {
        if (i > 0 && (len - i) % 3 == 0) out.push_back(',');
        out.push_back(digits[i]);
    }
    return out;
}

inline std::string format_money(double val) {
    double clean = finite_or(val, 0.0);
    double abs_v = std::abs(clean);
    const char* sign = (clean < 0.0) ? "-" : "";
    char buf[64];
    if (abs_v >= 1'000'000'000.0) {
        std::snprintf(buf, sizeof(buf), "%s$%.2fB", sign, abs_v / 1'000'000'000.0);
        return buf;
    }
    if (abs_v >= 1'000'000.0) {
        std::snprintf(buf, sizeof(buf), "%s$%.2fM", sign, abs_v / 1'000'000.0);
        return buf;
    }
    if (abs_v >= 1'000.0) {
        std::snprintf(buf, sizeof(buf), "%s$%lldK", sign, static_cast<long long>(js_round64(abs_v / 1'000.0)));
        return buf;
    }
    return std::string(sign) + "$" + format_int_commas(js_round64(abs_v));
}

inline std::string format_signed_currency(double val) {
    int64_t rounded = round_currency64(val);
    int64_t abs_v = rounded < 0 ? -rounded : rounded;
    std::string sign = rounded < 0 ? "-" : "";
    return sign + "$" + format_int_commas(abs_v);
}

inline std::string format_cost_short(double val) {
    double clean = finite_or(val, 0.0);
    double abs_v = std::abs(clean);
    const char* sign = (clean < 0.0) ? "-" : "";
    char buf[64];
    if (abs_v >= 1'000'000.0) {
        std::snprintf(buf, sizeof(buf), "%s$%.2fM", sign, abs_v / 1'000'000.0);
        return buf;
    }
    std::snprintf(buf, sizeof(buf), "%s$%lldK", sign, static_cast<long long>(js_round64(abs_v / 1'000.0)));
    return buf;
}

} // namespace caplab::math
