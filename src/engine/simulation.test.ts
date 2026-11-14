import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateConsumerDemand,
  simulateEconomicMonth,
  addUnitToFacilitySlot,
  advanceMacroEconomy,
  getFacilityUpgradeCost,
  getUnitInstallCost,
  getUnitUpgradeCost,
  createDefaultUnitsForFacility,
  recalculateCityTraffic,
  getTrafficDemandMultiplier,
} from './economyEngine';
import {
  executeStockTrade,
  handleCorporateLoan,
  getOwnershipPercentage,
  issueNewShares,
  executeSubsidiaryMerger,
} from './stockMarket';
import { simulateAICompetitors, processAICompanyTurn, getMaxAllowedFacilities, replenishAICompetitors, findAvailableParcel } from './aiCompetitor';
import {
  generateDefaultState,
  exportStateAsJSON,
  importStateFromJSON,
  MAP_GRID_SIZE,
} from './saveSystem';
import { MAX_ACTIVE_COMPANIES, GOVT_OWNER_ID, RESIDENT_OWNER_ID } from './productsData';
import {
  claimResidentProperty,
  demolishResidentProperty,
  buyVacantLandParcel,
  sellOwnedLandParcel,
  getDepositYieldBonus,
  simulateAutomatedHousingAndResources,
} from './housingEcosystem';

test('1. calculateConsumerDemand responds dynamically to price, quality, brand, and appeal weights', () => {
  const baseDemand = 10000;
  const basePrice = 10;
  const elasticity = 1.5;

  const standardDemand = calculateConsumerDemand(baseDemand, 10, basePrice, 50, 50, elasticity);
  assert.ok(standardDemand > 0, 'Standard demand should be positive');

  const expensiveDemand = calculateConsumerDemand(baseDemand, 20, basePrice, 50, 50, elasticity);
  assert.ok(expensiveDemand < standardDemand, 'Higher price must reduce demand');

  const discountDemand = calculateConsumerDemand(baseDemand, 7, basePrice, 50, 50, elasticity);
  assert.ok(discountDemand > standardDemand, 'Discounted price must increase demand');

  const highQualityDemand = calculateConsumerDemand(baseDemand, 10, basePrice, 90, 50, elasticity);
  assert.ok(highQualityDemand > standardDemand, 'Higher quality must increase demand');

  assert.equal(calculateConsumerDemand(baseDemand, 0, basePrice, 50, 50, elasticity), 0);
});

test('2. simulateEconomicMonth advances tick, dates, macro cycle, and updates finances', () => {
  const initialState = generateDefaultState();
  assert.equal(initialState.currentTick, 0);
  assert.equal(initialState.dateString, 'Jan 2026');
  assert.ok(initialState.macro, 'Macro economy must be initialized');

  const nextState = simulateEconomicMonth(initialState);
  assert.equal(nextState.currentTick, 1);
  assert.equal(nextState.dateString, 'Feb 2026');

  const player = nextState.companies[nextState.playerCompanyId];
  assert.ok(player, 'Player company must exist');
  assert.ok(player.history.months.length >= 4, 'History months should be recorded');
  assert.ok(player.stockPrice > 0, 'Stock price must be positive');
  assert.ok(player.marketCap > 0, 'Market cap must be positive');
});

test('3. executeStockTrade handles share purchases, cash deductions, and ownership calculation', () => {
  const state = generateDefaultState();
  const player = state.companies['comp_player'];
  const initialCash = player.cash;

  const apex = state.companies['comp_apex'];
  const tradeResult = executeStockTrade(state, 'comp_player', 'comp_apex', 10000, true);
  assert.ok(tradeResult.success, 'Trade execution should succeed');
  assert.ok(tradeResult.updatedState, 'Updated state must be returned');

  const updatedPlayer = tradeResult.updatedState.companies['comp_player'];
  const expectedCost = 10000 * apex.stockPrice;
  assert.equal(updatedPlayer.cash, initialCash - expectedCost);
  assert.equal(updatedPlayer.shareholdings['comp_apex'], 10000);

  const ownership = getOwnershipPercentage(apex, 10000);
  assert.ok(ownership > 0 && ownership <= 100, 'Ownership % should be calculated properly');

  const sellResult = executeStockTrade(
    tradeResult.updatedState,
    'comp_player',
    'comp_apex',
    5000,
    false
  );
  assert.ok(sellResult.success, 'Selling trade should succeed');
  const soldPlayer = sellResult.updatedState!.companies['comp_player'];
  assert.equal(soldPlayer.shareholdings['comp_apex'], 5000);
  assert.equal(soldPlayer.cash, updatedPlayer.cash + 5000 * apex.stockPrice);
});

test('4. handleCorporateLoan enforces borrowing ceilings and cash requirements for repayments', () => {
  const state = generateDefaultState();
  const player = state.companies['comp_player'];
  const initialCash = player.cash;

  const borrowResult = handleCorporateLoan(state, 'comp_player', 500000, true);
  assert.ok(borrowResult.success, 'Borrowing within ceiling should succeed');
  const borrower = borrowResult.updatedState!.companies['comp_player'];
  assert.equal(borrower.cash, initialCash + 500000);
  assert.equal(borrower.debt, 500000);

  const repayResult = handleCorporateLoan(borrowResult.updatedState!, 'comp_player', 200000, false);
  assert.ok(repayResult.success, 'Repaying valid debt amount should succeed');
  const repayer = repayResult.updatedState!.companies['comp_player'];
  assert.equal(repayer.debt, 300000);

  const excessiveBorrow = handleCorporateLoan(state, 'comp_player', 500000000, true);
  assert.equal(excessiveBorrow.success, false, 'Excessive borrow must be rejected');
});

test('5. AI competitor decision engine analyzes strategic moves and executes turns', () => {
  const state = generateDefaultState();

  const apex = state.companies['comp_apex'];
  const aiTurn = processAICompanyTurn(state, apex);
  assert.ok(aiTurn.updatedCompany, 'Should return updated company');

  const afterAISim = simulateAICompetitors(state);
  assert.ok(afterAISim.companies['comp_apex'], 'APEX company should exist after turn');
  assert.ok(afterAISim.companies['comp_nova'], 'NOVA company should exist after turn');
  assert.ok(afterAISim.companies['comp_omni'], 'OMNI company should exist after turn');
});

test('6. Save/Load JSON serialization maintains state integrity', () => {
  const state = generateDefaultState();
  const jsonStr = exportStateAsJSON(state);
  assert.ok(jsonStr.length > 100, 'Serialized JSON string should not be empty');

  const restored = importStateFromJSON(jsonStr);
  assert.ok(restored, 'Restored state must not be null');
  assert.equal(restored?.currentTick, state.currentTick);
  assert.equal(restored?.playerCompanyId, state.playerCompanyId);
  assert.equal(Object.keys(restored?.companies || {}).length, MAX_ACTIVE_COMPANIES);
  assert.ok(restored?.macro, 'Restored state must retain macro economy');
});

test('7. AI anti-cheat checks: strict facility caps, cash reserve buffers, and cooldowns', () => {
  assert.equal(getMaxAllowedFacilities(0), 3, 'Month 0 should cap AI at 3 facilities');
  assert.equal(getMaxAllowedFacilities(12), 3, 'Year 1 should cap AI at 3 facilities');
  assert.equal(getMaxAllowedFacilities(23), 3, 'End of Year 2 should cap AI at 3 facilities');
  assert.equal(getMaxAllowedFacilities(24), 4, 'Year 3 should cap AI at 4 facilities');
  assert.equal(getMaxAllowedFacilities(59), 4, 'Year 5 should cap AI at 4 facilities');
  assert.equal(getMaxAllowedFacilities(60), 6, 'Year 6+ should cap AI at 6 facilities');

  const state = generateDefaultState();
  const apex = state.companies['comp_apex'];

  const inCooldown = { ...apex, lastConstructedTick: state.currentTick };
  const turnCooldown = processAICompanyTurn(state, inCooldown);
  assert.equal(turnCooldown.newFacility, undefined, 'AI in cooldown must not build new facility');

  const brokeAI = { ...apex, cash: 500000, lastConstructedTick: -20 };
  const turnBroke = processAICompanyTurn(state, brokeAI);
  assert.equal(
    turnBroke.newFacility,
    undefined,
    'AI without safety buffer cash must not build new facility'
  );
});

