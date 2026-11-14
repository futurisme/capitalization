export interface Camera {
  x: number;
  y: number;
  zoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
  velX: number;
  velY: number;
}

export interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  alpha: number;
  text: string;
  color: string;
  size: number;
  isSmoke: boolean;
}

export interface MiniVehicle {
  x: number;
  y: number;
  axis: 'x' | 'y';
  laneCoord: number;
  dir: 1 | -1;
  speed: number;
  color: string;
}

export interface BuildingHitbox {
  tileX: number;
  tileY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface IsometricRenderOptions {
  showBadges?: boolean;
  focusCompanyId?: string | null;
  showTrafficOverlay?: boolean;
  showResourcesOverlay?: boolean;
  showResidentFocus?: boolean;
}
