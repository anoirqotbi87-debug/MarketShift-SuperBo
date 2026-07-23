import React, { useState, useMemo } from 'react';
import { MLModelStats } from '../types';
import { 
  Sliders, Play, Sparkles, TrendingUp, BarChart2, Cpu, Zap, Award, 
  CheckCircle2, Flame, RefreshCw, Layers, ShieldCheck, Target, ArrowUpRight, ChevronRight
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid 
} from 'recharts';

interface StrategyOptimizerProps {
  mlStats?: MLModelStats;
  onApplyOptimalParams?: (params: OptimalParamSet) => void;
}

export interface OptimalParamSet {
  paramXName: string;
  paramXVal: number | string;
  paramYName: string;
  paramYVal: number | string;
  netProfit: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
  overfitRisk: 'FAIBLE' | 'MODÉRÉ' | 'ÉLEVÉ';
}

type ParamType = 'xgbDepth' | 'xgbLr' | 'lstmUnits' | 'lstmSeq' | 'confThreshold' | 'slMult';

interface ParamDef {
  id: ParamType;
  label: string;
  shortLabel: string;
  unit: string;
  values: (number | string)[];
}

const PARAM_DEFINITIONS: Record<ParamType, ParamDef> = {
  xgbDepth: {
    id: 'xgbDepth',
    label: 'XGBoost Max Depth',
    shortLabel: 'XGB Depth',
    unit: 'niveaux',
    values: [3, 4, 5, 6, 7, 8]
  },
  xgbLr: {
    id: 'xgbLr',
    label: 'XGBoost Learning Rate',
    shortLabel: 'XGB Lr',
    unit: '',
    values: [0.01, 0.03, 0.05, 0.10, 0.15, 0.20]
  },
  lstmUnits: {
    id: 'lstmUnits',
    label: 'LSTM Hidden Units',
    shortLabel: 'LSTM Units',
    unit: 'neurones',
    values: [32, 64, 128, 256, 384, 512]
  },
  lstmSeq: {
    id: 'lstmSeq',
    label: 'LSTM Sequence Length',
    shortLabel: 'LSTM Seq',
    unit: 'bougies',
    values: [10, 20, 30, 45, 60, 90]
  },
  confThreshold: {
    id: 'confThreshold',
    label: 'Seuil Inférence (%)',
    shortLabel: 'Conf. Threshold',
    unit: '%',
    values: [55, 60, 65, 70, 75, 80]
  },
  slMult: {
    id: 'slMult',
    label: 'Multiplicateur ATR SL',
    shortLabel: 'ATR SL Mult.',
    unit: 'x',
    values: [1.0, 1.25, 1.5, 2.0, 2.5, 3.0]
  }
};

