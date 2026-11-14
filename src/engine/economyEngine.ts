import { SimulationState } from '../types/game';
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
 * Runs one full Capitalism Lab 13 economic month with reconciled P&L & multi-tier supply chain flow:
 * 1. Macro & Executive buffs (O(C))
 * 2. Primary Extraction & Non-Producer operations (Civic, Resident Housing, Real Estate, R&D, Media, Software, Logistics)
 * 3. Secondary Manufacturing (Processing -> Assembly) with upstream input dispatch & B2B/internal credit
 * 4. Retail Market Competition & Capacity-Capped Linked Supply Chain Transfers
 * 5. Surplus wholesale clearance + Reconciled Dividends, Corporate P&L & Deterministic Valuation
 * 6. Automated Resident Housing growth/upgrades, Natural Resource discovery & Labor/CPI indices
 */
export function simulateEconomicMonth(state: SimulationState): SimulationState {
  const nextMonth = state.currentTick + 1;
  const year = 2026 + Math.floor(nextMonth / 12);
  const monthStr = `${MONTH_NAMES[nextMonth % 12]} ${year}`;

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

  const updatedCity = runRetailCompetitionStage(
    state,
    updatedMacro,
    updatedCompanies,
    execBuffs,
    updatedFacilities,
    producerMeta,
    storesByProduct,
    getTileTraffic,
    calculateConsumerDemand
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
    inflationStepFactor
  );

  const baseNextState: SimulationState = {
    ...state,
    currentTick: nextMonth,
    dateString: monthStr,
    companies: updatedCompanies,
    facilities: updatedFacilities,
    city: updatedCity,
    macro: updatedMacro,
    mapParcels: updatedParcels,
  };

  return simulateAutomatedHousingAndResources(baseNextState);
}
