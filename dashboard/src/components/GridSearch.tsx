"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlaskConical,
  Loader2,
  Play,
  Rocket,
  Search,
} from "lucide-react";
import { applyOptimalSettings, fetchOptimizeStatus, startOptimize } from "@/lib/api";
import { resultRowFromOptimize, simulateGridSearch } from "@/lib/engine";
import type { GridResultRow, ObjectiveFunction } from "@/types/trading";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "GOLD", "BTCUSD", "ETHUSD", "US30", "US100"];
const TIMEFRAMES = ["M1", "M5", "M15", "H1"];

const OBJ_LABELS: Record<ObjectiveFunction, string> = {
  sharpe: "Ratio de Sharpe",
  net_profit: "P&L Net",
  calmar: "Calmar Ratio",
};

interface GridConfig {
  symbol: string;
  timeframe: string;
  atrMin: number;
  atrMax: number;
  atrStep: number;
  mlMin: number;
  mlMax: number;
  mlStep: number;
  kellyMin: number;
  kellyMax: number;
  kellyStep: number;
  smcWeight: number;
  amdWeight: number;
  objective: ObjectiveFunction;
  initialCapital: number;
}

const DEFAULT_CONFIG: GridConfig = {
  symbol: "EURUSD",
  timeframe: "M5",
  atrMin: 1.0,
  atrMax: 3.0,
  atrStep: 0.5,
  mlMin: 0.5,
  mlMax: 0.7,
  mlStep: 0.05,
  kellyMin: 0.1,
  kellyMax: 0.5,
  kellyStep: 0.1,
  smcWeight: 0.5,
  amdWeight: 0.5,
  objective: "sharpe",
  initialCapital: 10000,
};

const num = (label: string, v: number, onChange: (n: number) => void, step: number) => (
  <label className="flex items-center justify-between gap-2">
    <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
    <input
      type="number"
      value={v}
      step={step}
      className="w-20 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-right font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </label>
);

