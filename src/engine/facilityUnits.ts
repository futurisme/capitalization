import { Facility, FacilityType, InternalUnit, ProductId, UnitType } from '../types/game';
import { FACILITY_SPECS } from './productsData';
import { roundCurrency } from './precisionMath';

/**
 * Pure cost calculators for honest, cheat-free upgrades & 3x3 unit installations
 */
export function getFacilityUpgradeCost(type: FacilityType, currentLevel: number): number {
  const spec = FACILITY_SPECS[type];
  const base = spec ? spec.constructionCost : 500000;
  return roundCurrency(base * (0.35 + Math.max(1, currentLevel) * 0.12));
}

export function getUnitInstallCost(unitType: UnitType): number {
  if (unitType === 'rd') return 120000;
  if (unitType === 'manufacturing') return 85000;
  if (unitType === 'purchasing' || unitType === 'advertising') return 55000;
  return 45000;
}

export function getUnitUpgradeCost(currentLevel: number): number {
  return roundCurrency(35000 * Math.pow(1.45, Math.max(0, currentLevel - 1)));
}

/**
 * Creates default 3x3 internal units for any of the facility types
 */
export function createDefaultUnitsForFacility(
  type: FacilityType,
  targetProduct?: ProductId
): InternalUnit[] {
  const units: InternalUnit[] = [];

  if (type.startsWith('store_')) {
    const prod =
      targetProduct ||
      (type === 'store_electronics'
        ? 'smartphone'
        : type === 'store_auto'
        ? 'automobile'
        : type === 'store_pharmacy'
        ? 'medicine'
        : type === 'store_convenience'
        ? 'bread'
        : 'fashion_apparel');

    units.push({
      id: 'unit_purchasing_0',
      slotIndex: 0,
      type: 'purchasing',
      name: 'Pengadaan & Impor',
      targetProductId: prod,
      supplierFacilityId: 'seaport',
      level: 1,
      capacity: type === 'store_auto' ? 400 : 8500,
      currentInventory: type === 'store_auto' ? 40 : 1200,
      maxInventory: type === 'store_auto' ? 600 : 12000,
      monthlyCost: 5000,
      efficiency: 0.95,
    });
    units.push({
      id: 'unit_advertising_1',
      slotIndex: 1,
      type: 'advertising',
      name: 'Promosi & Merchandising',
      targetProductId: prod,
      level: 1,
      capacity: 10000,
      currentInventory: 0,
      maxInventory: 0,
      monthlyCost: 4000,
      efficiency: 1.0,
    });
    units.push({
      id: 'unit_sales_4',
      slotIndex: 4,
      type: 'sales',
      name: 'Kasir & Penjualan Utama',
      targetProductId: prod,
      level: 1,
      capacity: type === 'store_auto' ? 350 : type === 'store_department' ? 14000 : 9000,
      currentInventory: 0,
      maxInventory: 10000,
      monthlyCost: 8000,
      efficiency: 1.0,
    });
  } else if (type === 'factory_processing' || type === 'factory_assembly') {
    const prod = targetProduct || (type === 'factory_processing' ? 'steel' : 'smartphone');
    units.push({
      id: 'unit_purchasing_0',
      slotIndex: 0,
      type: 'purchasing',
      name: 'Pengadaan Material',
      targetProductId: prod,
      supplierFacilityId: 'seaport',
      level: 1,
      capacity: 8000,
      currentInventory: 2000,
      maxInventory: 16000,
      monthlyCost: 7000,
      efficiency: 0.95,
    });
    units.push({
      id: 'unit_manufacturing_4',
      slotIndex: 4,
      type: 'manufacturing',
      name: 'Lini Manufaktur Utama',
      targetProductId: prod,
      level: 1,
      capacity: prod === 'automobile' ? 280 : 6500,
      currentInventory: 0,
      maxInventory: 10000,
      monthlyCost: 16000,
      efficiency: 1.0,
    });
    units.push({
      id: 'unit_inventory_8',
      slotIndex: 8,
      type: 'inventory',
      name: 'Gudang Grosir & Ekspedisi',
      targetProductId: prod,
      level: 1,
      capacity: 15000,
      currentInventory: 600,
      maxInventory: 25000,
      monthlyCost: 6000,
      efficiency: 1.0,
    });
  } else if (type === 'warehouse_logistics') {
    const prod = targetProduct || 'bread';
    units.push({
      id: 'unit_purchasing_0',
      slotIndex: 0,
      type: 'purchasing',
      name: 'Penerimaan Kargo',
      targetProductId: prod,
      supplierFacilityId: 'seaport',
      level: 1,
      capacity: 22000,
      currentInventory: 2000,
      maxInventory: 30000,
      monthlyCost: 4500,
      efficiency: 1.0,
    });
    units.push({
      id: 'unit_inventory_4',
      slotIndex: 4,
      type: 'inventory',
      name: 'Penyimpanan Hub Sentral',
      targetProductId: prod,
      level: 1,
      capacity: 30000,
      currentInventory: 3000,
      maxInventory: 45000,
      monthlyCost: 5500,
      efficiency: 1.1,
    });
    units.push({
      id: 'unit_sales_8',
      slotIndex: 8,
      type: 'sales',
      name: 'Distribusi Grosir B2B',
      targetProductId: prod,
      level: 1,
      capacity: 20000,
      currentInventory: 0,
      maxInventory: 20000,
      monthlyCost: 4000,
      efficiency: 1.05,
    });
  } else if (type === 'farm_agriculture' || type === 'mine_extraction' || type === 'power_plant_green') {
    const prod =
      targetProduct ||
      (type === 'farm_agriculture'
        ? 'wheat'
        : type === 'power_plant_green'
        ? 'battery_cell'
        : 'iron_ore');
    units.push({
      id: 'unit_manufacturing_4',
      slotIndex: 4,
      type: 'manufacturing',
      name:
        type === 'farm_agriculture'
          ? 'Unit Budidaya & Panen'
          : type === 'power_plant_green'
          ? 'Turbin Surya & Perakitan Baterai'
          : 'Unit Ekstraksi & Pengeboran',
      targetProductId: prod,
      level: 1,
      capacity: type === 'power_plant_green' ? 5800 : 14000,
      currentInventory: 0,
      maxInventory: 15000,
      monthlyCost: 12000,
      efficiency: 1.0,
    });
    units.push({
      id: 'unit_inventory_8',
      slotIndex: 8,
      type: 'inventory',
      name: type === 'power_plant_green' ? 'Gardu Induk & Gudang Baterai' : 'Silo Penyimpanan Curah',
      targetProductId: prod,
      level: 1,
      capacity: 28000,
      currentInventory: 1800,
      maxInventory: 35000,
      monthlyCost: 4500,
      efficiency: 1.0,
    });
  } else if (type === 'apartment_complex' || type === 'commercial_tower' || type === 'civic_housing') {
    const isCommercial = type === 'commercial_tower';
    units.push({
      id: 'unit_sales_4',
      slotIndex: 4,
      type: 'sales',
      name: isCommercial
        ? 'Leasing Ruang Kantor CBD'
        : type === 'civic_housing'
        ? 'Unit Rusunawa Pemerintah'
        : 'Manajemen Sewa Hunian',
      level: 1,
      capacity: isCommercial ? 240 : type === 'civic_housing' ? 320 : 180,
      currentInventory: 0,
      maxInventory: 0,
      monthlyCost: type === 'civic_housing' ? 0 : 7500,
      efficiency: 1.0,
    });
    if (type !== 'civic_housing') {
      units.push({
        id: 'unit_inventory_0',
        slotIndex: 0,
        type: 'inventory',
        name: isCommercial ? 'Sistem Gedung Pintar' : 'Fasilitas & Keamanan Hunian',
        level: 1,
        capacity: 100,
        currentInventory: 0,
        maxInventory: 0,
        monthlyCost: 4500,
        efficiency: 1.0,
      });
      units.push({
        id: 'unit_advertising_1',
        slotIndex: 1,
        type: 'advertising',
        name: 'Pemasaran & Okupansi Tenant',
        level: 1,
        capacity: 10000,
        currentInventory: 0,
        maxInventory: 0,
        monthlyCost: 3500,
        efficiency: 1.0,
      });
    }
  } else if (type === 'rd_center') {
    units.push({
      id: 'unit_rd_4',
      slotIndex: 4,
      type: 'rd',
      name: 'Laboratorium Riset Paten',
      targetProductId: targetProduct || 'smartphone',
      level: 1,
      capacity: 100,
      currentInventory: 0,
      maxInventory: 0,
      monthlyCost: 38000,
      efficiency: 1.0,
    });
  } else if (type === 'tech_software') {
    const prod = targetProduct || 'software_os';
    units.push({
      id: 'unit_rd_1',
      slotIndex: 1,
      type: 'rd',
      name: 'Tim Arsitektur Perangkat Lunak',
      targetProductId: prod,
      level: 1,
      capacity: 100,
      currentInventory: 0,
      maxInventory: 0,
      monthlyCost: 22000,
      efficiency: 1.0,
    });
    units.push({
      id: 'unit_manufacturing_4',
      slotIndex: 4,
      type: 'manufacturing',
      name: 'Infrastruktur Cloud & Lisensi',
      targetProductId: prod,
      level: 1,
      capacity: 4500,
      currentInventory: 0,
      maxInventory: 0,
      monthlyCost: 18000,
      efficiency: 1.05,
    });
    units.push({
      id: 'unit_sales_7',
      slotIndex: 7,
      type: 'sales',
      name: 'Penjualan Lisensi Korporat',
      targetProductId: prod,
      level: 1,
      capacity: 4500,
      currentInventory: 0,
      maxInventory: 0,
      monthlyCost: 10000,
      efficiency: 1.0,
    });
  } else if (type === 'media_telecom') {
    units.push({
      id: 'unit_advertising_4',
      slotIndex: 4,
      type: 'advertising',
      name: 'Jaringan Siaran & Penyiaran Iklan',
      level: 1,
      capacity: 25000,
      currentInventory: 0,
      maxInventory: 0,
      monthlyCost: 18000,
      efficiency: 1.1,
    });
  }

  return units;
}

