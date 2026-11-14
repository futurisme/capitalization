import { CityMarket, Company, Facility, MacroEconomy, ProductId, SimulationState } from '../types/game';
import { FACILITY_SPECS, PRODUCTS } from './productsData';
import { clamp, deterministicHash, finiteOr, round2, roundCurrency, safeDivide } from './precisionMath';
import { getTrafficDemandMultiplier } from './spatialGrid';
import type { DemandCalculator, ExecBuffs, ProducerMeta } from './supplyChainEngine';

export function runRetailCompetitionStage(
  state: SimulationState,
  updatedMacro: MacroEconomy,
  updatedCompanies: Record<string, Company>,
  execBuffs: Record<string, ExecBuffs>,
  updatedFacilities: Record<string, Facility>,
  producerMeta: Record<string, ProducerMeta>,
  storesByProduct: Map<ProductId, Facility[]>,
  getTileTraffic: (tx: number, ty: number) => number,
  calcDemand: DemandCalculator
): CityMarket {
  const popGrowth = updatedMacro.cyclePhase === 'recession' ? 0.001 : 0.0035;
  const confTarget =
    updatedMacro.cyclePhase === 'boom'
      ? 92
      : updatedMacro.cyclePhase === 'recession'
      ? 62
      : updatedMacro.cyclePhase === 'recovery'
      ? 78
      : 82;

  const updatedCity: CityMarket = {
    ...state.city,
    population: roundCurrency(state.city.population * (1 + popGrowth)),
    averageWage: roundCurrency(state.city.averageWage * (1 + updatedMacro.inflationRate / 1200)),
    consumerConfidence: clamp(
      roundCurrency(state.city.consumerConfidence * 0.85 + confTarget * 0.15),
      20,
      100
    ),
    productStats: { ...state.city.productStats },
  };

  const productKeys = Object.keys(PRODUCTS) as ProductId[];
  for (let pIdx = 0; pIdx < productKeys.length; pIdx++) {
    const prodId = productKeys[pIdx];
    const prod = PRODUCTS[prodId];
    if (prod.category !== 'consumer' && prod.category !== 'digital') continue;

    const baseDemand = roundCurrency(
      updatedCity.population *
        0.042 *
        (prod.demandFactor || 0.25) *
        (updatedCity.averageWage / 4200) *
        (updatedCity.consumerConfidence / 100)
    );

    const stores = storesByProduct.get(prodId);
    if (!stores || stores.length === 0) {
      updatedCity.productStats[prodId] = {
        monthlyDemand: baseDemand,
        monthlySupply: 0,
        averageMarketPrice: prod.basePrice,
        playerMarketShare: 0,
        satisfactionRate: 0,
        seaportImportShare: 100,
      };
      continue;
    }

    const scores: { facility: Facility; score: number; trafficMult: number }[] = new Array(
      stores.length
    );
    let totalScore = 0;
    let totalSellingPrice = 0;
    let seaportVolume = 0;

    for (let sIdx = 0; sIdx < stores.length; sIdx++) {
      const store = stores[sIdx];
      const comp = updatedCompanies[store.companyId];
      const buffs = execBuffs[store.companyId];

      if (store.autoPricing && buffs?.hasCOO) {
        const invRatio = safeDivide(store.inventoryLevel, Math.max(1, store.inventoryCapacity), 0);
        if (invRatio > 0.75) {
          store.sellingPrice = Math.max(
            roundCurrency(prod.baseCost * 1.15),
            roundCurrency(store.sellingPrice * 0.96)
          );
        } else if (invRatio < 0.2) {
          store.sellingPrice = Math.min(
            roundCurrency(prod.basePrice * 1.35),
            roundCurrency(store.sellingPrice * 1.03)
          );
        }
      }

      const purchasingUnit = store.units.find(u => u.type === 'purchasing');
      const supplierId = purchasingUnit?.supplierFacilityId;
      const supplierFac =
        supplierId && supplierId !== 'seaport' ? updatedFacilities[supplierId] : null;

      if (supplierFac && supplierFac.inventoryLevel > 0) {
        const isInternal = supplierFac.companyId === store.companyId;
        store.supplySourceLabel = isInternal ? 'Pabrik Internal' : 'Grosir B2B';
        store.qualityRating = Math.min(
          100,
          roundCurrency(supplierFac.qualityRating * 0.8 + store.level * 4)
        );
      } else {
        store.supplySourceLabel = 'Pelabuhan Impor';
        store.qualityRating = Math.min(
          100,
          roundCurrency(45 + store.level * 3 + (comp?.techLevels[prodId] || 30) * 0.2)
        );
      }

      const price = Math.max(1, finiteOr(store.sellingPrice, prod.basePrice));
      totalSellingPrice += price;

      const tileTraffic = getTileTraffic(store.tileX, store.tileY);
      const trafficMult = getTrafficDemandMultiplier(tileTraffic);

      const rawDemandScore = calcDemand(
        baseDemand,
        price,
        prod.basePrice,
        store.qualityRating,
        store.brandRating,
        prod.elasticity,
        prod.appealWeights
      );
      const demandScore = rawDemandScore > 0 ? Math.max(1, roundCurrency(rawDemandScore * trafficMult)) : 0;

      scores[sIdx] = { facility: store, score: demandScore, trafficMult };
      totalScore += demandScore;
    }

    const averageMarketPrice = round2(totalSellingPrice / stores.length);
    let totalSoldInCity = 0;
    let playerSoldInCity = 0;

    for (let sIdx = 0; sIdx < scores.length; sIdx++) {
      const item = scores[sIdx];
      const store = item.facility;
      const marketShareFrac = totalScore > 0 ? safeDivide(item.score, totalScore, 0) : 0;
      const allocatedCustomerDemand = Math.min(
        item.score,
        baseDemand,
        roundCurrency(baseDemand * marketShareFrac * (0.85 + item.trafficMult * 0.16))
      );

      let salesCapacity = 0;
      let purchasingCap = 0;
      let purchasingUnit: Facility['units'][number] | undefined;

      for (let u = 0; u < store.units.length; u++) {
        const unit = store.units[u];
        if (unit.type === 'sales') salesCapacity += unit.capacity * unit.level;
        else if (unit.type === 'purchasing') {
          purchasingCap += unit.capacity * unit.level;
          if (!purchasingUnit) purchasingUnit = unit;
        }
      }
      if (salesCapacity <= 0) salesCapacity = 6500;
      if (purchasingCap <= 0) purchasingCap = 8000;

      const storeMaxCapacity = salesCapacity * store.level;
      const supplierId = purchasingUnit?.supplierFacilityId;
      const supplierFac =
        supplierId && supplierId !== 'seaport' ? updatedFacilities[supplierId] : null;

      let procurementUnitCost = round2(prod.seaportPrice * (1 + updatedMacro.importTariffRate));

      const restockHeadroom = Math.max(
        0,
        store.inventoryCapacity - store.inventoryLevel + allocatedCustomerDemand
      );
      let supplyProcured = Math.min(roundCurrency(purchasingCap * store.level), restockHeadroom);

      if (supplierFac && supplierFac.inventoryLevel > 10 && supplyProcured > 0) {
        const pulled = Math.min(supplyProcured, supplierFac.inventoryLevel);
        supplierFac.inventoryLevel -= pulled;
        supplyProcured = pulled;
        const isInternal = supplierFac.companyId === store.companyId;
        const transferPrice = isInternal
          ? round2(prod.baseCost * 1.02)
          : round2(supplierFac.sellingPrice > 0 ? supplierFac.sellingPrice : prod.basePrice * 0.72);
        procurementUnitCost = transferPrice;

        const sMeta = producerMeta[supplierFac.id];
        if (sMeta) {
          supplierFac.lastMonthUnitsSold += pulled;
          supplierFac.monthlyRevenue += roundCurrency(pulled * transferPrice);
          supplierFac.monthlyCostOfGoods += roundCurrency(pulled * sMeta.unitCost);
        }
      } else if (supplyProcured > 0) {
        seaportVolume += supplyProcured;
      }

      store.inventoryLevel = Math.min(
        store.inventoryCapacity,
        store.inventoryLevel + supplyProcured
      );

      const actualSales = Math.min(allocatedCustomerDemand, store.inventoryLevel, storeMaxCapacity);
      store.inventoryLevel = Math.max(0, store.inventoryLevel - actualSales);
      store.lastMonthUnitsSold = actualSales;

      const effectiveMaint = execBuffs[store.companyId]?.hasCOO
        ? roundCurrency(store.monthlyMaintenance * 0.85)
        : roundCurrency(store.monthlyMaintenance);

      store.monthlyRevenue = roundCurrency(actualSales * store.sellingPrice);
      store.monthlyCostOfGoods = roundCurrency(actualSales * procurementUnitCost);
      store.monthlyProfit =
        store.monthlyRevenue - store.monthlyCostOfGoods - effectiveMaint - roundCurrency(store.adBudget);

      totalSoldInCity += actualSales;
      if (store.companyId === state.playerCompanyId) {
        playerSoldInCity += actualSales;
      }
    }

    updatedCity.productStats[prodId] = {
      monthlyDemand: baseDemand,
      monthlySupply: totalSoldInCity,
      averageMarketPrice,
      playerMarketShare:
        totalSoldInCity > 0 ? roundCurrency((playerSoldInCity / totalSoldInCity) * 100) : 0,
      satisfactionRate: Math.min(100, roundCurrency((totalSoldInCity / Math.max(1, baseDemand)) * 100)),
      seaportImportShare:
        totalSoldInCity > 0
          ? Math.min(
              100,
              roundCurrency((seaportVolume / Math.max(1, totalSoldInCity + seaportVolume)) * 100)
            )
          : 100,
    };
  }

  return updatedCity;
}

