import { FacilityType } from '../../types/game';

/**
 * Precision 2.5D Isometric Architectural Facility Thumbnail Renderer
 * Uses 192-unit coordinate space (scaled to 256x256 Hi-DPI) with true perspective-sheared
 * isometric windows and calibrated optical safe bounds (y: 26..156) so spires never clip.
 */

function isoPrism(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  halfW: number,
  halfD: number,
  height: number,
  topCol: string,
  leftCol: string,
  rightCol: string,
  strokeCol = 'rgba(255,255,255,0.18)'
) {
  const topY = baseY - height;
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = strokeCol;

  // Top diamond
  ctx.fillStyle = topCol;
  ctx.beginPath();
  ctx.moveTo(cx, topY - halfD * 2);
  ctx.lineTo(cx + halfW, topY - halfD);
  ctx.lineTo(cx, topY);
  ctx.lineTo(cx - halfW, topY - halfD);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Left shaded wall
  ctx.fillStyle = leftCol;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, topY - halfD);
  ctx.lineTo(cx, topY);
  ctx.lineTo(cx, baseY);
  ctx.lineTo(cx - halfW, baseY - halfD);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Right illuminated wall
  ctx.fillStyle = rightCol;
  ctx.beginPath();
  ctx.moveTo(cx + halfW, topY - halfD);
  ctx.lineTo(cx, topY);
  ctx.lineTo(cx, baseY);
  ctx.lineTo(cx + halfW, baseY - halfD);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawBasePad(ctx: CanvasRenderingContext2D, padTop = '#1e293b', padEdge = '#0f172a') {
  isoPrism(ctx, 96, 156, 58, 24, 9, padTop, padEdge, '#162033', 'rgba(148,163,184,0.22)');
}

/**
 * Draws true perspective-sheared isometric window panes aligned along wall slopes
 */
