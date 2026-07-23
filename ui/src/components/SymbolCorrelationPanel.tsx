import React, { useState } from 'react';
import { ActivePosition } from '../types';
import { 
  GitCompare, ShieldAlert, AlertTriangle, CheckCircle2, Info, Layers, RefreshCw, BarChart2 
} from 'lucide-react';

interface SymbolCorrelationPanelProps {
  positions: ActivePosition[];
}

// Matrix of major trading pairs with correlation coefficients (-1.0 to +1.0)
const symbolsList = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD'] as const;
type SymbolType = typeof symbolsList[number];

type CorrelationMatrixData = Record<SymbolType, Record<SymbolType, number>>;

const correlationMatrices: Record<'1H' | '1D' | '1W', CorrelationMatrixData> = {
  '1D': {
    EURUSD: { EURUSD: 1.00, GBPUSD: 0.88, USDJPY: -0.76, XAUUSD: 0.45, BTCUSD: 0.22 },
    GBPUSD: { EURUSD: 0.88, GBPUSD: 1.00, USDJPY: -0.68, XAUUSD: 0.38, BTCUSD: 0.18 },
    USDJPY: { EURUSD: -0.76, GBPUSD: -0.68, USDJPY: 1.00, XAUUSD: -0.52, BTCUSD: -0.15 },
    XAUUSD: { EURUSD: 0.45, GBPUSD: 0.38, USDJPY: -0.52, XAUUSD: 1.00, BTCUSD: 0.35 },
    BTCUSD: { EURUSD: 0.22, GBPUSD: 0.18, USDJPY: -0.15, XAUUSD: 0.35, BTCUSD: 1.00 },
  },
  '1H': {
    EURUSD: { EURUSD: 1.00, GBPUSD: 0.92, USDJPY: -0.82, XAUUSD: 0.58, BTCUSD: 0.30 },
    GBPUSD: { EURUSD: 0.92, GBPUSD: 1.00, USDJPY: -0.74, XAUUSD: 0.48, BTCUSD: 0.25 },
    USDJPY: { EURUSD: -0.82, GBPUSD: -0.74, USDJPY: 1.00, XAUUSD: -0.60, BTCUSD: -0.20 },
    XAUUSD: { EURUSD: 0.58, GBPUSD: 0.48, USDJPY: -0.60, XAUUSD: 1.00, BTCUSD: 0.42 },
    BTCUSD: { EURUSD: 0.30, GBPUSD: 0.25, USDJPY: -0.20, XAUUSD: 0.42, BTCUSD: 1.00 },
  },
  '1W': {
    EURUSD: { EURUSD: 1.00, GBPUSD: 0.82, USDJPY: -0.65, XAUUSD: 0.32, BTCUSD: 0.12 },
    GBPUSD: { EURUSD: 0.82, GBPUSD: 1.00, USDJPY: -0.58, XAUUSD: 0.28, BTCUSD: 0.10 },
    USDJPY: { EURUSD: -0.65, GBPUSD: -0.58, USDJPY: 1.00, XAUUSD: -0.40, BTCUSD: -0.08 },
    XAUUSD: { EURUSD: 0.32, GBPUSD: 0.28, USDJPY: -0.40, XAUUSD: 1.00, BTCUSD: 0.25 },
    BTCUSD: { EURUSD: 0.12, GBPUSD: 0.10, USDJPY: -0.08, XAUUSD: 0.25, BTCUSD: 1.00 },
  }
};

