#include "JsonSerializer.hpp"
#include "PrecisionMath.hpp"
#include "../engine/ProductsData.hpp"

#include <charconv>
#include <cmath>
#include <cstdio>
#include <unordered_set>

namespace caplab::json {

namespace {

constexpr int MAX_JSON_DEPTH = 64;

inline const std::string& empty_str() noexcept {
    static const std::string s;
    return s;
}

class Parser {
public:
    explicit Parser(std::string_view src) noexcept : src_(src), pos_(0) {}

    std::optional<JsonValue> parse_root() {
        skip_ws();
        // Skip optional UTF-8 BOM
        if (src_.size() >= 3 &&
            static_cast<unsigned char>(src_[0]) == 0xEF &&
            static_cast<unsigned char>(src_[1]) == 0xBB &&
            static_cast<unsigned char>(src_[2]) == 0xBF) {
            pos_ = 3;
            skip_ws();
        }
        auto val = parse_value(0);
        if (!val) return std::nullopt;
        skip_ws();
        if (pos_ != src_.size()) return std::nullopt;
        return val;
    }

private:
    std::string_view src_;
    size_t pos_;

    void skip_ws() noexcept {
        while (pos_ < src_.size()) {
            char c = src_[pos_];
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                ++pos_;
            } else {
                break;
            }
        }
    }

    std::optional<JsonValue> parse_value(int depth) {
        if (depth > MAX_JSON_DEPTH) return std::nullopt;
        skip_ws();
        if (pos_ >= src_.size()) return std::nullopt;

        char c = src_[pos_];
        if (c == '{') return parse_object(depth + 1);
        if (c == '[') return parse_array(depth + 1);
        if (c == '"') {
            auto s = parse_string();
            if (!s) return std::nullopt;
            return JsonValue(std::move(*s));
        }
        if (c == 't') {
            if (src_.substr(pos_, 4) == "true") {
                pos_ += 4;
                return JsonValue(true);
            }
            return std::nullopt;
        }
        if (c == 'f') {
            if (src_.substr(pos_, 5) == "false") {
                pos_ += 5;
                return JsonValue(false);
            }
            return std::nullopt;
        }
        if (c == 'n') {
            if (src_.substr(pos_, 4) == "null") {
                pos_ += 4;
                return JsonValue(nullptr);
            }
            return std::nullopt;
        }
        if (c == '-' || (c >= '0' && c <= '9')) {
            return parse_number();
        }
        return std::nullopt;
    }

    std::optional<std::string> parse_string() {
        if (pos_ >= src_.size() || src_[pos_] != '"') return std::nullopt;
        ++pos_;
        std::string out;
        while (pos_ < src_.size()) {
            const size_t chunkStart = pos_;
            while (pos_ < src_.size()) {
                const unsigned char uc = static_cast<unsigned char>(src_[pos_]);
                if (uc == '"' || uc == '\\') break;
                if (uc < 0x20) return std::nullopt;
                ++pos_;
            }
            if (pos_ > chunkStart) {
                out.append(src_.data() + chunkStart, pos_ - chunkStart);
            }
            if (pos_ >= src_.size()) return std::nullopt;
            const char c = src_[pos_++];
            if (c == '"') return out;
            // c == '\\'
            if (pos_ >= src_.size()) return std::nullopt;
            char esc = src_[pos_++];
            switch (esc) {
                case '"': out.push_back('"'); break;
                case '\\': out.push_back('\\'); break;
                case '/': out.push_back('/'); break;
                case 'b': out.push_back('\b'); break;
                case 'f': out.push_back('\f'); break;
                case 'n': out.push_back('\n'); break;
                case 'r': out.push_back('\r'); break;
                case 't': out.push_back('\t'); break;
                case 'u': {
                    auto cp = parse_hex4();
                    if (!cp) return std::nullopt;
                    uint32_t code = *cp;
                    if (code >= 0xD800 && code <= 0xDBFF) {
                        if (pos_ + 6 <= src_.size() && src_[pos_] == '\\' && src_[pos_ + 1] == 'u') {
                            pos_ += 2;
                            auto low = parse_hex4();
                            if (!low || *low < 0xDC00 || *low > 0xDFFF) return std::nullopt;
                            code = 0x10000 + (((code - 0xD800) << 10) | (*low - 0xDC00));
                        } else {
                            return std::nullopt;
                        }
                    }
                    append_utf8(out, code);
                    break;
                }
                default: return std::nullopt;
            }
        }
        return std::nullopt;
    }

