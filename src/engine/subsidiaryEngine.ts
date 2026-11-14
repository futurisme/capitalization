import {
  Company,
  Facility,
  SimulationState,
  StockTransaction,
  SubsidiaryDirective,
} from '../types/game';
import { clamp, round2, roundCurrency } from './precisionMath';
import { getOwnershipPercentage } from './stockMarket';
import { ensureAiEntitiesPopulated } from './investorEngine';
import { PRIMARY_CITY_ID } from './governmentEngine';

export interface ShareholderSeatRow {
  holderId: string;
  name: string;
  tickerOrRole: string;
  shares: number;
  pct: number;
  isControlling: boolean;
  boardSeats: number;
}

export const DEFAULT_SUBSIDIARY_DIRECTIVE: SubsidiaryDirective = {
  dividendPayoutRatio: 0.45,
  rdFocusRatio: 0.12,
  expansionMode: 'balanced',
  priceStrategy: 'market',
  allowSupplySync: true,
};

/**
 * Computes the complete Cap Table & 7-Seat Board of Directors breakdown for any corporation
 * across both peer corporations and the 100-entity AI Investor pool.
 */
export function getCompanyCapTable(
  state: SimulationState,
  targetCompanyId: string
): ShareholderSeatRow[] {
  const target = state.companies[targetCompanyId];
  if (!target) return [];

  const rows: ShareholderSeatRow[] = [];
  let accountedShares = 0;

  // 1. Corporate shareholders (including parent holdings & own treasury/insider blocks)
  for (const comp of Object.values(state.companies)) {
    const shares = comp.shareholdings[targetCompanyId] || 0;
    if (shares <= 0) continue;
    accountedShares += shares;
    const pct = getOwnershipPercentage(target, shares);
    rows.push({
      holderId: comp.id,
      name: comp.name,
      tickerOrRole: comp.id === targetCompanyId ? 'Founder / Treasury' : comp.ticker,
      shares,
      pct,
      isControlling: pct >= 50,
      boardSeats: Math.max(0, Math.round((pct / 100) * 7)),
    });
  }

  // 2. Individual AI Investors from the 100-entity pool
  if (state.aiEntities) {
    for (const ent of Object.values(state.aiEntities)) {
      const shares = ent.portfolio[targetCompanyId] || 0;
      if (shares <= 0) continue;
      accountedShares += shares;
      const pct = getOwnershipPercentage(target, shares);
      rows.push({
        holderId: ent.id,
        name: ent.name,
        tickerOrRole: ent.role.toUpperCase(),
        shares,
        pct,
        isControlling: pct >= 50,
        boardSeats: Math.round((pct / 100) * 7),
      });
    }
  }

  // 3. Retail Public Float remainder
  const publicFloat = Math.max(0, target.sharesOutstanding - accountedShares);
  if (publicFloat > 0) {
    const pct = getOwnershipPercentage(target, publicFloat);
    rows.push({
      holderId: 'public_float',
      name: 'Publik & Ritel Bursa',
      tickerOrRole: 'PUBLIC FLOAT',
      shares: publicFloat,
      pct,
      isControlling: false,
      boardSeats: Math.max(0, 7 - rows.reduce((s, r) => s + r.boardSeats, 0)),
    });
  }

  return rows.sort((a, b) => b.shares - a.shares);
}

/**
 * Returns all active companies controlled >= 50% (or explicitly flagged parentCompanyId) by ownerId.
 */
export function getSubsidiariesOf(
  state: SimulationState,
  ownerId: string
): { company: Company; ownershipPct: number }[] {
  const owner = state.companies[ownerId];
  if (!owner) return [];

  const result: { company: Company; ownershipPct: number }[] = [];
  for (const comp of Object.values(state.companies)) {
    if (comp.id === ownerId) continue;
    const owned = owner.shareholdings[comp.id] || 0;
    const pct = getOwnershipPercentage(comp, owned);
    if (pct >= 50 || comp.parentCompanyId === ownerId) {
      result.push({ company: comp, ownershipPct: pct });
    }
  }
  return result.sort((a, b) => b.ownershipPct - a.ownershipPct);
}

