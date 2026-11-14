import React, { useEffect, useRef, useState } from 'react';
import { SimulationState, Facility, MapParcel, CityBiome } from '../types/game';
import { IsometricEngine } from '../engine/isometricEngine';
import { getParcelAt } from '../engine/spatialGrid';
import { formatSignedCurrency, formatCostShort } from '../engine/precisionMath';
import {
  CITY_BIOME_META,
  GOVT_OWNER_ID,
  MAX_CITIES,
  RESIDENT_OWNER_ID,
  RESOURCE_DEPOSIT_META,
} from '../engine/productsData';
import {
  calculateResidentClaimCost,
  calculateResidentDemolishCost,
  isResidentFacility,
} from '../engine/housingEcosystem';
import {
  Plus,
  Minus,
  Crosshair,
  Hammer,
  Building,
  ArrowUpRight,
  Tag,
  Filter,
  Activity,
  Home,
  Gem,
  Trash2,
  MapPinCheck,
  Compass,
  Newspaper,
  ChevronDown,
  ChevronUp,
  Globe,
  X,
} from 'lucide-react';
import { FacilityIcon } from './IconHelper';

interface MapViewProps {
  state: SimulationState;
  onSelectFacility: (facility: Facility) => void;
  onOpenBuildModal: (selectedParcel?: MapParcel) => void;
  onClaimResident: (facilityId: string) => void;
  onDemolishResident: (facilityId: string) => void;
  onBuyLand: (x: number, y: number) => void;
  onSellLand: (x: number, y: number) => void;
  onSwitchCity: (cityId: string) => void;
  onCreateCity: (name: string, biome: CityBiome) => boolean;
}

