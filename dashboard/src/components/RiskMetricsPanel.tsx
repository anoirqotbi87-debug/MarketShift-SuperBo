"use client";

import { useMemo } from "react";
import { Activity, ShieldAlert, TrendingDown } from "lucide-react";
import type { EquityPoint, WsSnapshot } from "@/types/trading";

interface RiskMetricsPanelProps {
  snapshot: WsSnapshot;
  equityCurve: EquityPoint[];
}

/** Surveillance de risque temps réel (drawdown, expositions, concentration). */
export default function RiskMetricsPanel({ snapshot, equityCurve }: RiskMetricsPanelProps) {
  const { account, positions } = snapshot;

  const stats = useMemo(() => {
    // Drawdown depuis la courbe
    let peak = Number.NEGATIVE_INFINITY;
    let currentDd = 0;
    let maxDd = 0;
    for (const p of equityCurve) {
      if (p.equity > peak) peak = p.equity;
      const dd = peak > 0 ? ((peak - p.equity) / peak) * 100 : 0;
      if (dd > currentDd) currentDd = dd;
      if (dd > maxDd) maxDd = dd;
    }

    // Concentration par symbole
    const bySym = new Map<string, { lots: number; pnl: number }>();
    for (const p of positions) {
      const e = bySym.get(p.symbol) ?? { lots: 0, pnl: 0 };
      e.lots += p.lots;
      e.pnl += p.pnl;
      bySym.set(p.symbol, e);
    }
    const maxSym = Array.from(bySym.entries()).sort((a, b) => b[1].lots - a[1].lots)[0]?.[1];
    const exposurePct = account.equity > 0 ? ((account.balance - account.freeMargin) / account.equity) * 100 : 0;
    const marginLevelPct = account.marginLevel ?? (account.equity > 0 ? (account.equity / Math.max(1, account.balance - account.freeMargin)) * 100 : 0);

    return { currentDd, maxDd, maxSymLots: maxSym?.lots ?? 0, exposurePct, marginLevelPct };
  }, [equityCurve, account, positions]);

  const ddColor = stats.maxDd > 25 ? "text-rose-400" : stats.maxDd > 15 ? "text-orange-400" : "text-emerald-400";
  const marginColor = stats.marginLevelPct < 150 ? "text-rose-400" : stats.marginLevelPct < 250 ? "text-amber-400" : "text-emerald-400";
  const exposureColor = stats.exposurePct > 80 ? "text-rose-400" : stats.exposurePct > 50 ? "text-amber-400" : "text-emerald-400";

  const cards = [
    {
      label: "Drawdown max",
      value: `${stats.maxDd.toFixed(2)}%`,
      sub: `Actuel ${stats.currentDd.toFixed(2)}%`,
      icon: <TrendingDown className="h-4 w-4 text-amber-400" />,
      accent: ddColor,
    },
    {
      label: "Marge utilisée",
      value: `${stats.exposurePct.toFixed(1)}%`,
      sub: `Niveau ${stats.marginLevelPct.toFixed(0)}%`,
      icon: <Activity className="h-4 w-4 text-cyan-400" />,
      accent: exposureColor,
    },
    {
      label: "Niveau de marge",
      value: `${stats.marginLevelPct.toFixed(0)}%`,
      sub: "Seuil d'appel 150%",
      icon: <ShieldAlert className="h-4 w-4 text-violet-400" />,
      accent: marginColor,
    },
    {
      label: "Concentration max",
      value: `${stats.maxSymLots.toFixed(2)} lots`,
      sub: `${positions.length} positions`,
      icon: <TrendingDown className="h-4 w-4 text-rose-400" />,
      accent: "text-zinc-100",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="card p-3.5">
          <div className="mb-1 flex items-center justify-between">
            {c.icon}
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              {c.label}
            </span>
          </div>
          <p className={`font-mono text-lg font-bold ${c.accent}`}>{c.value}</p>
          <p className="font-mono text-[10px] text-zinc-500">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}