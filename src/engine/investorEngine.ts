import {
  AiPersonEntity,
  ExecutiveOfficer,
  ExecutiveRole,
  SimulationState,
} from '../types/game';
import { INITIAL_AI_ROSTER, MAX_AI_ENTITIES } from './productsData';
import { clamp, deterministicHash, roundCurrency } from './precisionMath';
import { getOwnershipPercentage } from './stockMarket';

const FIRST_NAMES = [
  'Adi', 'Bima', 'Candra', 'Dewi', 'Eka', 'Fajar', 'Gita', 'Hadi', 'Indra', 'Joko',
  'Kartika', 'Lukas', 'Maya', 'Naufal', 'Olivia', 'Putra', 'Qori', 'Raka', 'Sari', 'Taufik',
  'Umar', 'Vina', 'Wahyu', 'Xaver', 'Yogi', 'Zara', 'Arif', 'Bella', 'Dian', 'Farhan',
  'Hana', 'Ilham', 'Jasmine', 'Kevin', 'Lina', 'Mikael', 'Nadia', 'Oscar', 'Priska', 'Rendra',
  'Shinta', 'Teguh', 'Vero', 'Wulan', 'Yusuf', 'Amara', 'Bayu', 'Citra', 'Dimas', 'Erlangga',
] as const;

const LAST_NAMES = [
  'Wijaya', 'Santoso', 'Pratama', 'Kusuma', 'Hartono', 'Halim', 'Gunawan', 'Salim', 'Tanoto', 'Nugroho',
  'Surya', 'Kurniawan', 'Utami', 'Raharja', 'Mulyadi', 'Susanto', 'Bakrie', 'Pangestu', 'Lim', 'Subrata',
  'Cahyadi', 'Mahendra', 'Wibowo', 'Setiawan', 'Hidayat', 'Puspita', 'Budiman', 'Siregar', 'Simanjuntak', 'Tanjung',
] as const;

const INVESTOR_COLORS = [
  '#0284c7', '#059669', '#7c3aed', '#d97706', '#dc2626',
  '#0891b2', '#4f46e5', '#be185d', '#15803d', '#b45309',
] as const;

const SPECIALTIES: AiPersonEntity['specialty'][] = [
  'finance',
  'operations',
  'technology',
  'marketing',
  'governance',
];

const AMBITIONS: AiPersonEntity['ambition'][] = [
  'activist_investor',
  'empire_builder',
  'public_servant',
  'tech_visionary',
];

/**
 * Deterministically creates all 100 AI Entities:
 * - First 9 correspond to the initial 9 AI Competitor CEOs
 * - Remaining 91 start as autonomous AI Investors with distinct capital, skills & stock portfolios
 */
