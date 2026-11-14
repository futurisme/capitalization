#include "ProductsData.hpp"
#include <cstdio>

namespace caplab {

const std::array<ProductRecipe, PRODUCT_COUNT>& get_all_products() {
    static const std::array<ProductRecipe, PRODUCT_COUNT> products = {{
        {ProductId::Wheat, "wheat", "Gandum Alami", ProductCategory::Raw, "Ton", 75, 120, 138, 0.6, 0.4,
         {0.65, 0.25, 0.10}, {}, "Komoditas pertanian dasar untuk produksi tepung dan pakan ternak."},

        {ProductId::Livestock, "livestock", "Ternak & Daging", ProductCategory::Raw, "Ekor", 190, 310, 355, 0.8, 0.2,
         {0.50, 0.40, 0.10}, {}, "Bahan baku makanan olahan dan bahan industri kulit."},

        {ProductId::CrudeOil, "crude_oil", "Minyak Mentah", ProductCategory::Raw, "Barel", 48, 75, 88, 1.1, 0.3,
         {0.75, 0.20, 0.05}, {}, "Bahan bakar dan petrokimia untuk memproduksi plastik sintetis."},

        {ProductId::IronOre, "iron_ore", "Bijih Besi", ProductCategory::Raw, "Ton", 62, 100, 118, 0.9, 0.35,
         {0.70, 0.25, 0.05}, {}, "Bahan mineral utama untuk peleburan baja konstruksi dan otomotif."},

        {ProductId::Silicon, "silicon", "Silikon Murni", ProductCategory::Raw, "Kg", 115, 190, 225, 1.2, 0.15,
         {0.40, 0.55, 0.05}, {}, "Mineral semikonduktor krusial untuk mikroprosesor dan chip canggih."},

        {ProductId::Flour, "flour", "Tepung Terigu", ProductCategory::Intermediate, "Karung", 130, 210, 245, 0.7, 0.3,
         {0.60, 0.30, 0.10}, {{ProductId::Wheat, 1.2}}, "Tepung olahan gandum untuk roti dan produk bakeri."},

        {ProductId::Steel, "steel", "Baja Industri", ProductCategory::Intermediate, "Ton", 210, 340, 395, 1.0, 0.25,
         {0.55, 0.35, 0.10}, {{ProductId::IronOre, 1.8}}, "Pelat baja struktural berkekuatan tinggi untuk otomotif dan elektronik."},

        {ProductId::Plastic, "plastic", "Polimer Plastik", ProductCategory::Intermediate, "Drum", 105, 175, 205, 1.1, 0.25,
         {0.60, 0.30, 0.10}, {{ProductId::CrudeOil, 1.5}}, "Casing ringan dan material sintetis serbaguna."},

        {ProductId::ElectronicChip, "electronic_chip", "Mikrochip AI", ProductCategory::Intermediate, "Unit", 340, 580, 680, 1.4, 0.12,
         {0.25, 0.65, 0.10}, {{ProductId::Silicon, 2.0}}, "Prosesor generasi mutakhir untuk smartphone dan laptop flagship."},

        {ProductId::Fabric, "fabric", "Kain Tekstil", ProductCategory::Intermediate, "Roll", 85, 145, 170, 0.8, 0.28,
         {0.50, 0.35, 0.15}, {{ProductId::Wheat, 0.8}}, "Tekstil kualitas tinggi untuk lini fashion dan apparel."},

        {ProductId::BatteryCell, "battery_cell", "Sel Baterai & Energi", ProductCategory::Intermediate, "Modul", 185, 315, 375, 1.3, 0.16,
         {0.35, 0.55, 0.10}, {{ProductId::Silicon, 0.8}, {ProductId::Steel, 0.4}},
         "Modul penyimpanan daya lithium & surya untuk kendaraan listrik serta jaringan kota."},

        {ProductId::Bread, "bread", "Roti Premium", ProductCategory::Consumer, "Dus", 4, 8, 9.5, 1.2, 1.0,
         {0.55, 0.25, 0.20}, {{ProductId::Flour, 0.02}}, "Makanan pokok sehari-hari dengan perputaran stok cepat dan elastisitas harga tinggi."},

        {ProductId::SoftDrink, "soft_drink", "Minuman Soda & Isotonik", ProductCategory::Consumer, "Karton", 6, 14, 16.5, 1.5, 0.85,
         {0.35, 0.20, 0.45}, {{ProductId::Plastic, 0.03}}, "Minuman ringan dengan margin tinggi yang sangat dipengaruhi kekuatan merek & iklan."},

        {ProductId::FashionApparel, "fashion_apparel", "Busana & Fashion Branded", ProductCategory::Consumer, "Potong", 24, 65, 78, 1.8, 0.28,
         {0.25, 0.25, 0.50}, {{ProductId::Fabric, 0.15}}, "Lini busana modern dengan sensitivitas sangat tinggi terhadap Brand Rating."},

        {ProductId::Medicine, "medicine", "Farmasi & Obat Kesehatan", ProductCategory::Consumer, "Paket", 12, 36, 44, 0.9, 0.48,
         {0.25, 0.55, 0.20}, {{ProductId::Plastic, 0.05}}, "Produk medis & suplemen dengan permintaan stabil di kawasan hunian & perkantoran."},

        {ProductId::Smartphone, "smartphone", "Smartphone Flagship 5G", ProductCategory::Consumer, "Unit", 270, 650, 750, 2.0, 0.1,
         {0.20, 0.50, 0.30}, {{ProductId::ElectronicChip, 0.35}, {ProductId::Plastic, 0.1}, {ProductId::Steel, 0.05}},
         "Perangkat seluler canggih dengan bobot kualitas teknologi R&D paling dominan."},

        {ProductId::Laptop, "laptop", "Laptop Ultra Pro", ProductCategory::Consumer, "Unit", 500, 1150, 1320, 2.2, 0.05,
         {0.20, 0.55, 0.25}, {{ProductId::ElectronicChip, 0.65}, {ProductId::Plastic, 0.2}, {ProductId::Steel, 0.15}},
         "Komputer portabel berperforma tinggi untuk profesional dan perusahaan."},

        {ProductId::Automobile, "automobile", "Mobil Listrik Pintar", ProductCategory::Consumer, "Unit", 13500, 28500, 33500, 2.4, 0.005,
         {0.25, 0.45, 0.30}, {{ProductId::Steel, 8.0}, {ProductId::Plastic, 2.5}, {ProductId::ElectronicChip, 4.0}},
         "Kendaraan listrik mewah dengan nilai transaksi per unit terbesar di kota."},

        {ProductId::SoftwareOs, "software_os", "Sistem Operasi & Cloud OS", ProductCategory::Digital, "Lisensi", 18, 120, 145, 1.6, 0.18,
         {0.30, 0.55, 0.15}, {}, "Produk Digital Age: margin berulang masif dengan biaya marginal mendekati nol."},

        {ProductId::AiEnterprise, "ai_enterprise", "Suite Kecerdasan Korporat", ProductCategory::Digital, "Langganan", 45, 380, 450, 1.9, 0.06,
         {0.20, 0.65, 0.15}, {}, "Platform SaaS Enterprise dengan pendapatan langganan bulanan bernilai tinggi."},
    }};
    return products;
}

const ProductRecipe& get_product(ProductId id) {
    return get_all_products()[static_cast<size_t>(id)];
}

const std::array<FacilityBuildingSpec, FACILITY_TYPE_COUNT>& get_all_facility_specs() {
    static const std::array<FacilityBuildingSpec, FACILITY_TYPE_COUNT> specs = {{
        {FacilityType::StoreConvenience, "store_convenience", "Minimarket 24 Jam", FacilityCategory::Store,
         450000, 15000, "Toko ritel ringkas untuk kebutuhan pokok harian. Sangat diuntungkan keramaian tinggi.",
         {ProductId::Bread, ProductId::SoftDrink}, true},

        {FacilityType::StoreElectronics, "store_electronics", "Mega Store Elektronik", FacilityCategory::Store,
         1200000, 35000, "Outlet ritel berteknologi tinggi untuk smartphone, laptop, dan perangkat digital.",
         {ProductId::Smartphone, ProductId::Laptop, ProductId::SoftwareOs}, true},

        {FacilityType::StoreDepartment, "store_department", "Department Store Megamall", FacilityCategory::Store,
         2500000, 65000, "Pusat belanja serba ada skala besar dengan daya tampung pelanggan tinggi.",
         {ProductId::FashionApparel, ProductId::Medicine, ProductId::Bread, ProductId::SoftDrink, ProductId::Smartphone}, true},

        {FacilityType::StoreAuto, "store_auto", "Showroom & Dealer Otomotif", FacilityCategory::Store,
         3400000, 85000, "Galeri pamer khusus penjualan kendaraan listrik & mobilitas premium.",
         {ProductId::Automobile}, true},

        {FacilityType::StorePharmacy, "store_pharmacy", "Apotek & Klinik Kesehatan", FacilityCategory::Store,
         780000, 24000, "Gerai ritel farmasi & kesehatan dengan permintaan defensif saat ekonomi melambat.",
         {ProductId::Medicine, ProductId::SoftDrink}, true},

        {FacilityType::ApartmentComplex, "apartment_complex", "Menara Apartemen Swasta", FacilityCategory::RealEstate,
         2600000, 32000, "Properti hunian modern. Menghasilkan sewa bulanan stabil & mendongkrak keramaian toko sekitar.",
         {}, true},

        {FacilityType::CommercialTower, "commercial_tower", "Menara Perkantoran CBD", FacilityCategory::RealEstate,
         3800000, 48000, "Gedung kantor komersial premium. Imbal hasil sewa meningkat tajam di zona keramaian tinggi.",
         {}, true},

        {FacilityType::CivicHousing, "civic_housing", "Rusunawa & Perumahan Pemkot", FacilityCategory::RealEstate,
         0, 0, "Hunian publik dikelola Pemerintah Kota. Menarik pertumbuhan warga & keramaian distrik sekitar.",
         {}, false},

        {FacilityType::FactoryAssembly, "factory_assembly", "Pabrik Perakitan Presisi", FacilityCategory::Factory,
         3200000, 75000, "Merakit produk konsumen bernilai tinggi (Chip AI, Baterai, Obat, Gadget, Laptop, Mobil).",
         {ProductId::ElectronicChip, ProductId::BatteryCell, ProductId::Medicine, ProductId::Bread,
          ProductId::SoftDrink, ProductId::FashionApparel, ProductId::Smartphone, ProductId::Laptop, ProductId::Automobile}, true},

        {FacilityType::FactoryProcessing, "factory_processing", "Pabrik Pengolahan Dasar", FacilityCategory::Factory,
         1800000, 45000, "Mengolah material hulu menjadi barang setengah jadi (Tepung, Baja, Plastik, Tekstil).",
         {ProductId::Flour, ProductId::Steel, ProductId::Plastic, ProductId::Fabric}, true},

        {FacilityType::WarehouseLogistics, "warehouse_logistics", "Pusat Logistik & Gudang", FacilityCategory::Factory,
         1100000, 24000, "Mengonsolidasi stok rantai pasok internal dan efisiensi distribusi antar fasilitas (+30% kapasitas).",
         {ProductId::Flour, ProductId::Steel, ProductId::Plastic, ProductId::ElectronicChip, ProductId::BatteryCell,
          ProductId::Fabric, ProductId::Medicine, ProductId::Bread, ProductId::SoftDrink, ProductId::Smartphone}, true},

        {FacilityType::FarmAgriculture, "farm_agriculture", "Perkebunan & Peternakan", FacilityCategory::Raw,
         950000, 22000, "Memproduksi gandum dan hasil peternakan secara mandiri sebagai hulu pangan.",
         {ProductId::Wheat, ProductId::Livestock}, true},

        {FacilityType::MineExtraction, "mine_extraction", "Tambang Mineral & Minyak", FacilityCategory::Raw,
         2400000, 55000, "Mengekstraksi bijih besi, minyak bumi, dan silikon murni untuk industri.",
         {ProductId::IronOre, ProductId::CrudeOil, ProductId::Silicon}, true},

        {FacilityType::PowerPlantGreen, "power_plant_green", "Pembangkit Energi & Baterai Hijau", FacilityCategory::Raw,
         2300000, 38000, "Menjual listrik bersih ke kota sekaligus memproduksi Sel Baterai untuk industri otomotif & EV.",
         {ProductId::BatteryCell}, true},

        {FacilityType::RdCenter, "rd_center", "Pusat Riset & Inovasi (R&D)", FacilityCategory::Corporate,
         3000000, 80000, "Meneliti paten produk baru dan menaikkan Tech Level serta Kualitas produk korporasi.",
         {ProductId::Medicine, ProductId::BatteryCell, ProductId::Smartphone, ProductId::Laptop, ProductId::Automobile,
          ProductId::ElectronicChip, ProductId::SoftwareOs, ProductId::AiEnterprise, ProductId::Bread, ProductId::SoftDrink, ProductId::FashionApparel}, true},

        {FacilityType::TechSoftware, "tech_software", "Perusahaan Software & Cloud", FacilityCategory::Digital,
         2200000, 60000, "Studio Digital Age: membangun Sistem Operasi & AI Enterprise dengan margin berulang.",
         {ProductId::SoftwareOs, ProductId::AiEnterprise}, true},

        {FacilityType::MediaTelecom, "media_telecom", "Stasiun Media & Telekomunikasi", FacilityCategory::Digital,
         2800000, 55000, "Meraup pendapatan iklan kota sekaligus memperkuat Corporate Brand seluruh cabang.",
         {}, true},

        {FacilityType::CorporateHq, "corporate_hq", "Gedung Menara Kantor Pusat", FacilityCategory::Corporate,
         5000000, 35000, "Pusat komando eksekutif (COO/CTO/CMO/CFO), strategi merek, dan relasi investor.",
         {}, true},
    }};
    return specs;
}

const FacilityBuildingSpec& get_facility_spec(FacilityType type) {
    return get_all_facility_specs()[static_cast<size_t>(type)];
}

const std::vector<ExecutiveOfficer>& get_available_executives() {
    static const std::vector<ExecutiveOfficer> execs = {
        {"exec_coo", ExecutiveRole::COO, "Andika Pratama, MBA",
         "Otomasi harga ritel optimal & efisiensi biaya perawatan (-15% beban operasional)", 88, 32000, false},
        {"exec_cto", ExecutiveRole::CTO, "Dr. Clara Wijaya",
         "Akselerasi kecepatan proyek riset paten R&D & kualitas manufaktur (+40% riset)", 92, 38000, false},
        {"exec_cmo", ExecutiveRole::CMO, "Rafael Kusuma",
         "Memperkuat Corporate Brand & daya ungkit anggaran iklan ritel (+35% Brand)", 85, 28000, false},
        {"exec_cfo", ExecutiveRole::CFO, "Melinda Tan, CFA",
         "Menekan bunga pinjaman perbankan (-25% bunga) & meningkatkan rating kredit", 90, 35000, false},
    };
    return execs;
}

const std::vector<AICorporateTemplate>& get_initial_ai_roster() {
    static const std::vector<AICorporateTemplate> roster = {
        {"comp_apex", "Apex Megacorp", "APEX", 0xdc2626, 0xf87171, "Victor \"The Baron\" Vance",
         AIPersonality::Expansionist, "Ritel FMCG & Busana", BrandStrategy::Corporate, 58,
         8500000, 2000000, 1200000, 12.5, FacilityType::StoreDepartment, ProductId::FashionApparel, false,
         {{ProductId::Bread, 48}, {ProductId::SoftDrink, 52}, {ProductId::FashionApparel, 54}}},

        {"comp_nova", "NovaTech Industries", "NOVA", 0x7c3aed, 0xa78bfa, "Dr. Elena Rostova",
         AIPersonality::QualityFirst, "Riset & Gadget Flagship", BrandStrategy::Range, 55,
         12000000, 500000, 800000, 24.0, FacilityType::RdCenter, ProductId::Smartphone, false,
         {{ProductId::Silicon, 55}, {ProductId::ElectronicChip, 65}, {ProductId::Smartphone, 68}, {ProductId::Laptop, 65}, {ProductId::SoftwareOs, 62}}},

        {"comp_omni", "OmniSupply Global", "OMNI", 0xd97706, 0xfbbf24, "Kenji Sato",
         AIPersonality::SupplyMonopolist, "Pertambangan & Baja", BrandStrategy::Generic, 42,
         9500000, 1200000, 1500000, 9.8, FacilityType::MineExtraction, ProductId::IronOre, true,
         {{ProductId::IronOre, 58}, {ProductId::CrudeOil, 52}, {ProductId::Steel, 55}, {ProductId::Plastic, 50}}},

        {"comp_land", "Sinar Properti Agung", "LAND", 0x0f766e, 0x2dd4bf, "Budi Hartono",
         AIPersonality::RealEstateMogul, "Real Estate & Menara CBD", BrandStrategy::Corporate, 60,
         11200000, 1400000, 1100000, 15.6, FacilityType::ApartmentComplex, ProductId::Bread, false,
         {{ProductId::Steel, 50}, {ProductId::Plastic, 48}}},

        {"comp_medx", "BioMedika Farma Tbk", "MEDX", 0x059669, 0x34d399, "Dr. Karina Putri",
         AIPersonality::HealthcarePioneer, "Farmasi & Klinik Ritel", BrandStrategy::Corporate, 57,
         8900000, 600000, 950000, 14.4, FacilityType::StorePharmacy, ProductId::Medicine, false,
         {{ProductId::Medicine, 64}, {ProductId::SoftDrink, 50}}},

        {"comp_agro", "TerraAgro Nusantara", "AGRO", 0x16a34a, 0x4ade80, "Ir. Darmawan Putra",
         AIPersonality::SupplyMonopolist, "Agrikultur & Pangan", BrandStrategy::Range, 48,
         7800000, 600000, 1100000, 10.4, FacilityType::FarmAgriculture, ProductId::Wheat, true,
         {{ProductId::Wheat, 62}, {ProductId::Livestock, 58}, {ProductId::Flour, 55}, {ProductId::Bread, 52}}},

        {"comp_velo", "VeloMotors Group", "VELO", 0x0891b2, 0x22d3ee, "Marcus Lindqvist",
         AIPersonality::QualityFirst, "Otomotif & Mobilitas EV", BrandStrategy::Corporate, 56,
         10500000, 1500000, 900000, 17.5, FacilityType::StoreAuto, ProductId::Automobile, false,
         {{ProductId::Automobile, 62}, {ProductId::BatteryCell, 58}, {ProductId::Steel, 50}, {ProductId::ElectronicChip, 52}}},

        {"comp_cloud", "Stratos CloudWorks", "STRT", 0x0284c7, 0x38bdf8, "Priya Nair",
         AIPersonality::TechInnovator, "Software & Cloud AI", BrandStrategy::Corporate, 53,
         9200000, 300000, 950000, 16.2, FacilityType::TechSoftware, ProductId::SoftwareOs, false,
         {{ProductId::SoftwareOs, 68}, {ProductId::AiEnterprise, 66}, {ProductId::Laptop, 50}}},

        {"comp_media", "PrimaMedia Telekom", "MEDI", 0xdb2777, 0xf472b6, "Sophia Laurent",
         AIPersonality::BrandTitan, "Penyiaran & Merek Ritel", BrandStrategy::Corporate, 66,
         8400000, 900000, 1000000, 13.8, FacilityType::MediaTelecom, ProductId::SoftDrink, false,
         {{ProductId::SoftDrink, 54}, {ProductId::FashionApparel, 52}, {ProductId::Smartphone, 48}}},
    };
    return roster;
}

const std::vector<AICorporateTemplate>& get_new_entrant_pool() {
    static const std::vector<AICorporateTemplate> pool = {
        {"comp_volt", "Voltaic Green Energy", "VOLT", 0x10b981, 0x6ee7b7, "Surya Pratama",
         AIPersonality::SupplyMonopolist, "Energi Hijau & Baterai", BrandStrategy::Corporate, 52,
         9100000, 0, 1000000, 12.1, FacilityType::PowerPlantGreen, ProductId::BatteryCell, true,
         {{ProductId::BatteryCell, 65}, {ProductId::Silicon, 56}, {ProductId::Automobile, 52}}},

        {"comp_giga", "Metropolis Realty Trust", "MTRT", 0x0e7490, 0x67e8f9, "Eleanor Sterling",
         AIPersonality::RealEstateMogul, "Properti CBD & Perkantoran", BrandStrategy::Corporate, 59,
         10400000, 0, 1000000, 14.2, FacilityType::CommercialTower, ProductId::Bread, false,
         {{ProductId::Steel, 52}}},

        {"comp_logi", "CargoNet Logistik", "CARG", 0xea580c, 0xfb923c, "Hendra Wijaya",
         AIPersonality::SupplyMonopolist, "Gudang & Manufaktur Antara", BrandStrategy::Generic, 44,
         7600000, 0, 1150000, 9.6, FacilityType::WarehouseLogistics, ProductId::Plastic, true,
         {{ProductId::Plastic, 56}, {ProductId::Steel, 54}, {ProductId::Fabric, 52}, {ProductId::Flour, 50}}},

        {"comp_luxe", "Maison Luxe Retail", "LUXE", 0x4f46e5, 0x818cf8, "Camille Moreau",
         AIPersonality::BrandTitan, "Busana Premium & Elektronika", BrandStrategy::Range, 62,
         8100000, 0, 980000, 12.9, FacilityType::StoreElectronics, ProductId::Laptop, false,
         {{ProductId::FashionApparel, 60}, {ProductId::Laptop, 56}, {ProductId::Smartphone, 54}}},

        {"comp_vrtx", "Vertex Semiconductors", "VRTX", 0x2563eb, 0x60a5fa, "Dr. Kenji Takahashi",
         AIPersonality::TechInnovator, "Semikonduktor & Chip AI", BrandStrategy::Range, 50,
         8800000, 0, 1000000, 11.4, FacilityType::FactoryAssembly, ProductId::ElectronicChip, true,
         {{ProductId::Silicon, 60}, {ProductId::ElectronicChip, 64}, {ProductId::Smartphone, 52}}},

        {"comp_bioh", "BioHarvest Foods", "BIOH", 0x65a30d, 0xa3e635, "Nadia Kusuma",
         AIPersonality::Expansionist, "Pangan & Minimarket", BrandStrategy::Corporate, 52,
         7200000, 0, 1000000, 9.2, FacilityType::StoreConvenience, ProductId::Bread, false,
         {{ProductId::Wheat, 54}, {ProductId::Flour, 55}, {ProductId::Bread, 58}, {ProductId::SoftDrink, 54}}},

        {"comp_orbt", "Orbit Digital Enterprise", "ORBT", 0x0284c7, 0x38bdf8, "Liam O'Connor",
         AIPersonality::TechInnovator, "Enterprise AI & SaaS", BrandStrategy::Corporate, 55,
         8600000, 0, 900000, 12.2, FacilityType::TechSoftware, ProductId::AiEnterprise, false,
         {{ProductId::SoftwareOs, 62}, {ProductId::AiEnterprise, 66}}},

        {"comp_titn", "Titan Heavy Processing", "TITN", 0xb45309, 0xfbbf24, "Viktor Kovacs",
         AIPersonality::SupplyMonopolist, "Pengolahan Baja & Polimer", BrandStrategy::Generic, 45,
         8200000, 0, 1050000, 10.1, FacilityType::FactoryProcessing, ProductId::Steel, true,
         {{ProductId::IronOre, 55}, {ProductId::Steel, 60}, {ProductId::Plastic, 56}}},

        {"comp_aura", "Aura Lifestyle Group", "AURA", 0xbe185d, 0xf472b6, "Chloe Tan",
         AIPersonality::BrandTitan, "Ritel Gaya Hidup & Media", BrandStrategy::Corporate, 60,
         7900000, 0, 950000, 10.8, FacilityType::StoreDepartment, ProductId::FashionApparel, false,
         {{ProductId::FashionApparel, 58}, {ProductId::SoftDrink, 55}}},

        {"comp_kron", "Kronos EV Mobility", "KRON", 0x0f766e, 0x5eead4, "Mateo Alvarez",
         AIPersonality::QualityFirst, "Perakitan EV & Elektronik", BrandStrategy::Range, 54,
         9200000, 0, 900000, 12.6, FacilityType::StoreAuto, ProductId::Automobile, false,
         {{ProductId::Automobile, 60}, {ProductId::Laptop, 54}, {ProductId::ElectronicChip, 55}}},
    };
    return pool;
}

const char* product_id_to_str(ProductId id) noexcept {
    const auto idx = static_cast<size_t>(id);
    if (idx < PRODUCT_COUNT) return get_all_products()[idx].key;
    return "wheat";
}

std::optional<ProductId> str_to_product_id(std::string_view s) noexcept {
    const auto& all = get_all_products();
    for (size_t i = 0; i < PRODUCT_COUNT; ++i) {
        if (s == all[i].key) return static_cast<ProductId>(i);
    }
    return std::nullopt;
}

const char* facility_type_to_str(FacilityType type) noexcept {
    const auto idx = static_cast<size_t>(type);
    if (idx < FACILITY_TYPE_COUNT) return get_all_facility_specs()[idx].key;
    return "store_convenience";
}

std::optional<FacilityType> str_to_facility_type(std::string_view s) noexcept {
    const auto& all = get_all_facility_specs();
    for (size_t i = 0; i < FACILITY_TYPE_COUNT; ++i) {
        if (s == all[i].key) return static_cast<FacilityType>(i);
    }
    return std::nullopt;
}

const char* unit_type_to_str(UnitType type) noexcept {
    switch (type) {
        case UnitType::Purchasing: return "purchasing";
        case UnitType::Manufacturing: return "manufacturing";
        case UnitType::Sales: return "sales";
        case UnitType::Advertising: return "advertising";
        case UnitType::Rd: return "rd";
        case UnitType::Inventory: return "inventory";
    }
    return "sales";
}

std::optional<UnitType> str_to_unit_type(std::string_view s) noexcept {
    if (s == "purchasing") return UnitType::Purchasing;
    if (s == "manufacturing") return UnitType::Manufacturing;
    if (s == "sales") return UnitType::Sales;
    if (s == "advertising") return UnitType::Advertising;
    if (s == "rd") return UnitType::Rd;
    if (s == "inventory") return UnitType::Inventory;
    return std::nullopt;
}

const char* exec_role_to_str(ExecutiveRole r) noexcept {
    switch (r) {
        case ExecutiveRole::COO: return "COO";
        case ExecutiveRole::CTO: return "CTO";
        case ExecutiveRole::CMO: return "CMO";
        case ExecutiveRole::CFO: return "CFO";
    }
    return "COO";
}

std::optional<ExecutiveRole> str_to_exec_role(std::string_view s) noexcept {
    if (s == "COO") return ExecutiveRole::COO;
    if (s == "CTO") return ExecutiveRole::CTO;
    if (s == "CMO") return ExecutiveRole::CMO;
    if (s == "CFO") return ExecutiveRole::CFO;
    return std::nullopt;
}

const char* brand_strategy_to_str(BrandStrategy bs) noexcept {
    switch (bs) {
        case BrandStrategy::Generic: return "generic";
        case BrandStrategy::Range: return "range";
        case BrandStrategy::Corporate: return "corporate";
    }
    return "corporate";
}

std::optional<BrandStrategy> str_to_brand_strategy(std::string_view s) noexcept {
    if (s == "generic") return BrandStrategy::Generic;
    if (s == "range") return BrandStrategy::Range;
    if (s == "corporate") return BrandStrategy::Corporate;
    return std::nullopt;
}

const char* ai_personality_to_str(AIPersonality p) noexcept {
    switch (p) {
        case AIPersonality::None: return "";
        case AIPersonality::Expansionist: return "expansionist";
        case AIPersonality::QualityFirst: return "quality_first";
        case AIPersonality::SupplyMonopolist: return "supply_monopolist";
        case AIPersonality::TechInnovator: return "tech_innovator";
        case AIPersonality::BrandTitan: return "brand_titan";
        case AIPersonality::RealEstateMogul: return "real_estate_mogul";
        case AIPersonality::HealthcarePioneer: return "healthcare_pioneer";
    }
    return "";
}

std::optional<AIPersonality> str_to_ai_personality(std::string_view s) noexcept {
    if (s == "expansionist") return AIPersonality::Expansionist;
    if (s == "quality_first") return AIPersonality::QualityFirst;
    if (s == "supply_monopolist") return AIPersonality::SupplyMonopolist;
    if (s == "tech_innovator") return AIPersonality::TechInnovator;
    if (s == "brand_titan") return AIPersonality::BrandTitan;
    if (s == "real_estate_mogul") return AIPersonality::RealEstateMogul;
    if (s == "healthcare_pioneer") return AIPersonality::HealthcarePioneer;
    return std::nullopt;
}

const char* macro_phase_to_str(EconomicCyclePhase p) noexcept {
    switch (p) {
        case EconomicCyclePhase::Boom: return "boom";
        case EconomicCyclePhase::Normal: return "normal";
        case EconomicCyclePhase::Recession: return "recession";
        case EconomicCyclePhase::Recovery: return "recovery";
    }
    return "normal";
}

std::optional<EconomicCyclePhase> str_to_macro_phase(std::string_view s) noexcept {
    if (s == "boom") return EconomicCyclePhase::Boom;
    if (s == "normal") return EconomicCyclePhase::Normal;
    if (s == "recession") return EconomicCyclePhase::Recession;
    if (s == "recovery") return EconomicCyclePhase::Recovery;
    return std::nullopt;
}

const char* terrain_to_str(TerrainType t) noexcept {
    switch (t) {
        case TerrainType::Grass: return "grass";
        case TerrainType::Road: return "road";
        case TerrainType::Water: return "water";
        case TerrainType::Pavement: return "pavement";
        case TerrainType::IndustrialZone: return "industrial_zone";
    }
    return "grass";
}

std::optional<TerrainType> str_to_terrain(std::string_view s) noexcept {
    if (s == "grass") return TerrainType::Grass;
    if (s == "road") return TerrainType::Road;
    if (s == "water") return TerrainType::Water;
    if (s == "pavement") return TerrainType::Pavement;
    if (s == "industrial_zone") return TerrainType::IndustrialZone;
    return std::nullopt;
}

const char* news_category_to_str(NewsCategory c) noexcept {
    switch (c) {
        case NewsCategory::Economy: return "economy";
        case NewsCategory::Competitor: return "competitor";
        case NewsCategory::Finance: return "finance";
        case NewsCategory::Rnd: return "rnd";
    }
    return "economy";
}

std::optional<NewsCategory> str_to_news_category(std::string_view s) noexcept {
    if (s == "economy") return NewsCategory::Economy;
    if (s == "competitor") return NewsCategory::Competitor;
    if (s == "finance") return NewsCategory::Finance;
    if (s == "rnd") return NewsCategory::Rnd;
    return std::nullopt;
}

const char* stock_action_to_str(StockAction a) noexcept {
    switch (a) {
        case StockAction::Buy: return "buy";
        case StockAction::Sell: return "sell";
        case StockAction::Issue: return "issue";
        case StockAction::Merger: return "merger";
    }
    return "buy";
}

std::optional<StockAction> str_to_stock_action(std::string_view s) noexcept {
    if (s == "buy") return StockAction::Buy;
    if (s == "sell") return StockAction::Sell;
    if (s == "issue") return StockAction::Issue;
    if (s == "merger") return StockAction::Merger;
    return std::nullopt;
}

uint32_t parse_css_hex(std::string_view s, uint32_t fallback) noexcept {
    if (!s.empty() && s.front() == '#') s.remove_prefix(1);
    if (s.size() != 6) return fallback;
    uint32_t val = 0;
    for (char c : s) {
        val <<= 4;
        if (c >= '0' && c <= '9') val |= static_cast<uint32_t>(c - '0');
        else if (c >= 'a' && c <= 'f') val |= static_cast<uint32_t>(10 + c - 'a');
        else if (c >= 'A' && c <= 'F') val |= static_cast<uint32_t>(10 + c - 'A');
        else return fallback;
    }
    return val;
}

std::string hex_to_css(uint32_t rgb) {
    char buf[16];
    std::snprintf(buf, sizeof(buf), "#%06x", rgb & 0xFFFFFFu);
    return buf;
}

} // namespace caplab
