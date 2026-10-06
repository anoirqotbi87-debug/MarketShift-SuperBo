"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Settings2 } from "lucide-react";
import { fetchKelly, fetchSettings, updateSettings } from "@/lib/api";
import type { KellyApiResponse, RuntimeSettings } from "@/types/trading";

const DEFAULT_SETTINGS: RuntimeSettings = {
  sl_multiplier: 2.0,
  tp_multiplier: 2.0,
  risk_percent: 0.01,
  trailing_stop_active: false,
  trailing_stop_multiplier: 2.0,
  ml_confidence_threshold: 0.58,
};

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, suffix = "", onChange }: SliderProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-zinc-400">{label}</span>
        <span className="font-mono text-[11px] font-semibold text-cyan-300">
          {suffix === "¥" ? value.toFixed(1) : suffix === "%" ? `${Math.round(value * 100)}%` : suffix === "$" ? `$${value}` : value}
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
}

export default function ConfigPanel() {
  const [settings, setSettings] = useState<RuntimeSettings>(DEFAULT_SETTINGS);
  const [kelly, setKelly] = useState<KellyApiResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [smcWeight, setSmcWeight] = useState(0.5);
  const [amdWeight, setAmdWeight] = useState(0.5);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSettings(), fetchKelly()]).then(([s, k]) => {
      if (cancelled) return;
      if (s) setSettings(s);
      if (k) setKelly(k);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    });
    setSaving(false);
    if (res) {
      setSettings(res);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {/* Position Sizer (Kelly) & risque */}
      <section className="card p-5">
        <h2 className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          <Settings2 className="h-4 w-4 text-cyan-400" /> Position Sizer & risque
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
            max={4.0}
            step={0.1}
            onChange={(v) => setSettings({ ...settings, tp_multiplier: v })}
          />
        </div>
      </section>

      {/* Aggregator & trailing */}
      <section className="card p-5">
        <h2 className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
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

        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-925 p-3 font-mono text-[11px] leading-relaxed text-zinc-500">
          <p className="text-zinc-400">W0 = {smcWeight.toFixed(1)} · W1 = {amdWeight.toFixed(1)}</p>
          <p className="mt-1">Signal = SMC×{smcWeight.toFixed(1)} + AMD×{amdWeight.toFixed(1)}</p>
        </div>
      </section>

      {/* Barre de sauvegarde */}
      <section className="card flex items-center justify-between gap-3 p-4 xl:col-span-2">
        <p className="text-[11px] text-zinc-500">
          {saved
            ? "✅ Paramètres sauvegardés et propagés au moteur."
            : "Les changements sont appliqués au runtime via POST /settings."}
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Sauvegarder
        </button>
      </section>
    </div>
  );
}

/** Arrondi à 1 décimale (évite 0.30000000000000004). */
function round1(v: number) {
  return Math.round(v * 10) / 10;
}