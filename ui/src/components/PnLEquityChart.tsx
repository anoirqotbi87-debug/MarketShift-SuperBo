import React, { useState, useEffect } from 'react';
import { MT5AccountState } from '../types';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ReferenceLine 
} from 'recharts';
import { Activity, TrendingUp, TrendingDown, Calendar, Layers, DollarSign } from 'lucide-react';
import { getApiBaseUrl } from '../utils/api';

interface PnLEquityChartProps {
  accountState: MT5AccountState;
}

export interface PnLDataPoint {
  time: string;
  equity: number;
  dailyPnL: number;
  balance: number;
}

export const PnLEquityChart: React.FC<PnLEquityChartProps> = ({ accountState }) => {
  const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M'>('1D');
  const [metricMode, setMetricMode] = useState<'both' | 'equity' | 'pnl'>('both');
  const [rawData, setRawData] = useState<PnLDataPoint[]>([]);

  useEffect(() => {
    const fetchEquityCurve = async () => {
      try {
        const url = `${getApiBaseUrl()}/equity-curve?timeframe=${timeframe}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setRawData(data);
        }
      } catch (err) {
        console.error("Erreur fetch equity curve:", err);
      }
    };
    fetchEquityCurve();
    // Rafraîchir toutes les 5 minutes
    const interval = setInterval(fetchEquityCurve, 300000);
    return () => clearInterval(interval);
  }, [timeframe]);
  
  // Overwrite latest point with actual realtime state
  const chartData = rawData.length > 0 ? rawData.map((pt, idx) => {
    if (idx === rawData.length - 1) {
      return {
        ...pt,
        equity: accountState.equity,
        dailyPnL: accountState.dailyPnL,
        balance: accountState.balance,
      };
    }
    return pt;
  }) : [];

  const isProfit = accountState.dailyPnL >= 0;

  return (
    <div className="glass-card rounded-2xl p-4 space-y-3 border border-slate-800/80 shadow-xl">
      
      {/* Header with Title and Mode Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-950/80 border border-indigo-700/60 rounded-xl text-indigo-400 status-glow">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Évolution Équité & PnL Journalier
            </h3>
            <p className="text-[10px] text-slate-400 font-sans">
              Graphique linéaire interactif MT5 Real-time
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto font-mono text-[10px]">
          {/* Timeframe selector */}
          <div className="flex bg-slate-950/80 p-0.5 rounded-xl border border-slate-800">
            {(['1D', '1W', '1M'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  timeframe === tf
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Metric toggle */}
          <div className="flex bg-slate-950/80 p-0.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setMetricMode('both')}
              className={`px-2 py-1 rounded-lg font-bold transition-all ${
                metricMode === 'both' ? 'bg-slate-800 text-indigo-300' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Afficher Équité & PnL"
            >
              Tous
            </button>
            <button
              onClick={() => setMetricMode('equity')}
              className={`px-2 py-1 rounded-lg font-bold transition-all ${
                metricMode === 'equity' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Équité seule"
            >
              Équité
            </button>
            <button
              onClick={() => setMetricMode('pnl')}
              className={`px-2 py-1 rounded-lg font-bold transition-all ${
                metricMode === 'pnl' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="PnL seul"
            >
              PnL
            </button>
          </div>
        </div>
      </div>

      {/* Quick Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
        <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800/80 flex items-center justify-between">
          <span className="text-slate-400 text-[10px]">Équité Actuelle</span>
          <span className="font-bold text-indigo-400">
            ${accountState.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800/80 flex items-center justify-between">
          <span className="text-slate-400 text-[10px]">PnL Journalier</span>
          <span className={`font-bold flex items-center gap-1 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isProfit ? '+' : ''}${accountState.dailyPnL.toFixed(2)}
          </span>
        </div>

        <div className="hidden sm:flex bg-slate-950/80 p-2 rounded-xl border border-slate-800/80 items-center justify-between">
          <span className="text-slate-400 text-[10px]">Variation %</span>
          <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}{accountState.dailyPnLPct}%
          </span>
        </div>
      </div>

      {/* Recharts Line Chart */}
      <div className="h-48 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis 
              dataKey="time" 
              stroke="#64748b" 
              fontSize={10} 
              tickLine={false} 
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis 
              yAxisId="equityAxis" 
              stroke="#818cf8" 
              fontSize={9} 
              tickLine={false} 
              axisLine={{ stroke: '#334155' }}
              domain={['dataMin - 100', 'dataMax + 100']}
              tickFormatter={(v) => `$${v}`}
              hide={metricMode === 'pnl'}
            />
            <YAxis 
              yAxisId="pnlAxis" 
              orientation="right" 
              stroke="#34d399" 
              fontSize={9} 
              tickLine={false} 
              axisLine={{ stroke: '#334155' }}
              domain={['dataMin - 50', 'dataMax + 50']}
              tickFormatter={(v) => `${v >= 0 ? '+' : ''}$${v}`}
              hide={metricMode === 'equity'}
            />
            
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#020617', 
                borderColor: '#334155', 
                borderRadius: '12px', 
                fontSize: '11px', 
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' 
              }}
              formatter={(value: any, name: any) => {
                const numVal = Number(value);
                if (name === 'Équité ($)') return [`$${numVal.toFixed(2)}`, 'Équité Compte'];
                if (name === 'PnL Journalier ($)') return [`${numVal >= 0 ? '+' : ''}$${numVal.toFixed(2)}`, 'PnL Journalier'];
                return [`$${numVal.toFixed(2)}`, name];
              }}
              labelStyle={{ color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}
            />
            
            <Legend 
              wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} 
              iconType="circle"
              iconSize={8}
            />

            <ReferenceLine yAxisId="pnlAxis" y={0} stroke="#475569" strokeDasharray="2 2" />

            {(metricMode === 'both' || metricMode === 'equity') && (
              <Line 
                yAxisId="equityAxis"
                type="monotone" 
                dataKey="equity" 
                name="Équité ($)" 
                stroke="#6366f1" 
                strokeWidth={2.5} 
                dot={{ r: 3, fill: '#6366f1', strokeWidth: 1 }}
                activeDot={{ r: 6, fill: '#818cf8', stroke: '#ffffff', strokeWidth: 2 }}
              />
            )}

            {(metricMode === 'both' || metricMode === 'pnl') && (
              <Line 
                yAxisId="pnlAxis"
                type="monotone" 
                dataKey="dailyPnL" 
                name="PnL Journalier ($)" 
                stroke="#10b981" 
                strokeWidth={2} 
                strokeDasharray="4 2"
                dot={{ r: 3, fill: '#10b981', strokeWidth: 1 }}
                activeDot={{ r: 6, fill: '#34d399', stroke: '#ffffff', strokeWidth: 2 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
};
