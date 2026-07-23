import React, { useState, useMemo } from 'react';
import { MLModelStats } from '../types';
import { 
  Sliders, ShieldCheck, Zap, AlertTriangle, Check, X, RefreshCw, Sparkles, 
  TrendingUp, TrendingDown, Target, Info, CheckCircle2, RotateCcw, Award, Percent
} from 'lucide-react';

interface StrategyValidatorProps {
  mlStats: MLModelStats;
  onApplyStrategyToEngine?: (activeFeatureNames: string[], projectedWinRate: number) => void;
}

interface FeatureToggleState {
  name: string;
  impact: number;
  enabled: boolean;
  category: 'TECHNICAL' | 'VOLATILITY' | 'SENTIMENT' | 'DEEP_LEARNING' | 'ORDER_FLOW';
  description: string;
}

export const StrategyValidator: React.FC<StrategyValidatorProps> = ({ 
  mlStats, 
  onApplyStrategyToEngine 
}) => {
  const baseWinRate = mlStats.winRate || 68.4;
  const rawFeatures = mlStats.currentSignal.features || [];

  // Helper to categorize features
  const getCategoryAndDesc = (name: string): { category: FeatureToggleState['category']; description: string } => {
    const lower = name.toLowerCase();
    if (lower.includes('rsi') || lower.includes('macd') || lower.includes('ema')) {
      return { category: 'TECHNICAL', description: 'Indicateurs de tendance et d\'oscillateurs de prix' };
    }
    if (lower.includes('atr') || lower.includes('bollinger') || lower.includes('volatilit')) {
      return { category: 'VOLATILITY', description: 'Pression de volatilité et bandes de compression' };
    }
    if (lower.includes('news') || lower.includes('sentiment') || lower.includes('nlp')) {
      return { category: 'SENTIMENT', description: 'Analyse sémantique NLP des dépêches en temps réel' };
    }
    if (lower.includes('lstm') || lower.includes('sequence') || lower.includes('neural')) {
      return { category: 'DEEP_LEARNING', description: 'Réseau récurrent LSTM pour mémoire de séquences temporelles' };
    }
    if (lower.includes('order') || lower.includes('book') || lower.includes('imbalance')) {
      return { category: 'ORDER_FLOW', description: 'Déséquilibre du carnet d\'ordres L2 et flux de liquidités' };
    }
    return { category: 'TECHNICAL', description: 'Facteur de filtrage algorithmique de signal' };
  };

  // State of feature toggles
  const [featuresState, setFeaturesState] = useState<FeatureToggleState[]>(() => {
    return rawFeatures.map(f => {
      const { category, description } = getCategoryAndDesc(f.name);
      return {
        name: f.name,
        impact: f.impact,
        enabled: true,
        category,
        description
      };
    });
  });

  // Calculate sum of all possible impacts for normalization
  const totalMaxImpactSum = useMemo(() => {
    return rawFeatures.reduce((sum, f) => sum + (f.impact || 0), 0) || 1.0;
  }, [rawFeatures]);

  // Dynamic calculations based on enabled features
  const { projectedWinRate, winRateDelta, activeImpactSum, activeRatio, projectedConfidence, riskRating } = useMemo(() => {
    const activeImpact = featuresState
      .filter(f => f.enabled)
      .reduce((sum, f) => sum + f.impact, 0);

    const ratio = activeImpact / totalMaxImpactSum; // 0.0 to 1.0
    
    // Base win rate with max feature set is baseWinRate (e.g. 68.4%)
    // Turning off features reduces win rate based on lost impact.
    // baseline random guess = 45.0%
    const minPossibleWinRate = 42.0;
    const maxWinRateBoost = baseWinRate - minPossibleWinRate; // e.g. 68.4 - 42.0 = 26.4%
    
    const calculatedWinRate = minPossibleWinRate + (maxWinRateBoost * Math.pow(ratio, 0.85));
    const finalWinRate = Math.round(calculatedWinRate * 10) / 10;
    const delta = Math.round((finalWinRate - baseWinRate) * 10) / 10;

    // Projected confidence
    const confidence = Math.round((mlStats.currentSignal.confidence * (0.5 + 0.5 * ratio)) * 10) / 10;

    let rating: 'EXCELLENT' | 'STABLE' | 'DEGRADED' | 'CRITICAL' = 'STABLE';
    if (ratio >= 0.9) rating = 'EXCELLENT';
    else if (ratio >= 0.7) rating = 'STABLE';
    else if (ratio >= 0.45) rating = 'DEGRADED';
    else rating = 'CRITICAL';

    return {
      projectedWinRate: finalWinRate,
      winRateDelta: delta,
      activeImpactSum: activeImpact,
      activeRatio: Math.round(ratio * 100),
      projectedConfidence: confidence,
      riskRating: rating
    };
  }, [featuresState, baseWinRate, totalMaxImpactSum, mlStats.currentSignal.confidence]);

  // Toggle single feature
  const handleToggleFeature = (name: string) => {
    setFeaturesState(prev => prev.map(f => f.name === name ? { ...f, enabled: !f.enabled } : f));
  };

  // Toggle all features
  const handleToggleAll = (enable: boolean) => {
    setFeaturesState(prev => prev.map(f => ({ ...f, enabled: enable })));
  };

  // Presets
  const applyPreset = (presetType: 'FULL' | 'TECHNICAL_ONLY' | 'NO_NEWS' | 'DEEP_FLOW') => {
    setFeaturesState(prev => prev.map(f => {
      if (presetType === 'FULL') return { ...f, enabled: true };
      if (presetType === 'TECHNICAL_ONLY') return { ...f, enabled: f.category === 'TECHNICAL' || f.category === 'VOLATILITY' };
      if (presetType === 'NO_NEWS') return { ...f, enabled: f.category !== 'SENTIMENT' };
      if (presetType === 'DEEP_FLOW') return { ...f, enabled: f.category === 'DEEP_LEARNING' || f.category === 'ORDER_FLOW' || f.category === 'SENTIMENT' };
      return f;
    }));
  };

  const activeCount = featuresState.filter(f => f.enabled).length;

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 font-sans text-slate-100 shadow-xl border border-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-950 border border-indigo-700/60 text-indigo-400 status-glow">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Strategy Validator & Feature Simulation</span>
              <span className="px-2 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-700 text-[9px] rounded-full font-mono">
                Simulation Taux de Réussite
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Activez/désactivez les caractéristiques ML (RSI, News, OrderBook...) pour simuler leur impact direct sur le Taux de Réussite (Win-Rate)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => handleToggleAll(true)}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl text-[10px] font-bold transition-all"
          >
            Activer Tout
          </button>
          <button
            onClick={() => handleToggleAll(false)}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl text-[10px] font-bold transition-all"
          >
            Désactiver Tout
          </button>
        </div>
      </div>

      {/* Impact Simulation KPI Board */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        
        {/* KPI 1: Projected Win-Rate */}
        <div className="bg-slate-950/90 p-3.5 rounded-xl border border-slate-800 space-y-1 relative overflow-hidden">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Taux de Réussite Projeté</span>
            <Target className="w-3.5 h-3.5 text-indigo-400" />
          </div>

          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono tracking-tight ${
              projectedWinRate >= 65 ? 'text-emerald-400' : projectedWinRate >= 55 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {projectedWinRate}%
            </span>
            <span className={`text-xs font-mono font-bold flex items-center ${
              winRateDelta > 0 ? 'text-emerald-400' : winRateDelta < 0 ? 'text-red-400' : 'text-slate-400'
            }`}>
              {winRateDelta > 0 ? `+${winRateDelta}%` : `${winRateDelta}%`}
            </span>
          </div>

          <div className="text-[10px] font-mono text-slate-500">
            Taux de base XGBoost: <span className="text-slate-300 font-bold">{baseWinRate}%</span>
          </div>
        </div>

        {/* KPI 2: Active Feature Weight Ratio */}
        <div className="bg-slate-950/90 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Poids Actif du Modèle</span>
            <Percent className="w-3.5 h-3.5 text-cyan-400" />
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono tracking-tight text-cyan-300">
              {activeRatio}%
            </span>
            <span className="text-xs font-mono text-slate-400">
              ({activeCount}/{featuresState.length} active)
            </span>
          </div>

          {/* Mini progress bar */}
          <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
            <div 
              className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full transition-all duration-300"
              style={{ width: `${activeRatio}%` }}
            />
          </div>
        </div>

        {/* KPI 3: Projected Confidence */}
        <div className="bg-slate-950/90 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Confiance Signal Projetée</span>
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono tracking-tight text-amber-300">
              {projectedConfidence}%
            </span>
            <span className="text-xs font-mono text-slate-400">
              / {mlStats.currentSignal.confidence}%
            </span>
          </div>

          <div className="text-[10px] font-mono text-slate-500">
            Pression décisionnelle sur signal {mlStats.currentSignal.symbol}
          </div>
        </div>

        {/* KPI 4: Strategy Health Status */}
        <div className="bg-slate-950/90 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Diagnostic Stratégie</span>
            <Award className="w-3.5 h-3.5 text-emerald-400" />
          </div>

          <div>
            <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold font-mono border ${
              riskRating === 'EXCELLENT'
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
                : riskRating === 'STABLE'
                ? 'bg-teal-950/80 text-teal-300 border-teal-700/60'
                : riskRating === 'DEGRADED'
                ? 'bg-amber-950/80 text-amber-400 border-amber-700/60'
                : 'bg-red-950/80 text-red-400 border-red-700/60'
            }`}>
              {riskRating === 'EXCELLENT' && 'OPTI-MAX (100%)'}
              {riskRating === 'STABLE' && 'ÉQUILIBRÉ'}
              {riskRating === 'DEGRADED' && 'SÉLECTION DÉGRADÉE'}
              {riskRating === 'CRITICAL' && 'SANS RIGOURE'}
            </span>
          </div>

          <div className="text-[10px] font-mono text-slate-500 truncate">
            {riskRating === 'EXCELLENT' ? 'Couverture maximale des signaux' : 'Risque d\'incohérence statistique'}
          </div>
        </div>

      </div>

      {/* Preset Strategy Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
        <span className="text-slate-400 text-[10px] uppercase font-bold pr-1">Préréglages Rapides:</span>
        <button
          onClick={() => applyPreset('FULL')}
          className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 rounded-lg text-[10px] font-bold transition-all"
        >
          ⚡ Ensemble Complet (Full AI)
        </button>
        <button
          onClick={() => applyPreset('TECHNICAL_ONLY')}
          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-[10px] font-bold transition-all"
        >
          📊 Technique Pur (RSI, MACD, Volatilité)
        </button>
        <button
          onClick={() => applyPreset('NO_NEWS')}
          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-[10px] font-bold transition-all"
        >
          🚫 Sans Sentiment News
        </button>
        <button
          onClick={() => applyPreset('DEEP_FLOW')}
          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-[10px] font-bold transition-all"
        >
          🧠 Deep Learning + Order Book
        </button>
      </div>

      {/* Interactive Feature Toggle List */}
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide font-mono flex items-center justify-between">
          <span>Module de Configuration des Caractéristiques ML</span>
          <span className="text-[10px] text-slate-500 font-normal">Basculer un interrupteur pour appliquer ou retirer sa pondération</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {featuresState.map(feature => {
            const pctOfTotal = Math.round((feature.impact / totalMaxImpactSum) * 100);

            return (
              <div 
                key={feature.name}
                onClick={() => handleToggleFeature(feature.name)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 group select-none ${
                  feature.enabled
                    ? 'bg-slate-950/90 border-indigo-800/80 hover:border-indigo-600 shadow-md'
                    : 'bg-slate-950/40 border-slate-800/60 opacity-60 hover:opacity-80'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-mono">
                    {/* Toggle switch visual */}
                    <div className={`w-8 h-4 rounded-full p-0.5 transition-colors relative ${
                      feature.enabled ? 'bg-indigo-600' : 'bg-slate-800'
                    }`}>
                      <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                        feature.enabled ? 'transform translate-x-4' : 'transform translate-x-0'
                      }`} />
                    </div>

                    <span className={`text-xs font-bold transition-colors ${
                      feature.enabled ? 'text-white group-hover:text-indigo-300' : 'text-slate-400 line-through'
                    }`}>
                      {feature.name}
                    </span>

                    <span className="px-1.5 py-0.2 bg-slate-900 border border-slate-800 text-[9px] text-indigo-300 rounded font-mono">
                      {feature.category}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 line-clamp-1 font-sans">
                    {feature.description}
                  </p>
                </div>

                {/* Impact Badge */}
                <div className="text-right shrink-0 font-mono">
                  <div className={`text-xs font-extrabold ${
                    feature.enabled ? 'text-emerald-400' : 'text-slate-500'
                  }`}>
                    +{feature.impact.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {pctOfTotal}% du poids
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Apply to Live Engine Notification / Action */}
      {onApplyStrategyToEngine && (
        <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Appliquez ce profil de stratégie à la boucle d'exécution réelle MT5 & ML.</span>
          </div>

          <button
            onClick={() => {
              const activeNames = featuresState.filter(f => f.enabled).map(f => f.name);
              onApplyStrategyToEngine(activeNames, projectedWinRate);
            }}
            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>Appliquer au Moteur ML ({projectedWinRate}% Taux Estimé)</span>
          </button>
        </div>
      )}

    </div>
  );
};
