"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Layers,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  Zap,
} from "lucide-react";
import type { EquityPoint, ExecutionMetrics, WsSnapshot } from "@/types/trading";
import { resetExecutionMetrics } from "@/lib/api";

interface RiskMetricsPanelProps {
  snapshot: WsSnapshot;
  equityCurve: EquityPoint[];
}

/** Métadonnées explicatives pour chaque règle de rejet RTS 6 / PreTrade */
const REJECTION_DESCRIPTIONS: Record<
  string,
  { label: string; description: string; severity: "warning" | "danger" | "info" }
> = {
  HIGH_SPREAD: {
    label: "Spread Marché Excessif",
    description: "Évite l'exécution lors de pics de spread anormaux, rollover nocturne ou manque de liquidité.",
    severity: "warning",
  },
  LOW_ML_CONFIDENCE: {
    label: "Confiance ML Insuffisante",
    description: "Le score de confiance prédictif de l'IA est sous le seuil minimal requis pour cet actif.",
    severity: "info",
  },
  RATE_LIMIT_BURST: {
    label: "Cooldown Anti-Rafale (5s)",
    description: "Espacement obligatoire de 5 secondes entre chaque ordre pour éviter le sur-trading impulsif.",
    severity: "warning",
  },
  RATE_LIMIT_MINUTE: {
    label: "Protection Knight Capital (Boucle)",
    description: "Plafond strict de 3 ordres/min. Coupe l'algorithme en cas de suspicion de boucle infinie.",
    severity: "danger",
  },
  CORRELATION_DOUBLE_EXPOSURE: {
    label: "Verrou Corrélation Devises",
    description: "Bloque la prise de position dans le même sens sur des paires fortement corrélées (ex: EURUSD & GBPUSD).",
    severity: "warning",
  },
  CRITICAL_MARGIN_LEVEL: {
    label: "Niveau de Marge Critique (<150%)",
    description: "Interdiction de nouveaux engagements si la marge libre du compte broker est insuffisante.",
    severity: "danger",
  },
  COOLDOWN_REVENGE_TRADING: {
    label: "Anti-Revenge Trading (1 heure)",
    description: "Pause de sécurité forcée de 60 minutes après 3 pertes consécutives détectées en base de données.",
    severity: "warning",
  },
  ACCOUNT_UNAVAILABLE: {
    label: "Compte Broker Inaccessible",
    description: "Les informations de marge et balance sont temporairement indisponibles via MT5.",
    severity: "danger",
  },
  PYRAMIDING_BLOCKED: {
    label: "Anti-Pyramiding",
    description: "Position déjà ouverte sur ce symbole. Le bot refuse d'empiler des positions sur un même actif.",
    severity: "info",
  },
  MAX_GLOBAL_EXPOSURE: {
    label: "Exposition Globale Plafonnée (Max 2)",
    description: "Plafond institutionnel de 2 trades simultanés atteint sur l'ensemble du portefeuille.",
    severity: "info",
  },
  SPREAD_EXCEEDS_SL: {
    label: "Spread Dévorant le Stop-Loss",
    description: "Le spread actuel dépasse 66% de la distance du Stop Loss (SL < Spread * 1.5). Ratio risque/bruit intenable.",
    severity: "warning",
  },
  VALIDATOR_TIMEOUT: {
    label: "Dépassement Délai Validation (10s)",
    description: "Le validateur de risque a mis plus de 10s à répondre. Ordre annulé par sécurité.",
    severity: "warning",
  },
};

