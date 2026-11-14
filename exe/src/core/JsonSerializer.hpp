#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <variant>
#include <vector>

#include "Types.hpp"

namespace caplab::json {

struct JsonValue;
using JsonArray = std::vector<JsonValue>;
using JsonObject = std::vector<std::pair<std::string, JsonValue>>; // preserves key order deterministically

struct JsonValue {
    using Storage = std::variant<std::nullptr_t, bool, double, std::string, JsonArray, JsonObject>;
    Storage data{nullptr};

    JsonValue() = default;
    JsonValue(std::nullptr_t) : data(nullptr) {}
    JsonValue(bool b) : data(b) {}
    JsonValue(int v) : data(static_cast<double>(v)) {}
    JsonValue(int64_t v) : data(static_cast<double>(v)) {}
    JsonValue(double v) : data(v) {}
    JsonValue(const char* s) : data(std::string(s ? s : "")) {}
    JsonValue(std::string s) : data(std::move(s)) {}
    JsonValue(JsonArray arr) : data(std::move(arr)) {}
    JsonValue(JsonObject obj) : data(std::move(obj)) {}

    bool is_null() const noexcept { return std::holds_alternative<std::nullptr_t>(data); }
    bool is_bool() const noexcept { return std::holds_alternative<bool>(data); }
    bool is_number() const noexcept { return std::holds_alternative<double>(data); }
    bool is_string() const noexcept { return std::holds_alternative<std::string>(data); }
    bool is_array() const noexcept { return std::holds_alternative<JsonArray>(data); }
    bool is_object() const noexcept { return std::holds_alternative<JsonObject>(data); }

    bool as_bool(bool fallback = false) const noexcept;
    double as_double(double fallback = 0.0) const noexcept;
    int as_int(int fallback = 0) const noexcept;
    int64_t as_i64(int64_t fallback = 0) const noexcept;
    const std::string& as_string() const noexcept;
    const JsonArray* as_array() const noexcept;
    const JsonObject* as_object() const noexcept;
    const JsonValue* find(std::string_view key) const noexcept;
};

// High-speed recursive-descent parser with depth limit (64) & prototype-pollution filtering
std::optional<JsonValue> parse(std::string_view input);

// Deterministic serializer (minified or pretty with 2-space indent matching JSON.stringify)
std::string stringify(const JsonValue& value, bool pretty = false);

// Full 1:1 SimulationState JSON round-trip compatible with browser CapLab 13 exports
std::string export_simulation_state_json(const SimulationState& state, bool pretty = true);
bool parse_simulation_state_json(std::string_view jsonText, JsonValue& outRoot);

} // namespace caplab::json
