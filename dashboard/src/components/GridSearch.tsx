"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart2,
  FlaskConical,
  Loader2,
  Play,
  Rocket,
  Search,
} from "lucide-react";
import { applyOptimalSettings, fetchOptimizeStatus, startOptimize } from "@/lib/api";
import { simulateGridSearch } from "@/lib/engine";
import type { GridResultRow, ObjectiveFunction } from "@/types/trading";

const SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "EURGBP", "EURJPY", "GBPJPY", "GOLD", "XAUUSD", "SILVER", "USOIL",
  "US30", "US100", "US500", "GER40", "BTCUSD", "ETHUSD", "SOLUSD"
];

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

function parseOptimizeResponse(st: any): GridResultRow[] {
  if (!st) return [];
  const rawList = st.results ?? st.result?.gridResults ?? st.gridResults ?? [];
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  return rawList.map((r: any, idx: number) => {
    const sl = Number(r.sl_multiplier ?? r.slMult ?? 1.5);
    const confRaw = Number(r.ml_threshold ?? r.confThreshold ?? 60);
    const conf = confRaw > 1 ? confRaw / 100 : confRaw;
    const wrRaw = Number(r.win_rate ?? r.winRate ?? 50);
    const winRate = wrRaw > 1 ? wrRaw / 100 : wrRaw;
    const pf = Number(r.profit_factor ?? r.profitFactor ?? 1.0);
    const ddRaw = Number(r.max_drawdown ?? r.maxDrawdownPct ?? 10);
    const maxDrawdown = ddRaw > 1 ? ddRaw / 100 : ddRaw;
    const sharpe = Number(r.sharpe_ratio ?? r.sharpeRatio ?? 0);
    const netProfit = Number(r.net_profit ?? r.netProfit ?? 0);
    const trades = Number(r.trades ?? r.totalTrades ?? 0);

    return {
      rank: r.rank ?? idx + 1,
      params: {
        sl_multiplier: sl,
        ml_threshold: conf,
        kelly_fraction: Number(r.kelly_fraction ?? 0.25),
        smc_weight: Number(r.smc_weight ?? 0.5),
        amd_weight: Number(r.amd_weight ?? 0.5),
      },
      winRate,
      profitFactor: pf,
      maxDrawdown,
      sharpe,
      netProfit,
      trades,
    };
  });
}

