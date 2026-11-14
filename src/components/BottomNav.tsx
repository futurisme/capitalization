import React from 'react';
import { Map, Factory, BarChart3, TrendingUp, Building2 } from 'lucide-react';

export type ActiveTab = 'map' | 'facilities' | 'market' | 'stocks' | 'hq';

interface BottomNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  facilitiesCount: number;
  companiesCount?: number;
}

export function BottomNav({
  activeTab,
  onSelectTab,
  facilitiesCount,
  companiesCount = 10,
}: BottomNavProps) {
  const tabs = [
    { id: 'map' as ActiveTab, label: 'Peta 2.5D', desc: 'Kota & Properti', icon: Map },
    {
      id: 'facilities' as ActiveTab,
      label: 'Operasional',
      desc: 'Cabang & Pasok',
      icon: Factory,
      badge: facilitiesCount,
    },
    { id: 'market' as ActiveTab, label: 'Pasar', desc: 'Riset Produk', icon: BarChart3 },
    {
      id: 'stocks' as ActiveTab,
      label: 'Bursa',
      desc: `${companiesCount} Emiten`,
      icon: TrendingUp,
    },
    { id: 'hq' as ActiveTab, label: 'Korporat', desc: 'C-Suite & Peringkat', icon: Building2 },
  ];

  return (
    <>
      {/* Desktop Left Navigation Rail (md+) */}
      <aside
        aria-label="Navigasi Utama Desktop"
        className="hidden md:flex md:w-52 lg:w-56 shrink-0 flex-col justify-between bg-[#0d1526] border-r border-slate-800/80 p-3 select-none"
      >
        <div className="space-y-1">
          <div className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Komando Korporasi
          </div>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`w-full min-h-[46px] px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 transition-colors text-left ${
                  isActive
                    ? 'bg-sky-600/20 text-sky-300 border border-sky-500/40 font-bold'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-sky-400 stroke-[2.3]' : 'stroke-[1.8]'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs leading-tight truncate">{tab.label}</div>
                    <div className="text-[10px] text-slate-500 font-normal truncate mt-0.5">
                      {tab.desc}
                    </div>
                  </div>
                </div>
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span className="font-mono tabular-nums text-[11px] font-bold text-sky-400 shrink-0">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="px-2.5 py-2 border-t border-slate-800/70 text-[10px] text-slate-500 font-mono tabular-nums space-y-1">
          <div className="flex justify-between">
            <span>Entitas Aktif</span>
            <span className="text-slate-300 font-semibold">{companiesCount}/10</span>
          </div>
          <div className="flex justify-between">
            <span>Fasilitas Anda</span>
            <span className="text-sky-400 font-semibold">{facilitiesCount} unit</span>
          </div>
        </div>
      </aside>

      {/* Mobile Thumb-Zone Bottom Tab Bar (< md) */}
      <nav
        aria-label="Navigasi Utama Ponsel"
        className="md:hidden bg-[#0d1526]/95 border-t border-slate-800/90 fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-14 max-w-2xl mx-auto items-stretch px-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex flex-col items-center justify-center relative py-1 px-1 transition-colors min-h-[44px] ${
                  isActive
                    ? 'text-sky-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && (
                  <div className="absolute top-0 w-8 h-0.5 bg-sky-400 rounded-full" />
                )}

                <div className="relative flex items-center justify-center">
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
                  {typeof tab.badge === 'number' && tab.badge > 0 && (
                    <span className="ml-1 text-[10px] font-mono font-bold text-sky-400 tabular-nums">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-0.5 leading-tight tracking-tight whitespace-nowrap truncate max-w-[68px]">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
