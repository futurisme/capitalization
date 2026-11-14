/**
 * In-house precision math, finite clamping, deterministic hashing, and currency formatting utilities.
 * Zero third-party dependencies; prevents NaN/Infinity/-0 drift under heavy financial workloads.
 */

export function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? (value === 0 ? 0 : value) : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value === 0 ? 0 : value;
}

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

export function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
}

export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? (result === 0 ? 0 : result) : fallback;
}

/**
 * Deterministic 32-bit FNV-1a hash for reproducible IDs and market micro-waves (zero RNG noise).
 */
export function deterministicHash(input: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Formats USD currency compactly with accurate negative sign placement (e.g. -$1.25M).
 */
export function formatMoney(val: number): string {
  const clean = finiteOr(val, 0);
  const abs = Math.abs(clean);
  const sign = clean < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

/**
 * Formats full integer USD currency with proper sign placement before '$' (e.g. -$109,410).
 */
export function formatSignedCurrency(val: number): string {
  const rounded = roundCurrency(val);
  const abs = Math.abs(rounded);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${abs.toLocaleString()}`;
}

/**
 * Formats upgrade/construction costs compactly.
 */
export function formatCostShort(val: number): string {
  const clean = finiteOr(val, 0);
  const abs = Math.abs(clean);
  const sign = clean < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  return `${sign}$${Math.round(abs / 1_000)}K`;
}