test('8. CapLab 13: 3x3 slot unit installation & macro cycle progression', () => {
  const state = generateDefaultState();
  const store = Object.values(state.facilities).find(
    f => f.companyId === state.playerCompanyId && f.type.startsWith('store_')
  )!;
  const initialCount = store.units.length;
  const updated = addUnitToFacilitySlot(store, 6, 'sales');
  assert.equal(updated.units.length, initialCount + 1, 'Slot 6 sales unit should be added');
  assert.ok(updated.units.some(u => u.slotIndex === 6 && u.type === 'sales'));

  // Installing on an already occupied slot should be a no-op
  const duplicate = addUnitToFacilitySlot(updated, 6, 'advertising');
  assert.equal(duplicate.units.length, updated.units.length, 'Occupied slot must not duplicate');

  // Macro cycle transition
  const macroBefore = { ...state.macro, cyclePhase: 'normal' as const, monthsInPhase: 16 };
  const macroAfter = advanceMacroEconomy(macroBefore, 17);
  assert.ok(
    ['boom', 'normal', 'recession', 'recovery'].includes(macroAfter.cyclePhase),
    'Macro cycle must transition validly'
  );
});

test('9. CapLab 13: Rights Issue & Full Subsidiary Merger (>= 50% ownership)', () => {
  const state = generateDefaultState();
  const player = state.companies[state.playerCompanyId];
  const initialCash = player.cash;
  const initialShares = player.sharesOutstanding;

  const issueRes = issueNewShares(state, player.id, 50000);
  assert.ok(issueRes.success && issueRes.updatedState, 'Rights issue must succeed');
  const issuedPlayer = issueRes.updatedState.companies[player.id];
  assert.equal(issuedPlayer.sharesOutstanding, initialShares + 50000);
  assert.ok(issuedPlayer.cash > initialCash, 'Rights issue must inject equity cash');

  // Give player >= 50% ownership of comp_omni + cash to test full merger
  const target = issueRes.updatedState.companies['comp_omni'];
  const majorityShares = Math.ceil(target.sharesOutstanding * 0.6);
  const preMergerState = {
    ...issueRes.updatedState,
    companies: {
      ...issueRes.updatedState.companies,
      [player.id]: {
        ...issuedPlayer,
        cash: 100_000_000,
        shareholdings: {
          ...issuedPlayer.shareholdings,
          comp_omni: majorityShares,
        },
      },
    },
  };

  const targetFacilitiesCount = Object.values(preMergerState.facilities).filter(
    f => f.companyId === 'comp_omni'
  ).length;

  const mergerRes = executeSubsidiaryMerger(preMergerState, player.id, 'comp_omni');
  assert.ok(mergerRes.success && mergerRes.updatedState, 'Merger at >= 50% must succeed');
  assert.equal(
    mergerRes.updatedState.companies['comp_omni'],
    undefined,
    'Merged rival must be absorbed'
  );
  const mergedPlayerFacs = Object.values(mergerRes.updatedState.facilities).filter(
    f => f.companyId === player.id
  ).length;
  assert.ok(
    mergedPlayerFacs >= targetFacilitiesCount,
    'Acquired facilities must transfer to acquirer'
  );
});

test('10. CapLab 13: C-Suite Executive payroll & COO maintenance reduction', () => {
  const state = generateDefaultState();
  const player = state.companies[state.playerCompanyId];
  const hiredExecs = player.executives.map(e => (e.role === 'COO' ? { ...e, hired: true } : e));

  const stateWithCOO = {
    ...state,
    companies: {
      ...state.companies,
      [player.id]: {
        ...player,
        executives: hiredExecs,
      },
    },
  };

  const afterMonth = simulateEconomicMonth(stateWithCOO);
  const updatedPlayer = afterMonth.companies[player.id];
  assert.ok(
    updatedPlayer.executives.some(e => e.role === 'COO' && e.hired),
    'Hired COO must persist through monthly simulation'
  );
});

test('11. Expanded 40x40 grid layout, legacy 14x14/24x24/32x32 save migration & prototype-pollution guard', () => {
  assert.equal(MAP_GRID_SIZE, 40);
  const state = generateDefaultState();
  assert.equal(state.mapParcels.length, 40 * 40, 'Default state must contain 1600 map parcels');

  // Simulate legacy 24x24 save with prototype-pollution key
  const legacyObj = JSON.parse(exportStateAsJSON(state));
  legacyObj.mapParcels = legacyObj.mapParcels.slice(0, 576);
  const injectedPayload = `{"__proto__": {"polluted": true}, ${JSON.stringify(legacyObj).slice(1)}`;

  const restored = importStateFromJSON(injectedPayload);
  assert.ok(restored, 'Legacy 24x24 payload must migrate cleanly');
  assert.equal(restored!.mapParcels.length, 1600, 'Migrated map must expand to 1600 tiles');
  assert.equal(({} as Record<string, unknown>).polluted, undefined, 'Object.prototype must not be polluted');
});

test('12. Exact Corporate P&L reconciliation & simulation determinism', () => {
  const state = generateDefaultState();
  const runA = simulateEconomicMonth(state);
  const runB = simulateEconomicMonth(state);

  const playerA = runA.companies[runA.playerCompanyId];
  const playerB = runB.companies[runB.playerCompanyId];
  assert.equal(playerA.stockPrice, playerB.stockPrice, 'Simulation must be deterministic');
  assert.equal(playerA.cash, playerB.cash, 'Cash flow must be deterministic');

  // Reconcile every company's lastMonthNetProfit against sum(facilities) - execPayroll - debtInterest
  Object.values(runA.companies).forEach(comp => {
    const compFacs = Object.values(runA.facilities).filter(f => f.companyId === comp.id);
    const sumFacProfit = compFacs.reduce((sum, f) => sum + f.monthlyProfit, 0);
    const execPayroll = comp.executives
      .filter(e => e.hired)
      .reduce((sum, e) => sum + e.monthlySalary, 0);
    const debtInterest =
      Math.round(comp.debt * (comp.monthlyInterestRate || 0.006)) +
      Math.round((comp.bondDebt || 0) * 0.0045);

    const expectedNet = Math.round(sumFacProfit - execPayroll - debtInterest);
    assert.equal(
      comp.lastMonthNetProfit,
      expectedNet,
      `Exact double-entry reconciliation mismatch for ${comp.ticker}`
    );
  });
});

