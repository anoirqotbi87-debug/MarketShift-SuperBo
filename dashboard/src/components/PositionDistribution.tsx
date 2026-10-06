"use client";

import { useMemo } from "react";
import { PieChart as PieChartIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { WsSnapshot } from "@/types/trading";

const COLORS = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#60a5fa"];

interface PositionDistributionProps {
  snapshot: WsSnapshot;
}

/** Répartition des positions ouvertes par symbole (tout ou rien) — dérivée des positions WS. */
export default function PositionDistribution({ snapshot }: PositionDistributionProps) {
  const data = useMemo(() => {
    const bySymbol = new Map<string, { value: number; count: number; pnl: number }>();
    for (const p of snapshot.positions ?? []) {
      const entry = bySymbol.get(p.symbol) ?? { value: 0, count: 0, pnl: 0 };
      entry.value += p.lots;
      entry.count += 1;
      entry.pnl += p.pnl;
      bySymbol.set(p.symbol, entry);
    }
    return Array.from(bySymbol.entries()).map(([symbol, v]) => ({
      name: symbol,
      value: Math.round(v.value * 100) / 100,
      count: v.count,
      pnl: v.pnl,
    }));
  }, [snapshot.positions]);

  if (data.length === 0) {
    return (
      <div className="card p-4 text-xs text-zinc-500">
        Aucune position ouverte à analyser.
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <PieChartIcon className="h-4 w-4 text-violet-400" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
          Répartition des positions
        </h3>
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={3}
              stroke="#09090b"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "#101012", borderColor: "#27272a", fontSize: "11px" }}
              formatter={(v, name) => [`${Number(v).toFixed(2)} lots`, String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {data.map((d, i) => (
          <span
            key={d.name}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[10px] text-zinc-300"
          >
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            {d.name} · {d.count} pos · {d.value.toFixed(2)} lots
            <span className={d.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {d.pnl >= 0 ? "+" : ""}
              ${d.pnl.toFixed(2)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}