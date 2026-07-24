import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Wifi, WifiOff, BarChart2, AlertCircle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SymbolRow {
  symbol: string;
  signal: {
    direction: 'BUY' | 'SELL' | 'WAIT';
    confidence: number;
    source: string;
    sl_pips?: number;
    tp_pips?: number;
  };
  openPositions: number;
  unrealizedPnL: number;
}

interface MultiSymbolPanelProps {
  symbols?: Record<string, {
    direction: 'BUY' | 'SELL' | 'WAIT';
    confidence: number;
    source?: string;
    sl_pips?: number;
    tp_pips?: number;
  }>;
  positions?: {
    ticket: number;
    symbol: string;
    type: string;
    volume: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
    sl?: number;
    tp?: number;
  }[];
  isConnected: boolean;
  localBridgeIp?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const MultiSymbolPanel: React.FC<MultiSymbolPanelProps> = ({
  symbols = {},
  positions = [],
  isConnected,
  localBridgeIp,
}) => {
  const [symbolRows, setSymbolRows] = useState<SymbolRow[]>([]);

  // Construire les lignes à partir des données WebSocket
  useEffect(() => {
    const rows: SymbolRow[] = Object.entries(symbols).map(([symbol, signal]) => {
      const openPositions = positions.filter(p => p.symbol === symbol);
      const pnl = openPositions.reduce((sum, p) => sum + p.profit, 0);

      return {
        symbol,
        signal: {
          direction:  signal.direction,
          confidence: signal.confidence,
          source:     signal.source || '—',
          sl_pips:    signal.sl_pips,
          tp_pips:    signal.tp_pips,
        },
        openPositions: openPositions.length,
        unrealizedPnL: pnl,
      };
    });

    // Si pas de données WS, essayer de fetch via HTTP
    if (rows.length === 0 && isConnected && localBridgeIp) {
      let ip = localBridgeIp;
      if (!ip.startsWith('http://') && !ip.startsWith('https://')) ip = 'http://' + ip;
      fetch(`${ip}/symbols`)
        .then(r => r.json())
        .then((data: any[]) => {
          setSymbolRows(data.map(d => ({
            symbol:        d.symbol,
            signal:        d.signal,
            openPositions: d.openPositions,
            unrealizedPnL: d.unrealizedPnL,
          })));
        })
        .catch(() => {});
      return;
    }

    setSymbolRows(rows);
  }, [symbols, positions, isConnected, localBridgeIp]);

  const getDirectionIcon = (dir: string) => {
    if (dir === 'BUY')  return <TrendingUp  className="w-3 h-3" />;
    if (dir === 'SELL') return <TrendingDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const getDirectionClass = (dir: string) => {
    if (dir === 'BUY')  return 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60';
    if (dir === 'SELL') return 'text-red-400 bg-red-950/60 border-red-800/60';
    return 'text-slate-400 bg-slate-900/60 border-slate-700/60';
  };

  const getConfidenceBar = (confidence: number) => {
    const pct = Math.round(confidence * 100);
    const color = pct >= 80 ? 'bg-emerald-500' : pct >= 65 ? 'bg-amber-500' : 'bg-slate-600';
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-14 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[9px] text-slate-400 font-mono">{pct}%</span>
      </div>
    );
  };

  if (symbolRows.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-200 uppercase tracking-wide text-xs">
          <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Signaux Multi-Symboles</span>
          <div className={`ml-auto flex items-center gap-1 text-[10px] ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isConnected ? 'Live' : 'Hors ligne'}</span>
          </div>
        </div>
        <div className="text-center py-4 text-[11px] text-slate-500 font-mono">
          {isConnected
            ? 'En attente de données multi-symbole...'
            : 'Connectez le bridge Python pour voir les signaux'
          }
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-3.5 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-slate-200 uppercase tracking-wide text-xs">
          <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Signaux Multi-Symboles</span>
          <span className="text-[10px] text-slate-500 normal-case font-normal tracking-normal">
            ({symbolRows.length} paires)
          </span>
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-mono ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
          {isConnected
            ? <><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block" /> WS Live</>
            : <><AlertCircle className="w-3 h-3" /> Polling</>
          }
        </div>
      </div>

      {/* Table */}
      <div className="space-y-1.5">
        {/* Column headers */}
        <div className="grid grid-cols-5 text-[9px] text-slate-500 font-mono uppercase tracking-wide px-2">
          <span>Paire</span>
          <span>Signal</span>
          <span>Confiance</span>
          <span className="text-center">Positions</span>
          <span className="text-right">P&L</span>
        </div>

        {/* Rows */}
        {symbolRows.map((row) => (
          <div
            key={row.symbol}
            className="grid grid-cols-5 items-center bg-slate-950/50 rounded-xl px-2 py-2 border border-slate-800/60 hover:border-slate-700/80 transition-all"
          >
            {/* Symbol */}
            <span className="font-mono font-bold text-[11px] text-white">{row.symbol}</span>

            {/* Signal */}
            <div className={`flex items-center gap-1 text-[10px] font-bold border rounded px-1.5 py-0.5 w-fit ${getDirectionClass(row.signal.direction)}`}>
              {getDirectionIcon(row.signal.direction)}
              <span>{row.signal.direction}</span>
            </div>

            {/* Confidence bar */}
            <div>
              {row.signal.direction !== 'WAIT'
                ? getConfidenceBar(row.signal.confidence)
                : <span className="text-[9px] text-slate-600 font-mono">—</span>
              }
            </div>

            {/* Open positions */}
            <div className="text-center">
              {row.openPositions > 0
                ? (
                  <span className="text-[10px] font-bold text-indigo-400 font-mono bg-indigo-950/60 border border-indigo-800/40 rounded px-1.5 py-0.5">
                    {row.openPositions}
                  </span>
                )
                : <span className="text-[10px] text-slate-600">—</span>
              }
            </div>

            {/* PnL */}
            <div className={`text-right font-mono text-[11px] font-bold ${
              row.unrealizedPnL > 0 ? 'text-emerald-400'
              : row.unrealizedPnL < 0 ? 'text-red-400'
              : 'text-slate-500'
            }`}>
              {row.openPositions > 0
                ? `${row.unrealizedPnL >= 0 ? '+' : ''}$${row.unrealizedPnL.toFixed(2)}`
                : '—'
              }
            </div>
          </div>
        ))}
      </div>

      {/* ATR SL/TP info (si disponible) */}
      {symbolRows.some(r => r.signal.sl_pips) && (
        <div className="text-[9px] text-slate-500 font-mono text-center pt-1 border-t border-slate-800/60">
          SL/TP calculés via ATR × multiplicateurs configurés
        </div>
      )}
    </div>
  );
};