function sortGridResults(rows: GridResultRow[], obj: ObjectiveFunction): GridResultRow[] {
  const sorted = [...rows];
  if (obj === "net_profit") {
    sorted.sort((a, b) => b.netProfit - a.netProfit);
  } else if (obj === "calmar") {
    sorted.sort((a, b) => (b.netProfit / Math.max(0.01, b.maxDrawdown)) - (a.netProfit / Math.max(0.01, a.maxDrawdown)));
  } else {
    // sharpe
    sorted.sort((a, b) => b.sharpe - a.sharpe);
  }
  return sorted.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

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
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "backend" | "simulated" | "cached">("idle");
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Au chargement : restaurer le dernier résultat mis en cache par le backend
  useEffect(() => {
    let cancelled = false;
    fetchOptimizeStatus("latest").then((st) => {
      if (cancelled || !st) return;
      const parsed = parseOptimizeResponse(st);
      if (parsed.length > 0) {
        setResults(sortGridResults(parsed, DEFAULT_CONFIG.objective));
        setMode("cached");
        setProgress(100);
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Lancement du Grid Search
  const runGrid = useCallback(async () => {
    setRunning(true);
    setProgress(5);
    setApplyMsg(null);
    setStatusMsg("Démarrage du job & extraction historique MT5...");
    setResults([]);

    try {
      const resp = await startOptimize({
        symbol: config.symbol,
        initialCapital: config.initialCapital,
        file: null,
      });

      if (resp?.job_id) {
        setJobId(resp.job_id);
        setMode("backend");
        setProgress(15);
        setStatusMsg(`Job ${resp.job_id.slice(0, 8)}... démarré. Simulation vectorielle en cours.`);
      } else {
        // Fallback simulation locale si backend non disponible
        setJobId(null);
        setStatusMsg("Calcul de simulation en cours...");
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
          setResults(sortGridResults(sim, config.objective));
          setMode("simulated");
          setRunning(false);
          setProgress(100);
          setStatusMsg("Simulation locale terminée.");
        }, 1200);
      }
    } catch (err: any) {
      setRunning(false);
      setStatusMsg(`Erreur de lancement : ${err?.message ?? "Échec réseau"}`);
    }
  }, [config]);

  // 3. Polling réactif du job backend
  useEffect(() => {
    if (!jobId) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const st = await fetchOptimizeStatus(jobId);
        if (!st) return;

        if (typeof st.progress === "number" && st.progress > 0) {
          setProgress(Math.min(100, st.progress));
        }

        const parsed = parseOptimizeResponse(st);

        if (st.status === "completed" || parsed.length > 0) {
          if (parsed.length > 0) {
            setResults(sortGridResults(parsed, config.objective));
            setMode("backend");
          }
          if (pollRef.current) clearInterval(pollRef.current);
          setRunning(false);
          setJobId(null);
          setProgress(100);
          setStatusMsg("Optimisation terminée avec succès.");
        } else if (st.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          setRunning(false);
          setJobId(null);
          setStatusMsg(`Erreur lors de l'optimisation : ${st.error ?? "Inconnue"}`);
        } else {
          setStatusMsg(`Simulation vectorielle en cours... (${st.progress ?? progress}%)`);
        }
      } catch {
        // En cas d'erreur transitoire réseau, on continue le polling
      }
    }, 1500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, config.objective, progress]);

  // 4. Application en 1-clic des paramètres optimaux à la production
  const applyToProduction = async (row: GridResultRow) => {
    setApplying(true);
    setApplyMsg(null);
    const sl = Number(row.params.sl_multiplier ?? 2);
    const conf = Number(row.params.ml_threshold ?? 0.6);
    try {
      const res = await applyOptimalSettings({
        slMult: sl,
        confThreshold: conf * 100,
        symbol: config.symbol,
      });
      if (res?.error || !res) {
        setApplyMsg("Backend injoignable — aucun changement appliqué.");
      } else {
        setApplyMsg(`✅ Appliqué au bot (.env) : SL×${sl}, seuil confiance ML ${Math.round(conf * 100)}% pour ${config.symbol}.`);
      }
    } catch {
      setApplyMsg("Erreur lors de l'enregistrement des paramètres.");
    } finally {
      setApplying(false);
      setTimeout(() => setApplyMsg(null), 5000);
    }
  };

  const bestRow = results[0];
  const heatRows = results.slice(0, 10);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* ── PANNEAU DE CONFIGURATION DE LA GRILLE ── */}
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
            Multiplicateur ATR (Stop Loss)
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
            onChange={(e) => {
              const newObj = e.target.value as ObjectiveFunction;
              setConfig({ ...config, objective: newObj });
              if (results.length > 0) {
                setResults(sortGridResults(results, newObj));
              }
            }}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
          >
            {(Object.keys(OBJ_LABELS) as ObjectiveFunction[]).map((k) => (
              <option key={k} value={k}>{OBJ_LABELS[k]}</option>
            ))}
          </select>
        </div>

        <button
          onClick={runGrid}
          disabled={running || jobId !== null}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60 shadow-lg shadow-cyan-950/40"
        >
          {running || jobId !== null ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <Play className="h-4 w-4 text-white" />
          )}
          {running || jobId !== null ? `Optimisation en cours (${progress}%)` : "Lancer la recherche"}
        </button>

        {statusMsg && (
          <p className="mt-2.5 text-center font-mono text-[11px] text-cyan-300">
            {statusMsg}
          </p>
        )}

        {applyMsg && (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-center text-xs text-emerald-300">
            {applyMsg}
          </div>
        )}
      </section>

      {/* ── ZONE DE RÉSULTATS & CLASSEMENT ── */}
      <section className="card p-4 xl:col-span-2 flex flex-col gap-4">
        {/* En-tête */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-100">
              Résultats &amp; Classement Hyperparamètres
            </h2>
            {results.length > 0 && (
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                {results.length} combinaisons testées
              </span>
            )}
          </div>

          {mode === "cached" && (
            <span className="font-mono text-[10px] text-zinc-500">
              Dernière optimisation en mémoire (MT5)
            </span>
          )}
        </div>

        {/* ── 1. État : En cours de recherche avec jauge de progression ── */}
        {(running || jobId !== null) && (
          <div className="rounded-xl border border-cyan-800/50 bg-gradient-to-br from-zinc-900 via-cyan-950/20 to-zinc-900 p-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 animate-pulse mb-3">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <h3 className="text-sm font-bold text-zinc-100">
              Simulation vectorielle en cours pour {config.symbol} ({config.timeframe})
            </h3>
            <p className="mt-1 text-xs text-zinc-400 max-w-md mx-auto">
              Évaluation séquentielle des Stop Loss ATR × Seuils de Confiance ML sur les bougies historiques réelles.
            </p>

            <div className="mt-4 max-w-md mx-auto">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400 mb-1.5">
                <span>Progression du calcul</span>
                <span className="text-cyan-300 font-bold">{progress}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── 2. État : Aucun résultat et pas de job actif ── */}
        {results.length === 0 && !running && jobId === null && (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center text-zinc-500 border border-dashed border-zinc-800/80 rounded-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-zinc-600">
              <FlaskConical className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-300">Aucune optimisation active</p>
              <p className="mt-1 max-w-sm text-xs text-zinc-500">
                Sélectionnez votre actif ({config.symbol}), vos plages d&apos;ATR et de confiance IA, puis cliquez sur{" "}
                <span className="text-cyan-400 font-medium">Lancer la recherche</span> pour identifier la configuration la plus rentable.
              </p>
            </div>
          </div>
        )}

        {/* ── 3. État : Résultats prêts ── */}
        {results.length > 0 && !running && (
          <>
            {/* HERO CARD : Meilleure configuration détectée */}
            {bestRow && (
              <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/25 via-zinc-900 to-zinc-900 p-4 shadow-lg shadow-emerald-950/20">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                        ⭐
                      </span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Configuration Optimale Détectée (#{bestRow.rank})
                      </h3>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block">Stop Loss ATR</span>
                        <span className="font-bold text-zinc-100">{bestRow.params.sl_multiplier?.toFixed(2)}x</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block">Seuil IA ML</span>
                        <span className="font-bold text-cyan-300">{Math.round((bestRow.params.ml_threshold ?? 0.6) * 100)}%</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block">Ratio de Sharpe</span>
                        <span className="font-bold text-emerald-300">{bestRow.sharpe.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block">Win Rate</span>
                        <span className="font-bold text-emerald-400">{(bestRow.winRate * 100).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block">Profit Factor</span>
                        <span className="font-bold text-zinc-100">{bestRow.profitFactor.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block">P&amp;L Net</span>
                        <span className={`font-bold ${bestRow.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {bestRow.netProfit >= 0 ? "+" : ""}{bestRow.netProfit.toLocaleString("fr-FR")} $
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => applyToProduction(bestRow)}
                    disabled={applying}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60 shadow-lg shadow-emerald-950/40 shrink-0 self-start sm:self-auto"
                  >
                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                    <span>Appliquer au Bot (.env)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Tableau complet des résultats */}
            <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-400">
                    <th className="px-3 py-2.5 font-semibold">Rang</th>
                    <th className="px-3 py-2.5 font-semibold">SL Multiplier</th>
                    <th className="px-3 py-2.5 font-semibold">Seuil IA ML</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Win Rate</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Profit Factor</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Max Drawdown</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Sharpe</th>
                    <th className="px-3 py-2.5 font-semibold text-right">P&amp;L Net</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Trades</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 font-mono">
                  {results.map((r) => {
                    const isTop = r.rank === 1;
                    return (
                      <tr key={r.rank} className={isTop ? "bg-emerald-500/5 hover:bg-emerald-500/10" : "hover:bg-zinc-800/30"}>
                        <td className="px-3 py-2 text-zinc-400 font-bold">
                          {isTop ? <span className="text-emerald-400">#1 🏆</span> : `#${r.rank}`}
                        </td>
                        <td className="px-3 py-2 text-zinc-200">
                          {r.params.sl_multiplier?.toFixed(2)}x
                        </td>
                        <td className="px-3 py-2 text-cyan-300 font-semibold">
                          {Math.round((r.params.ml_threshold ?? 0) * 100)}%
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-400">
                          {(r.winRate * 100).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-200">
                          {r.profitFactor.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right text-rose-400">
                          {(r.maxDrawdown * 100).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right text-cyan-300 font-bold">
                          {r.sharpe.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={r.netProfit >= 0 ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                            {r.netProfit >= 0 ? "+" : ""}
                            {r.netProfit.toLocaleString("fr-FR")} $
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-400">{r.trades}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => applyToProduction(r)}
                            disabled={applying}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-200 transition hover:border-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-300"
                            title="Appliquer cette ligne à la configuration"
                          >
                            <Rocket className="h-3 w-3" /> Appliquer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Heatmap Top 10 */}
            {heatRows.length > 1 && (
              <div className="rounded-xl border border-zinc-800/80 p-4 bg-zinc-900/40">
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <BarChart2 className="h-3.5 w-3.5 text-cyan-400" /> Heatmap Top 10 Combinaisons (ML Threshold → SL Multiplier)
                </p>
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
                  {heatRows.map((r) => {
                    const isTop1 = r.rank === 1;
                    const bg =
                      isTop1
                        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                        : r.rank <= 3
                          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                          : "border-zinc-800 bg-zinc-900 text-zinc-300";
                    return (
                      <div
                        key={`heat-${r.rank}`}
                        className={`rounded-lg border p-2.5 font-mono text-[11px] transition hover:scale-[1.02] cursor-pointer ${bg}`}
                        onClick={() => applyToProduction(r)}
                        title="Cliquer pour appliquer cette configuration"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold">#{r.rank}</span>
                          <span className="text-zinc-400">SL {r.params.sl_multiplier?.toFixed(1)}x</span>
                        </div>
                        <p className="mt-1 font-semibold">
                          ML {Math.round((r.params.ml_threshold ?? 0) * 100)}%
                        </p>
                        <div className="mt-1 flex items-center justify-between text-[10px] border-t border-zinc-800/50 pt-1">
                          <span className="text-cyan-300">Sh: {r.sharpe.toFixed(2)}</span>
                          <span className={r.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {r.netProfit >= 0 ? "+" : ""}{Math.round(r.netProfit)}$
                          </span>
                        </div>
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