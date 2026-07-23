import React, { useState, useEffect, useMemo } from 'react';
import { 
  Layers, Activity, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, 
  BarChart2, RefreshCw, Zap, ShieldAlert, Sparkles, Filter, ChevronDown, Check, Eye
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine 
} from 'recharts';

interface OrderBookLevel {
  price: number;
  volume: number; // Lots / Contracts
  totalVolume: number; // Cumulative volume
  ordersCount: number;
}

interface DepthDataPoint {
  price: number;
  bidDepth?: number;
  askDepth?: number;
  bidVolume?: number;
  askVolume?: number;
  priceFormatted: string;
}

export type DepthSymbol = 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'XAUUSD' | 'BTCUSD' | 'US500';

const SYMBOL_CONFIGS: Record<DepthSymbol, { midPrice: number; step: number; digits: number; lotUnit: string }> = {
  EURUSD: { midPrice: 1.08520, step: 0.00010, digits: 5, lotUnit: 'Lots' },
  GBPUSD: { midPrice: 1.27450, step: 0.00010, digits: 5, lotUnit: 'Lots' },
  USDJPY: { midPrice: 156.400, step: 0.020, digits: 3, lotUnit: 'Lots' },
  XAUUSD: { midPrice: 2415.50, step: 0.50, digits: 2, lotUnit: 'Oz' },
  BTCUSD: { midPrice: 64250.0, step: 25.0, digits: 1, lotUnit: 'BTC' },
  US500:  { midPrice: 5580.25, step: 1.00, digits: 2, lotUnit: 'Cont.' }
};