/** Surveillance de risque institutionnelle temps réel et audit RTS 6 (MiFID II). */
export default function RiskMetricsPanel({ snapshot, equityCurve }: RiskMetricsPanelProps) {
  const { account, positions, executionMetrics } = snapshot;
  const [resetting, setResetting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const stats = useMemo(() => {
    // Drawdown depuis la courbe
    let peak = Number.NEGATIVE_INFINITY;
    let currentDd = 0;
    let maxDd = 0;
    for (const p of equityCurve) {
      if (p.equity > peak) peak = p.equity;
      const dd = peak > 0 ? ((peak - p.equity) / peak) * 100 : 0;
      if (dd > currentDd) currentDd = dd;
      if (dd > maxDd) maxDd = dd;
    }

    // Concentration par symbole
    const bySym = new Map<string, { lots: number; pnl: number }>();
    for (const p of positions) {
      const e = bySym.get(p.symbol) ?? { lots: 0, pnl: 0 };
      e.lots += p.lots;
      e.pnl += p.pnl;
      bySym.set(p.symbol, e);
    }
    const maxSym = Array.from(bySym.entries()).sort((a, b) => b[1].lots - a[1].lots)[0]?.[1];
    
    // Marge réellement utilisée = Capitaux propres - Marge libre
    const usedMargin = account && account.equity > 0 ? Math.max(0, account.equity - account.freeMargin) : 0;
    const exposurePct = account && account.equity > 0 ? (usedMargin / account.equity) * 100 : 0;
    const marginLevelPct = account?.marginLevel ?? (usedMargin > 0 ? (account.equity / usedMargin) * 100 : 0);

    return { currentDd, maxDd, maxSymLots: maxSym?.lots ?? 0, exposurePct, marginLevelPct };
  }, [equityCurve, account, positions]);

  const handleResetMetrics = async () => {
    if (resetting) return;
    setResetting(true);
    setFeedback(null);
    try {
      const res = await resetExecutionMetrics();
      if (res && res.status === "success") {
        setFeedback("Compteurs réinitialisés");
      } else {
        setFeedback("Erreur réinitialisation");
      }
    } catch {
      setFeedback("Erreur de connexion");
    } finally {
      setResetting(false);
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const ddColor = stats.maxDd > 25 ? "text-rose-400" : stats.maxDd > 15 ? "text-orange-400" : "text-emerald-400";
  const marginColor = stats.marginLevelPct < 150 ? "text-rose-400" : stats.marginLevelPct < 250 ? "text-amber-400" : "text-emerald-400";
  const exposureColor = stats.exposurePct > 80 ? "text-rose-400" : stats.exposurePct > 50 ? "text-amber-400" : "text-emerald-400";

  const cards = [
    {
      label: "Drawdown max",
      value: `${stats.maxDd.toFixed(2)}%`,
      sub: `Actuel ${stats.currentDd.toFixed(2)}%`,
      icon: <TrendingDown className="h-4 w-4 text-amber-400" />,
      accent: ddColor,
    },
    {
      label: "Marge utilisée",
      value: `${stats.exposurePct.toFixed(1)}%`,
      sub: `Niveau ${stats.marginLevelPct.toFixed(0)}%`,
      icon: <Activity className="h-4 w-4 text-cyan-400" />,
      accent: exposureColor,
    },
    {
      label: "Niveau de marge",
      value: `${stats.marginLevelPct.toFixed(0)}%`,
      sub: "Seuil d'appel 150%",
      icon: <ShieldAlert className="h-4 w-4 text-violet-400" />,
      accent: marginColor,
    },
    {
      label: "Concentration max",
      value: `${stats.maxSymLots.toFixed(2)} lots`,
      sub: `${positions.length} positions`,
      icon: <Layers className="h-4 w-4 text-rose-400" />,
      accent: "text-zinc-100",
    },
  ];

  // Métriques d'exécution extraites
  const exec: ExecutionMetrics = executionMetrics ?? {
    avg_routing_latency_ms: 0,
    last_routing_latency_ms: 0,
    fill_rate_pct: 100,
    avg_slippage_pips: 0,
    orders_attempted: 0,
    orders_executed: 0,
    pretrade_rejections: { total: 0, by_reason: {} },
  };

  const rejectionsByReason = exec.pretrade_rejections?.by_reason ?? {};
  const totalRejections = exec.pretrade_rejections?.total ?? 0;

  // Liste ordonnée de tous les motifs connus avec leur décompte réel
  const reasonsList = useMemo(() => {
    const keys = new Set([...Object.keys(REJECTION_DESCRIPTIONS), ...Object.keys(rejectionsByReason)]);
    return Array.from(keys)
      .map((code) => {
        const count = rejectionsByReason[code] ?? 0;
        const meta = REJECTION_DESCRIPTIONS[code] ?? {
          label: code.replace(/_/g, " "),
          description: "Règle de filtrage interne personnalisée.",
          severity: "warning" as const,
        };
        return { code, count, ...meta };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [rejectionsByReason]);

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Cartes de Risque Portefeuille */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-3.5">
            <div className="mb-1 flex items-center justify-between">
              {c.icon}
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                {c.label}
              </span>
            </div>
            <p className={`font-mono text-lg font-bold ${c.accent}`}>{c.value}</p>
            <p className="font-mono text-[10px] text-zinc-500">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* 2. Audit Pré-Trade & Métriques d'Exécution (RTS 6 / MiFID II) */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Audit d&apos;Exécution & Filtres Pré-Trade (MiFID II / RTS 6)
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Actif
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Surveillance continue du routage MT5, slippage moyen et motifs de rejet enregistrés par le <code className="text-zinc-300">PreTradeValidator</code>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {feedback && (
              <span className="font-mono text-[11px] text-emerald-400 animate-fade-in">
                {feedback}
              </span>
            )}
            <button
              onClick={handleResetMetrics}
              disabled={resetting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700 hover:text-white disabled:opacity-50"
              title="Réinitialiser les compteurs d'audit d'exécution"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
              Réinitialiser compteurs
            </button>
          </div>
        </div>

        {/* 4 KPIs d'Exécution */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Fill Rate */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Fill Rate (Exécution)</span>
              <Gauge className="h-3.5 w-3.5 text-cyan-400" />
            </div>
            <p className="mt-1.5 font-mono text-xl font-bold text-cyan-300">
              {exec.fill_rate_pct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-zinc-500">
              {exec.orders_executed} exécutés sur {exec.orders_attempted} tentés
            </p>
          </div>

          {/* Latence Routage */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Latence Routage</span>
              <Clock className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <p className="mt-1.5 font-mono text-xl font-bold text-amber-300">
              {exec.last_routing_latency_ms.toFixed(1)} <span className="text-xs text-zinc-500 font-normal">ms</span>
            </p>
            <p className="text-[10px] text-zinc-500">
              Moyenne historique: {exec.avg_routing_latency_ms.toFixed(1)} ms
            </p>
          </div>

          {/* Slippage */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Slippage Moyen</span>
              <Zap className="h-3.5 w-3.5 text-indigo-400" />
            </div>
            <p className="mt-1.5 font-mono text-xl font-bold text-indigo-300">
              {exec.avg_slippage_pips.toFixed(2)} <span className="text-xs text-zinc-500 font-normal">pips</span>
            </p>
            <p className="text-[10px] text-zinc-500">
              Écart moyen prix demandé / exécuté
            </p>
          </div>

          {/* Total Rejets Pré-Trade */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Rejets Pré-Trade</span>
              <Shield className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <p className={`mt-1.5 font-mono text-xl font-bold ${totalRejections > 0 ? "text-purple-300" : "text-emerald-400"}`}>
              {totalRejections}
            </p>
            <p className="text-[10px] text-zinc-500">
              Trades toxiques ou non conformes évités
            </p>
          </div>
        </div>

        {/* Détail par Motif de Rejet (PreTradeValidator) */}
        <div className="mt-5">
          <div className="mb-2.5 flex items-center justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Motifs de Rejet Enregistrés par le PreTradeValidator ({reasonsList.length} règles sous surveillance)
            </h4>
            <span className="text-[10px] text-zinc-500">
              {totalRejections === 0 ? "Aucun rejet — Flux 100% nominal" : `${totalRejections} rejets au total`}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {reasonsList.map((r) => {
              const hasTriggered = r.count > 0;
              return (
                <div
                  key={r.code}
                  className={`flex flex-col justify-between rounded-lg border p-3 transition ${
                    hasTriggered
                      ? r.severity === "danger"
                        ? "border-rose-500/40 bg-rose-500/5"
                        : r.severity === "warning"
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-purple-500/40 bg-purple-500/5"
                      : "border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {hasTriggered ? (
                        <AlertTriangle
                          className={`h-4 w-4 shrink-0 ${
                            r.severity === "danger"
                              ? "text-rose-400"
                              : r.severity === "warning"
                              ? "text-amber-400"
                              : "text-purple-400"
                          }`}
                        />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500/60" />
                      )}
                      <div>
                        <span className="text-xs font-medium text-zinc-200">
                          {r.label}
                        </span>
                        <code className="ml-2 font-mono text-[9px] text-zinc-500">
                          {r.code}
                        </code>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                        hasTriggered
                          ? r.severity === "danger"
                            ? "bg-rose-500/20 text-rose-300"
                            : r.severity === "warning"
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-purple-500/20 text-purple-300"
                          : "bg-zinc-800/60 text-zinc-400"
                      }`}
                    >
                      {r.count}
                    </span>
                  </div>

                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-zinc-400">
                    {r.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}