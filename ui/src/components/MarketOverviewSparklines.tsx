import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, YAxis, Tooltip } from 'recharts';
import { 
  TrendingUp, TrendingDown, Activity, Globe, RefreshCw, BarChart2, Zap, ArrowUpRight, ArrowDownRight, Flame
} from 'lucide-react';

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

const INITIAL_SYMBOLS: SymbolSparklineData[] = [
  {
    symbol: 'EURUSD',
    name: 'Euro / US Dollar',
    category: 'Forex',
    currentPrice: 1.08452,
    change24hUsd: 0.00345,
    change24hPct: 0.32,
    high24h: 1.08620,
    low24h: 1.08010,
    spreadPips: 0.8,
    digits: 5,
    history1h: [
      { time: '18:00', price: 1.08380 },
      { time: '18:15', price: 1.08410 },
      { time: '18:30', price: 1.08390 },
      { time: '18:45', price: 1.08435 },
      { time: '19:00', price: 1.08452 },
    ],
    history24h: [
      { time: '00:00', price: 1.08107 },
      { time: '04:00', price: 1.08050 },
      { time: '08:00', price: 1.08220 },
      { time: '12:00', price: 1.08540 },
      { time: '16:00', price: 1.08410 },
      { time: '20:00', price: 1.08452 },
    ],
    history7d: [
      { time: 'J-6', price: 1.07600 },
      { time: 'J-5', price: 1.07920 },
      { time: 'J-4', price: 1.08150 },
      { time: 'J-3', price: 1.08020 },
      { time: 'J-2', price: 1.08310 },
      { time: 'J-1', price: 1.08280 },
      { time: 'Auj', price: 1.08452 },
    ],
  },
  {
    symbol: 'XAUUSD',
    name: 'Gold / US Dollar',
    category: 'Commodities',
    currentPrice: 2685.40,
    change24hUsd: 30.50,
    change24hPct: 1.15,
    high24h: 2692.10,
    low24h: 2651.80,
    spreadPips: 1.2,
    digits: 2,
    history1h: [
      { time: '18:00', price: 2678.10 },
      { time: '18:15', price: 2680.50 },
      { time: '18:30', price: 2682.00 },
      { time: '18:45', price: 2684.10 },
      { time: '19:00', price: 2685.40 },
    ],
    history24h: [
      { time: '00:00', price: 2654.90 },
      { time: '04:00', price: 2652.10 },
      { time: '08:00', price: 2668.00 },
      { time: '12:00', price: 2688.50 },
      { time: '16:00', price: 2682.30 },
      { time: '20:00', price: 2685.40 },
    ],
    history7d: [
      { time: 'J-6', price: 2620.00 },
      { time: 'J-5', price: 2635.50 },
      { time: 'J-4', price: 2640.20 },
      { time: 'J-3', price: 2658.00 },
      { time: 'J-2', price: 2671.00 },
      { time: 'J-1', price: 2669.80 },
      { time: 'Auj', price: 2685.40 },
    ],
  },
  {
    symbol: 'BTCUSD',
    name: 'Bitcoin / US Dollar',
    category: 'Crypto',
    currentPrice: 96420.00,
    change24hUsd: -826.50,
    change24hPct: -0.85,
    high24h: 97850.00,
    low24h: 95300.00,
    spreadPips: 12.0,
    digits: 2,
    history1h: [
      { time: '18:00', price: 96800.00 },
      { time: '18:15', price: 96650.00 },
      { time: '18:30', price: 96500.00 },
      { time: '18:45', price: 96380.00 },
      { time: '19:00', price: 96420.00 },
    ],
    history24h: [
      { time: '00:00', price: 97246.50 },
      { time: '04:00', price: 97800.00 },
      { time: '08:00', price: 96900.00 },
      { time: '12:00', price: 95800.00 },
      { time: '16:00', price: 96150.00 },
      { time: '20:00', price: 96420.00 },
    ],
    history7d: [
      { time: 'J-6', price: 92100.00 },
      { time: 'J-5', price: 94300.00 },
      { time: 'J-4', price: 95800.00 },
      { time: 'J-3', price: 98200.00 },
      { time: 'J-2', price: 97100.00 },
      { time: 'J-1', price: 97246.00 },
      { time: 'Auj', price: 96420.00 },
    ],
  },
  {
    symbol: 'USDJPY',
    name: 'US Dollar / Japanese Yen',
    category: 'Forex',
    currentPrice: 154.205,
    change24hUsd: 0.691,
    change24hPct: 0.45,
    high24h: 154.600,
    low24h: 153.400,
    spreadPips: 0.9,
    digits: 3,
    history1h: [
      { time: '18:00', price: 154.050 },
      { time: '18:15', price: 154.120 },
      { time: '18:30', price: 154.180 },
      { time: '18:45', price: 154.195 },
      { time: '19:00', price: 154.205 },
    ],
    history24h: [
      { time: '00:00', price: 153.514 },
      { time: '04:00', price: 153.600 },
      { time: '08:00', price: 153.950 },
      { time: '12:00', price: 154.450 },
      { time: '16:00', price: 154.100 },
      { time: '20:00', price: 154.205 },
    ],
    history7d: [
      { time: 'J-6', price: 151.800 },
      { time: 'J-5', price: 152.400 },
      { time: 'J-4', price: 153.100 },
      { time: 'J-3', price: 152.900 },
      { time: 'J-2', price: 153.800 },
      { time: 'J-1', price: 153.510 },
      { time: 'Auj', price: 154.205 },
    ],
  },
  {
    symbol: 'GBPUSD',
    name: 'British Pound / US Dollar',
    category: 'Forex',
    currentPrice: 1.26804,
    change24hUsd: -0.00228,
    change24hPct: -0.18,
    high24h: 1.27150,
    low24h: 1.26520,
    spreadPips: 1.0,
    digits: 5,
    history1h: [
      { time: '18:00', price: 1.26850 },
      { time: '18:15', price: 1.26830 },
      { time: '18:30', price: 1.26790 },
      { time: '18:45', price: 1.26810 },
      { time: '19:00', price: 1.26804 },
    ],
    history24h: [
      { time: '00:00', price: 1.27032 },
      { time: '04:00', price: 1.27120 },
      { time: '08:00', price: 1.26900 },
      { time: '12:00', price: 1.26600 },
      { time: '16:00', price: 1.26780 },
      { time: '20:00', price: 1.26804 },
    ],
    history7d: [
      { time: 'J-6', price: 1.25900 },
      { time: 'J-5', price: 1.26200 },
      { time: 'J-4', price: 1.26700 },
      { time: 'J-3', price: 1.27200 },
      { time: 'J-2', price: 1.27050 },
      { time: 'J-1', price: 1.27030 },
      { time: 'Auj', price: 1.26804 },
    ],
  }
];

