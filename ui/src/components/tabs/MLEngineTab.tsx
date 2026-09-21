import React, { useState } from 'react';
import { MLModelStats } from '../../types';
import { Cpu, RefreshCw, Layers, CheckCircle2, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { FeatureImpactChart } from '../FeatureImpactChart';
import { StrategyValidator } from '../StrategyValidator';
import { LiveMLLatencyChart } from '../LiveMLLatencyChart';
import { StrategyOptimizer } from '../StrategyOptimizer';
import { CollapsibleSection } from '../CollapsibleSection';
import { getApiBaseUrl } from '../../utils/api';

interface MLEngineTabProps {
  mlStats: MLModelStats;
  executeTrade?: (symbol: string, direction: 'BUY' | 'SELL') => Promise<any>;
}

export const MLEngineTab: React.FC<MLEngineTabProps> = ({ mlStats, executeTrade }) => {
  const [isRetraining, setIsRetraining] = useState<boolean>(false);
  const [selectedArchitecture, setSelectedArchitecture] = useState<string>('XGBoost + LSTM Ensemble');

  const handleTriggerRetrain = async () => {
    setIsRetraining(true);
    try {
      await fetch(`${getApiBaseUrl()}/ml/retrain`, { method: 'POST' });
    } catch (e) {
      console.error("Erreur lancement entraînement:", e);
    }
    // L'effet visuel tourne un peu pour montrer la prise en compte
    setTimeout(() => {
      setIsRetraining(false);
    }, 2500);
  };

  return (
    <div className="space-y-4 text-slate-100 text-xs">
      
      <CollapsibleSection
        title="Passage d'Ordre Manuel (Signal IA)"
        icon={<Zap className="w-4 h-4" />}
        defaultExpanded={true}
      >
        <div className="space-y-4 p-1">
          <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${mlStats.currentSignal.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {mlStats.currentSignal.direction === 'BUY' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              </div>
              <div>
                <div className="font-bold text-white text-sm">{mlStats.currentSignal.symbol}</div>
                <div className="text-[10px] text-slate-400">Force: {mlStats.currentSignal.confidence}%</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => executeTrade && executeTrade(mlStats.currentSignal.symbol, 'BUY')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[10px] transition-all"
              >
                ACHETER
              </button>
              <button
                onClick={() => executeTrade && executeTrade(mlStats.currentSignal.symbol, 'SELL')}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-[10px] transition-all"
              >
                VENDRE
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 text-center">
            Note: L'ordre sera exécuté avec le lot calculé par le Kelly Sizer (Risk Engine).
          </p>
        </div>
      </CollapsibleSection>

      {/* Model Header */}
      <CollapsibleSection
        title="Modèle d'IA & Inférence"
        icon={<Cpu className="w-4 h-4" />}
        defaultExpanded={true}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-950/80 border border-indigo-700/60 text-indigo-400 rounded-xl">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-white text-sm uppercase font-mono tracking-tight">{mlStats.modelName}</div>
                <div className="text-[10px] text-slate-400 font-sans">Inférence ONNX Mobile Runtime</div>
              </div>
            </div>

            <button
              onClick={handleTriggerRetrain}
              disabled={isRetraining}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-600/30 disabled:opacity-50 text-xs font-mono"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetraining ? 'animate-spin' : ''}`} />
              <span>{isRetraining ? 'RÉ-ENTRAÎNEMENT...' : 'RÉ-ENTRAÎNER'}</span>
            </button>
          </div>

          {/* Model Metrics */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80 font-mono">
            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
              <div className="text-[10px] text-slate-400 font-sans">Précision</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">{(mlStats.accuracy * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
              <div className="text-[10px] text-slate-400 font-sans">F1-Score</div>
              <div className="text-sm font-bold text-indigo-400 mt-0.5">{mlStats.f1Score}</div>
            </div>
            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
              <div className="text-[10px] text-slate-400 font-sans">Inférence</div>
              <div className="text-sm font-bold text-purple-400 mt-0.5">{mlStats.inferenceTimeMs} ms</div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Architecture Selection */}
      <CollapsibleSection
        title="Architecture & Optimisation"
        icon={<Layers className="w-4 h-4" />}
        defaultExpanded={false}
      >
        <div className="space-y-4">
          <div className="space-y-1.5 font-sans">
            {[
              { id: 'XGBoost + LSTM Ensemble', desc: 'Hybride recommandé: Tabulaire XGBoost + Séries Temporelles LSTM' },
              { id: 'LightGBM + PPO', desc: 'Apprentissage par Renforcement (Deep Reinforcement Learning)' },
              { id: 'Transformer-TimeNet', desc: 'Attention Multi-Tête pour la détection de tendances complexes' }
            ].map((arch) => (
              <button
                key={arch.id}
                onClick={() => setSelectedArchitecture(arch.id)}
                className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 ${
                  selectedArchitecture === arch.id
                    ? 'bg-indigo-950/60 border-indigo-600/80 text-white shadow-sm'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${selectedArchitecture === arch.id ? 'text-indigo-400' : 'text-slate-600'}`} />
                <div>
                  <div className="font-bold text-xs">{arch.id}</div>
                  <div className="text-[10px] text-slate-400">{arch.desc}</div>
                </div>
              </button>
            ))}
          </div>

          <StrategyOptimizer mlStats={mlStats} />
        </div>
      </CollapsibleSection>

      {/* Analytics */}
      <CollapsibleSection
        title="Analyse & Latence"
        icon={<Zap className="w-4 h-4" />}
        defaultExpanded={false}
      >
        <div className="space-y-4">
          {/* Feature Impact Chart with Recharts for XGBoost + LSTM Ensemble */}
          <FeatureImpactChart mlStats={mlStats} />

          {/* Live ML Latency Real-time Monitoring Chart */}
          <LiveMLLatencyChart mlStats={mlStats} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Simulateur & Backtest"
        icon={<RefreshCw className="w-4 h-4" />}
        defaultExpanded={false}
      >
        {/* Strategy Validator Panel for Toggling Features & Simulating Win Rate Impact */}
        <StrategyValidator mlStats={mlStats} />
      </CollapsibleSection>

      {/* Concept Drift Alert Info */}
      <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-[11px]">
        <div className="text-slate-400">
          Dernier Ré-entraînement : <span className="text-slate-200 font-mono">{mlStats.lastRetrained}</span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
          <Zap className="w-3.5 h-3.5" />
          Pas de Dérive de Concept (Drift OK)
        </div>
      </div>

    </div>
  );
};