test('13. Linked domestic B2B/internal supply chain prioritizes factory inventory before wholesale', () => {
  const state = generateDefaultState();
  const facId = 'fac_player_bread_factory';
  const breadFactory = {
    id: facId,
    companyId: 'comp_player',
    name: 'Pabrik Roti NUSA',
    type: 'factory_processing' as const,
    tileX: 6,
    tileY: 7,
    level: 1,
    createdMonth: 0,
    units: createDefaultUnitsForFacility('factory_processing', 'bread'),
    sellingPrice: 3,
    adBudget: 0,
    monthlyMaintenance: 30000,
    monthlyProduction: 0,
    monthlySales: 0,
    monthlyRevenue: 0,
    monthlyCostOfGoods: 0,
    monthlyProfit: 0,
    lastMonthUnitsSold: 0,
    inventoryLevel: 5000,
    inventoryCapacity: 12000,
    qualityRating: 60,
    brandRating: 50,
  };

  // Link player's starting convenience store purchasing unit to domestic bread factory
  const store = state.facilities['fac_player_store'];
  const linkedStore = {
    ...store,
    units: store.units.map(u =>
      u.type === 'purchasing' ? { ...u, supplierFacilityId: facId } : u
    ),
  };

  const linkedState = {
    ...state,
    facilities: {
      ...state.facilities,
      [facId]: breadFactory,
      [store.id]: linkedStore,
    },
  };

  const after = simulateEconomicMonth(linkedState);
  const updatedFactory = after.facilities[facId];
  const updatedStore = after.facilities[store.id];
  assert.ok(updatedFactory.lastMonthUnitsSold > 0, 'Domestic factory should record B2B/internal sales');
  assert.ok(updatedFactory.monthlyRevenue > 0, 'Domestic factory should book internal/B2B revenue');
  assert.equal(updatedStore.supplySourceLabel, 'Pabrik Internal');
});

test('14. Honest facility & 3x3 unit upgrade/installation cost calculators', () => {
  const storeUpgradeCost = getFacilityUpgradeCost('store_convenience', 1);
  assert.ok(storeUpgradeCost > 0, 'Facility upgrade cost must be positive');
  assert.ok(
    getFacilityUpgradeCost('store_convenience', 3) > storeUpgradeCost,
    'Higher level upgrades must cost more'
  );

  const rdInstallCost = getUnitInstallCost('rd');
  const salesInstallCost = getUnitInstallCost('sales');
  assert.ok(rdInstallCost > salesInstallCost, 'R&D lab installation should cost more than sales counter');

  assert.ok(
    getUnitUpgradeCost(3) > getUnitUpgradeCost(1),
    'Unit upgrade costs must scale with level'
  );
});

test('15. Initializes 10 active corporations, 8 civic housing properties, 12 resident houses, and 12 deposits without overlap', () => {
  const state = generateDefaultState();
  const companies = Object.values(state.companies);
  assert.equal(companies.length, 10, 'Must initialize 10 active Bursa companies');
  assert.equal(state.companies[GOVT_OWNER_ID], undefined, 'Government owner must NOT pollute Bursa companies');
  assert.equal(state.companies[RESIDENT_OWNER_ID], undefined, 'Resident owner must NOT pollute Bursa companies');
  assert.equal(companies.filter(c => c.isPlayer).length, 1, 'Exactly one company must belong to player');

  const facilities = Object.values(state.facilities);
  assert.equal(facilities.length, 31, 'Must initialize 11 corporate + 8 civic + 12 resident_house facilities');
  assert.equal(
    facilities.filter(f => f.companyId === GOVT_OWNER_ID && f.type === 'civic_housing').length,
    8,
    'Must seed 8 civic housing units managed by PEMKOT'
  );
  assert.equal(
    facilities.filter(f => f.companyId === RESIDENT_OWNER_ID && f.type === 'resident_house').length,
    12,
    'Must seed 12 starter citizen-owned resident houses'
  );

  const deposits = state.mapParcels.filter(p => Boolean(p.resourceDeposit));
  assert.equal(deposits.length, 12, 'Must seed 12 strategic natural resource deposits');
  assert.equal(deposits.filter(p => p.resourceDeposit?.discovered).length, 6, 'Must start with 6 discovered deposits');

  const occupiedCoords = new Set<string>();
  facilities.forEach(fac => {
    const key = `${fac.tileX},${fac.tileY}`;
    assert.ok(!occupiedCoords.has(key), `Facility coordinate overlap at ${key}`);
    occupiedCoords.add(key);
    const parcel = state.mapParcels.find(p => p.x === fac.tileX && p.y === fac.tileY);
    assert.ok(parcel && parcel.terrainType !== 'road', `Facility at ${key} must not sit on a road`);
    assert.equal(parcel.facilityId, fac.id, `Parcel ${key} must reference ${fac.id}`);
  });
});

test('16. Post-merger AI auto-entrant replenishment keeps active corporations at 10 with honest starter capital', () => {
  const state = generateDefaultState();
  const player = state.companies[state.playerCompanyId];
  const target = state.companies['comp_omni'];
  const majorityShares = Math.ceil(target.sharesOutstanding * 0.65);

  const preMergerState = {
    ...state,
    companies: {
      ...state.companies,
      [player.id]: {
        ...player,
        cash: 120_000_000,
        shareholdings: {
          ...player.shareholdings,
          comp_omni: majorityShares,
        },
      },
    },
  };

  const mergedRes = executeSubsidiaryMerger(preMergerState, player.id, 'comp_omni');
  assert.ok(mergedRes.success && mergedRes.updatedState, 'Merger must succeed');
  const postState = mergedRes.updatedState;
  assert.equal(postState.companies['comp_omni'], undefined, 'Merged company must be absorbed');
  assert.equal(
    Object.keys(postState.companies).length,
    MAX_ACTIVE_COMPANIES,
    'Replenishment must immediately bring active corporations back to 10'
  );

  const newEntrant = Object.values(postState.companies).find(c => !state.companies[c.id]);
  assert.ok(newEntrant, 'A brand new AI entrant must have been founded');
  assert.equal(newEntrant.isPlayer, false, 'New entrant must belong to AI');
  assert.ok(newEntrant.cash > 0 && Number.isFinite(newEntrant.cash), 'New entrant must have honest finite cash');
  assert.ok(
    Object.values(postState.facilities).some(f => f.companyId === newEntrant.id),
    'New entrant must possess a valid starter facility'
  );
});

test('17. Upgraded AI intelligence: replenishes legacy rosters and performs honest cash-deducted upgrades', () => {
  const state = generateDefaultState();
  const keys = Object.keys(state.companies);
  const prunedCompanies = { ...state.companies };
  delete prunedCompanies[keys[keys.length - 1]];
  delete prunedCompanies[keys[keys.length - 2]];

  const legacyLikeState = { ...state, companies: prunedCompanies };
  assert.equal(Object.keys(legacyLikeState.companies).length, 8);

  const replenished = replenishAICompetitors(legacyLikeState);
  assert.equal(
    Object.keys(replenished.companies).length,
    MAX_ACTIVE_COMPANIES,
    'replenishAICompetitors should restore roster up to 10 companies'
  );

  const wealthyAI = {
    ...replenished.companies['comp_apex'],
    cash: 25_000_000,
    lastConstructedTick: -20,
  };
  const turnRes = processAICompanyTurn(replenished, wealthyAI);
  assert.ok(turnRes.updatedCompany.cash <= wealthyAI.cash, 'AI decisions must never print unlimited money');
});

