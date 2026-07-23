import React, { useState, useMemo } from 'react';
import { MLModelStats } from '../types';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid 
} from 'recharts';
import { 
  Cpu, BarChart2, ArrowUpDown, Filter, Sparkles, Zap, CheckCircle2, Info, Layers
} from 'lucide-react';

interface FeatureImpactChartProps {
  mlStats: MLModelStats;
}

type SortOrder = 'desc' | 'asc' | 'alpha';
type DisplayUnit = 'score' | 'percentage';

const BAR_COLOR_GRADIENTS = [
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#14b8a6', // Teal
];

export const FeatureImpactChart: React.FC<FeatureImpactChartProps> = ({ mlStats }) => {
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [unit, setUnit] = useState<DisplayUnit>('score');

  const rawFeatures = mlStats.currentSignal.features || [];

  // Calculate sum of impacts for percentage normalisation
  const totalImpactSum = useMemo(() => {
    return rawFeatures.reduce((acc, f) => acc + (f.impact || 0), 0) || 1;
  }, [rawFeatures]);

  // Prepared & sorted feature dataset
  const chartData = useMemo(() => {
    const list = rawFeatures.map((f, idx) => {
      const rawImpact = f.impact || 0;
      const relativePct = Math.round((rawImpact / totalImpactSum) * 1000) / 10;
      const pctValue = Math.round(rawImpact * 1000) / 10; // if impact is 0.35 -> 35.0%

      return {
        name: f.name,
        rawImpact: rawImpact,
        displayVal: unit === 'percentage' ? pctValue : rawImpact,
        relativePct,
        color: BAR_COLOR_GRADIENTS[idx % BAR_COLOR_GRADIENTS.length]
      };
    });

    if (sortOrder === 'desc') {
      return [...list].sort((a, b) => b.rawImpact - a.rawImpact);
    }
    if (sortOrder === 'asc') {
      return [...list].sort((a, b) => a.rawImpact - b.rawImpact);
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [rawFeatures, totalImpactSum, sortOrder, unit]);

  // Top driver feature
  const topFeature = chartData[0];

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 font-sans text-slate-100 shadow-xl border border-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-950 border border-indigo-700/60 text-indigo-400 status-glow">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Impact des Caractéristiques ML ({mlStats.architecture})</span>
              <span className="px-2 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-700 text-[9px] rounded-full font-mono">
                Recharts Horizontal
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Histogramme horizontal des scores d'impact feature importance de l'ensemble XGBoost + LSTM
            </p>
          </div>
        </div>

        {/* Model Metrics Quick Badges */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-1.5">
            <span className="text-slate-400 text-[10px]">Précision:</span>
            <span className="font-bold text-emerald-400">{mlStats.accuracy}%</span>
          </div>
          <div className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-1.5">
            <span className="text-slate-400 text-[10px]">F1:</span>
            <span className="font-bold text-indigo-300">{mlStats.f1Score}</span>
          </div>
        </div>
      </div>

      {/* Control Toolbar: Sorting & Units */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-xs font-mono">
        
        {/* Sort order options */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-slate-400 text-[10px] flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
            <span>Tri:</span>
          </span>
          <button
            onClick={() => setSortOrder('desc')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              sortOrder === 'desc'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Impact Décroissant
          </button>
          <button
            onClick={() => setSortOrder('asc')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              sortOrder === 'asc'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Impact Croissant
          </button>
          <button
            onClick={() => setSortOrder('alpha')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              sortOrder === 'alpha'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Alphabetique
          </button>
        </div>

        {/* Display Unit Toggle */}
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="text-slate-400 text-[10px]">Unité:</span>
          <button
            onClick={() => setUnit('score')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
              unit === 'score'
                ? 'bg-indigo-950 text-indigo-300 border border-indigo-700'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Score Raw (0.00-1.00)
          </button>
          <button
            onClick={() => setUnit('percentage')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
              unit === 'percentage'
                ? 'bg-indigo-950 text-indigo-300 border border-indigo-700'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Pourcentage (%)
          </button>
        </div>
      </div>

      {/* Main Recharts Horizontal Bar Chart */}
      <div className="bg-slate-950/60 rounded-xl border border-slate-800/80 p-3 pt-4">
        {chartData.length === 0 ? (
          <div className="text-center py-8 text-xs font-mono text-slate-500">
            Aucune caractéristique ML disponible pour le signal actuel.
          </div>
        ) : (
          <div className="w-full" style={{ height: `${Math.max(220, chartData.length * 36)}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#64748b"
                  fontSize={10}
                  tickFormatter={(val) => (unit === 'percentage' ? `${val}%` : val.toFixed(2))}
                  domain={[0, unit === 'percentage' ? 100 : 'auto']}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  stroke="#cbd5e1"
                  fontSize={11}
                  width={150}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                  content={<CustomFeatureTooltip unit={unit} />}
                />
                <Bar
                  dataKey="displayVal"
                  radius={[0, 6, 6, 0]}
                  barSize={18}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Insight Summary Footer */}
      {topFeature && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-0.5">
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-sans">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Facteur Prédominant #1
            </span>
            <div className="font-bold text-white text-xs truncate">{topFeature.name}</div>
            <div className="text-[10px] text-emerald-400">Score Impact: {topFeature.rawImpact.toFixed(2)} ({topFeature.relativePct}% du total)</div>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-0.5">
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-sans">
              <Layers className="w-3 h-3 text-cyan-400" />
              Ensemble XGBoost + LSTM
            </span>
            <div className="font-bold text-indigo-300 text-xs">{mlStats.featuresCount} Caractéristiques Incluses</div>
            <div className="text-[10px] text-slate-400">Signal: {mlStats.currentSignal.symbol} ({mlStats.currentSignal.direction})</div>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-0.5">
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-sans">
              <Zap className="w-3 h-3 text-yellow-400" />
              Temps d'Inférence ONNX
            </span>
            <div className="font-bold text-white text-xs">{mlStats.inferenceTimeMs} ms</div>
            <div className="text-[10px] text-slate-400">Retraité le: {mlStats.lastRetrained}</div>
          </div>
        </div>
      )}

    </div>
  );
};

// Custom Tooltip for Feature Impact Bar Chart
const CustomFeatureTooltip = ({ active, payload, unit }: any) => {
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
            <span>Score d'impact direct:</span>
            <span className="font-bold text-indigo-400">{data.rawImpact.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-300">
            <span>Poids relatif décisionnel:</span>
            <span className="font-bold text-emerald-400">{data.relativePct}%</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};
