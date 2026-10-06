"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BrainCircuit,
  Gauge,
  Loader2,
  Play,
  RefreshCcw,
  Sparkles,
  Target,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchMlLatency,
  fetchMlStatus,
  fetchPredict,
  retrainMlModel,
} from "@/lib/api";
import type { MlLatencyPoint, MlStatus, PredictResponse } from "@/types/trading";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "GOLD", "BTCUSD"];

const ARCHITECTURES = [
  { id: "XGBoost + LSTM Ensemble", desc: "Hybride recommandé: Tabulaire XGBoost + Séries Temporelles LSTM" },
  { id: "LightGBM + PPO", desc: "Reinforcement Learning PPO sur features LightGBM" },
  { id: "Transformer-TimeNet", desc: "Attention temporelle type TimeNet" },
];

/** Vue ML Engine — statut du modèle, latence, prédictions, feature importance. */
export default function MlEngineView() {
  const [status, setStatus] = useState<MlStatus | null>(null);
  const [latency, setLatency] = useState<MlLatencyPoint | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<MlLatencyPoint[]>([]);
  const [prediction, setPrediction] = useState<PredictResponse | null>(null);
  const [symbol, setSymbol] = useState("EURUSD");
  const [architecture, setArchitecture] = useState(ARCHITECTURES[0].id);
  const [retraining, setRetraining] = useState(false);
  const [retrainMsg, setRetrainMsg] = useState<string | null>(null);
  const [predicting, setPredicting] = useState(false);

  const loadLatency = useCallback(async () => {
    const l = await fetchMlLatency();
    if (l) {
      setLatency(l);
      setLatencyHistory((prev) => {
        const next = [...prev, l].slice(-60);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const s = await fetchMlStatus();
      if (!cancelled && s) setStatus(s);
    };

    load();
    loadLatency();
    const id = setInterval(loadLatency, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [loadLatency]);

  const runPredict = async (sym = symbol) => {
    setPredicting(true);
    const p = await fetchPredict(sym);
    if (p) setPrediction({ ...p, confidence: Math.min(1, p.confidence) });
    setPredicting(false);
  };

  useEffect(() => {
    runPredict();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const handleRetrain = async () => {
    setRetraining(true);
    setRetrainMsg(null);
    const res = await retrainMlModel();
    setRetrainMsg(
      res && !res.error
        ? "Ré-entraînement lancé avec succès"
        : "Backend injoignable — ré-entraînement impossible (simulation)",
    );
    setRetraining(false);
    const s = await fetchMlStatus();
    if (s) setStatus(s);
  };

  const accPct = ((status?.accuracy ?? 0) * 100).toFixed(1);
  const threshPct = ((status?.confidenceThreshold ?? 0.58) * 100).toFixed(0);
  const features = status?.featureImportances?.slice(0, 8) ?? mockFeatures();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Colonne gauche : statut modèle */}
      <div className="space-y-4 lg:col-span-1">
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2 border-b border-zinc-800/70 pb-3">
            <BrainCircuit className="h-4 w-4 text-violet-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
              État du Modèle ML
            </h3>
            <span
              className={`ml-auto rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                status?.trained ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {status?.trained ? "ENTRAÎNÉ" : "NON ENTRAÎNÉ"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Accuracy" value={`${accPct}%`} accent="text-emerald-400" />
            <Stat label="Échantillons" value={String(status?.sampleCount ?? 0)} />
            <Stat label="Dernier entraînement" value={status?.lastTrained || "—"} small />
            <Stat label="Seuil confiance" value={`${threshPct}%`} accent="text-cyan-400" />
          </div>

          <div className="mt-3">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">
              Architecture du modèle (simulation)
            </label>
            <select
              value={architecture}
              onChange={(e) => setArchitecture(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-violet-700 focus:outline-none"
            >
              {ARCHITECTURES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-zinc-500">
              {ARCHITECTURES.find((a) => a.id === architecture)?.desc}
            </p>
          </div>

          <button
            onClick={handleRetrain}
            disabled={retraining}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-800 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-50"
          >
            {retraining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            {retraining ? "Ré-entraînement…" : "Ré-entraîner le modèle"}
          </button>
          {retrainMsg && <p className="mt-2 text-center font-mono text-[10px] text-zinc-400">{retrainMsg}</p>}
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
              Prédiction Live
            </h3>
          </div>
          <div className="mb-3 flex gap-2">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              onClick={() => runPredict(symbol)}
              disabled={predicting}
              className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {predicting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          </div>

          {prediction && (
            <PredictionCard prediction={prediction} />
          )}
        </div>
      </div>

      {/* Colonne droite : latence + features */}
      <div className="space-y-4 lg:col-span-2">
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2 border-b border-zinc-800/70 pb-3">
            <Gauge className="h-4 w-4 text-indigo-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
              Latence d'Inférence ML
            </h3>
            <span className="ml-auto font-mono text-lg font-bold text-indigo-300">
              {latency ? `${latency.latencyMs.toFixed(1)} ms` : "—"}
            </span>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyHistory} margin={{ top: 5, right: 0, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="mlLat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" vertical={false} />
                <XAxis dataKey="time" stroke="#52525b" fontSize={9} tickLine={false} minTickGap={28} />
                <YAxis stroke="#818cf8" fontSize={9} tickLine={false} domain={["dataMin - 2", "dataMax + 4"]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#101012", borderColor: "#27272a", fontSize: "12px" }}
                />
                <Area type="monotone" dataKey="latencyMs" name="Latence (ms)" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#mlLat)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {latency && (
            <div className="mt-2 flex gap-3 font-mono text-[10px] text-zinc-500">
              <span>Prep {latency.preprocessMs}ms</span>
              <span>ONNX {latency.onnxInferenceMs}ms</span>
              <span>Post {latency.postprocessMs}ms</span>
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
              Feature Importances
            </h3>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={features} layout="vertical" margin={{ top: 0, right: 12, left: 30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" horizontal={false} />
                <XAxis type="number" stroke="#52525b" fontSize={9} tickLine={false} unit="%" />
                <YAxis type="category" dataKey="feature" stroke="#71717a" fontSize={9} tickLine={false} width={90} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#101012", borderColor: "#27272a", fontSize: "11px" }}
                  formatter={(v) => [`${Math.round(Number(v) * 1000) / 10}%`, "Importance"]}
                />
                <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                  {features.map((_, i) => (
                    <Cell key={i} fill={i < 3 ? "#fbbf24" : "#8b5cf6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = "text-zinc-100",
  small = false,
}: {
  label: string;
  value: string;
  accent?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 p-2.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`font-mono font-bold ${small ? "text-sm" : "text-lg"} ${accent}`}>{value}</p>
    </div>
  );
}

function PredictionCard({ prediction }: { prediction: PredictResponse }) {
  const dir = prediction.signal;
  const conf = Math.round((prediction.confidence ?? 0) * 100);

  const color =
    dir === "BUY"
      ? "border-emerald-800 bg-emerald-500/10 text-emerald-300"
      : dir === "SELL"
        ? "border-rose-800 bg-rose-500/10 text-rose-300"
        : "border-zinc-700 bg-zinc-800/40 text-zinc-400";

  const icon =
    dir === "BUY" ? <span className="text-2xl font-black">▲</span> :
    dir === "SELL" ? <span className="text-2xl font-black">▼</span> :
    <span className="text-2xl font-black">◆</span>;

  return (
    <div className={`rounded-xl border p-3 ${color} flex items-center justify-between`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="font-mono text-lg font-black">{dir === "WAIT" ? "EN ATTENTE" : dir}</p>
          <p className="font-mono text-[10px] opacity-80">{prediction.reason ?? ""}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-2xl font-black">
          {conf}
          <span className="text-sm">%</span>
        </p>
        <p className="font-mono text-[9px] uppercase opacity-70">Confiance</p>
      </div>
    </div>
  );
}

function mockFeatures() {
  return [
    { feature: "RSI-14", importance: 0.22 },
    { feature: "ATR(14)", importance: 0.18 },
    { feature: "EMA-Cross", importance: 0.15 },
    { feature: "ObV", importance: 0.11 },
    { feature: "MACD", importance: 0.09 },
    { feature: "ADX", importance: 0.08 },
    { feature: "CCI", importance: 0.06 },
    { feature: "Volume", importance: 0.04 },
  ];
}