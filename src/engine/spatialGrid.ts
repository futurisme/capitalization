import { Facility, MapParcel } from '../types/game';
import { clamp, finiteOr, round2, roundCurrency } from './precisionMath';

// Pooled typed buffers reused across ticks to avoid GC churn on 32x32+ grids
let pooledCapacity = 0;
let pooledTrafficBuf = new Float32Array(0);
let pooledRoadFlags = new Uint8Array(0);
let pooledLookupGrid = new Uint8Array(0);

function ensureSpatialPools(totalTiles: number): void {
  if (totalTiles <= pooledCapacity) return;
  pooledCapacity = totalTiles;
  pooledTrafficBuf = new Float32Array(totalTiles);
  pooledRoadFlags = new Uint8Array(totalTiles);
  pooledLookupGrid = new Uint8Array(totalTiles);
}

/**
 * Infers square grid dimension from parcel count.
 */
export function inferGridSize(parcelCount: number): number {
  if (parcelCount <= 0) return 32;
  const root = Math.round(Math.sqrt(parcelCount));
  return root > 0 ? root : 32;
}

/**
 * O(1) coordinate lookup on row-major parcel grids, with safe fallback scan for sparse/custom arrays.
 */
export function getParcelAt(
  parcels: readonly MapParcel[],
  x: number,
  y: number,
  gridSizeHint?: number
): MapParcel | undefined {
  const len = parcels.length;
  if (len === 0) return undefined;
  const gridSize = gridSizeHint ?? inferGridSize(len);
  if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
    const idx = y * gridSize + x;
    const direct = parcels[idx];
    if (direct && direct.x === x && direct.y === y) {
      return direct;
    }
  }
  for (let i = 0; i < len; i++) {
    const p = parcels[i];
    if (p.x === x && p.y === y) return p;
  }
  return undefined;
}

/**
 * Populates and returns a pooled Uint8Array of tile traffic scores for O(1) simulation reads.
 */
export function buildTrafficLookupGrid(
  parcels: readonly MapParcel[],
  gridSize: number
): Uint8Array {
  const total = gridSize * gridSize;
  ensureSpatialPools(total);
  const buf = pooledLookupGrid;
  buf.fill(25, 0, total);

  for (let i = 0; i < parcels.length; i++) {
    const p = parcels[i];
    if (p.x >= 0 && p.x < gridSize && p.y >= 0 && p.y < gridSize) {
      buf[p.y * gridSize + p.x] = Math.round(clamp(p.trafficIndex ?? 25, 0, 100));
    }
  }
  return buf;
}

/**
 * Pure O(1) foot-traffic multiplier for retail stores based on CapLab 13 Traffic Index (0-100).
 */
export function getTrafficDemandMultiplier(trafficIndex: number): number {
  const clamped = clamp(trafficIndex, 0, 100);
  return round2(0.7 + (clamped / 100) * 0.75);
}

/**
 * Ultra-lightweight O(W*H + F) zero-GC spatial calculator for Crowd Traffic Index & Land Value.
 * Reuses pooled TypedArrays and performs structural sharing so unchanged tiles keep referential identity.
 */
