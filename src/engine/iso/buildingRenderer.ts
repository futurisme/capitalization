import { Company, Facility, ResourceDeposit } from '../../types/game';

/**
 * Zero-allocation 2.5D Isometric Geometry & Procedural Building Renderer.
 * Renders all 19 facility architectures cleanly using scalar coordinate math.
 */

const PULSE_COLOR_LUT = Array.from({ length: 33 }, (_, i) => {
  const alpha = (i / 32).toFixed(2);
  return `rgba(196, 181, 253, ${alpha})`;
});

export function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  hw: number,
  hh: number,
  h: number,
  leftCol: string,
  rightCol: string,
  roofCol: string
): void {
  ctx.beginPath();
  ctx.moveTo(px - hw, py);
  ctx.lineTo(px, py + hh);
  ctx.lineTo(px, py + hh - h);
  ctx.lineTo(px - hw, py - h);
  ctx.closePath();
  ctx.fillStyle = leftCol;
  ctx.fill();
  ctx.strokeStyle = '#090e1a';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(px, py + hh);
  ctx.lineTo(px + hw, py);
  ctx.lineTo(px + hw, py - h);
  ctx.lineTo(px, py + hh - h);
  ctx.closePath();
  ctx.fillStyle = rightCol;
  ctx.fill();
  ctx.strokeStyle = '#090e1a';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(px, py - hh - h);
  ctx.lineTo(px + hw, py - h);
  ctx.lineTo(px, py + hh - h);
  ctx.lineTo(px - hw, py - h);
  ctx.closePath();
  ctx.fillStyle = roofCol;
  ctx.fill();
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/**
 * Isometric gable pitched roof for residential cottages & townhouses.
 */
export function drawIsoPitchedRoof(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  hw: number,
  hh: number,
  roofH: number,
  leftSlopeCol: string,
  rightSlopeCol: string,
  gableCol: string
): void {
  const ridgeX = px;
  const ridgeTopY = py - roofH;
  // Left sunlit roof plane
  ctx.beginPath();
  ctx.moveTo(px - hw, py);
  ctx.lineTo(px, py + hh);
  ctx.lineTo(ridgeX, ridgeTopY + hh * 0.35);
  ctx.lineTo(px - hw * 0.45, ridgeTopY - hh * 0.25);
  ctx.closePath();
  ctx.fillStyle = leftSlopeCol;
  ctx.fill();
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // Right shaded roof plane
  ctx.beginPath();
  ctx.moveTo(px, py + hh);
  ctx.lineTo(px + hw, py);
  ctx.lineTo(px + hw * 0.45, ridgeTopY - hh * 0.25);
  ctx.lineTo(ridgeX, ridgeTopY + hh * 0.35);
  ctx.closePath();
  ctx.fillStyle = rightSlopeCol;
  ctx.fill();
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // Back ridge cap
  ctx.beginPath();
  ctx.moveTo(px - hw * 0.45, ridgeTopY - hh * 0.25);
  ctx.lineTo(px, py - hh);
  ctx.lineTo(px + hw * 0.45, ridgeTopY - hh * 0.25);
  ctx.lineTo(ridgeX, ridgeTopY + hh * 0.35);
  ctx.closePath();
  ctx.fillStyle = gableCol;
  ctx.fill();
}

/**
 * Lightweight procedural isometric tree for rural & residential landscaping.
 */
export function drawIsoTree(ctx: CanvasRenderingContext2D, tx: number, ty: number, scale = 1): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(tx + 2 * scale, ty + 1.5 * scale, 4.5 * scale, 2.2 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#5c3a21';
  ctx.fillRect(tx - 1 * scale, ty - 4 * scale, 2 * scale, 4.5 * scale);

  ctx.fillStyle = '#1e5128';
  ctx.beginPath();
  ctx.arc(tx, ty - 6.5 * scale, 4.4 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4e9f3d';
  ctx.beginPath();
  ctx.arc(tx - 1 * scale, ty - 7.5 * scale, 3 * scale, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draws natural resource deposit ground outcrop & Capitalism Lab-style compact tag.
 */
export function drawResourceDepositDecal(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  deposit: ResourceDeposit,
  showTag: boolean
): void {
  if (!deposit.discovered) return;

  if (deposit.type === 'timber') {
    drawIsoTree(ctx, px - 8, py - 1, 0.95);
    drawIsoTree(ctx, px + 6, py + 1, 1.05);
    drawIsoTree(ctx, px - 1, py + 4, 0.9);
  } else if (deposit.type === 'crude_oil') {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(px, py + 1, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(px - 3, py, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (deposit.type === 'silicon') {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(px - 7, py + 3);
    ctx.lineTo(px - 3, py - 6);
    ctx.lineTo(px + 2, py + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.moveTo(px + 1, py + 4);
    ctx.lineTo(px + 6, py - 4);
    ctx.lineTo(px + 10, py + 3);
    ctx.closePath();
    ctx.fill();
  } else if (deposit.type === 'fertile_soil') {
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(px - 10 + i * 3, py + i * 1.4);
      ctx.lineTo(px + 6 + i * 3, py - 5 + i * 1.4);
      ctx.stroke();
    }
  } else {
    // iron_ore / coal rock seam
    drawIsoBox(ctx, px - 5, py + 2, 6, 3, 5, '#334155', '#475569', '#94a3b8');
    drawIsoBox(ctx, px + 5, py + 1, 5, 2.5, 4, '#1e293b', '#334155', '#cbd5e1');
  }

  if (showTag) {
    const tag =
      deposit.type === 'iron_ore'
        ? `COAL ${deposit.richness}%`
        : deposit.type === 'crude_oil'
        ? `OIL ${deposit.richness}%`
        : deposit.type === 'silicon'
        ? `SIL ${deposit.richness}%`
        : deposit.type === 'timber'
        ? `TIMBER ${deposit.richness}%`
        : `AGRI ${deposit.richness}%`;
    const bg =
      deposit.type === 'crude_oil'
        ? '#78350f'
        : deposit.type === 'silicon'
        ? '#0369a1'
        : deposit.type === 'timber' || deposit.type === 'fertile_soil'
        ? '#166534'
        : '#334155';
    drawTickerBadge(ctx, px, py - 18, tag, bg);
  }
}

/**
 * Miniature Capitalism Lab-style "FOR SALE" yard placard on purchasable vacant lots.
 */
export function drawForSaleMarker(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(px, py + 3);
  ctx.lineTo(px, py - 8);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px - 11, py - 16, 22, 9);
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(px - 11, py - 16, 22, 9);

  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 5px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FOR SALE', px, py - 11.4);
}

/**
 * Zero-allocation isometric-aligned wall quad.
 * u0..u1 spans 0..1 across wall width; z0..z1 spans vertical height from base ground edge.
 */
export function drawIsoWallQuad(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  hw: number,
  hh: number,
  side: 'left' | 'right',
  u0: number,
  u1: number,
  z0: number,
  z1: number,
  fillCol: string,
  strokeCol?: string
): void {
  let x0: number;
  let x1: number;
  let y00: number;
  let y10: number;

  if (side === 'left') {
    x0 = px - hw + u0 * hw;
    x1 = px - hw + u1 * hw;
    y00 = py + u0 * hh;
    y10 = py + u1 * hh;
  } else {
    x0 = px + u0 * hw;
    x1 = px + u1 * hw;
    y00 = py + hh - u0 * hh;
    y10 = py + hh - u1 * hh;
  }

  ctx.beginPath();
  ctx.moveTo(x0, y00 - z0);
  ctx.lineTo(x1, y10 - z0);
  ctx.lineTo(x1, y10 - z1);
  ctx.lineTo(x0, y00 - z1);
  ctx.closePath();
  ctx.fillStyle = fillCol;
  ctx.fill();
  if (strokeCol) {
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

export function drawIsoCylinder(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  h: number,
  bodyCol: string,
  topCol: string,
  strokeCol = '#0f172a'
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(cx - rx, cy - h);
  ctx.lineTo(cx + rx, cy - h);
  ctx.closePath();
  ctx.fillStyle = bodyCol;
  ctx.fill();
  ctx.strokeStyle = strokeCol;
  ctx.lineWidth = 0.7;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, cy - h, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = topCol;
  ctx.fill();
  ctx.strokeStyle = strokeCol;
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

export function drawTickerBadge(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  text: string,
  color: string
): void {
  const pillW = Math.max(32, text.length * 4.7 + 8);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(px - pillW * 0.5, py, pillW, 9.5, 2.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 0.55;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 6.5px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px, py + 4.8);
}

/**
 * Renders 19 distinct 2.5D facility & residential architectures and returns total rendered height.
 */
export function drawDiverseFacility(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tileWidth: number,
  tileHeight: number,
  animTime: number,
  fac: Facility,
  comp: Company | undefined,
  emitSmokeNow: boolean,
  showBadge: boolean,
  onEmitSmoke: (sx: number, sy: number, jitter: number) => void
): number {
  const hw = tileWidth / 2 - 4;
  const hh = tileHeight / 2 - 2;
  const compColor = comp?.color || '#0284c7';
  const accentColor = comp?.accentColor || '#38bdf8';

  // 0. Permukiman Warga Mandiri (Automated Resident Housing - 3 Tiers)
  if (fac.type === 'resident_house') {
    const tier = fac.housingTier || Math.min(3, Math.max(1, fac.level || 1));
    if (tier === 1) {
      const w = hw * 0.62;
      const d = hh * 0.62;
      const wallH = 11;
      drawIsoTree(ctx, px - 14, py + 1, 0.78);
      drawIsoBox(ctx, px + 2, py + 1, w, d, wallH, '#e7dcc8', '#d4c3a3', '#b45309');
      drawIsoWallQuad(ctx, px + 2, py + 1, w, d, 'left', 0.25, 0.48, 3, 7, '#1e293b');
      drawIsoWallQuad(ctx, px + 2, py + 1, w, d, 'right', 0.3, 0.68, 2, 7, '#fef3c7');
      drawIsoPitchedRoof(ctx, px + 2, py + 1 - wallH, w * 1.05, d * 1.05, 9, '#dc2626', '#991b1b', '#b91c1c');
      if (showBadge) {
        drawTickerBadge(ctx, px, py - wallH - 18, 'WARGA', '#b45309');
      }
      return wallH + 16;
    }
    if (tier === 2) {
      const w = hw * 0.68;
      const d = hh * 0.68;
      const wallH = 17;
      drawIsoBox(ctx, px - 5, py, w * 0.65, d * 0.65, wallH, '#cbd5e1', '#e2e8f0', '#9a3412');
      drawIsoPitchedRoof(ctx, px - 5, py - wallH, w * 0.68, d * 0.68, 8, '#c2410c', '#9a3412', '#7c2d12');
      drawIsoBox(ctx, px + 7, py + 2, w * 0.65, d * 0.65, wallH - 2, '#d6d3d1', '#e7e5e4', '#b45309');
      drawIsoPitchedRoof(ctx, px + 7, py + 2 - (wallH - 2), w * 0.68, d * 0.68, 7, '#d97706', '#b45309', '#92400e');
      drawIsoWallQuad(ctx, px - 5, py, w * 0.65, d * 0.65, 'left', 0.2, 0.8, 4, 8, '#fde68a');
      drawIsoWallQuad(ctx, px + 7, py + 2, w * 0.65, d * 0.65, 'right', 0.2, 0.8, 9, 13, '#fef3c7');
      if (showBadge) {
        drawTickerBadge(ctx, px, py - wallH - 18, 'WARGA II', '#b45309');
      }
      return wallH + 16;
    }
    // Tier 3 Suburban Villa / Residence
    const w = hw * 0.82;
    const d = hh * 0.82;
    const wallH = 21;
    drawIsoTree(ctx, px - 17, py + 2, 0.85);
    drawIsoTree(ctx, px + 17, py + 1, 0.85);
    drawIsoBox(ctx, px, py + 1, w, d, wallH, '#f5ebd6', '#e7d7bc', '#92400e');
    drawIsoWallQuad(ctx, px, py + 1, w, d, 'left', 0.16, 0.44, 4, 9, '#fef08a');
    drawIsoWallQuad(ctx, px, py + 1, w, d, 'left', 0.56, 0.84, 4, 9, '#fde047');
    drawIsoWallQuad(ctx, px, py + 1, w, d, 'left', 0.16, 0.84, 13, 17, '#bae6fd');
    drawIsoWallQuad(ctx, px, py + 1, w, d, 'right', 0.18, 0.82, 13, 17, '#e0f2fe');
    drawIsoPitchedRoof(ctx, px, py + 1 - wallH, w * 1.04, d * 1.04, 11, '#b45309', '#78350f', '#92400e');
    if (showBadge) {
      drawTickerBadge(ctx, px, py - wallH - 20, 'VILLA', '#92400e');
    }
    return wallH + 18;
  }

  // 1. Minimarket 24 Jam
  if (fac.type === 'store_convenience') {
    const bHeight = 26 + (fac.level - 1) * 4;
    const w = hw * 0.92;
    const d = hh * 0.92;
    drawIsoBox(ctx, px, py, w, d, bHeight, '#1e293b', '#334155', '#475569');
    drawIsoWallQuad(ctx, px, py, w, d, 'left', 0.14, 0.86, 2, 10, '#fef08a');
    drawIsoWallQuad(ctx, px, py, w, d, 'right', 0.16, 0.56, 1, 10, '#bae6fd');
    drawIsoWallQuad(ctx, px, py, w, d, 'left', 0.08, 0.92, 11, 16, '#10b981', '#065f46');
    drawIsoWallQuad(ctx, px, py, w, d, 'right', 0.08, 0.92, 11, 15, compColor);
    drawIsoBox(ctx, px - 2, py - bHeight - 1, 7, 3.5, 4, '#475569', '#64748b', '#94a3b8');
    if (showBadge) {
      drawTickerBadge(ctx, px, py - bHeight - 19, comp?.ticker || 'MART', compColor);
    }
    return bHeight + 12;
  }

  // 2. Mega Store Elektronik
  if (fac.type === 'store_electronics') {
    const bHeight = 36 + (fac.level - 1) * 5;
    const w = hw * 0.94;
    const d = hh * 0.94;
    drawIsoBox(ctx, px, py, w, d, bHeight, '#0f172a', '#1e293b', '#0c4a6e');
    drawIsoWallQuad(ctx, px, py, w, d, 'left', 0.12, 0.88, 3, 13, '#38bdf8');
    drawIsoWallQuad(ctx, px, py, w, d, 'right', 0.12, 0.88, 3, 13, '#0ea5e9');
    drawIsoWallQuad(ctx, px, py, w, d, 'left', 0.1, 0.9, 18, 25, '#0284c7');
    drawIsoWallQuad(ctx, px, py, w, d, 'right', 0.1, 0.9, 18, 25, '#38bdf8');
    drawIsoBox(ctx, px, py - bHeight, hw * 0.52, hh * 0.52, 6, '#0284c7', '#0369a1', '#38bdf8');
    if (showBadge) {
      drawTickerBadge(ctx, px, py - bHeight - 20, comp?.ticker || 'TECH', compColor);
    }
    return bHeight + 14;
  }

  // 3. Department Store Megamall
  if (fac.type === 'store_department') {
    const h1 = 22 + (fac.level - 1) * 3;
    const h2 = 18 + (fac.level - 1) * 3;
    const totalH = h1 + h2;
    drawIsoBox(ctx, px, py, hw, hh, h1, '#1e1b4b', '#312e81', '#4338ca');
    drawIsoWallQuad(ctx, px, py, hw, hh, 'left', 0.1, 0.9, 2, 11, '#c7d2fe');
    drawIsoWallQuad(ctx, px, py, hw, hh, 'right', 0.1, 0.9, 2, 11, '#a5b4fc');
    drawIsoBox(ctx, px, py - h1, hw * 0.72, hh * 0.72, h2, '#312e81', '#3730a3', '#4f46e5');
    drawIsoWallQuad(ctx, px, py - h1, hw * 0.72, hh * 0.72, 'left', 0.15, 0.85, 3, 11, '#e0e7ff');
    ctx.beginPath();
    ctx.ellipse(px, py - totalH - 1, 10, 5, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = '#a5b4fc';
    ctx.fill();
    ctx.strokeStyle = '#e0e7ff';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (showBadge) {
      drawTickerBadge(ctx, px, py - totalH - 19, comp?.ticker || 'MALL', compColor);
    }
    return totalH + 12;
  }

  // 4. Showroom & Dealer Otomotif
  if (fac.type === 'store_auto') {
    const bHeight = 28 + (fac.level - 1) * 4;
    const w = hw * 0.96;
    const d = hh * 0.96;
    drawIsoBox(ctx, px, py, w, d, bHeight, '#0c4a6e', '#0369a1', '#cbd5e1');
    drawIsoWallQuad(ctx, px, py, w, d, 'left', 0.1, 0.9, 2, bHeight - 6, '#bae6fd', '#0284c7');
    drawIsoWallQuad(ctx, px, py, w, d, 'right', 0.1, 0.9, 2, bHeight - 6, '#e0f2fe', '#0284c7');
    drawIsoCylinder(ctx, px, py - bHeight - 1, 9, 4.5, 3, '#1e293b', '#38bdf8');
    drawIsoBox(ctx, px, py - bHeight - 4, 6, 3, 4, '#0f172a', accentColor, '#f8fafc');
    if (showBadge) {
      drawTickerBadge(ctx, px, py - bHeight - 20, comp?.ticker || 'AUTO', compColor);
    }
    return bHeight + 14;
  }

  // 5. Apotek & Klinik Kesehatan
  if (fac.type === 'store_pharmacy') {
    const bHeight = 28 + (fac.level - 1) * 4;
    const w = hw * 0.92;
    const d = hh * 0.92;
    drawIsoBox(ctx, px, py, w, d, bHeight, '#cbd5e1', '#e2e8f0', '#f8fafc');
    drawIsoWallQuad(ctx, px, py, w, d, 'left', 0.14, 0.86, 2, 11, '#a7f3d0', '#059669');
    drawIsoWallQuad(ctx, px, py, w, d, 'right', 0.14, 0.86, 2, 11, '#d1fae5', '#059669');
    drawIsoWallQuad(ctx, px, py, w, d, 'left', 0.06, 0.94, 13, 19, '#059669');
    drawIsoWallQuad(ctx, px, py, w, d, 'right', 0.06, 0.94, 13, 19, '#10b981');
    const crossY = py - bHeight - 6;
    ctx.fillStyle = '#059669';
    ctx.fillRect(px - 6, crossY - 3, 12, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 1.4, crossY - 2, 2.8, 4.2);
    ctx.fillRect(px - 3, crossY - 0.9, 6, 1.8);
    if (showBadge) {
      drawTickerBadge(ctx, px, crossY - 16, comp?.ticker || 'MEDX', compColor);
    }
    return bHeight + 14;
  }

  // 6. Menara Apartemen Swasta
  if (fac.type === 'apartment_complex') {
    const podH = 12;
    const shaftH = 38 + (fac.level - 1) * 6;
    const totalH = podH + shaftH;
    const sw = hw * 0.82;
    const sd = hh * 0.82;
    drawIsoBox(ctx, px, py, hw * 0.96, hh * 0.96, podH, '#334155', '#475569', '#64748b');
    drawIsoBox(ctx, px, py - podH, sw, sd, shaftH, '#1e293b', '#334155', '#10b981');
    const floors = Math.floor(shaftH / 8);
    for (let f = 0; f < floors; f++) {
      const z0 = 3 + f * 7.5;
      const z1 = z0 + 3.5;
      drawIsoWallQuad(ctx, px, py - podH, sw, sd, 'left', 0.14, 0.45, z0, z1, '#fde68a');
      drawIsoWallQuad(ctx, px, py - podH, sw, sd, 'left', 0.55, 0.86, z0, z1, '#fcd34d');
      drawIsoWallQuad(ctx, px, py - podH, sw, sd, 'right', 0.14, 0.45, z0, z1, '#fef08a');
      drawIsoWallQuad(ctx, px, py - podH, sw, sd, 'right', 0.55, 0.86, z0, z1, '#fde047');
    }
    drawIsoBox(ctx, px, py - totalH - 1, hw * 0.45, hh * 0.45, 6, '#065f46', '#047857', '#34d399');
    if (showBadge) {
      drawTickerBadge(ctx, px, py - totalH - 20, comp?.ticker || 'APT', compColor);
    }
    return totalH + 14;
  }

  // 7. Menara Perkantoran CBD
  if (fac.type === 'commercial_tower') {
    const podH = 14;
    const shaftH = 48 + (fac.level - 1) * 7;
    const crownH = 10;
    const totalH = podH + shaftH + crownH;
    const sw = hw * 0.82;
    const sd = hh * 0.82;
    drawIsoBox(ctx, px, py, hw * 0.98, hh * 0.98, podH, '#0f172a', '#1e293b', '#38bdf8');
    drawIsoBox(ctx, px, py - podH, sw, sd, shaftH, '#0c4a6e', '#0369a1', '#0ea5e9');
    const floors = Math.floor(shaftH / 9);
    for (let f = 0; f < floors; f++) {
      const z0 = 3 + f * 8.5;
      const z1 = z0 + 4.5;
      drawIsoWallQuad(ctx, px, py - podH, sw, sd, 'left', 0.12, 0.88, z0, z1, '#7dd3fc');
      drawIsoWallQuad(ctx, px, py - podH, sw, sd, 'right', 0.12, 0.88, z0, z1, '#bae6fd');
    }
    drawIsoBox(ctx, px, py - podH - shaftH, hw * 0.55, hh * 0.55, crownH, '#0284c7', '#38bdf8', '#e0f2fe');
    if (showBadge) {
      drawTickerBadge(ctx, px, py - totalH - 15, comp?.ticker || 'CBD', compColor);
    }
    return totalH + 14;
  }

  // 8. Rusunawa & Perumahan Pemkot
  if (fac.type === 'civic_housing') {
    const bHeight = 25 + (fac.level - 1) * 3;
    drawIsoBox(ctx, px - 5, py - 2, hw * 0.58, hh * 0.58, bHeight, '#7c2d12', '#9a3412', '#d97706');
    drawIsoBox(ctx, px + 6, py + 2, hw * 0.54, hh * 0.54, bHeight - 4, '#9a3412', '#c2410c', '#f59e0b');
    drawIsoWallQuad(ctx, px - 5, py - 2, hw * 0.58, hh * 0.58, 'left', 0.18, 0.82, 5, 10, '#fef3c7');
    drawIsoWallQuad(ctx, px - 5, py - 2, hw * 0.58, hh * 0.58, 'left', 0.18, 0.82, 14, 19, '#fde68a');
    drawIsoWallQuad(ctx, px + 6, py + 2, hw * 0.54, hh * 0.54, 'right', 0.18, 0.82, 5, 10, '#fef3c7');
    drawIsoWallQuad(ctx, px + 6, py + 2, hw * 0.54, hh * 0.54, 'right', 0.18, 0.82, 13, 18, '#fde68a');
    if (showBadge) {
      drawTickerBadge(ctx, px, py - bHeight - 17, 'PEMKOT', '#0f766e');
    }
    return bHeight + 12;
  }

  // 9. Pembangkit Energi & Baterai Hijau
  if (fac.type === 'power_plant_green') {
    const bHeight = 16 + (fac.level - 1) * 3;
    drawIsoBox(ctx, px - 4, py - 1, hw * 0.65, hh * 0.65, bHeight, '#064e3b', '#047857', '#1e3a8a');
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(px - 10, py - bHeight - 2);
    ctx.lineTo(px + 2, py - bHeight + 4);
    ctx.moveTo(px - 6, py - bHeight - 5);
    ctx.lineTo(px + 6, py - bHeight + 1);
    ctx.stroke();
    drawIsoCylinder(ctx, px + 11, py - 1, 4.5, 2.5, bHeight + 6, '#e2e8f0', '#34d399');
    drawIsoCylinder(ctx, px + 11, py + 6, 4.5, 2.5, bHeight + 4, '#cbd5e1', '#10b981');
    if (showBadge) {
      drawTickerBadge(ctx, px, py - bHeight - 20, comp?.ticker || 'VOLT', compColor);
    }
    return bHeight + 14;
  }

  // 10. Pabrik Pengolahan Dasar
  if (fac.type === 'factory_processing') {
    const bHeight = 30 + (fac.level - 1) * 4;
    drawIsoBox(ctx, px + 3, py, hw * 0.78, hh * 0.78, bHeight, '#18181b', '#27272a', '#3f3f46');
    drawIsoWallQuad(ctx, px + 3, py, hw * 0.78, hh * 0.78, 'right', 0.25, 0.75, 1, 11, '#f59e0b', '#78350f');
    drawIsoCylinder(ctx, px - hw * 0.56, py - 2, 5, 2.8, 22, '#52525b', '#a1a1aa');
    drawIsoCylinder(ctx, px - hw * 0.34, py + 4, 5, 2.8, 20, '#3f3f46', '#71717a');
    const stackX = px + hw * 0.38;
    const stackBaseY = py - bHeight - 1;
    const stackH = 16;
    drawIsoCylinder(ctx, stackX, stackBaseY, 3, 1.8, stackH, '#52525b', '#ef4444');
    if (emitSmokeNow) {
      const jitter = ((fac.tileX * 7 + Math.round(animTime * 3)) % 5) - 2;
      onEmitSmoke(stackX, stackBaseY - stackH, jitter);
    }
    if (showBadge) {
      drawTickerBadge(ctx, px, py - bHeight - stackH - 12, comp?.ticker || 'PROC', compColor);
    }
    return bHeight + stackH + 6;
  }

  // 11. Pabrik Perakitan Presisi
  if (fac.type === 'factory_assembly') {
    const bHeight = 32 + (fac.level - 1) * 4;
    const w = hw * 0.94;
    const d = hh * 0.94;
    drawIsoBox(ctx, px, py, w, d, bHeight, '#0f172a', '#1e3a5f', '#1d4ed8');
    drawIsoWallQuad(ctx, px, py, w, d, 'left', 0.14, 0.86, 15, 22, '#60a5fa');
    drawIsoWallQuad(ctx, px, py, w, d, 'right', 0.16, 0.44, 1, 11, '#3b82f6');
    drawIsoWallQuad(ctx, px, py, w, d, 'right', 0.56, 0.84, 1, 11, '#f97316');
    for (let i = -1; i <= 1; i++) {
      const rx = px + i * 7;
      const ry = py - bHeight - Math.abs(i) * 2;
      drawIsoBox(ctx, rx, ry, 5, 6, 7, '#1e40af', '#2563eb', '#93c5fd');
    }
    if (showBadge) {
      drawTickerBadge(ctx, px, py - bHeight - 20, comp?.ticker || 'MFG', compColor);
    }
    return bHeight + 14;
  }

  // 12. Pusat Logistik & Gudang
  if (fac.type === 'warehouse_logistics') {
    const bHeight = 20 + (fac.level - 1) * 3;
    const w = hw * 0.88;
    const d = hh * 0.88;
    drawIsoBox(ctx, px - 2, py - 1, w, d, bHeight, '#334155', '#475569', '#64748b');
    drawIsoWallQuad(ctx, px - 2, py - 1, w, d, 'right', 0.12, 0.34, 1, 9, '#0f172a', '#f59e0b');
    drawIsoWallQuad(ctx, px - 2, py - 1, w, d, 'right', 0.40, 0.62, 1, 9, '#0f172a', '#f59e0b');
    drawIsoWallQuad(ctx, px - 2, py - 1, w, d, 'right', 0.68, 0.90, 1, 9, '#0f172a', '#f59e0b');
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(px - 10 + i * 6, py - bHeight - 3 + i * 3);
      ctx.lineTo(px + 4 + i * 6, py - bHeight - 10 + i * 3);
      ctx.stroke();
    }
    drawIsoBox(ctx, px + 11, py + 5, 6, 3, 5, '#0369a1', '#0284c7', '#38bdf8');
    if (showBadge) {
      drawTickerBadge(ctx, px, py - bHeight - 19, comp?.ticker || 'LOG', compColor);
    }
    return bHeight + 12;
  }

  // 13. Perkebunan & Peternakan
  if (fac.type === 'farm_agriculture') {
    const bHeight = 19 + (fac.level - 1) * 3;
    ctx.strokeStyle = '#84cc16';
    ctx.lineWidth = 1.4;
    for (let r = -1; r <= 2; r++) {
      ctx.beginPath();
      ctx.moveTo(px - 16 + r * 4, py + 2 + r * 2);
      ctx.lineTo(px - 4 + r * 4, py + 8 + r * 2);
      ctx.stroke();
    }
    drawIsoBox(ctx, px - 3, py - 2, hw * 0.58, hh * 0.58, bHeight, '#991b1b', '#b91c1c', '#dc2626');
    drawIsoWallQuad(ctx, px - 3, py - 2, hw * 0.58, hh * 0.58, 'right', 0.3, 0.7, 1, 9, '#fef2f2', '#7f1d1d');
    drawIsoCylinder(ctx, px + 11, py - 2, 4.5, 2.4, bHeight + 6, '#94a3b8', '#e2e8f0');
    const wmX = px + hw * 0.58;
    const wmBaseY = py + 3;
    const wmTopY = wmBaseY - 26;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(wmX, wmBaseY);
    ctx.lineTo(wmX, wmTopY);
    ctx.stroke();
    const rot = animTime * 2.4;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let b = 0; b < 4; b++) {
      const a = rot + (b * Math.PI) / 2;
      ctx.moveTo(wmX, wmTopY);
      ctx.lineTo(wmX + Math.cos(a) * 6.5, wmTopY + Math.sin(a) * 6.5);
    }
    ctx.stroke();
    if (showBadge) {
      drawTickerBadge(ctx, px, py - Math.max(bHeight + 25, 44), comp?.ticker || 'FARM', compColor);
    }
    return Math.max(bHeight + 16, 34);
  }

  // 14. Tambang Mineral & Minyak
  if (fac.type === 'mine_extraction') {
    const bHeight = 22 + (fac.level - 1) * 3;
    ctx.beginPath();
    ctx.moveTo(px, py - hh * 0.75);
    ctx.lineTo(px + hw * 0.75, py);
    ctx.lineTo(px, py + hh * 0.75);
    ctx.lineTo(px - hw * 0.75, py);
    ctx.closePath();
    ctx.fillStyle = '#18181b';
    ctx.fill();
    ctx.strokeStyle = '#71717a';
    ctx.lineWidth = 1;
    ctx.stroke();

    drawIsoBox(ctx, px - 5, py - 1, hw * 0.56, hh * 0.56, bHeight, '#27272a', '#3f3f46', '#52525b');
    const rigTopY = py - bHeight - 16;
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px - 10, py - bHeight);
    ctx.lineTo(px - 5, rigTopY);
    ctx.lineTo(px, py - bHeight);
    ctx.moveTo(px - 8, py - bHeight - 8);
    ctx.lineTo(px - 2, py - bHeight - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px - 5, rigTopY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    drawIsoCylinder(ctx, px + 11, py + 2, 4, 2.2, 10, '#b45309', '#f59e0b');
    if (showBadge) {
      drawTickerBadge(ctx, px, rigTopY - 13, comp?.ticker || 'MINE', compColor);
    }
    return bHeight + 20;
  }

  // 15. Perusahaan Software & Cloud
  if (fac.type === 'tech_software') {
    const bHeight = 34 + (fac.level - 1) * 5;
    const w = hw * 0.92;
    const d = hh * 0.92;
    drawIsoBox(ctx, px, py, w, d, bHeight, '#064e3b', '#047857', '#059669');
    drawIsoWallQuad(ctx, px, py, w, d, 'left', 0.14, 0.86, 6, 12, '#34d399');
    drawIsoWallQuad(ctx, px, py, w, d, 'left', 0.14, 0.86, 17, 23, '#6ee7b7');
    drawIsoWallQuad(ctx, px, py, w, d, 'right', 0.14, 0.86, 6, 12, '#2dd4bf');
    drawIsoWallQuad(ctx, px, py, w, d, 'right', 0.14, 0.86, 17, 23, '#5eead4');
    drawIsoBox(ctx, px - 2, py - bHeight - 1, hw * 0.55, hh * 0.55, 10, '#022c22', '#065f46', '#10b981');
    if (showBadge) {
      drawTickerBadge(ctx, px, py - bHeight - 22, comp?.ticker || 'SOFT', compColor);
    }
    return bHeight + 16;
  }

  // 16. Stasiun Media & Telekomunikasi
  if (fac.type === 'media_telecom') {
    const bHeight = 28 + (fac.level - 1) * 4;
    drawIsoBox(ctx, px, py, hw * 0.84, hh * 0.84, bHeight, '#4c1d95', '#5b21b6', '#6d28d9');
    drawIsoWallQuad(ctx, px, py, hw * 0.84, hh * 0.84, 'left', 0.15, 0.85, 6, 14, '#c4b5fd');
    drawIsoWallQuad(ctx, px, py, hw * 0.84, hh * 0.84, 'right', 0.15, 0.85, 6, 14, '#ddd6fe');
    const mastBase = py - bHeight - 2;
    const mastTop = mastBase - 26;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px - 5, mastBase);
    ctx.lineTo(px, mastTop);
    ctx.lineTo(px + 5, mastBase);
    ctx.moveTo(px - 3, mastBase - 10);
    ctx.lineTo(px + 3, mastBase - 10);
    ctx.stroke();
    const pulse = (animTime * 1.4) % 1;
    const pulseIdx = Math.max(0, Math.min(32, Math.round((1 - pulse) * 32)));
    ctx.strokeStyle = PULSE_COLOR_LUT[pulseIdx];
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(px, mastTop, 2.5 + pulse * 8, 0, Math.PI * 2);
    ctx.stroke();
    if (showBadge) {
      drawTickerBadge(ctx, px, mastTop - 16, comp?.ticker || 'MEDI', compColor);
    }
    return bHeight + 30;
  }

  // 17. Pusat Riset & Inovasi (R&D)
  if (fac.type === 'rd_center') {
    const baseH = 22 + (fac.level - 1) * 4;
    drawIsoBox(ctx, px, py, hw * 0.94, hh * 0.94, baseH, '#082f49', '#0369a1', '#0284c7');
    drawIsoWallQuad(ctx, px, py, hw * 0.94, hh * 0.94, 'left', 0.14, 0.86, 5, 13, '#bae6fd');
    drawIsoWallQuad(ctx, px, py, hw * 0.94, hh * 0.94, 'right', 0.14, 0.86, 5, 13, '#7dd3fc');
    const roofY = py - baseH - 1;
    ctx.beginPath();
    ctx.ellipse(px, roofY, 12, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0c4a6e';
    ctx.fill();
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, roofY, 10, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (showBadge) {
      drawTickerBadge(ctx, px, roofY - 21, comp?.ticker || 'R&D', compColor);
    }
    return baseH + 14;
  }

  // 18. Gedung Menara Kantor Pusat (Corporate HQ)
  const podiumH = 18;
  const shaftH = 44 + (fac.level - 1) * 7;
  const totalH = podiumH + shaftH;
  drawIsoBox(ctx, px, py, hw * 0.98, hh * 0.98, podiumH, '#0f172a', '#1e293b', '#334155');
  drawIsoBox(ctx, px, py - podiumH, hw * 0.78, hh * 0.78, shaftH, '#0f172a', '#1e293b', '#475569');
  const floors = Math.floor(shaftH / 10);
  for (let f = 0; f < floors; f++) {
    const z0 = 4 + f * 9;
    const z1 = z0 + 4;
    drawIsoWallQuad(ctx, px, py - podiumH, hw * 0.78, hh * 0.78, 'left', 0.14, 0.86, z0, z1, '#67e8f9');
    drawIsoWallQuad(ctx, px, py - podiumH, hw * 0.78, hh * 0.78, 'right', 0.14, 0.86, z0, z1, '#a5f3fc');
  }
  const roofTop = py - totalH - 1;
  ctx.beginPath();
  ctx.ellipse(px, roofTop, 9, 4.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  const spireTop = roofTop - 16;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, roofTop);
  ctx.lineTo(px, spireTop);
  ctx.stroke();
  if (Math.sin(animTime * 4) > 0) {
    ctx.beginPath();
    ctx.arc(px, spireTop, 2.3, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
  }
  if (showBadge) {
    drawTickerBadge(ctx, px, spireTop - 14, comp?.ticker || 'HQ', compColor);
  }
  return totalH + 20;
}
