import { SimulationState, StockTransaction, Company, Facility } from '../types/game';
import { replenishAICompetitors } from './aiCompetitor';
import { clamp, finiteOr, round2, roundCurrency, safeDivide } from './precisionMath';

/**
 * Calculates current ownership percentage of a target company by an investor
 */
export function getOwnershipPercentage(
  targetCompany: Company,
  sharesOwned: number
): number {
  if (!Number.isFinite(sharesOwned) || sharesOwned <= 0 || targetCompany.sharesOutstanding <= 0) {
    return 0;
  }
  return clamp(Math.round((sharesOwned / targetCompany.sharesOutstanding) * 1000) / 10, 0, 100);
}

/**
 * Executes a stock trade between a buyer company and target company
 */
export function executeStockTrade(
  state: SimulationState,
  buyerId: string,
  targetId: string,
  sharesCount: number,
  isBuy: boolean
): { success: boolean; message: string; updatedState?: SimulationState } {
  const buyer = state.companies[buyerId];
  const target = state.companies[targetId];

  if (!buyer || !target) {
    return { success: false, message: 'Perusahaan tidak ditemukan.' };
  }

  const cleanShares = Math.floor(finiteOr(sharesCount, 0));
  if (cleanShares <= 0) {
    return { success: false, message: 'Jumlah saham harus lebih dari 0.' };
  }

  const pricePerShare = Math.max(0.01, finiteOr(target.stockPrice, 1));
  const totalAmount = roundCurrency(cleanShares * pricePerShare);

  if (isBuy) {
    if (buyer.cash < totalAmount) {
      return {
        success: false,
        message: `Kas tidak mencukupi. Diperlukan $${totalAmount.toLocaleString()}, tersedia $${roundCurrency(buyer.cash).toLocaleString()}.`,
      };
    }

    const currentHolding = buyer.shareholdings[targetId] || 0;
    const maxAvailable =
      buyerId === targetId
        ? target.sharesOutstanding - target.treasuryShares
        : target.sharesOutstanding - currentHolding;

    if (cleanShares > maxAvailable) {
      return {
        success: false,
        message: `Maksimal saham tersedia untuk dibeli: ${Math.max(0, maxAvailable).toLocaleString()} lembar.`,
      };
    }

    const updatedBuyer: Company = {
      ...buyer,
      cash: roundCurrency(buyer.cash - totalAmount),
      shareholdings: {
        ...buyer.shareholdings,
        [targetId]: currentHolding + cleanShares,
      },
    };

    let updatedTarget: Company = { ...target };
    if (buyerId === targetId) {
      updatedBuyer.treasuryShares = buyer.treasuryShares + cleanShares;
      updatedBuyer.stockPrice = clamp(round2(buyer.stockPrice * 1.02), 1, 250);
      updatedTarget = updatedBuyer;
    }

    const transaction: StockTransaction = {
      id: `tx_buy_${state.currentTick}_${buyer.ticker}_${target.ticker}_${cleanShares}`,
      month: state.currentTick,
      buyerCompanyId: buyerId,
      targetCompanyId: targetId,
      action: 'buy',
      shares: cleanShares,
      pricePerShare,
      totalCost: totalAmount,
    };

    const newHoldings = updatedBuyer.shareholdings[targetId] || 0;
    const ownershipPct = getOwnershipPercentage(target, newHoldings);

    let takeoverAlert = '';
    if (buyerId !== targetId && ownershipPct >= 50) {
      takeoverAlert = ` KENDALI MAYORITAS TERCAPAI (${ownershipPct}%). Opsi Merger penuh kini terbuka.`;
    }

    return {
      success: true,
      message: `Membeli ${cleanShares.toLocaleString()} lbr saham ${target.ticker} senilai $${totalAmount.toLocaleString()} (${ownershipPct}%).${takeoverAlert}`,
      updatedState: {
        ...state,
        companies: {
          ...state.companies,
          [buyerId]: updatedBuyer,
          ...(buyerId !== targetId ? { [targetId]: updatedTarget } : {}),
        },
        stockTransactions: [transaction, ...state.stockTransactions.slice(0, 49)],
      },
    };
  } else {
    const currentHolding = buyer.shareholdings[targetId] || 0;
    if (currentHolding < cleanShares) {
      return {
        success: false,
        message: `Saham tidak mencukupi. Anda hanya memiliki ${currentHolding.toLocaleString()} lembar.`,
      };
    }

    const updatedBuyer: Company = {
      ...buyer,
      cash: roundCurrency(buyer.cash + totalAmount),
      shareholdings: {
        ...buyer.shareholdings,
        [targetId]: currentHolding - cleanShares,
      },
    };

    const transaction: StockTransaction = {
      id: `tx_sell_${state.currentTick}_${buyer.ticker}_${target.ticker}_${cleanShares}`,
      month: state.currentTick,
      buyerCompanyId: buyerId,
      targetCompanyId: targetId,
      action: 'sell',
      shares: cleanShares,
      pricePerShare,
      totalCost: totalAmount,
    };

    return {
      success: true,
      message: `Menjual ${cleanShares.toLocaleString()} lbr saham ${target.ticker} seharga $${totalAmount.toLocaleString()}.`,
      updatedState: {
        ...state,
        companies: {
          ...state.companies,
          [buyerId]: updatedBuyer,
        },
        stockTransactions: [transaction, ...state.stockTransactions.slice(0, 49)],
      },
    };
  }
}

