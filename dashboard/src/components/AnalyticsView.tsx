"use client";

import { useState } from "react";
import { Activity, Layers } from "lucide-react";
import MarketOverview from "./MarketOverview";
import MarketDepthChart from "./MarketDepthChart";
import NewsFeed from "./NewsFeed";
import InfraMonitor from "./InfraMonitor";
import PositionDistribution from "./PositionDistribution";
import type { WsSnapshot } from "@/types/trading";

interface AnalyticsViewProps {
  snapshot: WsSnapshot;
}

/** Vue Analytics — réunit market overview, carnet d'ordres, news, infra et répartition. */
export default function AnalyticsView({ snapshot }: AnalyticsViewProps) {
  const [depthSymbol] = useState("EURUSD");
  const [tab, setTab] = useState<"market" | "depth" | "news" | "infra">("market");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          <Activity className="h-4 w-4 text-cyan-400" />
          Sous-vues analytiques
        </span>
        <div className="ml-auto flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
          {(["market", "depth", "news", "infra"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                tab === t ? "bg-cyan-500/20 text-cyan-300" : "text-zinc-500 hover:bg-zinc-800"
              }`}
            >
              {t === "market" ? "Marché" : t === "depth" ? "Carnet" : t === "news" ? "News" : "Infra"}
            </button>
          ))}
        </div>
      </div>

      {tab === "market" && (
        <>
          <MarketOverview />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PositionDistribution snapshot={snapshot} />
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-zinc-500" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Symbole carnet : {depthSymbol}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "depth" && (
        <MarketDepthChart symbol={depthSymbol} />
      )}

      {tab === "news" && <NewsFeed />}

      {tab === "infra" && <InfraMonitor />}
    </div>
  );
}