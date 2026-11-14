import { Facility, MapParcel, Company, CityBiome } from '../types/game';
import {
  BuildingHitbox,
  Camera,
  IsometricRenderOptions,
  MiniVehicle,
  PooledParticle,
} from './iso/types';
import {
  drawDiverseFacility,
  drawForSaleMarker,
  drawIsoBox,
  drawIsoTree,
  drawResourceDepositDecal,
  drawTickerBadge,
} from './iso/buildingRenderer';
import { RESIDENT_OWNER_ID } from './productsData';
import { drawFlatTexturedGroundTile, drawFlatWaterTile } from './terrainTextureEngine';

export type { Camera, PooledParticle, MiniVehicle };

const WATER_FILL_LUT = Array.from({ length: 25 }, (_, i) => `rgb(14, 72, ${124 + i})`);

export class IsometricEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tileWidth = 64;
  tileHeight = 32;
  gridSize = 32;

  camera: Camera = {
    x: 0,
    y: 0,
    zoom: 1.0,
    targetX: 0,
    targetY: 0,
    targetZoom: 1.0,
    velX: 0,
    velY: 0,
  };

  centerTargetTile: { x: number; y: number } = { x: 16, y: 16 };
  selectedTile: { x: number; y: number } | null = null;
  highlightTile: { x: number; y: number } | null = null;

  // Zero-GC fixed-capacity particle ring buffer with O(1) active count
  private readonly particlePool: PooledParticle[] = [];
  private poolCursor = 0;
  private activeParticleCount = 0;

  // Flat O(1) parcel index & front-to-back building hitbox list
  private parcelGrid: (MapParcel | null)[] = [];
  private lastParcelsRef: MapParcel[] | null = null;
  private lastFacilitiesRef: Record<string, Facility> | null = null;
  private lastOptsKey = '';
  private isDirty = true;
  private lastAmbientDraw = 0;
  private buildingHitboxes: BuildingHitbox[] = [];

  private vehicles: MiniVehicle[] = [];
  private animTime = 0;
  private smokeTimer = 0;
  private lastTimestamp = 0;
  private viewWidth = 390;
  private viewHeight = 700;
  private hasInitializedCamera = false;

  // Offscreen static terrain bitmap bake cache
  private groundCache: HTMLCanvasElement | null = null;
  private groundCacheOriginX = 0;
  private groundCacheOriginY = 0;
  private bakedGridSize = 0;
  private activeCityId = 'city_metro_1';
  private activeBiome: CityBiome = 'coastal_metro';
  private bakedCityKey = '';

  // Unified Pointer Events state
  private activePointers = new Map<number, { x: number; y: number }>();
  private primaryPointerId: number | null = null;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private camStartX = 0;
  private camStartY = 0;
  private pinchStartDist = 0;
  private pinchOccurred = false;
  private hasMovedSignificantly = false;
  private cleanupEvents: (() => void) | null = null;

  onTileSelected?: (tile: { x: number; y: number }) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('2D canvas context unavailable');
    this.ctx = context;

    for (let i = 0; i < 20; i++) {
      this.particlePool.push({
        active: false,
        x: 0,
        y: 0,
        vy: 0,
        alpha: 0,
        text: '',
        color: '#34d399',
        size: 3,
        isSmoke: false,
      });
    }

    this.setupVehicles();
    this.initEvents();
  }

  private setupVehicles() {
    this.vehicles = [
      { x: 2, y: 5, axis: 'x', laneCoord: 5, dir: 1, speed: 1.9, color: '#38bdf8' },
      { x: 24, y: 13, axis: 'x', laneCoord: 13, dir: -1, speed: 1.7, color: '#34d399' },
      { x: 6, y: 21, axis: 'x', laneCoord: 21, dir: 1, speed: 1.6, color: '#fbbf24' },
      { x: 14, y: 29, axis: 'x', laneCoord: 29, dir: -1, speed: 1.5, color: '#e2e8f0' },
      { x: 5, y: 4, axis: 'y', laneCoord: 5, dir: 1, speed: 1.5, color: '#f87171' },
      { x: 13, y: 22, axis: 'y', laneCoord: 13, dir: -1, speed: 1.8, color: '#a78bfa' },
      { x: 21, y: 6, axis: 'y', laneCoord: 21, dir: 1, speed: 1.7, color: '#38bdf8' },
      { x: 29, y: 16, axis: 'y', laneCoord: 29, dir: -1, speed: 1.4, color: '#fb923c' },
      { x: 16, y: 13, axis: 'x', laneCoord: 13, dir: 1, speed: 2.0, color: '#2dd4bf' },
      { x: 13, y: 9, axis: 'y', laneCoord: 13, dir: 1, speed: 1.4, color: '#facc15' },
    ];
  }

  resize(width: number, height: number) {
    const prevW = this.viewWidth;
    const prevH = this.viewHeight;
    this.viewWidth = width;
    this.viewHeight = height;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!this.hasInitializedCamera) {
      this.centerCameraOn(this.centerTargetTile.x, this.centerTargetTile.y, false);
      this.hasInitializedCamera = true;
    } else {
      const dw = (width - prevW) / 2;
      const dh = (height - prevH) / 2;
      this.camera.x += dw;
      this.camera.y += dh;
      this.camera.targetX += dw;
      this.camera.targetY += dh;
      this.clampCamera();
    }
    this.isDirty = true;
  }

  private clampCamera() {
    const maxPanX = this.gridSize * this.tileWidth * 0.55 * this.camera.zoom;
    const minWorldY = -40 * this.camera.zoom;
    const maxWorldY = this.gridSize * this.tileHeight * this.camera.zoom;

    const centerX = this.viewWidth / 2;
    const centerY = this.viewHeight / 2;

    const minX = centerX - maxPanX;
    const maxX = centerX + maxPanX;
    const minY = centerY - maxWorldY;
    const maxY = centerY - minWorldY;

    this.camera.targetX = Math.max(minX, Math.min(maxX, this.camera.targetX));
    this.camera.targetY = Math.max(minY, Math.min(maxY, this.camera.targetY));
    this.camera.x = Math.max(minX - 60, Math.min(maxX + 60, this.camera.x));
    this.camera.y = Math.max(minY - 60, Math.min(maxY + 60, this.camera.y));
  }

  centerCameraOn(tileX: number, tileY: number, smooth = true) {
    this.centerTargetTile = { x: tileX, y: tileY };
    const halfW = this.tileWidth * 0.5;
    const halfH = this.tileHeight * 0.5;
    const sx = (tileX - tileY) * halfW;
    const sy = (tileX + tileY) * halfH;
    const w = this.viewWidth || this.canvas.clientWidth || 390;
    const h = this.viewHeight || this.canvas.clientHeight || 700;

    const targetX = w / 2 - sx * this.camera.zoom;
    const targetY = h / 2 - sy * this.camera.zoom;

    if (!smooth) {
      this.camera.x = targetX;
      this.camera.y = targetY;
      this.camera.targetX = targetX;
      this.camera.targetY = targetY;
      this.camera.velX = 0;
      this.camera.velY = 0;
    } else {
      this.camera.targetX = targetX;
      this.camera.targetY = targetY;
    }
    this.clampCamera();
    this.isDirty = true;
  }

  setZoom(nextZoom: number) {
    const clamped = Math.max(0.4, Math.min(2.2, nextZoom));
    const w = this.viewWidth || this.canvas.clientWidth || 390;
    const h = this.viewHeight || this.canvas.clientHeight || 700;
    const cx = w / 2;
    const cy = h / 2;

    const worldX = (cx - this.camera.targetX) / this.camera.targetZoom;
    const worldY = (cy - this.camera.targetY) / this.camera.targetZoom;
    this.camera.targetZoom = clamped;
    this.camera.targetX = cx - worldX * clamped;
    this.camera.targetY = cy - worldY * clamped;
    this.clampCamera();
    this.isDirty = true;
  }

  tileToScreen(tx: number, ty: number): { x: number; y: number } {
    return {
      x: (tx - ty) * (this.tileWidth * 0.5),
      y: (tx + ty) * (this.tileHeight * 0.5),
    };
  }

  screenToTile(screenX: number, screenY: number): { x: number; y: number } {
    const wx = (screenX - this.camera.x) / this.camera.zoom;
    const wy = (screenY - this.camera.y) / this.camera.zoom;

    // 1. Front-to-back 2.5D extruded building hit-test
    for (let i = this.buildingHitboxes.length - 1; i >= 0; i--) {
      const box = this.buildingHitboxes[i];
      if (wx >= box.minX && wx <= box.maxX && wy >= box.minY && wy <= box.maxY) {
        return { x: box.tileX, y: box.tileY };
      }
    }

    // 2. Ground isometric diamond projection fallback
    const halfW = this.tileWidth * 0.5;
    const halfH = this.tileHeight * 0.5;
    const tx = (wx / halfW + wy / halfH) * 0.5;
    const ty = (wy / halfH - wx / halfW) * 0.5;
    return { x: Math.floor(tx), y: Math.floor(ty) };
  }

  private spawnParticle(
    x: number,
    y: number,
    vy: number,
    alpha: number,
    isSmoke: boolean,
    text = '',
    color = '#34d399',
    size = 3
  ) {
    const p = this.particlePool[this.poolCursor];
    this.poolCursor = (this.poolCursor + 1) % this.particlePool.length;
    if (!p.active) this.activeParticleCount++;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vy = vy;
    p.alpha = alpha;
    p.isSmoke = isSmoke;
    p.text = text;
    p.color = color;
    p.size = size;
    this.isDirty = true;
  }

  addMoneyParticle(tileX: number, tileY: number, text: string) {
    const sx = (tileX - tileY) * (this.tileWidth * 0.5);
    const sy = (tileX + tileY) * (this.tileHeight * 0.5);
    this.spawnParticle(sx, sy - 52, -24, 1.0, false, text, '#34d399', 10);
  }

  private addSmokeParticleAtScreen = (sx: number, sy: number, offsetJitter: number) => {
    let activeSmoke = 0;
    for (let i = 0; i < this.particlePool.length; i++) {
      if (this.particlePool[i].active && this.particlePool[i].isSmoke) activeSmoke++;
    }
    if (activeSmoke >= 8) return;

    this.spawnParticle(sx + offsetJitter, sy, -18, 0.55, true, '', '#cbd5e1', 3.2);
  };

  private initEvents() {
    const el = this.canvas;

    const onPointerDown = (e: PointerEvent) => {
      if (e.target !== el) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      el.setPointerCapture(e.pointerId);
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activePointers.size === 1) {
        this.primaryPointerId = e.pointerId;
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.camStartX = this.camera.x;
        this.camStartY = this.camera.y;
        this.camera.velX = 0;
        this.camera.velY = 0;
        this.hasMovedSignificantly = false;
        this.pinchOccurred = false;
      } else if (this.activePointers.size === 2) {
        this.isDragging = false;
        this.pinchOccurred = true;
        const pts = Array.from(this.activePointers.values());
        this.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (this.activePointers.size === 2) {
        const pts = Array.from(this.activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.pinchStartDist > 0 && dist > 0) {
          this.setZoom(this.camera.targetZoom * (dist / this.pinchStartDist));
          this.pinchStartDist = dist;
        }
        return;
      }

      if (this.isDragging && e.pointerId === this.primaryPointerId) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (Math.abs(dx) > 7 || Math.abs(dy) > 7) {
          this.hasMovedSignificantly = true;
        }

        this.camera.velX = e.clientX - this.lastPointerX;
        this.camera.velY = e.clientY - this.lastPointerY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;

        this.camera.x = this.camStartX + dx;
        this.camera.y = this.camStartY + dy;
        this.camera.targetX = this.camera.x;
        this.camera.targetY = this.camera.y;
        this.clampCamera();
        this.isDirty = true;
      } else if (e.pointerType === 'mouse' && e.target === el) {
        const rect = el.getBoundingClientRect();
        const pt = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
        const nextHighlight =
          pt.x >= 0 && pt.x < this.gridSize && pt.y >= 0 && pt.y < this.gridSize ? pt : null;
        if (
          this.highlightTile?.x !== nextHighlight?.x ||
          this.highlightTile?.y !== nextHighlight?.y
        ) {
          this.highlightTile = nextHighlight;
          this.isDirty = true;
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasPrimary = e.pointerId === this.primaryPointerId;
      this.activePointers.delete(e.pointerId);
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }

      if (wasPrimary) {
        if (
          e.type === 'pointerup' &&
          !this.hasMovedSignificantly &&
          !this.pinchOccurred &&
          this.isDragging
        ) {
          const rect = el.getBoundingClientRect();
          const pt = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
          if (pt.x >= 0 && pt.x < this.gridSize && pt.y >= 0 && pt.y < this.gridSize) {
            this.selectedTile = pt;
            this.isDirty = true;
            this.onTileSelected?.(pt);
          }
        }
        this.isDragging = false;
        this.primaryPointerId = null;
      }

      if (this.activePointers.size < 2) {
        this.pinchStartDist = 0;
      }
    };

    const onPointerLeave = () => {
      if (this.highlightTile) {
        this.highlightTile = null;
        this.isDirty = true;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.setZoom(this.camera.targetZoom * factor);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('wheel', onWheel, { passive: false });

    this.cleanupEvents = () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('wheel', onWheel);
    };
  }

  destroy() {
    this.cleanupEvents?.();
    this.cleanupEvents = null;
    this.activePointers.clear();
    this.groundCache = null;
    this.parcelGrid = [];
    this.buildingHitboxes = [];
  }

  private syncParcelGrid(parcels: MapParcel[]) {
    if (parcels === this.lastParcelsRef) return;
    this.lastParcelsRef = parcels;

    const detectedSize = Math.round(Math.sqrt(parcels.length)) || 32;
    if (detectedSize !== this.gridSize) {
      this.gridSize = detectedSize;
      this.bakedGridSize = 0;
    }

    const total = this.gridSize * this.gridSize;
    if (this.parcelGrid.length !== total) {
      this.parcelGrid = new Array(total).fill(null);
    } else {
      this.parcelGrid.fill(null);
    }

    for (let i = 0; i < parcels.length; i++) {
      const p = parcels[i];
      if (p.x >= 0 && p.x < this.gridSize && p.y >= 0 && p.y < this.gridSize) {
        this.parcelGrid[p.y * this.gridSize + p.x] = p;
      }
    }
  }

  private bakeStaticGround() {
    const pad = 96;
    const width = this.gridSize * this.tileWidth + pad * 2;
    const height = this.gridSize * this.tileHeight + pad * 2;
    const originX = width / 2;
    const originY = pad + this.tileHeight;
    const halfW = this.tileWidth * 0.5;
    const halfH = this.tileHeight * 0.5;

    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const octx = off.getContext('2d');
    if (!octx) return;

    for (let sum = 0; sum <= (this.gridSize - 1) * 2; sum++) {
      for (let x = 0; x <= sum; x++) {
        const y = sum - x;
        if (x >= this.gridSize || y >= this.gridSize) continue;
        const parcel = this.parcelGrid[y * this.gridSize + x];
        if (!parcel || parcel.terrainType === 'water') continue;

        const px = originX + (x - y) * halfW;
        const py = originY + (x + y) * halfH;
        this.drawStaticGroundTile(octx, px, py, parcel);
      }
    }

    this.groundCache = off;
    this.groundCacheOriginX = originX;
    this.groundCacheOriginY = originY;
    this.bakedGridSize = this.gridSize;
    this.bakedCityKey = `${this.activeCityId}_${this.activeBiome}`;
  }

  render(
    parcels: MapParcel[],
    facilities: Record<string, Facility>,
    companies: Record<string, Company>,
    timestamp?: number,
    options?: IsometricRenderOptions
  ) {
    const now = timestamp ?? performance.now();
    const showBadges = options?.showBadges !== false;
    const focusCompanyId = options?.focusCompanyId || null;
    const showTrafficOverlay = Boolean(options?.showTrafficOverlay);
    const showResourcesOverlay = Boolean(options?.showResourcesOverlay);
    const showResidentFocus = Boolean(options?.showResidentFocus);
    const nextCityId = options?.cityId || 'city_metro_1';
    const nextBiome: CityBiome = options?.cityBiome || 'coastal_metro';
    const nextCityKey = `${nextCityId}_${nextBiome}`;
    const optsKey = `${showBadges ? 1 : 0}_${focusCompanyId || ''}_${showTrafficOverlay ? 1 : 0}_${showResourcesOverlay ? 1 : 0}_${showResidentFocus ? 1 : 0}_${nextCityKey}`;

    if (
      parcels !== this.lastParcelsRef ||
      facilities !== this.lastFacilitiesRef ||
      optsKey !== this.lastOptsKey
    ) {
      this.activeCityId = nextCityId;
      this.activeBiome = nextBiome;
      this.lastFacilitiesRef = facilities;
      this.lastOptsKey = optsKey;
      this.isDirty = true;
    }

    const cameraMoving =
      this.isDragging ||
      Math.abs(this.camera.velX) > 0.08 ||
      Math.abs(this.camera.velY) > 0.08 ||
      Math.abs(this.camera.targetX - this.camera.x) > 0.25 ||
      Math.abs(this.camera.targetY - this.camera.y) > 0.25 ||
      Math.abs(this.camera.targetZoom - this.camera.zoom) > 0.002;

    if (!this.isDirty && !cameraMoving && this.activeParticleCount === 0 && now - this.lastAmbientDraw < 85) {
      return;
    }

    this.isDirty = false;
    this.lastAmbientDraw = now;

    const rawDt = this.lastTimestamp ? (now - this.lastTimestamp) / 1000 : 0.016;
    const dt = Math.min(rawDt, 0.09);
    this.lastTimestamp = now;
    this.animTime += dt * 1.5;
    this.smokeTimer += dt;

    this.syncParcelGrid(parcels);
    if ((this.bakedGridSize !== this.gridSize || this.bakedCityKey !== nextCityKey) && parcels.length > 0) {
      this.bakeStaticGround();
    }

    const ctx = this.ctx;
    const w = this.viewWidth || this.canvas.clientWidth || 390;
    const h = this.viewHeight || this.canvas.clientHeight || 700;

    if (!this.isDragging) {
      if (Math.abs(this.camera.velX) > 0.1 || Math.abs(this.camera.velY) > 0.1) {
        this.camera.targetX += this.camera.velX;
        this.camera.targetY += this.camera.velY;
        const friction = Math.pow(0.92, dt * 60);
        this.camera.velX *= friction;
        this.camera.velY *= friction;
        this.clampCamera();
      }
      const lerp = 1 - Math.pow(0.001, dt);
      this.camera.x += (this.camera.targetX - this.camera.x) * lerp;
      this.camera.y += (this.camera.targetY - this.camera.y) * lerp;
    }
    const zoomLerp = 1 - Math.pow(0.0005, dt);
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * zoomLerp;

    ctx.fillStyle = '#09111e';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    if (this.groundCache) {
      ctx.drawImage(this.groundCache, -this.groundCacheOriginX, -this.groundCacheOriginY);
    }

    const invZ = 1 / this.camera.zoom;
    const viewMinX = -this.camera.x * invZ - 110;
    const viewMaxX = (w - this.camera.x) * invZ + 110;
    const viewMinY = -this.camera.y * invZ - 130;
    const viewMaxY = (h - this.camera.y) * invZ + 160;

    const waterOffset = Math.max(0, Math.min(24, Math.round(12 + Math.sin(this.animTime) * 12)));
    const waterFill = WATER_FILL_LUT[waterOffset];
    const waterStroke = 'rgba(125, 211, 252, 0.28)';

    const emitSmokeNow = this.smokeTimer >= 0.45;
    if (emitSmokeNow) this.smokeTimer = 0;

    this.buildingHitboxes.length = 0;

    const halfW = this.tileWidth * 0.5;
    const halfH = this.tileHeight * 0.5;
    const maxSum = (this.gridSize - 1) * 2;
    const selX = this.selectedTile ? this.selectedTile.x : -1;
    const selY = this.selectedTile ? this.selectedTile.y : -1;
    const hiX = this.highlightTile ? this.highlightTile.x : -1;
    const hiY = this.highlightTile ? this.highlightTile.y : -1;

    for (let sum = 0; sum <= maxSum; sum++) {
      const xStart = Math.max(0, sum - (this.gridSize - 1));
      const xEnd = Math.min(this.gridSize - 1, sum);

      for (let x = xStart; x <= xEnd; x++) {
        const y = sum - x;
        const parcel = this.parcelGrid[y * this.gridSize + x];
        if (!parcel) continue;

        const px = (x - y) * halfW;
        const py = (x + y) * halfH;
        if (px < viewMinX || px > viewMaxX || py < viewMinY || py > viewMaxY) {
          continue;
        }

        if (parcel.terrainType === 'water') {
          drawFlatWaterTile(
            ctx,
            px,
            py,
            this.tileWidth,
            this.tileHeight,
            waterFill,
            waterStroke,
            x,
            y,
            this.animTime
          );
        } else {
          if (showTrafficOverlay && parcel.terrainType !== 'road') {
            this.drawTrafficHeatTile(ctx, px, py, parcel.trafficIndex ?? 20);
          }

          // Player-owned vacant land border
          if (!parcel.facilityId && parcel.ownerCompanyId && parcel.ownerCompanyId !== RESIDENT_OWNER_ID) {
            this.drawTileHighlight(ctx, px, py, '#38bdf8', 1.4, true);
          }

          // Discovered natural resource deposit decal
          if (parcel.resourceDeposit?.discovered && !parcel.facilityId) {
            drawResourceDepositDecal(
              ctx,
              px,
              py,
              parcel.resourceDeposit,
              showBadges || showResourcesOverlay
            );
          } else if (
            !parcel.facilityId &&
            parcel.terrainType === 'grass' &&
            parcel.isZoneAllowed &&
            !parcel.ownerCompanyId &&
            ((x * 13 + y * 29) % 11 === 0)
          ) {
            // Natural scattered meadow groves on vacant green parcels (avoid road intersections & deposits)
            drawIsoTree(ctx, px - 9, py - 2, 0.72);
            drawIsoTree(ctx, px + 7, py + 2, 0.65);
          }

          // Miniature FOR SALE yard placard on prime road-adjacent vacant parcels or when Resources overlay is active
          if (
            !parcel.facilityId &&
            !parcel.ownerCompanyId &&
            parcel.isZoneAllowed &&
            parcel.terrainType !== 'road' &&
            !parcel.resourceDeposit?.discovered &&
            (showResourcesOverlay ||
              (this.camera.zoom >= 1.0 && (x * 7 + y * 11) % 17 === 0) ||
              (x === hiX && y === hiY))
          ) {
            drawForSaleMarker(ctx, px + 8, py + 3);
          }
        }

        if (x === selX && y === selY) {
          this.drawTileHighlight(ctx, px, py, '#38bdf8', 2.4, true);
        } else if (x === hiX && y === hiY) {
          this.drawTileHighlight(ctx, px, py, '#facc15', 1.3, false);
        }

        if (parcel.facilityId) {
          const fac = facilities[parcel.facilityId];
          if (fac) {
            const comp = companies[fac.companyId];
            const isRes = fac.companyId === RESIDENT_OWNER_ID || fac.type === 'resident_house';
            const dimmed =
              (focusCompanyId && fac.companyId !== focusCompanyId) ||
              (showResidentFocus && !isRes) ||
              (showResourcesOverlay &&
                fac.type !== 'mine_extraction' &&
                fac.type !== 'farm_agriculture');
            if (dimmed) ctx.globalAlpha = 0.35;
            const drawBadge =
              showBadges &&
              (!focusCompanyId || fac.companyId === focusCompanyId) &&
              (!showResidentFocus || isRes);
            const bHeight = drawDiverseFacility(
              ctx,
              px,
              py,
              this.tileWidth,
              this.tileHeight,
              this.animTime,
              fac,
              comp,
              emitSmokeNow,
              drawBadge,
              this.addSmokeParticleAtScreen
            );
            if (dimmed) ctx.globalAlpha = 1;

            this.buildingHitboxes.push({
              tileX: x,
              tileY: y,
              minX: px - (halfW - 2),
              maxX: px + (halfW - 2),
              minY: py - bHeight - this.tileHeight * 0.55,
              maxY: py + this.tileHeight * 0.45,
            });
          }
        }
      }
    }

    this.drawSeaportHarbor(ctx, showBadges, viewMinX, viewMaxX, viewMinY, viewMaxY);
    this.updateAndDrawVehicles(ctx, dt, viewMinX, viewMaxX, viewMinY, viewMaxY);
    this.updateAndDrawParticles(ctx, dt);

    ctx.restore();
  }

  /**
   * Computes which tile center the camera is currently looking at (for minimap viewport framing).
   */
  getCameraViewportBounds(): { centerTileX: number; centerTileY: number; spanTilesX: number; spanTilesY: number } {
    const w = this.viewWidth || this.canvas.clientWidth || 390;
    const h = this.viewHeight || this.canvas.clientHeight || 700;
    const center = this.screenToTile(w * 0.5, h * 0.5);
    const spanTilesX = Math.max(4, Math.min(this.gridSize, Math.round(w / (this.tileWidth * this.camera.zoom * 0.65))));
    const spanTilesY = Math.max(4, Math.min(this.gridSize, Math.round(h / (this.tileHeight * this.camera.zoom * 0.65))));
    return {
      centerTileX: Math.max(0, Math.min(this.gridSize - 1, center.x)),
      centerTileY: Math.max(0, Math.min(this.gridSize - 1, center.y)),
      spanTilesX,
      spanTilesY,
    };
  }

  private drawStaticGroundTile(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    parcel: MapParcel
  ) {
    const eastWater =
      parcel.x + 1 < this.gridSize &&
      this.parcelGrid[parcel.y * this.gridSize + (parcel.x + 1)]?.terrainType === 'water';
    const southWater =
      parcel.y + 1 < this.gridSize &&
      this.parcelGrid[(parcel.y + 1) * this.gridSize + parcel.x]?.terrainType === 'water';

    drawFlatTexturedGroundTile(
      ctx,
      px,
      py,
      this.tileWidth,
      this.tileHeight,
      this.gridSize,
      parcel,
      this.activeBiome,
      eastWater,
      southWater
    );
  }

  private drawTrafficHeatTile(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    trafficIndex: number
  ) {
    const hw = this.tileWidth * 0.5 - 2;
    const hh = this.tileHeight * 0.5 - 1;
    ctx.beginPath();
    ctx.moveTo(px, py - hh);
    ctx.lineTo(px + hw, py);
    ctx.lineTo(px, py + hh);
    ctx.lineTo(px - hw, py);
    ctx.closePath();

    if (trafficIndex >= 72) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.36)';
    } else if (trafficIndex >= 48) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
    } else if (trafficIndex >= 28) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
    } else {
      ctx.fillStyle = 'rgba(100, 116, 139, 0.08)';
    }
    ctx.fill();
  }

  private drawSeaportHarbor(
    ctx: CanvasRenderingContext2D,
    showBadge: boolean,
    viewMinX: number,
    viewMaxX: number,
    viewMinY: number,
    viewMaxY: number
  ) {
    const portCoord = Math.max(12, this.gridSize - 3);
    const sx = 0; // (portCoord - portCoord) * halfW
    const sy = (portCoord + portCoord) * (this.tileHeight * 0.5);
    if (sx < viewMinX || sx > viewMaxX || sy < viewMinY || sy > viewMaxY) {
      return;
    }

    drawIsoBox(ctx, sx, sy, 22, 11, 5, '#334155', '#475569', '#64748b');
    drawIsoBox(ctx, sx - 8, sy - 5, 7, 3.5, 5, '#be123c', '#e11d48', '#fb7185');
    drawIsoBox(ctx, sx + 7, sy - 5, 7, 3.5, 5, '#0369a1', '#0284c7', '#38bdf8');
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - 10, sy - 6);
    ctx.lineTo(sx - 10, sy - 26);
    ctx.lineTo(sx + 14, sy - 26);
    ctx.moveTo(sx - 10, sy - 20);
    ctx.lineTo(sx + 2, sy - 26);
    ctx.stroke();
    if (showBadge) {
      drawTickerBadge(ctx, sx, sy - 38, 'PORT', '#0f766e');
    }
  }

  private drawTileHighlight(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    color: string,
    width: number,
    glow: boolean
  ) {
    const hw = this.tileWidth * 0.5;
    const hh = this.tileHeight * 0.5;

    ctx.beginPath();
    ctx.moveTo(px, py - hh);
    ctx.lineTo(px + hw, py);
    ctx.lineTo(px, py + hh);
    ctx.lineTo(px - hw, py);
    ctx.closePath();

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (glow) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.fill();
    }
    ctx.stroke();
  }

  private updateAndDrawVehicles(
    ctx: CanvasRenderingContext2D,
    dt: number,
    viewMinX: number,
    viewMaxX: number,
    viewMinY: number,
    viewMaxY: number
  ) {
    const maxCoord = this.gridSize - 2;
    const halfW = this.tileWidth * 0.5;
    const halfH = this.tileHeight * 0.5;

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.axis === 'x') {
        v.x += v.dir * v.speed * dt;
        if (v.x >= maxCoord) v.dir = -1;
        else if (v.x <= 1) v.dir = 1;
        v.y = v.laneCoord;
      } else {
        v.y += v.dir * v.speed * dt;
        if (v.y >= maxCoord) v.dir = -1;
        else if (v.y <= 1) v.dir = 1;
        v.x = v.laneCoord;
      }

      const sx = (v.x - v.y) * halfW;
      const sy = (v.x + v.y) * halfH;
      if (sx < viewMinX || sx > viewMaxX || sy < viewMinY || sy > viewMaxY) {
        continue;
      }
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.arc(sx, sy - 2.5, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private updateAndDrawParticles(ctx: CanvasRenderingContext2D, dt: number) {
    if (this.activeParticleCount === 0) return;

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';

    for (let i = 0; i < this.particlePool.length; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;

      p.y += p.vy * dt;
      p.alpha -= dt * 0.9;
      if (p.alpha <= 0) {
        p.active = false;
        this.activeParticleCount = Math.max(0, this.activeParticleCount - 1);
        continue;
      }

      ctx.globalAlpha = p.alpha;
      if (p.isSmoke) {
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.text) {
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      }
    }
    ctx.globalAlpha = 1;
  }
}