/**
 * Updates CEO-level operating directive for a controlled subsidiary.
 */
export function updateSubsidiaryDirective(
  state: SimulationState,
  ownerId: string,
  subId: string,
  directive: Partial<SubsidiaryDirective>
): { success: boolean; message: string; updatedState?: SimulationState } {
  const owner = state.companies[ownerId];
  const sub = state.companies[subId];
  if (!owner || !sub) return { success: false, message: 'Anak perusahaan tidak ditemukan.' };

  const pct = getOwnershipPercentage(sub, owner.shareholdings[subId] || 0);
  if (pct < 50 && sub.parentCompanyId !== ownerId) {
    return {
      success: false,
      message: `Diperlukan kepemilikan mayoritas (>=50%) untuk mengatur anak usaha (saat ini ${pct}%).`,
    };
  }

  const nextDirective: SubsidiaryDirective = {
    ...(sub.subsidiaryDirective || DEFAULT_SUBSIDIARY_DIRECTIVE),
    ...directive,
  };
  nextDirective.dividendPayoutRatio = clamp(nextDirective.dividendPayoutRatio, 0, 0.9);
  nextDirective.rdFocusRatio = clamp(nextDirective.rdFocusRatio, 0, 0.35);

  const eps = Math.max(0, sub.lastMonthNetProfit) / Math.max(1, sub.sharesOutstanding);
  const nextDivPerShare = clamp(
    round2(eps * nextDirective.dividendPayoutRatio),
    0,
    5
  );

  return {
    success: true,
    message: `Direktif CEO untuk ${sub.ticker} diperbarui (Dividen ${(nextDirective.dividendPayoutRatio * 100).toFixed(0)}%, Ekspansi ${nextDirective.expansionMode}).`,
    updatedState: {
      ...state,
      companies: {
        ...state.companies,
        [subId]: {
          ...sub,
          parentCompanyId: sub.parentCompanyId || ownerId,
          dividendPerShare: nextDivPerShare > 0 ? nextDivPerShare : sub.dividendPerShare,
          subsidiaryDirective: nextDirective,
        },
      },
    },
  };
}

/**
 * Appoints an AI Investor from the 100-entity pool as CEO of a controlled subsidiary.
 */
export function appointSubsidiaryCEO(
  state: SimulationState,
  ownerId: string,
  subId: string,
  entityId: string
): { success: boolean; message: string; updatedState?: SimulationState } {
  const ensured = ensureAiEntitiesPopulated(state);
  const owner = ensured.companies[ownerId];
  const sub = ensured.companies[subId];
  const entity = ensured.aiEntities?.[entityId];

  if (!owner || !sub || !entity) {
    return { success: false, message: 'Perusahaan atau kandidat CEO tidak valid.' };
  }
  const pct = getOwnershipPercentage(sub, owner.shareholdings[subId] || 0);
  if (pct < 50 && sub.parentCompanyId !== ownerId) {
    return { success: false, message: 'Anda harus memiliki kendali mayoritas (>=50%) atas anak perusahaan ini.' };
  }

  const aiEntities = { ...ensured.aiEntities! };
  if (sub.ceoEntityId && aiEntities[sub.ceoEntityId]) {
    aiEntities[sub.ceoEntityId] = {
      ...aiEntities[sub.ceoEntityId],
      role: 'investor',
      companyId: undefined,
    };
  }
  aiEntities[entity.id] = {
    ...entity,
    role: 'ceo',
    companyId: sub.id,
    lastActionMonth: ensured.currentTick,
    careerHistory: [
      `Ditunjuk sebagai CEO anak usaha ${sub.name} (${sub.ticker}) oleh ${owner.ticker}.`,
      ...entity.careerHistory,
    ].slice(0, 8),
  };

  return {
    success: true,
    message: `${entity.name} resmi ditunjuk sebagai CEO ${sub.name} (${sub.ticker}).`,
    updatedState: {
      ...ensured,
      aiEntities,
      companies: {
        ...ensured.companies,
        [sub.id]: {
          ...sub,
          parentCompanyId: ownerId,
          ceoName: entity.name,
          ceoEntityId: entity.id,
        },
      },
    },
  };
}

