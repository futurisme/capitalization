import { FacilityType, ProductId } from '../types/game';
import { drawProductVisual } from './assets/renderProducts';
import { drawCompanyLogoVisual } from './assets/renderCompanies';
import { drawFacilityVisual } from './assets/renderFacilities';

export type AssetKind = 'product' | 'company' | 'facility';

export interface AssetSpec {
  key: string;
  kind: AssetKind;
  id: string;
  label: string;
  bgStart: string;
  bgEnd: string;
  accent: string;
}

/**
 * Complete registry of 60 original procedural studio assets:
 * - 20 Product Studio Renders
 * - 21 Corporate & Civic Brand Logos (NUSA, 9 Initial AI, 10 Entrant Pool, PEMKOT)
 * - 19 Architectural 2.5D Facility Thumbnails
 */
export const ASSET_CATALOG: Record<string, AssetSpec> = {
  // --- 20 PRODUCTS ---
  'product:wheat': { key: 'product:wheat', kind: 'product', id: 'wheat', label: 'Gandum & Pangan', bgStart: '#291c09', bgEnd: '#0b101d', accent: '#f59e0b' },
  'product:livestock': { key: 'product:livestock', kind: 'product', id: 'livestock', label: 'Ternak & Daging', bgStart: '#2b0d16', bgEnd: '#0b101d', accent: '#fb7185' },
  'product:crude_oil': { key: 'product:crude_oil', kind: 'product', id: 'crude_oil', label: 'Minyak Mentah', bgStart: '#1b202b', bgEnd: '#080c15', accent: '#f59e0b' },
  'product:iron_ore': { key: 'product:iron_ore', kind: 'product', id: 'iron_ore', label: 'Bijih Besi', bgStart: '#261812', bgEnd: '#0b101d', accent: '#f97316' },
  'product:silicon': { key: 'product:silicon', kind: 'product', id: 'silicon', label: 'Silikon Kristal', bgStart: '#0d2238', bgEnd: '#080e1a', accent: '#38bdf8' },
  'product:flour': { key: 'product:flour', kind: 'product', id: 'flour', label: 'Tepung Industri', bgStart: '#262014', bgEnd: '#0b101d', accent: '#fde68a' },
  'product:steel': { key: 'product:steel', kind: 'product', id: 'steel', label: 'Baja Konstruksi', bgStart: '#1a2534', bgEnd: '#090e18', accent: '#cbd5e1' },
  'product:plastic': { key: 'product:plastic', kind: 'product', id: 'plastic', label: 'Resin Polimer', bgStart: '#141c38', bgEnd: '#080c17', accent: '#38bdf8' },
  'product:electronic_chip': { key: 'product:electronic_chip', kind: 'product', id: 'electronic_chip', label: 'Prosesor & Chip', bgStart: '#0b2233', bgEnd: '#070d18', accent: '#38bdf8' },
  'product:fabric': { key: 'product:fabric', kind: 'product', id: 'fabric', label: 'Kain & Tekstil', bgStart: '#291432', bgEnd: '#0b101d', accent: '#f472b6' },
  'product:battery_cell': { key: 'product:battery_cell', kind: 'product', id: 'battery_cell', label: 'Sel Baterai EV', bgStart: '#08291f', bgEnd: '#070d18', accent: '#34d399' },
  'product:bread': { key: 'product:bread', kind: 'product', id: 'bread', label: 'Roti Artisan', bgStart: '#2c1b0a', bgEnd: '#0b101d', accent: '#fbbf24' },
  'product:soft_drink': { key: 'product:soft_drink', kind: 'product', id: 'soft_drink', label: 'Minuman Soda', bgStart: '#300e1a', bgEnd: '#0b101d', accent: '#f43f5e' },
  'product:fashion_apparel': { key: 'product:fashion_apparel', kind: 'product', id: 'fashion_apparel', label: 'Busana Desainer', bgStart: '#161f3d', bgEnd: '#0b101d', accent: '#60a5fa' },
  'product:medicine': { key: 'product:medicine', kind: 'product', id: 'medicine', label: 'Farmasi & Obat', bgStart: '#082921', bgEnd: '#070d18', accent: '#34d399' },
  'product:smartphone': { key: 'product:smartphone', kind: 'product', id: 'smartphone', label: 'Smartphone 5G', bgStart: '#0e1f38', bgEnd: '#070c17', accent: '#60a5fa' },
  'product:laptop': { key: 'product:laptop', kind: 'product', id: 'laptop', label: 'Laptop Ultra Pro', bgStart: '#152236', bgEnd: '#070b14', accent: '#38bdf8' },
  'product:automobile': { key: 'product:automobile', kind: 'product', id: 'automobile', label: 'Mobil Listrik', bgStart: '#0a2033', bgEnd: '#070b15', accent: '#38bdf8' },
  'product:software_os': { key: 'product:software_os', kind: 'product', id: 'software_os', label: 'Sistem Operasi OS', bgStart: '#0d213a', bgEnd: '#070b16', accent: '#38bdf8' },
  'product:ai_enterprise': { key: 'product:ai_enterprise', kind: 'product', id: 'ai_enterprise', label: 'Suite AI Korporat', bgStart: '#211340', bgEnd: '#070a16', accent: '#e879f9' },

  // --- 21 CORPORATE & CIVIC LOGOS ---
  'company:comp_player': { key: 'company:comp_player', kind: 'company', id: 'comp_player', label: 'NUSA', bgStart: '#0369a1', bgEnd: '#0f172a', accent: '#38bdf8' },
  'company:comp_apex': { key: 'company:comp_apex', kind: 'company', id: 'comp_apex', label: 'APEX', bgStart: '#b91c1c', bgEnd: '#1a060a', accent: '#f87171' },
  'company:comp_nova': { key: 'company:comp_nova', kind: 'company', id: 'comp_nova', label: 'NOVA', bgStart: '#6d28d9', bgEnd: '#120826', accent: '#a78bfa' },
  'company:comp_omni': { key: 'company:comp_omni', kind: 'company', id: 'comp_omni', label: 'OMNI', bgStart: '#b45309', bgEnd: '#1c1205', accent: '#fbbf24' },
  'company:comp_land': { key: 'company:comp_land', kind: 'company', id: 'comp_land', label: 'LAND', bgStart: '#0f766e', bgEnd: '#041f1e', accent: '#2dd4bf' },
  'company:comp_medx': { key: 'company:comp_medx', kind: 'company', id: 'comp_medx', label: 'MEDX', bgStart: '#059669', bgEnd: '#032018', accent: '#34d399' },
  'company:comp_agro': { key: 'company:comp_agro', kind: 'company', id: 'comp_agro', label: 'AGRO', bgStart: '#15803d', bgEnd: '#061c0d', accent: '#4ade80' },
  'company:comp_velo': { key: 'company:comp_velo', kind: 'company', id: 'comp_velo', label: 'VELO', bgStart: '#0891b2', bgEnd: '#061924', accent: '#22d3ee' },
  'company:comp_cloud': { key: 'company:comp_cloud', kind: 'company', id: 'comp_cloud', label: 'STRT', bgStart: '#0284c7', bgEnd: '#061931', accent: '#38bdf8' },
  'company:comp_media': { key: 'company:comp_media', kind: 'company', id: 'comp_media', label: 'MEDI', bgStart: '#db2777', bgEnd: '#260618', accent: '#f472b6' },
  'company:comp_volt': { key: 'company:comp_volt', kind: 'company', id: 'comp_volt', label: 'VOLT', bgStart: '#059669', bgEnd: '#031f16', accent: '#6ee7b7' },
  'company:comp_giga': { key: 'company:comp_giga', kind: 'company', id: 'comp_giga', label: 'MTRT', bgStart: '#0e7490', bgEnd: '#071b24', accent: '#67e8f9' },
  'company:comp_logi': { key: 'company:comp_logi', kind: 'company', id: 'comp_logi', label: 'CARG', bgStart: '#c2410c', bgEnd: '#240b03', accent: '#fb923c' },
  'company:comp_luxe': { key: 'company:comp_luxe', kind: 'company', id: 'comp_luxe', label: 'LUXE', bgStart: '#4338ca', bgEnd: '#110f33', accent: '#818cf8' },
  'company:comp_vrtx': { key: 'company:comp_vrtx', kind: 'company', id: 'comp_vrtx', label: 'VRTX', bgStart: '#1d4ed8', bgEnd: '#0a1433', accent: '#60a5fa' },
  'company:comp_bioh': { key: 'company:comp_bioh', kind: 'company', id: 'comp_bioh', label: 'BIOH', bgStart: '#4d7c0f', bgEnd: '#132004', accent: '#a3e635' },
  'company:comp_orbt': { key: 'company:comp_orbt', kind: 'company', id: 'comp_orbt', label: 'ORBT', bgStart: '#0284c7', bgEnd: '#081b30', accent: '#38bdf8' },
  'company:comp_titn': { key: 'company:comp_titn', kind: 'company', id: 'comp_titn', label: 'TITN', bgStart: '#92400e', bgEnd: '#1f1003', accent: '#fbbf24' },
  'company:comp_aura': { key: 'company:comp_aura', kind: 'company', id: 'comp_aura', label: 'AURA', bgStart: '#9d174d', bgEnd: '#240514', accent: '#f472b6' },
  'company:comp_kron': { key: 'company:comp_kron', kind: 'company', id: 'comp_kron', label: 'KRON', bgStart: '#115e59', bgEnd: '#051f1e', accent: '#5eead4' },
  'company:govt_city': { key: 'company:govt_city', kind: 'company', id: 'govt_city', label: 'PEMKOT', bgStart: '#0f766e', bgEnd: '#051e1c', accent: '#2dd4bf' },

  // --- 19 ARCHITECTURAL FACILITIES ---
  'facility:store_convenience': { key: 'facility:store_convenience', kind: 'facility', id: 'store_convenience', label: 'Minimarket 24J', bgStart: '#122442', bgEnd: '#070c17', accent: '#38bdf8' },
  'facility:store_pharmacy': { key: 'facility:store_pharmacy', kind: 'facility', id: 'store_pharmacy', label: 'Apotek & Klinik', bgStart: '#092920', bgEnd: '#070d17', accent: '#34d399' },
  'facility:store_electronics': { key: 'facility:store_electronics', kind: 'facility', id: 'store_electronics', label: 'Mega Elektronik', bgStart: '#0e203e', bgEnd: '#070b15', accent: '#38bdf8' },
  'facility:store_department': { key: 'facility:store_department', kind: 'facility', id: 'store_department', label: 'Megamall', bgStart: '#1f1b42', bgEnd: '#080b16', accent: '#fbbf24' },
  'facility:store_auto': { key: 'facility:store_auto', kind: 'facility', id: 'store_auto', label: 'Showroom EV', bgStart: '#0d2438', bgEnd: '#060b14', accent: '#22d3ee' },
  'facility:apartment_complex': { key: 'facility:apartment_complex', kind: 'facility', id: 'apartment_complex', label: 'Apartemen', bgStart: '#192740', bgEnd: '#070c17', accent: '#fb923c' },
  'facility:commercial_tower': { key: 'facility:commercial_tower', kind: 'facility', id: 'commercial_tower', label: 'Menara CBD', bgStart: '#0c2640', bgEnd: '#060c16', accent: '#38bdf8' },
  'facility:civic_housing': { key: 'facility:civic_housing', kind: 'facility', id: 'civic_housing', label: 'Rusunawa Pemkot', bgStart: '#092c26', bgEnd: '#070d16', accent: '#2dd4bf' },
  'facility:resident_house': { key: 'facility:resident_house', kind: 'facility', id: 'resident_house', label: 'Rumah Warga', bgStart: '#291e0f', bgEnd: '#0a0e17', accent: '#fbbf24' },
  'facility:factory_processing': { key: 'facility:factory_processing', kind: 'facility', id: 'factory_processing', label: 'Pabrik Proses', bgStart: '#29201a', bgEnd: '#0b0e17', accent: '#f59e0b' },
  'facility:factory_assembly': { key: 'facility:factory_assembly', kind: 'facility', id: 'factory_assembly', label: 'Pabrik Perakitan', bgStart: '#142440', bgEnd: '#070c17', accent: '#60a5fa' },
  'facility:warehouse_logistics': { key: 'facility:warehouse_logistics', kind: 'facility', id: 'warehouse_logistics', label: 'Pusat Logistik', bgStart: '#291a12', bgEnd: '#0a0e17', accent: '#fb923c' },
  'facility:farm_agriculture': { key: 'facility:farm_agriculture', kind: 'facility', id: 'farm_agriculture', label: 'Perkebunan', bgStart: '#0f2b17', bgEnd: '#070d16', accent: '#4ade80' },
  'facility:mine_extraction': { key: 'facility:mine_extraction', kind: 'facility', id: 'mine_extraction', label: 'Tambang Mineral', bgStart: '#26201b', bgEnd: '#0a0d16', accent: '#fbbf24' },
  'facility:power_plant_green': { key: 'facility:power_plant_green', kind: 'facility', id: 'power_plant_green', label: 'Energi Hijau', bgStart: '#092c22', bgEnd: '#070e17', accent: '#34d399' },
  'facility:tech_software': { key: 'facility:tech_software', kind: 'facility', id: 'tech_software', label: 'Studio Cloud', bgStart: '#0c2440', bgEnd: '#070b16', accent: '#38bdf8' },
  'facility:media_telecom': { key: 'facility:media_telecom', kind: 'facility', id: 'media_telecom', label: 'Stasiun Media', bgStart: '#2e122b', bgEnd: '#080b16', accent: '#f472b6' },
  'facility:rd_center': { key: 'facility:rd_center', kind: 'facility', id: 'rd_center', label: 'Pusat R&D', bgStart: '#1e1c47', bgEnd: '#080b16', accent: '#a78bfa' },
  'facility:corporate_hq': { key: 'facility:corporate_hq', kind: 'facility', id: 'corporate_hq', label: 'Menara HQ', bgStart: '#0e2847', bgEnd: '#060b16', accent: '#fbbf24' },
};