export function recalculateCityTraffic(
  parcels: MapParcel[],
  facilities: Record<string, Facility>,
  inflationStepFactor = 1.0
): MapParcel[] {
  const len = parcels.length;
  if (len === 0) return parcels;

  const gridSize = inferGridSize(len);
  const totalTiles = gridSize * gridSize;
  ensureSpatialPools(totalTiles);

  const trafficBuf = pooledTrafficBuf;
  const roadFlags = pooledRoadFlags;
  trafficBuf.fill(0, 0, totalTiles);
  roadFlags.fill(0, 0, totalTiles);

  for (let i = 0; i < len; i++) {
    const p = parcels[i];
    if (p.x < 0 || p.x >= gridSize || p.y < 0 || p.y >= gridSize) continue;
    const idx = p.y * gridSize + p.x;

    if (p.terrainType === 'water') {
      trafficBuf[idx] = 0;
    } else if (p.terrainType === 'road') {
      trafficBuf[idx] = 34;
      roadFlags[idx] = 1;
    } else if (p.terrainType === 'pavement') {
      trafficBuf[idx] = 24;
    } else if (p.terrainType === 'industrial_zone') {
      trafficBuf[idx] = 12;
    } else {
      trafficBuf[idx] = 14;
    }
  }

  // Orthogonal road adjacency visibility boost
  for (let i = 0; i < len; i++) {
    const p = parcels[i];
    if (p.terrainType === 'water' || p.terrainType === 'road') continue;
    const x = p.x;
    const y = p.y;
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) continue;

    const nearRoad =
      (x > 0 && roadFlags[y * gridSize + (x - 1)] === 1) ||
      (x + 1 < gridSize && roadFlags[y * gridSize + (x + 1)] === 1) ||
      (y > 0 && roadFlags[(y - 1) * gridSize + x] === 1) ||
      (y + 1 < gridSize && roadFlags[(y + 1) * gridSize + x] === 1);

    if (nearRoad) {
      trafficBuf[y * gridSize + x] += 16;
    }
  }

  // Spatial crowd ripple from Real Estate, Civic Housing, Retail & Corporate Towers
  const facList = Object.values(facilities);
  for (let fIdx = 0; fIdx < facList.length; fIdx++) {
    const fac = facList[fIdx];
    let peak = 0;
    let radius = 0;

    if (fac.type === 'apartment_complex') {
      peak = 30 + (fac.level - 1) * 5;
      radius = 5;
    } else if (fac.type === 'civic_housing') {
      peak = 28 + (fac.level - 1) * 4;
      radius = 5;
    } else if (fac.type === 'resident_house') {
      const tier = fac.housingTier || fac.level || 1;
      peak = 11 + (tier - 1) * 5;
      radius = 3;
    } else if (fac.type === 'commercial_tower') {
      peak = 26 + (fac.level - 1) * 4;
      radius = 4;
    } else if (fac.type === 'store_department') {
      peak = 22 + (fac.level - 1) * 3;
      radius = 4;
    } else if (fac.type === 'corporate_hq') {
      peak = 18;
      radius = 3;
    } else if (fac.type.startsWith('store_')) {
      peak = 14 + (fac.level - 1) * 2;
      radius = 3;
    } else if (
      fac.type === 'media_telecom' ||
      fac.type === 'tech_software' ||
      fac.type === 'rd_center'
    ) {
      peak = 10;
      radius = 3;
    } else if (
      fac.type === 'factory_processing' ||
      fac.type === 'factory_assembly' ||
      fac.type === 'mine_extraction'
    ) {
      peak = -8;
      radius = 2;
    }

    if (peak === 0) continue;

    const minX = Math.max(0, fac.tileX - radius);
    const maxX = Math.min(gridSize - 1, fac.tileX + radius);
    const minY = Math.max(0, fac.tileY - radius);
    const maxY = Math.min(gridSize - 1, fac.tileY + radius);

    for (let ny = minY; ny <= maxY; ny++) {
      const dy = Math.abs(ny - fac.tileY);
      const rowOffset = ny * gridSize;
      for (let nx = minX; nx <= maxX; nx++) {
        const dist = Math.abs(nx - fac.tileX) + dy;
        if (dist > radius) continue;
        const nIdx = rowOffset + nx;
        if (roadFlags[nIdx] === 1) continue;
        trafficBuf[nIdx] += peak * (1 - dist / (radius + 1));
      }
    }
  }

  let anyChanged = false;
  const result = new Array<MapParcel>(len);

  for (let i = 0; i < len; i++) {
    const p = parcels[i];
    if (p.terrainType === 'water') {
      const nextLand =
        inflationStepFactor !== 1.0
          ? roundCurrency(finiteOr(p.landValue, 0) * inflationStepFactor)
          : p.landValue;
      if (p.trafficIndex === 0 && p.landValue === nextLand) {
        result[i] = p;
      } else {
        anyChanged = true;
        result[i] = { ...p, trafficIndex: 0, landValue: nextLand };
      }
      continue;
    }

    const inBounds = p.x >= 0 && p.x < gridSize && p.y >= 0 && p.y < gridSize;
    const rawTraffic = inBounds ? trafficBuf[p.y * gridSize + p.x] : 15;
    const trafficIndex = Math.round(clamp(rawTraffic, 5, 100));

    const isMonthlyTick = inflationStepFactor !== 1.0;
    const adjustedLand = isMonthlyTick
      ? roundCurrency(finiteOr(p.landValue, 0) * inflationStepFactor * 0.995)
      : finiteOr(p.landValue, 0);

    const zoneBase =
      p.terrainType === 'pavement'
        ? 220000
        : p.terrainType === 'industrial_zone'
        ? 120000
        : p.terrainType === 'grass'
        ? 88000
        : 0;

    const floorValue = roundCurrency(zoneBase * (0.72 + trafficIndex / 115));
    const nextLandValue = p.isZoneAllowed ? Math.max(adjustedLand, floorValue) : adjustedLand;

    if (p.trafficIndex === trafficIndex && p.landValue === nextLandValue) {
      result[i] = p;
    } else {
      anyChanged = true;
      result[i] = {
        ...p,
        trafficIndex,
        landValue: nextLandValue,
      };
    }
  }

  return anyChanged ? result : parcels;
}
