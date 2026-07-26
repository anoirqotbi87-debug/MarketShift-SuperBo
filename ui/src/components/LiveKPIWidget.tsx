import React, { useState, useEffect } from 'react';
import { Target, Activity, DollarSign, Briefcase } from 'lucide-react';

interface KPIMetrics {
  expectancy: number;
  profit_factor: number;
  gross_profit: number;
  gross_loss: number;
  total_trades: number;
}

export const LiveKPIWidget: React.FC = () => {
  const [metrics, setMetrics] = useState<KPIMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchKPIs = async () => {
    try {
      const res = await fetch('http://localhost:8000/kpi');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error("Failed to fetch KPIs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKPIs();
    const interval = setInterval(fetchKPIs, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-md rounded-xl p-6 border border-slate-700/50 flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="bg-slate-800/80 backdrop-blur-xl rounded-xl border border-slate-700/50 overflow-hidden shadow-2xl transition-all duration-300 hover:shadow-indigo-500/10 hover:border-indigo-500/30">
      <div className="p-4 border-b border-slate-700/50 bg-gradient-to-r from-slate-800 to-slate-800/50 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center">
          <Activity className="w-5 h-5 mr-2 text-indigo-400" />
          Live Quants KPIs (Freqtrade Style)
        </h2>
        <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-xs rounded-full font-mono font-medium">
          {metrics.total_trades} Trades Analyzed
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-5">
        
        {/* Expectancy */}
        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <Target className="w-6 h-6 text-indigo-400 mb-2" />
          <span className="text-sm text-slate-400 font-medium">Expectancy</span>
          <span className={`text-2xl font-black mt-1 ${metrics.expectancy > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ${metrics.expectancy.toFixed(2)}
          </span>
          <p className="text-[10px] text-slate-500 mt-1 text-center leading-tight">Average expected return<br/>per trade.</p>
        </div>

        {/* Profit Factor */}
        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <Briefcase className="w-6 h-6 text-emerald-400 mb-2" />
          <span className="text-sm text-slate-400 font-medium">Profit Factor</span>
          <span className={`text-2xl font-black mt-1 ${metrics.profit_factor >= 1.5 ? 'text-emerald-400' : metrics.profit_factor >= 1 ? 'text-amber-400' : 'text-rose-400'}`}>
            {metrics.profit_factor === 999 ? '∞' : metrics.profit_factor.toFixed(2)}
          </span>
          <p className="text-[10px] text-slate-500 mt-1 text-center leading-tight">Gross Profit / Gross Loss<br/>(&gt;1.5 is excellent).</p>
        </div>

        {/* Gross Profit */}
        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <DollarSign className="w-6 h-6 text-emerald-500 mb-2" />
          <span className="text-sm text-slate-400 font-medium">Gross Profit</span>
          <span className="text-2xl font-black mt-1 text-emerald-500">
            ${metrics.gross_profit.toFixed(2)}
          </span>
        </div>

        {/* Gross Loss */}
        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <DollarSign className="w-6 h-6 text-rose-500 mb-2" />
          <span className="text-sm text-slate-400 font-medium">Gross Loss</span>
          <span className="text-2xl font-black mt-1 text-rose-500">
            ${metrics.gross_loss.toFixed(2)}
          </span>
        </div>

      </div>
    </div>
  );
};
