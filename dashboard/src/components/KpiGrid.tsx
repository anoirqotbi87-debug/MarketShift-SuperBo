"use client";

import { TrendingDown, TrendingUp, Wallet, Percent, Scale } from "lucide-react";
import type { EquityPoint, KpiMetrics, WsSnapshot } from "@/types/trading";

interface KpiGridProps {
  snapshot: WsSnapshot;
  equityCurve: EquityPoint[];
  kpi: KpiMetrics | null;
}

const fmt = (v: number, digits = 2, suffix = "") =>
  `${v.toLocaleString("fr-FR", { maximumFractionDigits: digits })}${suffix}`;

const fmtUsd = (v: number) =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`;

export default function KpiGrid({ snapshot, equityCurve, kpi }: KpiGridProps) {
  const { account, kelly } = snapshot;

  // Drawdown : pic-to-trough depuis la courbe d'équité disponible.
  let drawdownPct = 0;
  let maxDrawdownPct = 0;
  let peak = Number.NEGATIVE_INFINITY;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? ((peak - p.equity) / peak) * 100 : 0;
    if (dd > drawdownPct) drawdownPct = dd;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }

  const ddColor =
    maxDrawdownPct > 25 ? "text-rose-400" : maxDrawdownPct > 15 ? "text-orange-400" : "text-emerald-400";

  const marginUsedPct =
    account && account.equity > 0 ? Math.min(100, ((account.balance - account.freeMargin) / account.equity) * 100) : 0;

  const dailyPnL = account?.dailyPnL ?? 0;
  const unrealized = snapshot.positions.reduce((acc, p) => acc + p.pnl, 0);
  const dailyColor = dailyPnL >= 0 ? "text-emerald-400" : "text-rose-400";

  const winRate = (kelly.winRate ?? 0) * 100;
  const profitFactor = kpi?.profit_factor ?? 0;

  const cards = [
    {
      label: "Solde",
      value: fmtUsd(account?.balance ?? 0),
      sub: `Équité ${fmtUsd(account?.equity ?? 0)}`,
      icon: <Wallet className="h-4 w-4 text-cyan-400" />,
      accent: "text-zinc-100",
      gauge: marginUsedPct,
    },
    {
      label: "P&L Journalier",
      value: `${dailyPnL >= 0 ? "+" : ""}${fmtUsd(dailyPnL)}`,
      sub: `${(account?.dailyPnLPct ?? 0) >= 0 ? "+" : ""}${fmtUsd(dailyPnL)} (${(account?.dailyPnLPct ?? 0).toFixed(2)}%)`,
      icon: dailyPnL >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-rose-400" />,
      accent: dailyColor,
    },
    {
      label: "P&L Flottant",
      value: `${unrealized >= 0 ? "+" : ""}${fmtUsd(unrealized)}`,
      sub: `${snapshot.positions.length} position(s) ouverte(s)`,
      icon: <TrendingDown className={`h-4 w-4 ${unrealized >= 0 ? "text-emerald-400" : "text-rose-400"}`} />,
      accent: unrealized >= 0 ? "text-emerald-400" : "text-rose-400",
    },
    {
      label: "Drawdown",
      value: `${maxDrawdownPct.toFixed(2)}%`,
      sub: `Actuel ${drawdownPct.toFixed(2)}%`,
      icon: <TrendingDown className={`h-4 w-4 ${ddColor}`} />,
      accent: ddColor,
    },
    {
      label: "Win Rate",
      value: `${winRate.toFixed(1)}%`,
      sub: `${kelly.tradeCount ?? 0} trades analysés`,
      icon: <Percent className="h-4 w-4 text-violet-400" />,
      accent: "text-zinc-100",
    },
    {
      label: "Profit Factor",
      value: profitFactor > 900 ? "∞" : profitFactor.toFixed(2),
      sub: `Expectancy ${fmt(kpi?.expectancy ?? 0)} $`,
      icon: <Scale className="h-4 w-4 text-amber-400" />,
      accent: "text-zinc-100",
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              {c.label}
            </span>
            {c.icon}
          </div>
          <p className={`mt-2 font-mono text-lg font-semibold leading-none ${c.accent}`}>{c.value}</p>
          <p className="mt-1.5 truncate text-[11px] text-zinc-500">{c.sub}</p>
          {c.gauge !== undefined && (
            <div className="mt-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full ${
                    c.gauge > 80 ? "bg-rose-500" : c.gauge > 60 ? "bg-amber-400" : "bg-cyan-500"
                  }`}
                  style={{ width: `${Math.min(100, c.gauge)}%` }}
                />
              </div>
              <p className="mt-1 font-mono text-[9px] text-zinc-600">Marge utilisée {c.gauge.toFixed(0)}%</p>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}