export function generateInitialAiEntities(
  companies: SimulationState['companies']
): { aiEntities: Record<string, AiPersonEntity>; aiEntityOrder: string[] } {
  const aiEntities: Record<string, AiPersonEntity> = {};
  const aiEntityOrder: string[] = [];

  const companyList = Object.values(companies).filter(c => !c.isPlayer);

  // 1. Seed 9 Initial Competitor CEOs
  for (let i = 0; i < INITIAL_AI_ROSTER.length && aiEntityOrder.length < 9; i++) {
    const tpl = INITIAL_AI_ROSTER[i];
    const comp = companies[tpl.id];
    const entId = `ai_ent_ceo_${i + 1}`;
    const words = tpl.ceoName.replace(/"/g, '').split(/\s+/);
    const initials = words
      .filter(w => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('') || tpl.ticker.slice(0, 2);

    const spec: AiPersonEntity['specialty'] =
      tpl.personality === 'tech_innovator' || tpl.personality === 'quality_first'
        ? 'technology'
        : tpl.personality === 'brand_titan'
        ? 'marketing'
        : tpl.personality === 'supply_monopolist'
        ? 'operations'
        : 'finance';

    const starterShares = comp ? Math.round(comp.sharesOutstanding * 0.14) : 120000;
    const starterPrice = comp ? comp.stockPrice : tpl.stockPrice;
    const cash = 1_800_000 + (i % 4) * 350_000;

    aiEntities[entId] = {
      id: entId,
      name: tpl.ceoName,
      initials,
      color: tpl.color,
      role: 'ceo',
      specialty: spec,
      ambition: 'empire_builder',
      cash,
      portfolio: comp ? { [comp.id]: starterShares } : {},
      netWorth: roundCurrency(cash + starterShares * starterPrice),
      financeSkill: 78 + ((i * 3) % 18),
      opsSkill: 80 + ((i * 5) % 16),
      rdSkill: tpl.personality === 'tech_innovator' ? 92 : 70 + ((i * 7) % 20),
      marketingSkill: tpl.personality === 'brand_titan' ? 94 : 72 + ((i * 4) % 20),
      politicalClout: 48 + ((i * 6) % 35),
      companyId: comp?.id || tpl.id,
      lastActionMonth: 0,
      careerHistory: [`Menjabat CEO pendiri ${tpl.name} (${tpl.ticker}).`],
    };
    aiEntityOrder.push(entId);
  }

  // 2. Seed remaining 91 AI Investors to reach exactly MAX_AI_ENTITIES (100)
  let seq = 0;
  while (aiEntityOrder.length < MAX_AI_ENTITIES) {
    seq += 1;
    const entId = `ai_ent_inv_${seq}`;
    const h = deterministicHash(entId);
    const fn = FIRST_NAMES[(h + seq * 3) % FIRST_NAMES.length];
    const ln = LAST_NAMES[((h >>> 3) + seq * 7) % LAST_NAMES.length];
    const name = `${fn} ${ln}`;
    const initials = `${fn[0]}${ln[0]}`.toUpperCase();
    const color = INVESTOR_COLORS[seq % INVESTOR_COLORS.length];
    const spec = SPECIALTIES[(h + seq) % SPECIALTIES.length];
    const ambition = AMBITIONS[(h >>> 2) % AMBITIONS.length];

    // Starting capital tier ranges from $1.4M to $12M so some activist investors can mount real campaigns
    const cashTier = 1_400_000 + (h % 10) * 1_050_000;
    const portfolio: Record<string, number> = {};
    let stockValue = 0;

    if (companyList.length > 0) {
      const primaryComp = companyList[(h + seq) % companyList.length];
      const secondaryComp = companyList[(h + seq + 3) % companyList.length];
      const s1 = 4000 + (h % 18000);
      portfolio[primaryComp.id] = s1;
      stockValue += s1 * primaryComp.stockPrice;

      if (secondaryComp.id !== primaryComp.id && h % 2 === 0) {
        const s2 = 2500 + ((h >>> 4) % 9500);
        portfolio[secondaryComp.id] = s2;
        stockValue += s2 * secondaryComp.stockPrice;
      }
    }

    aiEntities[entId] = {
      id: entId,
      name,
      initials,
      color,
      role: 'investor',
      specialty: spec,
      ambition,
      cash: roundCurrency(cashTier),
      portfolio,
      netWorth: roundCurrency(cashTier + stockValue),
      financeSkill: 66 + (h % 31),
      opsSkill: 62 + ((h >>> 3) % 34),
      rdSkill: 58 + ((h >>> 5) % 38),
      marketingSkill: 60 + ((h >>> 7) % 36),
      politicalClout: spec === 'governance' || ambition === 'public_servant' ? 68 + (h % 28) : 28 + (h % 55),
      lastActionMonth: 0,
      careerHistory: ['Investor institusional & individu aktif di Bursa Metropolis.'],
    };
    aiEntityOrder.push(entId);
  }

  return { aiEntities, aiEntityOrder };
}

/**
 * Ensures any legacy saved state seamlessly gets all 100 AI Entities populated.
 */
export function ensureAiEntitiesPopulated(state: SimulationState): SimulationState {
  if (
    state.aiEntities &&
    state.aiEntityOrder &&
    state.aiEntityOrder.length >= MAX_AI_ENTITIES
  ) {
    return state;
  }

  const generated = generateInitialAiEntities(state.companies);
  if (!state.aiEntities || Object.keys(state.aiEntities).length === 0) {
    return {
      ...state,
      aiEntities: generated.aiEntities,
      aiEntityOrder: generated.aiEntityOrder,
    };
  }

  const merged = { ...generated.aiEntities, ...state.aiEntities };
  const order = Array.from(new Set([...(state.aiEntityOrder || []), ...generated.aiEntityOrder])).slice(
    0,
    MAX_AI_ENTITIES
  );
  return {
    ...state,
    aiEntities: merged,
    aiEntityOrder: order,
  };
}

/**
 * Recruits an available AI Investor from the 100-entity pool into a corporate C-Suite position (COO/CTO/CMO/CFO).
 */
export function recruitInvestorAsExecutive(
  state: SimulationState,
  entityId: string,
  companyId: string,
  role: ExecutiveRole
): { success: boolean; message: string; updatedState?: SimulationState } {
  const ensured = ensureAiEntitiesPopulated(state);
  const entity = ensured.aiEntities?.[entityId];
  const company = ensured.companies[companyId];

  if (!entity || !company) {
    return { success: false, message: 'Entitas investor atau perusahaan tidak ditemukan.' };
  }
  if (entity.role !== 'investor') {
    return { success: false, message: `${entity.name} saat ini berstatus ${entity.role}, bukan Investor bebas.` };
  }

  const skill =
    role === 'CFO'
      ? entity.financeSkill
      : role === 'CTO'
      ? entity.rdSkill
      : role === 'CMO'
      ? entity.marketingSkill
      : entity.opsSkill;

  const signingBonus = roundCurrency(skill * 950);
  const monthlySalary = roundCurrency(24000 + Math.max(0, skill - 60) * 550);

  if (company.cash < signingBonus) {
    return {
      success: false,
      message: `Kas tidak mencukupi untuk bonus perekrutan ($${signingBonus.toLocaleString()}).`,
    };
  }

  const execIdx = company.executives.findIndex(e => e.role === role);
  const newExec: ExecutiveOfficer = {
    id: execIdx >= 0 ? company.executives[execIdx].id : `exec_${role.toLowerCase()}_${entity.id}`,
    role,
    name: entity.name,
    specialty: `Eks-Investor Spesialis ${entity.specialty.toUpperCase()} (Skill ${skill}/99)`,
    skillRating: clamp(skill, 65, 99),
    monthlySalary,
    hired: true,
    sourceEntityId: entity.id,
  };

  const nextExecutives =
    execIdx >= 0
      ? company.executives.map((e, i) => (i === execIdx ? newExec : e))
      : [...company.executives, newExec];

  const updatedEntity: AiPersonEntity = {
    ...entity,
    role: 'c_suite',
    companyId: company.id,
    executiveRole: role,
    cash: roundCurrency(entity.cash + signingBonus),
    lastActionMonth: ensured.currentTick,
    careerHistory: [
      `Rekrutmen Eksekutif: Diangkat sebagai ${role} di ${company.name} (${company.ticker}) pada ${ensured.dateString}.`,
      ...entity.careerHistory,
    ].slice(0, 8),
  };

  return {
    success: true,
    message: `${entity.name} resmi direkrut menjadi ${role} di ${company.ticker} (Skill ${skill}, Gaji $${monthlySalary.toLocaleString()}/bln).`,
    updatedState: {
      ...ensured,
      companies: {
        ...ensured.companies,
        [company.id]: {
          ...company,
          cash: roundCurrency(company.cash - signingBonus),
          executives: nextExecutives,
        },
      },
      aiEntities: {
        ...ensured.aiEntities!,
        [entity.id]: updatedEntity,
      },
      newsFeed: [
        {
          id: `news_recruit_${ensured.currentTick}_${entity.id}`,
          month: ensured.currentTick,
          category: 'competitor' as const,
          title: `Talenta Eksekutif Baru: ${entity.name} -> ${role} ${company.ticker}`,
          detail: `${company.name} merekrut investor terkemuka ${entity.name} untuk memimpin divisi ${role}.`,
        },
        ...ensured.newsFeed,
      ].slice(0, 25),
    },
  };
}

/**
 * Ultra-lightweight O(100) monthly tick for all 100 AI Entities:
 * - Pays dividends to entity portfolios based on company.dividendPerShare
 * - Rotates 12 staggered active investors per month to trade Bursa shares autonomously
 * - Allows activist investors who accumulate controlling equity (>= 50% or dominant outside block >= 35% on AI company) to mount a CEO takeover
 * - Updates netWorth & politicalClout
 */
export function simulateInvestorsAndCareersMonth(state: SimulationState): SimulationState {
  const ensured = ensureAiEntitiesPopulated(state);
  const aiEntities = { ...ensured.aiEntities! };
  const order = ensured.aiEntityOrder!;
  const companies = { ...ensured.companies };
  const activeCompanies = Object.values(companies);
  const newsToAdd: SimulationState['newsFeed'] = [];
  const month = ensured.currentTick;

  if (activeCompanies.length === 0) return ensured;

  // Step 1: Collect dividends & update portfolio mark-to-market for all 100 entities
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const ent = aiEntities[id];
    if (!ent) continue;

    let cash = ent.cash;
    let portfolioVal = 0;
    let dirtyPortfolio = false;
    const nextPortfolio = { ...ent.portfolio };

    // C-suite and CEO compensation
    if (ent.role === 'c_suite') {
      cash += 26000;
    } else if (ent.role === 'ceo') {
      cash += 42000;
    } else if (ent.role === 'mayor' || ent.role === 'minister_of_labor' || ent.role === 'president') {
      cash += 35000;
    }

    for (const [cId, shares] of Object.entries(nextPortfolio)) {
      if (shares <= 0) continue;
      const comp = companies[cId];
      if (!comp) {
        delete nextPortfolio[cId];
        dirtyPortfolio = true;
        continue;
      }
      if (comp.dividendPerShare > 0 && comp.cash > 500000) {
        cash += roundCurrency(shares * comp.dividendPerShare * 0.45);
      }
      portfolioVal += shares * comp.stockPrice;
    }

    aiEntities[id] = {
      ...ent,
      cash: roundCurrency(cash),
      portfolio: dirtyPortfolio ? nextPortfolio : ent.portfolio,
      netWorth: roundCurrency(cash + portfolioVal),
    };
  }

  // Step 2: 12 staggered active investors evaluate equity trades & activist CEO takeovers per month
  const batchSize = Math.min(12, order.length);
  for (let slot = 0; slot < batchSize; slot++) {
    const idx = (month * batchSize + slot) % order.length;
    const entId = order[idx];
    const ent = aiEntities[entId];
    if (!ent || ent.role !== 'investor') continue;

    const targetComp =
      activeCompanies[(deterministicHash(`${entId}_${month}_${slot}`) + slot) % activeCompanies.length];
    if (!targetComp) continue;

    const price = Math.max(1, targetComp.stockPrice);
    const currentOwned = ent.portfolio[targetComp.id] || 0;
    const ownershipPct = getOwnershipPercentage(targetComp, currentOwned);

    // Activist / Value-investing share accumulation if undervalued or cash-rich
    const bookPerShare = targetComp.bookValue / Math.max(1, targetComp.sharesOutstanding);
    const shouldBuy =
      (targetComp.stockPrice < bookPerShare * 1.18 || ent.ambition === 'activist_investor') &&
      ent.cash > 450000 &&
      ownershipPct < 58;

    if (shouldBuy) {
      const budget = Math.min(ent.cash * 0.28, targetComp.sharesOutstanding * 0.08 * price);
      const buyShares = Math.max(500, Math.floor(budget / price));
      const maxCapShares = Math.max(0, Math.floor(targetComp.sharesOutstanding * 0.62) - currentOwned);
      const finalBuy = Math.min(buyShares, maxCapShares);

      if (finalBuy >= 500 && finalBuy * price <= ent.cash - 150000) {
        const cost = roundCurrency(finalBuy * price);
        const newTotal = currentOwned + finalBuy;
        const newPct = getOwnershipPercentage(targetComp, newTotal);
        const nextPortfolio = { ...ent.portfolio, [targetComp.id]: newTotal };
        const nextCash = roundCurrency(ent.cash - cost);

        let portfolioVal = 0;
        for (const [cid, sh] of Object.entries(nextPortfolio)) {
          if (companies[cid]) portfolioVal += sh * companies[cid].stockPrice;
        }

        let updatedEnt: AiPersonEntity = {
          ...ent,
          cash: nextCash,
          portfolio: nextPortfolio,
          netWorth: roundCurrency(nextCash + portfolioVal),
          lastActionMonth: month,
        };

        // Hostile / Majority Board Takeover Check on AI-controlled corporations
        if (
          !targetComp.isPlayer &&
          targetComp.id !== ent.companyId &&
          (newPct >= 50 || (newPct >= 36 && targetComp.lastMonthNetProfit < 0 && ent.ambition === 'activist_investor'))
        ) {
          // Demote former CEO if tracked in entity pool
          if (targetComp.ceoEntityId && aiEntities[targetComp.ceoEntityId]) {
            const oldCeo = aiEntities[targetComp.ceoEntityId];
            aiEntities[oldCeo.id] = {
              ...oldCeo,
              role: 'investor',
              companyId: undefined,
              lastActionMonth: month,
              careerHistory: [
                `Melepas jabatan CEO ${targetComp.ticker} usai perubahan mayoritas saham (${month}).`,
                ...oldCeo.careerHistory,
              ].slice(0, 8),
            };
          }

          updatedEnt = {
            ...updatedEnt,
            role: 'ceo',
            companyId: targetComp.id,
            careerHistory: [
              `Takeover Bursa! Mengakuisisi ${newPct}% saham ${targetComp.ticker} dan naik menjadi CEO.`,
              ...updatedEnt.careerHistory,
            ].slice(0, 8),
          };

          companies[targetComp.id] = {
            ...targetComp,
            ceoName: updatedEnt.name,
            ceoEntityId: updatedEnt.id,
          };

          newsToAdd.push({
            id: `news_ceo_takeover_${month}_${targetComp.ticker}_${updatedEnt.id}`,
            month,
            category: 'finance',
            title: `Pengambilalihan CEO: ${updatedEnt.name} Pimpin ${targetComp.ticker}`,
            detail: `Investor aktif ${updatedEnt.name} menggenggam ${newPct}% saham ${targetComp.name} dan resmi mengambil alih kursi CEO.`,
          });
        }

        aiEntities[entId] = updatedEnt;
      }
    }
  }

  return {
    ...ensured,
    companies,
    aiEntities,
    newsFeed: [...newsToAdd, ...ensured.newsFeed].slice(0, 25),
  };
}
