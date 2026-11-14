import React, { useMemo } from 'react';
import { FacilityType, ProductId } from '../types/game';
import {
  getGeneratedCompanyLogo,
  getGeneratedFacilityAsset,
  getGeneratedProductAsset,
} from '../engine/assetGeneratorEngine';

function FallbackGlyph({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  );
}

export function ProductIcon({
  id,
  className = 'w-8 h-8',
  alt,
}: {
  id: ProductId | string;
  className?: string;
  alt?: string;
}) {
  const src = useMemo(() => getGeneratedProductAsset(id), [id]);
  if (!src) return <FallbackGlyph className={className} />;

  return (
    <img
      src={src}
      alt={alt || `Produk ${id}`}
      referrerPolicy="no-referrer"
      draggable={false}
      className={`block object-contain select-none bg-slate-950/90 ring-1 ring-inset ring-white/15 shadow-sm ${className}`}
    />
  );
}

export function FacilityIcon({
  type,
  className = 'w-9 h-9',
  alt,
}: {
  type: FacilityType | string;
  className?: string;
  alt?: string;
}) {
  if (type === 'resident_house') {
    return (
      <div
        role="img"
        aria-label={alt || 'Rumah Warga'}
        className={`flex items-center justify-center bg-amber-950/90 text-amber-300 ring-1 ring-inset ring-amber-400/35 shadow-sm ${className}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20h14V9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      </div>
    );
  }

  const src = useMemo(() => getGeneratedFacilityAsset(type), [type]);
  if (!src) return <FallbackGlyph className={className} />;

  return (
    <img
      src={src}
      alt={alt || `Fasilitas ${type}`}
      referrerPolicy="no-referrer"
      draggable={false}
      className={`block object-contain select-none bg-slate-950/90 ring-1 ring-inset ring-white/15 shadow-sm ${className}`}
    />
  );
}

export function CEOIcon({
  companyId,
  personality,
  color,
  accentColor,
  className = 'w-8 h-8',
  alt,
}: {
  companyId: string;
  personality?: string;
  color?: string;
  accentColor?: string;
  className?: string;
  alt?: string;
}) {
  const src = useMemo(
    () => getGeneratedCompanyLogo(companyId, personality, color, accentColor),
    [companyId, personality, color, accentColor]
  );
  if (!src) return <FallbackGlyph className={className} />;

  return (
    <img
      src={src}
      alt={alt || `Logo ${companyId}`}
      referrerPolicy="no-referrer"
      draggable={false}
      className={`block object-cover select-none ring-1 ring-inset ring-white/20 shadow-sm ${className}`}
    />
  );
}