test('18. Spatial Crowd Traffic Index ripples outward from civic housing & apartments and updates dynamically', () => {
  const state = generateDefaultState();
  const adjacentCBD = state.mapParcels.find(p => p.x === 15 && p.y === 16); // next to Rusunawa Sentral (15,15)
  const isolatedSuburb = state.mapParcels.find(p => p.x === 1 && p.y === 24);
  assert.ok(adjacentCBD && isolatedSuburb, 'Both comparison tiles must exist');
  assert.ok(
    adjacentCBD.trafficIndex > isolatedSuburb.trafficIndex + 20,
    `CBD beside civic housing (${adjacentCBD.trafficIndex}) must have far higher traffic than isolated edge (${isolatedSuburb.trafficIndex})`
  );

  // Build private apartment complex at (2, 24) and confirm neighbor (1, 24) traffic rises cleanly
  const aptId = 'fac_test_apt';
  const nextFacs = {
    ...state.facilities,
    [aptId]: {
      id: aptId,
      companyId: 'comp_player',
      name: 'Apartemen Uji',
      type: 'apartment_complex' as const,
      tileX: 2,
      tileY: 24,
      level: 1,
      createdMonth: 0,
      units: createDefaultUnitsForFacility('apartment_complex'),
      sellingPrice: 920,
      adBudget: 0,
      monthlyMaintenance: 32000,
      monthlyProduction: 0,
      monthlySales: 0,
      monthlyRevenue: 0,
      monthlyCostOfGoods: 0,
      monthlyProfit: 0,
      lastMonthUnitsSold: 0,
      inventoryLevel: 0,
      inventoryCapacity: 0,
      qualityRating: 55,
      brandRating: 50,
    },
  };
  const updatedParcels = recalculateCityTraffic(state.mapParcels, nextFacs);
  const boostedSuburb = updatedParcels.find(p => p.x === 1 && p.y === 24)!;
  assert.ok(
    boostedSuburb.trafficIndex > isolatedSuburb.trafficIndex + 10,
    'Constructing an apartment complex must immediately raise neighbor trafficIndex'
  );
});

test('19. Higher Crowd Traffic Index gives retail stores stronger unit sales than identical stores on low-traffic tiles', () => {
  const baseState = generateDefaultState();
  assert.ok(getTrafficDemandMultiplier(95) > getTrafficDemandMultiplier(15));

  // Place two identical player/rival pharmacies selling medicine: one beside civic housing (14,15) and one in far suburb (2,24)
  const busyStoreId = 'fac_busy_pharm';
  const quietStoreId = 'fac_quiet_pharm';

  const makePharm = (id: string, companyId: string, x: number, y: number) => ({
    id,
    companyId,
    name: `Apotek ${id}`,
    type: 'store_pharmacy' as const,
    tileX: x,
    tileY: y,
    level: 3,
    createdMonth: 0,
    units: createDefaultUnitsForFacility('store_pharmacy', 'medicine'),
    sellingPrice: 36,
    adBudget: 0,
    monthlyMaintenance: 24000,
    monthlyProduction: 0,
    monthlySales: 0,
    monthlyRevenue: 0,
    monthlyCostOfGoods: 0,
    monthlyProfit: 0,
    lastMonthUnitsSold: 0,
    inventoryLevel: 25000,
    inventoryCapacity: 30000,
    qualityRating: 60,
    brandRating: 60,
  });

  const facsWithStores = {
    ...baseState.facilities,
    [busyStoreId]: makePharm(busyStoreId, 'comp_player', 14, 17),
    [quietStoreId]: makePharm(quietStoreId, 'comp_medx', 2, 24),
  };

  const trafficParcels = recalculateCityTraffic(baseState.mapParcels, facsWithStores);
  const afterMonth = simulateEconomicMonth({
    ...baseState,
    facilities: facsWithStores,
    mapParcels: trafficParcels,
  });

  const busyAfter = afterMonth.facilities[busyStoreId];
  const quietAfter = afterMonth.facilities[quietStoreId];
  assert.ok(
    busyAfter.lastMonthUnitsSold > quietAfter.lastMonthUnitsSold,
    `High-traffic store (${busyAfter.lastMonthUnitsSold}) must outsell identical low-traffic store (${quietAfter.lastMonthUnitsSold})`
  );
});

test('20. Private Real Estate (apartment & commercial tower) scales revenue with traffic while respecting exact P&L reconciliation', () => {
  const state = generateDefaultState();
  const after = simulateEconomicMonth(state);

  const landFirm = after.companies['comp_land'];
  assert.ok(landFirm && landFirm.personality === 'real_estate_mogul', 'Real estate mogul firm comp_land must exist');
  const aptFac = Object.values(after.facilities).find(
    f => f.companyId === 'comp_land' && f.type === 'apartment_complex'
  );
  assert.ok(aptFac && aptFac.monthlyRevenue > 0 && aptFac.lastMonthUnitsSold > 0, 'Apartment complex must generate active rent revenue');

  const compFacs = Object.values(after.facilities).filter(f => f.companyId === landFirm.id);
  const sumFacProfit = compFacs.reduce((s, f) => s + f.monthlyProfit, 0);
  const execPayroll = landFirm.executives.filter(e => e.hired).reduce((s, e) => s + e.monthlySalary, 0);
  const debtInterest =
    Math.round(landFirm.debt * (landFirm.monthlyInterestRate || 0.006)) +
    Math.round((landFirm.bondDebt || 0) * 0.0045);
  assert.equal(landFirm.lastMonthNetProfit, Math.round(sumFacProfit - execPayroll - debtInterest));
});

test('21. Procedural Asset Engine catalogs 68 unique original assets across all 28 products, companies, and facilities', async () => {
  const { ASSET_CATALOG, getAssetRegistryStats, getGeneratedProductAsset } = await import('./assetGeneratorEngine');
  const { PRODUCTS, FACILITY_SPECS, INITIAL_AI_ROSTER, NEW_ENTRANT_POOL } = await import('./productsData');

  const stats = getAssetRegistryStats();
  assert.ok(stats.total >= 68, `Expected at least 68 original assets, got ${stats.total}`);
  assert.equal(stats.total, 68, 'Expected 28 products + 21 company/civic logos + 19 facilities = 68');
  assert.equal(stats.products, 28, 'Expected 28 product renders');

  // Verify 100% coverage of all 28 products
  for (const prodId of Object.keys(PRODUCTS)) {
    assert.ok(ASSET_CATALOG[`product:${prodId}`], `Missing product asset spec for ${prodId}`);
  }

  // Verify 100% coverage of all 19 facilities
  for (const facType of Object.keys(FACILITY_SPECS)) {
    assert.ok(ASSET_CATALOG[`facility:${facType}`], `Missing facility asset spec for ${facType}`);
  }

  // Verify 100% coverage of player, govt, 9 initial AI, and 10 pool entrants
  assert.ok(ASSET_CATALOG['company:comp_player'], 'Missing player crest');
  assert.ok(ASSET_CATALOG[`company:${GOVT_OWNER_ID}`], 'Missing civic Pemkot crest');
  for (const tpl of [...INITIAL_AI_ROSTER, ...NEW_ENTRANT_POOL]) {
    assert.ok(ASSET_CATALOG[`company:${tpl.id}`], `Missing company logo spec for ${tpl.id}`);
  }

  // Verify headless Node SSR fallback never throws
  assert.equal(getGeneratedProductAsset('wheat'), null);
});

test('22. precisionMath handles negative zero, NaN sanitization, and signed money formatting', async () => {
  const { roundCurrency, finiteOr, formatMoney, formatSignedCurrency, safeDivide, round2 } = await import('./precisionMath');
  assert.ok(Object.is(roundCurrency(-0), 0), 'roundCurrency(-0) must produce +0');
  assert.ok(Object.is(roundCurrency(NaN), 0), 'roundCurrency(NaN) must produce 0');
  assert.equal(finiteOr(Infinity, 42), 42);
  assert.equal(safeDivide(100, 0, -1), -1);
  assert.equal(round2(1.005), 1.01);
  assert.equal(formatMoney(1_500_000), '$1.50M');
  assert.equal(formatMoney(-1_500_000), '-$1.50M');
  assert.equal(formatMoney(-2_300_000_000), '-$2.30B');
  assert.equal(formatMoney(-500), '-$500');
  assert.equal(formatSignedCurrency(-109410), '-$109,410');
  assert.equal(formatSignedCurrency(-0), '$0');
  assert.equal(formatSignedCurrency(-0.2), '$0');
  assert.equal(formatSignedCurrency(NaN), '$0');
});

