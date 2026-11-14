/**
 * Full-Bleed Fortune-500 Corporate & Civic Brand Tile Renderer (192x192 coordinate space -> 256x256 Hi-DPI)
 * Eliminates double-frame clutter so logos fill rounded CSS containers cleanly edge-to-edge
 * with balanced 22% safe breathing space around each bespoke vector emblem.
 */

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawTileCanvas(
  ctx: CanvasRenderingContext2D,
  topCol: string,
  bottomCol: string,
  glowCol: string
) {
  const bg = ctx.createLinearGradient(0, 0, 192, 192);
  bg.addColorStop(0, topCol);
  bg.addColorStop(1, bottomCol);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 192, 192);

  // Soft overhead studio spotlight
  const rad = ctx.createRadialGradient(96, 52, 8, 96, 96, 116);
  rad.addColorStop(0, glowCol);
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 192, 192);

  // Subtle top bevel sheen
  const sheen = ctx.createLinearGradient(0, 0, 0, 76);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 192, 76);
}

export function drawCompanyLogoVisual(
  ctx: CanvasRenderingContext2D,
  companyId: string,
  personality?: string,
  color = '#0284c7',
  accentColor = '#38bdf8'
) {
  ctx.save();

  switch (companyId) {
    case 'comp_player': {
      // NUSA: Royal Sapphire & Gold Archipelago Crown + Precision "N" Ribbon
      drawTileCanvas(ctx, '#0369a1', '#0f172a', 'rgba(56, 189, 248, 0.35)');
      const gold = ctx.createLinearGradient(54, 42, 138, 100);
      gold.addColorStop(0, '#fef08a');
      gold.addColorStop(0.55, '#f59e0b');
      gold.addColorStop(1, '#b45309');
      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.moveTo(52, 84);
      ctx.lineTo(64, 46);
      ctx.lineTo(82, 68);
      ctx.lineTo(96, 40);
      ctx.lineTo(110, 68);
      ctx.lineTo(128, 46);
      ctx.lineTo(140, 84);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(58, 144);
      ctx.lineTo(58, 96);
      ctx.lineTo(76, 96);
      ctx.lineTo(116, 128);
      ctx.lineTo(116, 96);
      ctx.lineTo(134, 96);
      ctx.lineTo(134, 144);
      ctx.lineTo(116, 144);
      ctx.lineTo(76, 112);
      ctx.lineTo(76, 144);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'comp_apex': {
      // APEX: Architectural Crimson Ribbon Delta "A" with Golden Summit Spark
      drawTileCanvas(ctx, '#b91c1c', '#1a060a', 'rgba(248, 113, 113, 0.32)');
      const rib = ctx.createLinearGradient(44, 40, 148, 152);
      rib.addColorStop(0, '#ffffff');
      rib.addColorStop(1, '#fecaca');
      ctx.fillStyle = rib;
      ctx.beginPath();
      ctx.moveTo(96, 38);
      ctx.lineTo(148, 146);
      ctx.lineTo(118, 146);
      ctx.lineTo(96, 94);
      ctx.lineTo(74, 146);
      ctx.lineTo(44, 146);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(96, 108);
      ctx.lineTo(111, 128);
      ctx.lineTo(96, 148);
      ctx.lineTo(81, 128);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'comp_nova': {
      // NOVA: Deep Violet Quantum Orbits & Plasma Core
      drawTileCanvas(ctx, '#6d28d9', '#120826', 'rgba(196, 181, 253, 0.35)');
      ctx.strokeStyle = '#e9d5ff';
      ctx.lineWidth = 5;
      for (const ang of [-0.55, 0.55, 1.57]) {
        ctx.save();
        ctx.translate(96, 96);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(0, 0, 56, 19, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const core = ctx.createRadialGradient(94, 94, 2, 96, 96, 18);
      core.addColorStop(0, '#ffffff');
      core.addColorStop(0.55, '#f0abfc');
      core.addColorStop(1, '#7c3aed');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(96, 96, 17, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'comp_omni': {
      // OMNI: Warm Forged Amber Precision Turbine Gear & Anchor Bar
      drawTileCanvas(ctx, '#b45309', '#1c1205', 'rgba(251, 191, 36, 0.3)');
      ctx.save();
      ctx.translate(96, 96);
      ctx.fillStyle = '#fef3c7';
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((Math.PI / 4) * i);
        rr(ctx, -9, -56, 18, 16, 4);
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f59e0b';
      rr(ctx, -5, -26, 10, 52, 4);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'comp_land': {
      // LAND: Sinar Properti Agung — Luxury Teal-Gold Art-Deco Twin Towers
      drawTileCanvas(ctx, '#0f766e', '#041f1e', 'rgba(45, 212, 191, 0.3)');
      ctx.fillStyle = '#ccfbf1';
      ctx.beginPath();
      ctx.moveTo(54, 148);
      ctx.lineTo(54, 62);
      ctx.lineTo(74, 38);
      ctx.lineTo(94, 62);
      ctx.lineTo(94, 148);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#2dd4bf';
      rr(ctx, 100, 74, 38, 74, 4);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      for (let wy = 70; wy <= 130; wy += 13) {
        ctx.fillRect(64, wy, 20, 5);
        if (wy >= 83) ctx.fillRect(108, wy, 22, 5);
      }
      break;
    }

    case 'comp_medx': {
      // MEDX: BioMedika Farma — Clean Clinical Emerald Cross + Pulse Wave
      drawTileCanvas(ctx, '#059669', '#032018', 'rgba(110, 231, 183, 0.32)');
      ctx.fillStyle = '#ecfdf5';
      rr(ctx, 81, 42, 30, 108, 8);
      ctx.fill();
      rr(ctx, 42, 81, 108, 30, 8);
      ctx.fill();
      ctx.strokeStyle = '#047857';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(50, 96);
      ctx.lineTo(74, 96);
      ctx.lineTo(86, 72);
      ctx.lineTo(104, 120);
      ctx.lineTo(116, 96);
      ctx.lineTo(142, 96);
      ctx.stroke();
      break;
    }

    case 'comp_agro': {
      // AGRO: TerraAgro — Golden Harvest Sun & Sculpted Emerald Twin Leaves
      drawTileCanvas(ctx, '#15803d', '#061c0d', 'rgba(134, 239, 172, 0.3)');
      const sun = ctx.createRadialGradient(96, 74, 4, 96, 74, 32);
      sun.addColorStop(0, '#fef08a');
      sun.addColorStop(1, '#f59e0b');
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(96, 74, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ecfdf5';
      ctx.beginPath();
      ctx.moveTo(96, 150);
      ctx.quadraticCurveTo(42, 126, 46, 74);
      ctx.quadraticCurveTo(86, 92, 96, 150);
      ctx.fill();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.moveTo(96, 150);
      ctx.quadraticCurveTo(150, 126, 146, 74);
      ctx.quadraticCurveTo(106, 92, 96, 150);
      ctx.fill();
      break;
    }

    case 'comp_velo': {
      // VELO: VeloMotors — Aerodynamic Brushed Chrome "V" Mobility Wings
      drawTileCanvas(ctx, '#0891b2', '#061924', 'rgba(103, 232, 249, 0.34)');
      const vg = ctx.createLinearGradient(42, 50, 150, 146);
      vg.addColorStop(0, '#ffffff');
      vg.addColorStop(0.5, '#a5f3fc');
      vg.addColorStop(1, '#0e7490');
      ctx.fillStyle = vg;
      ctx.beginPath();
      ctx.moveTo(42, 54);
      ctx.lineTo(72, 54);
      ctx.lineTo(96, 114);
      ctx.lineTo(120, 54);
      ctx.lineTo(150, 54);
      ctx.lineTo(106, 146);
      ctx.lineTo(86, 146);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      rr(ctx, 48, 76, 26, 6, 3);
      ctx.fill();
      rr(ctx, 118, 76, 26, 6, 3);
      ctx.fill();
      break;
    }

    case 'comp_cloud': {
      // STRT: Stratos CloudWorks — Sleek Cloud Horizon & Orbital Uplink Ring
      drawTileCanvas(ctx, '#0284c7', '#061931', 'rgba(125, 211, 252, 0.35)');
      ctx.fillStyle = '#f0f9ff';
      ctx.beginPath();
      ctx.arc(72, 108, 24, 0, Math.PI * 2);
      ctx.arc(98, 88, 32, 0, Math.PI * 2);
      ctx.arc(126, 110, 22, 0, Math.PI * 2);
      ctx.fill();
      rr(ctx, 56, 106, 86, 26, 13);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(96, 98, 56, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
      break;
    }

    case 'comp_media': {
      // MEDI: PrimaMedia — Concentric Studio Broadcast Waves & Prism Beacon
      drawTileCanvas(ctx, '#db2777', '#260618', 'rgba(249, 168, 212, 0.35)');
      ctx.strokeStyle = '#fbcfe8';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      for (const r of [28, 44, 60]) {
        ctx.beginPath();
        ctx.arc(96, 96, r, -Math.PI * 0.34, Math.PI * 0.34);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(96, 96, r, Math.PI * 0.66, Math.PI * 1.34);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(96, 72);
      ctx.lineTo(114, 96);
      ctx.lineTo(96, 120);
      ctx.lineTo(78, 96);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'comp_volt': {
      drawTileCanvas(ctx, '#059669', '#031f16', 'rgba(110, 231, 183, 0.35)');
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(108, 38);
      ctx.lineTo(62, 102);
      ctx.lineTo(94, 102);
      ctx.lineTo(82, 154);
      ctx.lineTo(132, 88);
      ctx.lineTo(98, 88);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'comp_giga': {
      drawTileCanvas(ctx, '#0e7490', '#071b24', 'rgba(103, 232, 249, 0.32)');
      ctx.fillStyle = '#cffafe';
      ctx.beginPath();
      ctx.moveTo(96, 38);
      ctx.lineTo(138, 66);
      ctx.lineTo(138, 148);
      ctx.lineTo(96, 148);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.moveTo(96, 38);
      ctx.lineTo(54, 66);
      ctx.lineTo(54, 148);
      ctx.lineTo(96, 148);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      rr(ctx, 86, 108, 20, 40, 2);
      ctx.fill();
      break;
    }

    case 'comp_logi': {
      drawTileCanvas(ctx, '#c2410c', '#240b03', 'rgba(253, 186, 116, 0.34)');
      ctx.fillStyle = '#ffedd5';
      ctx.beginPath();
      ctx.moveTo(96, 46);
      ctx.lineTo(142, 72);
      ctx.lineTo(96, 98);
      ctx.lineTo(50, 72);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(50, 72);
      ctx.lineTo(96, 98);
      ctx.lineTo(96, 148);
      ctx.lineTo(50, 122);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.moveTo(142, 72);
      ctx.lineTo(96, 98);
      ctx.lineTo(96, 148);
      ctx.lineTo(142, 122);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'comp_luxe': {
      drawTileCanvas(ctx, '#4338ca', '#110f33', 'rgba(165, 180, 252, 0.35)');
      ctx.fillStyle = '#eef2ff';
      ctx.beginPath();
      ctx.moveTo(64, 58);
      ctx.lineTo(128, 58);
      ctx.lineTo(148, 86);
      ctx.lineTo(96, 148);
      ctx.lineTo(44, 86);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#818cf8';
      ctx.beginPath();
      ctx.moveTo(64, 58);
      ctx.lineTo(128, 58);
      ctx.lineTo(96, 148);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'comp_vrtx': {
      drawTileCanvas(ctx, '#1d4ed8', '#0a1433', 'rgba(147, 197, 253, 0.35)');
      ctx.fillStyle = '#fbbf24';
      for (let i = 0; i < 4; i++) {
        const off = 62 + i * 20;
        ctx.fillRect(off, 42, 8, 108);
        ctx.fillRect(42, off, 108, 8);
      }
      ctx.fillStyle = '#0f172a';
      rr(ctx, 58, 58, 76, 76, 12);
      ctx.fill();
      ctx.fillStyle = '#dbeafe';
      rr(ctx, 76, 76, 40, 40, 6);
      ctx.fill();
      break;
    }

    case 'comp_bioh': {
      drawTileCanvas(ctx, '#4d7c0f', '#132004', 'rgba(190, 242, 100, 0.34)');
      ctx.strokeStyle = '#ecfccb';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(96, 98, 46, Math.PI * 0.25, Math.PI * 1.75);
      ctx.stroke();
      ctx.fillStyle = '#bef264';
      ctx.beginPath();
      ctx.moveTo(96, 140);
      ctx.quadraticCurveTo(58, 98, 96, 48);
      ctx.quadraticCurveTo(134, 98, 96, 140);
      ctx.fill();
      break;
    }

    case 'comp_orbt': {
      drawTileCanvas(ctx, '#0284c7', '#081b30', 'rgba(125, 211, 252, 0.34)');
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(96, 96, 44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(96, 96, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(128, 64, 11, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'comp_titn': {
      drawTileCanvas(ctx, '#92400e', '#1f1003', 'rgba(251, 191, 36, 0.32)');
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.moveTo(46, 68);
      ctx.lineTo(146, 68);
      ctx.lineTo(130, 96);
      ctx.lineTo(118, 96);
      ctx.lineTo(128, 138);
      ctx.lineTo(64, 138);
      ctx.lineTo(74, 96);
      ctx.lineTo(54, 96);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'comp_aura': {
      drawTileCanvas(ctx, '#9d174d', '#240514', 'rgba(244, 114, 182, 0.34)');
      ctx.strokeStyle = '#fce7f3';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(72, 96, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(120, 96, 26, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'comp_kron': {
      drawTileCanvas(ctx, '#115e59', '#051f1e', 'rgba(94, 234, 212, 0.32)');
      ctx.strokeStyle = '#ccfbf1';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(96, 96, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#2dd4bf';
      ctx.lineWidth = 4.5;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        ctx.beginPath();
        ctx.moveTo(96, 96);
        ctx.lineTo(96 + Math.cos(a) * 38, 96 + Math.sin(a) * 38);
        ctx.stroke();
      }
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(96, 96, 11, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'govt_city': {
      drawTileCanvas(ctx, '#0f766e', '#051e1c', 'rgba(45, 212, 191, 0.34)');
      ctx.fillStyle = '#ccfbf1';
      ctx.beginPath();
      ctx.arc(96, 76, 32, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(58, 76, 76, 12);
      for (const px of [64, 82, 102, 120]) {
        ctx.fillRect(px, 90, 9, 38);
      }
      rr(ctx, 50, 128, 92, 14, 4);
      ctx.fill();
      break;
    }

    default: {
      drawTileCanvas(ctx, color, '#090d16', `${accentColor}55`);
      ctx.fillStyle = '#ffffff';
      if (personality === 'real_estate_mogul') {
        rr(ctx, 64, 52, 28, 88, 4);
        ctx.fill();
        rr(ctx, 100, 74, 28, 66, 4);
        ctx.fill();
      } else if (personality === 'healthcare_pioneer') {
        rr(ctx, 82, 50, 28, 92, 6);
        ctx.fill();
        rr(ctx, 50, 82, 92, 28, 6);
        ctx.fill();
      } else if (personality === 'tech_innovator' || personality === 'quality_first') {
        ctx.beginPath();
        ctx.moveTo(96, 44);
        ctx.lineTo(146, 96);
        ctx.lineTo(96, 148);
        ctx.lineTo(46, 96);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(96, 96, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(96, 96, 19, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }

  ctx.restore();
}