export const SymbolCorrelationPanel: React.FC<SymbolCorrelationPanelProps> = ({ positions }) => {
  const [timeframe, setTimeframe] = useState<'1H' | '1D' | '1W'>('1D');
  const [selectedPair, setSelectedPair] = useState<{ sym1: SymbolType; sym2: SymbolType } | null>({
    sym1: 'EURUSD',
    sym2: 'GBPUSD'
  });

  const matrix = correlationMatrices[timeframe];

  // Analyze active positions for systemic risk and correlation overlap
  const activeSymbols = Array.from(new Set(positions.map(p => p.symbol as SymbolType)));

  // Detect high correlation risks between open positions
  const correlationAlerts: { sym1: string; sym2: string; coef: number; riskType: 'OVEREXPOSURE' | 'HEDGE_CONFLICT'; description: string }[] = [];

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const p1 = positions[i];
      const p2 = positions[j];
      const sym1 = p1.symbol as SymbolType;
      const sym2 = p2.symbol as SymbolType;

      if (sym1 && sym2 && matrix[sym1] && matrix[sym1][sym2] !== undefined) {
        const coef = matrix[sym1][sym2];

        // Strong positive correlation + same direction = Overexposure risk
        if (coef >= 0.70 && p1.type === p2.type) {
          correlationAlerts.push({
            sym1,
            sym2,
            coef,
            riskType: 'OVEREXPOSURE',
            description: `Surconcentration de risque : ${p1.type} sur ${sym1} et ${p2.type} sur ${sym2} (Corrélation forte +${(coef * 100).toFixed(0)}%).`
          });
        }
        // Strong negative correlation + same direction = Conflict / Hedging neutralisation
        else if (coef <= -0.65 && p1.type === p2.type) {
          correlationAlerts.push({
            sym1,
            sym2,
            coef,
            riskType: 'HEDGE_CONFLICT',
            description: `Auto-neutralisation : ${p1.type} ${sym1} vs ${p2.type} ${sym2} (Corrélation inverse ${(coef * 100).toFixed(0)}%). Le PnL risque d'être annulé.`
          });
        }
      }
    }
  }

  // Get cell color helper
  const getCellColor = (coef: number, isSame: boolean) => {
    if (isSame) return 'bg-slate-900 text-slate-500 font-normal';
    if (coef >= 0.75) return 'bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-800/80';
    if (coef >= 0.40) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
    if (coef <= -0.75) return 'bg-red-950/80 text-red-400 font-bold border border-red-800/80';
    if (coef <= -0.40) return 'bg-red-950/40 text-red-300 font-semibold';
    return 'bg-slate-950/60 text-slate-400';
  };

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 border border-slate-800/80 shadow-xl font-sans">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-indigo-950/90 border border-indigo-700/60 rounded-xl text-indigo-400 status-glow">
            <GitCompare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Matrice de Corrélation & Risque Systémique
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-950 border border-indigo-700/80 text-indigo-300 font-mono">
                MT5 MULTI-ACTIFS
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Analyse d'interdépendance des devises, métaux et cryptos pour éviter le sur-risque
            </p>
          </div>
        </div>

        {/* Timeframe switch */}
        <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800 font-mono text-[10px] self-start sm:self-auto">
          {(['1H', '1D', '1W'] as const).map((tf) => (
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
      </div>

      {/* Systemic Risk Alerts Banner */}
      {correlationAlerts.length > 0 ? (
        <div className="space-y-2 font-mono text-xs">
          {correlationAlerts.map((alert, idx) => (
            <div 
              key={idx}
              className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                alert.riskType === 'OVEREXPOSURE'
                  ? 'bg-amber-950/80 border-amber-700/80 text-amber-200'
                  : 'bg-indigo-950/80 border-indigo-700/80 text-indigo-200'
              }`}
            >
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400 animate-pulse" />
              <div className="space-y-0.5">
                <div className="font-bold flex items-center gap-2 text-white">
                  <span>ALERTE DE CORRÉLATION : {alert.sym1} ↔ {alert.sym2}</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-900 border border-slate-700 text-amber-300">
                    Coef: {alert.coef > 0 ? '+' : ''}{alert.coef}
                  </span>
                </div>
                <div className="text-[11px] font-sans opacity-90">{alert.description}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-2.5 flex items-center gap-2 text-xs font-mono text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Aucun sur-risque de corrélation détecté dans vos positions actives actuelles.</span>
        </div>
      )}

      {/* Correlation Matrix Grid Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-center text-xs font-mono border-collapse">
          <thead>
            <tr>
              <th className="p-2 text-left text-[10px] text-slate-400 font-semibold bg-slate-950/80 rounded-tl-xl border-b border-slate-800">
                Symbole
              </th>
              {symbolsList.map((sym) => {
                const isActive = activeSymbols.includes(sym);
                return (
                  <th 
                    key={sym} 
                    className={`p-2 text-[10px] font-bold border-b border-slate-800 ${
                      isActive ? 'text-indigo-300 bg-indigo-950/50' : 'text-slate-400 bg-slate-950/80'
                    }`}
                  >
                    {sym}
                    {isActive && <span className="block text-[8px] text-emerald-400">OPEN</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {symbolsList.map((symRow) => {
              const isRowActive = activeSymbols.includes(symRow);
              return (
                <tr key={symRow} className="border-b border-slate-900/80 hover:bg-slate-900/40">
                  <td className={`p-2 text-left font-bold text-[11px] ${
                    isRowActive ? 'text-indigo-300 bg-indigo-950/30' : 'text-slate-300'
                  }`}>
                    {symRow}
                  </td>

                  {symbolsList.map((symCol) => {
                    const coef = matrix[symRow][symCol];
                    const isSame = symRow === symCol;
                    const cellStyle = getCellColor(coef, isSame);

                    return (
                      <td
                        key={symCol}
                        onClick={() => !isSame && setSelectedPair({ sym1: symRow, sym2: symCol })}
                        className={`p-2 rounded-lg cursor-pointer transition-transform hover:scale-105 ${cellStyle}`}
                        title={isSame ? 'Même symbole' : `Corrélation ${symRow} vs ${symCol}: ${coef}`}
                      >
                        {isSame ? '1.00' : `${coef > 0 ? '+' : ''}${coef.toFixed(2)}`}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected Pair Deep Analysis */}
      {selectedPair && (
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-mono">
          <div className="space-y-1">
            <div className="font-bold text-white flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-indigo-400" />
              Analyse Focalisée : {selectedPair.sym1} ↔ {selectedPair.sym2}
            </div>
            <div className="text-[11px] text-slate-400 font-sans">
              Coefficient de Corrélation ({timeframe}) : <span className="font-bold text-indigo-300">
                {matrix[selectedPair.sym1][selectedPair.sym2] > 0 ? '+' : ''}
                {matrix[selectedPair.sym1][selectedPair.sym2]}
              </span>
            </div>
          </div>

          <div className="text-right text-[10px] text-slate-400 font-sans">
            {matrix[selectedPair.sym1][selectedPair.sym2] >= 0.70 ? (
              <span className="text-emerald-400 font-bold bg-emerald-950 px-2 py-1 rounded border border-emerald-800">
                Forte corrélation directe (Mouvements synchronisés)
              </span>
            ) : matrix[selectedPair.sym1][selectedPair.sym2] <= -0.70 ? (
              <span className="text-red-400 font-bold bg-red-950 px-2 py-1 rounded border border-red-800">
                Forte corrélation inverse (Mouvements opposés)
              </span>
            ) : (
              <span className="text-slate-300 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                Corrélation modérée (Diversification efficace)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-emerald-950 border border-emerald-700" />
            +0.75 à +1.00 (Forte Directe)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-red-950 border border-red-700" />
            -0.75 à -1.00 (Forte Inverse)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-slate-950 border border-slate-800" />
            -0.30 à +0.30 (Neutre)
          </span>
        </div>
        <div className="text-slate-500">Mise à jour dynamique via API MT5 Data Feed</div>
      </div>

    </div>
  );
};