test('23. spatialGrid getParcelAt O(1) lookup and recalculateCityTraffic structural sharing', async () => {
  const { getParcelAt } = await import('./spatialGrid');
  const state = generateDefaultState();

  const p0 = getParcelAt(state.mapParcels, 15, 16);
  assert.ok(p0 && p0.x === 15 && p0.y === 16, 'getParcelAt must retrieve exact parcel');
  assert.equal(getParcelAt(state.mapParcels, -1, 0), undefined);
  assert.equal(getParcelAt(state.mapParcels, 999, 0), undefined);

  // Calling recalculateCityTraffic again with identical state should preserve array & object identity
  const recomputed = recalculateCityTraffic(state.mapParcels, state.facilities);
  assert.equal(recomputed, state.mapParcels, 'Idempotent recalculation must return original parcel array ref');
});

test('24. Phantom dividend conservation: cash-strapped companies do not pay or credit phantom dividends', () => {
  const base = generateDefaultState();
  const apex = base.companies['comp_apex'];
  const player = base.companies['comp_player'];

  // Give player shares in comp_apex, set apex dividendPerShare = 2.0, but keep apex cash <= 500_000
  const lowCashState = {
    ...base,
    companies: {
      ...base.companies,
      comp_apex: {
        ...apex,
        cash: 200_000, // Below 500K safety threshold
        dividendPerShare: 2.0,
      },
      comp_player: {
        ...player,
        shareholdings: {
          ...player.shareholdings,
          comp_apex: 100_000,
        },
      },
    },
  };

  // Run one month with a solvent apex too and verify delta equals exact cash payout
  const afterLow = simulateEconomicMonth(lowCashState);
  const lowApexBefore = 200_000 + afterLow.companies['comp_apex'].lastMonthNetProfit;
  assert.equal(
    afterLow.companies['comp_apex'].cash,
    Math.round(lowApexBefore),
    'Low-cash issuer must not pay any dividends'
  );

  // Compare player cash when apex has zero dividend vs unaffordable dividend -> must be identical (no phantom payout)
  const zeroDivState = {
    ...lowCashState,
    companies: {
      ...lowCashState.companies,
      comp_apex: {
        ...lowCashState.companies['comp_apex'],
        dividendPerShare: 0,
      },
    },
  };
  const afterZero = simulateEconomicMonth(zeroDivState);
  assert.equal(
    afterLow.companies['comp_player'].cash,
    afterZero.companies['comp_player'].cash,
    'Cross-holder must receive zero phantom dividend when issuer cannot afford payout'
  );
});

test('25. Warehouse capacity cap prevents low-demand full stores from draining linked factory inventory', () => {
  const base = generateDefaultState();
  const facId = 'fac_test_supplier';
  const supplierFactory = {
    id: facId,
    companyId: 'comp_player',
    name: 'Pabrik Uji Kapasitas',
    type: 'factory_processing' as const,
    tileX: 6,
    tileY: 7,
    level: 1,
    createdMonth: 0,
    units: createDefaultUnitsForFacility('factory_processing', 'bread').filter(u => u.type !== 'manufacturing'),
    sellingPrice: 3,
    adBudget: 0,
    monthlyMaintenance: 0,
    monthlyProduction: 0,
    monthlySales: 0,
    monthlyRevenue: 0,
    monthlyCostOfGoods: 0,
    monthlyProfit: 0,
    lastMonthUnitsSold: 0,
    inventoryLevel: 50_000,
    inventoryCapacity: 60_000,
    qualityRating: 60,
    brandRating: 50,
  };

  const fullStoreLinked = {
    ...base.facilities['fac_player_store'],
    sellingPrice: 9999,
    inventoryLevel: 12000,
    inventoryCapacity: 12000,
    units: base.facilities['fac_player_store'].units.map(u =>
      u.type === 'purchasing' ? { ...u, supplierFacilityId: facId, capacity: 10000 } : u
    ),
  };

  const fullStoreSeaport = {
    ...fullStoreLinked,
    units: base.facilities['fac_player_store'].units.map(u =>
      u.type === 'purchasing' ? { ...u, supplierFacilityId: 'seaport', capacity: 10000 } : u
    ),
  };

  const afterLinked = simulateEconomicMonth({
    ...base,
    facilities: {
      ...base.facilities,
      [facId]: supplierFactory,
      [fullStoreLinked.id]: fullStoreLinked,
    },
  });

  const afterSeaport = simulateEconomicMonth({
    ...base,
    facilities: {
      ...base.facilities,
      [facId]: supplierFactory,
      [fullStoreSeaport.id]: fullStoreSeaport,
    },
  });

  assert.equal(
    afterLinked.facilities[facId].inventoryLevel,
    afterSeaport.facilities[facId].inventoryLevel,
    'Full store with ~0 sales must not drain linked factory beyond warehouse headroom'
  );
  assert.equal(
    afterLinked.facilities[facId].monthlyRevenue,
    afterSeaport.facilities[facId].monthlyRevenue
  );
});

test('26. Multi-tier factory-to-factory supply chain links processing/raw inputs to assembly factories cleanly', () => {
  const base = generateDefaultState();
  const rawFarmId = 'fac_player_wheat_farm';
  const bakeryId = 'fac_player_bakery_processing';

  const wheatFarm = {
    id: rawFarmId,
    companyId: 'comp_player',
    name: 'Perkebunan Gandum NUSA',
    type: 'farm_agriculture' as const,
    tileX: 5,
    tileY: 6,
    level: 2,
    createdMonth: 0,
    units: createDefaultUnitsForFacility('farm_agriculture', 'wheat'),
    sellingPrice: 3,
    adBudget: 0,
    monthlyMaintenance: 12000,
    monthlyProduction: 0,
    monthlySales: 0,
    monthlyRevenue: 0,
    monthlyCostOfGoods: 0,
    monthlyProfit: 0,
    lastMonthUnitsSold: 0,
    inventoryLevel: 6000,
    inventoryCapacity: 12000,
    qualityRating: 65,
    brandRating: 50,
  };

  // Bakery making bread (requires wheat input) linked to wheatFarm
  const bakeryUnits = [
    ...createDefaultUnitsForFacility('factory_processing', 'bread'),
    {
      id: 'unit_bakery_purchasing',
      type: 'purchasing' as const,
      name: 'Pengadaan Gandum',
      slotIndex: 5,
      level: 2,
      capacity: 15000,
      currentInventory: 0,
      maxInventory: 15000,
      monthlyCost: 4500,
      efficiency: 1.0,
      targetProductId: 'bread' as const,
      supplierFacilityId: rawFarmId,
    },
  ];

  const bakery = {
    id: bakeryId,
    companyId: 'comp_player',
    name: 'Pabrik Roti Multi-Tier',
    type: 'factory_processing' as const,
    tileX: 6,
    tileY: 6,
    level: 1,
    createdMonth: 0,
    units: bakeryUnits,
    sellingPrice: 4,
    adBudget: 0,
    monthlyMaintenance: 30000,
    monthlyProduction: 0,
    monthlySales: 0,
    monthlyRevenue: 0,
    monthlyCostOfGoods: 0,
    monthlyProfit: 0,
    lastMonthUnitsSold: 0,
    inventoryLevel: 200,
    inventoryCapacity: 12000,
    qualityRating: 60,
    brandRating: 50,
  };

  const after = simulateEconomicMonth({
    ...base,
    facilities: {
      ...base.facilities,
      [rawFarmId]: wheatFarm,
      [bakeryId]: bakery,
    },
  });

  const farmAfter = after.facilities[rawFarmId];
  const bakeryAfter = after.facilities[bakeryId];
  assert.ok(farmAfter.lastMonthUnitsSold > 0, 'Upstream wheat farm must record sales to linked bakery');
  assert.ok(farmAfter.monthlyRevenue > 0, 'Upstream farm must earn B2B/internal revenue');
  assert.ok(bakeryAfter.monthlyProduction > 0, 'Downstream bakery must produce bread using linked farm inputs');

  // Verify exact double-entry reconciliation still holds for comp_player
  const p = after.companies['comp_player'];
  const pFacs = Object.values(after.facilities).filter(f => f.companyId === p.id);
  const sumFacProfit = pFacs.reduce((s, f) => s + f.monthlyProfit, 0);
  const execPayroll = p.executives.filter(e => e.hired).reduce((s, e) => s + e.monthlySalary, 0);
  const debtInterest =
    Math.round(p.debt * (p.monthlyInterestRate || 0.006)) +
    Math.round((p.bondDebt || 0) * 0.0045);
  assert.equal(p.lastMonthNetProfit, Math.round(sumFacProfit - execPayroll - debtInterest));
});

