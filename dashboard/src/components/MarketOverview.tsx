"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, LineChart as LineChartIcon } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { fetchHistory, fetchMarketOverview } from "@/lib/api";
import type { MarketOverviewEntry } from "@/types/trading";

const FALLBACK_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "GOLD", "BTCUSD"];

/** Vue d'ensemble marché : prix 24h + sparklines, backend /market-overview + /history. */
export default function MarketOverview() {
  const [entries, setEntries] = useState<MarketOverviewEntry[]>([]);
  const [spark, setSpark] = useState<Record<string, Array<{ i: number; v: number }>>>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let list = await fetchMarketOverview();
      if (!cancelled && list.length === 0) {
        list = mockOverview();
      }
      if (cancelled) return;
      setEntries(list);

      // Sparklines : 24 bougies H1 par symbole (fallback simulé).
      const sparkMap: Record<string, Array<{ i: number; v: number }>> = {};
      for (const sym of list.map((e) => e.symbol)) {
        let bars = await fetchHistory(sym, "H1", 24);
        if (bars.length === 0) bars = mockHistory(sym);
        sparkMap[sym] = bars.map((b, i) => ({ i, v: b.close }));
      }
      if (!cancelled) setSpark(sparkMap);
    };

    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (entries.length === 0) {
    return (
      <div className="card p-4 text-xs text-zinc-500">Chargement du marché…</div>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <LineChartIcon className="h-4 w-4 text-cyan-400" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
          Market Overview · 24h
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => {
          const up = e.changePct >= 0;
          const points = spark[e.symbol] ?? [];
          return (
            <div
              key={e.symbol}
              className="rounded-xl border border-zinc-800/70 bg-zinc-900/50 p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-zinc-200">{e.symbol}</span>
                {e.signal && e.signal !== "WAIT" && (
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                      e.signal === "BUY"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : e.signal === "SELL"
                          ? "bg-rose-500/15 text-rose-400"
                          : "bg-zinc-700/40 text-zinc-400"
                    }`}
                  >
                    {e.signal}
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="font-mono text-lg font-bold text-zinc-100">{e.price.toFixed(e.price < 10 ? 4 : 2)}</p>
                  <p className={`inline-flex items-center gap-1 font-mono text-[11px] ${up ? "text-emerald-400" : "text-rose-400"}`}>
                    {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {up ? "+" : ""}
                    {e.changePct.toFixed(2)}%
                  </p>
                </div>
                <div className="h-10 w-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points}>
                      <YAxis hide domain={["dataMin", "dataMax"]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#101012", borderColor: "#27272a", fontSize: "10px" }}
                        formatter={(v) => [Number(v).toFixed(5), "Prix"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke={up ? "#34d399" : "#fb7185"}
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function mockOverview(): MarketOverviewEntry[] {
  return FALLBACK_SYMBOLS.map((symbol, idx) => {
    const base = [1.0852, 1.2684, 148.32, 2387.5, 68420][idx];
    const drift = (Math.sin(idx * 2.1) * 0.4 + (idx % 2 === 0 ? 0.3 : -0.2)) / 100;
    return {
      symbol,
      price: base,
      changeUsd: base * drift,
      changePct: drift * 100,
      high24h: base * 1.004,
      low24h: base * 0.996,
      volume: 100000 + idx * 25000,
      signal: idx % 3 === 0 ? "BUY" : idx % 3 === 1 ? "SELL" : "NEUTRAL",
    };
  });
}

function mockHistory(symbol: string) {
  const base = {
    EURUSD: 1.0852,
    GBPUSD: 1.2684,
    USDJPY: 148.32,
    GOLD: 2387.5,
    BTCUSD: 68420,
  }[symbol] ?? 1.0;
  return Array.from({ length: 24 }, (_, i) => ({
    time: `${i}h`,
    open: base,
    high: base * 1.001,
    low: base * 0.999,
    close: base * (1 + Math.sin(i / 3) * 0.0015),
    tickVolume: 0,
  }));
}