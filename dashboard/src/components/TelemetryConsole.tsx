"use client";

import { useMemo, useState } from "react";
import { BrainCircuit, ChevronDown, ChevronUp, Cpu, Terminal } from "lucide-react";
import type { EngineLog, LogLevel, MlStats, SignalData } from "@/types/trading";

interface TelemetryConsoleProps {
  logs: EngineLog[];
  signals: Record<string, SignalData>;
  ml: MlStats;
}

const LEVEL_STYLES: Record<LogLevel, string> = {
  INFO: "text-emerald-400",
  DEBUG: "text-zinc-500",
  WARNING: "text-amber-400",
  ERROR: "text-rose-400",
};

const safeLevel = (lvl: string | undefined, msg: string): LogLevel => {
  if (lvl) return lvl as LogLevel;
  if (/❌|🚫|Erreur|erreur|REJET|VETO/i.test(msg)) return "ERROR";
  if (/⚠|⚠️/i.test(msg)) return "WARNING";
  return "INFO";
};

const fmtTime = (t: string) => {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (Number.isNaN(d.getTime())) return t;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export default function TelemetryConsole({ logs, signals, ml }: TelemetryConsoleProps) {
  const [levelFilter, setLevelFilter] = useState<LogLevel | "ALL">("ALL");
  const [collapsed, setCollapsed] = useState(false);

  const filtered = useMemo(
    () =>
      (logs ?? [])
        .filter((l) =>
          levelFilter === "ALL"
            ? l.level !== "DEBUG"
            : l.level === levelFilter,
        )
        .slice(0, 60),
    [logs, levelFilter],
  );

  const nbErrors = (logs ?? []).filter((l) => l.level === "ERROR").length;

  return (
    <section className="card flex h-full flex-col overflow-hidden">
      {/* Entête + panneau ML + filtres */}
      <div className="border-b border-zinc-800/80 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            <Terminal className="h-3.5 w-3.5 text-cyan-400" /> Télémétrie IA
          </h2>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label={collapsed ? "Déplier" : "Replier"}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>

        {/* Résumé ML */}
        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 ${
              ml.trained
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-amber-500/10 text-amber-400"
            }`}
          >
            <BrainCircuit className="h-3.5 w-3.5" />
            ML {ml.trained ? "entraîné" : "non entraîné"} · acc {ml.accuracy.toFixed(1)}%
          </span>
          <span className="rounded-md bg-cyan-500/10 px-2 py-1 text-cyan-300">
            <Cpu className="mr-1 inline h-3.5 w-3.5" />
            {Object.keys(signals || {}).length} symboles suivis
          </span>
          {nbErrors > 0 && (
            <span className="rounded-md bg-rose-500/10 px-2 py-1 text-rose-400">
              {nbErrors} erreur(s)
            </span>
          )}
        </div>

        {/* Filtres par sévérité */}
        <div className="mt-3 flex items-center gap-1">
          {(["ALL", "INFO", "WARNING", "ERROR"] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
                levelFilter === lvl
                  ? "bg-zinc-700 text-zinc-200"
                  : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Flux des logs */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-zinc-600">
              Aucun log — en attente de la première connexion…
            </p>
          ) : (
            filtered.map((l, i) => {
              const lvl = safeLevel(l.level, l.message);
              return (
                <div key={`${fmtTime(l.time)}-${i}`} className="log-line flex gap-2 py-0.5">
                  <span className="shrink-0 text-zinc-600">{fmtTime(l.time)}</span>
                  <span className={`shrink-0 w-16 ${LEVEL_STYLES[lvl]}`}>{[lvl]}</span>
                  <span className="text-zinc-300">{l.message}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}