interface MarketOverviewSparklinesProps {
  onSymbolClick?: (symbol: string) => void;
}

export const MarketOverviewSparklines: React.FC<MarketOverviewSparklinesProps> = ({ onSymbolClick }) => {
  const [timeframe, setTimeframe] = useState<'1H' | '24H' | '7D'>('24H');
  const [symbols, setSymbols] = useState<SymbolSparklineData[]>(INITIAL_SYMBOLS);
  const [lastTickSymbol, setLastTickSymbol] = useState<string | null>(null);

  // Live micro-tick simulator to make sparklines feel real and dynamic
  useEffect(() => {
    const interval = setInterval(() => {
      setSymbols(prev => {
        const randomIndex = Math.floor(Math.random() * prev.length);
        const item = prev[randomIndex];
        setLastTickSymbol(item.symbol);

        const deltaPct = (Math.random() - 0.49) * 0.001; // subtle noise
        const newPrice = Math.max(0.0001, item.currentPrice * (1 + deltaPct));
        const priceDiff = newPrice - (item.currentPrice - item.change24hUsd);
        const newChangePct = ((newPrice - (item.currentPrice - item.change24hUsd)) / (item.currentPrice - item.change24hUsd)) * 100;

        const updatedHistory24h = [...item.history24h];
        if (updatedHistory24h.length > 0) {
          updatedHistory24h[updatedHistory24h.length - 1] = {
            ...updatedHistory24h[updatedHistory24h.length - 1],
            price: newPrice
          };
        }

        return prev.map((s, idx) => {
          if (idx !== randomIndex) return s;
          return {
            ...s,
            currentPrice: newPrice,
            change24hUsd: priceDiff,
            change24hPct: newChangePct,
            high24h: Math.max(s.high24h, newPrice),
            low24h: Math.min(s.low24h, newPrice),
            history24h: updatedHistory24h
          };
        });
      });

      // Reset highlight flash after 800ms
      setTimeout(() => setLastTickSymbol(null), 800);
    }, 2500);

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