test('27. 120-month heavy workload stability benchmark preserves finite integrity, bounded history, and speed', () => {
  let sim = generateDefaultState();
  const tStart = performance.now();

  for (let m = 0; m < 120; m++) {
    sim = simulateEconomicMonth(sim);
    sim = simulateAICompetitors(sim);
  }

  const elapsedMs = performance.now() - tStart;
  assert.equal(sim.currentTick, 120, 'Should reach month 120 cleanly');
  assert.ok(elapsedMs < 5000, `120-month full economy+AI sim took too long (${elapsedMs.toFixed(1)}ms)`);
  assert.ok(sim.newsFeed.length <= 25, 'News feed must remain bounded at <= 25');

  // Verify finite values, bounded history arrays, and exact P&L reconciliation across every active corporation
  for (const comp of Object.values(sim.companies)) {
    assert.ok(Number.isFinite(comp.cash), `${comp.ticker} cash must be finite`);
    assert.ok(Number.isFinite(comp.stockPrice) && comp.stockPrice > 0, `${comp.ticker} stockPrice must be positive finite`);
    assert.ok(Number.isFinite(comp.marketCap), `${comp.ticker} marketCap must be finite`);
    assert.ok(comp.history.months.length <= 12, `${comp.ticker} history must be bounded <= 12`);
    assert.ok(comp.sharePriceHistory.length <= 24, `${comp.ticker} sharePriceHistory must be bounded <= 24`);

    const compFacs = Object.values(sim.facilities).filter(f => f.companyId === comp.id);
    const sumFacProfit = compFacs.reduce((s, f) => s + f.monthlyProfit, 0);
    const execPayroll = comp.executives.filter(e => e.hired).reduce((s, e) => s + e.monthlySalary, 0);
    const debtInterest =
      Math.round(comp.debt * (comp.monthlyInterestRate || 0.006)) +
      Math.round((comp.bondDebt || 0) * 0.0045);
    assert.equal(
      comp.lastMonthNetProfit,
      Math.round(sumFacProfit - execPayroll - debtInterest),
      `120-month P&L reconciliation failed for ${comp.ticker}`
    );
  }

  // Verify every facility and parcel has finite values
  for (const fac of Object.values(sim.facilities)) {
    assert.ok(Number.isFinite(fac.monthlyRevenue) && Number.isFinite(fac.monthlyProfit) && Number.isFinite(fac.inventoryLevel));
  }
  for (const parcel of sim.mapParcels) {
    assert.ok(Number.isFinite(parcel.trafficIndex) && parcel.trafficIndex >= 0 && parcel.trafficIndex <= 100);
  }
});

test('28. AI buyback strictly clamps stockPrice to [1, 250] and rounds currency cash balances', () => {
  const state = generateDefaultState();
  const apex = state.companies['comp_apex'];
  const highPriceAI = {
    ...apex,
    cash: 25_000_000,
    stockPrice: 249.5,
    bookValue: 500_000_000,
    lastConstructedTick: state.currentTick,
  };
  const turn = processAICompanyTurn(state, highPriceAI);
  assert.ok(
    turn.updatedCompany.stockPrice >= 1 && turn.updatedCompany.stockPrice <= 250,
    `Expected buyback stockPrice clamped <= 250, got ${turn.updatedCompany.stockPrice}`
  );
  assert.equal(turn.updatedCompany.cash, Math.round(turn.updatedCompany.cash));
});

test('29. spatialGrid recalculateCityTraffic safely handles out-of-range coordinates without row aliasing', () => {
  const base = generateDefaultState();
  const oobParcel = {
    ...base.mapParcels[0],
    x: 40,
    y: 1,
    trafficIndex: 99,
  };
  const res = recalculateCityTraffic([oobParcel, ...base.mapParcels.slice(1)], base.facilities);
  assert.equal(res[0].trafficIndex, 15, 'Out-of-bounds x coordinate must not alias adjacent row');
});

test('30. Automated resident housing spawns organically without overwriting player-bought land', () => {
  const state = generateDefaultState();
  const initialResCount = Object.values(state.facilities).filter(
    f => f.companyId === RESIDENT_OWNER_ID
  ).length;

  // Player purchases an attractive vacant grass parcel near downtown
  const vacantParcel = state.mapParcels.find(
    p => p.terrainType === 'grass' && p.isZoneAllowed && !p.facilityId && !p.ownerCompanyId
  )!;
  const buyRes = buyVacantLandParcel(state, vacantParcel.x, vacantParcel.y);
  assert.ok(buyRes.success && buyRes.updatedState, 'Purchasing vacant land should succeed');

  let sim = buyRes.updatedState;
  for (let m = 0; m < 8; m++) {
    sim = simulateEconomicMonth(sim);
    sim = simulateAICompetitors(sim);
  }

  const afterResCount = Object.values(sim.facilities).filter(
    f => f.companyId === RESIDENT_OWNER_ID
  ).length;
  assert.ok(
    afterResCount > initialResCount,
    `Resident houses should grow organically (${initialResCount} -> ${afterResCount})`
  );

  // Player's purchased parcel must never be claimed by residents or AI
  const playerLotAfter = sim.mapParcels.find(p => p.x === vacantParcel.x && p.y === vacantParcel.y)!;
  assert.equal(playerLotAfter.ownerCompanyId, sim.playerCompanyId);
  assert.equal(playerLotAfter.facilityId, undefined, 'Residents & AI must never build over player-owned land');

  // Verify findAvailableParcel excludes player-owned land
  const candidate = findAvailableParcel(
    [playerLotAfter],
    'commercial'
  );
  assert.equal(candidate, null, 'AI parcel finder must skip player-owned land');

  // Selling idle land returns cash and releases ownership back to for_sale
  const sellRes = sellOwnedLandParcel(sim, vacantParcel.x, vacantParcel.y);
  assert.ok(sellRes.success && sellRes.updatedState);
  const releasedLot = sellRes.updatedState.mapParcels.find(
    p => p.x === vacantParcel.x && p.y === vacantParcel.y
  )!;
  assert.equal(releasedLot.ownerCompanyId, undefined);
  assert.equal(releasedLot.landStatus, 'for_sale');
});

