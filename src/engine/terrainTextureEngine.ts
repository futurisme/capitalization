import { CityBiome, MapParcel } from '../types/game';
import { deterministicHash } from './precisionMath';

/**
 * Semi-realistic yet stylistically flat procedural Canvas2D terrain texture renderer.
 * Runs exclusively during offscreen map bake for zero runtime GC or frame-drop overhead.
 */

const BIOME_PALETTES: Record<
  CityBiome,
  {
    meadow: readonly [string, string, string];
    meadowStroke: string;
    forest: readonly [string, string];
    fertile: readonly [string, string];
    rocky: readonly [string, string];
    plaza: readonly [string, string];
    concrete: readonly [string, string];
  }
> = {
  coastal_metro: {
    meadow: ['#2b5e34', '#31683a', '#26532e'],
    meadowStroke: '#1e4225',
    forest: ['#1e4627', '#193b21'],
    fertile: ['#4d5e2a', '#435324'],
    rocky: ['#475569', '#3b4758'],
    plaza: ['#475569', '#3f4c5e'],
    concrete: ['#323846', '#2b303d'],
  },
  industrial_heartland: {
    meadow: ['#3b5930', '#416135', '#344f2a'],
    meadowStroke: '#283d20',
    forest: ['#254223', '#1e361c'],
    fertile: ['#585b2c', '#4c4f24'],
    rocky: ['#4b5563', '#3f4754'],
    plaza: ['#444e5e', '#3c4554'],
    concrete: ['#2d3340', '#252a35'],
  },
  highland_mining: {
    meadow: ['#3d5c38', '#44663e', '#355030'],
    meadowStroke: '#293f25',
    forest: ['#24472c', '#1c3823'],
    fertile: ['#5a6133', '#4e542a'],
    rocky: ['#525c6b', '#454e5c'],
    plaza: ['#4b5666', '#414b59'],
    concrete: ['#353a47', '#2d323d'],
  },
  agri_valley: {
    meadow: ['#2f6b36', '#37763e', '#285e2e'],
    meadowStroke: '#1f4a24',
    forest: ['#1d4f28', '#174020'],
    fertile: ['#5e6d29', '#525f22'],
    rocky: ['#4c5763', '#404a54'],
    plaza: ['#4d596b', '#434e5e'],
    concrete: ['#353c4a', '#2e3440'],
  },
  tech_corridor: {
    meadow: ['#2a5c3d', '#306644', '#245035'],
    meadowStroke: '#1c3e29',
    forest: ['#1c4530', '#163726'],
    fertile: ['#48612f', '#3f5628'],
    rocky: ['#48566a', '#3d4a5c'],
    plaza: ['#4a596e', '#414f62'],
    concrete: ['#303847', '#29303d'],
  },
};

function drawDiamondPath(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  hw: number,
  hh: number
) {
  ctx.beginPath();
  ctx.moveTo(px, py - hh);
  ctx.lineTo(px + hw, py);
  ctx.lineTo(px, py + hh);
  ctx.lineTo(px - hw, py);
  ctx.closePath();
}

export function drawFlatTexturedGroundTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tileWidth: number,
  tileHeight: number,
  gridSize: number,
  parcel: MapParcel,
  biome: CityBiome,
  eastWater: boolean,
  southWater: boolean
): void {
  const hw = tileWidth * 0.5;
  const hh = tileHeight * 0.5;
  const seed = deterministicHash(`tex_${biome}_${parcel.x}_${parcel.y}`);
  const pal = BIOME_PALETTES[biome] || BIOME_PALETTES.coastal_metro;
  const variant = parcel.terrainVariant;

  drawDiamondPath(ctx, px, py, hw, hh);

  if (parcel.terrainType === 'road') {
    ctx.fillStyle = '#242b38';
    ctx.fill();
    ctx.strokeStyle = '#5a687d';
    ctx.lineWidth = 1.05;
    ctx.stroke();

    // Dynamic arterial coordinates every 8 tiles starting at 5
    const isXRoad = (parcel.x - 5) % 8 === 0 && parcel.x >= 5 && parcel.x < gridSize - 3;
    const isYRoad = (parcel.y - 5) % 8 === 0 && parcel.y >= 5 && parcel.y < gridSize - 3;
    const isIntersection = isXRoad && isYRoad;

    if (isIntersection) {
      // Crisp crosswalk bands
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.7)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(px - 8, py - 2);
      ctx.lineTo(px - 3, py - 4.5);
      ctx.moveTo(px + 3, py + 4.5);
      ctx.lineTo(px + 8, py + 2);
      ctx.moveTo(px - 8, py + 2);
      ctx.lineTo(px - 3, py + 4.5);
      ctx.moveTo(px + 3, py - 4.5);
      ctx.lineTo(px + 8, py - 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      if (isXRoad && !isYRoad) {
        ctx.moveTo(px + hw * 0.36, py - hh * 0.36);
        ctx.lineTo(px - hw * 0.36, py + hh * 0.36);
      } else {
        ctx.moveTo(px - hw * 0.36, py - hh * 0.36);
        ctx.lineTo(px + hw * 0.36, py + hh * 0.36);
      }
      ctx.strokeStyle = '#eab308';
      ctx.setLineDash([3, 3.5]);
      ctx.lineWidth = 1.0;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    return;
  }

  if (parcel.terrainType === 'industrial_zone') {
    ctx.fillStyle = pal.concrete[seed % 2];
    ctx.fill();
    ctx.strokeStyle = '#434b5c';
    ctx.lineWidth = 0.85;
    ctx.stroke();

    // Flat concrete expansion joint grid lines & subtle hazard corner notch
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(px - hw * 0.45, py - hh * 0.45);
    ctx.lineTo(px + hw * 0.45, py + hh * 0.45);
    ctx.moveTo(px + hw * 0.42, py - hh * 0.42);
    ctx.lineTo(px - hw * 0.42, py + hh * 0.42);
    ctx.stroke();

    ctx.fillStyle = 'rgba(251, 191, 36, 0.14)';
    ctx.fillRect(px - 1.5, py - hh + 4, 3, 1.5);
  } else if (parcel.terrainType === 'pavement') {
    ctx.fillStyle = pal.plaza[seed % 2];
    ctx.fill();
    ctx.strokeStyle = '#5e6d85';
    ctx.lineWidth = 0.85;
    ctx.stroke();

    // Flat architectural stone plaza inner diamond & paver cross-joints
    ctx.beginPath();
    ctx.moveTo(px, py - hh + 2.8);
    ctx.lineTo(px + hw - 5.6, py);
    ctx.lineTo(px, py + hh - 2.8);
    ctx.lineTo(px - hw + 5.6, py);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.15)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Subtle geometric center paver dot
    if (seed % 3 === 0) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.fillRect(px - 2, py - 1, 4, 2);
    }
  } else if (variant === 'fertile') {
    // Stylized flat alluvial farmland furrows
    ctx.fillStyle = pal.fertile[seed % 2];
    ctx.fill();
    ctx.strokeStyle = '#36421a';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(190, 242, 100, 0.22)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) {
      const off = k * 3.5;
      ctx.moveTo(px - 10 + off, py - 3 + off * 0.4);
      ctx.lineTo(px + 8 + off, py + 4 + off * 0.4);
    }
    ctx.stroke();
  } else if (variant === 'rocky') {
    // Stylized flat highland slate & mineral strata flecks
    ctx.fillStyle = pal.rocky[seed % 2];
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.75;
    ctx.stroke();

    ctx.fillStyle = 'rgba(203, 213, 225, 0.18)';
    ctx.beginPath();
    ctx.moveTo(px - 7, py);
    ctx.lineTo(px - 2, py - 4);
    ctx.lineTo(px + 5, py - 1);
    ctx.lineTo(px, py + 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
    ctx.fillRect(px + 4, py + 2, 4, 2);
  } else if (variant === 'forest') {
    // Rich woodland floor with stylized flat triangular canopy accents
    ctx.fillStyle = pal.forest[seed % 2];
    ctx.fill();
    ctx.strokeStyle = '#14331b';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Flat moss highlight ring
    ctx.fillStyle = 'rgba(74, 222, 128, 0.12)';
    ctx.beginPath();
    ctx.ellipse(px, py, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Stylized flat meadow grass with organic turf bands & clover specks
    ctx.fillStyle = pal.meadow[seed % pal.meadow.length];
    ctx.fill();
    ctx.strokeStyle = pal.meadowStroke;
    ctx.lineWidth = 0.65;
    ctx.stroke();

    ctx.fillStyle = seed % 2 === 0 ? 'rgba(134, 239, 172, 0.15)' : 'rgba(163, 230, 53, 0.13)';
    const ox1 = ((seed >> 2) % 14) - 7;
    const oy1 = ((seed >> 5) % 6) - 3;
    const ox2 = ((seed >> 7) % 14) - 7;
    const oy2 = ((seed >> 9) % 6) - 3;
    ctx.fillRect(px + ox1, py + oy1, 3, 1.4);
    ctx.fillRect(px + ox2, py + oy2, 2.2, 1.2);
    ctx.fillStyle = 'rgba(16, 42, 22, 0.22)';
    ctx.fillRect(px - ox1 * 0.5, py - oy1 * 0.5, 2.6, 1.3);
  }

  // Warm sand & stone quay shoreline edge along water border
  if (eastWater || southWater) {
    ctx.strokeStyle = '#e0be83';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    if (eastWater) {
      ctx.moveTo(px + hw, py);
      ctx.lineTo(px, py + hh);
    }
    if (southWater) {
      ctx.moveTo(px, py + hh);
      ctx.lineTo(px - hw, py);
    }
    ctx.stroke();
  }
}

export function drawFlatWaterTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tileWidth: number,
  tileHeight: number,
  fillStyle: string,
  strokeStyle: string,
  tx: number,
  ty: number,
  animTime: number
): void {
  const hw = tileWidth * 0.5;
  const hh = tileHeight * 0.5;

  drawDiamondPath(ctx, px, py, hw, hh);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 0.75;
  ctx.stroke();

  // Subtle flat-style wave crest highlight every alternate checker wave cell
  if (((tx + ty) & 1) === 0) {
    const waveShift = Math.sin(animTime * 1.4 + tx * 0.6 + ty * 0.4) * 2.5;
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.22)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(px - 6 + waveShift, py);
    ctx.lineTo(px + 6 + waveShift, py - 2);
    ctx.stroke();
  }
}
