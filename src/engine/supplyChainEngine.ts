import { Company, Facility, MacroEconomy, ProductId, SimulationState } from '../types/game';
import { GOVT_OWNER_ID, RESIDENT_OWNER_ID, PRODUCTS } from './productsData';
import { clamp, finiteOr, round2, round4, roundCurrency } from './precisionMath';
import { getDepositYieldBonus } from './housingEcosystem';
import { getParcelAt } from './spatialGrid';
import { PRIMARY_CITY_ID } from './governmentEngine';

export interface ExecBuffs {
  hasCOO: boolean;
  hasCTO: boolean;
  hasCMO: boolean;
  hasCFO: boolean;
  payroll: number;
}

export interface ProducerMeta {
  unitCost: number;
  effectiveOpCost: number;
  gridPowerRev: number;
  primaryProdId: ProductId;
}

export interface PreparedCompanyStage {
  updatedCompanies: Record<string, Company>;
  execBuffs: Record<string, ExecBuffs>;
  companyIds: string[];
}

export function prepareCompaniesAndExecBuffs(
  state: SimulationState,
  updatedMacro: MacroEconomy
): PreparedCompanyStage {
  const updatedCompanies: Record<string, Company> = {};
  const execBuffs: Record<string, ExecBuffs> = {};

  const companyIds = Object.keys(state.companies);
  for (let i = 0; i < companyIds.length; i++) {
    const id = companyIds[i];
    const orig = state.companies[id];
    const execs = orig.executives || [];
    let payroll = 0;
    let hasCOO = false;
    let hasCTO = false;
    let hasCMO = false;
    let hasCFO = false;

    const clonedExecs = execs.map(e => {
      if (e.hired) {
        payroll += finiteOr(e.monthlySalary, 0);
        if (e.role === 'COO') hasCOO = true;
        else if (e.role === 'CTO') hasCTO = true;
        else if (e.role === 'CMO') hasCMO = true;
        else if (e.role === 'CFO') hasCFO = true;
      }
      return { ...e };
    });

    execBuffs[id] = { hasCOO, hasCTO, hasCMO, hasCFO, payroll };

    const baseMonthlyRate = (updatedMacro.centralBankRate + 2.5) / 100 / 12;
    const effectiveInterestRate = hasCFO ? baseMonthlyRate * 0.75 : baseMonthlyRate;

    updatedCompanies[id] = {
      ...orig,
      cash: finiteOr(orig.cash, 0),
      debt: Math.max(0, finiteOr(orig.debt, 0)),
      bondDebt: Math.max(0, finiteOr(orig.bondDebt, 0)),
      monthlyInterestRate: round4(effectiveInterestRate),
      techLevels: { ...orig.techLevels },
      shareholdings: { ...orig.shareholdings },
      sharePriceHistory: [...orig.sharePriceHistory],
      executives: clonedExecs,
      history: {
        months: [...orig.history.months],
        revenue: [...orig.history.revenue],
        netProfit: [...orig.history.netProfit],
        cash: [...orig.history.cash],
        marketCap: [...orig.history.marketCap],
      },
    };
  }

  // Pre-calculate media corporate brand bonuses across active facilities in O(F)
  const mediaBoostByCompany: Record<string, number> = {};
  const allOrigFacilities = Object.values(state.facilities);
  for (let i = 0; i < allOrigFacilities.length; i++) {
    const fac = allOrigFacilities[i];
    if (fac.type === 'media_telecom') {
      mediaBoostByCompany[fac.companyId] =
        (mediaBoostByCompany[fac.companyId] || 0) + 4 * fac.level;
    }
  }

  for (let i = 0; i < companyIds.length; i++) {
    const comp = updatedCompanies[companyIds[i]];
    const buffs = execBuffs[comp.id];
    const mediaBonus = mediaBoostByCompany[comp.id] || 0;
    const cmoBonus = buffs.hasCMO ? 2.5 : 0;
    comp.corporateBrandRating = clamp(
      roundCurrency((comp.corporateBrandRating || 45) * 0.98 + (mediaBonus + cmoBonus) * 0.35),
      15,
      100
    );
  }

  return { updatedCompanies, execBuffs, companyIds };
}