export function finalizeUpstreamSurplusStage(
  updatedFacilities: Record<string, Facility>,
  producerMeta: Record<string, ProducerMeta>,
  consumerConfidence: number
): void {
  const producerEntries = Object.entries(producerMeta);
  for (let i = 0; i < producerEntries.length; i++) {
    const [fId, meta] = producerEntries[i];
    const f = updatedFacilities[fId];
    if (!f) continue;
    const prodRecipe = PRODUCTS[meta.primaryProdId];
    if (!prodRecipe) continue;

    const wholesalePrice = round2(f.sellingPrice > 0 ? f.sellingPrice : prodRecipe.basePrice);
    const surplusDemand = roundCurrency(f.inventoryLevel * 0.65 * (consumerConfidence / 85));
    const surplusSold = Math.min(f.inventoryLevel, surplusDemand);

    f.inventoryLevel -= surplusSold;
    f.lastMonthUnitsSold += surplusSold;
    f.monthlySales = f.lastMonthUnitsSold;
    f.monthlyRevenue += roundCurrency(surplusSold * wholesalePrice) + meta.gridPowerRev;
    f.monthlyCostOfGoods += roundCurrency(surplusSold * meta.unitCost);
    f.monthlyProfit = f.monthlyRevenue - f.monthlyCostOfGoods - meta.effectiveOpCost;
  }
}