    std::optional<uint32_t> parse_hex4() noexcept {
        if (pos_ + 4 > src_.size()) return std::nullopt;
        uint32_t v = 0;
        for (int i = 0; i < 4; ++i) {
            char c = src_[pos_++];
            v <<= 4;
            if (c >= '0' && c <= '9') v |= static_cast<uint32_t>(c - '0');
            else if (c >= 'a' && c <= 'f') v |= static_cast<uint32_t>(10 + c - 'a');
            else if (c >= 'A' && c <= 'F') v |= static_cast<uint32_t>(10 + c - 'A');
            else return std::nullopt;
        }
        return v;
    }

    static void append_utf8(std::string& out, uint32_t cp) {
        if (cp <= 0x7F) {
            out.push_back(static_cast<char>(cp));
        } else if (cp <= 0x7FF) {
            out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else if (cp <= 0xFFFF) {
            out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else {
            out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        }
    }

    std::optional<JsonValue> parse_number() noexcept {
        size_t start = pos_;
        if (src_[pos_] == '-') ++pos_;
        if (pos_ >= src_.size()) return std::nullopt;
        if (src_[pos_] == '0') {
            ++pos_;
        } else if (src_[pos_] >= '1' && src_[pos_] <= '9') {
            while (pos_ < src_.size() && src_[pos_] >= '0' && src_[pos_] <= '9') ++pos_;
        } else {
            return std::nullopt;
        }

        if (pos_ < src_.size() && src_[pos_] == '.') {
            ++pos_;
            if (pos_ >= src_.size() || src_[pos_] < '0' || src_[pos_] > '9') return std::nullopt;
            while (pos_ < src_.size() && src_[pos_] >= '0' && src_[pos_] <= '9') ++pos_;
        }
        if (pos_ < src_.size() && (src_[pos_] == 'e' || src_[pos_] == 'E')) {
            ++pos_;
            if (pos_ < src_.size() && (src_[pos_] == '+' || src_[pos_] == '-')) ++pos_;
            if (pos_ >= src_.size() || src_[pos_] < '0' || src_[pos_] > '9') return std::nullopt;
            while (pos_ < src_.size() && src_[pos_] >= '0' && src_[pos_] <= '9') ++pos_;
        }

        double val = 0.0;
        const char* first = src_.data() + start;
        const char* last = src_.data() + pos_;
        auto res = std::from_chars(first, last, val);
        if (res.ec != std::errc() || res.ptr != last || !std::isfinite(val)) {
            return std::nullopt;
        }
        return JsonValue(val);
    }

    std::optional<JsonValue> parse_array(int depth) {
        ++pos_; // skip '['
        JsonArray arr;
        skip_ws();
        if (pos_ < src_.size() && src_[pos_] == ']') {
            ++pos_;
            return JsonValue(std::move(arr));
        }
        while (true) {
            auto elem = parse_value(depth);
            if (!elem) return std::nullopt;
            arr.push_back(std::move(*elem));
            skip_ws();
            if (pos_ >= src_.size()) return std::nullopt;
            if (src_[pos_] == ']') {
                ++pos_;
                return JsonValue(std::move(arr));
            }
            if (src_[pos_] != ',') return std::nullopt;
            ++pos_;
        }
    }

    std::optional<JsonValue> parse_object(int depth) {
        ++pos_; // skip '{'
        JsonObject obj;
        skip_ws();
        if (pos_ < src_.size() && src_[pos_] == '}') {
            ++pos_;
            return JsonValue(std::move(obj));
        }
        while (true) {
            skip_ws();
            auto key = parse_string();
            if (!key) return std::nullopt;
            skip_ws();
            if (pos_ >= src_.size() || src_[pos_] != ':') return std::nullopt;
            ++pos_;
            auto val = parse_value(depth);
            if (!val) return std::nullopt;
            // Strip prototype pollution keys just like sanitizeParsedJson in TS
            if (*key != "__proto__" && *key != "constructor" && *key != "prototype") {
                obj.emplace_back(std::move(*key), std::move(*val));
            }
            skip_ws();
            if (pos_ >= src_.size()) return std::nullopt;
            if (src_[pos_] == '}') {
                ++pos_;
                return JsonValue(std::move(obj));
            }
            if (src_[pos_] != ',') return std::nullopt;
            ++pos_;
        }
    }
};

void write_escaped_string(std::string& out, std::string_view s) {
    out.push_back('"');
    for (unsigned char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned int>(c));
                    out += buf;
                } else {
                    out.push_back(static_cast<char>(c));
                }
                break;
        }
    }
    out.push_back('"');
}