/**
 * Secondary Stock Issuance (Rights Issue) to raise equity capital without bank debt
 */
export function issueNewShares(
  state: SimulationState,
  companyId: string,
  newSharesCount: number
): { success: boolean; message: string; updatedState?: SimulationState } {
  const company = state.companies[companyId];
  if (!company) return { success: false, message: 'Perusahaan tidak ditemukan.' };
  const cleanCount = Math.floor(finiteOr(newSharesCount, 0));
  if (cleanCount <= 0 || cleanCount > 500000) {
    return { success: false, message: 'Jumlah penerbitan saham harus antara 1 hingga 500.000 lembar.' };
  }

  // Secondary issue trades at a 6% market discount and dilutes share price slightly
  const issuePrice = Math.max(1, round2(company.stockPrice * 0.94));
  const capitalRaised = roundCurrency(cleanCount * issuePrice);
  const dilutionFactor = safeDivide(
    company.sharesOutstanding,
    company.sharesOutstanding + cleanCount,
    1
  );
  const newPrice = Math.max(1, round2(company.stockPrice * (0.5 + 0.5 * dilutionFactor)));

  const updatedComp: Company = {
    ...company,
    cash: roundCurrency(company.cash + capitalRaised),
    sharesOutstanding: company.sharesOutstanding + cleanCount,
    stockPrice: newPrice,
  };

  const tx: StockTransaction = {
    id: `tx_iss_${state.currentTick}_${company.ticker}_${cleanCount}`,
    month: state.currentTick,
    buyerCompanyId: companyId,
    targetCompanyId: companyId,
    action: 'issue',
    shares: cleanCount,
    pricePerShare: issuePrice,
    totalCost: capitalRaised,
  };

  return {
    success: true,
    message: `Menerbitkan ${cleanCount.toLocaleString()} lbr saham baru di harga $${issuePrice}. Dana masuk: +$${capitalRaised.toLocaleString()}.`,
    updatedState: {
      ...state,
      companies: {
        ...state.companies,
        [companyId]: updatedComp,
      },
      stockTransactions: [tx, ...state.stockTransactions.slice(0, 49)],
    },
  };
}

/**
 * Full Merger / Acquisition of a Majority-Controlled Rival (>= 50% ownership)
 */