export function computeQualityAndBrand(
  f: Facility,
  comp: Company,
  buffs: ExecBuffs,
  prodId: ProductId
): number {
  const effectiveMaint = buffs.hasCOO
    ? roundCurrency(f.monthlyMaintenance * 0.85)
    : roundCurrency(f.monthlyMaintenance);
  let totalOpCost = effectiveMaint;

  const techLevel = comp.techLevels[prodId] || 30;
  const ctoQualityBonus = buffs.hasCTO ? 5 : 0;
  f.qualityRating = clamp(roundCurrency(techLevel * 0.72 + f.level * 5 + ctoQualityBonus), 1, 100);

  let adUnits = 0;
  for (let u = 0; u < f.units.length; u++) {
    if (f.units[u].type === 'advertising') adUnits++;
  }

  if (f.adBudget > 0) {
    const cmoMult = buffs.hasCMO ? 1.35 : 1.0;
    const adBoost = Math.min(
      5,
      Math.floor((f.adBudget * cmoMult * (1 + adUnits * 0.25)) / 4500)
    );
    f.brandRating = Math.min(100, f.brandRating + adBoost);
    totalOpCost += roundCurrency(f.adBudget);
  } else {
    f.brandRating = Math.max(10, f.brandRating - 1);
  }

  if (comp.brandStrategy === 'corporate') {
    f.brandRating = roundCurrency(f.brandRating * 0.65 + comp.corporateBrandRating * 0.35);
  }
  return totalOpCost;
}

export type DemandCalculator = (
  baseDemand: number,
  price: number,
  basePrice: number,
  qualityRating: number,
  brandRating: number,
  elasticity: number,
  appealWeights?: { price: number; quality: number; brand: number }
) => number;

