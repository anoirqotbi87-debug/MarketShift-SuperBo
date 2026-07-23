import React, { useState, useMemo } from 'react';
import { MT5AccountState } from '../types';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid 
} from 'recharts';
import { 
  TrendingDown, ShieldAlert, AlertTriangle, Activity, ArrowDownRight, RefreshCw, Zap, ShieldCheck, Flame, Info
} from 'lucide-react';

interface DrawdownMonitorProps {
  accountState: MT5AccountState;
  maxDrawdownThresholdPct?: number; // default 8%
}

export interface DrawdownDataPoint {
  time: string;
  equity: number;
  peakEquity: number;
  drawdownUsd: number;
  drawdownPct: number; // e.g. -2.45
  riskZone: 'FAIBLE' | 'MODÉRÉ' | 'CRITIQUE';
}

const HISTORICAL_DRAWDOWN_DATA: Record<'1D' | '1W' | '1M' | 'ALL', DrawdownDataPoint[]> = {
  '1D': [
    { time: '08:00', equity: 10000, peakEquity: 10000, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
    { time: '09:15', equity: 10085, peakEquity: 10085, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
    { time: '10:30', equity: 9920, peakEquity: 10085, drawdownUsd: 165, drawdownPct: -1.64, riskZone: 'FAIBLE' },
    { time: '11:45', equity: 9810, peakEquity: 10085, drawdownUsd: 275, drawdownPct: -2.73, riskZone: 'FAIBLE' },
    { time: '13:00', equity: 10150, peakEquity: 10150, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
    { time: '14:30', equity: 10050, peakEquity: 10150, drawdownUsd: 100, drawdownPct: -0.98, riskZone: 'FAIBLE' },
    { time: '16:00', equity: 10280, peakEquity: 10280, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
    { time: '17:30', equity: 10450, peakEquity: 10450, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
  ],
  '1W': [
    { time: 'Lun 09:00', equity: 10000, peakEquity: 10000, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
    { time: 'Lun 16:00', equity: 9780, peakEquity: 10000, drawdownUsd: 220, drawdownPct: -2.20, riskZone: 'FAIBLE' },
    { time: 'Mar 11:00', equity: 9620, peakEquity: 10000, drawdownUsd: 380, drawdownPct: -3.80, riskZone: 'MODÉRÉ' },
    { time: 'Mer 14:00', equity: 10120, peakEquity: 10120, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
    { time: 'Jeu 10:00', equity: 9910, peakEquity: 10120, drawdownUsd: 210, drawdownPct: -2.07, riskZone: 'FAIBLE' },
    { time: 'Jeu 15:30', equity: 10350, peakEquity: 10350, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
    { time: 'Ven 17:00', equity: 10450, peakEquity: 10450, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
  ],
  '1M': [
    { time: 'Sem 1 - J1', equity: 10000, peakEquity: 10000, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
    { time: 'Sem 1 - J3', equity: 9420, peakEquity: 10000, drawdownUsd: 580, drawdownPct: -5.80, riskZone: 'MODÉRÉ' },
    { time: 'Sem 2 - J2', equity: 9280, peakEquity: 10000, drawdownUsd: 720, drawdownPct: -7.20, riskZone: 'MODÉRÉ' },
    { time: 'Sem 2 - J5', equity: 9850, peakEquity: 10000, drawdownUsd: 150, drawdownPct: -1.50, riskZone: 'FAIBLE' },
    { time: 'Sem 3 - J3', equity: 10200, peakEquity: 10200, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
    { time: 'Sem 4 - J1', equity: 9980, peakEquity: 10200, drawdownUsd: 220, drawdownPct: -2.15, riskZone: 'FAIBLE' },
    { time: 'Sem 4 - J5', equity: 10450, peakEquity: 10450, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
  ],
  'ALL': [
    { time: 'Mois 1', equity: 10000, peakEquity: 10000, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
    { time: 'Mois 2', equity: 8900, peakEquity: 10200, drawdownUsd: 1300, drawdownPct: -12.74, riskZone: 'CRITIQUE' },
    { time: 'Mois 3', equity: 9800, peakEquity: 10200, drawdownUsd: 400, drawdownPct: -3.92, riskZone: 'MODÉRÉ' },
    { time: 'Mois 4', equity: 10600, peakEquity: 10600, drawdownUsd: 0, drawdownPct: 0.0, riskZone: 'FAIBLE' },
    { time: 'Mois 5', equity: 10100, peakEquity: 10600, drawdownUsd: 500, drawdownPct: -4.71, riskZone: 'MODÉRÉ' },
    { time: 'Mois 6', equity: 10450, peakEquity: 10600, drawdownUsd: 150, drawdownPct: -1.41, riskZone: 'FAIBLE' },
  ]
};

export const DrawdownMonitor: React.FC<DrawdownMonitorProps> = ({ 
  accountState, 
  maxDrawdownThresholdPct = 8.0 
}) => {
  const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M' | 'ALL'>('1D');
  const [displayMode, setDisplayMode] = useState<'pct' | 'usd'>('pct');
  const [customThreshold, setCustomThreshold] = useState<number>(maxDrawdownThresholdPct);

  // Dynamic calculation incorporating real-time accountState equity
  const chartData = useMemo(() => {
    const rawData = HISTORICAL_DRAWDOWN_DATA[timeframe];
    
    // Find highest peak equity prior to latest point
    let currentPeak = Math.max(...rawData.map(d => d.peakEquity), accountState.balance);

    return rawData.map((pt, idx) => {
      // For the last point, inject real-time account state
      if (idx === rawData.length - 1) {
        const liveEquity = accountState.equity;
        if (liveEquity > currentPeak) {
          currentPeak = liveEquity;
        }
        const drawdownUsd = Math.max(0, currentPeak - liveEquity);
        const drawdownPct = currentPeak > 0 ? -((drawdownUsd / currentPeak) * 100) : 0;
        
        const absDdPct = Math.abs(drawdownPct);
        const riskZone: 'FAIBLE' | 'MODÉRÉ' | 'CRITIQUE' = 
          absDdPct >= customThreshold ? 'CRITIQUE' : absDdPct >= customThreshold / 2 ? 'MODÉRÉ' : 'FAIBLE';

        return {
          ...pt,
          equity: liveEquity,
          peakEquity: currentPeak,
          drawdownUsd: Math.round(drawdownUsd * 100) / 100,
          drawdownPct: Math.round(drawdownPct * 100) / 100,
          riskZone
        };
      }

      return pt;
    });
  }, [timeframe, accountState, customThreshold]);

  // Aggregate drawdown metrics across current dataset
  const metrics = useMemo(() => {
    let maxDdPct = 0;
    let maxDdUsd = 0;
    let currentDdPct = chartData[chartData.length - 1]?.drawdownPct || 0;
    let currentDdUsd = chartData[chartData.length - 1]?.drawdownUsd || 0;
    let highestPeak = 0;

    chartData.forEach(d => {
      if (Math.abs(d.drawdownPct) > Math.abs(maxDdPct)) {
        maxDdPct = d.drawdownPct;
      }
      if (d.drawdownUsd > maxDdUsd) {
        maxDdUsd = d.drawdownUsd;
      }
      if (d.peakEquity > highestPeak) {
        highestPeak = d.peakEquity;
      }
    });

    const isCurrentExceeded = Math.abs(currentDdPct) >= customThreshold;
    const isWarning = Math.abs(currentDdPct) >= customThreshold / 2;

    const netProfit = accountState.equity - 10000;
    const recoveryFactor = maxDdUsd > 0 ? (netProfit / maxDdUsd).toFixed(2) : 'N/A';

    return {
      currentDdPct,
      currentDdUsd,
      maxDdPct,
      maxDdUsd,
      highestPeak,
      isCurrentExceeded,
      isWarning,
      recoveryFactor
    };
  }, [chartData, customThreshold, accountState]);

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 border border-slate-800/80 shadow-xl font-sans text-slate-100">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl border status-glow ${
            metrics.isCurrentExceeded 
              ? 'bg-rose-950/90 border-rose-600/80 text-rose-400' 
              : metrics.isWarning 
              ? 'bg-amber-950/90 border-amber-600/80 text-amber-400' 
              : 'bg-emerald-950/90 border-emerald-600/80 text-emerald-400'
          }`}>
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Moniteur de Drawdown Maximale & Risque Capital</span>
              <span className={`px-2 py-0.2 text-[9px] rounded-full font-mono border ${
                metrics.isCurrentExceeded
                  ? 'bg-rose-950 text-rose-300 border-rose-700 font-bold animate-pulse'
                  : metrics.isWarning
                  ? 'bg-amber-950 text-amber-300 border-amber-700'
                  : 'bg-emerald-950 text-emerald-300 border-emerald-700'
              }`}>
                {metrics.isCurrentExceeded ? 'ALERTE CRITIQUE' : metrics.isWarning ? 'RISQUE MODÉRÉ' : 'CONTRÔLÉ'}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Graphique temps réel des creux d'équité par rapport au sommet historique (High Watermark)
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
          
          {/* Unit Switcher */}
          <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setDisplayMode('pct')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                displayMode === 'pct' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              % Drawdown
            </button>
            <button
              onClick={() => setDisplayMode('usd')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                displayMode === 'usd' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              $ USD
            </button>
          </div>

          {/* Timeframe Switcher */}
          <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            {(['1D', '1W', '1M', 'ALL'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 rounded-lg font-bold transition-all ${
                  timeframe === tf ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

        </div>

      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
        
        {/* Current Drawdown */}
        <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/90 space-y-0.5">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>Drawdown Actuel</span>
            <Activity className="w-3 h-3 text-indigo-400" />
          </div>
          <div className={`text-sm font-bold ${
            metrics.currentDdPct < -5 ? 'text-rose-400' : metrics.currentDdPct < -2 ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            {metrics.currentDdPct.toFixed(2)}%
            <span className="text-[10px] text-slate-400 font-normal ml-1">
              (-${metrics.currentDdUsd.toFixed(2)})
            </span>
          </div>
        </div>

        {/* Max Drawdown */}
        <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/90 space-y-0.5">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>Drawdown Max Peak</span>
            <ShieldAlert className="w-3 h-3 text-rose-400" />
          </div>
          <div className="text-sm font-bold text-rose-400">
            {metrics.maxDdPct.toFixed(2)}%
            <span className="text-[10px] text-slate-400 font-normal ml-1">
              (-${metrics.maxDdUsd.toFixed(2)})
            </span>
          </div>
        </div>

        {/* High Watermark */}
        <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/90 space-y-0.5">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>Sommet Équité (Peak)</span>
            <Flame className="w-3 h-3 text-amber-400" />
          </div>
          <div className="text-sm font-bold text-amber-300">
            ${metrics.highestPeak.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Recovery Factor */}
        <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/90 space-y-0.5">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>Facteur Récupération</span>
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="text-sm font-bold text-emerald-300">
            {metrics.recoveryFactor}
          </div>
        </div>

      </div>

      {/* Threshold Slider & Risk Alert Bar */}
      <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 flex items-center gap-1 text-[10px]">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Seuil Limite de Risque :</span>
          </span>
          <input
            type="range"
            min="2"
            max="20"
            step="0.5"
            value={customThreshold}
            onChange={(e) => setCustomThreshold(parseFloat(e.target.value))}
            className="w-28 accent-rose-500 cursor-pointer"
          />
          <span className="font-bold text-rose-400">{customThreshold.toFixed(1)}%</span>
        </div>

        <div className="text-[10px] text-slate-400">
          Statut : {metrics.isCurrentExceeded ? (
            <span className="text-rose-400 font-bold">⚠️ Seuil {customThreshold}% dépassé ! Coupe-circuit prêt.</span>
          ) : (
            <span className="text-emerald-400 font-bold">✓ Capital sous tolérance maximale de {customThreshold}%</span>
          )}
        </div>
      </div>

      {/* RECHARTS AREA CHART AREA */}
      <div className="bg-slate-950/90 p-3 rounded-2xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span>HISTORIQUE TEMPS RÉEL (RECHARTS)</span>
          <span className="text-rose-400 font-bold">Ligne Pointillée = Seuil -{customThreshold}%</span>
        </div>

        <div className="w-full h-56 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                {/* Red Gradient fill for Drawdown depth */}
                <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#881337" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="usdGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#78350f" stopOpacity={0.05} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              
              <XAxis 
                dataKey="time" 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false} 
              />
              
              <YAxis 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false}
                unit={displayMode === 'pct' ? '%' : '$'}
                domain={displayMode === 'pct' ? [Math.min(-customThreshold - 2, ...chartData.map(d => d.drawdownPct)), 1] : [0, 'auto']}
              />

              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0f172a', 
                  borderColor: '#334155', 
                  borderRadius: '12px', 
                  fontSize: '11px',
                  fontFamily: 'monospace'
                }}
                formatter={(val: any, name: string) => {
                  if (name === 'drawdownPct') return [`${val}%`, 'Drawdown (%)'];
                  if (name === 'drawdownUsd') return [`$${val}`, 'Perte Peak ($)'];
                  if (name === 'equity') return [`$${val.toLocaleString()}`, 'Équité'];
                  return [val, name];
                }}
                labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
              />

              {/* Threshold Reference Line */}
              {displayMode === 'pct' && (
                <ReferenceLine 
                  y={-customThreshold} 
                  stroke="#f43f5e" 
                  strokeDasharray="4 4" 
                  label={{ value: `LIMITE -${customThreshold}%`, fill: '#f43f5e', fontSize: 10, position: 'insideBottomRight' }} 
                />
              )}

              {/* Zero Baseline */}
              <ReferenceLine y={0} stroke="#475569" />

              {/* Primary Area Plot */}
              <Area 
                type="monotone" 
                dataKey={displayMode === 'pct' ? 'drawdownPct' : 'drawdownUsd'} 
                stroke={displayMode === 'pct' ? '#f43f5e' : '#fbbf24'} 
                strokeWidth={2}
                fillOpacity={1} 
                fill={displayMode === 'pct' ? 'url(#drawdownGradient)' : 'url(#usdGradient)'} 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono pt-1">
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3 text-indigo-400" />
            <span>Drawdown calculé instantanément lors de chaque mise à jour de l'équité MT5.</span>
          </span>
          <span className="text-emerald-400 font-bold">Mise à jour en direct ⚡</span>
        </div>
      </div>

    </div>
  );
};