export function executeSubsidiaryMerger(
  state: SimulationState,
  acquirerId: string,
  targetId: string
): { success: boolean; message: string; updatedState?: SimulationState } {
  if (acquirerId === targetId) return { success: false, message: 'Tidak bisa merger dengan perusahaan sendiri.' };
  const acquirer = state.companies[acquirerId];
  const target = state.companies[targetId];
  if (!acquirer || !target) return { success: false, message: 'Entitas perusahaan tidak valid.' };

  const ownedShares = acquirer.shareholdings[targetId] || 0;
  const pct = getOwnershipPercentage(target, ownedShares);
  if (pct < 50) {
    return {
      success: false,
      message: `Kepemilikan saat ini ${pct}%. Minimal 50% saham mayoritas diperlukan untuk Merger Penuh.`,
    };
  }

  // Buyout remaining public minority shares at 10% merger premium
  const remainingShares = Math.max(0, target.sharesOutstanding - ownedShares);
  const buyoutCost = roundCurrency(remainingShares * target.stockPrice * 1.1);

  if (acquirer.cash < buyoutCost) {
    return {
      success: false,
      message: `Biaya pembelian sisa saham minoritas $${buyoutCost.toLocaleString()} melebihi kas Anda.`,
    };
  }

  // Transfer all target facilities, patents, and remaining cash into acquirer
  const updatedFacilities: Record<string, Facility> = {};
  let transferredCount = 0;
  const facilityEntries = Object.entries(state.facilities);
  for (let i = 0; i < facilityEntries.length; i++) {
    const [fId, fac] = facilityEntries[i];
    if (fac.companyId === targetId) {
      transferredCount++;
      updatedFacilities[fId] = {
        ...fac,
        companyId: acquirerId,
        name: `${fac.name} (${acquirer.ticker})`,
      };
    } else {
      updatedFacilities[fId] = fac;
    }
  }

  // Merge R&D Tech Levels (take highest level per product)
  const mergedTech = { ...acquirer.techLevels };
  const techKeys = Object.keys(target.techLevels) as (keyof typeof mergedTech)[];
  for (let i = 0; i < techKeys.length; i++) {
    const pId = techKeys[i];
    mergedTech[pId] = Math.max(mergedTech[pId] || 30, target.techLevels[pId] || 30);
  }

  const updatedAcquirer: Company = {
    ...acquirer,
    cash: roundCurrency(acquirer.cash - buyoutCost + target.cash),
    debt: acquirer.debt + target.debt,
    bondDebt: (acquirer.bondDebt || 0) + (target.bondDebt || 0),
    techLevels: mergedTech,
    facilitiesCount: acquirer.facilitiesCount + transferredCount,
    shareholdings: {
      ...acquirer.shareholdings,
      [targetId]: 0,
    },
  };

  const remainingCompanies = { ...state.companies };
  delete remainingCompanies[targetId];
  remainingCompanies[acquirerId] = updatedAcquirer;

  const updatedParcels = state.mapParcels.map(p =>
    p.ownerCompanyId === targetId ? { ...p, ownerCompanyId: acquirerId } : p
  );

  const mergedState: SimulationState = {
    ...state,
    companies: remainingCompanies,
    facilities: updatedFacilities,
    mapParcels: updatedParcels,
    newsFeed: [
      {
        id: `news_merger_${state.currentTick}_${acquirer.ticker}_${target.ticker}`,
        month: state.currentTick,
        category: 'finance' as const,
        title: `Akuisisi Korporat: ${acquirer.ticker} Menyerap ${target.ticker}`,
        detail: `${acquirer.name} menuntaskan akuisisi 100% atas ${target.name} dan mengambil alih ${transferredCount} fasilitas operasional serta seluruh hak paten R&D.`,
      },
      ...state.newsFeed,
    ].slice(0, 25),
  };

  const replenishedState = replenishAICompetitors(mergedState, new Set([targetId]));

  return {
    success: true,
    message: `Merger Berhasil! ${target.name} resmi dilebur ke ${acquirer.name} (+${transferredCount} fasilitas & paten R&D).`,
    updatedState: replenishedState,
  };
}

/**
 * Borrows funds from corporate bank or repays corporate debt
 */
export function handleCorporateLoan(
  state: SimulationState,
  companyId: string,
  amount: number,
  isBorrow: boolean
): { success: boolean; message: string; updatedState?: SimulationState } {
  const company = state.companies[companyId];
  if (!company) return { success: false, message: 'Perusahaan tidak ditemukan.' };
  const cleanAmount = roundCurrency(finiteOr(amount, 0));
  if (cleanAmount <= 0) return { success: false, message: 'Nominal harus lebih dari 0.' };

  if (isBorrow) {
    const maxDebtAllowed = roundCurrency(company.bookValue * 0.65);
    const currentTotalDebt = company.debt + (company.bondDebt || 0);
    if (currentTotalDebt + cleanAmount > maxDebtAllowed) {
      return {
        success: false,
        message: `Batas plafon kredit terlampaui. Maksimal fasilitas kredit baru: $${Math.max(0, maxDebtAllowed - currentTotalDebt).toLocaleString()}.`,
      };
    }

    const updatedComp: Company = {
      ...company,
      cash: roundCurrency(company.cash + cleanAmount),
      debt: company.debt + cleanAmount,
    };

    return {
      success: true,
      message: `Pinjaman $${cleanAmount.toLocaleString()} dicairkan. Bunga aktif: ${(company.monthlyInterestRate * 100).toFixed(2)}%/bln.`,
      updatedState: {
        ...state,
        companies: {
          ...state.companies,
          [companyId]: updatedComp,
        },
      },
    };
  } else {
    if (cleanAmount > company.debt) {
      return {
        success: false,
        message: `Nominal pelunasan melebihi sisa hutang ($${company.debt.toLocaleString()}).`,
      };
    }
    if (cleanAmount > company.cash) {
      return {
        success: false,
        message: 'Kas perusahaan tidak mencukupi untuk melunasi hutang.',
      };
    }

    const updatedComp: Company = {
      ...company,
      cash: roundCurrency(company.cash - cleanAmount),
      debt: company.debt - cleanAmount,
    };

    return {
      success: true,
      message: `Berhasil melunasi $${cleanAmount.toLocaleString()}. Sisa hutang bank: $${updatedComp.debt.toLocaleString()}.`,
      updatedState: {
        ...state,
        companies: {
          ...state.companies,
          [companyId]: updatedComp,
        },
      },
    };
  }
}