export function getAssetRegistryStats() {
  const specs = Object.values(ASSET_CATALOG);
  return {
    total: specs.length,
    products: specs.filter(s => s.kind === 'product').length,
    companies: specs.filter(s => s.kind === 'company').length,
    facilities: specs.filter(s => s.kind === 'facility').length,
    keys: Object.keys(ASSET_CATALOG),
  };
}

const ASSET_CACHE = new Map<string, string>();
const MAX_ASSET_CACHE_ENTRIES = 160;
const LOGICAL_SIZE = 192;
const OUTPUT_SIZE = 256; // 1.33x Hi-DPI oversampling for razor-sharp anti-aliased edges

function synthesizeCleanStudioBackdrop(
  ctx: CanvasRenderingContext2D,
  bgStart: string,
  bgEnd: string,
  accent: string
) {
  const rad = ctx.createRadialGradient(
    LOGICAL_SIZE * 0.5,
    LOGICAL_SIZE * 0.36,
    12,
    LOGICAL_SIZE * 0.5,
    LOGICAL_SIZE * 0.5,
    LOGICAL_SIZE * 0.74
  );
  rad.addColorStop(0, bgStart);
  rad.addColorStop(1, bgEnd);
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

  // Soft studio rim glow behind foreground object (no noisy lines)
  const glow = ctx.createRadialGradient(
    LOGICAL_SIZE * 0.5,
    LOGICAL_SIZE * 0.44,
    8,
    LOGICAL_SIZE * 0.5,
    LOGICAL_SIZE * 0.44,
    72
  );
  glow.addColorStop(0, `${accent}3d`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
}

function renderWithCanvas(
  cacheKey: string,
  bgStart: string,
  bgEnd: string,
  accent: string,
  useStudioBackdrop: boolean,
  drawFn: (ctx: CanvasRenderingContext2D) => void
): string | null {
  const cached = ASSET_CACHE.get(cacheKey);
  if (cached) {
    // Refresh LRU order
    ASSET_CACHE.delete(cacheKey);
    ASSET_CACHE.set(cacheKey, cached);
    return cached;
  }

  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.scale(OUTPUT_SIZE / LOGICAL_SIZE, OUTPUT_SIZE / LOGICAL_SIZE);

  if (useStudioBackdrop) {
    synthesizeCleanStudioBackdrop(ctx, bgStart, bgEnd, accent);
  }
  drawFn(ctx);
  ctx.restore();

  const url = canvas.toDataURL('image/png');
  if (ASSET_CACHE.size >= MAX_ASSET_CACHE_ENTRIES) {
    const oldestKey = ASSET_CACHE.keys().next().value;
    if (oldestKey) ASSET_CACHE.delete(oldestKey);
  }
  ASSET_CACHE.set(cacheKey, url);
  return url;
}

export function getGeneratedProductAsset(id: ProductId | string): string | null {
  const spec = ASSET_CATALOG[`product:${id}`];
  return renderWithCanvas(
    `product:${id}`,
    spec?.bgStart || '#132036',
    spec?.bgEnd || '#070c17',
    spec?.accent || '#38bdf8',
    true,
    ctx => drawProductVisual(ctx, id)
  );
}

export function getGeneratedCompanyLogo(
  companyId: string,
  personality?: string,
  color = '#0284c7',
  accentColor = '#38bdf8'
): string | null {
  const spec = ASSET_CATALOG[`company:${companyId}`];
  const cacheKey = spec
    ? `company:${companyId}`
    : `company:${companyId}:${personality || 'default'}:${color}`;

  return renderWithCanvas(
    cacheKey,
    spec?.bgStart || '#0f1c32',
    spec?.bgEnd || '#070b15',
    spec?.accent || accentColor,
    false, // Full-bleed brand tiles paint edge-to-edge cleanly without outer box margins
    ctx => drawCompanyLogoVisual(ctx, companyId, personality, color, accentColor)
  );
}

export function getGeneratedFacilityAsset(type: FacilityType | string): string | null {
  const spec = ASSET_CATALOG[`facility:${type}`];
  return renderWithCanvas(
    `facility:${type}`,
    spec?.bgStart || '#111d33',
    spec?.bgEnd || '#070c17',
    spec?.accent || '#38bdf8',
    true,
    ctx => drawFacilityVisual(ctx, type)
  );
}

export function prewarmAssetCache() {
  if (typeof document === 'undefined') return 0;
  for (const spec of Object.values(ASSET_CATALOG)) {
    if (spec.kind === 'product') getGeneratedProductAsset(spec.id);
    else if (spec.kind === 'company') getGeneratedCompanyLogo(spec.id);
    else getGeneratedFacilityAsset(spec.id);
  }
  return ASSET_CACHE.size;
}