/**
 * Transfers capital injection from parent company to subsidiary (or dividend/recall up to parent).
 */
export function transferCapitalToSubsidiary(
  state: SimulationState,
  parentId: string,
  subId: string,
  amount: number
): { success: boolean; message: string; updatedState?: SimulationState } {
  const parent = state.companies[parentId];
  const sub = state.companies[subId];
  const cleanAmt = roundCurrency(amount);
  if (!parent || !sub || cleanAmt <= 0) {
    return { success: false, message: 'Nominal transfer modal tidak valid.' };
  }
  const pct = getOwnershipPercentage(sub, parent.shareholdings[subId] || 0);
  if (pct < 50 && sub.parentCompanyId !== parentId) {
    return { success: false, message: 'Hanya anak usaha mayoritas yang dapat menerima injeksi modal induk.' };
  }
  if (parent.cash < cleanAmt) {
    return { success: false, message: 'Kas induk tidak mencukupi untuk injeksi modal.' };
  }

  return {
    success: true,
    message: `Injeksi modal $${cleanAmt.toLocaleString()} ke ${sub.ticker} berhasil.`,
    updatedState: {
      ...state,
      companies: {
        ...state.companies,
        [parentId]: { ...parent, cash: roundCurrency(parent.cash - cleanAmt) },
        [subId]: { ...sub, cash: roundCurrency(sub.cash + cleanAmt) },
      },
    },
  };
}

/**
 * Launches a public IPO (or secondary IPO offering) for a corporation, selling primary shares to Bursa investors
 * while preserving controlling founder/parent stake unless heavily diluted.
 */
export function launchCompanyIPO(
  state: SimulationState,
  companyId: string,
  publicFloatPct = 0.2
): { success: boolean; message: string; updatedState?: SimulationState } {
  const company = state.companies[companyId];
  if (!company) return { success: false, message: 'Perusahaan tidak ditemukan.' };

  const cleanPct = clamp(publicFloatPct, 0.1, 0.4);
  const newShares = Math.max(50000, Math.round(company.sharesOutstanding * cleanPct));
  const ipoPrice = clamp(
    round2(Math.max(company.stockPrice, (company.bookValue / company.sharesOutstanding) * 1.15)),
    4,
    240
  );
  const ipoProceeds = roundCurrency(newShares * ipoPrice * 0.96); // 4% underwriting fee

  const tx: StockTransaction = {
    id: `tx_ipo_${state.currentTick}_${company.ticker}`,
    month: state.currentTick,
    buyerCompanyId: companyId,
    targetCompanyId: companyId,
    action: 'ipo',
    shares: newShares,
    pricePerShare: ipoPrice,
    totalCost: ipoProceeds,
  };

  const updatedComp: Company = {
    ...company,
    isPublic: true,
    ipoMonth: state.currentTick,
    cash: roundCurrency(company.cash + ipoProceeds),
    sharesOutstanding: company.sharesOutstanding + newShares,
    stockPrice: ipoPrice,
    marketCap: roundCurrency(ipoPrice * (company.sharesOutstanding + newShares)),
  };

  return {
    success: true,
    message: `IPO ${company.ticker} Sukses! Melepas ${newShares.toLocaleString()} lbr @ $${ipoPrice}, dana segar +$${ipoProceeds.toLocaleString()}.`,
    updatedState: {
      ...state,
      companies: {
        ...state.companies,
        [companyId]: updatedComp,
      },
      stockTransactions: [tx, ...state.stockTransactions.slice(0, 49)],
      newsFeed: [
        {
          id: `news_ipo_${state.currentTick}_${company.ticker}`,
          month: state.currentTick,
          category: 'finance' as const,
          title: `Penawaran Perdana IPO: ${company.name} (${company.ticker})`,
          detail: `${company.ticker} resmi melepas ${newShares.toLocaleString()} saham IPO pada harga $${ipoPrice} dan menghimpun modal $${ipoProceeds.toLocaleString()}.`,
        },
        ...state.newsFeed,
      ].slice(0, 25),
    },
  };
}