export function settleCorporatePnLAndValuationStage(
  companyIds: string[],
  updatedCompanies: Record<string, Company>,
  updatedFacilities: Record<string, Facility>,
  execBuffs: Record<string, ExecBuffs>,
  updatedMacro: MacroEconomy,
  monthStr: string,
  nextMonth: number
): void {
  const facilitiesByCompany = new Map<string, Facility[]>();
  const updatedFacilityValues = Object.values(updatedFacilities);
  let totalMarketRevenue = 0;

  for (let i = 0; i < updatedFacilityValues.length; i++) {
    const fac = updatedFacilityValues[i];
    totalMarketRevenue += fac.monthlyRevenue;
    let list = facilitiesByCompany.get(fac.companyId);
    if (!list) {
      list = [];
      facilitiesByCompany.set(fac.companyId, list);
    }
    list.push(fac);
  }

  const paidDividendsByCompany = new Map<string, number>();
  const companyNetProfits = new Map<string, number>();
  const companyTotalRevenues = new Map<string, number>();

  for (let i = 0; i < companyIds.length; i++) {
    const company = updatedCompanies[companyIds[i]];
    const ownedFacilities = facilitiesByCompany.get(company.id) || [];
    company.facilitiesCount = ownedFacilities.length;

    let totalRevenue = 0;
    let sumFacilityProfit = 0;

    for (let j = 0; j < ownedFacilities.length; j++) {
      totalRevenue += ownedFacilities[j].monthlyRevenue;
      sumFacilityProfit += ownedFacilities[j].monthlyProfit;
    }

    const buffs = execBuffs[company.id];
    const execPayroll = buffs?.payroll || 0;
    const bankInterest = roundCurrency(company.debt * company.monthlyInterestRate);
    const bondInterest = roundCurrency((company.bondDebt || 0) * 0.0045);
    const loanInterest = bankInterest + bondInterest;

    // Exact double-entry reconciliation: netProfit === sum(facilityProfit) - payroll - loanInterest
    const netProfit = roundCurrency(sumFacilityProfit - execPayroll - loanInterest);
    companyNetProfits.set(company.id, netProfit);
    companyTotalRevenues.set(company.id, totalRevenue);

    company.cash = roundCurrency(company.cash + netProfit);

    const founderHeld = company.shareholdings[company.id] || 0;
    const externalShares = Math.max(
      0,
      company.sharesOutstanding - company.treasuryShares - founderHeld
    );
    if (company.dividendPerShare > 0 && externalShares > 0 && company.cash > 500000) {
      const totalDividend = roundCurrency(externalShares * company.dividendPerShare);
      if (company.cash >= totalDividend) {
        company.cash -= totalDividend;
        paidDividendsByCompany.set(company.id, company.dividendPerShare);
      }
    }
  }

  // Verified cross-holding dividends (conservation guaranteed)
  for (let i = 0; i < companyIds.length; i++) {
    const company = updatedCompanies[companyIds[i]];
    const entries = Object.entries(company.shareholdings);
    for (let j = 0; j < entries.length; j++) {
      const [targetId, sharesOwned] = entries[j];
      if (targetId !== company.id && sharesOwned > 0) {
        const paidRate = paidDividendsByCompany.get(targetId);
        if (paidRate && paidRate > 0) {
          company.cash += roundCurrency(sharesOwned * paidRate);
        }
      }
    }
  }

  // Historical records, assets, equity, and deterministic stock valuation
  for (let i = 0; i < companyIds.length; i++) {
    const company = updatedCompanies[companyIds[i]];
    const ownedFacilities = facilitiesByCompany.get(company.id) || [];
    const totalRevenue = companyTotalRevenues.get(company.id) || 0;
    const netProfit = companyNetProfits.get(company.id) || 0;
    const totalDebt = company.debt + (company.bondDebt || 0);

    company.history.months.push(monthStr);
    company.history.revenue.push(totalRevenue);
    company.history.netProfit.push(netProfit);
    company.history.cash.push(company.cash);

    if (company.history.months.length > 12) {
      company.history.months.shift();
      company.history.revenue.shift();
      company.history.netProfit.shift();
      company.history.cash.shift();
      company.history.marketCap.shift();
    }

    company.lastMonthRevenue = totalRevenue;
    company.lastMonthNetProfit = netProfit;
    company.marketSharePercentage =
      totalMarketRevenue > 0 ? roundCurrency((totalRevenue / totalMarketRevenue) * 100) : 0;

    let facilitiesBookValue = 0;
    for (let j = 0; j < ownedFacilities.length; j++) {
      const f = ownedFacilities[j];
      const spec = FACILITY_SPECS[f.type];
      facilitiesBookValue += spec ? spec.constructionCost * (0.85 + f.level * 0.1) : 500000;
    }

    let portfolioValue = 0;
    const holdings = Object.entries(company.shareholdings);
    for (let j = 0; j < holdings.length; j++) {
      const [tId, cnt] = holdings[j];
      if (tId !== company.id && cnt > 0 && updatedCompanies[tId]) {
        portfolioValue += cnt * updatedCompanies[tId].stockPrice;
      }
    }

    company.totalAssets = roundCurrency(company.cash + facilitiesBookValue + portfolioValue);
    company.bookValue = Math.max(100000, company.totalAssets - totalDebt);

    const annualNetProfit = netProfit * 12;
    const effectiveShares = Math.max(100000, company.sharesOutstanding - company.treasuryShares);
    const eps = clamp(annualNetProfit / effectiveShares, -5, 20);
    const macroPEBias =
      updatedMacro.cyclePhase === 'boom' ? 3 : updatedMacro.cyclePhase === 'recession' ? -3 : 0;
    const peMultiple = clamp(14 + (netProfit > 0 ? 3 : -2) + macroPEBias, 7, 24);

    const earningsValuation = Math.max(3, eps * peMultiple);
    const bookValuePerShare = Math.max(2, safeDivide(company.bookValue, company.sharesOutstanding, 2));

    const targetPrice = clamp(
      round2(bookValuePerShare * 0.42 + earningsValuation * 0.58),
      1.0,
      160.0
    );

    const idSeed = deterministicHash(company.ticker) % 256;
    const sentimentWave = 1 + Math.sin((nextMonth * 1.3 + idSeed) * 0.7) * 0.012;
    company.stockPrice = clamp(
      round2((company.stockPrice * 0.85 + targetPrice * 0.15) * sentimentWave),
      1.0,
      250.0
    );
    company.sharePriceHistory.push(company.stockPrice);
    if (company.sharePriceHistory.length > 24) company.sharePriceHistory.shift();

    company.marketCap = roundCurrency(company.stockPrice * company.sharesOutstanding);
    company.history.marketCap.push(company.marketCap);
    company.peRatio = eps > 0 ? Math.round((company.stockPrice / eps) * 10) / 10 : 0;
  }
}
