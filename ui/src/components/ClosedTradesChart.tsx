import React, { useMemo } from 'react';
import { ClosedTrade } from '../types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface ClosedTradesChartProps {
  closedTrades: ClosedTrade[];
}

export const ClosedTradesChart: React.FC<ClosedTradesChartProps> = ({ closedTrades }) => {
  const data = useMemo(() => {
    // Sort trades by closeTime (assuming format like HH:MM:SS or Date string)
    // If it's just time strings from the same day, sorting alphabetically mostly works, but better to parse
    const sortedTrades = [...closedTrades].reverse(); // Usually they are prepended, so reverse to chronological

    let cumulativePnL = 0;
    return sortedTrades.map((trade, index) => {
      cumulativePnL += trade.pnl;
      return {
        name: `Trade ${index + 1}`,
        time: trade.closeTime,
        pnl: trade.pnl,
        cumulativePnL: Number(cumulativePnL.toFixed(2)),
        symbol: trade.symbol
      };
    });
  }, [closedTrades]);

  const totalPnL = data.length > 0 ? data[data.length - 1].cumulativePnL : 0;
  const isPositive = totalPnL >= 0;

  if (closedTrades.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-3 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${isPositive ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
            <Activity className={`w-4 h-4 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Performance Historique</h3>
            <p className="text-xs text-slate-400">Évolution du PnL Réalisé</p>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-black flex items-center gap-1 justify-end ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {isPositive ? '+' : ''}${totalPnL.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {closedTrades.length} Trades
          </div>
        </div>
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.5} />
            <XAxis 
              dataKey="time" 
              stroke="#64748b" 
              fontSize={10} 
              tickMargin={10}
              minTickGap={20}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={10} 
              tickFormatter={(val) => `$${val}`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
              itemStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
              labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
              formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name === 'cumulativePnL' ? 'PnL Cumulé' : 'PnL Trade']}
              labelFormatter={(label) => `Clôture: ${label}`}
            />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
            <Line 
              type="monotone" 
              dataKey="cumulativePnL" 
              stroke={isPositive ? '#10b981' : '#ef4444'} 
              strokeWidth={3}
              dot={{ r: 3, fill: '#0f172a', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: isPositive ? '#10b981' : '#ef4444' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