export function runPrimaryAndNonFactoryStage(
  state: SimulationState,
  updatedMacro: MacroEconomy,
  updatedCompanies: Record<string, Company>,
  execBuffs: Record<string, ExecBuffs>,
  getTileTraffic: (tx: number, ty: number) => number,
  calcDemand: DemandCalculator
): {
  updatedFacilities: Record<string, Facility>;
  producerMeta: Record<string, ProducerMeta>;
  processingAndAssemblyQueue: Facility[];
  storesByProduct: Map<ProductId, Facility[]>;
} {
  const updatedFacilities: Record<string, Facility> = {};
  const producerMeta: Record<string, ProducerMeta> = {};
  const processingAndAssemblyQueue: Facility[] = [];
  const storesByProduct = new Map<ProductId, Facility[]>();

  const allOrigFacilities = Object.values(state.facilities);
  const activeCityId = state.activeCityId || PRIMARY_CITY_ID;

  for (let i = 0; i < allOrigFacilities.length; i++) {
    const fac = allOrigFacilities[i];
    const f: Facility = { ...fac, units: fac.units.map(u => ({ ...u })) };
    const facCityId = f.cityId || activeCityId;
    const facCity = (state.cities && state.cities[facCityId]) || state.city;

    // Government-owned civic apartments & citizen-owned resident houses (outside Bursa corporations)
    if (
      f.companyId === GOVT_OWNER_ID ||
      f.companyId === RESIDENT_OWNER_ID ||
      f.type === 'civic_housing' ||
      f.type === 'resident_house'
    ) {
      const tileTraffic = facCityId === activeCityId ? getTileTraffic(f.tileX, f.tileY) : 45;
      if (f.type === 'resident_house' || f.companyId === RESIDENT_OWNER_ID) {
        const tier = (f.housingTier || f.level || 1) as 1 | 2 | 3;
        const families = f.residentFamilies || tier * 8;
        const occupiedResidents = roundCurrency(families * 4 * clamp(0.78 + tileTraffic / 350, 0.75, 1.05));
        f.residentFamilies = families;
        f.lastMonthUnitsSold = occupiedResidents;
        f.monthlyProduction = occupiedResidents;
        f.monthlyRevenue = 0;
        f.monthlyCostOfGoods = 0;
        f.monthlyProfit = 0;
        f.qualityRating = Math.min(100, 52 + tier * 12);
        updatedFacilities[f.id] = f;
        continue;
      }
      let cap = 0;
      for (let u = 0; u < f.units.length; u++) {
        if (f.units[u].type === 'sales') cap += f.units[u].capacity * f.units[u].level;
      }
      if (cap <= 0) cap = 320;
      const occupancy = Math.min(
        0.98,
        0.74 + (facCity.consumerConfidence / 100) * 0.14 + (tileTraffic / 100) * 0.08
      );
      f.lastMonthUnitsSold = roundCurrency(cap * occupancy);
      f.monthlyProduction = f.lastMonthUnitsSold;
      f.monthlyRevenue = 0;
      f.monthlyCostOfGoods = 0;
      f.monthlyProfit = 0;
      f.qualityRating = Math.min(100, roundCurrency(58 + f.level * 6));
      updatedFacilities[f.id] = f;
      continue;
    }

    const comp = updatedCompanies[f.companyId];
    if (!comp) continue;

    // Defer processing & assembly factories until raw extractors & warehouses have produced
    if (f.type === 'factory_processing' || f.type === 'factory_assembly') {
      processingAndAssemblyQueue.push(f);
      continue;
    }

    const buffs = execBuffs[comp.id];
    const effectiveMaint = buffs.hasCOO
      ? roundCurrency(f.monthlyMaintenance * 0.85)
      : roundCurrency(f.monthlyMaintenance);
    let totalOpCost = effectiveMaint;

    // Private Real Estate: Residential Apartment Complex & Commercial Office Tower
    if (f.type === 'apartment_complex' || f.type === 'commercial_tower') {
      const tileTraffic = facCityId === activeCityId ? getTileTraffic(f.tileX, f.tileY) : 52;
      let adUnits = 0;
      let unitCap = 0;
      for (let u = 0; u < f.units.length; u++) {
        const unit = f.units[u];
        if (unit.type === 'advertising') adUnits++;
        else if (unit.type === 'sales') unitCap += unit.capacity * unit.level;
      }
      if (unitCap <= 0) unitCap = f.type === 'commercial_tower' ? 240 : 180;

      if (f.adBudget > 0) {
        const cmoMult = buffs.hasCMO ? 1.35 : 1.0;
        const adBoost = Math.min(4, Math.floor((f.adBudget * cmoMult * (1 + adUnits * 0.25)) / 5000));
        f.brandRating = Math.min(100, f.brandRating + adBoost);
        totalOpCost += roundCurrency(f.adBudget);
      } else {
        f.brandRating = Math.max(15, f.brandRating - 1);
      }

      const totalUnitsAvailable = unitCap * f.level;
      let occupancy = 0.72;
      let baseRate = 900;
      let serviceCostPerUnit = 220;

      if (f.type === 'apartment_complex') {
        occupancy = clamp(
          0.6 +
            (facCity.consumerConfidence / 100) * 0.18 +
            (tileTraffic / 100) * 0.16 +
            (f.brandRating / 100) * 0.08,
          0.55,
          0.98
        );
        const setRent = f.sellingPrice > 100 ? f.sellingPrice : 880;
        baseRate = setRent * (0.85 + tileTraffic / 240);
        serviceCostPerUnit = 210;
        f.qualityRating = Math.min(100, roundCurrency(52 + f.level * 8 + tileTraffic * 0.16));
      } else {
        const macroBoost =
          updatedMacro.cyclePhase === 'boom'
            ? 0.1
            : updatedMacro.cyclePhase === 'recession'
            ? -0.14
            : 0.02;
        occupancy = clamp(
          0.48 + (tileTraffic / 100) * 0.36 + macroBoost + (f.brandRating / 100) * 0.08,
          0.42,
          0.98
        );
        const setLease = f.sellingPrice > 100 ? f.sellingPrice : 1180;
        baseRate = setLease * (0.72 + tileTraffic / 115);
        serviceCostPerUnit = 285;
        f.qualityRating = Math.min(100, roundCurrency(54 + f.level * 8 + tileTraffic * 0.2));
      }

      const occupied = roundCurrency(totalUnitsAvailable * occupancy);
      f.monthlyProduction = occupied;
      f.monthlySales = occupied;
      f.lastMonthUnitsSold = occupied;
      f.monthlyRevenue = roundCurrency(occupied * baseRate);
      f.monthlyCostOfGoods = roundCurrency(occupied * serviceCostPerUnit);
      f.monthlyProfit = f.monthlyRevenue - f.monthlyCostOfGoods - totalOpCost;
      f.supplySourceLabel = `Keramaian ${tileTraffic}/100 · Okupansi ${Math.round(occupancy * 100)}%`;
      updatedFacilities[f.id] = f;
      continue;
    }

    // R&D Centers
    if (f.type === 'rd_center') {
      let unitCostSum = 0;
      const rdSubsidyMult = 1 + (state.government?.rdSubsidyRate || 0);
      for (let u = 0; u < f.units.length; u++) {
        const rdUnit = f.units[u];
        if (rdUnit.type !== 'rd') continue;
        const prod = rdUnit.targetProductId || comp.activeResearchProduct || 'smartphone';
        const currentTech = comp.techLevels[prod] || 25;
        if (currentTech < 100 && comp.cash >= rdUnit.monthlyCost) {
          const speedMult = (buffs.hasCTO ? 1.45 : 1.0) * rdSubsidyMult;
          const techGain = Math.max(1, roundCurrency(2 * rdUnit.level * f.level * speedMult));
          comp.techLevels[prod] = Math.min(100, currentTech + techGain);
          unitCostSum += rdUnit.monthlyCost;
        }
      }

      f.monthlyProduction = 0;
      f.monthlySales = 0;
      f.monthlyRevenue = 0;
      f.monthlyCostOfGoods = unitCostSum;
      f.monthlyProfit = -(totalOpCost + unitCostSum);
      updatedFacilities[f.id] = f;
      continue;
    }

    // Media & Telecom Station
    if (f.type === 'media_telecom') {
      const viewers = roundCurrency(facCity.population * 0.14 * (0.7 + f.level * 0.2));
      const adRev = roundCurrency(viewers * 0.55 * (facCity.consumerConfidence / 80));
      f.monthlyProduction = viewers;
      f.monthlySales = viewers;
      f.lastMonthUnitsSold = viewers;
      f.monthlyRevenue = adRev;
      f.monthlyCostOfGoods = roundCurrency(adRev * 0.22);
      f.monthlyProfit = f.monthlyRevenue - f.monthlyCostOfGoods - totalOpCost;
      updatedFacilities[f.id] = f;
      continue;
    }

    const primaryUnit = f.units.find(u => u.targetProductId);
    const prodId = primaryUnit?.targetProductId;
    const prodRecipe = prodId ? PRODUCTS[prodId] : null;

    if (!prodId || !prodRecipe) {
      f.monthlyProduction = 0;
      f.monthlyRevenue = 0;
      f.monthlyCostOfGoods = 0;
      f.monthlyProfit = -totalOpCost;
      updatedFacilities[f.id] = f;
      continue;
    }

    totalOpCost = computeQualityAndBrand(f, comp, buffs, prodId);

    // Digital Age Software Firm
    if (f.type === 'tech_software') {
      let totalCap = 0;
      for (let u = 0; u < f.units.length; u++) {
        if (f.units[u].type === 'manufacturing') {
          totalCap += f.units[u].capacity * f.units[u].level;
        }
      }
      if (totalCap <= 0) totalCap = 4500;
      const effPrice = f.sellingPrice > 0 ? f.sellingPrice : prodRecipe.basePrice;
      const demand = calcDemand(
        roundCurrency(facCity.population * 0.015 * prodRecipe.demandFactor * 10),
        effPrice,
        prodRecipe.basePrice,
        f.qualityRating,
        f.brandRating,
        prodRecipe.elasticity,
        prodRecipe.appealWeights
      );
      const soldLicenses = Math.min(totalCap * f.level, Math.max(200, demand));
      const unitCost = prodRecipe.baseCost;
      f.monthlyProduction = soldLicenses;
      f.monthlySales = soldLicenses;
      f.lastMonthUnitsSold = soldLicenses;
      f.monthlyRevenue = roundCurrency(soldLicenses * effPrice);
      f.monthlyCostOfGoods = roundCurrency(soldLicenses * unitCost);
      f.monthlyProfit = f.monthlyRevenue - f.monthlyCostOfGoods - totalOpCost;
      updatedFacilities[f.id] = f;
      continue;
    }

    // Warehouse & Logistics Hub
    if (f.type === 'warehouse_logistics') {
      let invCapBonus = 0;
      for (let u = 0; u < f.units.length; u++) {
        if (f.units[u].type === 'inventory') invCapBonus += f.units[u].capacity;
      }
      f.inventoryCapacity = Math.max(f.inventoryCapacity, invCapBonus);
      const throughput = roundCurrency(Math.min(f.inventoryCapacity * 0.4, 8000 * f.level));
      f.inventoryLevel = Math.min(
        f.inventoryCapacity,
        roundCurrency(f.inventoryLevel * 0.6 + throughput)
      );
      f.monthlyProduction = throughput;
      f.lastMonthUnitsSold = roundCurrency(throughput * 0.8);
      f.monthlyRevenue = roundCurrency(f.lastMonthUnitsSold * (prodRecipe.basePrice * 0.12));
      f.monthlyCostOfGoods = roundCurrency(f.monthlyRevenue * 0.35);
      f.monthlyProfit = f.monthlyRevenue - f.monthlyCostOfGoods - totalOpCost;
      updatedFacilities[f.id] = f;
      continue;
    }

    // Primary Extractors (Farms, Mines, Green Power Plants)
    if (
      f.type === 'farm_agriculture' ||
      f.type === 'mine_extraction' ||
      f.type === 'power_plant_green'
    ) {
      let totalMfgCapacity = 0;
      for (let u = 0; u < f.units.length; u++) {
        if (f.units[u].type === 'manufacturing') {
          totalMfgCapacity += f.units[u].capacity * f.units[u].level * f.units[u].efficiency;
        }
      }

      const cityParcels = facCity.mapParcels || state.mapParcels;
      const parcelHere = getParcelAt(cityParcels, f.tileX, f.tileY);
      const depositBonus = getDepositYieldBonus(f.type, parcelHere?.resourceDeposit);
      f.depositBonusPct = depositBonus;

      const yieldMult = 1 + depositBonus / 100;
      const costReduction = 1 - Math.min(0.22, depositBonus / 220);
      const unitCost = prodRecipe.baseCost * (1.08 - f.level * 0.03) * costReduction;
      f.supplySourceLabel =
        depositBonus > 0 ? `Ekstraksi Deposit +${depositBonus}%` : 'Ekstraksi Mandiri';

      const producedUnits = roundCurrency(totalMfgCapacity * f.level * yieldMult);
      f.monthlyProduction = producedUnits;
      f.inventoryLevel = Math.min(f.inventoryCapacity, f.inventoryLevel + producedUnits);
      f.lastMonthUnitsSold = 0;
      f.monthlyRevenue = 0;
      f.monthlyCostOfGoods = 0;
      f.monthlyProfit = -totalOpCost;

      const gridPowerRev =
        f.type === 'power_plant_green'
          ? roundCurrency(facCity.population * 0.032 * (0.85 + f.level * 0.22))
          : 0;

      producerMeta[f.id] = {
        unitCost,
        effectiveOpCost: totalOpCost,
        gridPowerRev,
        primaryProdId: prodId,
      };
      updatedFacilities[f.id] = f;
      continue;
    }

    // Retail Store baseline (bucketed for Stage 2)
    f.monthlyProduction = 0;
    updatedFacilities[f.id] = f;
    if (f.type.startsWith('store_')) {
      let bucket = storesByProduct.get(prodId);
      if (!bucket) {
        bucket = [];
        storesByProduct.set(prodId, bucket);
      }
      bucket.push(f);
    }
  }

  return { updatedFacilities, producerMeta, processingAndAssemblyQueue, storesByProduct };
}

