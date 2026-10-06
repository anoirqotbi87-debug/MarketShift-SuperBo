"use client";

import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { fetchMarketDepth } from "@/lib/api";
import type { MarketDepthData } from "@/types/trading";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "GOLD", "BTCUSD"];

interface MarketDepthChartProps {
  symbol?: string;
  height?: number;
}

/** Carnet d'ordres (DOM) — bid/ask par niveaux, backend /market-depth. */
export default function MarketDepthChart({ symbol = "EURUSD", height = 320 }: MarketDepthChartProps) {
  const [sym, setSym] = useState(symbol);
  const [data, setData] = useState<MarketDepthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const res = await fetchMarketDepth(sym);
      if (!cancelled) {
        if (res) {
          setData(res);
        } else {
          // Fallback simulé si backend indisponible
          setData(mockDepth());
        }
        setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sym]);

  if (loading && !data) {
    return (
      <div className="grid h-[320px] place-items-center text-xs text-zinc-500">
        Chargement du carnet d'ordres…
      </div>
    );
  }

  const maxVol = data
    ? Math.max(1, ...data.bids.map((b) => b.totalVolume), ...data.asks.map((a) => a.totalVolume))
    : 1;

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
            Market Depth (Carnet d'Ordres)
          </h3>
        </div>
        <select
          value={sym}
          onChange={(e) => setSym(e.target.value)}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
        >
          {SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {!data ? (
        <p className="text-xs text-zinc-500">Aucune donnée de marché.</p>
      ) : (
        <div className="space-y-2" style={{ minHeight: height }}>
          {/* Asks (inversées) */}
          {[...data.asks]
            .reverse()
            .map((ask) => (
              <DepthRow key={`a-${ask.price}`} level={ask} side="ask" maxVol={maxVol} />
            ))}

          <div className="mt-1 flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase text-zinc-500">Mid</span>
            <span className="font-mono text-sm font-bold text-cyan-300">{data.midPrice.toFixed(5)}</span>
            <span className="font-mono text-[10px] text-zinc-500">
              {data.bids[0]?.price.toFixed(5)} / {data.asks[0]?.price.toFixed(5)}
            </span>
          </div>

          {data.bids.map((bid) => (
            <DepthRow key={`b-${bid.price}`} level={bid} side="bid" maxVol={maxVol} />
          ))}
        </div>
      )}
    </div>
  );
}

function DepthRow({
  level,
  side,
  maxVol,
}: {
  level: MarketDepthData["bids"][number];
  side: "bid" | "ask";
  maxVol: number;
}) {
  const pct = Math.min(100, (level.totalVolume / maxVol) * 100);
  const isBid = side === "bid";

  return (
    <div className="relative overflow-hidden rounded-md border border-zinc-800/60 px-3 py-1.5 font-mono text-[11px]">
      {/* barre de volume */}
      <div
        className={`absolute inset-y-0 left-0 opacity-25 ${isBid ? "bg-emerald-500" : "bg-rose-500"}`}
        style={{ width: `${pct}%` }}
      />
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${isBid ? "bg-emerald-400" : "bg-rose-400"}`} />
          <span className={isBid ? "text-emerald-300" : "text-rose-300"}>
            {level.price.toFixed(5)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-zinc-500">
          <span>{level.volume.toFixed(1)}</span>
          <span className="w-16 text-right text-zinc-400">{level.totalVolume.toFixed(1)}</span>
          <span className="w-8 text-right text-zinc-600">{level.ordersCount} ordres</span>
        </div>
      </div>
    </div>
  );
}

function mockDepth(): MarketDepthData {
  // Fallback déterministe si le backend est injoignable.
  const mid = 1.0852;
  const step = 0.0001;
  const bids = Array.from({ length: 8 }, (_, i) => {
    const price = mid - (i + 1) * step;
    const volume = Math.max(2, 40 - i * 4);
    return {
      price: Math.round(price * 1e5) / 1e5,
      volume,
      totalVolume: Math.round((volume * (8 - i)) * 10) / 10,
      ordersCount: 1 + ((i * 3) % 14),
    };
  });
  const asks = Array.from({ length: 8 }, (_, i) => {
    const price = mid + (i + 1) * step;
    const volume = Math.max(2, 36 - i * 3.5);
    return {
      price: Math.round(price * 1e5) / 1e5,
      volume,
      totalVolume: Math.round((volume * (8 - i)) * 10) / 10,
      ordersCount: 2 + ((i * 5) % 15),
    };
  });
  return { midPrice: mid, bids, asks };
}