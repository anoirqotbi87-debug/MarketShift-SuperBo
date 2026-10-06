"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EquityPoint } from "@/types/trading";

interface EquityChartProps {
  data1D: EquityPoint[];
  data1M: EquityPoint[];
  benchmark: EquityPoint[];
  loading: boolean;
}

type RangeKey = "1D" | "1M" | "1D+BM";

const RangeBtn = ({
  value,
  active,
  onSelect,
}: {
  value: string;
  active: boolean;
  onSelect: () => void;
}) => (
  <button
    onClick={onSelect}
    className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition ${
      active
        ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-800"
        : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
    }`}
  >
    {value}
  </button>
);

const fmtUsd = (v: number) =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}`;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as EquityPoint;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2 font-mono text-[11px] shadow-xl">
      <p className="text-zinc-400">{label}</p>
      <p className="mt-1 text-cyan-300">Équité : {fmtUsd(row.equity)}</p>
      <p className="text-zinc-300">Solde : {fmtUsd(row.balance)}</p>
      <p className={row.dailyPnL >= 0 ? "text-emerald-400" : "text-rose-400"}>
        P&L : {row.dailyPnL >= 0 ? "+" : ""}
        {fmtUsd(row.dailyPnL)}
      </p>
    </div>
  );
}

export default function EquityChart({ data1D, data1M, benchmark, loading }: EquityChartProps) {
  const [range, setRange] = useState<RangeKey>("1D");

  const showBenchmark = range === "1D+BM";
  const data = range === "1M" ? data1M : data1D;

  const combined = showBenchmark
    ? data.map((p, i) => ({
        ...p,
        bench: benchmark[i]?.equity ?? null,
      }))
    : data;

  return (
    <section className="card flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Courbe d&apos;équité
        </h2>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
          <RangeBtn
            value="1D"
            active={range === "1D"}
            onSelect={() => setRange("1D")}
          />
          <RangeBtn
            value="1M"
            active={range === "1M"}
            onSelect={() => setRange("1M")}
          />
          <RangeBtn
            value="1D vs Benchmark"
            active={range === "1D+BM"}
            onSelect={() => setRange("1D+BM")}
          />
        </div>
      </div>

      <div className="h-64 w-full lg:h-72">
        {loading || data.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-600">
            <span className="font-mono text-xs">Chargement de la courbe d&apos;équité…</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={combined} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="bmGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 10, fontFamily: "var(--font-jetbrains)" }}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
              />
              <YAxis
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 10, fontFamily: "var(--font-jetbrains)" }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={fmtUsd}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="equity"
                name="Équité"
                stroke="#22d3ee"
                strokeWidth={2}
                fill="url(#eqGrad)"
                dot={false}
              />
              {showBenchmark && (
                <Area
                  type="monotone"
                  dataKey="bench"
                  name="Benchmark"
                  stroke="#a78bfa"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="url(#bmGrad)"
                  dot={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}