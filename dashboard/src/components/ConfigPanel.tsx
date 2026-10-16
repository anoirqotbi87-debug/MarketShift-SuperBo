"use client";

import { memo, useEffect, useState } from "react";
import {
  CheckCircle2,
  Layers,
  Loader2,
  Newspaper,
  Save,
  Settings2,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { fetchKelly, fetchSettings, updateSettings } from "@/lib/api";
import type { KellyApiResponse, RuntimeSettings } from "@/types/trading";

const NEWS_FILTER_KEY = "marketshift.news_filter";

const DEFAULT_SETTINGS: RuntimeSettings = {
  sl_multiplier: 1.5,
  tp_multiplier: 2.5,
  risk_percent: 0.01,
  trailing_stop_active: true,
  trailing_stop_multiplier: 1.0,
  ml_confidence_threshold: 0.58,
  trading_mode: "MTF_H1_M5",
  primary_timeframe: "M5",
  mtf_enabled: true,
  htf_timeframe: "H1",
};

interface ProfilePreset {
  id: string;
  name: string;
  badge: string;
  desc: string;
  icon: typeof Zap;
  color: string;
  recommended?: boolean;
  settings: Partial<RuntimeSettings>;
}

const PROFILES: ProfilePreset[] = [
  {
    id: "SCALPING_M5",
    name: "Scalping Agressif",
    badge: "M5 / M1",
    desc: "Fréquence élevée, micro-mouvements, TP rapide. Idéal pour traders actifs.",
    icon: Zap,
    color: "from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-300",
    settings: {
      trading_mode: "SCALPING_M5",
      primary_timeframe: "M5",
      mtf_enabled: false,
      htf_timeframe: "M15",
      sl_multiplier: 1.2,
      tp_multiplier: 1.8,
      risk_percent: 0.01,
      ml_confidence_threshold: 0.55,
    },
  },
  {
    id: "DAYTRADING_M15",
    name: "Day Trading SMC",
    badge: "M15 Intraday",
    desc: "Structures propres, bon filtrage du bruit, équilibré pour petits capitaux.",
    icon: TrendingUp,
    color: "from-blue-500/20 to-cyan-500/10 border-blue-500/30 text-blue-300",
    settings: {
      trading_mode: "DAYTRADING_M15",
      primary_timeframe: "M15",
      mtf_enabled: false,
      htf_timeframe: "H1",
      sl_multiplier: 1.8,
      tp_multiplier: 2.5,
      risk_percent: 0.01,
      ml_confidence_threshold: 0.58,
    },
  },
  {
    id: "MTF_H1_M5",
    name: "Institutional MTF",
    badge: "H1 Biais + M5 Entrée",
    desc: "Le standard institutionnel : Biais macro H1 + Entrée chirurgicale M5 (R/R > 1:3).",
    icon: Layers,
    color: "from-emerald-500/25 to-teal-500/10 border-emerald-500/40 text-emerald-300",
    recommended: true,
    settings: {
      trading_mode: "MTF_H1_M5",
      primary_timeframe: "M5",
      mtf_enabled: true,
      htf_timeframe: "H1",
      sl_multiplier: 1.5,
      tp_multiplier: 3.5,
      risk_percent: 0.01,
      ml_confidence_threshold: 0.60,
    },
  },
  {
    id: "SWING_H1",
    name: "Swing Trading Macro",
    badge: "H4 / H1 Swing",
    desc: "Suivi des grands flux macro sur plusieurs jours, Drawdown minimal.",
    icon: Sparkles,
    color: "from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-300",
    settings: {
      trading_mode: "SWING_H1",
      primary_timeframe: "H1",
      mtf_enabled: true,
      htf_timeframe: "H4",
      sl_multiplier: 2.5,
      tp_multiplier: 5.0,
      risk_percent: 0.01,
      ml_confidence_threshold: 0.62,
    },
  },
];

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}