function drawIsoWindows(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  halfW: number,
  halfD: number,
  floors: number,
  floorStep: number,
  color = '#fde047',
  cols = 2
) {
  ctx.fillStyle = color;
  const slope = halfD / halfW;
  const paneW = Math.min(8, (halfW / cols) * 0.42);
  const paneH = Math.max(4, Math.min(6, floorStep * 0.46));

  for (let f = 0; f < floors; f++) {
    const wy = baseY - 12 - f * floorStep;
    for (let k = 0; k < cols; k++) {
      const t = (k + 0.5) / cols;
      // Left wall skewed quad (rising up-left along wall slope)
      const lx = cx - halfW * t;
      const ly = wy - halfD * t;
      ctx.beginPath();
      ctx.moveTo(lx - paneW * 0.5, ly - paneW * 0.5 * slope);
      ctx.lineTo(lx + paneW * 0.5, ly + paneW * 0.5 * slope);
      ctx.lineTo(lx + paneW * 0.5, ly + paneW * 0.5 * slope - paneH);
      ctx.lineTo(lx - paneW * 0.5, ly - paneW * 0.5 * slope - paneH);
      ctx.closePath();
      ctx.fill();

      // Right wall skewed quad (rising up-right along wall slope)
      const rx = cx + halfW * t;
      const ry = wy - halfD * t;
      ctx.beginPath();
      ctx.moveTo(rx - paneW * 0.5, ry + paneW * 0.5 * slope);
      ctx.lineTo(rx + paneW * 0.5, ry - paneW * 0.5 * slope);
      ctx.lineTo(rx + paneW * 0.5, ry - paneW * 0.5 * slope - paneH);
      ctx.lineTo(rx - paneW * 0.5, ry + paneW * 0.5 * slope - paneH);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export function drawFacilityVisual(ctx: CanvasRenderingContext2D, type: FacilityType | string) {
  ctx.save();

  switch (type) {
    case 'store_convenience': {
      drawBasePad(ctx);
      isoPrism(ctx, 96, 145, 44, 19, 40, '#0284c7', '#1e293b', '#334155');
      isoPrism(ctx, 96, 128, 47, 20, 6, '#f97316', '#ea580c', '#fb923c');
      drawIsoWindows(ctx, 96, 143, 44, 19, 2, 13, '#bae6fd', 2);
      break;
    }

    case 'store_pharmacy': {
      drawBasePad(ctx, '#134e4a', '#0f172a');
      isoPrism(ctx, 96, 145, 44, 19, 42, '#10b981', '#0f766e', '#14b8a6');
      isoPrism(ctx, 96, 102, 18, 8, 9, '#ecfdf5', '#34d399', '#6ee7b7');
      ctx.fillStyle = '#059669';
      ctx.fillRect(92, 76, 8, 18);
      ctx.fillRect(87, 81, 18, 8);
      drawIsoWindows(ctx, 96, 142, 44, 19, 2, 14, '#a7f3d0', 2);
      break;
    }

    case 'store_electronics': {
      drawBasePad(ctx, '#1e1b4b', '#0f172a');
      isoPrism(ctx, 96, 145, 46, 20, 48, '#38bdf8', '#1e293b', '#0f172a');
      isoPrism(ctx, 96, 97, 32, 14, 12, '#bae6fd', '#0284c7', '#38bdf8');
      drawIsoWindows(ctx, 96, 142, 46, 20, 3, 12, '#38bdf8', 3);
      break;
    }

    case 'store_department': {
      drawBasePad(ctx);
      isoPrism(ctx, 96, 145, 50, 22, 50, '#f59e0b', '#312e81', '#4338ca');
      isoPrism(ctx, 96, 95, 30, 13, 15, '#fef08a', '#6366f1', '#818cf8');
      drawIsoWindows(ctx, 96, 143, 50, 22, 3, 13, '#fde68a', 3);
      break;
    }

    case 'store_auto': {
      drawBasePad(ctx, '#0f172a', '#020617');
      isoPrism(ctx, 96, 145, 50, 21, 38, '#e2e8f0', '#0369a1', '#0284c7');
      isoPrism(ctx, 96, 107, 52, 22, 8, '#38bdf8', '#0ea5e9', '#7dd3fc');
      drawIsoWindows(ctx, 96, 142, 50, 21, 2, 13, '#e0f2fe', 3);
      break;
    }

    case 'apartment_complex': {
      drawBasePad(ctx, '#1e293b', '#0f172a');
      isoPrism(ctx, 76, 144, 24, 11, 74, '#fb923c', '#334155', '#475569');
      isoPrism(ctx, 118, 146, 24, 11, 64, '#38bdf8', '#1e293b', '#334155');
      drawIsoWindows(ctx, 76, 142, 24, 11, 5, 12, '#fef08a', 2);
      drawIsoWindows(ctx, 118, 144, 24, 11, 4, 12, '#bae6fd', 2);
      break;
    }

    case 'commercial_tower': {
      drawBasePad(ctx, '#0f172a', '#020617');
      isoPrism(ctx, 96, 145, 38, 17, 70, '#38bdf8', '#0c4a6e', '#0369a1');
      isoPrism(ctx, 96, 75, 24, 11, 22, '#bae6fd', '#0284c7', '#38bdf8');
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(96, 46);
      ctx.lineTo(96, 26);
      ctx.stroke();
      drawIsoWindows(ctx, 96, 142, 38, 17, 5, 11, '#7dd3fc', 3);
      break;
    }

    case 'civic_housing': {
      drawBasePad(ctx, '#065f46', '#064e3b');
      isoPrism(ctx, 82, 144, 26, 12, 56, '#2dd4bf', '#0f766e', '#14b8a6');
      isoPrism(ctx, 116, 146, 24, 11, 48, '#5eead4', '#115e59', '#0d9488');
      drawIsoWindows(ctx, 82, 142, 26, 12, 4, 11, '#ecfeff', 2);
      drawIsoWindows(ctx, 116, 144, 24, 11, 3, 11, '#ccfbf1', 2);
      break;
    }

    case 'resident_house': {
      drawBasePad(ctx, '#365314', '#1a2e05');
      isoPrism(ctx, 96, 146, 36, 16, 30, '#fef3c7', '#d97706', '#f59e0b');
      isoPrism(ctx, 96, 116, 39, 18, 12, '#dc2626', '#991b1b', '#b91c1c');
      drawIsoWindows(ctx, 96, 144, 36, 16, 1, 13, '#fef08a', 2);
      break;
    }

    case 'factory_processing': {
      drawBasePad(ctx, '#292524', '#1c1917');
      isoPrism(ctx, 96, 145, 48, 20, 38, '#d97706', '#44403c', '#57534e');
      isoPrism(ctx, 74, 107, 7, 3.5, 34, '#ef4444', '#78716c', '#a8a29e');
      isoPrism(ctx, 112, 107, 7, 3.5, 30, '#f59e0b', '#78716c', '#a8a29e');
      ctx.fillStyle = 'rgba(226,232,240,0.48)';
      ctx.beginPath();
      ctx.arc(76, 58, 6.5, 0, Math.PI * 2);
      ctx.arc(84, 50, 8, 0, Math.PI * 2);
      ctx.arc(114, 62, 5.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'factory_assembly': {
      drawBasePad(ctx, '#1e293b', '#0f172a');
      isoPrism(ctx, 96, 145, 50, 22, 42, '#38bdf8', '#1e293b', '#334155');
      isoPrism(ctx, 82, 103, 18, 8, 13, '#7dd3fc', '#0284c7', '#0ea5e9');
      isoPrism(ctx, 114, 107, 15, 7, 11, '#a78bfa', '#5b21b6', '#7c3aed');
      drawIsoWindows(ctx, 96, 142, 50, 22, 2, 14, '#bae6fd', 3);
      break;
    }

    case 'warehouse_logistics': {
      drawBasePad(ctx, '#1f2937', '#111827');
      isoPrism(ctx, 96, 145, 52, 23, 34, '#ea580c', '#334155', '#475569');
      isoPrism(ctx, 96, 111, 40, 17, 8, '#fb923c', '#c2410c', '#ea580c');
      drawIsoWindows(ctx, 96, 142, 52, 23, 1, 12, '#fbbf24', 3);
      break;
    }

    case 'farm_agriculture': {
      drawBasePad(ctx, '#15803d', '#14532d');
      isoPrism(ctx, 82, 144, 26, 12, 32, '#ef4444', '#7f1d1d', '#991b1b');
      isoPrism(ctx, 122, 142, 13, 6.5, 48, '#e2e8f0', '#64748b', '#94a3b8');
      break;
    }

    case 'mine_extraction': {
      drawBasePad(ctx, '#44403c', '#292524');
      isoPrism(ctx, 82, 145, 28, 13, 32, '#b45309', '#44403c', '#57534e');
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(104, 142);
      ctx.lineTo(118, 54);
      ctx.lineTo(132, 142);
      ctx.moveTo(108, 106);
      ctx.lineTo(128, 106);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(118, 54, 5.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'power_plant_green': {
      drawBasePad(ctx, '#065f46', '#064e3b');
      isoPrism(ctx, 82, 144, 32, 14, 22, '#0284c7', '#1e293b', '#334155');
      isoPrism(ctx, 120, 144, 17, 8, 30, '#10b981', '#047857', '#059669');
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(98, 122);
      ctx.lineTo(98, 60);
      ctx.stroke();
      ctx.lineWidth = 2.8;
      for (let b = 0; b < 3; b++) {
        const a = (Math.PI * 2 * b) / 3 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(98, 60);
        ctx.lineTo(98 + Math.cos(a) * 24, 60 + Math.sin(a) * 24);
        ctx.stroke();
      }
      break;
    }

    case 'tech_software': {
      drawBasePad(ctx, '#0c4a6e', '#082f49');
      isoPrism(ctx, 96, 145, 44, 19, 56, '#38bdf8', '#1e1b4b', '#312e81');
      isoPrism(ctx, 96, 89, 28, 13, 16, '#a5f3fc', '#0284c7', '#0ea5e9');
      drawIsoWindows(ctx, 96, 142, 44, 19, 4, 11, '#67e8f9', 3);
      break;
    }

    case 'media_telecom': {
      drawBasePad(ctx, '#4c0519', '#1e1b4b');
      isoPrism(ctx, 96, 145, 42, 18, 34, '#ec4899', '#312e81', '#4c1d95');
      isoPrism(ctx, 96, 111, 13, 6, 42, '#f472b6', '#be185d', '#db2777');
      ctx.strokeStyle = '#fbcfe8';
      ctx.lineWidth = 2.5;
      for (const r of [14, 24]) {
        ctx.beginPath();
        ctx.arc(96, 54, r, -Math.PI * 0.75, -Math.PI * 0.25);
        ctx.stroke();
      }
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(96, 54, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'rd_center': {
      drawBasePad(ctx, '#312e81', '#1e1b4b');
      isoPrism(ctx, 96, 145, 46, 20, 46, '#818cf8', '#312e81', '#4338ca');
      ctx.fillStyle = '#c4b5fd';
      ctx.beginPath();
      ctx.arc(96, 86, 22, Math.PI, 0);
      ctx.fill();
      drawIsoWindows(ctx, 96, 142, 46, 20, 3, 12, '#ddd6fe', 3);
      break;
    }

    case 'corporate_hq':
    default: {
      drawBasePad(ctx, '#0f172a', '#020617');
      isoPrism(ctx, 96, 146, 42, 19, 72, '#38bdf8', '#0f172a', '#1e293b');
      isoPrism(ctx, 96, 74, 28, 13, 24, '#fbbf24', '#0284c7', '#0ea5e9');
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(96, 42);
      ctx.lineTo(96, 26);
      ctx.stroke();
      drawIsoWindows(ctx, 96, 143, 42, 19, 5, 12, '#fde047', 3);
      break;
    }
  }

  ctx.restore();
}
