"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import KpiGrid from "@/components/KpiGrid";
import ActivePositions from "@/components/ActivePositions";
import EquityChart from "@/components/EquityChart";
import TelemetryConsole from "@/components/TelemetryConsole";
import GridSearch from "@/components/GridSearch";
import BacktestStudio from "@/components/BacktestStudio";
import ConfigPanel from "@/components/ConfigPanel";
import AnalyticsView from "@/components/AnalyticsView";
import MlEngineView from "@/components/MlEngineView";
import Mt5BridgeView from "@/components/Mt5BridgeView";
import LogsView from "@/components/LogsView";
import RiskMetricsPanel from "@/components/RiskMetricsPanel";
import KellySizer from "@/components/KellySizer";
import PriceAlerts from "@/components/PriceAlerts";
import Sidebar, { type DashboardView } from "@/components/Sidebar";
import { fetchEquityCurve, fetchKpiMetrics } from "@/lib/api";
import { useMarketShiftWS } from "@/hooks/useMarketShiftWS";
import type { EquityPoint, KpiMetrics } from "@/types/trading";

const POLL_MS = 10000;

const VIEW_TITLES: Record<DashboardView, string> = {
  live: "LIVE MONITORING",
  analytics: "ANALYTICS",
  grid: "GRID SEARCH",
  backtest: "BACKTEST STUDIO",
  ml: "ML ENGINE",
  mt5: "MT5 BRIDGE",
  config: "CONFIG & RISQUE",
  logs: "TERMINAL LOGS",
};

export default function DashboardPage() {
  const { snapshot, connected, latencyMs, reconnect } = useMarketShiftWS();
  const [view, setView] = useState<DashboardView>("live");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Sidebar pliable (desktop) / drawer (mobile) */}
      <Sidebar
        view={view}
        onSelect={setView}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Zone principale */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          snapshot={snapshot}
          connected={connected}
          latencyMs={latencyMs}
          symbolsCount={snapshot.signals ? Object.keys(snapshot.signals).length : null}
          onReconnect={reconnect}
          onOpenMenu={() => setMobileMenuOpen(true)}
          title={VIEW_TITLES[view]}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-4">
            {view === "live" && (
              <>
                <KpiGrid snapshot={snapshot} equityCurve={equity1D} kpi={kpi} />

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                  <div className="lg:col-span-3">
                    <EquityChart
                      data1D={equity1D}
                      data1M={equity1M}
                      benchmark={benchmark}
                      loading={loadingChart}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <TelemetryConsole
                      logs={snapshot.logs ?? []}
                      signals={snapshot.signals ?? {}}
                      ml={snapshot.ml ?? { trained: false, accuracy: 0, sampleCount: 0, lastTrained: "", featureImportances: [] }}
                    />
                  </div>
                </div>

                <ActivePositions positions={snapshot.positions ?? []} />
              </>
            )}

            {view === "grid" && <GridSearch />}

            {view === "backtest" && <BacktestStudio />}

            {view === "config" && (
              <>
                <RiskMetricsPanel snapshot={snapshot} equityCurve={equity1D} />
                <ConfigPanel />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <KellySizer snapshot={snapshot} />
                  <PriceAlerts />
                </div>
              </>
            )}

            {view === "analytics" && <AnalyticsView snapshot={snapshot} />}

            {view === "ml" && <MlEngineView />}

            {view === "mt5" && (
              <Mt5BridgeView snapshot={snapshot} connected={connected} pingMs={latencyMs} onReconnect={reconnect} />
            )}

            {view === "logs" && <LogsView logs={snapshot.logs ?? []} />}
          </div>
        </main>
      </div>
    </div>
  );
}