void write_number(std::string& out, double d) {
    if (!std::isfinite(d)) {
        out += "0";
        return;
    }
    if (d == 0.0) {
        out += "0";
        return;
    }
    double integral = 0.0;
    if (std::modf(d, &integral) == 0.0 &&
        d >= static_cast<double>(std::numeric_limits<int64_t>::min()) &&
        d <= static_cast<double>(std::numeric_limits<int64_t>::max())) {
        char buf[32];
        auto res = std::to_chars(buf, buf + sizeof(buf), static_cast<int64_t>(d));
        out.append(buf, res.ptr);
        return;
    }
    char buf[64];
    auto res = std::to_chars(buf, buf + sizeof(buf), d, std::chars_format::general, 15);
    if (res.ec == std::errc()) {
        out.append(buf, res.ptr);
    } else {
        out += "0";
    }
}

void write_indent(std::string& out, int indent) {
    out.append(static_cast<size_t>(indent) * 2, ' ');
}

void stringify_impl(std::string& out, const JsonValue& v, bool pretty, int depth) {
    if (v.is_null()) {
        out += "null";
    } else if (v.is_bool()) {
        out += v.as_bool() ? "true" : "false";
    } else if (v.is_number()) {
        write_number(out, v.as_double());
    } else if (v.is_string()) {
        write_escaped_string(out, v.as_string());
    } else if (const auto* arr = v.as_array()) {
        if (arr->empty()) {
            out += "[]";
            return;
        }
        out.push_back('[');
        for (size_t i = 0; i < arr->size(); ++i) {
            if (i > 0) out.push_back(',');
            if (pretty) {
                out.push_back('\n');
                write_indent(out, depth + 1);
            }
            stringify_impl(out, (*arr)[i], pretty, depth + 1);
        }
        if (pretty) {
            out.push_back('\n');
            write_indent(out, depth);
        }
        out.push_back(']');
    } else if (const auto* obj = v.as_object()) {
        if (obj->empty()) {
            out += "{}";
            return;
        }
        out.push_back('{');
        for (size_t i = 0; i < obj->size(); ++i) {
            if (i > 0) out.push_back(',');
            if (pretty) {
                out.push_back('\n');
                write_indent(out, depth + 1);
            }
            write_escaped_string(out, (*obj)[i].first);
            out += pretty ? ": " : ":";
            stringify_impl(out, (*obj)[i].second, pretty, depth + 1);
        }
        if (pretty) {
            out.push_back('\n');
            write_indent(out, depth);
        }
        out.push_back('}');
    }
}

JsonValue to_json_unit(const InternalUnit& u) {
    JsonObject obj;
    obj.emplace_back("id", u.id);
    obj.emplace_back("slotIndex", u.slotIndex);
    obj.emplace_back("type", unit_type_to_str(u.type));
    obj.emplace_back("name", u.name);
    if (u.hasTargetProduct) {
        obj.emplace_back("targetProductId", product_id_to_str(u.targetProductId));
    }
    if (!u.supplierFacilityId.empty()) {
        obj.emplace_back("supplierFacilityId", u.supplierFacilityId);
    }
    obj.emplace_back("level", u.level);
    obj.emplace_back("capacity", u.capacity);
    obj.emplace_back("currentInventory", u.currentInventory);
    obj.emplace_back("maxInventory", u.maxInventory);
    obj.emplace_back("monthlyCost", u.monthlyCost);
    obj.emplace_back("efficiency", u.efficiency);
    return JsonValue(std::move(obj));
}