const UNIT_INSTALL_LABELS: Record<UnitType, string> = {
  purchasing: 'Unit Pengadaan Tambahan',
  manufacturing: 'Lini Produksi Ekstra',
  sales: 'Konter Penjualan Ekstra',
  advertising: 'Unit Kampanye Merek',
  rd: 'Tim Riset Spesialis',
  inventory: 'Unit Gudang Tambahan',
};

/**
 * Installs a new unit into an empty slot (0-8) of a facility's 3x3 matrix
 */
export function addUnitToFacilitySlot(
  facility: Facility,
  slotIndex: number,
  unitType: UnitType
): Facility {
  if (slotIndex < 0 || slotIndex > 8) return facility;
  if (facility.units.some(u => u.slotIndex === slotIndex)) return facility;

  const primaryProd = facility.units.find(u => u.targetProductId)?.targetProductId;

  const newUnit: InternalUnit = {
    id: `unit_${unitType}_${slotIndex}_${facility.units.length}`,
    slotIndex,
    type: unitType,
    name: UNIT_INSTALL_LABELS[unitType],
    targetProductId: primaryProd,
    supplierFacilityId: unitType === 'purchasing' ? 'seaport' : undefined,
    level: 1,
    capacity: unitType === 'sales' ? 6500 : unitType === 'manufacturing' ? 5000 : 8000,
    currentInventory: 0,
    maxInventory: 12000,
    monthlyCost: unitType === 'rd' ? 28000 : 7500,
    efficiency: 1.0,
  };

  return {
    ...facility,
    units: [...facility.units, newUnit],
    inventoryCapacity:
      unitType === 'inventory' ? facility.inventoryCapacity + 8000 : facility.inventoryCapacity,
  };
}
