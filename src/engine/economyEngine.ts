import { CityMarket, SimulationState } from '../types/game';
import {
  buildTrafficLookupGrid,
  getTrafficDemandMultiplier,
  inferGridSize,
  recalculateCityTraffic,
} from './spatialGrid';
import { calculateConsumerDemand } from './demandEngine';
import { advanceMacroEconomy } from './macroEngine';
import {
  addUnitToFacilitySlot,
  createDefaultUnitsForFacility,
  getFacilityUpgradeCost,
  getUnitInstallCost,
  getUnitUpgradeCost,
} from './facilityUnits';
import {
  prepareCompaniesAndExecBuffs,
  runManufacturingStage,
  runPrimaryAndNonFactoryStage,
} from './supplyChainEngine';
import {
  finalizeUpstreamSurplusStage,
  runRetailCompetitionStage,
  settleCorporatePnLAndValuationStage,
} from './corporateFinanceEngine';
import {
  simulateAutomatedHousingAndResources,
  claimResidentProperty,
  demolishResidentProperty,
  buyVacantLandParcel,
  sellOwnedLandParcel,
} from './housingEcosystem';
import { PRIMARY_CITY_ID, simulateGovernmentMonth } from './governmentEngine';
import { simulateInvestorsAndCareersMonth } from './investorEngine';

// Re-export modular engine APIs to preserve single-import compatibility
export {
  getTrafficDemandMultiplier,
  recalculateCityTraffic,
  getFacilityUpgradeCost,
  getUnitInstallCost,
  getUnitUpgradeCost,
  calculateConsumerDemand,
  createDefaultUnitsForFacility,
  addUnitToFacilitySlot,
  advanceMacroEconomy,
  claimResidentProperty,
  demolishResidentProperty,
  buyVacantLandParcel,
  sellOwnedLandParcel,
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] as const;

/**
 * Runs one full Capitalism Lab 13 economic month with reconciled P&L, multi-city simulation,
 * 100-entity autonomous investors & career progression, and government elections/cabinet policy:
 * 1. Macro & Executive buffs (O(C))
 * 2. Primary Extraction & Non-Producer operations
 * 3. Secondary Manufacturing (Processing -> Assembly)
 * 4. Multi-City Retail Market Competition & Linked Supply Transfers
 * 5. Surplus clearance + Reconciled Dividends, Corporate P&L & Deterministic Valuation
 * 6. Automated Resident Housing, Natural Resource discovery & Labor/CPI indices
 * 7. National & Municipal Government + 100 AI Entities Investor/CEO/Political Cycle
 */
export function simulateEconomicMonth(state: SimulationState): SimulationState {
  const nextMonth = state.currentTick + 1;
  const year = 2026 + Math.floor(nextMonth / 12);
  const monthStr = `${MONTH_NAMES[nextMonth % 12]} ${year}`;
  const activeId = state.activeCityId || PRIMARY_CITY_ID;

  const updatedMacro = advanceMacroEconomy(state.macro, nextMonth);
  const { updatedCompanies, execBuffs, companyIds } = prepareCompaniesAndExecBuffs(
    state,
    updatedMacro
  );

  // Pooled O(1) coordinate lookup for tile Traffic Index (0-100)
  const parcelGridSize = inferGridSize(state.mapParcels.length);
  const trafficGrid = buildTrafficLookupGrid(state.mapParcels, parcelGridSize);
  const getTileTraffic = (tx: number, ty: number): number => {
    if (tx < 0 || tx >= parcelGridSize || ty < 0 || ty >= parcelGridSize) return 25;
    return trafficGrid[ty * parcelGridSize + tx];
  };

  const {
    updatedFacilities,
    producerMeta,
    processingAndAssemblyQueue,
    storesByProduct,
  } = runPrimaryAndNonFactoryStage(
    state,
    updatedMacro,
    updatedCompanies,
    execBuffs,
    getTileTraffic,
    calculateConsumerDemand
  );

  runManufacturingStage(
    processingAndAssemblyQueue,
    updatedCompanies,
    execBuffs,
    updatedMacro,
    updatedFacilities,
    producerMeta
  );

  const updatedCities: Record<string, CityMarket> = {};
  const updatedCity = runRetailCompetitionStage(
    state,
    updatedMacro,
    updatedCompanies,
    execBuffs,
    updatedFacilities,
    producerMeta,
    storesByProduct,
    getTileTraffic,
    calculateConsumerDemand,
    updatedCities
  );

  finalizeUpstreamSurplusStage(
    updatedFacilities,
    producerMeta,
    updatedCity.consumerConfidence
  );

  settleCorporatePnLAndValuationStage(
    companyIds,
    updatedCompanies,
    updatedFacilities,
    execBuffs,
    updatedMacro,
    monthStr,
    nextMonth
  );

  const inflationStepFactor = 1 + updatedMacro.inflationRate / 2400;
  const updatedParcels = recalculateCityTraffic(
    state.mapParcels,
    updatedFacilities,
    inflationStepFactor,
    activeId
  );

  if (updatedCities[activeId]) {
    updatedCities[activeId] = {
      ...updatedCities[activeId],
      mapParcels: updatedParcels,
    };
  }

  const baseNextState: SimulationState = {
    ...state,
    currentTick: nextMonth,
    dateString: monthStr,
    companies: updatedCompanies,
    facilities: updatedFacilities,
    city: updatedCity,
    cities: Object.keys(updatedCities).length > 0 ? updatedCities : state.cities,
    activeCityId: activeId,
    macro: updatedMacro,
    mapParcels: updatedParcels,
  };

  const afterHousing = simulateAutomatedHousingAndResources(baseNextState);
  const afterGov = simulateGovernmentMonth(afterHousing);
  return simulateInvestorsAndCareersMonth(afterGov);
}