test('31. claimResidentProperty pays buyout and transfers buildable parcel ownership to player', () => {
  const state = generateDefaultState();
  const resHouse = Object.values(state.facilities).find(f => f.type === 'resident_house')!;
  const initialCash = state.companies[state.playerCompanyId].cash;

  const claimRes = claimResidentProperty(state, resHouse.id);
  assert.ok(claimRes.success && claimRes.updatedState && claimRes.cost > 0);
  const next = claimRes.updatedState;
  assert.equal(next.facilities[resHouse.id], undefined, 'Resident house structure must be removed');
  assert.equal(next.companies[next.playerCompanyId].cash, initialCash - claimRes.cost);

  const claimedParcel = next.mapParcels.find(p => p.x === resHouse.tileX && p.y === resHouse.tileY)!;
  assert.equal(claimedParcel.ownerCompanyId, next.playerCompanyId);
  assert.equal(claimedParcel.landStatus, 'corporate');
  assert.equal(claimedParcel.facilityId, undefined);

  // Reject claim if cash insufficient
  const brokeState = {
    ...state,
    companies: {
      ...state.companies,
      [state.playerCompanyId]: { ...state.companies[state.playerCompanyId], cash: 100 },
    },
  };
  const rejected = claimResidentProperty(brokeState, resHouse.id);
  assert.equal(rejected.success, false, 'Insufficient cash claim must be rejected');
});

test('32. demolishResidentProperty clears house and returns parcel to municipal for_sale status', () => {
  const state = generateDefaultState();
  const resHouse = Object.values(state.facilities).find(f => f.type === 'resident_house')!;
  const initialCash = state.companies[state.playerCompanyId].cash;

  const demoRes = demolishResidentProperty(state, resHouse.id);
  assert.ok(demoRes.success && demoRes.updatedState && demoRes.cost > 0);
  const next = demoRes.updatedState;
  assert.equal(next.facilities[resHouse.id], undefined);
  assert.equal(next.companies[next.playerCompanyId].cash, initialCash - demoRes.cost);

  const clearedParcel = next.mapParcels.find(p => p.x === resHouse.tileX && p.y === resHouse.tileY)!;
  assert.equal(clearedParcel.ownerCompanyId, undefined);
  assert.equal(clearedParcel.facilityId, undefined);
  assert.equal(clearedParcel.landStatus, 'for_sale');
});

test('33. Resource deposits boost matching extraction production and unlock dynamically across ticks', () => {
  const base = generateDefaultState();
  const ironParcel = base.mapParcels.find(
    p => p.resourceDeposit?.discovered && p.resourceDeposit.type === 'iron_ore'
  )!;
  const plainParcel = base.mapParcels.find(
    p => p.terrainType === 'grass' && p.isZoneAllowed && !p.facilityId && !p.resourceDeposit
  )!;

  assert.ok(
    getDepositYieldBonus('mine_extraction', ironParcel.resourceDeposit) > 20,
    'Iron mine on iron deposit must get strong yield bonus'
  );
  assert.equal(
    getDepositYieldBonus('mine_extraction', undefined),
    0,
    'Mine on plain land must have zero deposit bonus'
  );

  const makeMine = (id: string, x: number, y: number) => ({
    id,
    companyId: 'comp_player',
    name: `Tambang ${id}`,
    type: 'mine_extraction' as const,
    tileX: x,
    tileY: y,
    level: 1,
    createdMonth: 0,
    units: createDefaultUnitsForFacility('mine_extraction', 'iron_ore'),
    sellingPrice: 90,
    adBudget: 0,
    monthlyMaintenance: 20000,
    monthlyProduction: 0,
    monthlySales: 0,
    monthlyRevenue: 0,
    monthlyCostOfGoods: 0,
    monthlyProfit: 0,
    lastMonthUnitsSold: 0,
    inventoryLevel: 0,
    inventoryCapacity: 15000,
    qualityRating: 55,
    brandRating: 50,
  });

  const richId = 'fac_rich_mine';
  const plainId = 'fac_plain_mine';
  const after = simulateEconomicMonth({
    ...base,
    facilities: {
      ...base.facilities,
      [richId]: makeMine(richId, ironParcel.x, ironParcel.y),
      [plainId]: makeMine(plainId, plainParcel.x, plainParcel.y),
    },
  });

  assert.ok(
    after.facilities[richId].monthlyProduction > after.facilities[plainId].monthlyProduction,
    'Mine sitting on discovered iron deposit must produce higher output'
  );

  // Advance to tick 5 to confirm dynamic deposit discovery triggers
  const tick4State = { ...base, currentTick: 5 };
  const afterDiscovery = simulateAutomatedHousingAndResources(tick4State);
  const discoveredCount = afterDiscovery.mapParcels.filter(p => p.resourceDeposit?.discovered).length;
  assert.equal(discoveredCount, 7, 'Month 5 survey should discover an additional resource deposit');
});

test('34. Macro CPI, Unemployment Rate, and Real Wage stay finite and cycle-responsive over 24 months', () => {
  let sim = generateDefaultState();
  const initialCpi = sim.macro.consumerPriceIndex!;
  for (let m = 0; m < 24; m++) {
    sim = simulateEconomicMonth(sim);
  }
  assert.ok(Number.isFinite(sim.macro.consumerPriceIndex!) && sim.macro.consumerPriceIndex! > initialCpi);
  assert.ok(
    Number.isFinite(sim.macro.unemploymentRate!) &&
      sim.macro.unemploymentRate! >= 2.0 &&
      sim.macro.unemploymentRate! <= 15.0
  );
  assert.ok(Number.isFinite(sim.macro.realWageRate!) && sim.macro.realWageRate! > 10);
});

test('35. 100 AI Entities Ecosystem initializes 9 CEOs + investors/officials and supports C-Suite recruitment', async () => {
  const { recruitInvestorAsExecutive, ensureAiEntitiesPopulated } = await import('./investorEngine');
  const { MAX_AI_ENTITIES } = await import('./productsData');

  const state = ensureAiEntitiesPopulated(generateDefaultState());
  assert.equal(MAX_AI_ENTITIES, 100);
  assert.equal(state.aiEntityOrder?.length, 100, 'Must populate exactly 100 AI entities');

  const entities = Object.values(state.aiEntities || {});
  assert.equal(entities.length, 100);
  const ceos = entities.filter(e => e.role === 'ceo');
  assert.equal(ceos.length, 9, 'Must begin with 9 AI Competitor CEOs');

  const investor = entities.find(e => e.role === 'investor')!;
  assert.ok(investor && investor.cash >= 1_400_000, 'Investors must start with valid autonomous cash');

  const recruitRes = recruitInvestorAsExecutive(state, investor.id, state.playerCompanyId, 'CFO');
  assert.ok(recruitRes.success && recruitRes.updatedState, 'Recruiting Investor as CFO should succeed');
  const nextEnt = recruitRes.updatedState.aiEntities![investor.id];
  assert.equal(nextEnt.role, 'c_suite');
  assert.equal(nextEnt.executiveRole, 'CFO');
  const playerExec = recruitRes.updatedState.companies[state.playerCompanyId].executives.find(e => e.role === 'CFO');
  assert.ok(playerExec && playerExec.hired && playerExec.name === investor.name);
});

