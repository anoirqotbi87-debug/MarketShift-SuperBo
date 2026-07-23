import React, { useState } from 'react';
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

interface PnLEquityChartProps {
  accountState: MT5AccountState;
}

export interface PnLDataPoint {
  time: string;
  equity: number;
  dailyPnL: number;
  balance: number;
}

// Historical time-series data for different timeframes
const timeframesData: Record<'1D' | '1W' | '1M', PnLDataPoint[]> = {
  '1D': [
    { time: '08:00', equity: 10000, dailyPnL: 0, balance: 10000 },
    { time: '09:30', equity: 10085, dailyPnL: 85, balance: 10000 },
    { time: '11:00', equity: 10160, dailyPnL: 160, balance: 10120 },
    { time: '12:30', equity: 10110, dailyPnL: 110, balance: 10120 },
    { time: '14:00', equity: 10245, dailyPnL: 245, balance: 10210 },
    { time: '15:30', equity: 10320, dailyPnL: 320, balance: 10210 },
    { time: '17:00', equity: 10450, dailyPnL: 450, balance: 10390 },
  ],
  '1W': [
    { time: 'Lun', equity: 9800, dailyPnL: -200, balance: 9800 },
    { time: 'Mar', equity: 9950, dailyPnL: 150, balance: 9800 },
    { time: 'Mer', equity: 10120, dailyPnL: 170, balance: 10100 },
    { time: 'Jeu', equity: 10280, dailyPnL: 160, balance: 10250 },
    { time: 'Ven', equity: 10450, dailyPnL: 170, balance: 10390 },
  ],
  '1M': [
    { time: 'Sem 1', equity: 9200, dailyPnL: -800, balance: 9200 },
    { time: 'Sem 2', equity: 9650, dailyPnL: 450, balance: 9600 },
    { time: 'Sem 3', equity: 10050, dailyPnL: 400, balance: 10000 },
    { time: 'Sem 4', equity: 10450, dailyPnL: 400, balance: 10390 },
  ]
};

export const PnLEquityChart: React.FC<PnLEquityChartProps> = ({ accountState }) => {
  const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M'>('1D');
  const [metricMode, setMetricMode] = useState<'both' | 'equity' | 'pnl'>('both');

  // Dynamic calculation based on current accountState
  const currentRawData = timeframesData[timeframe];
  
  // Overwrite latest point with actual realtime state
  const chartData = currentRawData.map((pt, idx) => {
    if (idx === currentRawData.length - 1) {
      return {
        ...pt,
        equity: accountState.equity,
        dailyPnL: accountState.dailyPnL,
        balance: accountState.balance,
      };
    }
    return pt;
  });

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
