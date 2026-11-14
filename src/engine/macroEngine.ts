import { MacroEconomy } from '../types/game';
import { clamp, finiteOr, round1 } from './precisionMath';

const MACRO_TARGETS: Record<MacroEconomy['cyclePhase'], { gdp: number; inf: number; cbr: number }> = {
  boom: { gdp: 4.8, inf: 4.1, cbr: 6.2 },
  normal: { gdp: 2.9, inf: 2.3, cbr: 4.5 },
  recession: { gdp: -1.4, inf: 1.1, cbr: 2.5 },
  recovery: { gdp: 3.4, inf: 1.9, cbr: 3.5 },
};

/**
 * Advances Macroeconomic cycle smoothly with inflation, central bank rate, and GDP shifts.
 */
export function advanceMacroEconomy(macro: MacroEconomy, tick: number): MacroEconomy {
  const next: MacroEconomy = {
    ...macro,
    monthsInPhase: Math.max(0, Math.floor(finiteOr(macro.monthsInPhase, 0))) + 1,
  };

  if (next.monthsInPhase >= 16) {
    const roll = Math.abs(Math.floor(finiteOr(tick, 0)) * 17) % 10;
    if (next.cyclePhase === 'normal' && roll >= 5) {
      next.cyclePhase = 'boom';
      next.monthsInPhase = 0;
    } else if (next.cyclePhase === 'boom' && roll >= 4) {
      next.cyclePhase = 'recession';
      next.monthsInPhase = 0;
    } else if (next.cyclePhase === 'recession' && next.monthsInPhase >= 14) {
      next.cyclePhase = 'recovery';
      next.monthsInPhase = 0;
    } else if (next.cyclePhase === 'recovery') {
      next.cyclePhase = 'normal';
      next.monthsInPhase = 0;
    }
  }

  const t = MACRO_TARGETS[next.cyclePhase] || MACRO_TARGETS.normal;
  next.gdpGrowthRate = clamp(round1(finiteOr(next.gdpGrowthRate, t.gdp) * 0.8 + t.gdp * 0.2), -5, 10);
  next.inflationRate = clamp(round1(finiteOr(next.inflationRate, t.inf) * 0.8 + t.inf * 0.2), 0, 15);
  next.centralBankRate = clamp(round1(finiteOr(next.centralBankRate, t.cbr) * 0.85 + t.cbr * 0.15), 0.5, 18);

  return next;
}
