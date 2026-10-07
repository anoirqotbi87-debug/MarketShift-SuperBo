"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, TerminalSquare } from "lucide-react";
import type { EngineLog, LogLevel } from "@/types/trading";
import { fetchLogs } from "@/lib/api";

type FilterKey = "ALL" | LogLevel;

const FILTERS: FilterKey[] = ["ALL", "DEBUG", "INFO", "WARNING", "ERROR"];

interface LogsViewProps {
  logs: EngineLog[];
}

/** Vue terminal — journal complet filtrable avec buffer glissant consolidé (jusqu'à 200 logs). */
export default function LogsView({ logs }: LogsViewProps) {
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [query, setQuery] = useState("");
  const [buffer, setBuffer] = useState<EngineLog[]>(logs);

  // Chargement initial des 200 logs réels du backend
  useEffect(() => {
    let cancelled = false;
    fetchLogs().then((res) => {
      if (!cancelled && res.length > 0) {
        setBuffer((prev) => {
          const map = new Map<string, EngineLog>();
          [...res, ...prev].forEach((l) => map.set(`${l.time}-${l.message}`, l));
          return Array.from(map.values()).slice(-200);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fusion continue avec les logs reçus en temps réel via WS
  useEffect(() => {
    if (logs.length === 0) return;
    setBuffer((prev) => {
      const map = new Map<string, EngineLog>();
      [...prev, ...logs].forEach((l) => map.set(`${l.time}-${l.message}`, l));
      return Array.from(map.values()).slice(-200);
    });
  }, [logs]);

  const filtered = useMemo(() => {
    return buffer.filter((l) => {
      if (filter !== "ALL" && l.level !== filter) return false;
      if (query && !l.message.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [buffer, filter, query]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { ALL: buffer.length, DEBUG: 0, INFO: 0, WARNING: 0, ERROR: 0 };
    for (const l of buffer) c[l.level] += 1;
    return c;
  }, [buffer]);

  return (
    <div className="card flex h-full flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-zinc-800/70 pb-3">
        <TerminalSquare className="h-4 w-4 text-cyan-400" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
          Journal du moteur
        </h3>
        <span className="ml-auto font-mono text-[10px] text-zinc-500">
          {filtered.length} / {buffer.length} entrées
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans les logs…"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-700 focus:outline-none"
          />
        </div>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-2.5 py-1 font-mono text-[10px] font-bold transition ${
              filter === f
                ? f === "ERROR"
                  ? "bg-rose-500/20 text-rose-300"
                  : f === "WARNING"
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-cyan-500/20 text-cyan-300"
                : "bg-zinc-800/60 text-zinc-500 hover:bg-zinc-800"
            }`}
          >
            {f} {counts[f] > 0 && <span className="opacity-60">({counts[f]})</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto pr-1 font-mono text-[10px] leading-relaxed">
        {filtered.length === 0 && (
          <p className="mt-8 text-center text-zinc-600">Aucune entrée ne correspond.</p>
        )}
        {filtered.map((log, i) => (
          <div
            key={`${log.time}-${i}`}
            className="rounded-md border border-zinc-800/40 bg-zinc-900/30 px-2 py-1"
          >
            <span className="text-zinc-600">[{log.time}]</span>{" "}
            <span
              className={
                log.level === "ERROR"
                  ? "font-bold text-rose-400"
                  : log.level === "WARNING"
                    ? "font-bold text-amber-400"
                    : log.level === "DEBUG"
                      ? "text-violet-400"
                      : "text-emerald-400"
              }
            >
              {log.level.padEnd(7)}
            </span>{" "}
            <span className="text-zinc-300">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}