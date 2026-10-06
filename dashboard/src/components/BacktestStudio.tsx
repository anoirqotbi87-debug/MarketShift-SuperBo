"use client";

import { useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FileUp, Loader2, Play, TrendingUp } from "lucide-react";
import { runBacktest } from "@/lib/api";
import { simulateEquityCurve } from "@/lib/engine";
import type { BacktestReport } from "@/types/trading";

const PERIODS = ["1 mois", "3 mois", "1 an"] as const;
type Period = (typeof PERIODS)[number];

const BACKTEST_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "GOLD", "BTCUSD"];

interface SimulatedRow {
  time: string;
  equity: number;
  label: string;
}

const fmtUsd = (v: number) =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}`;

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2 font-mono text-[11px] shadow-xl">
      <p className="text-zinc-400">{label}</p>
      <p className="mt-1 text-cyan-300">Capital : {fmtUsd(row.equity)}</p>
      <p className="text-zinc-500">Stratégie : {row.label}</p>
    </div>
  );
}

export default function BacktestStudio() {
  const [symbol, setSymbol] = useState("EURUSD");
  const [period, setPeriod] = useState<Period>("1 mois");
  const [capital, setCapital] = useState(10000);
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [curve, setCurve] = useState<Array<{ time: string; equity: number; label: string }>>([]);
  const [buyHold, setBuyHold] = useState<SimulatedRow[]>([]);
  const [mode, setMode] = useState<"idle" | "backend" | "simulated">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    setRunning(true);
    setReport(null);
    setCurve([]);
    setBuyHold([]);
    setMode("idle");

    if (file) {
      const res = await runBacktest({ symbol, initialCapital: capital, file });
      if (res && !res.error) {
        setReport(res);
        setMode("backend");
        const eq = Array.isArray(res.equity_curve)
          ? res.equity_curve.map((p, i) => ({
              time: typeof p.time === "string" ? p.time : String(i),
              equity: Number(p.equity),
              label: "Stratégie",
            }))
          : [];
        setCurve(eq);
        setRunning(false);
        return;
      }
    }

    // Simulation client si pas de fichier ou backend injoignable.
    const nPoints = period === "1 mois" ? 30 : period === "3 mois" ? 90 : 260;
    const pnl = period === "1 mois" ? 420 : period === "3 mois" ? 1250 : 3200;
    const simCurve = simulateEquityCurve(nPoints, pnl, "Stratégie", 0);
    const bh = simulateEquityCurve(nPoints, Math.round(pnl * 0.42), "Buy & Hold", 7);
    setCurve(simCurve);
    setBuyHold(bh);
    setReport({
      total_trades: Math.round(nPoints * 2.2),
      win_rate: 0.58 + Math.random() * 0.08,
      profit_factor: 1.4 + Math.random() * 0.4,
      max_drawdown: 0.09 + Math.random() * 0.06,
      sharpe_ratio: 1.1 + Math.random() * 0.8,
      net_profit: pnl,
      initial_balance: capital,
      final_balance: capital + pnl,
      avg_trade: Math.round(pnl / Math.round(nPoints * 2.2)),
      max_loss_streak: 3 + Math.floor(Math.random() * 3),
    });
    setMode("simulated");
    setRunning(false);
  };

  const simulatedRows = curve.length > 0 && buyHold.length > 0
    ? [...curve, ...buyHold]
    : curve;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* Paramètres */}
      <section className="card h-fit p-4">
        <h2 className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          <TrendingUp className="h-4 w-4 text-cyan-400" /> Exécution du backtest
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Actif</span>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
            >
              {BACKTEST_SYMBOLS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Période</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Capital initial</span>
          <input
            type="number"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
            className="w-28 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-right font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
          />
        </label>

        {/* Upload CSV (optionnel) */}
        <div className="mt-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 px-3 py-3 text-xs text-zinc-400 transition hover:border-cyan-800 hover:text-cyan-300"
          >
            <FileUp className="h-4 w-4" />
            {file ? `Fichier : ${file.name}` : "Charger un CSV historique (optionnel)"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1.5 text-[10px] text-zinc-600">
            Sans fichier : simulations montrées à des fins de démonstration.
          </p>
        </div>

        <button
          onClick={run}
          disabled={running}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Lancer le backtest
        </button>

        {mode === "simulated" && (
          <p className="mt-2 text-center text-[10px] text-amber-400">
            Simulation client (backend injoignable ou CSV absent)
          </p>
        )}
      </section>

      {/* Résultats */}
      <section className="card flex flex-col p-4 xl:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            <TrendingUp className="h-4 w-4 text-cyan-400" /> Courbe de capital vs Buy & Hold
          </h2>
          {report && (
            <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-mono text-[10px] text-emerald-400">
              P&L {report.net_profit! >= 0 ? "+" : ""}
              {fmtUsd(report.net_profit ?? 0)}
            </span>
          )}
        </div>

        {simulatedRows.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-zinc-600">
            <TrendingUp className="h-8 w-8 text-zinc-700" />
            <p className="text-sm">Aucun backtest exécuté.</p>
            <p className="font-mono text-[11px]">Lancez une exécution pour voir la courbe.</p>
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={simulatedRows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="bktGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="bhGrad" x1="0" y1="0" x2="0" y2="1">
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
                  tickFormatter={(v) => fmtUsd(v)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="equity"
                  name="Stratégie"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  fill="url(#bktGrad)"
                  dot={false}
                />
                {buyHold.length > 0 && (
                  <Area
                    type="monotone"
                    dataKey="equity"
                    name="Buy & Hold"
                    stroke="#a78bfa"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    fill="url(#bhGrad)"
                    dot={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Rapport d'exécution */}
        {report && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-800/70 pt-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Trades", value: String(report.total_trades ?? "—") },
              { label: "Win Rate", value: report.win_rate != null ? `${(report.win_rate * 100).toFixed(1)}%` : "—", color: "text-emerald-400" },
              { label: "Profit Factor", value: report.profit_factor?.toFixed(2) ?? "—" },
              { label: "Max Drawdown", value: report.max_drawdown != null ? `${(report.max_drawdown * 100).toFixed(1)}%` : "—", color: "text-rose-400" },
              { label: "Trade moyen", value: report.avg_trade != null ? fmtUsd(report.avg_trade) : "—" },
              { label: "Série pertes", value: String(report.max_loss_streak ?? "—") },
            ].map((m) => (
              <div key={m.label} className="rounded-lg bg-zinc-925 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">{m.label}</p>
                <p className={`mt-1 font-mono text-sm font-semibold ${m.color ?? "text-zinc-200"}`}>{m.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}