import { ProductAppealWeights } from '../types/game';
import { clamp, finiteOr, roundCurrency } from './precisionMath';

const DEFAULT_APPEAL_WEIGHTS: ProductAppealWeights = {
  price: 0.45,
  quality: 0.3,
  brand: 0.25,
};

/**
 * Calculates Capitalism Lab-style consumer demand & appeal score using
 * Price / Quality / Brand weights tailored to each product category.
 */
export function calculateConsumerDemand(
  baseDemand: number,
  sellingPrice: number,
  basePrice: number,
  qualityRating: number,
  brandRating: number,
  elasticity: number,
  appealWeights?: ProductAppealWeights
): number {
  const safeBaseDemand = finiteOr(baseDemand, 0);
  const safeSellingPrice = finiteOr(sellingPrice, 0);
  const safeBasePrice = finiteOr(basePrice, 0);
  if (safeBaseDemand <= 0 || safeSellingPrice <= 0 || safeBasePrice <= 0) return 0;

  const weights = appealWeights || DEFAULT_APPEAL_WEIGHTS;
  const priceRatio = safeBasePrice / Math.max(safeSellingPrice, safeBasePrice * 0.15);
  const boundedElasticity = clamp(finiteOr(elasticity, 1.0), 0.1, 2.5);
  const priceEffect = Math.pow(priceRatio, boundedElasticity);

  const qualityEffect = 0.4 + (clamp(qualityRating, 0, 100) / 100) * 1.1;
  const brandEffect = 0.5 + (clamp(brandRating, 0, 100) / 100) * 1.0;

  const weightedScore =
    priceEffect * finiteOr(weights.price, 0.45) +
    qualityEffect * finiteOr(weights.quality, 0.3) +
    brandEffect * finiteOr(weights.brand, 0.25);

  // Continuous consumer affordability gate when price exceeds 2x reference market price
  const rawPriceRatio = safeBasePrice / safeSellingPrice;
  const affordabilityGate = rawPriceRatio < 0.5 ? Math.pow(rawPriceRatio * 2, 2) : 1;

  const estimatedDemand =
    safeBaseDemand * Math.max(0.05, finiteOr(weightedScore, 0.05)) * affordabilityGate;
  return Math.max(0, roundCurrency(estimatedDemand));
}
