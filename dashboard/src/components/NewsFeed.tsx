"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Globe, Newspaper, RefreshCw } from "lucide-react";
import { fetchNewsEvents } from "@/lib/api";
import type { NewsEvent } from "@/types/trading";

/** Fil d'actualités & protection news — backend /news-events (RSS Investing.com). */
export default function NewsFeed() {
  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let list = await fetchNewsEvents();
      if (list.length === 0) list = mockNews();
      if (!cancelled) {
        setEvents(list);
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between border-b border-zinc-800/70 pb-3">
        <div className="flex items-center gap-2">
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
          ) : (
            <Newspaper className="h-4 w-4 text-cyan-400" />
          )}
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
            Actualités & Protection
          </h3>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">RSS /news-events</span>
      </div>

      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {events.length === 0 && (
          <p className="text-xs text-zinc-500">Aucune actualité disponible.</p>
        )}
        {events.map((e) => (
          <div
            key={e.id}
            className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3"
          >
            <div className="flex items-start gap-2">
              <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <div className="min-w-0">
                <p className="text-xs leading-snug text-zinc-200">{e.headline}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px]">
                  <span className="text-zinc-500">{e.time}</span>
                  <SentimentBadge score={e.sentimentScore} />
                  <span
                    className={`rounded px-1.5 py-0.5 font-bold ${
                      e.severity === "CRITICAL"
                        ? "bg-rose-500/15 text-rose-400"
                        : e.severity === "WARNING"
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-zinc-700/40 text-zinc-400"
                    }`}
                  >
                    {e.severity}
                  </span>
                  <span className="truncate text-zinc-500">{e.actionTaken}</span>
                </div>
              </div>
              {e.severity === "CRITICAL" && (
                <AlertTriangle className="ml-auto h-4 w-4 shrink-0 text-rose-400" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SentimentBadge({ score }: { score: number }) {
  const label = score > 0.15 ? "HAUSSIER" : score < -0.15 ? "BAISSIER" : "NEUTRE";
  const cls =
    score > 0.15
      ? "bg-emerald-500/15 text-emerald-400"
      : score < -0.15
        ? "bg-rose-500/15 text-rose-400"
        : "bg-zinc-700/40 text-zinc-400";
  return (
    <span className={`rounded px-1.5 py-0.5 font-bold ${cls}`}>
      {label} {score >= 0 ? "+" : ""}
      {score.toFixed(2)}
    </span>
  );
}

function mockNews(): NewsEvent[] {
  const now = new Date();
  const t = (m: number) =>
    new Date(now.getTime() - m * 60000).toLocaleTimeString("fr-FR", { hour12: false });
  return [
    {
      id: "m1",
      time: t(3),
      headline:
        "FED: Powell évoque une trajectoire assouplie si l'inflation confirme sa décélération à 2.1%",
      sentimentScore: 0.85,
      actionTaken: "Protection CRITICAL évaluée",
      severity: "CRITICAL",
    },
    {
      id: "m2",
      time: t(12),
      headline:
        "Or (XAU/USD): Demande physique record des banques centrales et tensions géopolitiques",
      sentimentScore: 0.92,
      actionTaken: "Protection CRITICAL évaluée",
      severity: "WARNING",
    },
    {
      id: "m3",
      time: t(28),
      headline: "Royaume-Uni: Dégradation inattendue des ventes au détail (-1.4% m/m)",
      sentimentScore: -0.76,
      actionTaken: "Protection WARNING évaluée",
      severity: "WARNING",
    },
    {
      id: "m4",
      time: t(45),
      headline: "Bitcoin: Prises de bénéfices modérées sous les 68 000 $ en séance asiatique",
      sentimentScore: -0.32,
      actionTaken: "Protection NORMAL évaluée",
      severity: "NORMAL",
    },
    {
      id: "m5",
      time: t(60),
      headline: "BCE: Stabilité des taux directeurs confirmée",
      sentimentScore: 0.05,
      actionTaken: "Aucune action",
      severity: "NORMAL",
    },
  ];
}