import React, { useState, useEffect, useMemo } from 'react';
import { MT5AccountState } from '../types';
import { 
  ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Award, Zap, ArrowUpRight, BarChart3, Layers, Target, Activity, ShieldCheck, Scale, Sparkles, Info
} from 'lucide-react';
import { getApiBaseUrl } from '../utils/api';

interface EquityBenchmarkChartProps {
  accountState: MT5AccountState;
}

export interface EquityBenchmarkPoint {
  time: string;
  strategyEquity: number;
  strategyReturnPct: number;
  benchmarkEquity: number;
  benchmarkReturnPct: number;
  alphaPct: number;
}

type TimeframeType = '1W' | '1M' | '3M' | 'YTD' | 'ALL';
type BenchmarkBasketType = 'BASKET_TOP5' | 'BTCUSD' | 'XAUUSD' | 'EURUSD';

export const EquityBenchmarkChart: React.FC<EquityBenchmarkChartProps> = ({ accountState }) => {
  const [timeframe, setTimeframe] = useState<TimeframeType>('1M');
  const [benchmarkType, setBenchmarkType] = useState<BenchmarkBasketType>('BASKET_TOP5');
  const [displayMode, setDisplayMode] = useState<'usd' | 'pct'>('usd');
  const [chartData, setChartData] = useState<EquityBenchmarkPoint[]>([]);

  const initialCapital = 10000;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const urlBench = `${getApiBaseUrl()}/benchmark-curve?timeframe=${timeframe}&asset=${benchmarkType}`;
        const urlStrat = `${getApiBaseUrl()}/equity-curve?timeframe=${timeframe}`;
        
        const [resBench, resStrat] = await Promise.all([fetch(urlBench), fetch(urlStrat)]);
        
        if (resBench.ok && resStrat.ok) {
          const benchData = await resBench.json();
          let stratData = await resStrat.json();
          
          // Match length
          const minLen = Math.min(benchData.length, stratData.length);
          if (minLen > 0) {
            stratData = stratData.slice(-minLen);
            const merged = stratData.map((pt: any, idx: number) => {
              const benchEquVal = benchData[benchData.length - minLen + idx]?.benchmarkEquity || 10000;
              let stratEquVal = pt.equity;
              
              if (idx === minLen - 1) {
                stratEquVal = accountState.equity; // Live update
              }
              
              const stratReturnPct = ((stratEquVal - initialCapital) / initialCapital) * 100;
              const benchReturnPct = ((benchEquVal - initialCapital) / initialCapital) * 100;
              const alphaPct = stratReturnPct - benchReturnPct;
              
              return {
                time: pt.time,
                strategyEquity: Math.round(stratEquVal * 100) / 100,
                strategyReturnPct: Math.round(stratReturnPct * 100) / 100,
                benchmarkEquity: Math.round(benchEquVal * 100) / 100,
                benchmarkReturnPct: Math.round(benchReturnPct * 100) / 100,
                alphaPct: Math.round(alphaPct * 100) / 100,
              };
            });
            setChartData(merged);
          }
        }
      } catch (err) {
        console.error("Erreur fetch benchmark data:", err);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 300000);
    return () => clearInterval(interval);
  }, [timeframe, benchmarkType, accountState.equity]);

  // Aggregate metrics
  const latestPoint = chartData.length > 0 
    ? chartData[chartData.length - 1] 
    : { strategyReturnPct: 0, benchmarkReturnPct: 0, alphaPct: 0, strategyEquity: 0, benchmarkEquity: 0 };
  const stratReturnTotalPct = latestPoint.strategyReturnPct;
  const benchReturnTotalPct = latestPoint.benchmarkReturnPct;
  const alphaTotalPct = latestPoint.alphaPct;

  const benchmarkLabel = 
    benchmarkType === 'BASKET_TOP5' ? 'Panier Équipondéré Top 5 (EUR, XAU, BTC, JPY, GBP)' :
    benchmarkType === 'BTCUSD' ? 'Buy & Hold Bitcoin (BTCUSD)' :
    benchmarkType === 'XAUUSD' ? 'Buy & Hold Or physique (XAUUSD)' : 'Buy & Hold Euro (EURUSD)';

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 border border-slate-800/80 shadow-xl font-sans text-slate-100">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-950/90 border border-emerald-600/80 text-emerald-400 status-glow">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Courbe d'Équité vs Benchmark 'Buy and Hold'</span>
              <span className="px-2 py-0.2 text-[9px] rounded-full font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-700/80">
                ALPHA BENCHMARK
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Comparaison de la performance active du Bot MT5 contre une conservation passive sans trading
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
          
          {/* Unit Toggle */}
          <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setDisplayMode('usd')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                displayMode === 'usd' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              $ Équité
            </button>
            <button
              onClick={() => setDisplayMode('pct')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                displayMode === 'pct' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              % Rendement
            </button>
          </div>

          {/* Timeframe Switcher */}
          <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            {(['1W', '1M', '3M', 'YTD', 'ALL'] as const).map((tf) => (
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

      {/* Benchmark Asset Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-950/80 p-2 rounded-xl border border-slate-800 text-[11px] font-mono">
        <span className="text-slate-400 text-[10px] uppercase font-bold shrink-0">Benchmark de Référence :</span>
        
        <button
          onClick={() => setBenchmarkType('BASKET_TOP5')}
          className={`px-2.5 py-1 rounded-lg border font-bold transition-all ${
            benchmarkType === 'BASKET_TOP5'
              ? 'bg-amber-950 text-amber-300 border-amber-600 shadow-sm'
              : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          Panier Équipondéré Top 5 (Index)
        </button>

        <button
          onClick={() => setBenchmarkType('BTCUSD')}
          className={`px-2.5 py-1 rounded-lg border font-bold transition-all ${
            benchmarkType === 'BTCUSD'
              ? 'bg-amber-950 text-amber-300 border-amber-600 shadow-sm'
              : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          Buy & Hold BTCUSD
        </button>

        <button
          onClick={() => setBenchmarkType('XAUUSD')}
          className={`px-2.5 py-1 rounded-lg border font-bold transition-all ${
            benchmarkType === 'XAUUSD'
              ? 'bg-amber-950 text-amber-300 border-amber-600 shadow-sm'
              : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          Buy & Hold Or (XAUUSD)
        </button>

        <button
          onClick={() => setBenchmarkType('EURUSD')}
          className={`px-2.5 py-1 rounded-lg border font-bold transition-all ${
            benchmarkType === 'EURUSD'
              ? 'bg-amber-950 text-amber-300 border-amber-600 shadow-sm'
              : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          Buy & Hold EURUSD
        </button>
      </div>

      {/* Metrics Performance Comparison Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-xs">
        
        {/* Bot Strategy Return Card */}
        <div className="bg-slate-950/80 p-3 rounded-xl border border-emerald-900/50 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>Stratégie Bot Quant</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-base font-bold text-emerald-400">
              ${latestPoint.strategyEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-emerald-300">
              +{stratReturnTotalPct.toFixed(2)}%
            </span>
          </div>
          <div className="text-[9.5px] text-slate-500">
            Performance avec gestion dynamique des SL/TP
          </div>
        </div>

        {/* Buy & Hold Benchmark Card */}
        <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-900/50 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>Benchmark Buy & Hold</span>
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-base font-bold text-amber-300">
              ${latestPoint.benchmarkEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className={`text-xs font-bold ${benchReturnTotalPct >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
              {benchReturnTotalPct >= 0 ? '+' : ''}{benchReturnTotalPct.toFixed(2)}%
            </span>
          </div>
          <div className="text-[9.5px] text-slate-500 truncate">
            {benchmarkLabel}
          </div>
        </div>

        {/* Generated Alpha Card */}
        <div className="bg-slate-950/80 p-3 rounded-xl border border-indigo-900/50 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>Surperformance (Alpha)</span>
            <Award className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-base font-bold ${alphaTotalPct >= 0 ? 'text-indigo-300' : 'text-rose-400'}`}>
              {alphaTotalPct >= 0 ? '+' : ''}{alphaTotalPct.toFixed(2)}%
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 font-bold">
              {alphaTotalPct >= 0 ? 'SURPERFORME' : 'SOUS-PERFORME'}
            </span>
          </div>
          <div className="text-[9.5px] text-slate-500">
            Gain net apporté par l'algorithme IA
          </div>
        </div>

      </div>

      {/* RECHARTS AREA / LINE CHART */}
      <div className="bg-slate-950/90 p-3.5 rounded-2xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span className="flex items-center gap-1.5 font-bold text-white">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>GRAPHIQUE COMPARATIF DE PONDÉRATION</span>
          </span>
          <span className="text-slate-500">Capital Initial: $10,000.00</span>
        </div>

        <div className="w-full h-64 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                {/* Strategy Emerald Gradient */}
                <linearGradient id="strategyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#064e3b" stopOpacity={0.0} />
                </linearGradient>

                {/* Benchmark Amber Gradient */}
                <linearGradient id="benchmarkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#78350f" stopOpacity={0.0} />
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
                domain={['auto', 'auto']}
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
                  if (name === 'strategyEquity') return [`$${val.toLocaleString()}`, 'Stratégie Bot MT5'];
                  if (name === 'strategyReturnPct') return [`+${val}%`, 'Rendement Bot'];
                  if (name === 'benchmarkEquity') return [`$${val.toLocaleString()}`, 'Benchmark Buy & Hold'];
                  if (name === 'benchmarkReturnPct') return [`${val >= 0 ? '+' : ''}${val}%`, 'Rendement Benchmark'];
                  return [val, name];
                }}
                labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
              />

              <Legend 
                wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '10px' }}
                formatter={(value) => {
                  if (value === 'strategyEquity' || value === 'strategyReturnPct') return 'Stratégie Bot MT5 (IA)';
                  if (value === 'benchmarkEquity' || value === 'benchmarkReturnPct') return `Benchmark (${benchmarkType})`;
                  return value;
                }}
              />

              {/* Capital Base Line */}
              <ReferenceLine 
                y={displayMode === 'usd' ? initialCapital : 0} 
                stroke="#475569" 
                strokeDasharray="4 4" 
                label={{ value: 'Capital Initial ($10k)', fill: '#64748b', fontSize: 9, position: 'insideTopLeft' }} 
              />

              {/* Benchmark Curve */}
              <Area 
                type="monotone" 
                dataKey={displayMode === 'usd' ? 'benchmarkEquity' : 'benchmarkReturnPct'} 
                stroke="#f59e0b" 
                strokeWidth={2}
                strokeDasharray="5 5"
                fillOpacity={1} 
                fill="url(#benchmarkGrad)" 
              />

              {/* Strategy Bot Curve */}
              <Area 
                type="monotone" 
                dataKey={displayMode === 'usd' ? 'strategyEquity' : 'strategyReturnPct'} 
                stroke="#10b981" 
                strokeWidth={2.5}
                fillOpacity={1} 
                fill="url(#strategyGrad)" 
              />

            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Footer Explanation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[9.5px] text-slate-500 font-mono pt-1 gap-2 border-t border-slate-800/60">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Le benchmark Buy & Hold simule une allocation passive de $10,000 conservée sans rebalancement ni levier.</span>
          </span>
          <span className="text-emerald-400 font-bold">Alpha calculé en temps réel ⚡</span>
        </div>

      </div>

    </div>
  );
};