const Slider = memo(function Slider({ label, value, min, max, step, suffix = "", onChange }: SliderProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-zinc-400">{label}</span>
        <span className="font-mono text-[11px] font-semibold text-cyan-300">
          {suffix === "¥"
            ? value.toFixed(1)
            : suffix === "%"
              ? `${Math.round(value * 100)}%`
              : suffix === "$"
                ? `$${value}`
                : value.toFixed(1)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan-500"
      />
    </div>
  );
});

export default function ConfigPanel() {
  const [settings, setSettings] = useState<RuntimeSettings>(DEFAULT_SETTINGS);
  const [kelly, setKelly] = useState<KellyApiResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [smcWeight, setSmcWeight] = useState(0.5);
  const [amdWeight, setAmdWeight] = useState(0.5);
  const [newsFilterEnabled, setNewsFilterEnabled] = useState(true);
  const [minNewsScore, setMinNewsScore] = useState(-0.6);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSettings(), fetchKelly()]).then(([s, k]) => {
      if (cancelled) return;
      if (s) {
        setSettings((prev) => ({
          ...prev,
          ...s,
          trading_mode: s.trading_mode || prev.trading_mode || "MTF_H1_M5",
          primary_timeframe: s.primary_timeframe || prev.primary_timeframe || "M5",
          mtf_enabled: s.mtf_enabled !== undefined ? s.mtf_enabled : true,
          htf_timeframe: s.htf_timeframe || prev.htf_timeframe || "H1",
        }));
      }
      if (k) setKelly(k);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Préférences news filtrées persistées localement
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NEWS_FILTER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setNewsFilterEnabled(parsed.enabled !== false);
        setMinNewsScore(typeof parsed.minScore === "number" ? parsed.minScore : -0.6);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        NEWS_FILTER_KEY,
        JSON.stringify({ enabled: newsFilterEnabled, minScore: minNewsScore }),
      );
    } catch {
      // ignore
    }
  }, [newsFilterEnabled, minNewsScore]);

  const applyProfile = (p: ProfilePreset) => {
    setSettings((prev) => ({
      ...prev,
      ...p.settings,
    }));
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const res = await updateSettings({
      sl_multiplier: settings.sl_multiplier,
      tp_multiplier: settings.tp_multiplier,
      risk_percent: settings.risk_percent,
      trailing_stop_active: settings.trailing_stop_active,
      trailing_stop_multiplier: settings.trailing_stop_multiplier,
      ml_confidence_threshold: settings.ml_confidence_threshold,
      trading_mode: settings.trading_mode,
      primary_timeframe: settings.primary_timeframe,
      mtf_enabled: settings.mtf_enabled,
      htf_timeframe: settings.htf_timeframe,
    });
    setSaving(false);
    if (res) {
      setSettings((prev) => ({
        ...prev,
        ...res,
      }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    }
  };

  const currentMode = settings.trading_mode || "MTF_H1_M5";

  return (
    <div className="space-y-4">
      {/* ── 1. SÉLECTEUR DE PROFILS DE TRADING (4 MODES) ── */}
      <section className="card p-5">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800/80 pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-400" /> Profils & Modes de Trading
            </h2>
            <p className="text-[11px] text-zinc-400">
              Basculez instantanément entre Scalping, Day Trading et Confluence Multi-Timeframe (MTF)
            </p>
          </div>
          <span className="font-mono text-xs text-cyan-400 font-semibold bg-cyan-950/60 border border-cyan-800/40 px-2.5 py-1 rounded-md self-start sm:self-auto">
            Mode Actif : {currentMode}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {PROFILES.map((p) => {
            const Icon = p.icon;
            const isSelected = currentMode === p.id;
            return (
              <button
                key={p.id}
                onClick={() => applyProfile(p)}
                type="button"
                className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? "border-cyan-500 bg-zinc-900/90 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/50"
                    : "border-zinc-800/70 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60"
                }`}
              >
                {p.recommended && (
                  <span className="absolute -top-2.5 right-3 rounded-full bg-emerald-500/20 border border-emerald-500/50 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                    ⭐ RECOMMANDÉ
                  </span>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`inline-flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br border ${p.color}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded">
                      {p.badge}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-zinc-100">{p.name}</h3>
                  <p className="mt-1 text-[11px] text-zinc-400 leading-snug">{p.desc}</p>
                </div>

                <div className="mt-4 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-zinc-500">
                    SL: {p.settings.sl_multiplier}x · TP: {p.settings.tp_multiplier}x
                  </span>
                  {isSelected && (
                    <span className="text-cyan-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="h-3 w-3" /> Sélectionné
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 2. RÉGLAGES FINS MULTI-TIMEFRAME & TIME-FRAMES ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Panneau MTF & Granularité */}
        <section className="card p-5">
          <h2 className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-300">
            <Layers className="h-4 w-4 text-emerald-400" /> Confluence Multi-Timeframe (MTF)
          </h2>

          <div className="space-y-4">
            {/* Toggle MTF */}
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-200">
              <div>
                <span className="font-semibold text-zinc-100">Filtre Confluence MTF</span>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Exige l&apos;alignement du Biais Institutionnel HTF avant toute prise de position
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.mtf_enabled ?? true}
                onChange={(e) => setSettings({ ...settings, mtf_enabled: e.target.checked })}
                className="h-5 w-5 accent-emerald-500 cursor-pointer"
              />
            </label>

            {/* Timeframe d'Entrée (LTF) */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
                Timeframe d&apos;Entrée & Exécution (LTF)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(["M1", "M5", "M15", "H1"] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setSettings({ ...settings, primary_timeframe: tf })}
                    className={`rounded-lg py-2 font-mono text-xs font-bold transition border ${
                      (settings.primary_timeframe || "M5") === tf
                        ? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
                        : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeframe Supérieur de Biais (HTF) */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
                Timeframe de Biais Institutionnel (HTF)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(["M15", "H1", "H4", "D1"] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    disabled={!settings.mtf_enabled}
                    onClick={() => setSettings({ ...settings, htf_timeframe: tf })}
                    className={`rounded-lg py-2 font-mono text-xs font-bold transition border ${
                      !settings.mtf_enabled
                        ? "opacity-30 border-zinc-800 text-zinc-600 cursor-not-allowed"
                        : (settings.htf_timeframe || "H1") === tf
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                          : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 mt-2 font-mono">
                Configuration active :{" "}
                <span className="text-cyan-400 font-semibold">{settings.primary_timeframe || "M5"}</span>{" "}
                {settings.mtf_enabled ? (
                  <>
                    + Biais HTF sur{" "}
                    <span className="text-emerald-400 font-semibold">
                      {settings.htf_timeframe || "H1"}
                    </span>
                  </>
                ) : (
                  "(Mono-timeframe)"
                )}
              </p>
            </div>
          </div>
        </section>

        {/* Panneau Gestion du Risque (Kelly) */}
        <section className="card p-5">
          <h2 className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-300">
            <Settings2 className="h-4 w-4 text-cyan-400" /> Position Sizer & Risque
          </h2>

          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-zinc-925 px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Kelly</p>
              <p className="mt-1 font-mono text-lg font-semibold text-emerald-400">
                {kelly ? `${(kelly.kellyPct ?? 0).toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-925 px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Win Rate</p>
              <p className="mt-1 font-mono text-lg font-semibold text-cyan-300">
                {kelly ? `${(kelly.winRate * 100).toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-925 px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Trades</p>
              <p className="mt-1 font-mono text-lg font-semibold text-zinc-200">
                {kelly?.tradeCount ?? "—"}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Slider
              label="Risque par trade (risk_percent)"
              value={settings.risk_percent}
              min={0.005}
              max={0.05}
              step={0.005}
              suffix="%"
              onChange={(v) => setSettings({ ...settings, risk_percent: v })}
            />
            <Slider
              label="Seuil de confiance ML"
              value={settings.ml_confidence_threshold}
              min={0.4}
              max={0.8}
              step={0.02}
              suffix="%"
              onChange={(v) => setSettings({ ...settings, ml_confidence_threshold: v })}
            />
            <Slider
              label="Multiplicateur SL (ATR)"
              value={settings.sl_multiplier}
              min={1.0}
              max={4.0}
              step={0.1}
              onChange={(v) => setSettings({ ...settings, sl_multiplier: v })}
            />
            <Slider
              label="Multiplicateur TP (ATR)"
              value={settings.tp_multiplier}
              min={1.0}
              max={5.0}
              step={0.1}
              onChange={(v) => setSettings({ ...settings, tp_multiplier: v })}
            />
          </div>
        </section>
      </div>

      {/* ── 3. AGGREGATOR & TRAILING STOP ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-300">
            <Settings2 className="h-4 w-4 text-violet-400" /> Aggregator & Trailing Stop
          </h2>

          <div className="space-y-4">
            <Slider
              label="Poids SMC dans l'Aggregator"
              value={smcWeight}
              min={0}
              max={1}
              step={0.1}
              suffix="¥"
              onChange={(v) => {
                setSmcWeight(v);
                setAmdWeight(round1(Math.max(0, 1 - v)));
              }}
            />
            <Slider
              label="Poids AMD dans l'Aggregator"
              value={amdWeight}
              min={0}
              max={1}
              step={0.1}
              suffix="¥"
              onChange={(v) => {
                setAmdWeight(v);
                setSmcWeight(round1(Math.max(0, 1 - v)));
              }}
            />
            <Slider
              label="Multiplicateur Trailing Stop"
              value={settings.trailing_stop_multiplier}
              min={1.0}
              max={5.0}
              step={0.1}
              onChange={(v) => setSettings({ ...settings, trailing_stop_multiplier: v })}
            />
          </div>

          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={settings.trailing_stop_active}
              onChange={(e) => setSettings({ ...settings, trailing_stop_active: e.target.checked })}
              className="h-4 w-4 accent-cyan-500"
            />
            Trailing Stop actif (SL élastique)
          </label>
        </section>

        {/* Filtre actualités / sentiment */}
        <section className="card p-5">
          <h3 className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-300">
            <Newspaper className="h-4 w-4 text-cyan-400" /> Filtre Actualités / Sentiment
          </h3>
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-300">
              <span>Activer le filtre de sentiment</span>
              <input
                type="checkbox"
                checked={newsFilterEnabled}
                onChange={(e) => setNewsFilterEnabled(e.target.checked)}
                className="h-4 w-4 accent-cyan-500"
              />
            </label>
            <Slider
              label="Score minimal news"
              value={minNewsScore}
              min={-1}
              max={0}
              step={0.05}
              onChange={(v) => setMinNewsScore(v)}
            />
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">
            Les signaux ML dont le score de sentiment news est inférieur à ce seuil sont rejetés par
            le PreTradeValidator pour éviter les annonces à haute volatilité.
          </p>
        </section>
      </div>

      {/* ── 4. BARRE DE SAUVEGARDE & PERSISTANCE .ENV ── */}
      <section className="card flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-gradient-to-r from-zinc-900 via-zinc-900/80 to-zinc-950 border-cyan-800/40">
        <div>
          <p className="text-xs font-semibold text-zinc-200">
            {saved ? (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Paramètres sauvegardés & inscrits dans le
                fichier .env du serveur !
              </span>
            ) : (
              "Sauvegarder la configuration vers le moteur de trading"
            )}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Les modifications prennent effet immédiatement en mémoire et sont persistées de manière
            atomique.
          </p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-cyan-500 disabled:opacity-60 shadow-lg shadow-cyan-950/40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Enregistrement..." : "Enregistrer dans le Bot (.env)"}
        </button>
      </section>
    </div>
  );
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}