JsonValue to_json_facility(const Facility& f) {
    JsonObject obj;
    obj.emplace_back("id", f.id);
    obj.emplace_back("companyId", f.companyId);
    obj.emplace_back("name", f.name);
    obj.emplace_back("type", facility_type_to_str(f.type));
    obj.emplace_back("tileX", f.tileX);
    obj.emplace_back("tileY", f.tileY);
    obj.emplace_back("level", f.level);
    obj.emplace_back("createdMonth", f.createdMonth);

    JsonArray units;
    units.reserve(f.units.size());
    for (const auto& u : f.units) units.push_back(to_json_unit(u));
    obj.emplace_back("units", std::move(units));

    obj.emplace_back("sellingPrice", f.sellingPrice);
    obj.emplace_back("adBudget", f.adBudget);
    obj.emplace_back("monthlyMaintenance", f.monthlyMaintenance);
    obj.emplace_back("autoPricing", f.autoPricing);
    obj.emplace_back("monthlyProduction", f.monthlyProduction);
    obj.emplace_back("monthlySales", f.monthlySales);
    obj.emplace_back("monthlyRevenue", f.monthlyRevenue);
    obj.emplace_back("monthlyCostOfGoods", f.monthlyCostOfGoods);
    obj.emplace_back("monthlyProfit", f.monthlyProfit);
    obj.emplace_back("lastMonthUnitsSold", f.lastMonthUnitsSold);
    obj.emplace_back("inventoryLevel", f.inventoryLevel);
    obj.emplace_back("inventoryCapacity", f.inventoryCapacity);
    obj.emplace_back("qualityRating", f.qualityRating);
    obj.emplace_back("brandRating", f.brandRating);
    if (!f.supplySourceLabel.empty()) {
        obj.emplace_back("supplySourceLabel", f.supplySourceLabel);
    }
    return JsonValue(std::move(obj));
}

JsonValue to_json_company(const Company& c) {
    JsonObject obj;
    obj.emplace_back("id", c.id);
    obj.emplace_back("name", c.name);
    obj.emplace_back("ticker", c.ticker);
    obj.emplace_back("color", hex_to_css(c.colorHex));
    obj.emplace_back("accentColor", hex_to_css(c.accentColorHex));
    obj.emplace_back("isPlayer", c.isPlayer);
    obj.emplace_back("ceoName", c.ceoName);
    obj.emplace_back("ceoAvatar", c.ceoAvatar);
    obj.emplace_back("ceoIcon", c.ceoIcon);
    obj.emplace_back("lastConstructedTick", c.lastConstructedTick);
    if (c.personality != AIPersonality::None) {
        obj.emplace_back("personality", ai_personality_to_str(c.personality));
    }
    if (!c.sectorFocus.empty()) obj.emplace_back("sectorFocus", c.sectorFocus);
    obj.emplace_back("brandStrategy", brand_strategy_to_str(c.brandStrategy));
    obj.emplace_back("corporateBrandRating", c.corporateBrandRating);

    JsonArray execs;
    for (const auto& e : c.executives) {
        JsonObject eo;
        eo.emplace_back("id", e.id);
        eo.emplace_back("role", exec_role_to_str(e.role));
        eo.emplace_back("name", e.name);
        eo.emplace_back("specialty", e.specialty);
        eo.emplace_back("skillRating", e.skillRating);
        eo.emplace_back("monthlySalary", e.monthlySalary);
        eo.emplace_back("hired", e.hired);
        execs.emplace_back(std::move(eo));
    }
    obj.emplace_back("executives", std::move(execs));

    obj.emplace_back("cash", static_cast<double>(c.cash));
    obj.emplace_back("debt", static_cast<double>(c.debt));
    obj.emplace_back("bondDebt", static_cast<double>(c.bondDebt));
    obj.emplace_back("monthlyInterestRate", c.monthlyInterestRate);
    obj.emplace_back("sharesOutstanding", static_cast<double>(c.sharesOutstanding));
    obj.emplace_back("treasuryShares", static_cast<double>(c.treasuryShares));
    obj.emplace_back("stockPrice", c.stockPrice);

    JsonArray sph;
    for (double p : c.sharePriceHistory) sph.emplace_back(p);
    obj.emplace_back("sharePriceHistory", std::move(sph));
    obj.emplace_back("dividendPerShare", c.dividendPerShare);

    JsonObject sh;
    for (const auto& [k, v] : c.shareholdings) {
        sh.emplace_back(k, static_cast<double>(v));
    }
    obj.emplace_back("shareholdings", std::move(sh));

    JsonObject tl;
    for (size_t i = 0; i < PRODUCT_COUNT; ++i) {
        tl.emplace_back(product_id_to_str(static_cast<ProductId>(i)), c.techLevels[i]);
    }
    obj.emplace_back("techLevels", std::move(tl));
    obj.emplace_back("activeResearchProduct", product_id_to_str(c.activeResearchProduct));

    JsonObject hist;
    JsonArray hm, hr, hp, hc, hmc;
    for (const auto& m : c.history.months) hm.emplace_back(m);
    for (int v : c.history.revenue) hr.emplace_back(v);
    for (int v : c.history.netProfit) hp.emplace_back(v);
    for (int64_t v : c.history.cash) hc.emplace_back(static_cast<double>(v));
    for (int64_t v : c.history.marketCap) hmc.emplace_back(static_cast<double>(v));
    hist.emplace_back("months", std::move(hm));
    hist.emplace_back("revenue", std::move(hr));
    hist.emplace_back("netProfit", std::move(hp));
    hist.emplace_back("cash", std::move(hc));
    hist.emplace_back("marketCap", std::move(hmc));
    obj.emplace_back("history", std::move(hist));

    obj.emplace_back("facilitiesCount", c.facilitiesCount);
    obj.emplace_back("totalAssets", static_cast<double>(c.totalAssets));
    obj.emplace_back("bookValue", static_cast<double>(c.bookValue));
    obj.emplace_back("marketCap", static_cast<double>(c.marketCap));
    obj.emplace_back("lastMonthRevenue", c.lastMonthRevenue);
    obj.emplace_back("lastMonthNetProfit", c.lastMonthNetProfit);
    obj.emplace_back("peRatio", c.peRatio);
    obj.emplace_back("marketSharePercentage", c.marketSharePercentage);

    return JsonValue(std::move(obj));
}

} // namespace

