#include "FacilityUnits.hpp"
#include "ProductsData.hpp"
#include "../core/PrecisionMath.hpp"

#include <algorithm>
#include <cmath>

namespace caplab {

int64_t get_facility_upgrade_cost(FacilityType type, int currentLevel) noexcept {
    const auto& spec = get_facility_spec(type);
    const double base = static_cast<double>(spec.constructionCost > 0 ? spec.constructionCost : 500000);
    return math::round_currency64(base * (0.35 + static_cast<double>(std::max(1, currentLevel)) * 0.12));
}

int64_t get_unit_install_cost(UnitType unitType) noexcept {
    if (unitType == UnitType::Rd) return 120000;
    if (unitType == UnitType::Manufacturing) return 85000;
    if (unitType == UnitType::Purchasing || unitType == UnitType::Advertising) return 55000;
    return 45000;
}

int64_t get_unit_upgrade_cost(int currentLevel) noexcept {
    return math::round_currency64(35000.0 * std::pow(1.45, static_cast<double>(std::max(0, currentLevel - 1))));
}

std::vector<InternalUnit> create_default_units_for_facility(
    FacilityType type,
    std::optional<ProductId> targetProduct
) {
    std::vector<InternalUnit> units;

    if (is_store_facility(type)) {
        ProductId prod = targetProduct.value_or(
            type == FacilityType::StoreElectronics ? ProductId::Smartphone
            : type == FacilityType::StoreAuto ? ProductId::Automobile
            : type == FacilityType::StorePharmacy ? ProductId::Medicine
            : type == FacilityType::StoreConvenience ? ProductId::Bread
            : ProductId::FashionApparel
        );

        units.push_back({"unit_purchasing_0", 0, UnitType::Purchasing, "Pengadaan & Impor",
                         true, prod, "seaport", 1,
                         type == FacilityType::StoreAuto ? 400 : 8500,
                         type == FacilityType::StoreAuto ? 40 : 1200,
                         type == FacilityType::StoreAuto ? 600 : 12000,
                         5000, 0.95});
        units.push_back({"unit_advertising_1", 1, UnitType::Advertising, "Promosi & Merchandising",
                         true, prod, "", 1, 10000, 0, 0, 4000, 1.0});
        units.push_back({"unit_sales_4", 4, UnitType::Sales, "Kasir & Penjualan Utama",
                         true, prod, "", 1,
                         type == FacilityType::StoreAuto ? 350 : type == FacilityType::StoreDepartment ? 14000 : 9000,
                         0, 10000, 8000, 1.0});
    } else if (type == FacilityType::FactoryProcessing || type == FacilityType::FactoryAssembly) {
        ProductId prod = targetProduct.value_or(
            type == FacilityType::FactoryProcessing ? ProductId::Steel : ProductId::Smartphone
        );
        units.push_back({"unit_purchasing_0", 0, UnitType::Purchasing, "Pengadaan Material",
                         true, prod, "seaport", 1, 8000, 2000, 16000, 7000, 0.95});
        units.push_back({"unit_manufacturing_4", 4, UnitType::Manufacturing, "Lini Manufaktur Utama",
                         true, prod, "", 1,
                         prod == ProductId::Automobile ? 280 : 6500,
                         0, 10000, 16000, 1.0});
        units.push_back({"unit_inventory_8", 8, UnitType::Inventory, "Gudang Grosir & Ekspedisi",
                         true, prod, "", 1, 15000, 600, 25000, 6000, 1.0});
    } else if (type == FacilityType::WarehouseLogistics) {
        ProductId prod = targetProduct.value_or(ProductId::Bread);
        units.push_back({"unit_purchasing_0", 0, UnitType::Purchasing, "Penerimaan Kargo",
                         true, prod, "seaport", 1, 22000, 2000, 30000, 4500, 1.0});
        units.push_back({"unit_inventory_4", 4, UnitType::Inventory, "Penyimpanan Hub Sentral",
                         true, prod, "", 1, 30000, 3000, 45000, 5500, 1.1});
        units.push_back({"unit_sales_8", 8, UnitType::Sales, "Distribusi Grosir B2B",
                         true, prod, "", 1, 20000, 0, 20000, 4000, 1.05});
    } else if (type == FacilityType::FarmAgriculture || type == FacilityType::MineExtraction || type == FacilityType::PowerPlantGreen) {
        ProductId prod = targetProduct.value_or(
            type == FacilityType::FarmAgriculture ? ProductId::Wheat
            : type == FacilityType::PowerPlantGreen ? ProductId::BatteryCell
            : ProductId::IronOre
        );
        std::string mfgName = type == FacilityType::FarmAgriculture
            ? "Unit Budidaya & Panen"
            : type == FacilityType::PowerPlantGreen
            ? "Turbin Surya & Perakitan Baterai"
            : "Unit Ekstraksi & Pengeboran";
        std::string invName = type == FacilityType::PowerPlantGreen
            ? "Gardu Induk & Gudang Baterai"
            : "Silo Penyimpanan Curah";
        units.push_back({"unit_manufacturing_4", 4, UnitType::Manufacturing, std::move(mfgName),
                         true, prod, "", 1,
                         type == FacilityType::PowerPlantGreen ? 5800 : 14000,
                         0, 15000, 12000, 1.0});
        units.push_back({"unit_inventory_8", 8, UnitType::Inventory, std::move(invName),
                         true, prod, "", 1, 28000, 1800, 35000, 4500, 1.0});
    } else if (is_real_estate_facility(type)) {
        const bool isCommercial = (type == FacilityType::CommercialTower);
        const bool isCivic = (type == FacilityType::CivicHousing);
        std::string salesName = isCommercial
            ? "Leasing Ruang Kantor CBD"
            : isCivic ? "Unit Rusunawa Pemerintah" : "Manajemen Sewa Hunian";
        units.push_back({"unit_sales_4", 4, UnitType::Sales, std::move(salesName),
                         false, ProductId::Bread, "", 1,
                         isCommercial ? 240 : isCivic ? 320 : 180,
                         0, 0, isCivic ? 0 : 7500, 1.0});
        if (!isCivic) {
            units.push_back({"unit_inventory_0", 0, UnitType::Inventory,
                             isCommercial ? "Sistem Gedung Pintar" : "Fasilitas & Keamanan Hunian",
                             false, ProductId::Bread, "", 1, 100, 0, 0, 4500, 1.0});
            units.push_back({"unit_advertising_1", 1, UnitType::Advertising,
                             "Pemasaran & Okupansi Tenant",
                             false, ProductId::Bread, "", 1, 10000, 0, 0, 3500, 1.0});
        }
    } else if (type == FacilityType::RdCenter) {
        units.push_back({"unit_rd_4", 4, UnitType::Rd, "Laboratorium Riset Paten",
                         true, targetProduct.value_or(ProductId::Smartphone), "", 1, 100, 0, 0, 38000, 1.0});
    } else if (type == FacilityType::TechSoftware) {
        ProductId prod = targetProduct.value_or(ProductId::SoftwareOs);
        units.push_back({"unit_rd_1", 1, UnitType::Rd, "Tim Arsitektur Perangkat Lunak",
                         true, prod, "", 1, 100, 0, 0, 22000, 1.0});
        units.push_back({"unit_manufacturing_4", 4, UnitType::Manufacturing, "Infrastruktur Cloud & Lisensi",
                         true, prod, "", 1, 4500, 0, 0, 18000, 1.05});
        units.push_back({"unit_sales_7", 7, UnitType::Sales, "Penjualan Lisensi Korporat",
                         true, prod, "", 1, 4500, 0, 0, 10000, 1.0});
    } else if (type == FacilityType::MediaTelecom) {
        units.push_back({"unit_advertising_4", 4, UnitType::Advertising, "Jaringan Siaran & Penyiaran Iklan",
                         false, ProductId::Bread, "", 1, 25000, 0, 0, 18000, 1.1});
    }

    return units;
}

Facility add_unit_to_facility_slot(
    const Facility& facility,
    int slotIndex,
    UnitType unitType
) {
    if (slotIndex < 0 || slotIndex > 8) return facility;
    for (const auto& u : facility.units) {
        if (u.slotIndex == slotIndex) return facility;
    }

    bool hasProd = false;
    ProductId primaryProd = ProductId::Bread;
    for (const auto& u : facility.units) {
        if (u.hasTargetProduct) {
            hasProd = true;
            primaryProd = u.targetProductId;
            break;
        }
    }

    const char* label = "Unit Tambahan";
    switch (unitType) {
        case UnitType::Purchasing:    label = "Unit Pengadaan Tambahan"; break;
        case UnitType::Manufacturing: label = "Lini Produksi Ekstra"; break;
        case UnitType::Sales:         label = "Konter Penjualan Ekstra"; break;
        case UnitType::Advertising:   label = "Unit Kampanye Merek"; break;
        case UnitType::Rd:            label = "Tim Riset Spesialis"; break;
        case UnitType::Inventory:     label = "Unit Gudang Tambahan"; break;
    }

    InternalUnit nu;
    nu.id = "unit_" + std::string(unit_type_to_str(unitType)) + "_" + std::to_string(slotIndex) + "_" + std::to_string(facility.units.size());
    nu.slotIndex = slotIndex;
    nu.type = unitType;
    nu.name = label;
    nu.hasTargetProduct = hasProd;
    nu.targetProductId = primaryProd;
    if (unitType == UnitType::Purchasing) nu.supplierFacilityId = "seaport";
    nu.level = 1;
    nu.capacity = (unitType == UnitType::Sales) ? 6500 : (unitType == UnitType::Manufacturing) ? 5000 : 8000;
    nu.currentInventory = 0;
    nu.maxInventory = 12000;
    nu.monthlyCost = (unitType == UnitType::Rd) ? 28000 : 7500;
    nu.efficiency = 1.0;

    Facility next = facility;
    next.units.push_back(std::move(nu));
    if (unitType == UnitType::Inventory) {
        next.inventoryCapacity += 8000;
    }
    return next;
}

} // namespace caplab