export default function GridSearch() {
  const [config, setConfig] = useState<GridConfig>(DEFAULT_CONFIG);
  const [results, setResults] = useState<GridResultRow[]>([]);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "backend" | "simulated">("idle");
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runGrid = useCallback(async () => {
    setRunning(true);
    setApplyMsg(null);
    setMode("idle");
    setResults([]);

    const resp = await startOptimize({
      symbol: config.symbol,
      initialCapital: config.initialCapital,
      file: null,
    });

    if (resp?.job_id) {
      setJobId(resp.job_id);
      setMode("backend");
    } else {
      // Backend indisponible → simulation client pour valider l'interface.
      setJobId(null);
      const sim = simulateGridSearch(
        {
          atrMin: config.atrMin,
          atrMax: config.atrMax,
          atrStep: config.atrStep,
          mlMin: config.mlMin,
          mlMax: config.mlMax,
          mlStep: config.mlStep,
          kellyMin: config.kellyMin,
          kellyMax: config.kellyMax,
          kellyStep: config.kellyStep,
          smcW: config.smcWeight,
          amdW: config.amdWeight,
        },
        config.objective,
      );
      setTimeout(() => {
        setResults(sim);
        setMode("simulated");
        setRunning(false);
      }, 900);
      return;
    }
    setRunning(false);
  }, [config]);

  // Polling de l'état du job backend.
  useEffect(() => {
    if (!jobId) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      const st = await fetchOptimizeStatus(jobId);
      if (!st) return;
      if (st.results && st.results.length > 0) {
        setResults(st.results.map(resultRowFromOptimize));
        clearInterval(pollRef.current!);
        setRunning(false);
        setJobId(null);
        setMode("backend");
      } else if (st.best_params) {
        setResults([]);
      }
    }, 2500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  const applyToProduction = async (row: GridResultRow) => {
    setApplyMsg(null);
    const sl = Number(row.params.sl_multiplier ?? 2);
    const conf = Number(row.params.ml_threshold ?? 0.6);
    const res = await applyOptimalSettings({
      slMult: sl,
      confThreshold: conf * 100,
      symbol: config.symbol,
    });
    if (res?.error || !res) {
      setApplyMsg("Backend injoignable (simulation) — aucun changement réel appliqué.");
    } else {
      setApplyMsg(`Appliqué à la production : SL×${sl}, seuil ML ${Math.round(conf * 100)}%.`);
    }
    setTimeout(() => setApplyMsg(null), 4000);
  };

  const bestRow = results[0];

  // Heatmap simplifiée : 2 axes (ml_threshold × kelly_fraction) colorées par rang.
  const heatRows = results.slice(0, 10);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* Panneau de configuration */}
      <section className="card h-fit p-4">
        <h2 className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          <FlaskConical className="h-4 w-4 text-cyan-400" /> Configuration de la grille
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Actif</span>
            <select
              value={config.symbol}
              onChange={(e) => setConfig({ ...config, symbol: e.target.value })}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Timeframe</span>
            <select
              value={config.timeframe}
              onChange={(e) => setConfig({ ...config, timeframe: e.target.value })}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
            >
              {TIMEFRAMES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 space-y-2 border-t border-zinc-800/70 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Multiplicateur ATR
          </p>
          <div className="grid grid-cols-3 gap-2">
            {num("Min", config.atrMin, (v) => setConfig({ ...config, atrMin: v }), 0.1)}
            {num("Max", config.atrMax, (v) => setConfig({ ...config, atrMax: v }), 0.1)}
            {num("Pas", config.atrStep, (v) => setConfig({ ...config, atrStep: v }), 0.1)}
          </div>

          <p className="pt-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Seuil de confiance ML
          </p>
          <div className="grid grid-cols-3 gap-2">
            {num("Min", config.mlMin, (v) => setConfig({ ...config, mlMin: v }), 0.01)}
            {num("Max", config.mlMax, (v) => setConfig({ ...config, mlMax: v }), 0.01)}
            {num("Pas", config.mlStep, (v) => setConfig({ ...config, mlStep: v }), 0.01)}
          </div>

          <p className="pt-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Kelly fractionnaire
          </p>
          <div className="grid grid-cols-3 gap-2">
            {num("Min", config.kellyMin, (v) => setConfig({ ...config, kellyMin: v }), 0.01)}
            {num("Max", config.kellyMax, (v) => setConfig({ ...config, kellyMax: v }), 0.01)}
            {num("Pas", config.kellyStep, (v) => setConfig({ ...config, kellyStep: v }), 0.01)}
          </div>

          <p className="pt-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Poids Aggregator (SMC vs AMD)
          </p>
          <div className="grid grid-cols-2 items-center gap-2">
            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">SMC</span>
              <input
                type="number"
                value={config.smcWeight}
                step={0.1}
                min={0}
                max={1}
                onChange={(e) => setConfig({ ...config, smcWeight: Number(e.target.value) })}
                className="w-20 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-right font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">AMD</span>
              <input
                type="number"
                value={config.amdWeight}
                step={0.1}
                min={0}
                max={1}
                onChange={(e) => setConfig({ ...config, amdWeight: Number(e.target.value) })}
                className="w-20 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-right font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
              />
            </label>
          </div>

          <p className="pt-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Fonction objectif
          </p>
          <select
            value={config.objective}
            onChange={(e) => setConfig({ ...config, objective: e.target.value as ObjectiveFunction })}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
          >
            {(Object.keys(OBJ_LABELS) as ObjectiveFunction[]).map((k) => (
              <option key={k} value={k}>{OBJ_LABELS[k]}</option>
            ))}
          </select>
        </div>

        <button
          onClick={runGrid}
          disabled={running}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Lancer la recherche
        </button>

        {mode === "backend" && (
          <p className="mt-2 text-center text-[10px] text-cyan-300">
            Job backend {jobId} · polling actif…
          </p>
        )}
        {mode === "simulated" && (
          <p className="mt-2 text-center text-[10px] text-amber-400">
            Backend injoignable → résultats simulés (validation UI uniquement)
          </p>
        )}
        {applyMsg && (
          <p className="mt-2 text-center text-[10px] text-emerald-400">{applyMsg}</p>
        )}
      </section>

      {/* Résultats */}
      <section className="card p-4 xl:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            <Search className="h-4 w-4 text-cyan-400" /> Résultats & classement
          </h2>
          {bestRow && !running && (
            <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-mono text-[10px] text-emerald-400">
              Meilleur : Sharpe {bestRow.sharpe.toFixed(2)} · PF {bestRow.profitFactor.toFixed(2)}
            </span>
          )}
        </div>

        {results.length === 0 && !running ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-zinc-600">
            <FlaskConical className="h-8 w-8 text-zinc-700" />
            <p className="text-sm">Aucune recherche lancée.</p>
            <p className="font-mono text-[11px]">Configurez la grille puis lancez l&apos;optimisation.</p>
          </div>
        ) : running && results.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-zinc-500">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            <p className="text-sm">Recherche en cours…</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/70 text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="px-3 py-2 font-medium">Rank</th>
                    <th className="px-3 py-2 font-medium">SL×</th>
                    <th className="px-3 py-2 font-medium">ML</th>
                    <th className="px-3 py-2 font-medium">Kelly</th>
                    <th className="px-3 py-2 font-medium text-right">WinRt</th>
                    <th className="px-3 py-2 font-medium text-right">PF</th>
                    <th className="px-3 py-2 font-medium text-right">MaxDD</th>
                    <th className="px-3 py-2 font-medium text-right">Sharpe</th>
                    <th className="px-3 py-2 font-medium text-right">Net</th>
                    <th className="px-3 py-2 font-medium text-right">Trades</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {results.map((r) => (
                    <tr key={r.rank} className="hover:bg-zinc-800/30">
                      <td className="px-3 py-2 font-mono text-xs text-zinc-500">#{r.rank}</td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-300">
                        {r.params.sl_multiplier?.toFixed(1) ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-300">
                        {Math.round((r.params.ml_threshold ?? 0) * 100)}%
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-300">
                        {Number(r.params.kelly_fraction ?? 0).toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-emerald-400">
                        {(r.winRate * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-zinc-300">
                        {r.profitFactor.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-rose-400">
                        {(r.maxDrawdown * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-cyan-300">
                        {r.sharpe.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-zinc-200">
                        {r.netProfit > 0 ? "+" : ""}
                        {r.netProfit.toLocaleString("fr-FR")} $
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-zinc-500">{r.trades}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => applyToProduction(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-800 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                          title="Appliquer à la production"
                        >
                          <Rocket className="h-3 w-3" /> Appliquer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Heatmap : rang coloré par paramètres ML × Kelly */}
            {heatRows.length > 1 && (
              <div className="mt-4 border-t border-zinc-800/70 pt-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  Heatmap Top 10 (ML Threshold → Kelly)
                </p>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
                  {heatRows.map((r) => {
                    const intensity = Math.max(0, 1 - (r.rank - 1) / 10);
                    const bg =
                      r.rank <= 2
                        ? "bg-emerald-500/30"
                        : r.rank <= 5
                          ? "bg-cyan-500/20"
                          : "bg-zinc-800/70";
                    return (
                      <div
                        key={`heat-${r.rank}`}
                        className={`rounded-lg border border-zinc-800/70 p-2 font-mono text-[10px] ${bg}`}
                        style={{ opacity: 0.55 + intensity * 0.45 }}
                      >
                        <p className="text-zinc-400">
                          ML {Math.round((r.params.ml_threshold ?? 0) * 100)}% · K {(r.params.kelly_fraction ?? 0).toFixed(1)}
                        </p>
                        <p className="mt-0.5 text-zinc-200">Sharpe {r.sharpe.toFixed(2)}</p>
                        <p className={r.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {r.netProfit >= 0 ? "+" : ""}
                          {r.netProfit.toLocaleString("fr-FR")} $
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}