bool JsonValue::as_bool(bool fallback) const noexcept {
    if (auto* b = std::get_if<bool>(&data)) return *b;
    return fallback;
}

double JsonValue::as_double(double fallback) const noexcept {
    if (auto* d = std::get_if<double>(&data)) return math::finite_or(*d, fallback);
    return fallback;
}

int JsonValue::as_int(int fallback) const noexcept {
    if (auto* d = std::get_if<double>(&data)) {
        return std::isfinite(*d) ? static_cast<int>(*d) : fallback;
    }
    return fallback;
}

int64_t JsonValue::as_i64(int64_t fallback) const noexcept {
    if (auto* d = std::get_if<double>(&data)) {
        return std::isfinite(*d) ? static_cast<int64_t>(*d) : fallback;
    }
    return fallback;
}

const std::string& JsonValue::as_string() const noexcept {
    if (auto* s = std::get_if<std::string>(&data)) return *s;
    return empty_str();
}

const JsonArray* JsonValue::as_array() const noexcept {
    return std::get_if<JsonArray>(&data);
}

const JsonObject* JsonValue::as_object() const noexcept {
    return std::get_if<JsonObject>(&data);
}

const JsonValue* JsonValue::find(std::string_view key) const noexcept {
    const auto* obj = as_object();
    if (!obj) return nullptr;
    for (const auto& kv : *obj) {
        if (kv.first == key) return &kv.second;
    }
    return nullptr;
}

std::optional<JsonValue> parse(std::string_view input) {
    Parser p(input);
    return p.parse_root();
}

std::string stringify(const JsonValue& value, bool pretty) {
    std::string out;
    out.reserve(pretty ? 131072 : 65536);
    stringify_impl(out, value, pretty, 0);
    return out;
}