export const MarketDepthChart: React.FC = () => {
  const [symbol, setSymbol] = useState<DepthSymbol>('EURUSD');
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [depthLevelsCount, setDepthLevelsCount] = useState<number>(10); // 10 levels bid/ask
  const [selectedLiquidityWall, setSelectedLiquidityWall] = useState<OrderBookLevel | null>(null);

  const config = SYMBOL_CONFIGS[symbol];

  // Base price state
  const [currentMidPrice, setCurrentMidPrice] = useState<number>(config.midPrice);

  // Sync mid price when symbol changes
  useEffect(() => {
    setCurrentMidPrice(SYMBOL_CONFIGS[symbol].midPrice);
    setSelectedLiquidityWall(null);
  }, [symbol]);

  // Generate Order Book Bids and Asks
  const [orderBook, setOrderBook] = useState<{ bids: OrderBookLevel[]; asks: OrderBookLevel[] }>(() => {
    return generateOrderBookData(config.midPrice, config.step, depthLevelsCount, config.digits);
  });

  // Regenerate when symbol or levels count changes
  useEffect(() => {
    setOrderBook(generateOrderBookData(currentMidPrice, config.step, depthLevelsCount, config.digits));
  }, [symbol, depthLevelsCount, currentMidPrice]);

  // Real-time ticking simulation
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      // Random micro price tick
      const tick = (Math.random() - 0.5) * (config.step * 0.4);
      const newMid = Math.round((currentMidPrice + tick) * Math.pow(10, config.digits)) / Math.pow(10, config.digits);
      setCurrentMidPrice(newMid);

      // Jitter order book volumes
      setOrderBook(prev => {
        const newBids = prev.bids.map(b => {
          const delta = (Math.random() - 0.48) * 3.5;
          const vol = Math.max(1.2, Math.round((b.volume + delta) * 10) / 10);
          return { ...b, volume: vol };
        });

        const newAsks = prev.asks.map(a => {
          const delta = (Math.random() - 0.48) * 3.5;
          const vol = Math.max(1.2, Math.round((a.volume + delta) * 10) / 10);
          return { ...a, volume: vol };
        });

        // Recalculate cumulative
        let cumBid = 0;
        newBids.forEach(b => {
          cumBid += b.volume;
          b.totalVolume = Math.round(cumBid * 10) / 10;
        });

        let cumAsk = 0;
        newAsks.forEach(a => {
          cumAsk += a.volume;
          a.totalVolume = Math.round(cumAsk * 10) / 10;
        });

        return { bids: newBids, asks: newAsks };
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [isStreaming, currentMidPrice, config]);

  // Combine bids & asks into a continuous Depth Chart Data structure for Recharts
  const chartData = useMemo(() => {
    const data: DepthDataPoint[] = [];

    // Bids sorted ascending price (lowest bid to highest bid near spread)
    const sortedBids = [...orderBook.bids].reverse();
    sortedBids.forEach(b => {
      data.push({
        price: b.price,
        bidDepth: b.totalVolume,
        bidVolume: b.volume,
        priceFormatted: b.price.toFixed(config.digits)
      });
    });

    // Asks sorted ascending price (lowest ask near spread to highest ask)
    orderBook.asks.forEach(a => {
      data.push({
        price: a.price,
        askDepth: a.totalVolume,
        askVolume: a.volume,
        priceFormatted: a.price.toFixed(config.digits)
      });
    });

    return data;
  }, [orderBook, config.digits]);

  // Spread and Volume Calculations
  const bestBid = orderBook.bids[0]?.price || currentMidPrice;
  const bestAsk = orderBook.asks[0]?.price || currentMidPrice;
  const spreadValue = Math.max(0, Math.round((bestAsk - bestBid) * Math.pow(10, config.digits)) / Math.pow(10, config.digits));
  const spreadPips = (spreadValue * (symbol === 'USDJPY' ? 100 : symbol === 'XAUUSD' ? 10 : symbol === 'BTCUSD' ? 1 : 10000)).toFixed(1);

  const totalBidVolume = orderBook.bids[orderBook.bids.length - 1]?.totalVolume || 0;
  const totalAskVolume = orderBook.asks[orderBook.asks.length - 1]?.totalVolume || 0;
  const totalLiquidity = totalBidVolume + totalAskVolume;
  const bidRatio = totalLiquidity > 0 ? Math.round((totalBidVolume / totalLiquidity) * 100) : 50;
  const askRatio = 100 - bidRatio;

  // Find Institutional Liquidity Walls (highest single volume level on bids and asks)
  const highestBidWall = useMemo(() => {
    return [...orderBook.bids].sort((a, b) => b.volume - a.volume)[0];
  }, [orderBook.bids]);

  const highestAskWall = useMemo(() => {
    return [...orderBook.asks].sort((a, b) => b.volume - a.volume)[0];
  }, [orderBook.asks]);

  // Max volume level for bar fill percentage calculations
  const maxSingleVolume = useMemo(() => {
    const allVols = [...orderBook.bids.map(b => b.volume), ...orderBook.asks.map(a => a.volume)];
    return Math.max(...allVols, 1);
  }, [orderBook]);

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 font-sans text-slate-100 shadow-xl border border-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-teal-950 border border-teal-700/60 text-teal-400 status-glow">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Profondeur de Marché & Carnet d'Ordres (Level 2 Order Book)</span>
              <span className="px-2 py-0.2 bg-teal-950 text-teal-300 border border-teal-700 text-[9px] rounded-full font-mono">
                LMAX / Saxo Feed
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Analyse visuelle des zones de liquidité, du Spread Bid/Ask et des murs d'ordres institutionnels
            </p>
          </div>
        </div>

        {/* Ticker & Controls */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {/* Symbol Switcher */}
          <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800 overflow-x-auto">
            {(Object.keys(SYMBOL_CONFIGS) as DepthSymbol[]).map(sym => (
              <button
                key={sym}
                onClick={() => setSymbol(sym)}
                className={`px-2.5 py-1 rounded-lg font-bold text-[10px] transition-all ${
                  symbol === sym
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          {/* Pause / Live Stream Ticker */}
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 text-[10px] font-bold transition-all ${
              isStreaming
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
            title="Activer/désactiver la simulation de flux L2 en direct"
          >
            <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
            <span className="hidden sm:inline">{isStreaming ? 'STREAM L2' : 'PAUSE'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Board */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
        
        {/* KPI 1: Spread */}
        <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Spread Actuel</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-300 tracking-tight">
              {spreadPips}
            </span>
            <span className="text-xs text-slate-400">pips</span>
          </div>
          <div className="text-[9px] text-slate-500 truncate">
            Écart: {spreadValue} ({bestBid.toFixed(config.digits)} / {bestAsk.toFixed(config.digits)})
          </div>
        </div>

        {/* KPI 2: Bid/Ask Order Flow Ratio */}
        <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Déséquilibre Pression</span>
            <Activity className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-black tracking-tight ${
              bidRatio > 55 ? 'text-emerald-400' : bidRatio < 45 ? 'text-rose-400' : 'text-slate-300'
            }`}>
              {bidRatio}% / {askRatio}%
            </span>
          </div>
          <div className="text-[9px] text-slate-500 truncate">
            {bidRatio > 55 ? '🟢 Pression Acheteuse (Bids Dominants)' : bidRatio < 45 ? '🔴 Pression Vendeuse (Asks Dominants)' : '⚪ Équilibre Acheteurs/Vendeurs'}
          </div>
        </div>

        {/* KPI 3: Key Support Liquidity Wall */}
        <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Mur de Support (Bids)</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-black text-emerald-300 tracking-tight">
              {highestBidWall?.price.toFixed(config.digits)}
            </span>
            <span className="text-xs text-emerald-400 font-bold">
              ({highestBidWall?.volume} {config.lotUnit})
            </span>
          </div>
          <div className="text-[9px] text-slate-500 truncate">
            Forte concentration d'ordres d'achat
          </div>
        </div>

        {/* KPI 4: Key Resistance Liquidity Wall */}
        <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Mur de Résistance (Asks)</span>
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-black text-rose-300 tracking-tight">
              {highestAskWall?.price.toFixed(config.digits)}
            </span>
            <span className="text-xs text-rose-400 font-bold">
              ({highestAskWall?.volume} {config.lotUnit})
            </span>
          </div>
          <div className="text-[9px] text-slate-500 truncate">
            Forte concentration d'ordres de vente
          </div>
        </div>

      </div>

      {/* Main Recharts Depth Curve Chart */}
      <div className="bg-slate-950/90 rounded-2xl border border-slate-800/80 p-3 pt-4 space-y-2">
        
        <div className="flex items-center justify-between text-xs font-mono px-1">
          <span className="text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-teal-400" />
            <span>Courbe de Profondeur Cumulée Bid (Achat) vs Ask (Vente)</span>
          </span>
          
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
              <span>Bids Cumulés ({totalBidVolume.toFixed(1)} {config.lotUnit})</span>
            </span>
            <span className="flex items-center gap-1 text-rose-400 font-bold">
              <span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block" />
              <span>Asks Cumulés ({totalAskVolume.toFixed(1)} {config.lotUnit})</span>
            </span>
          </div>
        </div>

        {/* Recharts Area Chart Area */}
        <div className="w-full h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="bidDepthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="askDepthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis 
                dataKey="priceFormatted" 
                stroke="#64748b" 
                fontSize={9} 
                tickLine={false} 
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={9} 
                tickLine={false} 
                domain={[0, 'auto']}
              />
              <Tooltip content={<CustomDepthTooltip lotUnit={config.lotUnit} />} />
              
              {/* Bids Depth Curve */}
              <Area
                type="stepAfter"
                dataKey="bidDepth"
                name="Bids (Acheteurs)"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#bidDepthGradient)"
              />

              {/* Asks Depth Curve */}
              <Area
                type="stepBefore"
                dataKey="askDepth"
                name="Asks (Vendeurs)"
                stroke="#f43f5e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#askDepthGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Order Imbalance Visual Progress Bar */}
        <div className="space-y-1 font-mono text-[10px] pt-1">
          <div className="flex justify-between text-slate-400">
            <span>Pression Acheteuse: <strong className="text-emerald-400">{bidRatio}%</strong></span>
            <span>Pression Vendeuse: <strong className="text-rose-400">{askRatio}%</strong></span>
          </div>
          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${bidRatio}%` }} />
            <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${askRatio}%` }} />
          </div>
        </div>

      </div>

      {/* Side-by-Side Level 2 Order Book Ladder Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
        
        {/* BIDS LADDER (Buyers) */}
        <div className="bg-slate-950/90 rounded-2xl border border-slate-800 p-3 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-emerald-400">
            <span className="font-bold flex items-center gap-1.5 text-xs">
              <TrendingUp className="w-4 h-4" />
              <span>CARNET ACHETEUR (BIDS / SUPPORTS)</span>
            </span>
            <span className="text-[10px] text-slate-400">Prix Bid / Volume / Cumul</span>
          </div>

          <div className="space-y-1">
            {orderBook.bids.map((bid, idx) => {
              const fillPct = Math.min(100, (bid.volume / maxSingleVolume) * 100);
              const isHighestWall = bid.price === highestBidWall.price;

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedLiquidityWall(bid)}
                  className={`relative overflow-hidden p-2 rounded-xl border flex items-center justify-between text-[11px] cursor-pointer transition-all ${
                    isHighestWall
                      ? 'bg-emerald-950/80 border-emerald-500/80 ring-1 ring-emerald-500'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-emerald-800'
                  }`}
                >
                  {/* Background Fill Depth Bar */}
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-emerald-500/15 pointer-events-none transition-all"
                    style={{ width: `${fillPct}%` }}
                  />

                  <div className="relative z-10 flex items-center gap-2">
                    <span className="font-bold text-emerald-400">{bid.price.toFixed(config.digits)}</span>
                    {isHighestWall && (
                      <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 text-[8px] rounded border border-emerald-700 font-bold">
                        WALL
                      </span>
                    )}
                  </div>

                  <div className="relative z-10 flex items-center gap-3">
                    <span className="font-bold text-white">{bid.volume} {config.lotUnit}</span>
                    <span className="text-[10px] text-slate-400 w-12 text-right">
                      {bid.totalVolume}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ASKS LADDER (Sellers) */}
        <div className="bg-slate-950/90 rounded-2xl border border-slate-800 p-3 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-rose-400">
            <span className="font-bold flex items-center gap-1.5 text-xs">
              <TrendingDown className="w-4 h-4" />
              <span>CARNET VENDEUR (ASKS / RÉSISTANCES)</span>
            </span>
            <span className="text-[10px] text-slate-400">Prix Ask / Volume / Cumul</span>
          </div>

          <div className="space-y-1">
            {orderBook.asks.map((ask, idx) => {
              const fillPct = Math.min(100, (ask.volume / maxSingleVolume) * 100);
              const isHighestWall = ask.price === highestAskWall.price;

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedLiquidityWall(ask)}
                  className={`relative overflow-hidden p-2 rounded-xl border flex items-center justify-between text-[11px] cursor-pointer transition-all ${
                    isHighestWall
                      ? 'bg-rose-950/80 border-rose-500/80 ring-1 ring-rose-500'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-rose-800'
                  }`}
                >
                  {/* Background Fill Depth Bar */}
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-rose-500/15 pointer-events-none transition-all"
                    style={{ width: `${fillPct}%` }}
                  />

                  <div className="relative z-10 flex items-center gap-2">
                    <span className="font-bold text-rose-400">{ask.price.toFixed(config.digits)}</span>
                    {isHighestWall && (
                      <span className="px-1.5 py-0.2 bg-rose-950 text-rose-300 text-[8px] rounded border border-rose-700 font-bold">
                        WALL
                      </span>
                    )}
                  </div>

                  <div className="relative z-10 flex items-center gap-3">
                    <span className="font-bold text-white">{ask.volume} {config.lotUnit}</span>
                    <span className="text-[10px] text-slate-400 w-12 text-right">
                      {ask.totalVolume}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Selected Liquidity Wall Inspector Footer */}
      {selectedLiquidityWall && (
        <div className="bg-slate-950/90 border border-teal-600/80 rounded-xl p-3 font-mono text-xs space-y-1 animate-in fade-in">
          <div className="flex items-center justify-between text-teal-300 font-bold">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Inspection de la Zone de Liquidité : Prix {selectedLiquidityWall.price.toFixed(config.digits)}</span>
            </span>
            <button
              onClick={() => setSelectedLiquidityWall(null)}
              className="text-slate-400 hover:text-white text-[10px]"
            >
              Fermer
            </button>
          </div>
          <div className="text-[11px] text-slate-300">
            Ordres accumulés: <strong>{selectedLiquidityWall.volume} {config.lotUnit}</strong> sur <strong>{selectedLiquidityWall.ordersCount} ordres institutionnels</strong>.
            Cette zone agit comme une barrière de prix où les algorithmes haute fréquence risquent de provoquer un rejet ou un breakout fort.
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] font-mono text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-teal-400" />
          <span>Profondeur L2 synchronisée via FIX Protocol Engine (Latence &lt; 5ms)</span>
        </div>
        <div className="text-slate-500">
          Actif sélectionné : {symbol}
        </div>
      </div>

    </div>
  );
};

// Helper: Generate realistic Order Book data
function generateOrderBookData(midPrice: number, step: number, levelsCount: number, digits: number) {
  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];

  let cumBidVolume = 0;
  for (let i = 1; i <= levelsCount; i++) {
    const price = Math.round((midPrice - i * step) * Math.pow(10, digits)) / Math.pow(10, digits);
    // Exponential or bell-curve style volume distribution
    const isSpike = i === 3 || i === 7;
    const baseVol = isSpike ? (Math.random() * 25 + 20) : (Math.random() * 8 + 3);
    const volume = Math.round(baseVol * 10) / 10;
    cumBidVolume += volume;

    bids.push({
      price,
      volume,
      totalVolume: Math.round(cumBidVolume * 10) / 10,
      ordersCount: Math.floor(volume * 1.5) + 1
    });
  }

  let cumAskVolume = 0;
  for (let i = 1; i <= levelsCount; i++) {
    const price = Math.round((midPrice + i * step) * Math.pow(10, digits)) / Math.pow(10, digits);
    const isSpike = i === 4 || i === 8;
    const baseVol = isSpike ? (Math.random() * 25 + 20) : (Math.random() * 8 + 3);
    const volume = Math.round(baseVol * 10) / 10;
    cumAskVolume += volume;

    asks.push({
      price,
      volume,
      totalVolume: Math.round(cumAskVolume * 10) / 10,
      ordersCount: Math.floor(volume * 1.5) + 1
    });
  }

  return { bids, asks };
}

// Custom Recharts Tooltip for Depth Curve
const CustomDepthTooltip = ({ active, payload, lotUnit }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as DepthDataPoint;
    const isBid = data.bidDepth !== undefined;

    return (
      <div className="bg-slate-900/95 border border-teal-500/80 p-2.5 rounded-xl shadow-2xl font-mono text-xs text-slate-100 space-y-1 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-1 text-[10px] text-slate-400">
          <span>Niveau de Prix:</span>
          <span className="font-bold text-white">{data.priceFormatted}</span>
        </div>

        <div className="space-y-0.5 text-[10px] pt-1">
          {isBid ? (
            <>
              <div className="flex justify-between gap-4 text-emerald-300">
                <span>Volume Niveau Bid:</span>
                <span className="font-bold">{data.bidVolume} {lotUnit}</span>
              </div>
              <div className="flex justify-between gap-4 text-emerald-400 font-bold">
                <span>Profondeur Cumulée Achat:</span>
                <span>{data.bidDepth} {lotUnit}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between gap-4 text-rose-300">
                <span>Volume Niveau Ask:</span>
                <span className="font-bold">{data.askVolume} {lotUnit}</span>
              </div>
              <div className="flex justify-between gap-4 text-rose-400 font-bold">
                <span>Profondeur Cumulée Vente:</span>
                <span>{data.askDepth} {lotUnit}</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  return null;
};