test('36. AI Investors trade Bursa stocks autonomously and execute majority/activist CEO takeovers', async () => {
  const { simulateInvestorsAndCareersMonth } = await import('./investorEngine');
  const state = generateDefaultState();
  const target = state.companies['comp_apex'];
  const firstInvestor = Object.values(state.aiEntities!).find(e => e.role === 'investor')!;

  // Give this investor an activist stake near 50% threshold and enough cash to cross 50% on tick
  const preTakeoverShares = Math.ceil(target.sharesOutstanding * 0.495);
  const stagedState = {
    ...state,
    currentTick: 0,
    aiEntities: {
      ...state.aiEntities!,
      [firstInvestor.id]: {
        ...firstInvestor,
        cash: 15_000_000,
        ambition: 'activist_investor' as const,
        portfolio: {
          ...firstInvestor.portfolio,
          [target.id]: preTakeoverShares,
        },
      },
    },
    aiEntityOrder: [
      firstInvestor.id,
      ...state.aiEntityOrder!.filter(id => id !== firstInvestor.id),
    ],
  };

  const afterTick = simulateInvestorsAndCareersMonth(stagedState);
  const promoted = afterTick.aiEntities![firstInvestor.id];
  assert.ok((promoted.portfolio[target.id] || 0) >= preTakeoverShares, 'Investor should retain/add shares');
  if (promoted.portfolio[target.id] >= Math.ceil(target.sharesOutstanding * 0.5)) {
    assert.equal(promoted.role, 'ceo', 'Majority investor must take over CEO role');
    assert.equal(afterTick.companies[target.id].ceoName, promoted.name);
  }
});

test('37. Government Cabinet, 24-month Elections, Mayors & Policy Lobbying affect taxes and R&D subsidies', async () => {
  const { lobbyGovernmentPolicy, simulateGovernmentMonth } = await import('./governmentEngine');
  const state = generateDefaultState();

  assert.ok(state.government?.presidentName, 'President must be initialized');
  assert.ok(state.government?.ministerOfLaborName, 'Minister of Labor must be initialized');
  assert.ok(state.city.mayorName, 'Primary city Mayor must be initialized');

  const taxCutRes = lobbyGovernmentPolicy(state, 'tax_cut');
  assert.ok(taxCutRes.success && taxCutRes.updatedState);
  assert.ok(
    taxCutRes.updatedState.government!.corporateTaxRate < state.government!.corporateTaxRate,
    'Tax cut lobby must reduce corporateTaxRate'
  );

  const rdGrantRes = lobbyGovernmentPolicy(taxCutRes.updatedState, 'rd_grant');
  assert.ok(rdGrantRes.success && rdGrantRes.updatedState);
  assert.ok(
    rdGrantRes.updatedState.government!.rdSubsidyRate > state.government!.rdSubsidyRate,
    'R&D grant lobby must boost rdSubsidyRate'
  );

  // Trigger election at tick 24
  const preElection = {
    ...rdGrantRes.updatedState,
    currentTick: 24,
  };
  const postElection = simulateGovernmentMonth(preElection);
  assert.equal(postElection.government!.nextElectionTick, 48, 'Next election cycle must advance by 24 months');
  assert.ok(
    postElection.government!.policyLog.some(l => l.month === 24),
    'Election result must be recorded in policy gazette'
  );
});

test('38. Subsidiaries, Cap Table & 7-Seat Board, Primary IPO & Spin-Off IPO mechanics', async () => {
  const {
    launchCompanyIPO,
    spinOffSubsidiaryIPO,
    getCompanyCapTable,
    getSubsidiariesOf,
    updateSubsidiaryDirective,
    appointSubsidiaryCEO,
    transferCapitalToSubsidiary,
  } = await import('./subsidiaryEngine');

  const state = generateDefaultState();
  const player = state.companies[state.playerCompanyId];

  // Primary / Secondary IPO raises fresh cash
  const ipoRes = launchCompanyIPO(state, player.id, 0.2);
  assert.ok(ipoRes.success && ipoRes.updatedState);
  assert.ok(ipoRes.updatedState.companies[player.id].cash > player.cash, 'IPO must inject underwriting proceeds');

  // Spin-Off Player Store into a Listed Subsidiary
  const spinRes = spinOffSubsidiaryIPO(
    ipoRes.updatedState,
    player.id,
    'Nusantara Retail Tbk',
    'NRTL',
    ['fac_player_store'],
    1_200_000
  );
  assert.ok(spinRes.success && spinRes.updatedState, 'Spin-Off IPO must succeed');
  const next = spinRes.updatedState;
  const subs = getSubsidiariesOf(next, player.id);
  assert.equal(subs.length, 1, 'Player must control 1 newly spun-off subsidiary');
  assert.equal(subs[0].ownershipPct, 70, 'Parent retains 70% majority control on spin-off');

  const subId = subs[0].company.id;
  const capTable = getCompanyCapTable(next, subId);
  const totalSeats = capTable.reduce((s, r) => s + r.boardSeats, 0);
  assert.equal(totalSeats, 7, 'Board of Directors must allocate 7 total seats');

  // CEO Directive, Capital Injection & Subsidiary CEO Appointment
  const dirRes = updateSubsidiaryDirective(next, player.id, subId, {
    dividendPayoutRatio: 0.65,
    expansionMode: 'aggressive',
    priceStrategy: 'premium',
  });
  assert.ok(dirRes.success && dirRes.updatedState);
  assert.equal(dirRes.updatedState.companies[subId].subsidiaryDirective?.priceStrategy, 'premium');

  const capRes = transferCapitalToSubsidiary(dirRes.updatedState, player.id, subId, 500_000);
  assert.ok(capRes.success && capRes.updatedState);

  const freeInv = Object.values(capRes.updatedState.aiEntities!).find(e => e.role === 'investor')!;
  const ceoRes = appointSubsidiaryCEO(capRes.updatedState, player.id, subId, freeInv.id);
  assert.ok(ceoRes.success && ceoRes.updatedState);
  assert.equal(ceoRes.updatedState.companies[subId].ceoName, freeInv.name);
});

test('39. Multi-City Engine supports founding up to 10 Cities across 5 biomes with isolated parcel maps', async () => {
  const { createNewCity, switchActiveCity } = await import('./governmentEngine');
  const { MAX_CITIES } = await import('./productsData');
  assert.equal(MAX_CITIES, 10);

  let sim = generateDefaultState();
  // Give player generous capital to establish all 9 extra cities (reach 10/10)
  sim = {
    ...sim,
    companies: {
      ...sim.companies,
      [sim.playerCompanyId]: { ...sim.companies[sim.playerCompanyId], cash: 100_000_000 },
    },
  };

  const biomes = ['agri_valley', 'industrial_heartland', 'highland_mining', 'tech_corridor', 'coastal_metro'] as const;
  for (let i = 0; i < 9; i++) {
    const res = createNewCity(sim, `Kota Ekspansi ${i + 2}`, biomes[i % biomes.length]);
    assert.ok(res.success && res.updatedState, `Creating city #${i + 2} failed: ${res.message}`);
    sim = res.updatedState;
  }

  assert.equal(sim.cityOrder?.length, 10, 'Must reach maximum 10 cities');
  const overLimit = createNewCity(sim, 'Kota Ke-11', 'coastal_metro');
  assert.equal(overLimit.success, false, '11th city beyond MAX_CITIES=10 must be rejected');

  // Switch back to primary city and confirm parcel map swaps cleanly
  const firstId = sim.cityOrder![0];
  const swRes = switchActiveCity(sim, firstId);
  assert.ok(swRes.success && swRes.updatedState);
  assert.equal(swRes.updatedState.activeCityId, firstId);
  assert.equal(swRes.updatedState.mapParcels.length, 40 * 40);
});

test('40. All 28 Product Lines & extended supply recipes simulate cleanly', async () => {
  const { PRODUCTS } = await import('./productsData');
  const productIds = Object.keys(PRODUCTS);
  assert.equal(productIds.length, 28, 'Catalog must define 28 distinct products');

  for (const id of ['timber', 'coffee_bean', 'lumber', 'solar_panel', 'roasted_coffee', 'furniture', 'ev_suv', 'fintech_app']) {
    const recipe = PRODUCTS[id as keyof typeof PRODUCTS];
    assert.ok(recipe, `Missing expanded product ${id}`);
    assert.ok(recipe.basePrice > recipe.baseCost, `Positive margin expected for ${id}`);
  }
});


