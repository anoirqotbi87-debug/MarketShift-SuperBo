import React, { useEffect, useState } from 'react';
import { TrendingUp, Target, Activity, AlertTriangle, Info } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface KellyStats {
  winRate: number;
  rrRatio: number;
  tradeCount: number;
  kellyFraction?: number;
  kellyPct?: number;
}

interface KellyPositionSizerProps {
  kellyStats?: KellyStats | null;
  localBridgeIp?: string;
  isConnected?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const KellyPositionSizer: React.FC<KellyPositionSizerProps> = ({
  kellyStats,
  localBridgeIp,
  isConnected = false,
}) => {
  const [stats, setStats] = useState<KellyStats | null>(kellyStats || null);

  // Fetch depuis l'API si pas de stats WS
  useEffect(() => {
    if (kellyStats) {
      const kellFrac = computeKellyFraction(kellyStats.winRate, kellyStats.rrRatio);
      setStats({ ...kellyStats, kellyFraction: kellFrac, kellyPct: kellFrac * 100 });
      return;
    }

    if (!isConnected || !localBridgeIp) return;

    let ip = localBridgeIp;
    if (!ip.startsWith('http://') && !ip.startsWith('https://')) ip = 'http://' + ip;

    fetch(`${ip}/kelly`)
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(() => {});
  }, [kellyStats, isConnected, localBridgeIp]);

  // Calcul local du Kelly pour l'affichage
  function computeKellyFraction(winRate: number, rrRatio: number): number {
    const p = winRate;
    const q = 1 - p;
    const b = rrRatio;
    if (b <= 0) return 0;
    const rawKelly = Math.max(0, (p * b - q) / b);
    return Math.min(rawKelly * 0.25, 0.02); // 25% fractionnaire, max 2%
  }

  const kellyFrac = stats ? (stats.kellyFraction ?? computeKellyFraction(stats.winRate, stats.rrRatio)) : 0;
  const kellyPct  = kellyFrac * 100;
  const winPct    = stats ? Math.round(stats.winRate * 100) : 0;
  const hasEnoughData = stats && stats.tradeCount >= 20;

  const getKellyColor = (pct: number) => {
    if (pct >= 5)  return { bar: 'bg-red-500',    text: 'text-red-400',    label: 'TROP ÉLEVÉ' };
    if (pct >= 2)  return { bar: 'bg-amber-500',  text: 'text-amber-400',  label: 'PRUDENCE' };
    if (pct >= 1)  return { bar: 'bg-emerald-500', text: 'text-emerald-400', label: 'OPTIMAL' };
    return              { bar: 'bg-indigo-500',   text: 'text-indigo-400',  label: 'CONSERVATEUR' };
  };

  const colors = getKellyColor(kellyPct);

  return (
    <div className="glass-card rounded-2xl p-3.5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-slate-200 uppercase tracking-wide text-xs">
          <Target className="w-3.5 h-3.5 text-indigo-400" />
          <span>Kelly Criterion — Sizing</span>
        </div>
        {!hasEnoughData && (
          <div className="flex items-center gap-1 text-[9px] text-amber-400 font-mono">
            <AlertTriangle className="w-3 h-3" />
            <span>Données insuffisantes</span>
          </div>
        )}
      </div>

      {/* Métriques */}
      <div className="grid grid-cols-3 gap-2">
        {/* Win Rate */}
        <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-2.5 space-y-1 text-center">
          <div className="text-[9px] text-slate-500 font-mono uppercase tracking-wide">Win Rate</div>
          <div className={`text-lg font-bold font-mono ${winPct >= 55 ? 'text-emerald-400' : winPct >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
            {winPct}%
          </div>
          {/* Mini bar */}
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${winPct >= 55 ? 'bg-emerald-500' : winPct >= 45 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${winPct}%` }}
            />
          </div>
        </div>

        {/* R:R Ratio */}
        <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-2.5 space-y-1 text-center">
          <div className="text-[9px] text-slate-500 font-mono uppercase tracking-wide">Ratio R:R</div>
          <div className={`text-lg font-bold font-mono ${stats && stats.rrRatio >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {stats ? stats.rrRatio.toFixed(2) : '—'}
          </div>
          <div className="text-[9px] text-slate-500">
            {stats && stats.rrRatio >= 2 ? '🟢 Excellent' : stats && stats.rrRatio >= 1.5 ? '🟡 Bon' : '🔴 Faible'}
          </div>
        </div>

        {/* Trades */}
        <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-2.5 space-y-1 text-center">
          <div className="text-[9px] text-slate-500 font-mono uppercase tracking-wide">Échantillons</div>
          <div className={`text-lg font-bold font-mono ${hasEnoughData ? 'text-white' : 'text-amber-400'}`}>
            {stats ? stats.tradeCount : 0}
          </div>
          <div className="text-[9px] text-slate-500">{hasEnoughData ? 'Valide' : 'Min. 20'}</div>
        </div>
      </div>

      {/* Kelly Fraction — Barre principale */}
      <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/60 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-mono">
            <Activity className="w-3 h-3 text-indigo-400" />
            <span className="text-slate-300">Fraction Kelly (25%)</span>
          </div>
          <span className={`font-bold font-mono text-sm ${colors.text}`}>
            {kellyPct.toFixed(2)}%
          </span>
        </div>

        {/* Grande barre de progression */}
        <div className="relative w-full h-3 bg-slate-900 rounded-full overflow-hidden">
          <div
            className={`absolute left-0 top-0 h-full ${colors.bar} rounded-full transition-all duration-700`}
            style={{ width: `${Math.min(kellyPct * 10, 100)}%` }}
          />
          {/* Marqueur 2% = danger */}
          <div className="absolute top-0 h-full w-px bg-red-500/60" style={{ left: '20%' }} />
        </div>

        <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
          <span>0%</span>
          <span className="text-red-400/60">⚠ 2%</span>
          <span>10%+</span>
        </div>

        {/* Badge statut */}
        <div className="text-center">
          <span className={`text-[10px] font-bold font-mono ${colors.text} bg-slate-900/60 border border-slate-700/40 rounded-lg px-2 py-0.5`}>
            {colors.label}
          </span>
        </div>
      </div>

      {/* Formule Kelly */}
      <div className="bg-indigo-950/30 border border-indigo-800/30 rounded-xl p-2.5 space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] text-indigo-300 font-mono">
          <Info className="w-3 h-3" />
          <span>Formule de Kelly Fractionnaire</span>
        </div>
        <div className="text-[10px] text-slate-400 font-mono pl-4 space-y-0.5">
          <div>f* = (p × b − q) / b × 25%</div>
          <div className="text-slate-500">
            p={winPct}% | b={stats ? stats.rrRatio.toFixed(2) : '?'} | q={100 - winPct}%
          </div>
        </div>
      </div>

      {!hasEnoughData && (
        <div className="text-[10px] text-amber-400/80 text-center font-mono bg-amber-950/20 border border-amber-800/20 rounded-xl py-2 px-3">
          ⏳ Accumulation de {stats ? 20 - stats.tradeCount : 20} trades supplémentaires nécessaires
          <br />
          <span className="text-slate-500">Volume par défaut 0.01 lots utilisé en attendant</span>
        </div>
      )}
    </div>
  );
};