std::string export_simulation_state_json(const SimulationState& state, bool pretty) {
    JsonObject root;
    root.emplace_back("currentTick", state.currentTick);
    root.emplace_back("isPaused", state.isPaused);
    root.emplace_back("simSpeed", state.simSpeed);
    root.emplace_back("dateString", state.dateString);
    root.emplace_back("playerCompanyId", state.playerCompanyId);

    JsonObject companiesObj;
    companiesObj.reserve(state.companies.size());
    std::unordered_set<std::string_view> seenCompanies;
    seenCompanies.reserve(state.companies.size());
    for (const auto& cid : state.companyOrder) {
        auto it = state.companies.find(cid);
        if (it != state.companies.end()) {
            seenCompanies.insert(cid);
            companiesObj.emplace_back(cid, to_json_company(it->second));
        }
    }
    for (const auto& [cid, comp] : state.companies) {
        if (!seenCompanies.contains(cid)) {
            companiesObj.emplace_back(cid, to_json_company(comp));
        }
    }
    root.emplace_back("companies", std::move(companiesObj));

    JsonObject facilitiesObj;
    facilitiesObj.reserve(state.facilities.size());
    std::unordered_set<std::string_view> seenFacilities;
    seenFacilities.reserve(state.facilities.size());
    for (const auto& fid : state.facilityOrder) {
        auto it = state.facilities.find(fid);
        if (it != state.facilities.end()) {
            seenFacilities.insert(fid);
            facilitiesObj.emplace_back(fid, to_json_facility(it->second));
        }
    }
    for (const auto& [fid, fac] : state.facilities) {
        if (!seenFacilities.contains(fid)) {
            facilitiesObj.emplace_back(fid, to_json_facility(fac));
        }
    }
    root.emplace_back("facilities", std::move(facilitiesObj));

    JsonObject cityObj;
    cityObj.emplace_back("name", state.city.name);
    cityObj.emplace_back("population", static_cast<double>(state.city.population));
    cityObj.emplace_back("growthRate", state.city.growthRate);
    cityObj.emplace_back("averageWage", state.city.averageWage);
    cityObj.emplace_back("consumerConfidence", state.city.consumerConfidence);

    JsonObject pStats;
    for (size_t i = 0; i < PRODUCT_COUNT; ++i) {
        const auto& ps = state.city.productStats[i];
        JsonObject psObj;
        psObj.emplace_back("monthlyDemand", ps.monthlyDemand);
        psObj.emplace_back("monthlySupply", ps.monthlySupply);
        psObj.emplace_back("averageMarketPrice", ps.averageMarketPrice);
        psObj.emplace_back("playerMarketShare", ps.playerMarketShare);
        psObj.emplace_back("satisfactionRate", ps.satisfactionRate);
        psObj.emplace_back("seaportImportShare", ps.seaportImportShare);
        pStats.emplace_back(product_id_to_str(static_cast<ProductId>(i)), std::move(psObj));
    }
    cityObj.emplace_back("productStats", std::move(pStats));
    root.emplace_back("city", std::move(cityObj));

    JsonObject macroObj;
    macroObj.emplace_back("cyclePhase", macro_phase_to_str(state.macro.cyclePhase));
    macroObj.emplace_back("gdpGrowthRate", state.macro.gdpGrowthRate);
    macroObj.emplace_back("inflationRate", state.macro.inflationRate);
    macroObj.emplace_back("centralBankRate", state.macro.centralBankRate);
    macroObj.emplace_back("importTariffRate", state.macro.importTariffRate);
    macroObj.emplace_back("monthsInPhase", state.macro.monthsInPhase);
    root.emplace_back("macro", std::move(macroObj));

    JsonArray parcelsArr;
    parcelsArr.reserve(state.mapParcels.size());
    for (const auto& p : state.mapParcels) {
        JsonObject po;
        po.emplace_back("x", p.x);
        po.emplace_back("y", p.y);
        po.emplace_back("terrainType", terrain_to_str(p.terrainType));
        if (!p.facilityId.empty()) po.emplace_back("facilityId", p.facilityId);
        if (!p.ownerCompanyId.empty()) po.emplace_back("ownerCompanyId", p.ownerCompanyId);
        po.emplace_back("isZoneAllowed", p.isZoneAllowed);
        po.emplace_back("landValue", static_cast<double>(p.landValue));
        po.emplace_back("trafficIndex", p.trafficIndex);
        if (!p.districtName.empty()) po.emplace_back("districtName", p.districtName);
        parcelsArr.emplace_back(std::move(po));
    }
    root.emplace_back("mapParcels", std::move(parcelsArr));

    JsonArray txArr;
    for (const auto& t : state.stockTransactions) {
        JsonObject to;
        to.emplace_back("id", t.id);
        to.emplace_back("month", t.month);
        to.emplace_back("buyerCompanyId", t.buyerCompanyId);
        to.emplace_back("targetCompanyId", t.targetCompanyId);
        to.emplace_back("action", stock_action_to_str(t.action));
        to.emplace_back("shares", static_cast<double>(t.shares));
        to.emplace_back("pricePerShare", t.pricePerShare);
        to.emplace_back("totalCost", static_cast<double>(t.totalCost));
        txArr.emplace_back(std::move(to));
    }
    root.emplace_back("stockTransactions", std::move(txArr));

    JsonArray newsArr;
    for (const auto& n : state.newsFeed) {
        JsonObject no;
        no.emplace_back("id", n.id);
        no.emplace_back("month", n.month);
        no.emplace_back("category", news_category_to_str(n.category));
        no.emplace_back("title", n.title);
        no.emplace_back("detail", n.detail);
        newsArr.emplace_back(std::move(no));
    }
    root.emplace_back("newsFeed", std::move(newsArr));

    return stringify(JsonValue(std::move(root)), pretty);
}

bool parse_simulation_state_json(std::string_view jsonText, JsonValue& outRoot) {
    if (jsonText.size() > 4'000'000) return false;
    auto parsed = parse(jsonText);
    if (!parsed || !parsed->is_object()) return false;
    outRoot = std::move(*parsed);
    return true;
}

} // namespace caplab::json