/**
 * Spins off selected player/parent facilities into an independent listed Subsidiary Corporation via Spin-Off IPO!
 * Parent retains 70% controlling equity while 30% floats publicly to raise capital immediately.
 */
export function spinOffSubsidiaryIPO(
  state: SimulationState,
  parentId: string,
  subName: string,
  subTicker: string,
  facilityIds: string[],
  seedCapital = 1500000
): { success: boolean; message: string; updatedState?: SimulationState } {
  const ensured = ensureAiEntitiesPopulated(state);
  const parent = ensured.companies[parentId];
  if (!parent) return { success: false, message: 'Induk usaha tidak ditemukan.' };

  const cleanTicker = subTicker.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'SUB1';
  if (Object.values(ensured.companies).some(c => c.ticker === cleanTicker)) {
    return { success: false, message: `Ticker ${cleanTicker} sudah digunakan emiten lain di bursa.` };
  }

  const cleanSeed = roundCurrency(seedCapital);
  if (parent.cash < cleanSeed) {
    return { success: false, message: 'Kas induk tidak mencukupi untuk modal awal anak perusahaan.' };
  }

  const validFacs = facilityIds
    .map(id => ensured.facilities[id])
    .filter(f => f && f.companyId === parentId && f.type !== 'corporate_hq');

  if (validFacs.length === 0) {
    return { success: false, message: 'Pilih minimal 1 fasilitas operasional untuk dipisahkan menjadi Anak Usaha.' };
  }

  const subId = `comp_sub_${cleanTicker.toLowerCase()}_${ensured.currentTick}`;
  const sharesOutstanding = 800000;
  const parentShares = roundCurrency(sharesOutstanding * 0.7);
  const publicFloatShares = sharesOutstanding - parentShares;

  const estRevenue = validFacs.reduce((s, f) => s + Math.max(80000, f.monthlyRevenue), 0);
  const estProfit = validFacs.reduce((s, f) => s + f.monthlyProfit, 0);
  const valuation = Math.max(4_000_000, cleanSeed + validFacs.length * 1_600_000 + Math.max(0, estProfit) * 18);
  const ipoPrice = clamp(round2(valuation / sharesOutstanding), 4.5, 120);
  const publicIpoCash = roundCurrency(publicFloatShares * ipoPrice * 0.94);

  // Appoint top available investor as initial subsidiary CEO
  const candidateCeo = (ensured.aiEntityOrder || [])
    .map(id => ensured.aiEntities![id])
    .find(e => e && e.role === 'investor');

  const subCompany: Company = {
    id: subId,
    name: subName.trim() || `${parent.ticker} ${cleanTicker} Tbk`,
    ticker: cleanTicker,
    color: '#0891b2',
    accentColor: '#38bdf8',
    isPlayer: false,
    ceoName: candidateCeo ? candidateCeo.name : `${parent.ceoName} (PLT)`,
    ceoEntityId: candidateCeo?.id,
    ceoAvatar: parentId,
    ceoIcon: parentId,
    parentCompanyId: parentId,
    isPublic: true,
    ipoMonth: ensured.currentTick,
    subsidiaryDirective: { ...DEFAULT_SUBSIDIARY_DIRECTIVE },
    personality: 'quality_first',
    sectorFocus: `Anak Usaha ${parent.ticker}`,
    brandStrategy: 'corporate',
    corporateBrandRating: Math.max(48, parent.corporateBrandRating - 4),
    executives: parent.executives.map(e => ({ ...e, hired: false })),
    cash: roundCurrency(cleanSeed + publicIpoCash),
    debt: 0,
    bondDebt: 0,
    monthlyInterestRate: parent.monthlyInterestRate,
    sharesOutstanding,
    treasuryShares: 0,
    stockPrice: ipoPrice,
    sharePriceHistory: [round2(ipoPrice * 0.95), ipoPrice],
    dividendPerShare: 0.04,
    shareholdings: {
      [subId]: Math.round(sharesOutstanding * 0.05),
    },
    techLevels: { ...parent.techLevels },
    activeResearchProduct: parent.activeResearchProduct,
    history: {
      months: [ensured.dateString],
      revenue: [estRevenue],
      netProfit: [estProfit],
      cash: [roundCurrency(cleanSeed + publicIpoCash)],
      marketCap: [roundCurrency(ipoPrice * sharesOutstanding)],
    },
    facilitiesCount: validFacs.length,
    totalAssets: roundCurrency(cleanSeed + publicIpoCash + validFacs.length * 1600000),
    bookValue: roundCurrency(cleanSeed + publicIpoCash + validFacs.length * 1600000),
    marketCap: roundCurrency(ipoPrice * sharesOutstanding),
    lastMonthRevenue: estRevenue,
    lastMonthNetProfit: estProfit,
    peRatio: estProfit > 0 ? Math.round((valuation / (estProfit * 12)) * 10) / 10 : 16,
    marketSharePercentage: 2,
  };

  const nextFacilities: Record<string, Facility> = { ...ensured.facilities };
  const transferredCoordCity = new Map<string, string>();
  for (const fac of validFacs) {
    nextFacilities[fac.id] = {
      ...fac,
      companyId: subId,
      name: `${fac.name} (${cleanTicker})`,
    };
    transferredCoordCity.set(`${fac.cityId || PRIMARY_CITY_ID}_${fac.tileX}_${fac.tileY}`, subId);
  }

  const nextParcels = ensured.mapParcels.map(p => {
    const newOwner = transferredCoordCity.get(`${ensured.activeCityId || PRIMARY_CITY_ID}_${p.x}_${p.y}`);
    return newOwner ? { ...p, ownerCompanyId: newOwner } : p;
  });

  const aiEntities = { ...ensured.aiEntities! };
  if (candidateCeo) {
    aiEntities[candidateCeo.id] = {
      ...candidateCeo,
      role: 'ceo',
      companyId: subId,
      lastActionMonth: ensured.currentTick,
      careerHistory: [
        `Diangkat menjadi CEO perdana ${subCompany.name} (${cleanTicker}) saat Spin-Off IPO.`,
        ...candidateCeo.careerHistory,
      ].slice(0, 8),
    };
  }

  const updatedParent: Company = {
    ...parent,
    cash: roundCurrency(parent.cash - cleanSeed),
    facilitiesCount: Math.max(0, parent.facilitiesCount - validFacs.length),
    shareholdings: {
      ...parent.shareholdings,
      [subId]: parentShares,
    },
  };

  const tx: StockTransaction = {
    id: `tx_spinoff_${ensured.currentTick}_${cleanTicker}`,
    month: ensured.currentTick,
    buyerCompanyId: parentId,
    targetCompanyId: subId,
    action: 'spinoff',
    shares: publicFloatShares,
    pricePerShare: ipoPrice,
    totalCost: publicIpoCash,
  };

  return {
    success: true,
    message: `Spin-Off IPO ${cleanTicker} berhasil! ${parent.ticker} memegang 70% kendali & kas anak usaha $${subCompany.cash.toLocaleString()}.`,
    updatedState: {
      ...ensured,
      aiEntities,
      companies: {
        ...ensured.companies,
        [parentId]: updatedParent,
        [subId]: subCompany,
      },
      facilities: nextFacilities,
      mapParcels: nextParcels,
      stockTransactions: [tx, ...ensured.stockTransactions.slice(0, 49)],
      newsFeed: [
        {
          id: `news_spinoff_${ensured.currentTick}_${cleanTicker}`,
          month: ensured.currentTick,
          category: 'finance' as const,
          title: `Spin-Off IPO: ${parent.ticker} Melantaikan Anak Usaha ${cleanTicker}`,
          detail: `${subCompany.name} (${cleanTicker}) mencatatkan saham perdana di $${ipoPrice} dengan ${validFacs.length} fasilitas operasional dan kepemilikan induk 70%.`,
        },
        ...ensured.newsFeed,
      ].slice(0, 25),
    },
  };
}
