import React, { useState, useEffect } from 'react';
import { MT5AccountState } from '../types';
import { 
  Trophy, Target, TrendingUp, Sparkles, CheckCircle2, Zap, Settings, Flame, Award, ArrowUpRight, DollarSign, Percent
} from 'lucide-react';

interface DailyProfitProgressBarProps {
  accountState: MT5AccountState;
  dailyTargetUsd?: number;
  onTargetChange?: (newTarget: number) => void;
}

export const DailyProfitProgressBar: React.FC<DailyProfitProgressBarProps> = ({
  accountState,
  dailyTargetUsd = 500,
  onTargetChange
}) => {
  const [targetUsd, setTargetUsd] = useState<number>(dailyTargetUsd);
  const [isEditingTarget, setIsEditingTarget] = useState<boolean>(false);
  const [tempTarget, setTempTarget] = useState<string>(dailyTargetUsd.toString());
  const [hasPulseEffect, setHasPulseEffect] = useState<boolean>(false);

  // Daily PnL from account state
  const currentDailyPnL = accountState.dailyPnL || 0;
  const isPositive = currentDailyPnL >= 0;

  // Calculate percentage toward daily profit goal
  const rawProgressPct = (currentDailyPnL / targetUsd) * 100;
  // Clamp progress between 0 and 100 for bar width, but allow display > 100%
  const clampedProgressPct = Math.min(100, Math.max(0, rawProgressPct));
  const displayProgressPct = Math.max(0, Math.round(rawProgressPct * 10) / 10);

  // Check if goal is reached
  const isGoalAchieved = currentDailyPnL >= targetUsd && targetUsd > 0;

  // Trigger fill animation / pulse effect when daily PnL updates
  useEffect(() => {
    setHasPulseEffect(true);
    const timer = setTimeout(() => setHasPulseEffect(false), 1000);
    return () => clearTimeout(timer);
  }, [currentDailyPnL]);

  const handleSaveTarget = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(tempTarget);
    if (!isNaN(parsed) && parsed > 0) {
      setTargetUsd(parsed);
      if (onTargetChange) onTargetChange(parsed);
    }
    setIsEditingTarget(false);
  };

  // Quick preset targets
  const handleQuickPreset = (preset: number) => {
    setTargetUsd(preset);
    setTempTarget(preset.toString());
    if (onTargetChange) onTargetChange(preset);
    setIsEditingTarget(false);
  };

  // Preset percentage of balance targets (e.g., 1%, 2%, 3%, 5%)
  const balanceTargetPct = accountState.balance > 0 ? (targetUsd / accountState.balance) * 100 : 0;

  return (
    <div className="bg-slate-950/90 border-b border-slate-800/80 px-3 py-2 text-xs font-mono select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1.5">
        
        {/* Left Title & Current PnL vs Goal */}
        <div className="flex items-center gap-2">
          <div className={`p-1 rounded-lg border transition-all ${
            isGoalAchieved
              ? 'bg-amber-950/90 border-amber-600 text-amber-300 status-glow animate-bounce'
              : isPositive
              ? 'bg-emerald-950/90 border-emerald-700/80 text-emerald-400'
              : 'bg-rose-950/90 border-rose-700/80 text-rose-400'
          }`}>
            {isGoalAchieved ? (
              <Trophy className="w-3.5 h-3.5" />
            ) : isPositive ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <Target className="w-3.5 h-3.5" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Objectif Profit Jour:
            </span>

            {/* Current Realized PnL */}
            <span className={`font-black text-xs transition-colors duration-300 ${
              isPositive ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {isPositive ? '+' : ''}${currentDailyPnL.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>

            <span className="text-slate-500 text-[10px]">/</span>

            {/* Target Display or Inline Edit Form */}
            {isEditingTarget ? (
              <form onSubmit={handleSaveTarget} className="flex items-center gap-1">
                <input
                  type="number"
                  min="10"
                  step="50"
                  value={tempTarget}
                  onChange={e => setTempTarget(e.target.value)}
                  className="w-16 bg-slate-900 border border-indigo-500 rounded px-1.5 py-0.5 text-[10px] text-white font-bold focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold rounded"
                >
                  OK
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsEditingTarget(true)}
                className="font-bold text-slate-300 hover:text-white flex items-center gap-1 group transition-colors"
                title="Cliquer pour modifier l'objectif de profit journalier"
              >
                <span>${targetUsd.toLocaleString('fr-FR')}</span>
                <Settings className="w-3 h-3 text-slate-500 group-hover:text-indigo-400" />
              </button>
            )}

            {/* Balance Pct Badge */}
            <span className="text-[9px] text-slate-500 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800">
              ({balanceTargetPct.toFixed(1)}% du Solde)
            </span>
          </div>
        </div>

        {/* Right Goal Status Badge */}
        <div className="flex items-center gap-2">
          {isGoalAchieved ? (
            <div className="px-2 py-0.5 rounded-full bg-amber-950/90 border border-amber-600 text-amber-300 text-[9px] font-bold flex items-center gap-1 animate-pulse shadow-sm">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>OBJECTIF ATTEINT 🎉 ({displayProgressPct}%)</span>
            </div>
          ) : (
            <div className="text-[10px] font-bold text-slate-300 flex items-center gap-1.5">
              <span className="text-slate-400">Progression :</span>
              <span className={`px-1.5 py-0.2 rounded font-bold ${
                clampedProgressPct >= 75
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                  : clampedProgressPct >= 40
                  ? 'bg-indigo-950 text-indigo-300 border border-indigo-700'
                  : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}>
                {displayProgressPct}%
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Progress Bar Track & Animated Fill Bar */}
      <div className="relative w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 shadow-inner">
        
        {/* Animated Fill Bar */}
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out relative ${
            isGoalAchieved
              ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 status-glow'
              : isPositive
              ? 'bg-gradient-to-r from-indigo-600 via-emerald-500 to-teal-400'
              : 'bg-rose-950 border-r border-rose-600'
          } ${hasPulseEffect ? 'brightness-125' : ''}`}
          style={{ width: `${clampedProgressPct}%` }}
        >
          {/* Shimmer / Flowing Animation Light Overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer" />
        </div>

        {/* Milestone Tick Markers at 25%, 50%, 75%, 100% */}
        <div className="absolute inset-0 flex justify-between px-1 pointer-events-none">
          <div className="w-px h-full bg-slate-800/80" style={{ left: '25%' }} />
          <div className="w-px h-full bg-slate-800/80" style={{ left: '50%' }} />
          <div className="w-px h-full bg-slate-800/80" style={{ left: '75%' }} />
        </div>
      </div>

      {/* Quick Preset Drawer when editing */}
      {isEditingTarget && (
        <div className="mt-2 p-2 bg-slate-900/95 border border-indigo-500/60 rounded-xl space-y-1.5 animate-in fade-in">
          <div className="text-[9px] text-slate-400 flex items-center justify-between">
            <span>Raccourcis d'Objectifs Journaliers:</span>
            <button
              onClick={() => setIsEditingTarget(false)}
              className="text-slate-500 hover:text-white text-[9px]"
            >
              Fermer
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[250, 500, 1000, 2000, 5000].map(val => (
              <button
                key={val}
                type="button"
                onClick={() => handleQuickPreset(val)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all ${
                  targetUsd === val
                    ? 'bg-indigo-600 text-white border-indigo-400'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                ${val.toLocaleString()}
              </button>
            ))}

            {/* Balance Pct Presets */}
            {accountState.balance > 0 && [1, 2, 3, 5].map(pct => {
              const calcVal = Math.round((accountState.balance * (pct / 100)) / 10) * 10;
              return (
                <button
                  key={`pct-${pct}`}
                  type="button"
                  onClick={() => handleQuickPreset(calcVal)}
                  className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900"
                >
                  {pct}% Solde (${calcVal})
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
