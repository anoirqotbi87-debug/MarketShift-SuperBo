import React, { useState, useMemo } from 'react';
import { ActivePosition } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PieChart as PieChartIcon, Layers, TrendingUp, TrendingDown, DollarSign, Activity, Percent } from 'lucide-react';

interface PositionDistributionChartProps {
  positions: ActivePosition[];
}

type GroupByMode = 'symbol_and_type' | 'symbol_only' | 'type_only';
type MetricMode = 'lots' | 'count' | 'value';

const COLOR_PALETTE_BUY = [
  '#10b981', // emerald-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#14b8a6', // teal-500
  '#22c55e', // green-500
];

const COLOR_PALETTE_SELL = [
  '#f43f5e', // rose-500
  '#f97316', // orange-500
  '#ef4444', // red-500
  '#a855f7', // purple-500
  '#eab308', // yellow-500
];

const DEFAULT_COLORS = [
  '#6366f1', '#10b981', '#f43f5e', '#f59e0b', 
  '#06b6d4', '#a855f7', '#ec4899', '#84cc16'
];

export const PositionDistributionChart: React.FC<PositionDistributionChartProps> = ({ positions }) => {
  const [groupBy, setGroupBy] = useState<GroupByMode>('symbol_and_type');
  const [metric, setMetric] = useState<MetricMode>('lots');

  // Compute distribution data for Recharts Pie Chart
  const chartData = useMemo(() => {
    if (!positions || positions.length === 0) return [];

    const groups: Record<string, { name: string; symbol: string; type?: 'BUY' | 'SELL'; lots: number; count: number; valueUSD: number; pnl: number }> = {};

    positions.forEach(pos => {
      let key = '';
      let displayName = '';

      if (groupBy === 'symbol_and_type') {
        key = `${pos.symbol}_${pos.type}`;
        displayName = `${pos.symbol} (${pos.type})`;
      } else if (groupBy === 'symbol_only') {
        key = pos.symbol;
        displayName = pos.symbol;
      } else {
        key = pos.type;
        displayName = pos.type === 'BUY' ? 'ACHAT (BUY)' : 'VENTE (SELL)';
      }

      // Estimate position nominal value in USD
      let notionalUSD = pos.lots * 100000;
      const sym = pos.symbol.toUpperCase();
      if (sym.includes('XAU') || sym.includes('GOLD')) {
        notionalUSD = pos.lots * pos.currentPrice * 100;
      } else if (sym.includes('BTC') || sym.includes('ETH')) {
        notionalUSD = pos.lots * pos.currentPrice;
      } else if (sym.includes('US500') || sym.includes('NAS')) {
        notionalUSD = pos.lots * pos.currentPrice * 10;
      }

      if (!groups[key]) {
        groups[key] = {
          name: displayName,
          symbol: pos.symbol,
          type: pos.type,
          lots: 0,
          count: 0,
          valueUSD: 0,
          pnl: 0,
        };
      }

      groups[key].lots += pos.lots;
      groups[key].count += 1;
      groups[key].valueUSD += notionalUSD;
      groups[key].pnl += pos.pnl;
    });

    // Compute metric value and total sum
    let totalMetricVal = 0;
    const rawList = Object.values(groups).map(g => {
      let rawVal = g.lots;
      if (metric === 'count') rawVal = g.count;
      if (metric === 'value') rawVal = g.valueUSD;
      totalMetricVal += rawVal;
      return { ...g, rawVal };
    });

    const total = totalMetricVal > 0 ? totalMetricVal : 1;

    // Assign dynamic colors & format percentage
    return rawList.map((item, index) => {
      const percentage = Math.round((item.rawVal / total) * 1000) / 10; // 1 decimal precision
      
      let color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      if (item.type === 'BUY') {
        color = COLOR_PALETTE_BUY[index % COLOR_PALETTE_BUY.length];
      } else if (item.type === 'SELL') {
        color = COLOR_PALETTE_SELL[index % COLOR_PALETTE_SELL.length];
      }

      return {
        ...item,
        value: item.rawVal,
        percentage,
        color
      };
    }).sort((a, b) => b.value - a.value);
  }, [positions, groupBy, metric]);

  // Aggregate stats
  const totalLots = useMemo(() => positions.reduce((acc, p) => acc + p.lots, 0), [positions]);
  const totalPositionsCount = positions.length;

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 font-sans text-slate-100 shadow-xl border border-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-950 border border-indigo-700/60 text-indigo-400 status-glow">
            <PieChartIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Répartition des Positions Ouvertes</span>
              <span className="px-2 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-700 text-[9px] rounded-full font-mono">
                Recharts Analytics
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Distribution en pourcentage des positions par symbole et par type d'ordre (BUY / SELL)
            </p>
          </div>
        </div>

        {/* Aggregate Badges */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl">
            <span className="text-slate-400 text-[10px]">Total Positions: </span>
            <span className="font-bold text-indigo-300">{totalPositionsCount}</span>
          </div>
          <div className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl">
            <span className="text-slate-400 text-[10px]">Volume Total: </span>
            <span className="font-bold text-emerald-400">{totalLots.toFixed(2)} Lots</span>
          </div>
        </div>
      </div>

      {/* Control Toolbars: GroupBy Mode & Metric Selection */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-xs font-mono">
        
        {/* Grouping Mode Toggle */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-slate-400 text-[10px] flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Groupement:</span>
          </span>
          <button
            onClick={() => setGroupBy('symbol_and_type')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              groupBy === 'symbol_and_type'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Symbole & Type
          </button>
          <button
            onClick={() => setGroupBy('symbol_only')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              groupBy === 'symbol_only'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Symbole Uniquement
          </button>
          <button
            onClick={() => setGroupBy('type_only')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              groupBy === 'type_only'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Type d'Ordre (BUY/SELL)
          </button>
        </div>

        {/* Metric Selection */}
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="text-slate-400 text-[10px] flex items-center gap-1">
            <Percent className="w-3.5 h-3.5 text-amber-400" />
            <span>Métrique:</span>
          </span>
          <button
            onClick={() => setMetric('lots')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
              metric === 'lots'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Volume (Lots)
          </button>
          <button
            onClick={() => setMetric('count')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
              metric === 'count'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Nombre Trades
          </button>
          <button
            onClick={() => setMetric('value')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
              metric === 'value'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Notionnel $
          </button>
        </div>
      </div>

      {/* Main Grid: Recharts Pie Chart + Percentage Table Legend */}
      {positions.length === 0 ? (
        <div className="text-center py-10 bg-slate-950/50 rounded-xl border border-slate-800 text-xs font-mono text-slate-500 space-y-1">
          <PieChartIcon className="w-8 h-8 mx-auto text-slate-600 stroke-[1.5]" />
          <p className="font-bold text-slate-400">Aucune position ouverte à afficher.</p>
          <p className="text-[10px] text-slate-600">Le graphique camembert s'animera automatiquement dès qu'un ordre sera exécuté.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          
          {/* Recharts Pie Chart Container */}
          <div className="md:col-span-6 h-64 w-full relative flex items-center justify-center bg-slate-950/60 rounded-xl border border-slate-800/80 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  stroke="#0f172a"
                  strokeWidth={2}
                  label={({ name, percentage }) => `${percentage}%`}
                  labelLine={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip metric={metric} />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Inner Center Badge */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none font-mono">
              <span className="text-[10px] text-slate-400 uppercase tracking-tight">Total</span>
              <span className="text-sm font-bold text-white">{totalPositionsCount} Pos</span>
              <span className="text-[10px] text-indigo-400 font-bold">{totalLots.toFixed(2)} L</span>
            </div>
          </div>

          {/* Breakdown Data Legend Table */}
          <div className="md:col-span-6 space-y-2 font-mono">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-800 pb-1 flex justify-between">
              <span>Segment</span>
              <span>Distribution %</span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {chartData.map(item => (
                <div 
                  key={item.name} 
                  className="bg-slate-950/80 p-2 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-md shrink-0 shadow-sm" style={{ backgroundColor: item.color }} />
                    <span className="font-bold text-white text-[11px]">{item.name}</span>
                  </div>

                  <div className="flex items-center gap-3 text-right">
                    <div className="text-[10px] text-slate-400">
                      {metric === 'lots' && `${item.lots.toFixed(2)} Lots`}
                      {metric === 'count' && `${item.count} trade(s)`}
                      {metric === 'value' && `$${Math.round(item.valueUSD).toLocaleString()}`}
                    </div>
                    <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 font-bold text-indigo-300 text-xs w-16 text-center">
                      {item.percentage}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};

// Custom Recharts Tooltip Component
const CustomPieTooltip = ({ active, payload, metric }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900/95 border border-indigo-500/80 p-2.5 rounded-xl shadow-2xl font-mono text-xs text-slate-100 space-y-1.5 backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
          <span className="font-bold text-white">{data.name}</span>
        </div>

        <div className="space-y-0.5 text-[10px]">
          <div className="flex justify-between gap-4 text-slate-300">
            <span>Part du portefeuille:</span>
            <span className="font-bold text-indigo-400">{data.percentage}%</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-300">
            <span>Volume lots:</span>
            <span className="font-bold text-white">{data.lots.toFixed(2)} Lots</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-300">
            <span>Nombre de trades:</span>
            <span className="font-bold text-white">{data.count}</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-300">
            <span>P&L Latent:</span>
            <span className={`font-bold ${data.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};