export const StrategyOptimizer: React.FC<StrategyOptimizerProps> = ({ mlStats, onApplyOptimalParams }) => {
  const [paramX, setParamX] = useState<ParamType>('xgbDepth');
  const [paramY, setParamY] = useState<ParamType>('lstmUnits');
  const [metric, setMetric] = useState<'netProfit' | 'sharpeRatio' | 'winRate' | 'profitFactor'>('sharpeRatio');
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizationProgress, setOptimizationProgress] = useState<number>(100);
  const [selectedCell, setSelectedCell] = useState<{ xIdx: number; yIdx: number } | null>({ xIdx: 3, yIdx: 2 });
  const [appliedSuccessMessage, setAppliedSuccessMessage] = useState<string | null>(null);

  const defX = PARAM_DEFINITIONS[paramX];
  const defY = PARAM_DEFINITIONS[paramY];

  // Generate deterministic realistic sensitivity matrix data based on paramX and paramY
  const gridData = useMemo(() => {
    const matrix: OptimalParamSet[][] = [];

    defY.values.forEach((valY, yIdx) => {
      const row: OptimalParamSet[] = [];
      defX.values.forEach((valX, xIdx) => {
        // Pseudo-random deterministic formula simulating convex optimization landscape
        const numX = typeof valX === 'number' ? valX : xIdx + 1;
        const numY = typeof valY === 'number' ? valY : yIdx + 1;

        // Peak center around middle of grid
        const centerX = defX.values.length / 2;
        const centerY = defY.values.length / 2;
        const dist = Math.sqrt(Math.pow(xIdx - centerX, 2) + Math.pow(yIdx - centerY, 2));

        const baseProfit = 2400 - dist * 420 + (Math.sin(numX * 1.5 + numY) * 350);
        const netProfit = Math.round(baseProfit);

        const winRate = Math.min(88, Math.max(48, Math.round(68 - dist * 4.5 + (numX % 2 === 0 ? 3 : -2))));
        const sharpeRatio = Math.max(0.8, Math.round((2.85 - dist * 0.35 + (numY % 2 === 0 ? 0.2 : -0.1)) * 100) / 100);
        const maxDrawdown = Math.max(2.1, Math.round((4.2 + dist * 1.2 + (numX > 4 ? 2.5 : 0)) * 10) / 10);
        const profitFactor = Math.max(1.1, Math.round((2.4 - dist * 0.28) * 100) / 100);

        const overfitRisk: 'FAIBLE' | 'MODÉRÉ' | 'ÉLEVÉ' = 
          dist > 2.2 ? 'ÉLEVÉ' : dist > 1.2 ? 'MODÉRÉ' : 'FAIBLE';

        row.push({
          paramXName: defX.label,
          paramXVal: valX,
          paramYName: defY.label,
          paramYVal: valY,
          netProfit,
          winRate,
          sharpeRatio,
          maxDrawdown,
          profitFactor,
          overfitRisk
        });
      });
      matrix.push(row);
    });

    return matrix;
  }, [paramX, paramY, defX, defY]);

  // Find overall optimal cell in matrix for current metric
  const optimalCellCoords = useMemo(() => {
    let bestVal = -Infinity;
    let coords = { yIdx: 0, xIdx: 0 };

    gridData.forEach((row, yIdx) => {
      row.forEach((cell, xIdx) => {
        const val = cell[metric];
        if (val > bestVal) {
          bestVal = val;
          coords = { yIdx, xIdx };
        }
      });
    });

    return coords;
  }, [gridData, metric]);

  // Selected cell data
  const activeCellData = useMemo(() => {
    if (!selectedCell) {
      return gridData[optimalCellCoords.yIdx][optimalCellCoords.xIdx];
    }
    return gridData[selectedCell.yIdx][selectedCell.xIdx];
  }, [gridData, selectedCell, optimalCellCoords]);

  // Top 5 combinations across matrix for the chart
  const topCombinationsData = useMemo(() => {
    const list: (OptimalParamSet & { label: string })[] = [];
    gridData.forEach((row) => {
      row.forEach((cell) => {
        list.push({
          ...cell,
          label: `${cell.paramXVal} / ${cell.paramYVal}`
        });
      });
    });

    return list
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 5);
  }, [gridData, metric]);

  // Execute Grid Search simulation
  const handleRunOptimization = () => {
    setIsOptimizing(true);
    setOptimizationProgress(0);
    setAppliedSuccessMessage(null);

    let prog = 0;
    const interval = setInterval(() => {
      prog += 20;
      setOptimizationProgress(prog);
      if (prog >= 100) {
        clearInterval(interval);
        setIsOptimizing(false);
        setSelectedCell(optimalCellCoords);
      }
    }, 250);
  };

  // Apply selected hyperparameter set
  const handleApplyParams = () => {
    if (onApplyOptimalParams) {
      onApplyOptimalParams(activeCellData);
    }
    setAppliedSuccessMessage(`Configuration appliquée avec succès ! (${activeCellData.paramXName}: ${activeCellData.paramXVal} | ${activeCellData.paramYName}: ${activeCellData.paramYVal})`);
    setTimeout(() => setAppliedSuccessMessage(null), 4000);
  };

  // Color helper for Heatmap cells based on metric value
  const getCellBgColor = (cell: OptimalParamSet, isOptimal: boolean, isSelected: boolean) => {
    const val = cell[metric];

    // Determine min and max for metric
    let min = Infinity;
    let max = -Infinity;
    gridData.forEach(r => r.forEach(c => {
      if (c[metric] < min) min = c[metric];
      if (c[metric] > max) max = c[metric];
    }));

    const range = max - min || 1;
    const ratio = (val - min) / range; // 0 to 1

    if (isSelected) {
      return 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 font-black shadow-lg z-10 scale-105';
    }

    if (isOptimal) {
      return 'bg-emerald-500 text-slate-950 font-black ring-2 ring-emerald-300 shadow-lg';
    }

    if (ratio > 0.75) {
      return 'bg-emerald-950/90 text-emerald-300 border border-emerald-600/60 hover:bg-emerald-900';
    } else if (ratio > 0.45) {
      return 'bg-teal-950/80 text-teal-300 border border-teal-800/60 hover:bg-teal-900';
    } else if (ratio > 0.25) {
      return 'bg-indigo-950/70 text-indigo-300 border border-indigo-900/60 hover:bg-indigo-900';
    } else {
      return 'bg-slate-950/80 text-slate-500 border border-slate-800/80 hover:bg-slate-900';
    }
  };

  const formatMetricDisplay = (val: number, m: typeof metric) => {
    if (m === 'netProfit') return `$${val.toLocaleString()}`;
    if (m === 'winRate') return `${val}%`;
    if (m === 'sharpeRatio') return `${val.toFixed(2)}`;
    if (m === 'profitFactor') return `${val.toFixed(2)}`;
    return val.toString();
  };

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 font-sans text-slate-100 shadow-xl border border-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-950/90 border border-amber-600/80 text-amber-400 status-glow">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Optimiseur de Stratégie & Analyse de Sensibilité Hyperparamétrique</span>
              <span className="px-2 py-0.2 bg-amber-950 text-amber-300 border border-amber-700 text-[9px] rounded-full font-mono">
                XGBoost + LSTM Grid
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Cartographie thermique multi-paramètres pour identifier la zone de profit maximale sans surapprentissage
            </p>
          </div>
        </div>

        {/* Action Button: Run Optimization */}
        <button
          onClick={handleRunOptimization}
          disabled={isOptimizing}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-500 hover:from-amber-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs font-mono transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
        >
          {isOptimizing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>GRID SEARCH EN COURS ({optimizationProgress}%)...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-slate-950" />
              <span>LANCER L'OPTIMISATION (GRID SEARCH)</span>
            </>
          )}
        </button>
      </div>

      {/* Control Panel: Parameters & Metric Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/80 p-3 rounded-2xl border border-slate-800 font-mono text-xs">
        
        {/* Param X Selector */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Axe X (Hyperparamètre 1) :</span>
          </label>
          <select
            value={paramX}
            onChange={(e) => {
              const val = e.target.value as ParamType;
              if (val === paramY) setParamY(paramX);
              setParamX(val);
            }}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
          >
            {(Object.keys(PARAM_DEFINITIONS) as ParamType[]).map(key => (
              <option key={key} value={key}>
                {PARAM_DEFINITIONS[key].label}
              </option>
            ))}
          </select>
        </div>

        {/* Param Y Selector */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            <span>Axe Y (Hyperparamètre 2) :</span>
          </label>
          <select
            value={paramY}
            onChange={(e) => {
              const val = e.target.value as ParamType;
              if (val === paramX) setParamX(paramY);
              setParamY(val);
            }}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
          >
            {(Object.keys(PARAM_DEFINITIONS) as ParamType[]).map(key => (
              <option key={key} value={key}>
                {PARAM_DEFINITIONS[key].label}
              </option>
            ))}
          </select>
        </div>

        {/* Metric Selector */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
            <Award className="w-3 h-3 text-amber-400" />
            <span>Métrique d'Optimisation :</span>
          </label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as any)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500"
          >
            <option value="sharpeRatio">Ratio de Sharpe (Rendement / Risque)</option>
            <option value="netProfit">Profit Net ($ USD)</option>
            <option value="winRate">Taux de Victoire (%)</option>
            <option value="profitFactor">Profit Factor (Gains / Pertes)</option>
          </select>
        </div>

      </div>

      {/* HEAT MAP MATRIX & SIDEBAR INSPECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Heatmap Grid Area (2 Columns on lg screens) */}
        <div className="lg:col-span-2 bg-slate-950/90 rounded-2xl border border-slate-800 p-3.5 space-y-3 font-mono">
          
          <div className="flex items-center justify-between text-xs pb-1">
            <span className="font-bold text-white flex items-center gap-1.5 uppercase text-[11px]">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Matrice de Sensibilité Heatmap ({defX.shortLabel} vs {defY.shortLabel})</span>
            </span>

            {/* Legend Badge */}
            <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
              <span className="w-2.5 h-2.5 rounded bg-slate-900 border border-slate-800 inline-block" />
              <span>Faible</span>
              <span className="w-2.5 h-2.5 rounded bg-indigo-900 inline-block" />
              <span className="w-2.5 h-2.5 rounded bg-teal-800 inline-block" />
              <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
              <span className="font-bold text-emerald-400">Optimal ⭐</span>
            </div>
          </div>

          {/* Heatmap Table Grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse">
              <thead>
                <tr>
                  {/* Top Left Corner Header (Axis Label Y) */}
                  <th className="p-2 text-[9px] text-slate-500 border-b border-r border-slate-800 bg-slate-900/50 uppercase font-bold">
                    {defY.shortLabel} ↓ \ {defX.shortLabel} →
                  </th>

                  {/* Param X Column Headers */}
                  {defX.values.map((valX, xIdx) => (
                    <th key={xIdx} className="p-2 text-[10px] text-emerald-300 font-bold border-b border-slate-800 bg-slate-900/40">
                      {valX} {defX.unit}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {gridData.map((row, yIdx) => {
                  const valY = defY.values[yIdx];

                  return (
                    <tr key={yIdx}>
                      {/* Param Y Row Header */}
                      <th className="p-2 text-[10px] text-teal-300 font-bold border-r border-slate-800 bg-slate-900/40">
                        {valY} {defY.unit}
                      </th>

                      {/* Cell Grid */}
                      {row.map((cell, xIdx) => {
                        const isOptimal = optimalCellCoords.xIdx === xIdx && optimalCellCoords.yIdx === yIdx;
                        const isSelected = selectedCell?.xIdx === xIdx && selectedCell?.yIdx === yIdx;
                        const cellBgClass = getCellBgColor(cell, isOptimal, isSelected);

                        return (
                          <td
                            key={xIdx}
                            onClick={() => setSelectedCell({ xIdx, yIdx })}
                            className="p-1"
                          >
                            <button
                              type="button"
                              className={`w-full py-2.5 px-1 rounded-xl text-[10px] transition-all flex flex-col items-center justify-center cursor-pointer ${cellBgClass}`}
                              title={`Cliquez pour inspecter : ${defX.shortLabel}=${cell.paramXVal}, ${defY.shortLabel}=${cell.paramYVal}`}
                            >
                              <span className="font-extrabold tracking-tight">
                                {formatMetricDisplay(cell[metric], metric)}
                              </span>
                              {isOptimal && (
                                <span className="text-[8px] uppercase tracking-tighter font-black text-slate-950">
                                  BEST ⭐
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-[9px] text-slate-500 flex items-center justify-between pt-1">
            <span>💡 *Cliquez sur n'importe quelle case de la heatmap pour inspecter les métriques détaillées.</span>
            <span className="text-amber-400 font-bold">Zone Optimal = Rendement Max sans Surapprentissage</span>
          </div>

        </div>

        {/* Selected Parameter Cell Inspector Sidebar (1 Column) */}
        <div className="bg-slate-950/90 rounded-2xl border border-slate-800 p-3.5 space-y-3 font-mono">
          
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="font-bold text-white text-xs flex items-center gap-1.5 uppercase">
              <Target className="w-4 h-4 text-emerald-400" />
              <span>Inspection Configuration</span>
            </span>
            {selectedCell && (
              <span className="px-2 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-700 text-[9px] rounded-full">
                Case Sélectionnée
              </span>
            )}
          </div>

          {/* Current Selected Cell Values */}
          <div className="space-y-2">
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase">Hyperparamètres :</div>
              <div className="text-xs font-bold text-white flex flex-col gap-0.5">
                <span className="text-emerald-300">
                  {activeCellData.paramXName}: <strong>{activeCellData.paramXVal}</strong>
                </span>
                <span className="text-teal-300">
                  {activeCellData.paramYName}: <strong>{activeCellData.paramYVal}</strong>
                </span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-[9px] text-slate-400">Profit Net ($)</div>
                <div className={`font-bold text-sm ${activeCellData.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  +${activeCellData.netProfit.toLocaleString()}
                </div>
              </div>

              <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-[9px] text-slate-400">Ratio de Sharpe</div>
                <div className="font-bold text-sm text-amber-300">
                  {activeCellData.sharpeRatio.toFixed(2)}
                </div>
              </div>

              <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-[9px] text-slate-400">Taux de Victoire</div>
                <div className="font-bold text-sm text-indigo-300">
                  {activeCellData.winRate}%
                </div>
              </div>

              <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800 space-y-0.5">
                <div className="text-[9px] text-slate-400">Max Drawdown</div>
                <div className="font-bold text-sm text-rose-300">
                  -{activeCellData.maxDrawdown}%
                </div>
              </div>
            </div>

            {/* Overfit Risk Indicator */}
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-[10px] text-slate-400 uppercase">Risque de Surapprentissage :</span>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                activeCellData.overfitRisk === 'FAIBLE'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : activeCellData.overfitRisk === 'MODÉRÉ'
                  ? 'bg-amber-950 text-amber-300 border-amber-700'
                  : 'bg-rose-950 text-rose-300 border-rose-700'
              }`}>
                {activeCellData.overfitRisk}
              </span>
            </div>

            {/* Apply Button */}
            <button
              onClick={handleApplyParams}
              className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>APPLIQUER CETTE CONFIGURATION</span>
            </button>

            {/* Success Alert Banner */}
            {appliedSuccessMessage && (
              <div className="p-2.5 bg-emerald-950/90 border border-emerald-600 text-emerald-300 text-[10px] rounded-xl font-bold animate-in fade-in flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{appliedSuccessMessage}</span>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* Top 5 Optimal Parameter Sets Ranking Chart */}
      <div className="bg-slate-950/90 rounded-2xl border border-slate-800 p-3.5 space-y-2 font-mono">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-400" />
            <span>Top 5 Configurations Gagnantes ({PARAM_DEFINITIONS[paramX].shortLabel} / {PARAM_DEFINITIONS[paramY].shortLabel})</span>
          </span>
          <span className="text-[10px] text-slate-400">Classées par {metric}</span>
        </div>

        <div className="w-full h-44 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topCombinationsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                formatter={(val: any) => [formatMetricDisplay(val, metric), metric.toUpperCase()]}
              />
              <Bar dataKey={metric} radius={[6, 6, 0, 0]}>
                {topCombinationsData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === 0 ? '#10b981' : index === 1 ? '#14b8a6' : index === 2 ? '#6366f1' : '#475569'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};