export function MapView({
  state,
  onSelectFacility,
  onOpenBuildModal,
  onClaimResident,
  onDemolishResident,
  onBuyLand,
  onSellLand,
  onSwitchCity,
  onCreateCity,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<IsometricEngine | null>(null);
  const stateRef = useRef<SimulationState>(state);
  stateRef.current = state;

  const [selectedCoord, setSelectedCoord] = useState<{ x: number; y: number } | null>(null);
  const [showBadges, setShowBadges] = useState(true);
  const [onlyMine, setOnlyMine] = useState(false);
  const [showResidentFocus, setShowResidentFocus] = useState(false);
  const [showResourcesOverlay, setShowResourcesOverlay] = useState(false);
  const [showTrafficOverlay, setShowTrafficOverlay] = useState(false);
  const [showMacroDetails, setShowMacroDetails] = useState(true);
  const [mobileRadarOpen, setMobileRadarOpen] = useState(false);
  const [confirmDemolishRes, setConfirmDemolishRes] = useState(false);
  const [showNewCityModal, setShowNewCityModal] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newCityBiome, setNewCityBiome] = useState<CityBiome>('agri_valley');

  const isMinimapDraggingRef = useRef(false);
  const modalBackdropRef = useRef(false);

  const activeCityId = state.activeCityId || 'city_metro_1';
  const activeBiome: CityBiome = state.city.biome || 'coastal_metro';

  const renderOptsRef = useRef({
    showBadges: true,
    focusCompanyId: null as string | null,
    showTrafficOverlay: false,
    showResourcesOverlay: false,
    showResidentFocus: false,
    cityId: activeCityId,
    cityBiome: activeBiome,
  });
  renderOptsRef.current = {
    showBadges,
    focusCompanyId: onlyMine ? state.playerCompanyId : null,
    showTrafficOverlay,
    showResourcesOverlay,
    showResidentFocus,
    cityId: activeCityId,
    cityBiome: activeBiome,
  };

  useEffect(() => {
    setConfirmDemolishRes(false);
  }, [selectedCoord?.x, selectedCoord?.y]);

  useEffect(() => {
    setSelectedCoord(null);
    if (engineRef.current) {
      engineRef.current.selectedTile = null;
      const g = Math.round(Math.sqrt(state.mapParcels.length)) || 40;
      engineRef.current.centerCameraOn(Math.floor(g / 2), Math.floor(g / 2), false);
    }
  }, [activeCityId]);

  useEffect(() => {
    if (!showNewCityModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNewCityModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showNewCityModal]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;

    const engine = new IsometricEngine(canvas);
    engine.onTileSelected = tile => {
      setSelectedCoord(tile);
    };
    engineRef.current = engine;

    let hasCentered = false;
    const updateSize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        engine.resize(w, h);
        if (!hasCentered) {
          const g = Math.round(Math.sqrt(stateRef.current.mapParcels.length)) || 40;
          engine.centerCameraOn(Math.floor(g / 2), Math.floor(g / 2), false);
          hasCentered = true;
        }
      }
    };

    updateSize();
    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(container);

    const drawMinimap = () => {
      const mCanvas = minimapCanvasRef.current;
      if (!mCanvas) return;
      const mctx = mCanvas.getContext('2d');
      if (!mctx) return;

      const s = stateRef.current;
      const parcels = s.mapParcels;
      const facilities = s.facilities;
      const size = mCanvas.width;
      const grid = Math.round(Math.sqrt(parcels.length)) || 32;
      const pad = 8;
      const R = (size - pad * 2) * 0.5;
      const cx = size * 0.5;
      const topY = pad;

      mctx.fillStyle = '#07111f';
      mctx.fillRect(0, 0, size, size);

      // Diamond sea backdrop
      mctx.beginPath();
      mctx.moveTo(cx, topY);
      mctx.lineTo(cx + R, topY + R);
      mctx.lineTo(cx, topY + R * 2);
      mctx.lineTo(cx - R, topY + R);
      mctx.closePath();
      mctx.fillStyle = '#0c3b66';
      mctx.fill();
      mctx.strokeStyle = '#1e3a5f';
      mctx.lineWidth = 1;
      mctx.stroke();

      const invSpan = 1 / Math.max(1, grid - 1);
      for (let i = 0; i < parcels.length; i++) {
        const p = parcels[i];
        const u = p.x * invSpan;
        const v = p.y * invSpan;
        const px = cx + (u - v) * R;
        const py = topY + (u + v) * R;

        if (p.facilityId) {
          const fac = facilities[p.facilityId];
          if (fac) {
            if (fac.companyId === s.playerCompanyId) mctx.fillStyle = '#38bdf8';
            else if (fac.companyId === GOVT_OWNER_ID) mctx.fillStyle = '#2dd4bf';
            else if (fac.companyId === RESIDENT_OWNER_ID || fac.type === 'resident_house')
              mctx.fillStyle = '#fde047';
            else mctx.fillStyle = '#fb7185';
            mctx.fillRect(px - 1.5, py - 1.5, 3, 3);
            continue;
          }
        }

        if (p.terrainType === 'water') {
          continue;
        } else if (p.terrainType === 'road') {
          mctx.fillStyle = '#475569';
          mctx.fillRect(px - 1, py - 1, 2, 2);
        } else if (p.resourceDeposit?.discovered) {
          mctx.fillStyle = RESOURCE_DEPOSIT_META[p.resourceDeposit.type].color;
          mctx.fillRect(px - 1.5, py - 1.5, 3, 3);
        } else if (p.ownerCompanyId === s.playerCompanyId) {
          mctx.fillStyle = '#0ea5e9';
          mctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
        } else if (p.terrainType === 'industrial_zone') {
          mctx.fillStyle = '#3f4554';
          mctx.fillRect(px - 1, py - 1, 2, 2);
        } else if (p.terrainType === 'pavement') {
          mctx.fillStyle = '#64748b';
          mctx.fillRect(px - 1, py - 1, 2, 2);
        } else {
          mctx.fillStyle = '#376b37';
          mctx.fillRect(px - 1, py - 1, 2, 2);
        }
      }

      // Live camera viewport frame
      const bounds = engine.getCameraViewportBounds();
      const bu = bounds.centerTileX * invSpan;
      const bv = bounds.centerTileY * invSpan;
      const bx = cx + (bu - bv) * R;
      const by = topY + (bu + bv) * R;
      const rw = Math.max(12, Math.min(size - 16, (bounds.spanTilesX / grid) * R * 1.45));
      const rh = Math.max(9, Math.min(size - 16, (bounds.spanTilesY / grid) * R * 0.95));

      mctx.strokeStyle = '#f8fafc';
      mctx.lineWidth = 1.2;
      mctx.setLineDash([2, 2]);
      mctx.strokeRect(bx - rw * 0.5, by - rh * 0.5, rw, rh);
      mctx.setLineDash([]);
    };

    let minimapTick = 0;
    let animFrame: number;
    const loop = (ts: number) => {
      const s = stateRef.current;
      engine.render(s.mapParcels, s.facilities, s.companies, ts, renderOptsRef.current);
      if (minimapTick++ % 4 === 0) {
        drawMinimap();
      }
      animFrame = requestAnimationFrame(loop);
    };
    animFrame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrame);
      resizeObserver.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Subtle income popups on month advance
  useEffect(() => {
    if (!engineRef.current) return;
    const playerStores = Object.values(state.facilities).filter(
      f => f.companyId === state.playerCompanyId && f.monthlyRevenue > 0
    );
    if (playerStores.length > 0 && state.currentTick > 0) {
      const pick = playerStores[state.currentTick % playerStores.length];
      engineRef.current.addMoneyParticle(
        pick.tileX,
        pick.tileY,
        `+$${Math.round(pick.monthlyRevenue / 1000)}K`
      );
    }
  }, [state.currentTick]);

  const selectedParcel = selectedCoord
    ? getParcelAt(state.mapParcels, selectedCoord.x, selectedCoord.y) ?? null
    : null;

  const selectedFacility = selectedParcel?.facilityId
    ? state.facilities[selectedParcel.facilityId]
    : null;

  const selectedCompany = selectedFacility
    ? state.companies[selectedFacility.companyId]
    : null;

  const isSelectedResident = isResidentFacility(selectedFacility);

  const playerCash = state.companies[state.playerCompanyId]?.cash || 0;

  const panFromMinimapEvent = (clientX: number, clientY: number) => {
    const mCanvas = minimapCanvasRef.current;
    const engine = engineRef.current;
    if (!mCanvas || !engine) return;

    const rect = mCanvas.getBoundingClientRect();
    const mx = ((clientX - rect.left) / rect.width) * mCanvas.width;
    const my = ((clientY - rect.top) / rect.height) * mCanvas.height;

    const size = mCanvas.width;
    const pad = 8;
    const R = (size - pad * 2) * 0.5;
    const cx = size * 0.5;
    const topY = pad;

    const a = (mx - cx) / R; // u - v
    const b = (my - topY) / R; // u + v
    const u = Math.max(0, Math.min(1, (b + a) * 0.5));
    const v = Math.max(0, Math.min(1, (b - a) * 0.5));
    const grid = engine.gridSize || 32;
    engine.centerCameraOn(u * (grid - 1), v * (grid - 1), false);
  };

  const handleZoom = (inOut: 'in' | 'out') => {
    if (!engineRef.current) return;
    const delta = inOut === 'in' ? 1.25 : 0.8;
    engineRef.current.setZoom(engineRef.current.camera.targetZoom * delta);
  };

  const handleCenterHQ = () => {
    if (!engineRef.current) return;
    const hq = Object.values(state.facilities).find(
      f =>
        f.companyId === state.playerCompanyId &&
        f.type === 'corporate_hq' &&
        (f.cityId || 'city_metro_1') === activeCityId
    );
    if (hq) {
      engineRef.current.centerCameraOn(hq.tileX, hq.tileY, true);
      engineRef.current.selectedTile = { x: hq.tileX, y: hq.tileY };
      setSelectedCoord({ x: hq.tileX, y: hq.tileY });
    } else {
      const g = Math.round(Math.sqrt(state.mapParcels.length)) || 40;
      engineRef.current.centerCameraOn(Math.floor(g / 2), Math.floor(g / 2), true);
    }
  };

  const cycleLabel =
    state.macro.cyclePhase === 'boom'
      ? 'Ekspansi'
      : state.macro.cyclePhase === 'recession'
      ? 'Resesi'
      : state.macro.cyclePhase === 'recovery'
      ? 'Pemulihan'
      : 'Stabil';

  const latestNews = state.newsFeed.slice(0, 2);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#0b1120] overflow-hidden select-none touch-none"
    >
      <canvas
        ref={canvasRef}
        data-testid="isometric-map-canvas"
        className="w-full h-full block cursor-grab active:cursor-grabbing"
      />

      {/* City Telemetry Strip, Multi-City Switcher & Layer Toggles (Top-Left) */}
      <div className="absolute top-3 left-3 right-[140px] md:right-auto z-10 flex flex-col items-start gap-1.5 pointer-events-none">
        <div
          onPointerDown={e => e.stopPropagation()}
          className="pointer-events-auto bg-[#0d1526]/95 border border-slate-800 rounded-xl px-2.5 md:px-3 py-2 text-[11px] shadow-lg w-full md:w-auto md:max-w-[440px]"
        >
          <div className="flex items-center justify-between gap-2 font-bold text-slate-100">
            <div className="flex items-center gap-1.5 truncate">
              <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">{state.city.name}</span>
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                ({(state.cityOrder || [activeCityId]).length}/{MAX_CITIES})
              </span>
            </div>
            <span
              className={`text-[10px] font-semibold shrink-0 ${
                state.macro.cyclePhase === 'boom'
                  ? 'text-emerald-400'
                  : state.macro.cyclePhase === 'recession'
                  ? 'text-rose-400'
                  : state.macro.cyclePhase === 'recovery'
                  ? 'text-amber-400'
                  : 'text-sky-400'
              }`}
            >
              {cycleLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono tabular-nums mt-0.5 flex-wrap">
            <span>Pop {(state.city.population / 1000000).toFixed(2)}M</span>
            <span aria-hidden="true">·</span>
            <span>IKK {state.city.consumerConfidence}</span>
            <span aria-hidden="true">·</span>
            <span>Warga {state.city.residentHousesCount ?? 12}</span>
            {state.city.mayorName && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-sans text-teal-300 truncate max-w-[140px]">
                  WK: {state.city.mayorName}
                </span>
              </>
            )}
          </div>

          {/* Compact City Switcher + New City CTA */}
          <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-slate-800/80 overflow-x-auto no-scrollbar">
            {(state.cityOrder || [activeCityId]).map(cId => {
              const cObj = state.cities?.[cId] || (cId === activeCityId ? state.city : null);
              if (!cObj) return null;
              const isAct = cId === activeCityId;
              return (
                <button
                  key={cId}
                  type="button"
                  onClick={() => onSwitchCity(cId)}
                  className={`min-h-[26px] px-2 rounded-md border text-[10px] font-semibold whitespace-nowrap transition-colors ${
                    isAct
                      ? 'bg-sky-600 border-sky-400 text-white'
                      : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {cObj.name}
                </button>
              );
            })}
            {(state.cityOrder || [activeCityId]).length < MAX_CITIES && (
              <button
                type="button"
                onClick={() => setShowNewCityModal(true)}
                className="min-h-[26px] px-2 rounded-md border border-emerald-600/60 bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-300 text-[10px] font-bold flex items-center gap-0.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3 h-3" />
                <span>Kota</span>
              </button>
            )}
          </div>
        </div>

        <div
          onPointerDown={e => e.stopPropagation()}
          className="pointer-events-auto flex flex-wrap items-center gap-1 w-full md:w-auto md:max-w-[440px]"
        >
          <button
            type="button"
            onClick={() => setOnlyMine(prev => !prev)}
            className={`min-h-[32px] px-2 rounded-lg border text-[10px] font-semibold flex items-center gap-1 shadow-md transition-colors ${
              onlyMine
                ? 'bg-sky-600 border-sky-400 text-white'
                : 'bg-[#0d1526]/95 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Filter className="w-3 h-3" />
            <span>{onlyMine ? 'Milik Saya' : 'Semua'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowResidentFocus(prev => !prev);
              setShowResourcesOverlay(false);
            }}
            className={`min-h-[32px] px-2 rounded-lg border text-[10px] font-semibold flex items-center gap-1 shadow-md transition-colors ${
              showResidentFocus
                ? 'bg-amber-600 border-amber-400 text-white'
                : 'bg-[#0d1526]/95 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            aria-label="Fokus Hunian Warga"
          >
            <Home className="w-3 h-3" />
            <span>Warga</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowResourcesOverlay(prev => !prev);
              setShowResidentFocus(false);
            }}
            className={`min-h-[32px] px-2 rounded-lg border text-[10px] font-semibold flex items-center gap-1 shadow-md transition-colors ${
              showResourcesOverlay
                ? 'bg-lime-600 border-lime-400 text-white'
                : 'bg-[#0d1526]/95 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            aria-label="Lapisan Sumber Daya & Lahan"
          >
            <Gem className="w-3 h-3" />
            <span>Sumber Daya</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTrafficOverlay(prev => !prev)}
            className={`min-h-[32px] px-2 rounded-lg border text-[10px] font-semibold flex items-center gap-1 shadow-md transition-colors ${
              showTrafficOverlay
                ? 'bg-emerald-600 border-emerald-400 text-white'
                : 'bg-[#0d1526]/95 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            aria-label="Toggle Lapisan Keramaian"
          >
            <Activity className="w-3 h-3" />
            <span>Keramaian</span>
          </button>

          <button
            type="button"
            onClick={() => setShowBadges(prev => !prev)}
            className={`min-h-[32px] px-2 rounded-lg border text-[10px] font-semibold flex items-center gap-1 shadow-md transition-colors ${
              showBadges
                ? 'bg-[#0d1526]/95 border-slate-800 text-slate-300 hover:bg-slate-800'
                : 'bg-amber-600/90 border-amber-400 text-white'
            }`}
            aria-label="Toggle Label Gedung"
          >
            <Tag className="w-3 h-3" />
            <span>{showBadges ? 'Label On' : 'Label Off'}</span>
          </button>
        </div>
      </div>

      {/* Top-Right Cluster: Camera Controls + CapLab Diamond Minimap & Macro Telemetry */}
      <div
        onPointerDown={e => e.stopPropagation()}
        className="absolute top-3 right-3 z-10 flex items-start gap-2"
      >
        {/* Mobile Radar Drawer Toggle (< md) */}
        <button
          type="button"
          onClick={() => setMobileRadarOpen(prev => !prev)}
          className={`md:hidden h-10 px-2.5 rounded-xl border shadow-lg text-[10px] font-bold flex items-center gap-1 ${
            mobileRadarOpen
              ? 'bg-sky-600 border-sky-400 text-white'
              : 'bg-[#0d1526]/95 border-slate-700 text-slate-200'
          }`}
          aria-label="Radar & Makro"
        >
          <Compass className="w-3.5 h-3.5 text-sky-400" />
          <span>Radar</span>
        </button>

        {/* Camera Zoom & Focus Controls */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={handleCenterHQ}
            className="w-10 h-10 rounded-xl bg-[#0d1526]/95 border border-slate-700 shadow-lg text-slate-200 flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-transform"
            title="Fokus Kantor Pusat (HQ)"
            aria-label="Fokus Kantor Pusat"
          >
            <Crosshair className="w-4 h-4 text-sky-400" />
          </button>

          <div className="flex flex-col bg-[#0d1526]/95 border border-slate-700 rounded-xl shadow-lg overflow-hidden">
            <button
              type="button"
              onClick={() => handleZoom('in')}
              className="w-10 h-10 flex items-center justify-center text-slate-200 hover:bg-slate-800 active:scale-95 transition-transform border-b border-slate-800"
              title="Perbesar Peta"
              aria-label="Perbesar Peta"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom('out')}
              className="w-10 h-10 flex items-center justify-center text-slate-200 hover:bg-slate-800 active:scale-95 transition-transform"
              title="Perkecil Peta"
              aria-label="Perkecil Peta"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CapLab HUD Stack: Interactive Diamond Minimap + Economic Data Box (Desktop always visible, Mobile toggleable) */}
        <div
          className={`${
            mobileRadarOpen ? 'flex' : 'hidden md:flex'
          } flex-col w-[178px] bg-[#0d1526]/95 border border-slate-700 rounded-xl shadow-2xl overflow-hidden`}
        >
          <div className="px-2.5 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-[10px] font-bold text-slate-200">
            <span className="truncate">{state.city.name}</span>
            <button
              type="button"
              onClick={() => setShowMacroDetails(prev => !prev)}
              className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              title={showMacroDetails ? 'Ringkas Panel Makro' : 'Tampilkan Panel Makro'}
              aria-label="Toggle Panel Makro"
            >
              {showMacroDetails ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Diamond Radar Canvas */}
          <div className="p-1.5 flex items-center justify-center bg-[#07111f] border-b border-slate-800">
            <canvas
              ref={minimapCanvasRef}
              width={156}
              height={156}
              data-testid="diamond-minimap-canvas"
              className="w-[144px] h-[144px] cursor-crosshair block"
              onPointerDown={e => {
                isMinimapDraggingRef.current = true;
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                panFromMinimapEvent(e.clientX, e.clientY);
              }}
              onPointerMove={e => {
                if (!isMinimapDraggingRef.current) return;
                panFromMinimapEvent(e.clientX, e.clientY);
              }}
              onPointerUp={e => {
                isMinimapDraggingRef.current = false;
                if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
                  (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                }
              }}
            />
          </div>

          {/* CapLab Economic & Labor Telemetry Table */}
          {showMacroDetails && (
            <div className="px-2.5 py-2 text-[10px] space-y-1 font-mono tabular-nums bg-[#0b1528]">
              <div className="flex justify-between items-center text-slate-400">
                <span className="font-sans">Inflasi</span>
                <span className="text-amber-300 font-semibold">
                  {state.macro.inflationRate.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="font-sans">IHK (CPI)</span>
                <span className="text-slate-100 font-semibold">
                  {(state.macro.consumerPriceIndex ?? 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="font-sans">Pengangguran</span>
                <span className="text-sky-300 font-semibold">
                  {(state.macro.unemploymentRate ?? 5.15).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="font-sans">Upah Riil</span>
                <span className="text-emerald-300 font-semibold">
                  {(state.macro.realWageRate ?? 40.8).toFixed(2)}
                </span>
              </div>
              <div className="pt-1 border-t border-slate-800/80 flex justify-between items-center text-slate-400">
                <span className="font-sans">PDB</span>
                <span
                  className={
                    state.macro.gdpGrowthRate >= 0
                      ? 'text-emerald-400 font-semibold'
                      : 'text-rose-400 font-semibold'
                  }
                >
                  {state.macro.gdpGrowthRate >= 0 ? '+' : ''}
                  {state.macro.gdpGrowthRate.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="font-sans">Bunga BI</span>
                <span className="text-amber-400 font-semibold">
                  {state.macro.centralBankRate.toFixed(2)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Construction FAB */}
      <button
        type="button"
        onPointerDown={e => e.stopPropagation()}
        onClick={() => onOpenBuildModal(selectedParcel || undefined)}
        className="absolute bottom-20 md:bottom-4 right-3.5 z-20 min-h-[44px] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-xl active:scale-95 transition-transform border border-sky-400/40"
        aria-label="Konstruksi Fasilitas Baru"
      >
        <Hammer className="w-4 h-4" />
        <span>Konstruksi</span>
      </button>

      {/* Selected Tile Action Bar */}
      {selectedParcel && (
        <div
          onPointerDown={e => e.stopPropagation()}
          className="absolute bottom-20 md:bottom-16 left-3 right-[144px] sm:right-auto sm:min-w-[360px] sm:max-w-[520px] z-20 bg-[#0d1526]/95 border border-slate-700 rounded-xl p-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-2 animate-fade-in text-xs"
        >
          {selectedFacility ? (
            isSelectedResident ? (
              <>
                <FacilityIcon
                  type="resident_house"
                  alt={selectedFacility.name}
                  className="w-9 h-9 rounded-lg shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-100 truncate text-xs flex items-center gap-1.5">
                    <span className="truncate">{selectedFacility.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-mono shrink-0">
                      Lv.{selectedFacility.housingTier || selectedFacility.level || 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums truncate">
                    <span className="font-bold text-amber-400">WARGA</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-300">
                      {selectedFacility.residentFamilies || 8} KK ({selectedFacility.lastMonthUnitsSold} jiwa)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-400">Ramai {selectedParcel.trafficIndex ?? 20}</span>
                  </div>
                </div>

                {(() => {
                  const claimCost = calculateResidentClaimCost(selectedParcel, selectedFacility);
                  const demoCost = calculateResidentDemolishCost(selectedParcel, selectedFacility);
                  const canClaim = playerCash >= claimCost.totalCost;
                  const canDemo = playerCash >= demoCost.totalCost;

                  return (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={!canClaim}
                        onClick={() => onClaimResident(selectedFacility.id)}
                        className={`min-h-[38px] px-2.5 py-1.5 rounded-lg font-semibold text-[11px] flex items-center gap-1 transition-colors ${
                          canClaim
                            ? 'bg-sky-600 hover:bg-sky-500 text-white'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                        title={`Akuisisi lahan + kompensasi warga ($${claimCost.totalCost.toLocaleString()})`}
                      >
                        <MapPinCheck className="w-3.5 h-3.5" />
                        <span>Klaim {formatCostShort(claimCost.totalCost)}</span>
                      </button>

                      {confirmDemolishRes ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={!canDemo}
                            onClick={() => {
                              setConfirmDemolishRes(false);
                              onDemolishResident(selectedFacility.id);
                            }}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px]"
                          >
                            Yakin?
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDemolishRes(false)}
                            className="min-h-[38px] px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-[11px]"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!canDemo}
                          onClick={() => setConfirmDemolishRes(true)}
                          className={`min-h-[38px] px-2.5 py-1.5 rounded-lg font-semibold text-[11px] flex items-center gap-1 transition-colors ${
                            canDemo
                              ? 'bg-rose-950/90 border border-rose-700/70 text-rose-300 hover:bg-rose-900'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                          title={`Bongkar rumah & relokasi warga ($${demoCost.totalCost.toLocaleString()})`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Bongkar {formatCostShort(demoCost.totalCost)}</span>
                        </button>
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <>
                <FacilityIcon
                  type={selectedFacility.type}
                  alt={selectedFacility.name}
                  className="w-8 h-8 rounded-lg shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-100 truncate text-xs flex items-center gap-1.5">
                    <span className="truncate">{selectedFacility.name}</span>
                    {selectedFacility.depositBonusPct ? (
                      <span className="px-1.5 py-0.5 rounded bg-lime-500/20 border border-lime-500/40 text-lime-300 text-[9px] font-mono shrink-0">
                        +{selectedFacility.depositBonusPct}% Deposit
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums truncate">
                    {selectedFacility.companyId === GOVT_OWNER_ID ? (
                      <>
                        <span className="font-bold text-teal-400">PEMKOT</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-300">
                          {selectedFacility.lastMonthUnitsSold.toLocaleString()} penghuni
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: selectedCompany?.accentColor || '#38bdf8' }} className="font-bold">
                          {selectedCompany?.ticker}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            selectedFacility.monthlyProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }
                        >
                          {formatSignedCurrency(selectedFacility.monthlyProfit)}/bln
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-400">Ramai {selectedParcel.trafficIndex ?? 20}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectFacility(selectedFacility)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center gap-1 shrink-0"
                >
                  <span>Kelola</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </>
            )
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-slate-100 font-semibold text-xs">
                  <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    Kavling ({selectedParcel.x}, {selectedParcel.y})
                  </span>
                  {selectedParcel.ownerCompanyId === state.playerCompanyId ? (
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 text-[9px] font-mono">
                      Milik Anda
                    </span>
                  ) : selectedParcel.isZoneAllowed ? (
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[9px] font-mono">
                      FOR SALE
                    </span>
                  ) : null}
                </div>
                <div className="text-[10px] text-slate-400 font-mono tabular-nums mt-0.5 truncate flex items-center gap-1.5">
                  <span>
                    {selectedParcel.terrainType === 'industrial_zone'
                      ? 'Industri'
                      : selectedParcel.terrainType === 'pavement'
                      ? 'Pusat Kota'
                      : selectedParcel.terrainType === 'road'
                      ? 'Jalan Raya'
                      : selectedParcel.terrainType === 'water'
                      ? 'Pelabuhan'
                      : 'Suburban'}{' '}
                    · Ramai {selectedParcel.trafficIndex ?? 20}/100 · $
                    {Math.round(selectedParcel.landValue / 1000)}K
                  </span>
                  {selectedParcel.resourceDeposit?.discovered && (
                    <span className="text-lime-300 font-sans font-semibold">
                      · {RESOURCE_DEPOSIT_META[selectedParcel.resourceDeposit.type].label} (
                      {selectedParcel.resourceDeposit.richness}%)
                    </span>
                  )}
                </div>
              </div>

              {selectedParcel.isZoneAllowed && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedParcel.ownerCompanyId === state.playerCompanyId ? (
                    <button
                      type="button"
                      onClick={() => onSellLand(selectedParcel.x, selectedParcel.y)}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold text-[11px] shrink-0"
                    >
                      Jual {formatCostShort(Math.round(selectedParcel.landValue * 0.92))}
                    </button>
                  ) : !selectedParcel.ownerCompanyId ? (
                    <button
                      type="button"
                      disabled={playerCash < Math.max(40000, selectedParcel.landValue)}
                      onClick={() => onBuyLand(selectedParcel.x, selectedParcel.y)}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-[11px] shrink-0"
                    >
                      Beli {formatCostShort(Math.max(40000, selectedParcel.landValue))}
                    </button>
                  ) : null}

                  {(!selectedParcel.ownerCompanyId ||
                    selectedParcel.ownerCompanyId === state.playerCompanyId) && (
                    <button
                      type="button"
                      onClick={() => onOpenBuildModal(selectedParcel)}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1 shrink-0"
                    >
                      <Hammer className="w-3.5 h-3.5" />
                      <span>Bangun</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Capitalism Lab Live News Wire Strip (Bottom Desktop Bar) */}
      {latestNews.length > 0 && (
        <div
          onPointerDown={e => e.stopPropagation()}
          className="hidden md:flex absolute bottom-3 left-3 right-[172px] z-10 bg-[#0a1326]/95 border border-slate-700/90 rounded-xl px-3 py-1.5 shadow-lg items-center gap-3 overflow-hidden"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-400 uppercase tracking-wider shrink-0">
            <Newspaper className="w-3.5 h-3.5" />
            <span>Warta</span>
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
            {latestNews.map(item => (
              <div key={item.id} className="truncate flex items-center gap-1.5 text-slate-300">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    item.category === 'competitor'
                      ? 'bg-rose-400'
                      : item.category === 'finance'
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                />
                <span className="font-mono text-[10px] text-slate-500 shrink-0">
                  Bln {item.month}
                </span>
                <span className="truncate">{item.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Found New City Modal (up to 10 Cities) */}
      {showNewCityModal && (
        <div
          onPointerDown={e => {
            modalBackdropRef.current = e.target === e.currentTarget;
          }}
          onClick={e => {
            if (modalBackdropRef.current && e.target === e.currentTarget) {
              setShowNewCityModal(false);
            }
            modalBackdropRef.current = false;
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-fade-in"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Dirikan Kota Baru"
            onPointerDown={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-4 space-y-3.5 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">
                  Dirikan Kota Baru ({(state.cityOrder || [activeCityId]).length}/{MAX_CITIES})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewCityModal(false)}
                className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                aria-label="Tutup Modal Kota"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-city-name" className="text-[11px] font-semibold text-slate-300 block">
                Nama Kota (Opsional):
              </label>
              <input
                id="new-city-name"
                type="text"
                value={newCityName}
                onChange={e => setNewCityName(e.target.value)}
                placeholder="Contoh: Delta Inovasi"
                maxLength={28}
                className="w-full min-h-[40px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-hidden focus:border-sky-500"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-300 block">
                Pilih Bioma &amp; Karakteristik Lahan (40×40):
              </span>
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-0.5">
                {(Object.keys(CITY_BIOME_META) as CityBiome[]).map(bKey => {
                  const meta = CITY_BIOME_META[bKey];
                  const affordable = playerCash >= meta.foundCost;
                  const active = newCityBiome === bKey;
                  return (
                    <button
                      key={bKey}
                      type="button"
                      onClick={() => setNewCityBiome(bKey)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-colors ${
                        active
                          ? 'bg-sky-950/60 border-sky-500 text-white'
                          : 'bg-[#0d1526] border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs">{meta.label}</span>
                        <span
                          className={`font-mono font-bold text-[11px] ${
                            affordable ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          ${meta.foundCost.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums">
                        Populasi Awal {(meta.popBase / 1_000_000).toFixed(2)}M · Upah ${meta.wageBase.toLocaleString()}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowNewCityModal(false)}
                className="flex-1 min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={playerCash < CITY_BIOME_META[newCityBiome].foundCost}
                onClick={() => {
                  const ok = onCreateCity(newCityName, newCityBiome);
                  if (ok) {
                    setNewCityName('');
                    setShowNewCityModal(false);
                  }
                }}
                className="flex-1 min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold"
              >
                Resmikan Kota
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
