import React, { useState, useMemo } from 'react';
import { ActivePosition } from '../types';
import { 
  Grid, ShieldAlert, AlertTriangle, CheckCircle2, Info, Layers, RefreshCw, BarChart2, 
  TrendingUp, TrendingDown, Eye, Filter, Sparkles, Layers3, Activity, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

interface MarketCorrelationHeatmapProps {
  positions: ActivePosition[];
}

export type SymbolPair = 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'XAUUSD' | 'BTCUSD' | 'US500' | 'AUDUSD' | 'USDCAD';

const SYMBOLS: SymbolPair[] = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'US500', 'AUDUSD', 'USDCAD'];

// Timeframe correlation matrices
const CORRELATION_DATA: Record<'1H' | '1D' | '1W', Record<SymbolPair, Record<SymbolPair, number>>> = {
  '1D': {
    EURUSD: { EURUSD: 1.00, GBPUSD: 0.88, USDJPY: -0.76, XAUUSD: 0.45, BTCUSD: 0.22, US500: 0.35, AUDUSD: 0.81, USDCAD: -0.72 },
    GBPUSD: { EURUSD: 0.88, GBPUSD: 1.00, USDJPY: -0.68, XAUUSD: 0.38, BTCUSD: 0.18, US500: 0.42, AUDUSD: 0.78, USDCAD: -0.65 },
    USDJPY: { EURUSD: -0.76, GBPUSD: -0.68, USDJPY: 1.00, XAUUSD: -0.52, BTCUSD: -0.15, US500: -0.28, AUDUSD: -0.62, USDCAD: 0.58 },
    XAUUSD: { EURUSD: 0.45, GBPUSD: 0.38, USDJPY: -0.52, XAUUSD: 1.00, BTCUSD: 0.35, US500: 0.18, AUDUSD: 0.52, USDCAD: -0.48 },
    BTCUSD: { EURUSD: 0.22, GBPUSD: 0.18, USDJPY: -0.15, XAUUSD: 0.35, BTCUSD: 1.00, US500: 0.55, AUDUSD: 0.28, USDCAD: -0.19 },
    US500:  { EURUSD: 0.35, GBPUSD: 0.42, USDJPY: -0.28, XAUUSD: 0.18, BTCUSD: 0.55, US500: 1.00, AUDUSD: 0.48, USDCAD: -0.38 },
    AUDUSD: { EURUSD: 0.81, GBPUSD: 0.78, USDJPY: -0.62, XAUUSD: 0.52, BTCUSD: 0.28, US500: 0.48, AUDUSD: 1.00, USDCAD: -0.80 },
    USDCAD: { EURUSD: -0.72, GBPUSD: -0.65, USDJPY: 0.58, XAUUSD: -0.48, BTCUSD: -0.19, US500: -0.38, AUDUSD: -0.80, USDCAD: 1.00 },
  },
  '1H': {
    EURUSD: { EURUSD: 1.00, GBPUSD: 0.92, USDJPY: -0.82, XAUUSD: 0.58, BTCUSD: 0.30, US500: 0.41, AUDUSD: 0.86, USDCAD: -0.78 },
    GBPUSD: { EURUSD: 0.92, GBPUSD: 1.00, USDJPY: -0.74, XAUUSD: 0.48, BTCUSD: 0.25, US500: 0.48, AUDUSD: 0.82, USDCAD: -0.71 },
    USDJPY: { EURUSD: -0.82, GBPUSD: -0.74, USDJPY: 1.00, XAUUSD: -0.60, BTCUSD: -0.20, US500: -0.35, AUDUSD: -0.68, USDCAD: 0.64 },
    XAUUSD: { EURUSD: 0.58, GBPUSD: 0.48, USDJPY: -0.60, XAUUSD: 1.00, BTCUSD: 0.42, US500: 0.22, AUDUSD: 0.58, USDCAD: -0.54 },
    BTCUSD: { EURUSD: 0.30, GBPUSD: 0.25, USDJPY: -0.20, XAUUSD: 0.42, BTCUSD: 1.00, US500: 0.62, AUDUSD: 0.34, USDCAD: -0.24 },
    US500:  { EURUSD: 0.41, GBPUSD: 0.48, USDJPY: -0.35, XAUUSD: 0.22, BTCUSD: 0.62, US500: 1.00, AUDUSD: 0.52, USDCAD: -0.42 },
    AUDUSD: { EURUSD: 0.86, GBPUSD: 0.82, USDJPY: -0.68, XAUUSD: 0.58, BTCUSD: 0.34, US500: 0.52, AUDUSD: 1.00, USDCAD: -0.85 },
    USDCAD: { EURUSD: -0.78, GBPUSD: -0.71, USDJPY: 0.64, XAUUSD: -0.54, BTCUSD: -0.24, US500: -0.42, AUDUSD: -0.85, USDCAD: 1.00 },
  },
  '1W': {
    EURUSD: { EURUSD: 1.00, GBPUSD: 0.82, USDJPY: -0.65, XAUUSD: 0.32, BTCUSD: 0.12, US500: 0.28, AUDUSD: 0.74, USDCAD: -0.62 },
    GBPUSD: { EURUSD: 0.82, GBPUSD: 1.00, USDJPY: -0.58, XAUUSD: 0.28, BTCUSD: 0.10, US500: 0.32, AUDUSD: 0.70, USDCAD: -0.58 },
    USDJPY: { EURUSD: -0.65, GBPUSD: -0.58, USDJPY: 1.00, XAUUSD: -0.40, BTCUSD: -0.08, US500: -0.20, AUDUSD: -0.52, USDCAD: 0.48 },
    XAUUSD: { EURUSD: 0.32, GBPUSD: 0.28, USDJPY: -0.40, XAUUSD: 1.00, BTCUSD: 0.25, US500: 0.12, AUDUSD: 0.42, USDCAD: -0.38 },
    BTCUSD: { EURUSD: 0.12, GBPUSD: 0.10, USDJPY: -0.08, XAUUSD: 0.25, BTCUSD: 1.00, US500: 0.45, AUDUSD: 0.20, USDCAD: -0.12 },
    US500:  { EURUSD: 0.28, GBPUSD: 0.32, USDJPY: -0.20, XAUUSD: 0.12, BTCUSD: 0.45, US500: 1.00, AUDUSD: 0.40, USDCAD: -0.30 },
    AUDUSD: { EURUSD: 0.74, GBPUSD: 0.70, USDJPY: -0.52, XAUUSD: 0.42, BTCUSD: 0.20, US500: 0.40, AUDUSD: 1.00, USDCAD: -0.72 },
    USDCAD: { EURUSD: -0.62, GBPUSD: -0.58, USDJPY: 0.48, XAUUSD: -0.38, BTCUSD: -0.12, US500: -0.30, AUDUSD: -0.72, USDCAD: 1.00 },
  }
};

