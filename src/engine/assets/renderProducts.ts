import { ProductId } from '../../types/game';

/**
 * Shared studio canvas helpers for 192-unit coordinate space (scaled to 256x256 Hi-DPI)
 * Calibrated safe zone: x in [24..168], y in [24..168] for crisp container fit at any size.
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

function drawPedestalShadow(ctx: CanvasRenderingContext2D, cx = 96, cy = 148, rx = 50, ry = 13) {
  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
  g.addColorStop(0, 'rgba(2, 6, 23, 0.72)');
  g.addColorStop(0.6, 'rgba(2, 6, 23, 0.28)');
  g.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hw: number,
  hd: number,
  h: number,
  topCol: string | CanvasGradient,
  leftCol: string | CanvasGradient,
  rightCol: string | CanvasGradient,
  stroke = 'rgba(255,255,255,0.18)'
) {
  const topY = cy - h;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = stroke;

  ctx.fillStyle = topCol;
  ctx.beginPath();
  ctx.moveTo(cx, topY - hd * 2);
  ctx.lineTo(cx + hw, topY - hd);
  ctx.lineTo(cx, topY);
  ctx.lineTo(cx - hw, topY - hd);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = leftCol;
  ctx.beginPath();
  ctx.moveTo(cx - hw, topY - hd);
  ctx.lineTo(cx, topY);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx - hw, cy - hd);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = rightCol;
  ctx.beginPath();
  ctx.moveTo(cx + hw, topY - hd);
  ctx.lineTo(cx, topY);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + hw, cy - hd);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function drawProductVisual(ctx: CanvasRenderingContext2D, id: ProductId | string) {
  ctx.save();
  drawPedestalShadow(ctx, 96, 150, 52, 12);

  switch (id) {
    case 'wheat': {
      // Organic golden wheat sheaf with gracefully curved stalks, plump grain ears, awns & jute wrap
      const stalks = [
        { dx: -14, tilt: -0.28, len: 88 },
        { dx: -6, tilt: -0.13, len: 96 },
        { dx: 0, tilt: 0.0, len: 102 },
        { dx: 7, tilt: 0.14, len: 95 },
        { dx: 15, tilt: 0.27, len: 86 },
      ];
      for (const s of stalks) {
        ctx.save();
        ctx.translate(96 + s.dx * 0.45, 144);
        ctx.rotate(s.tilt);
        const sg = ctx.createLinearGradient(0, 0, 0, -s.len);
        sg.addColorStop(0, '#92400e');
        sg.addColorStop(0.5, '#d97706');
        sg.addColorStop(1, '#fde047');
        ctx.strokeStyle = sg;
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s.tilt * 16, -s.len * 0.5, s.tilt * 26, -s.len);
        ctx.stroke();

        // Wheat ear spikelets along top third
        const tipX = s.tilt * 26;
        for (let k = 0; k < 6; k++) {
          const ky = -s.len + 6 + k * 7.2;
          const kx = tipX * ((s.len - 6 - k * 7.2) / s.len);
          for (const side of [-1, 1]) {
            ctx.save();
            ctx.translate(kx + side * 4.2, ky);
            ctx.rotate(side * 0.52);
            const kg = ctx.createLinearGradient(-3, -5, 3, 5);
            kg.addColorStop(0, '#fef9c3');
            kg.addColorStop(0.55, '#f59e0b');
            kg.addColorStop(1, '#92400e');
            ctx.fillStyle = kg;
            ctx.beginPath();
            ctx.ellipse(0, 0, 3.0, 5.8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
        ctx.restore();
      }
      // Tied jute twine ribbon collar
      const twineG = ctx.createLinearGradient(76, 114, 116, 126);
      twineG.addColorStop(0, '#78350f');
      twineG.addColorStop(0.5, '#d97706');
      twineG.addColorStop(1, '#451a03');
      ctx.fillStyle = twineG;
      rr(ctx, 78, 114, 36, 9, 4);
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }

    case 'livestock': {
      // Sculpted dark oak butcher board with authentic anatomical marbled ribeye T-bone steak + rosemary
      const boardG = ctx.createLinearGradient(34, 96, 158, 146);
      boardG.addColorStop(0, '#7c2d12');
      boardG.addColorStop(0.5, '#581c0c');
      boardG.addColorStop(1, '#2a0e05');
      ctx.fillStyle = boardG;
      rr(ctx, 32, 98, 128, 44, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Thick seared lower steak crust
      ctx.fillStyle = '#4c0519';
      ctx.beginPath();
      ctx.moveTo(50, 108);
      ctx.bezierCurveTo(46, 86, 78, 68, 114, 74);
      ctx.bezierCurveTo(144, 78, 150, 102, 134, 118);
      ctx.bezierCurveTo(114, 132, 60, 128, 50, 108);
      ctx.fill();

      // Marbled prime cut face
      const meatG = ctx.createRadialGradient(86, 92, 6, 98, 96, 54);
      meatG.addColorStop(0, '#fb7185');
      meatG.addColorStop(0.55, '#be123c');
      meatG.addColorStop(1, '#881337');
      ctx.fillStyle = meatG;
      ctx.beginPath();
      ctx.moveTo(52, 100);
      ctx.bezierCurveTo(48, 78, 80, 62, 114, 68);
      ctx.bezierCurveTo(142, 74, 146, 96, 132, 110);
      ctx.bezierCurveTo(112, 124, 62, 120, 52, 100);
      ctx.fill();

      // Ivory marbling fat rim & anatomical bone
      ctx.strokeStyle = 'rgba(255, 241, 242, 0.78)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(64, 96);
      ctx.quadraticCurveTo(84, 84, 104, 94);
      ctx.moveTo(74, 106);
      ctx.quadraticCurveTo(96, 100, 118, 105);
      ctx.stroke();

      // T-bone ivory emblem
      ctx.fillStyle = '#fef3c7';
      rr(ctx, 112, 78, 7, 26, 3.5);
      ctx.fill();
      rr(ctx, 104, 78, 22, 6, 3);
      ctx.fill();

      // Fresh herb sprig
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(52, 74);
      ctx.quadraticCurveTo(68, 82, 82, 88);
      ctx.stroke();
      break;
    }

    case 'crude_oil': {
      // Heavy ribbed industrial oil drum with 3D cylindrical specular highlight & amber hazard stripe
      const drumG = ctx.createLinearGradient(56, 44, 136, 144);
      drumG.addColorStop(0, '#334155');
      drumG.addColorStop(0.28, '#64748b');
      drumG.addColorStop(0.55, '#1e293b');
      drumG.addColorStop(1, '#020617');
      ctx.fillStyle = drumG;
      rr(ctx, 56, 46, 80, 98, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Hazard amber band
      const bandG = ctx.createLinearGradient(56, 80, 136, 108);
      bandG.addColorStop(0, '#92400e');
      bandG.addColorStop(0.32, '#fbbf24');
      bandG.addColorStop(0.65, '#d97706');
      bandG.addColorStop(1, '#78350f');
      ctx.fillStyle = bandG;
      ctx.fillRect(56.5, 80, 79, 26);

      // Barrel reinforcement ribs
      ctx.fillStyle = '#94a3b8';
      rr(ctx, 52, 67, 88, 5, 2.5);
      ctx.fill();
      rr(ctx, 52, 115, 88, 5, 2.5);
      ctx.fill();

      // 3D Top rim ellipse + bung cap
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.ellipse(96, 48, 40, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(112, 47, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Glossy crude oil drop badge
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(96, 82);
      ctx.bezierCurveTo(106, 93, 104, 103, 96, 103);
      ctx.bezierCurveTo(88, 103, 86, 93, 96, 82);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(93.5, 95, 2.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'iron_ore': {
      // Sculpted 3D crystalline iron ore cluster with bright metallic silver edges & warm copper/hematite glow
      const facets: { pts: [number, number][]; col: string }[] = [
        { pts: [[40, 128], [58, 72], [96, 92], [82, 140]], col: '#475569' },
        { pts: [[58, 72], [102, 44], [134, 70], [96, 92]], col: '#94a3b8' },
        { pts: [[96, 92], [134, 70], [152, 114], [118, 142], [82, 140]], col: '#1e293b' },
        { pts: [[102, 44], [134, 70], [116, 54]], col: '#e2e8f0' },
        { pts: [[124, 116], [148, 102], [154, 130], [130, 138]], col: '#64748b' },
      ];
      for (const f of facets) {
        ctx.fillStyle = f.col;
        ctx.beginPath();
        f.pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      // Glowing molten hematite seams
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(64, 98);
      ctx.lineTo(94, 88);
      ctx.lineTo(124, 112);
      ctx.stroke();
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(98, 72, 3.6, 0, Math.PI * 2);
      ctx.arc(122, 92, 2.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'silicon': {
      // Precision silver-iridescent monocrystalline silicon wafer + raw crystalline quartz shard
      ctx.save();
      ctx.translate(92, 100);
      ctx.scale(1, 0.68);
      // Machined silver edge
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(0, 9, 52, 0, Math.PI * 2);
      ctx.fill();

      const waferG = ctx.createLinearGradient(-52, -52, 52, 52);
      waferG.addColorStop(0, '#e0f2fe');
      waferG.addColorStop(0.28, '#38bdf8');
      waferG.addColorStop(0.55, '#818cf8');
      waferG.addColorStop(0.82, '#2dd4bf');
      waferG.addColorStop(1, '#334155');
      ctx.fillStyle = waferG;
      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.36)';
      ctx.lineWidth = 1;
      for (let g = -48; g <= 48; g += 12) {
        ctx.beginPath();
        ctx.moveTo(g, -54);
        ctx.lineTo(g, 54);
        ctx.moveTo(-54, g);
        ctx.lineTo(54, g);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Standing crystalline polysilicon quartz prism on top-right
      const qG = ctx.createLinearGradient(118, 42, 146, 108);
      qG.addColorStop(0, '#f8fafc');
      qG.addColorStop(0.5, '#7dd3fc');
      qG.addColorStop(1, '#0284c7');
      ctx.fillStyle = qG;
      ctx.beginPath();
      ctx.moveTo(132, 42);
      ctx.lineTo(146, 62);
      ctx.lineTo(142, 108);
      ctx.lineTo(122, 108);
      ctx.lineTo(118, 62);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      break;
    }

    case 'flour': {
      // Pinched-ear burlap sack with overflowing cream flour mound + wooden scoop
      const sackG = ctx.createLinearGradient(50, 56, 136, 146);
      sackG.addColorStop(0, '#f3d5a5');
      sackG.addColorStop(0.55, '#c89b62');
      sackG.addColorStop(1, '#7c5329');
      ctx.fillStyle = sackG;
      ctx.beginPath();
      ctx.moveTo(64, 58);
      ctx.quadraticCurveTo(96, 64, 128, 58);
      ctx.bezierCurveTo(138, 88, 144, 118, 130, 140);
      ctx.quadraticCurveTo(96, 146, 62, 140);
      ctx.bezierCurveTo(48, 118, 54, 88, 64, 58);
      ctx.closePath();
      ctx.fill();

      // Overflowing fluffy white flour mound at open cuff
      ctx.fillStyle = '#fefce8';
      ctx.beginPath();
      ctx.ellipse(96, 60, 32, 16, 0, Math.PI, Math.PI * 2);
      ctx.ellipse(96, 62, 32, 7, 0, 0, Math.PI);
      ctx.fill();

      // Rolled burlap collar
      ctx.fillStyle = '#b4824c';
      rr(ctx, 59, 58, 74, 11, 5.5);
      ctx.fill();

      // Printed rustic grain emblem
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(96, 104, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.ellipse(96, 104, 4, 9, 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'steel': {
      // True 3D isometric structural steel I-beam (angled across frame) + machined bright end face
      // Back rolled steel coil
      const coilG = ctx.createRadialGradient(118, 72, 4, 120, 78, 34);
      coilG.addColorStop(0, '#f1f5f9');
      coilG.addColorStop(0.5, '#94a3b8');
      coilG.addColorStop(1, '#334155');
      ctx.fillStyle = coilG;
      ctx.beginPath();
      ctx.arc(120, 78, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(120, 78, 10, 0, Math.PI * 2);
      ctx.fill();

      // True isometric I-beam foreground
      drawIsoBox(ctx, 84, 134, 46, 20, 10, '#cbd5e1', '#475569', '#64748b'); // bottom flange
      drawIsoBox(ctx, 84, 124, 34, 12, 24, '#94a3b8', '#334155', '#475569'); // central web
      drawIsoBox(ctx, 84, 100, 46, 20, 10, '#f8fafc', '#64748b', '#94a3b8'); // top flange
      break;
    }

    case 'plastic': {
      // Translucent industrial HDPE drum + clear glass scoop overflowing with cyan polymer resin pellets
      const drumG = ctx.createLinearGradient(52, 48, 122, 140);
      drumG.addColorStop(0, '#38bdf8');
      drumG.addColorStop(0.45, '#0284c7');
      drumG.addColorStop(1, '#0c4a6e');
      ctx.fillStyle = drumG;
      rr(ctx, 50, 54, 70, 84, 12);
      ctx.fill();
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // White industrial lid & specular highlight
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.ellipse(85, 55, 34, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      rr(ctx, 58, 66, 9, 62, 4.5);
      ctx.fill();

      // Foreground stainless bowl overflowing with polymer pellets
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.ellipse(122, 126, 28, 14, 0, 0, Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      const pelletCols = ['#a5f3fc', '#22d3ee', '#38bdf8', '#f8fafc', '#818cf8'];
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = pelletCols[i % pelletCols.length];
        const px = 104 + (i % 5) * 8.5 + (i > 8 ? 3 : 0);
        const py = 122 - Math.floor(i / 5) * 6.5;
        ctx.beginPath();
        ctx.arc(px, py, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'electronic_chip': {
      // Precision gold-pinned PCB + brushed aluminum IHS + glowing blue silicon core
      const pcbG = ctx.createLinearGradient(46, 46, 146, 146);
      pcbG.addColorStop(0, '#059669');
      pcbG.addColorStop(1, '#022c22');
      ctx.fillStyle = pcbG;
      rr(ctx, 48, 48, 96, 96, 12);
      ctx.fill();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      for (let i = 0; i < 7; i++) {
        const pos = 58 + i * 12;
        ctx.fillRect(pos, 41, 5, 7);
        ctx.fillRect(pos, 144, 5, 7);
        ctx.fillRect(41, pos, 7, 5);
        ctx.fillRect(144, pos, 7, 5);
      }

      const dieG = ctx.createLinearGradient(66, 66, 126, 126);
      dieG.addColorStop(0, '#f8fafc');
      dieG.addColorStop(0.5, '#94a3b8');
      dieG.addColorStop(1, '#334155');
      ctx.fillStyle = dieG;
      rr(ctx, 68, 68, 56, 56, 8);
      ctx.fill();

      const coreG = ctx.createRadialGradient(96, 96, 2, 96, 96, 18);
      coreG.addColorStop(0, '#7dd3fc');
      coreG.addColorStop(0.6, '#0284c7');
      coreG.addColorStop(1, '#0c4a6e');
      ctx.fillStyle = coreG;
      rr(ctx, 82, 82, 28, 28, 4);
      ctx.fill();
      break;
    }

    case 'fabric': {
      // Authentic cylindrical rolled bolts of woven royal silk & crimson cashmere + golden spool
      // Back Indigo Fabric Bolt (angled cylinder)
      ctx.save();
      ctx.translate(82, 86);
      ctx.rotate(-0.22);
      const roll1 = ctx.createLinearGradient(-40, -18, -40, 18);
      roll1.addColorStop(0, '#818cf8');
      roll1.addColorStop(0.5, '#4338ca');
      roll1.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = roll1;
      rr(ctx, -40, -18, 76, 36, 8);
      ctx.fill();
      ctx.fillStyle = '#c7d2fe';
      ctx.beginPath();
      ctx.ellipse(35, 0, 8, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#312e81';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(35, 0, 4, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Front Crimson Silk Roll
      ctx.save();
      ctx.translate(100, 114);
      ctx.rotate(-0.16);
      const roll2 = ctx.createLinearGradient(-42, -19, -42, 19);
      roll2.addColorStop(0, '#fb7185');
      roll2.addColorStop(0.5, '#be123c');
      roll2.addColorStop(1, '#4c0519');
      ctx.fillStyle = roll2;
      rr(ctx, -42, -19, 80, 38, 8);
      ctx.fill();
      ctx.fillStyle = '#fecdd3';
      ctx.beginPath();
      ctx.ellipse(37, 0, 8.5, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#881337';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(37, 0, 4.2, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Gold thread spool resting beside
      ctx.fillStyle = '#fbbf24';
      rr(ctx, 42, 106, 18, 28, 3);
      ctx.fill();
      ctx.fillStyle = '#b45309';
      rr(ctx, 39, 103, 24, 5, 2);
      ctx.fill();
      rr(ctx, 39, 132, 24, 5, 2);
      ctx.fill();
      break;
    }

    case 'battery_cell': {
      // Emerald EV Lithium-Ion battery pack with copper/silver terminals & crisp charge indicator
      const packG = ctx.createLinearGradient(44, 58, 148, 142);
      packG.addColorStop(0, '#10b981');
      packG.addColorStop(0.5, '#047857');
      packG.addColorStop(1, '#064e3b');
      ctx.fillStyle = packG;
      rr(ctx, 46, 62, 100, 78, 11);
      ctx.fill();
      ctx.strokeStyle = '#6ee7b7';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.fillStyle = '#fb923c';
      rr(ctx, 60, 49, 20, 13, 3);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      rr(ctx, 112, 49, 20, 13, 3);
      ctx.fill();

      ctx.fillStyle = '#022c22';
      rr(ctx, 60, 78, 72, 46, 7);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(100, 82);
      ctx.lineTo(84, 103);
      ctx.lineTo(96, 103);
      ctx.lineTo(91, 121);
      ctx.lineTo(109, 98);
      ctx.lineTo(97, 98);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'bread': {
      // Artisan scored sourdough boule on warm wooden board + curved golden crescent croissant
      const boardG = ctx.createLinearGradient(34, 122, 158, 144);
      boardG.addColorStop(0, '#92400e');
      boardG.addColorStop(1, '#451a03');
      ctx.fillStyle = boardG;
      rr(ctx, 32, 118, 128, 22, 10);
      ctx.fill();

      // Golden sourdough dome
      const loafG = ctx.createRadialGradient(82, 82, 8, 88, 102, 50);
      loafG.addColorStop(0, '#fde68a');
      loafG.addColorStop(0.52, '#d97706');
      loafG.addColorStop(1, '#78350f');
      ctx.fillStyle = loafG;
      ctx.beginPath();
      ctx.ellipse(88, 106, 46, 28, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(134, 122);
      ctx.quadraticCurveTo(88, 130, 42, 122);
      ctx.closePath();
      ctx.fill();

      // Flour-dusted crust slash marks
      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (const sx of [66, 88, 110]) {
        ctx.beginPath();
        ctx.moveTo(sx - 6, 94);
        ctx.quadraticCurveTo(sx, 84, sx + 8, 95);
        ctx.stroke();
      }

      // Authentic segmented curved croissant foreground right
      ctx.save();
      ctx.translate(128, 122);
      ctx.rotate(-0.18);
      const croG = ctx.createLinearGradient(-22, -10, 22, 10);
      croG.addColorStop(0, '#fef08a');
      croG.addColorStop(0.55, '#f59e0b');
      croG.addColorStop(1, '#92400e');
      ctx.fillStyle = croG;
      ctx.beginPath();
      ctx.moveTo(-24, 6);
      ctx.quadraticCurveTo(0, -16, 24, 6);
      ctx.quadraticCurveTo(10, 12, 0, 5);
      ctx.quadraticCurveTo(-10, 12, -24, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-7, -2);
      ctx.lineTo(-4, 6);
      ctx.moveTo(7, -2);
      ctx.lineTo(4, 6);
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'soft_drink': {
      // Chilled ruby-chrome soda can with condensation droplets & tilted crisp stripe
      const canG = ctx.createLinearGradient(64, 44, 128, 144);
      canG.addColorStop(0, '#f43f5e');
      canG.addColorStop(0.3, '#fb7185');
      canG.addColorStop(0.6, '#be123c');
      canG.addColorStop(1, '#4c0519');
      ctx.fillStyle = canG;
      rr(ctx, 64, 48, 64, 96, 12);
      ctx.fill();

      ctx.fillStyle = '#f1f5f9';
      rr(ctx, 66, 44, 60, 8, 4);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      rr(ctx, 68, 138, 56, 7, 3.5);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(64, 92);
      ctx.lineTo(128, 74);
      ctx.lineTo(128, 98);
      ctx.lineTo(64, 116);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      for (const [dx, dy, r] of [
        [76, 68, 2.2],
        [82, 120, 2.6],
        [114, 112, 2],
        [108, 64, 2.4],
      ] as const) {
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'fashion_apparel': {
      // High-contrast tailored royal-cobalt designer jacket on gold boutique hanger with silk pocket square
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(96, 46, 8.5, Math.PI, Math.PI * 2.15);
      ctx.lineTo(96, 62);
      ctx.stroke();

      const suitG = ctx.createLinearGradient(44, 60, 148, 146);
      suitG.addColorStop(0, '#60a5fa');
      suitG.addColorStop(0.35, '#2563eb');
      suitG.addColorStop(0.75, '#1e3a8a');
      suitG.addColorStop(1, '#172554');
      ctx.fillStyle = suitG;
      ctx.beginPath();
      ctx.moveTo(76, 60);
      ctx.lineTo(116, 60);
      ctx.lineTo(146, 82);
      ctx.lineTo(136, 138);
      ctx.lineTo(118, 138);
      ctx.lineTo(116, 100);
      ctx.lineTo(116, 142);
      ctx.lineTo(76, 142);
      ctx.lineTo(76, 100);
      ctx.lineTo(74, 138);
      ctx.lineTo(56, 138);
      ctx.lineTo(46, 82);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // White inner shirt V & tie
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(84, 60);
      ctx.lineTo(108, 60);
      ctx.lineTo(96, 98);
      ctx.closePath();
      ctx.fill();

      // Silk crimson pocket square & gold buttons
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.moveTo(106, 88);
      ctx.lineTo(118, 84);
      ctx.lineTo(120, 92);
      ctx.lineTo(106, 92);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(96, 112, 2.5, 0, Math.PI * 2);
      ctx.arc(96, 124, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'medicine': {
      // Clinical amber pharmacy bottle with emerald cross label + crisp two-tone capsules
      const btlG = ctx.createLinearGradient(54, 54, 118, 142);
      btlG.addColorStop(0, '#fbbf24');
      btlG.addColorStop(0.5, '#d97706');
      btlG.addColorStop(1, '#78350f');
      ctx.fillStyle = btlG;
      rr(ctx, 54, 62, 62, 78, 12);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      rr(ctx, 64, 44, 42, 18, 5);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      rr(ctx, 60, 82, 50, 40, 4);
      ctx.fill();
      ctx.fillStyle = '#10b981';
      ctx.fillRect(81, 90, 8, 24);
      ctx.fillRect(73, 98, 24, 8);

      ctx.save();
      ctx.translate(128, 126);
      ctx.rotate(-0.45);
      ctx.fillStyle = '#f8fafc';
      rr(ctx, -18, -8, 20, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#10b981';
      rr(ctx, -2, -8, 20, 16, 8);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'smartphone': {
      // Flagship titanium bezel 5G smartphone with glowing aurora screen & camera lens module
      ctx.save();
      ctx.translate(96, 94);
      ctx.rotate(-0.08);
      const frameG = ctx.createLinearGradient(-35, -58, 35, 58);
      frameG.addColorStop(0, '#f8fafc');
      frameG.addColorStop(0.5, '#94a3b8');
      frameG.addColorStop(1, '#334155');
      ctx.fillStyle = frameG;
      rr(ctx, -35, -58, 70, 116, 14);
      ctx.fill();

      const scrG = ctx.createLinearGradient(-30, -52, 30, 52);
      scrG.addColorStop(0, '#38bdf8');
      scrG.addColorStop(0.5, '#7c3aed');
      scrG.addColorStop(1, '#0f172a');
      ctx.fillStyle = scrG;
      rr(ctx, -30, -53, 60, 106, 10);
      ctx.fill();

      ctx.fillStyle = '#020617';
      rr(ctx, -11, -48, 22, 5.5, 2.75);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.moveTo(-30, -53);
      ctx.lineTo(14, -53);
      ctx.lineTo(-30, 18);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'laptop': {
      // Brushed silver ultrabook with vibrant teal/emerald display & tapered deck
      const lidG = ctx.createLinearGradient(44, 44, 148, 108);
      lidG.addColorStop(0, '#e2e8f0');
      lidG.addColorStop(1, '#475569');
      ctx.fillStyle = lidG;
      rr(ctx, 44, 44, 104, 66, 8);
      ctx.fill();

      const dispG = ctx.createLinearGradient(48, 48, 144, 104);
      dispG.addColorStop(0, '#0ea5e9');
      dispG.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = dispG;
      rr(ctx, 49, 49, 94, 56, 4);
      ctx.fill();

      ctx.strokeStyle = '#6ee7b7';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(58, 92);
      ctx.lineTo(78, 78);
      ctx.lineTo(96, 84);
      ctx.lineTo(128, 60);
      ctx.stroke();

      const deckG = ctx.createLinearGradient(32, 110, 160, 140);
      deckG.addColorStop(0, '#f1f5f9');
      deckG.addColorStop(1, '#64748b');
      ctx.fillStyle = deckG;
      ctx.beginPath();
      ctx.moveTo(44, 110);
      ctx.lineTo(148, 110);
      ctx.lineTo(164, 136);
      ctx.lineTo(28, 136);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      rr(ctx, 50, 115, 92, 10, 2);
      ctx.fill();
      break;
    }

    case 'automobile': {
      // High-contrast pearl-cyan EV coupe on illuminated showroom pad with crisp glass cabin & twin LED headlamps
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.beginPath();
      ctx.ellipse(96, 132, 64, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Panoramic tinted glass canopy with bright skylight highlight
      const glassG = ctx.createLinearGradient(54, 60, 138, 94);
      glassG.addColorStop(0, '#bae6fd');
      glassG.addColorStop(0.35, '#0369a1');
      glassG.addColorStop(1, '#0f172a');
      ctx.fillStyle = glassG;
      ctx.beginPath();
      ctx.moveTo(48, 94);
      ctx.quadraticCurveTo(80, 56, 128, 68);
      ctx.lineTo(148, 94);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Sculpted pearl-cyan EV body shell
      const bodyG = ctx.createLinearGradient(26, 86, 164, 124);
      bodyG.addColorStop(0, '#7dd3fc');
      bodyG.addColorStop(0.5, '#0ea5e9');
      bodyG.addColorStop(1, '#0369a1');
      ctx.fillStyle = bodyG;
      ctx.beginPath();
      ctx.moveTo(26, 106);
      ctx.quadraticCurveTo(38, 90, 62, 90);
      ctx.lineTo(150, 92);
      ctx.quadraticCurveTo(166, 98, 164, 120);
      ctx.lineTo(26, 120);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Bright LED headlamp & taillamp
      ctx.fillStyle = '#fef08a';
      rr(ctx, 29, 100, 16, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = '#fb7185';
      rr(ctx, 150, 100, 11, 5, 2.5);
      ctx.fill();

      // Turbine alloy wheels
      for (const wx of [54, 138]) {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(wx, 122, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(wx, 122, 9.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(wx, 122, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'software_os': {
      // Glowing glass isometric OS prism cube floating over sleek metallic cloud ring
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(96, 132, 48, 12, 0, 0, Math.PI * 2);
      ctx.stroke();

      drawIsoBox(ctx, 96, 120, 38, 20, 42, '#bae6fd', '#0284c7', '#38bdf8', '#e0f2fe');
      break;
    }

    case 'ai_enterprise':
    default: {
      // Luminous crystalline AI neural diamond prism with golden orbital halo
      ctx.save();
      ctx.translate(96, 94);
      ctx.rotate(-0.32);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 56, 18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const gemG = ctx.createLinearGradient(60, 40, 132, 144);
      gemG.addColorStop(0, '#e879f9');
      gemG.addColorStop(0.5, '#6366f1');
      gemG.addColorStop(1, '#312e81');
      ctx.fillStyle = gemG;
      ctx.beginPath();
      ctx.moveTo(96, 36);
      ctx.lineTo(134, 88);
      ctx.lineTo(96, 144);
      ctx.lineTo(58, 88);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#f5d0fe';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.beginPath();
      ctx.moveTo(96, 36);
      ctx.lineTo(116, 88);
      ctx.lineTo(96, 144);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      for (const [nx, ny] of [
        [96, 70],
        [82, 92],
        [110, 92],
        [96, 114],
      ] as const) {
        ctx.beginPath();
        ctx.arc(nx, ny, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }

  ctx.restore();
}
