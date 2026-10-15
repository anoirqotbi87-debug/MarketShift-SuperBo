"use client";

import { useEffect, useState, useMemo } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  Globe,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { fetchMacroNews, fetchNewsEvents } from "@/lib/api";
import type { MacroEmbargoSummary, MacroNewsEvent } from "@/types/trading";

export default function NewsFeed() {
  const [summary, setSummary] = useState<MacroEmbargoSummary | null>(null);
  const [events, setEvents] = useState<MacroNewsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<"all" | "upcoming" | "active" | "passed">("all");

  const loadData = async () => {
    try {
      const res = await fetchMacroNews();
      if (res && res.events && res.events.length > 0) {
        setSummary(res.summary);
        setEvents(res.events);
      } else {
        // Fallback avec /news-events
        const oldEvents = await fetchNewsEvents();
        if (oldEvents && oldEvents.length > 0) {
          const mapped: MacroNewsEvent[] = oldEvents.map((e, idx) => ({
            id: e.id || `news-${idx}`,
            title: e.headline,
            country: e.country || "USD",
            impact: "High",
            date: e.time,
            timestampUtc: e.timestampUtc || new Date().toISOString(),
            timeUntilMinutes: 0,
            windowStartUtc: "",
            windowEndUtc: "",
            isInEmbargo: e.isInEmbargo || e.severity === "CRITICAL",
            status: e.status || (e.severity === "CRITICAL" ? "IN_EMBARGO" : "PASSED"),
            affectedSymbols: e.affectedSymbols || ["EURUSD", "GBPUSD", "USDJPY", "GOLD", "BTCUSD"],
          }));
          setEvents(mapped);
          const active = mapped.filter((m) => m.isInEmbargo);
          setSummary({
            isAnyEmbargoActive: active.length > 0,
            activeEventsCount: active.length,
            activeEvents: active,
            blockedSymbols: Array.from(new Set(active.flatMap((a) => a.affectedSymbols))),
            nextEvent: mapped.find((m) => m.status === "UPCOMING") || null,
            totalHighImpactLoaded: mapped.length,
            pauseBeforeMinutes: 30,
            pauseAfterMinutes: 30,
            lastFetchUtc: new Date().toISOString(),
            serverTimeUtc: new Date().toISOString(),
          });
        }
      }
    } catch {
      // Ignorer
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 15000);
    return () => clearInterval(timer);
  }, []);

  const filteredEvents = useMemo(() => {
    if (filterTab === "active") return events.filter((e) => e.isInEmbargo);
    if (filterTab === "upcoming") return events.filter((e) => e.status === "UPCOMING");
    if (filterTab === "passed") return events.filter((e) => e.status === "PASSED");
    return events;
  }, [events, filterTab]);

  const isEmbargo = summary?.isAnyEmbargoActive ?? false;

  return (
    <div className="space-y-4">
      {/* ── BANNIÈRE D'ÉTAT TEMPS RÉEL DU FILTRE MACRO ── */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-5 backdrop-blur-md transition-all ${
          isEmbargo
            ? "border-rose-500/40 bg-gradient-to-r from-rose-950/40 via-rose-900/20 to-zinc-950/60 shadow-lg shadow-rose-950/30"
            : "border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 via-emerald-900/10 to-zinc-950/60"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div
              className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                isEmbargo
                  ? "border-rose-500/40 bg-rose-500/20 text-rose-400 animate-pulse"
                  : "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
              }`}
            >
              {isEmbargo ? (
                <ShieldAlert className="h-6 w-6" />
              ) : (
                <ShieldCheck className="h-6 w-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                    isEmbargo
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isEmbargo ? "bg-rose-400 animate-ping" : "bg-emerald-400"
                    }`}
                  />
                  {isEmbargo ? "EMBARGO MACRO EN COURS" : "MARCHÉ OUVERT · AUCUN EMBARGO"}
                </span>
                <span className="text-[11px] text-zinc-500">ForexFactory High Impact</span>
              </div>
              <h2 className="mt-1 text-base font-bold text-zinc-100">
                {isEmbargo ? (
                  <span>
                    Trading temporairement suspendu sur :{" "}
                    <span className="text-rose-400 font-mono">
                      {summary?.blockedSymbols.join(", ") || "Tous"}
                    </span>
                  </span>
                ) : (
                  <span>Les 5 symboles sont libres d&apos;être négociés</span>
                )}
              </h2>
              <p className="mt-1 text-xs text-zinc-400 max-w-2xl leading-relaxed">
                {isEmbargo ? (
                  <span>
                    Une annonce économique majeure est en cours ou imminente (fenêtre de sécurité :{" "}
                    <strong className="text-rose-300">±30 minutes</strong>). Le bot bloque
                    l&apos;ouverture de nouveaux trades pour éviter les slippages et spreads violents.
                  </span>
                ) : summary?.nextEvent ? (
                  <span>
                    Aucun événement à fort impact ne bloque le trading actuellement. Prochaine
                    annonce haute volatilité :{" "}
                    <strong className="text-zinc-200">
                      [{summary.nextEvent.country}] {summary.nextEvent.title}
                    </strong>{" "}
                    ({formatTimeRemaining(summary.nextEvent.timeUntilMinutes)}).
                  </span>
                ) : (
                  <span>
                    Calendrier économique calme : aucune annonce rouge programmée dans les
                    prochaines heures.
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setLoading(true);
              loadData();
            }}
            disabled={loading}
            className="self-start sm:self-center inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-cyan-500 hover:text-cyan-300 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
            <span>Actualiser</span>
          </button>
        </div>

        {/* Mini stats cards */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 border-t border-zinc-800/60 pt-3 font-mono text-xs">
          <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
            <span className="text-[10px] uppercase text-zinc-500">Statut du Filtre</span>
            <div className="mt-0.5 font-bold text-zinc-200">
              {isEmbargo ? (
                <span className="text-rose-400">🚨 BLOQUÉ</span>
              ) : (
                <span className="text-emerald-400">🟢 LIBRE</span>
              )}
            </div>
          </div>
          <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
            <span className="text-[10px] uppercase text-zinc-500">Annonces High Impact</span>
            <div className="mt-0.5 font-bold text-zinc-200">
              {summary?.totalHighImpactLoaded ?? events.length} chargées
            </div>
          </div>
          <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
            <span className="text-[10px] uppercase text-zinc-500">Fenêtre Embargo</span>
            <div className="mt-0.5 font-bold text-cyan-400">
              -30 min / +30 min
            </div>
          </div>
          <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
            <span className="text-[10px] uppercase text-zinc-500">Prochaine News</span>
            <div className="mt-0.5 font-bold truncate text-zinc-200" title={summary?.nextEvent?.title}>
              {summary?.nextEvent ? (
                <span>
                  {summary.nextEvent.country} · {formatTimeRemaining(summary.nextEvent.timeUntilMinutes)}
                </span>
              ) : (
                "Aucune"
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── LISTE COMPLÈTE DU CALENDRIER DE LA SEMAINE ── */}
      <div className="card p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/70 pb-3">
          <div className="flex items-center gap-2.5">
            <Calendar className="h-5 w-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">
                Calendrier ForexFactory High Impact
              </h3>
              <p className="text-[11px] text-zinc-500">
                Annonces macro-économiques majeures surveillées par le bot
              </p>
            </div>
          </div>

          {/* Onglets de filtrage */}
          <div className="flex items-center gap-1 rounded-xl bg-zinc-900/90 p-1 border border-zinc-800 text-xs">
            <button
              onClick={() => setFilterTab("all")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                filterTab === "all"
                  ? "bg-zinc-800 text-cyan-300 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Toutes ({events.length})
            </button>
            <button
              onClick={() => setFilterTab("upcoming")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                filterTab === "upcoming"
                  ? "bg-zinc-800 text-cyan-300 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              À venir ({events.filter((e) => e.status === "UPCOMING").length})
            </button>
            <button
              onClick={() => setFilterTab("active")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                filterTab === "active"
                  ? "bg-rose-500/20 text-rose-300 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              En embargo ({events.filter((e) => e.isInEmbargo).length})
            </button>
            <button
              onClick={() => setFilterTab("passed")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                filterTab === "passed"
                  ? "bg-zinc-800 text-zinc-300 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Passées ({events.filter((e) => e.status === "PASSED").length})
            </button>
          </div>
        </div>

        {/* Événements */}
        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
          {filteredEvents.length === 0 ? (
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-8 text-center">
              <Globe className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
              <p className="text-xs text-zinc-400 font-semibold">
                Aucune annonce ne correspond à ce filtre.
              </p>
            </div>
          ) : (
            filteredEvents.map((e) => {
              const isEventEmbargo = e.isInEmbargo;
              return (
                <div
                  key={e.id}
                  className={`rounded-xl border p-3.5 transition-all ${
                    isEventEmbargo
                      ? "border-rose-500/60 bg-rose-950/25 shadow-md shadow-rose-950/40"
                      : e.status === "UPCOMING"
                        ? "border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700"
                        : "border-zinc-900/90 bg-zinc-950/40 opacity-75"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Badge Devise */}
                      <span
                        className={`mt-0.5 inline-flex items-center justify-center h-8 w-11 shrink-0 rounded-lg font-mono text-xs font-bold border ${getCurrencyBadge(
                          e.country
                        )}`}
                      >
                        {e.country}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold text-zinc-100 truncate">
                            {e.title}
                          </p>
                          <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 font-mono text-[9px] font-bold text-rose-400">
                            <Flame className="h-2.5 w-2.5" /> HIGH IMPACT
                          </span>
                        </div>

                        {/* Date & Paires impactées */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono text-[11px] text-zinc-400">
                          <span className="inline-flex items-center gap-1 text-zinc-400">
                            <Clock className="h-3 w-3 text-zinc-500" />
                            {formatEventDate(e.date || e.timestampUtc)}
                          </span>
                          <span className="text-zinc-600">·</span>
                          <span className="text-zinc-400">
                            Paires surveillées :{" "}
                            <span className="text-cyan-400 font-semibold">
                              {e.affectedSymbols.join(", ")}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Statut & Action */}
                    <div className="flex items-center sm:self-center gap-2 shrink-0">
                      {isEventEmbargo ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 py-1 font-mono text-xs font-bold text-rose-300 animate-pulse">
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                          EMBARGO ACTIF
                        </span>
                      ) : e.status === "UPCOMING" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-800/60 bg-cyan-950/30 px-2.5 py-1 font-mono text-xs text-cyan-300">
                          <Clock className="h-3.5 w-3.5 text-cyan-400" />
                          {formatTimeRemaining(e.timeUntilMinutes)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 font-mono text-[11px] text-zinc-500">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500/70" /> Passée
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function getCurrencyBadge(curr: string) {
  switch (curr) {
    case "USD":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "EUR":
      return "border-blue-500/40 bg-blue-500/10 text-blue-300";
    case "GBP":
      return "border-purple-500/40 bg-purple-500/10 text-purple-300";
    case "JPY":
      return "border-rose-500/40 bg-rose-500/10 text-rose-300";
    case "AUD":
    case "CAD":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    default:
      return "border-zinc-700 bg-zinc-800 text-zinc-300";
  }
}

function formatTimeRemaining(minutes: number) {
  if (minutes <= 0) return "En cours / Passée";
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  if (h === 0) return `Dans ${m}m`;
  return `Dans ${h}h ${m}m`;
}

function formatEventDate(rawDate: string) {
  if (!rawDate) return "";
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return rawDate;
    return d.toLocaleString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return rawDate;
  }
}