// Currency block definitions for exposure aggregation
const CURRENCY_BLOCKS = [
  { id: 'USD', name: 'Bloc Dollar US (USD)', symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'US500', 'AUDUSD', 'USDCAD'] },
  { id: 'EUR', name: 'Bloc Euro (EUR)', symbols: ['EURUSD'] },
  { id: 'GBP', name: 'Bloc Livre Sterling (GBP)', symbols: ['GBPUSD'] },
  { id: 'COMMODITIES', name: 'Matières Premières / Or (XAU)', symbols: ['XAUUSD', 'AUDUSD', 'USDCAD'] },
  { id: 'CRYPTO_EQUITY', name: 'Risque / Cryptos & Indices', symbols: ['BTCUSD', 'US500'] }
];

export const MarketCorrelationHeatmap: React.FC<MarketCorrelationHeatmapProps> = ({ positions }) => {
  const [timeframe, setTimeframe] = useState<'1H' | '1D' | '1W'>('1D');
  const [selectedBlock, setSelectedBlock] = useState<string>('ALL');
  const [hoveredCell, setHoveredCell] = useState<{ row: SymbolPair; col: SymbolPair } | null>(null);
  const [selectedPair, setSelectedPair] = useState<{ sym1: SymbolPair; sym2: SymbolPair } | null>({
    sym1: 'EURUSD',
    sym2: 'GBPUSD'
  });

  const matrix = CORRELATION_DATA[timeframe];

  // Active open position symbols set
  const activeSymbols = useMemo(() => {
    return Array.from(new Set(positions.map(p => p.symbol as SymbolPair)));
  }, [positions]);

  // Active symbols filter based on block selection
  const visibleSymbols = useMemo(() => {
    if (selectedBlock === 'ALL') return SYMBOLS;
    const block = CURRENCY_BLOCKS.find(b => b.id === selectedBlock);
    return block ? SYMBOLS.filter(s => block.symbols.includes(s)) : SYMBOLS;
  }, [selectedBlock]);

  // Calculate Net Exposure per Currency Block from open positions
  const blockExposures = useMemo(() => {
    const exposures: Record<string, { lotsLong: number; lotsShort: number; netLots: number; count: number }> = {
      USD: { lotsLong: 0, lotsShort: 0, netLots: 0, count: 0 },
      EUR: { lotsLong: 0, lotsShort: 0, netLots: 0, count: 0 },
      GBP: { lotsLong: 0, lotsShort: 0, netLots: 0, count: 0 },
      XAU: { lotsLong: 0, lotsShort: 0, netLots: 0, count: 0 },
      JPY: { lotsLong: 0, lotsShort: 0, netLots: 0, count: 0 }
    };

    positions.forEach(p => {
      const isLong = p.type === 'BUY';
      const lots = p.lots || 0.1;

      if (p.symbol === 'EURUSD') {
        // Long EURUSD = Long EUR, Short USD
        if (isLong) {
          exposures.EUR.lotsLong += lots;
          exposures.USD.lotsShort += lots;
        } else {
          exposures.EUR.lotsShort += lots;
          exposures.USD.lotsLong += lots;
        }
        exposures.EUR.count++;
        exposures.USD.count++;
      } else if (p.symbol === 'GBPUSD') {
        if (isLong) {
          exposures.GBP.lotsLong += lots;
          exposures.USD.lotsShort += lots;
        } else {
          exposures.GBP.lotsShort += lots;
          exposures.USD.lotsLong += lots;
        }
        exposures.GBP.count++;
        exposures.USD.count++;
      } else if (p.symbol === 'USDJPY') {
        // Long USDJPY = Long USD, Short JPY
        if (isLong) {
          exposures.USD.lotsLong += lots;
          exposures.JPY.lotsShort += lots;
        } else {
          exposures.USD.lotsShort += lots;
          exposures.JPY.lotsLong += lots;
        }
        exposures.USD.count++;
        exposures.JPY.count++;
      } else if (p.symbol === 'XAUUSD') {
        if (isLong) {
          exposures.XAU.lotsLong += lots;
          exposures.USD.lotsShort += lots;
        } else {
          exposures.XAU.lotsShort += lots;
          exposures.USD.lotsLong += lots;
        }
        exposures.XAU.count++;
        exposures.USD.count++;
      }
    });

    Object.keys(exposures).forEach(k => {
      const exp = exposures[k];
      exp.netLots = Math.round((exp.lotsLong - exp.lotsShort) * 100) / 100;
      exp.lotsLong = Math.round(exp.lotsLong * 100) / 100;
      exp.lotsShort = Math.round(exp.lotsShort * 100) / 100;
    });

    return exposures;
  }, [positions]);

  // Detect portfolio overexposure risks
  const overexposureAlerts = useMemo(() => {
    const alerts: { sym1: SymbolPair; sym2: SymbolPair; coef: number; type: 'HIGH_POSITIVE' | 'HIGH_NEGATIVE'; msg: string }[] = [];

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const p1 = positions[i];
        const p2 = positions[j];
        const s1 = p1.symbol as SymbolPair;
        const s2 = p2.symbol as SymbolPair;

        if (s1 && s2 && matrix[s1] && matrix[s1][s2] !== undefined) {
          const coef = matrix[s1][s2];

          // High positive correlation (>0.75) and same direction
          if (coef >= 0.75 && p1.type === p2.type) {
            alerts.push({
              sym1: s1,
              sym2: s2,
              coef,
              type: 'HIGH_POSITIVE',
              msg: `Double-exposition directionnelle: Position ${p1.type} sur ${s1} et ${s2} (Corrélation: +${(coef * 100).toFixed(0)}%). Risque de perte cumulée double.`
            });
          }
          // High negative correlation (<-0.70) and same direction = position cancellation / hedge conflict
          else if (coef <= -0.70 && p1.type === p2.type) {
            alerts.push({
              sym1: s1,
              sym2: s2,
              coef,
              type: 'HIGH_NEGATIVE',
              msg: `Conflit de Hedging: Position ${p1.type} sur ${s1} et ${s2} (Corrélation inverse: ${(coef * 100).toFixed(0)}%). Les gains de l'un neutralisent les pertes de l'autre.`
            });
          }
        }
      }
    }

    return alerts;
  }, [positions, matrix]);

  // Get Heatmap Color Intensity Class
  const getHeatmapColor = (value: number, isSelf: boolean) => {
    if (isSelf) return 'bg-slate-900/90 text-slate-500 font-bold border border-slate-800';

    if (value >= 0.80) {
      return 'bg-emerald-950/90 text-emerald-300 font-extrabold border border-emerald-600/80 shadow-inner hover:bg-emerald-900';
    } else if (value >= 0.60) {
      return 'bg-emerald-950/50 text-emerald-400 font-bold border border-emerald-800/60 hover:bg-emerald-900/60';
    } else if (value >= 0.30) {
      return 'bg-emerald-950/20 text-emerald-300 font-medium hover:bg-emerald-950/40';
    } else if (value <= -0.80) {
      return 'bg-rose-950/90 text-rose-300 font-extrabold border border-rose-600/80 shadow-inner hover:bg-rose-900';
    } else if (value <= -0.60) {
      return 'bg-rose-950/50 text-rose-400 font-bold border border-rose-800/60 hover:bg-rose-900/60';
    } else if (value <= -0.30) {
      return 'bg-rose-950/20 text-rose-300 font-medium hover:bg-rose-950/40';
    }

    return 'bg-slate-950/60 text-slate-400 border border-slate-800/40 hover:bg-slate-900/80';
  };

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 font-sans text-slate-100 shadow-xl border border-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-950 border border-indigo-700/60 text-indigo-400 status-glow">
            <Grid className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Heatmap de Corrélation des Marchés (Market Matrix)</span>
              <span className="px-2 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-700 text-[9px] rounded-full font-mono">
                Analyse Inter-Devises
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Visualisez l'interdépendance des paires de devises & métaux pour identifier la sur-exposition aux blocs monétaires
            </p>
          </div>
        </div>

        {/* Timeframe Controls */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            {(['1H', '1D', '1W'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded-lg font-bold text-[10px] transition-all ${
                  timeframe === tf
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Over-Exposure Alert Banners if detected */}
      {overexposureAlerts.length > 0 ? (
        <div className="space-y-2 font-mono text-xs">
          {overexposureAlerts.map((alert, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                alert.type === 'HIGH_POSITIVE'
                  ? 'bg-amber-950/80 border-amber-600 text-amber-200 shadow-md'
                  : 'bg-indigo-950/80 border-indigo-600 text-indigo-200 shadow-md'
              }`}
            >
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400 animate-pulse" />
              <div className="space-y-0.5">
                <div className="font-bold text-white flex items-center gap-2">
                  <span>DÉTECTION DE SUR-EXPOSITION : {alert.sym1} ↔ {alert.sym2}</span>
                  <span className="px-1.5 py-0.2 bg-slate-900 border border-slate-700 text-amber-300 text-[9px] rounded font-mono">
                    Corrélation: {alert.coef > 0 ? '+' : ''}{(alert.coef * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="text-[11px] font-sans opacity-95">{alert.msg}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-2.5 flex items-center gap-2 text-xs font-mono text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Aucune sur-concentration de risque ni conflit de corrélation dans vos positions actives actuelles.</span>
        </div>
      )}

      {/* Currency Block Exposure Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs">
        {Object.entries(blockExposures).map(([block, exp]: [string, { lotsLong: number; lotsShort: number; netLots: number; count: number }]) => (
          <div key={block} className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1">
            <div className="text-[10px] text-slate-400 flex items-center justify-between">
              <span className="font-bold text-white">BLOC {block}</span>
              <span className="text-[9px] text-slate-500">{exp.count} pos.</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className={`text-sm font-black ${
                exp.netLots > 0 ? 'text-emerald-400' : exp.netLots < 0 ? 'text-rose-400' : 'text-slate-400'
              }`}>
                {exp.netLots > 0 ? `+${exp.netLots}` : exp.netLots} Lots
              </span>
              <span className="text-[9px] text-slate-500">
                L: {exp.lotsLong} | S: {exp.lotsShort}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 font-mono text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto text-[10px]">
          <span className="text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-indigo-400" />
            <span>Filtrer Bloc:</span>
          </span>
          <button
            onClick={() => setSelectedBlock('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              selectedBlock === 'ALL'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Tous les Actifs (8x8)
          </button>
          {CURRENCY_BLOCKS.map(block => (
            <button
              key={block.id}
              onClick={() => setSelectedBlock(block.id)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                selectedBlock === block.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {block.id}
            </button>
          ))}
        </div>

        <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Survolez/cliquez une cellule pour inspecter l'impact croisé.</span>
        </div>
      </div>

      {/* Heatmap Grid Matrix Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
        <table className="w-full text-center text-xs font-mono border-collapse select-none">
          <thead>
            <tr>
              <th className="p-2.5 text-left text-[10px] text-slate-400 font-bold bg-slate-900/90 border-b border-r border-slate-800 sticky left-0 z-10">
                Paire / Actif
              </th>
              {visibleSymbols.map(sym => {
                const isActive = activeSymbols.includes(sym);
                return (
                  <th
                    key={sym}
                    className={`p-2.5 text-[10px] font-extrabold border-b border-r border-slate-800 transition-colors ${
                      isActive
                        ? 'bg-indigo-950/80 text-indigo-300 border-b-2 border-b-indigo-500'
                        : 'bg-slate-900/90 text-slate-300'
                    }`}
                  >
                    <div>{sym}</div>
                    {isActive && (
                      <span className="inline-block px-1 rounded bg-emerald-950 text-emerald-400 text-[8px] font-bold border border-emerald-800">
                        OPEN
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {visibleSymbols.map(rowSym => {
              const isRowActive = activeSymbols.includes(rowSym);

              return (
                <tr key={rowSym} className="border-b border-slate-900 hover:bg-slate-900/40">
                  {/* Row Header */}
                  <td className={`p-2.5 text-left font-bold text-xs border-r border-slate-800 sticky left-0 z-10 transition-colors ${
                    isRowActive ? 'bg-indigo-950/60 text-indigo-300 font-black' : 'bg-slate-900/90 text-slate-200'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <span>{rowSym}</span>
                      {isRowActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                    </div>
                  </td>

                  {/* Matrix Cells */}
                  {visibleSymbols.map(colSym => {
                    const coef = matrix[rowSym][colSym];
                    const isSelf = rowSym === colSym;
                    const cellStyle = getHeatmapColor(coef, isSelf);

                    const isHovered = hoveredCell && (
                      (hoveredCell.row === rowSym && hoveredCell.col === colSym) ||
                      (hoveredCell.row === colSym && hoveredCell.col === rowSym)
                    );

                    return (
                      <td
                        key={colSym}
                        onMouseEnter={() => setHoveredCell({ row: rowSym, col: colSym })}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={() => !isSelf && setSelectedPair({ sym1: rowSym, sym2: colSym })}
                        className={`p-3 border-r border-slate-800/60 cursor-pointer transition-all duration-150 relative ${cellStyle} ${
                          isHovered ? 'ring-2 ring-indigo-400 z-20 scale-105 rounded-md shadow-2xl' : ''
                        }`}
                        title={isSelf ? 'Même actif' : `Corrélation ${rowSym} vs ${colSym}: ${(coef * 100).toFixed(0)}%`}
                      >
                        <span className="text-xs tracking-tight">
                          {isSelf ? '1.00' : `${coef > 0 ? '+' : ''}${coef.toFixed(2)}`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pair Inspector & Detail Card */}
      {selectedPair && (
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2 font-mono text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-indigo-400" />
              <span className="font-bold text-white text-sm">
                Fiche d'Analyse Croisée : {selectedPair.sym1} ↔ {selectedPair.sym2}
              </span>
            </div>

            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-slate-400">Période d'évaluation:</span>
              <span className="font-bold text-indigo-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {timeframe}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400">Coefficient de Corrélation</div>
              <div className={`text-lg font-black ${
                matrix[selectedPair.sym1][selectedPair.sym2] >= 0.70 ? 'text-emerald-400' :
                matrix[selectedPair.sym1][selectedPair.sym2] <= -0.70 ? 'text-rose-400' : 'text-slate-300'
              }`}>
                {matrix[selectedPair.sym1][selectedPair.sym2] > 0 ? '+' : ''}
                {matrix[selectedPair.sym1][selectedPair.sym2]}
                <span className="text-xs font-normal text-slate-400 ml-1">
                  ({(matrix[selectedPair.sym1][selectedPair.sym2] * 100).toFixed(0)}%)
                </span>
              </div>
            </div>

            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1 sm:col-span-2">
              <div className="text-[10px] text-slate-400">Recommandation de Gestion du Risque</div>
              <div className="text-[11px] font-sans text-slate-200">
                {matrix[selectedPair.sym1][selectedPair.sym2] >= 0.75 ? (
                  <span className="text-emerald-300 font-medium">
                    ⚡ <strong>Forte corrélation directe.</strong> Ouvrir simultanément une position ACHAT sur {selectedPair.sym1} et {selectedPair.sym2} double directement votre exposition au risque d'une même devise de base. Réduisez le lot de 50%.
                  </span>
                ) : matrix[selectedPair.sym1][selectedPair.sym2] <= -0.70 ? (
                  <span className="text-rose-300 font-medium">
                    🛡️ <strong>Forte corrélation inverse.</strong> Prendre une position dans la même direction neutralise vos gains (hedging passif). Prendre des directions opposées cumule le risque.
                  </span>
                ) : (
                  <span className="text-slate-300 font-medium">
                    ✅ <strong>Corrélation faible à modérée.</strong> Excellent couple pour la diversification de portefeuille sans sur-exposition systémique.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Heatmap Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-slate-400 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-slate-500">Légende d'intensité:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-950 border border-emerald-600" />
            <strong className="text-emerald-400">+0.80 à +1.00 (Forte Directe)</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-950/40 border border-emerald-800" />
            <span className="text-emerald-300">+0.30 à +0.79</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-slate-950 border border-slate-800" />
            <span className="text-slate-400">-0.29 à +0.29 (Neutre)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-950/40 border border-rose-800" />
            <span className="text-rose-300">-0.30 à -0.79</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-950 border border-rose-600" />
            <strong className="text-rose-400">-0.80 à -1.00 (Forte Inverse)</strong>
          </span>
        </div>

        <div className="text-slate-500">
          Calculé en temps réel sur flux MT5 Tick Data
        </div>
      </div>

    </div>
  );
};
