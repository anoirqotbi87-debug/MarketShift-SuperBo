"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import KpiGrid from "@/components/KpiGrid";
import ActivePositions from "@/components/ActivePositions";
import EquityChart from "@/components/EquityChart";
import TelemetryConsole from "@/components/TelemetryConsole";
import { fetchEquityCurve, fetchKpiMetrics } from "@/lib/api";
import { useMarketShiftWS } from "@/hooks/useMarketShiftWS";
import type { EquityPoint, KpiMetrics } from "@/types/trading";

const POLL_MS = 10000;

export default function DashboardPage() {
  const { snapshot, connected, latencyMs } = useMarketShiftWS();

  const [equity1D, setEquity1D] = useState<EquityPoint[]>([]);
  const [equity1M, setEquity1M] = useState<EquityPoint[]>([]);
  const [benchmark, setBenchmark] = useState<EquityPoint[]>([]);
  const [kpi, setKpi] = useState<KpiMetrics | null>(null);
  const [loadingChart, setLoadingChart] = useState(true);

  // Rafraîchissement périodique des données REST (équité, KPI).
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [e1d, e1m, bench, k] = await Promise.all([
          fetchEquityCurve("1D"),
          fetchEquityCurve("1M"),
          fetchEquityCurve("1D"),
          fetchKpiMetrics(),
        ]);
        if (cancelled) return;
        setEquity1D(e1d);
        setEquity1M(e1m);
        setBenchmark(bench);
        setKpi(k);
      } catch {
        // silencieux : le WS garde l'UI vivante même si REST échoue.
      } finally {
        if (!cancelled) setLoadingChart(false);
      }
    };

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <Header
        snapshot={snapshot}
        connected={connected}
        latencyMs={latencyMs}
        symbolsCount={snapshot.signals ? Object.keys(snapshot.signals).length : null}
      />

      <KpiGrid snapshot={snapshot} equityCurve={equity1D} kpi={kpi} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Graphique d'équité (2/3 de large) */}
        <div className="lg:col-span-3">
          <EquityChart
            data1D={equity1D}
            data1M={equity1M}
            benchmark={benchmark}
            loading={loadingChart}
          />
        </div>

        {/* Console télémétrie (1/3 de large) */}
        <div className="lg:col-span-2">
          <TelemetryConsole
            logs={snapshot.logs ?? []}
            signals={snapshot.signals ?? {}}
            ml={snapshot.ml ?? { trained: false, accuracy: 0, sampleCount: 0, lastTrained: "", featureImportances: [] }}
          />
        </div>
      </div>

      {/* Positions actives pleine largeur */}
      <ActivePositions positions={snapshot.positions ?? []} />

      <footer className="pb-4 pt-2 text-center font-mono text-[10px] text-zinc-700">
        MarketShift SuperBot · backend FastAPI :8000 · snapshot WebSocket toutes les 2s · rendu client
      </footer>
    </main>
  );
}