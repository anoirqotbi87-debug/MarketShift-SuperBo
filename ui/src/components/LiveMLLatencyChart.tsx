import React, { useState, useEffect, useMemo } from 'react';
import { MLModelStats } from '../types';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid 
} from 'recharts';
import { 
  Zap, Cpu, Activity, Clock, ShieldCheck, Gauge, RefreshCw, Sparkles, CheckCircle2, AlertTriangle, Layers
} from 'lucide-react';

interface LiveMLLatencyChartProps {
  mlStats: MLModelStats;
}

interface LatencyDataPoint {
  time: string;
  latencyMs: number;
  preprocessMs: number;
  onnxInferenceMs: number;
  postprocessMs: number;
  batchSize: number;
}

export const LiveMLLatencyChart: React.FC<LiveMLLatencyChartProps> = ({ mlStats }) => {
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'30s' | '1m' | '5m'>('1m');

  // Generate initial historical latency points
  const [history, setHistory] = useState<LatencyDataPoint[]>(() => {
    const points: LatencyDataPoint[] = [];
    const now = Date.now();
    const baseLatency = mlStats.inferenceTimeMs || 12.4;

    for (let i = 25; i >= 0; i--) {
      const timeStr = new Date(now - i * 2000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const jitter = (Math.random() - 0.5) * 3.5;
      const total = Math.max(4.0, Math.round((baseLatency + jitter) * 10) / 10);
      const prep = Math.round((total * 0.25) * 10) / 10;
      const onnx = Math.round((total * 0.60) * 10) / 10;
      const post = Math.round((total - prep - onnx) * 10) / 10;

      points.push({
        time: timeStr,
        latencyMs: total,
        preprocessMs: prep,
        onnxInferenceMs: onnx,
        postprocessMs: post,
        batchSize: 1
      });
    }
    return points;
  });

  // Real-time ticking simulation
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const baseLatency = mlStats.inferenceTimeMs || 12.4;
      
      // Introduce subtle random spikes or variations
      const isSpike = Math.random() < 0.08;
      const jitter = isSpike ? (Math.random() * 8.0 + 4.0) : ((Math.random() - 0.5) * 2.8);
      const total = Math.max(4.2, Math.round((baseLatency + jitter) * 10) / 10);
      const prep = Math.round((total * 0.22) * 10) / 10;
      const onnx = Math.round((total * 0.63) * 10) / 10;
      const post = Math.round((total - prep - onnx) * 10) / 10;

      const newPoint: LatencyDataPoint = {
        time: now,
        latencyMs: total,
        preprocessMs: prep,
        onnxInferenceMs: onnx,
        postprocessMs: post,
        batchSize: 1
      };

      setHistory(prev => {
        const updated = [...prev.slice(1), newPoint];
        return updated;
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [isStreaming, mlStats.inferenceTimeMs]);

  // Derived latency statistics
  const currentLatency = history[history.length - 1]?.latencyMs || mlStats.inferenceTimeMs;

  const { avgLatency, p95Latency, maxLatency, minLatency } = useMemo(() => {
    if (history.length === 0) {
      return { avgLatency: 12.0, p95Latency: 15.0, maxLatency: 18.0, minLatency: 8.0 };
    }
    const vals = history.map(h => h.latencyMs).sort((a, b) => a - b);
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = Math.round((sum / vals.length) * 10) / 10;
    const p95Idx = Math.floor(vals.length * 0.95);
    const p95 = vals[p95Idx] || vals[vals.length - 1];

    return {
      avgLatency: avg,
      p95Latency: p95,
      maxLatency: vals[vals.length - 1],
      minLatency: vals[0]
    };
  }, [history]);

  // Performance SLA Rating
  const slaRating = currentLatency <= 15 ? 'ULTRA_FAST' : currentLatency <= 30 ? 'OPTIMAL' : 'DEGRADED';

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 font-sans text-slate-100 shadow-xl border border-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-700/60 text-cyan-400 status-glow">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Performance Moteur ML - Latence Temps Réel</span>
              <span className="px-2 py-0.2 bg-cyan-950 text-cyan-300 border border-cyan-700 text-[9px] rounded-full font-mono">
                ONNX WebAssembly Direct
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Monitoring en millisecondes (ms) de l'inférence locale XGBoost + LSTM sur l'appareil
            </p>
          </div>
        </div>

        {/* Streaming Ticker Switch & Controls */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-[10px] font-bold transition-all ${
              isStreaming
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
            <span>{isStreaming ? 'STREAMING TEMPS RÉEL' : 'PAUSE TICKER'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Board */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
        
        {/* KPI 1: Live Latency */}
        <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Latence Actuelle</span>
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-black tracking-tight ${
              currentLatency <= 15 ? 'text-cyan-300' : currentLatency <= 30 ? 'text-amber-300' : 'text-rose-400'
            }`}>
              {currentLatency}
            </span>
            <span className="text-xs text-slate-400">ms</span>
          </div>
          <div className="text-[9px] text-slate-500 truncate">
            Exécution en boucle fermée
          </div>
        </div>

        {/* KPI 2: Average Latency */}
        <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Moyenne (SMA 25)</span>
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-indigo-300 tracking-tight">
              {avgLatency}
            </span>
            <span className="text-xs text-slate-400">ms</span>
          </div>
          <div className="text-[9px] text-slate-500 truncate">
            Min: {minLatency}ms | Max: {maxLatency}ms
          </div>
        </div>

        {/* KPI 3: P95 Percentile */}
        <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Latence P95</span>
            <Activity className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-300 tracking-tight">
              {p95Latency}
            </span>
            <span className="text-xs text-slate-400">ms</span>
          </div>
          <div className="text-[9px] text-slate-500 truncate">
            95% des inférences &lt; {p95Latency}ms
          </div>
        </div>

        {/* KPI 4: Runtime SLA Status */}
        <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Statut SLA Inférence</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
              slaRating === 'ULTRA_FAST'
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                : slaRating === 'OPTIMAL'
                ? 'bg-teal-950/90 text-teal-300 border-teal-700'
                : 'bg-rose-950/90 text-rose-300 border-rose-700'
            }`}>
              {slaRating === 'ULTRA_FAST' && '⚡ ULTRA-RAPIDE (<15ms)'}
              {slaRating === 'OPTIMAL' && '✅ OPTIMAL (<30ms)'}
              {slaRating === 'DEGRADED' && '⚠️ LATENCE ÉLEVÉE'}
            </span>
          </div>
          <div className="text-[9px] text-slate-500 truncate">
            Architecture: {mlStats.architecture}
          </div>
        </div>

      </div>

      {/* Main Recharts Area Chart */}
      <div className="bg-slate-950/80 rounded-xl border border-slate-800/80 p-3 pt-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-mono px-1">
          <span className="text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Décomposition Temps d'Inférence (Preprocess, ONNX Runtime, Postprocess)</span>
          </span>
          <span className="text-[10px] text-cyan-300">
            Échantillons: {history.length} ticks
          </span>
        </div>

        <div className="w-full h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="onnxGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={9} tickLine={false} unit="ms" domain={[0, 'auto']} />
              <Tooltip content={<CustomLatencyTooltip />} />
              <Area
                type="monotone"
                dataKey="latencyMs"
                name="Latence Totale"
                stroke="#06b6d4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#latencyGradient)"
              />
              <Area
                type="monotone"
                dataKey="onnxInferenceMs"
                name="ONNX Engine"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeDasharray="2 2"
                fillOpacity={1}
                fill="url(#onnxGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Footer Details */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] font-mono text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          <span>Accélération matérielle: WASM SIMD + WebGL / WebGPU Pipeline</span>
        </div>
        <div className="text-slate-500">
          Inférence exécutée en local sans latence réseau externe
        </div>
      </div>

    </div>
  );
};

// Custom Tooltip for Latency Recharts Area
const CustomLatencyTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as LatencyDataPoint;
    return (
      <div className="bg-slate-900/95 border border-cyan-500/80 p-2.5 rounded-xl shadow-2xl font-mono text-xs text-slate-100 space-y-1 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-1 text-[10px] text-slate-400">
          <span>Horodatage:</span>
          <span className="font-bold text-white">{data.time}</span>
        </div>

        <div className="space-y-0.5 text-[10px] pt-1">
          <div className="flex justify-between gap-4 text-slate-300">
            <span>Latence Totale Inférence:</span>
            <span className="font-bold text-cyan-300">{data.latencyMs} ms</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-400">
            <span>- Pré-traitement Features:</span>
            <span className="font-bold text-indigo-300">{data.preprocessMs} ms</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-400">
            <span>- Cœur ONNX WASM:</span>
            <span className="font-bold text-violet-300">{data.onnxInferenceMs} ms</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-400">
            <span>- Post-traitement Signal:</span>
            <span className="font-bold text-emerald-300">{data.postprocessMs} ms</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};
