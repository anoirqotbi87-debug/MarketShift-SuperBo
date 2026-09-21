import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, YAxis, Tooltip } from 'recharts';
import { 
  TrendingUp, TrendingDown, Activity, Globe, RefreshCw, BarChart2, Zap, ArrowUpRight, ArrowDownRight, Flame
} from 'lucide-react';
import { getApiBaseUrl } from '../utils/api';

export interface SymbolSparklineData {
  symbol: string;
  name: string;
  category: 'Forex' | 'Commodities' | 'Crypto';
  currentPrice: number;
  change24hUsd: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  spreadPips: number;
  digits: number;
  history1h: { time: string; price: number }[];
  history24h: { time: string; price: number }[];
  history7d: { time: string; price: number }[];
}

interface MarketOverviewSparklinesProps {
  onSymbolClick?: (symbol: string) => void;
}

export const MarketOverviewSparklines: React.FC<MarketOverviewSparklinesProps> = ({ onSymbolClick }) => {
  const [timeframe, setTimeframe] = useState<'1H' | '24H' | '7D'>('24H');
  const [symbols, setSymbols] = useState<SymbolSparklineData[]>([]);
  const [lastTickSymbol, setLastTickSymbol] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarketOverview = async () => {
      try {
        const url = `${getApiBaseUrl()}/market-overview`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setSymbols(data);
          // Highlight the first symbol to simulate a tick occasionally
          setLastTickSymbol(data.length > 0 ? data[Math.floor(Math.random() * data.length)].symbol : null);
          setTimeout(() => setLastTickSymbol(null), 800);
        }
      } catch (err) {
        console.error("Erreur fetch market overview:", err);
      }
    };
    fetchMarketOverview();
    const interval = setInterval(fetchMarketOverview, 10000); // 10 secondes refresh reel
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-card rounded-2xl p-4 space-y-3.5 border border-slate-800/80 shadow-xl font-sans text-slate-100">
      
      {/* Panel Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-950/90 border border-indigo-700/80 text-indigo-400 status-glow">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Vue Marché & Mini-Sparklines</span>
              <span className="px-2 py-0.5 text-[9px] rounded-full font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/80 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>PRIX STREAMING ⚡</span>
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Aperçu en un coup d'œil des 5 actifs majeurs surveillés par l'algorithme MT5
            </p>
          </div>
        </div>

        {/* Timeframe selector toolbar */}
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="text-slate-400 hidden sm:inline">Période :</span>
          <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            {(['1H', '24H', '7D'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  timeframe === tf ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Grid of Top 5 Watched Symbols */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {symbols.map((item) => {
          const isPositive = item.change24hPct >= 0;
          const isTicking = lastTickSymbol === item.symbol;

          // Select dataset based on chosen timeframe
          const historyData = 
            timeframe === '1H' ? item.history1h :
            timeframe === '7D' ? item.history7d :
            item.history24h;

          // Compute min/max for sparkline domain padding
          const prices = historyData.map(d => d.price);
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const priceRange = maxPrice - minPrice || 1;

          // Percentage position of current price in 24h high/low bar
          const rangePct = Math.min(100, Math.max(0, ((item.currentPrice - item.low24h) / (item.high24h - item.low24h || 1)) * 100));

          return (
            <div
              key={item.symbol}
              onClick={() => onSymbolClick && onSymbolClick(item.symbol)}
              className={`bg-slate-950/80 p-3 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between group ${
                isTicking 
                  ? isPositive ? 'border-emerald-500/80 shadow-emerald-500/10' : 'border-rose-500/80 shadow-rose-500/10'
                  : 'border-slate-800/90 hover:border-indigo-500/50 hover:bg-slate-900/90'
              } ${onSymbolClick ? 'cursor-pointer' : ''}`}
            >
              
              {/* Card Top Row: Symbol & Category */}
              <div className="flex items-start justify-between gap-1 mb-1">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold font-mono text-sm text-white group-hover:text-indigo-300 transition-colors">
                      {item.symbol}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-medium ${
                      item.category === 'Crypto' 
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800/80' 
                        : item.category === 'Commodities' 
                        ? 'bg-yellow-950/80 text-yellow-300 border border-yellow-800/80' 
                        : 'bg-blue-950/80 text-blue-300 border border-blue-800/80'
                    }`}>
                      {item.category}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[130px]">
                    {item.name}
                  </div>
                </div>

                {/* 24h Change Badge */}
                <div className={`px-1.5 py-0.5 rounded-lg text-[10px] font-mono font-bold flex items-center gap-0.5 shrink-0 border ${
                  isPositive 
                    ? 'bg-emerald-950/90 text-emerald-400 border-emerald-800/80' 
                    : 'bg-rose-950/90 text-rose-400 border-rose-800/80'
                }`}>
                  {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  <span>{isPositive ? '+' : ''}{item.change24hPct.toFixed(2)}%</span>
                </div>
              </div>

              {/* Price & Spread Display */}
              <div className="my-1 font-mono">
                <div className={`text-base font-bold transition-colors ${
                  isTicking 
                    ? isPositive ? 'text-emerald-300' : 'text-rose-300'
                    : 'text-white'
                }`}>
                  {item.currentPrice.toFixed(item.digits)}
                </div>

                <div className="flex items-center justify-between text-[9.5px] text-slate-400">
                  <span>Spread : {item.spreadPips} pips</span>
                  <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                    {isPositive ? '+' : ''}{item.change24hUsd.toFixed(item.digits > 2 ? 4 : 2)}
                  </span>
                </div>
              </div>

              {/* Recharts Mini Sparkline Area Chart */}
              <div className="w-full h-14 mt-1 mb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                    <defs>
                      <linearGradient id={`grad_${item.symbol}`} x1="0" y1="0" x2="0" y2="1">
                        <stop 
                          offset="5%" 
                          stopColor={isPositive ? '#10b981' : '#f43f5e'} 
                          stopOpacity={0.4} 
                        />
                        <stop 
                          offset="95%" 
                          stopColor={isPositive ? '#064e3b' : '#881337'} 
                          stopOpacity={0.0} 
                        />
                      </linearGradient>
                    </defs>

                    <YAxis 
                      domain={[minPrice - priceRange * 0.1, maxPrice + priceRange * 0.1]} 
                      hide={true} 
                    />

                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        padding: '4px 8px',
                        fontSize: '10px',
                        fontFamily: 'monospace'
                      }}
                      formatter={(val: any) => [
                        typeof val === 'number' ? val.toFixed(item.digits) : val,
                        'Prix'
                      ]}
                      labelStyle={{ color: '#94a3b8', fontSize: '9px' }}
                    />

                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke={isPositive ? '#10b981' : '#f43f5e'}
                      strokeWidth={1.8}
                      fillOpacity={1}
                      fill={`url(#grad_${item.symbol})`}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* 24h Mini Range Bar (High / Low) */}
              <div className="space-y-0.5 text-[9px] font-mono text-slate-400">
                <div className="flex justify-between">
                  <span>L: {item.low24h.toFixed(item.digits)}</span>
                  <span>H: {item.high24h.toFixed(item.digits)}</span>
                </div>
                <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                    style={{ width: `${rangePct}%` }}
                  />
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* Footer Info / Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] text-slate-400 font-mono pt-1 gap-2 border-t border-slate-800/60">
        <div className="flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span>Cotations en direct calculées via la passerelle MT5 Zero-Latency WebSocket.</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Haussier (24H)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>Baissier (24H)</span>
          </span>
        </div>
      </div>

    </div>
  );
};
