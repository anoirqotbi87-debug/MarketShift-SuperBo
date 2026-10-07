"use client";

import {
  Activity,
  BarChart3,
  BrainCircuit,
  GaugeCircle,
  Landmark,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings2,
  SquareTerminal,
  X,
} from "lucide-react";

export type DashboardView =
  | "live"
  | "grid"
  | "backtest"
  | "config"
  | "analytics"
  | "ml"
  | "mt5"
  | "brokers"
  | "logs";

interface SidebarProps {
  view: DashboardView;
  onSelect: (v: DashboardView) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ id: DashboardView; label: string; icon: typeof Activity }> = [
  { id: "live", label: "Live Monitoring", icon: Activity },
  { id: "analytics", label: "Analytics", icon: LineChart },
  { id: "grid", label: "Grid Search", icon: GaugeCircle },
  { id: "backtest", label: "Backtest Studio", icon: BarChart3 },
  { id: "ml", label: "ML Engine", icon: BrainCircuit },
  { id: "mt5", label: "MT5 Bridge", icon: Radio },
  { id: "brokers", label: "Comptes Broker", icon: Landmark },
  { id: "config", label: "Stratégies & Risque", icon: Settings2 },
  { id: "logs", label: "Terminal Logs", icon: SquareTerminal },
];

export default function Sidebar({
  view,
  onSelect,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const items = NAV_ITEMS;

  const navBody = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = view === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              onSelect(item.id);
              onCloseMobile();
            }}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
              active
                ? "bg-cyan-500/10 font-semibold text-cyan-300 ring-1 ring-cyan-800/50"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
            }`}
            title={item.label}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? "text-cyan-400" : "text-zinc-500 group-hover:text-zinc-300"}`} />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        );
      })}
    </nav>
  );

  const sidebarInner = (
    <div className="flex h-full flex-col">
      {/* Marque */}
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
          <Activity className="h-4 w-4 text-emerald-400" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">MarketShift</p>
            <p className="truncate text-[10px] text-zinc-500">Command Center</p>
          </div>
        )}
      </div>

      {/* Bouton plier (desktop) */}
      {!collapsed && (
        <button
          onClick={onToggleCollapsed}
          className="mx-3 mb-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
        >
          <PanelLeftClose className="h-3.5 w-3.5" /> Plier
        </button>
      )}
      {collapsed && (
        <button
          onClick={onToggleCollapsed}
          className="mx-auto mb-2 hidden rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300 lg:inline-flex"
          title="Déplier"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <div className="flex-1 px-3">{navBody}</div>

      {/* Footer status */}
      <div className="border-t border-zinc-800/70 px-4 py-3">
        {!collapsed ? (
          <p className="font-mono text-[10px] leading-relaxed text-zinc-600">
            MT5 · 5 symboles
            <br />
            v1.0 Dashboard
          </p>
        ) : (
          <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        )}
      </div>
    </div>
  );

  // Version mobile : drawer
  if (mobileOpen) {
    return (
      <div className="fixed inset-0 z-[70] flex lg:hidden">
        <div className="w-64 border-r border-zinc-800 bg-zinc-950" onClick={onCloseMobile}>
          <button
            onClick={onCloseMobile}
            className="ml-4 mt-4 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
          {sidebarInner}
        </div>
        <div className="flex-1 bg-black/60" />
      </div>
    );
  }

  // Desktop (avec état replié)
  return (
    <aside
      className={`hidden shrink-0 border-r border-zinc-800/80 bg-zinc-950/80 transition-all duration-200 lg:block ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {sidebarInner}
    </aside>
  );
}