export function runManufacturingStage(
  processingAndAssemblyQueue: Facility[],
  updatedCompanies: Record<string, Company>,
  execBuffs: Record<string, ExecBuffs>,
  updatedMacro: MacroEconomy,
  updatedFacilities: Record<string, Facility>,
  producerMeta: Record<string, ProducerMeta>
): void {
  processingAndAssemblyQueue.sort((a, b) => {
    if (a.type === b.type) return 0;
    return a.type === 'factory_processing' ? -1 : 1;
  });

  for (let i = 0; i < processingAndAssemblyQueue.length; i++) {
    const f = processingAndAssemblyQueue[i];
    const comp = updatedCompanies[f.companyId];
    const buffs = execBuffs[f.companyId];
    const primaryUnit = f.units.find(u => u.targetProductId);
    const prodId = primaryUnit?.targetProductId;
    const prodRecipe = prodId ? PRODUCTS[prodId] : null;

    const effectiveMaint = buffs.hasCOO
      ? roundCurrency(f.monthlyMaintenance * 0.85)
      : roundCurrency(f.monthlyMaintenance);

    if (!comp || !prodId || !prodRecipe) {
      f.monthlyProduction = 0;
      f.monthlyRevenue = 0;
      f.monthlyCostOfGoods = 0;
      f.monthlyProfit = -(effectiveMaint + roundCurrency(f.adBudget));
      updatedFacilities[f.id] = f;
      continue;
    }

    const totalOpCost = computeQualityAndBrand(f, comp, buffs, prodId);

    let totalMfgCapacity = 0;
    let purchasingUnit: Facility['units'][number] | undefined;
    for (let u = 0; u < f.units.length; u++) {
      const unit = f.units[u];
      if (unit.type === 'manufacturing') {
        totalMfgCapacity += unit.capacity * unit.level * unit.efficiency;
      } else if (unit.type === 'purchasing' && !purchasingUnit) {
        purchasingUnit = unit;
      }
    }

    let unitCost = prodRecipe.baseCost * (1.08 - f.level * 0.03);
    const producedUnits = roundCurrency(totalMfgCapacity * f.level);
    const supplierId = purchasingUnit?.supplierFacilityId;
    const supplierFac =
      supplierId && supplierId !== 'seaport' && supplierId !== f.id
        ? updatedFacilities[supplierId]
        : null;
    const isInternalSupplier = Boolean(supplierFac && supplierFac.companyId === f.companyId);

    if (prodRecipe.inputs && prodRecipe.inputs.length > 0) {
      const supplierProdId = supplierFac?.units.find(u => u.targetProductId)?.targetProductId;
      let inputCost = 0;

      for (let k = 0; k < prodRecipe.inputs.length; k++) {
        const inp = prodRecipe.inputs[k];
        const inpRecipe = PRODUCTS[inp.productId];
        const canPullFromLinkedSupplier =
          Boolean(supplierFac) &&
          supplierProdId === inp.productId &&
          supplierFac!.inventoryLevel > 10 &&
          producedUnits > 0;

        if (canPullFromLinkedSupplier && supplierFac && inpRecipe) {
          const neededQty = roundCurrency(producedUnits * inp.amount);
          const pulled = Math.min(neededQty, supplierFac.inventoryLevel);
          supplierFac.inventoryLevel -= pulled;

          const transferPrice = isInternalSupplier
            ? round2(inpRecipe.baseCost * 1.02)
            : round2(supplierFac.sellingPrice > 0 ? supplierFac.sellingPrice : inpRecipe.basePrice * 0.85);

          const sMeta = producerMeta[supplierFac.id];
          if (sMeta && pulled > 0) {
            supplierFac.lastMonthUnitsSold += pulled;
            supplierFac.monthlyRevenue += roundCurrency(pulled * transferPrice);
            supplierFac.monthlyCostOfGoods += roundCurrency(pulled * sMeta.unitCost);
          }

          const remainder = Math.max(0, neededQty - pulled);
          const seaportCost = inpRecipe.basePrice * (1 + updatedMacro.importTariffRate);
          const blendedUnitInputCost =
            neededQty > 0
              ? (pulled * transferPrice + remainder * seaportCost) / neededQty
              : transferPrice;
          inputCost += blendedUnitInputCost * inp.amount;
        } else {
          const marketInputPrice = inpRecipe
            ? isInternalSupplier
              ? inpRecipe.baseCost * 1.05
              : inpRecipe.basePrice
            : 50;
          inputCost += marketInputPrice * inp.amount;
        }
      }

      unitCost = Math.max(unitCost * 0.8, inputCost * (isInternalSupplier ? 0.88 : 1.02));
      f.supplySourceLabel = isInternalSupplier
        ? 'Internal'
        : supplierFac
        ? 'B2B Domestik'
        : 'Pelabuhan Impor';

      if (supplierFac) {
        f.qualityRating = Math.min(
          100,
          roundCurrency(f.qualityRating * 0.7 + supplierFac.qualityRating * 0.3)
        );
      }
    } else {
      f.supplySourceLabel = 'Ekstraksi Mandiri';
    }

    f.monthlyProduction = producedUnits;
    f.inventoryLevel = Math.min(f.inventoryCapacity, f.inventoryLevel + producedUnits);
    f.lastMonthUnitsSold = 0;
    f.monthlyRevenue = 0;
    f.monthlyCostOfGoods = 0;
    f.monthlyProfit = -totalOpCost;

    producerMeta[f.id] = {
      unitCost,
      effectiveOpCost: totalOpCost,
      gridPowerRev: 0,
      primaryProdId: prodId,
    };
    updatedFacilities[f.id] = f;
  }
}
