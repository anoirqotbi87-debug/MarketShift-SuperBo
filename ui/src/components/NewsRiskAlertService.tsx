import React, { useState, useEffect } from 'react';
import { ActivePosition, RiskConfig } from '../types';
import { 
  ShieldAlert, AlertTriangle, ShieldCheck, Newspaper, Zap, RefreshCw, Flame, Sliders, Lock, ArrowDownRight, ArrowUpRight, Activity, Clock, CheckCircle2, PauseCircle, PlayCircle, Shield
} from 'lucide-react';

interface NewsRiskAlertServiceProps {
  onTriggerCircuitBreaker?: () => void;
  onTriggerAlertToast?: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'danger') => void;
  positions?: ActivePosition[];
  riskConfig?: RiskConfig;
  setRiskConfig?: React.Dispatch<React.SetStateAction<RiskConfig>>;
}

export interface NewsRiskLogEntry {
  id: string;
  time: string;
  headline: string;
  sentimentScore: number;
  actionTaken: string;
  severity: 'CRITICAL' | 'WARNING' | 'NORMAL';
}

export const NewsRiskAlertService: React.FC<NewsRiskAlertServiceProps> = ({
  onTriggerCircuitBreaker,
  onTriggerAlertToast,
  positions = [],
  riskConfig,
  setRiskConfig
}) => {
  // Service configuration state
  const [isEnabled, setIsEnabled] = useState<boolean>(riskConfig?.enableNewsSentimentFilter ?? true);
  const [sentimentThreshold, setSentimentThreshold] = useState<number>(riskConfig?.minNewsSentimentScore ?? -0.60);
  const [protectionMode, setProtectionMode] = useState<'HEDGE' | 'PAUSE' | 'KILL_SWITCH'>('HEDGE');

  // Keep synced with parent riskConfig
  useEffect(() => {
    if (riskConfig?.minNewsSentimentScore !== undefined) {
      setSentimentThreshold(riskConfig.minNewsSentimentScore);
    }
    if (riskConfig?.enableNewsSentimentFilter !== undefined) {
      setIsEnabled(riskConfig.enableNewsSentimentFilter);
    }
  }, [riskConfig?.minNewsSentimentScore, riskConfig?.enableNewsSentimentFilter]);
  
  // Real-time sentiment metrics
  const [currentSentiment, setCurrentSentiment] = useState<number>(-0.12); // Range -1.0 to +1.0
  const [latestHeadline, setLatestHeadline] = useState<string>('BCE: Lagarde garde une posture neutre face à la volatilité de l’énergie');
  const [isProtectionActive, setIsProtectionActive] = useState<boolean>(false);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [activeHedges, setActiveHedges] = useState<{ id: string; symbol: string; volume: number; entryPrice: number }[]>([]);

  // Logs of automated risk triggers
  const [eventLogs, setEventLogs] = useState<NewsRiskLogEntry[]>([
    {
      id: 'log-1',
      time: '18:42:10',
      headline: 'Royaume-Uni: Ventes au détail inférieures aux attentes (-1.2% m/m)',
      sentimentScore: -0.74,
      actionTaken: 'Couverture Protectrice (Hedge 0.10 lot GBPUSD) Déclenchée',
      severity: 'WARNING'
    },
    {
      id: 'log-2',
      time: '17:15:00',
      headline: 'FED: Powell évoque une trajectoire assouplie',
      sentimentScore: 0.85,
      actionTaken: 'Surveillance Ordinaire - Sentiment Positif',
      severity: 'NORMAL'
    }
  ]);

  // Cooldown timer handler
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) {
          setIsProtectionActive(false);
          if (onTriggerAlertToast) {
            onTriggerAlertToast(
              'Acalmie Volatilité Détectée',
              'Le sentiment marché s\'est stabilisé. Reprise automatique du passage d\'ordres MT5.',
              'success'
            );
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSeconds, onTriggerAlertToast]);

  // Internal trigger function when sentiment breaches threshold
  const handleBreachThreshold = (score: number, headline: string) => {
    if (!isEnabled) return;

    setIsProtectionActive(true);
    setCooldownSeconds(20); // 20 seconds auto-cooldown period

    let actionDesc = '';

    if (protectionMode === 'HEDGE') {
      const newHedge = {
        id: `hedge-${Date.now()}`,
        symbol: 'EURUSD',
        volume: 0.10,
        entryPrice: 1.08450
      };
      setActiveHedges(prev => [newHedge, ...prev]);
      actionDesc = `Haie de Protection Déclenchée : Vente Vendeuse 0.10 EURUSD @ 1.08450 (Delta-Neutre)`;
    } else if (protectionMode === 'PAUSE') {
      actionDesc = `Passage d'Ordres Mises en Pause Temporaire (Verrouillage MT5 EA)`;
    } else if (protectionMode === 'KILL_SWITCH') {
      actionDesc = `Déclenchement Coupe-Circuit d'Urgence Total`;
      if (onTriggerCircuitBreaker) onTriggerCircuitBreaker();
    }

    // Add log entry
    const newLog: NewsRiskLogEntry = {
      id: `log-${Date.now()}`,
      time: new Date().toLocaleTimeString('fr-FR'),
      headline,
      sentimentScore: score,
      actionTaken: actionDesc,
      severity: 'CRITICAL'
    };
    setEventLogs(prev => [newLog, ...prev.slice(0, 9)]);

    if (onTriggerAlertToast) {
      onTriggerAlertToast(
        'ALERTE RISQUE NEWS MACRO',
        `Chute drastique du sentiment (${score.toFixed(2)} < ${sentimentThreshold.toFixed(2)}). ${actionDesc}`,
        'danger'
      );
    }
  };

  // Simulate Bearish Flash News Event
  const simulateBearishFlash = () => {
    const flashScore = -0.82;
    const flashHeadline = 'FLASH: escalade militaire inattendue et rupture d\'approvisionnement énergétique majeur !';
    setCurrentSentiment(flashScore);
    setLatestHeadline(flashHeadline);
    handleBreachThreshold(flashScore, flashHeadline);
  };

  // Simulate Recovery Flash News Event
  const simulateBullishFlash = () => {
    const flashScore = 0.78;
    const flashHeadline = 'ACCORD BANQUES CENTRALES: Résolution pacifique et soutien massif à la liquidité bancaire.';
    setCurrentSentiment(flashScore);
    setLatestHeadline(flashHeadline);
    setIsProtectionActive(false);
    setCooldownSeconds(0);
    setActiveHedges([]);

    const newLog: NewsRiskLogEntry = {
      id: `log-${Date.now()}`,
      time: new Date().toLocaleTimeString('fr-FR'),
      headline: flashHeadline,
      sentimentScore: flashScore,
      actionTaken: 'Sentiment Rétabli. Levée des Protections et Clôture des Haies d\'Urgence',
      severity: 'NORMAL'
    };
    setEventLogs(prev => [newLog, ...prev.slice(0, 9)]);

    if (onTriggerAlertToast) {
      onTriggerAlertToast(
        'Rétablissement Sentiment Marché',
        'Le sentiment est revenu au vert (+0.78). Les protections de risque ont été levées.',
        'success'
      );
    }
  };

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 border border-slate-800/80 shadow-xl font-sans text-slate-100">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl border status-glow ${
            isProtectionActive 
              ? 'bg-rose-950/90 border-rose-600 text-rose-400 animate-pulse' 
              : 'bg-indigo-950/90 border-indigo-700 text-indigo-400'
          }`}>
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Service d'Alerte de Risque Basé sur les News Macro</span>
              <span className={`px-2 py-0.2 text-[9px] rounded-full font-mono font-bold border ${
                isProtectionActive
                  ? 'bg-rose-950 text-rose-300 border-rose-700 animate-pulse'
                  : isEnabled
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}>
                {isProtectionActive ? 'PROTECTION ACTIVE 🛡️' : isEnabled ? 'SURVEILLANCE AUTOMATIQUE ✓' : 'DESACTIVÉ'}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Détecte les ruptures brutales de sentiment et active un hedge protecteur ou stoppe les ordres MT5
            </p>
          </div>
        </div>

        {/* Master Toggle */}
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="text-slate-400">Protections Auto :</span>
          <button
            onClick={() => {
              const next = !isEnabled;
              setIsEnabled(next);
              if (setRiskConfig) {
                setRiskConfig(prev => ({ ...prev, enableNewsSentimentFilter: next }));
              }
            }}
            className={`px-3 py-1 rounded-xl border font-bold transition-all shadow-sm flex items-center gap-1.5 ${
              isEnabled
                ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400'
            }`}
          >
            {isEnabled ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
            <span>{isEnabled ? 'ACTIVÉ' : 'EN PAUSE'}</span>
          </button>
        </div>

      </div>

      {/* Live Sentiment Monitor Banner & Threshold Slider */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
        
        {/* Score Display Card */}
        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>Score Sentiment Instantané</span>
            <Newspaper className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-xl font-bold ${
              currentSentiment < sentimentThreshold 
                ? 'text-rose-400 animate-pulse' 
                : currentSentiment < 0 
                ? 'text-amber-400' 
                : 'text-emerald-400'
            }`}>
              {currentSentiment > 0 ? '+' : ''}{currentSentiment.toFixed(2)}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
              currentSentiment < sentimentThreshold
                ? 'bg-rose-950 text-rose-300 border-rose-800'
                : currentSentiment < 0
                ? 'bg-amber-950 text-amber-300 border-amber-800'
                : 'bg-emerald-950 text-emerald-300 border-emerald-800'
            }`}>
              {currentSentiment < sentimentThreshold ? 'CRITIQUE' : currentSentiment < 0 ? 'MODÉRÉ' : 'FAVORABLE'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 truncate pt-0.5" title={latestHeadline}>
            Dernier Titre: {latestHeadline}
          </div>
        </div>

        {/* Threshold Slider Card */}
        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>Seuil Limite de Déclenchement</span>
            <Sliders className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="-0.90"
              max="-0.30"
              step="0.05"
              value={sentimentThreshold}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setSentimentThreshold(val);
                if (setRiskConfig) {
                  setRiskConfig(prev => ({ ...prev, minNewsSentimentScore: val }));
                }
              }}
              className="w-full accent-rose-500 cursor-pointer"
            />
            <span className="font-bold text-rose-400 text-sm">{sentimentThreshold.toFixed(2)}</span>
          </div>
          <div className="text-[9.5px] text-slate-500">
            Alerte déclenchée si le score chute en-dessous de <span className="text-rose-400 font-bold">{sentimentThreshold.toFixed(2)}</span>
          </div>
        </div>

        {/* Action Strategy Switcher */}
        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1.5">
          <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
            <span>Action Automatique</span>
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => setProtectionMode('HEDGE')}
              className={`px-1.5 py-1 rounded text-[10px] font-bold border transition-all ${
                protectionMode === 'HEDGE' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              Hedge Auto
            </button>
            <button
              onClick={() => setProtectionMode('PAUSE')}
              className={`px-1.5 py-1 rounded text-[10px] font-bold border transition-all ${
                protectionMode === 'PAUSE' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              Pause EA
            </button>
            <button
              onClick={() => setProtectionMode('KILL_SWITCH')}
              className={`px-1.5 py-1 rounded text-[10px] font-bold border transition-all ${
                protectionMode === 'KILL_SWITCH' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              Stop Total
            </button>
          </div>
          <div className="text-[9.5px] text-slate-500">
            Mode: {protectionMode === 'HEDGE' ? 'Ouvre une position inverse couvrante' : protectionMode === 'PAUSE' ? 'Verrouille les nouveaux ordres MT5' : 'Arrête totalement le bot'}
          </div>
        </div>

      </div>

      {/* Simulation Trigger Panel & Cooldown Counter */}
      <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-xs">
        
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Tester les Réactions :</span>
          </span>
          <button
            onClick={simulateBearishFlash}
            className="px-2.5 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-700 text-rose-300 rounded-xl font-bold text-[10px] transition-all flex items-center gap-1 shadow-sm"
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>Simuler Flash Vendeur (-0.82)</span>
          </button>
          <button
            onClick={simulateBullishFlash}
            className="px-2.5 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 rounded-xl font-bold text-[10px] transition-all flex items-center gap-1 shadow-sm"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Simuler Reprise Haussière (+0.78)</span>
          </button>
        </div>

        {/* Cooldown Timer */}
        {cooldownSeconds > 0 && (
          <div className="flex items-center gap-2 text-amber-400 bg-amber-950/80 px-3 py-1 rounded-xl border border-amber-800 text-[11px] font-bold animate-pulse">
            <Clock className="w-4 h-4" />
            <span>Acalmie Volatilité: {cooldownSeconds}s restant</span>
          </div>
        )}

      </div>

      {/* Active Protective Hedges list if present */}
      {activeHedges.length > 0 && (
        <div className="bg-rose-950/40 p-3 rounded-xl border border-rose-800 space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between text-rose-300 font-bold uppercase text-[11px]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-rose-400" />
              <span>Positions de Couverture Active (Protective Hedges)</span>
            </span>
            <button
              onClick={() => setActiveHedges([])}
              className="text-[10px] underline text-rose-300 hover:text-white"
            >
              Clôturer les Haies
            </button>
          </div>
          <div className="space-y-1">
            {activeHedges.map(h => (
              <div key={h.id} className="bg-slate-950/80 p-2 rounded-lg border border-rose-900/60 flex items-center justify-between text-[11px] text-slate-200">
                <span>{h.symbol} • VENTE (SHORT)</span>
                <span>Volume: {h.volume} Lot</span>
                <span>Prix Entrée: {h.entryPrice}</span>
                <span className="text-emerald-400 font-bold">PROTÉGÉ (Delta 0.0)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event Timeline Log */}
      <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-2 font-mono text-xs">
        <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
          <span>Journal d'Alerte & Protections Déclenchées par les News</span>
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
        </div>

        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {eventLogs.map((log) => (
            <div key={log.id} className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10.5px]">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 shrink-0">{log.time}</span>
                <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] border ${
                  log.severity === 'CRITICAL' 
                    ? 'bg-rose-950 text-rose-300 border-rose-800' 
                    : log.severity === 'WARNING'
                    ? 'bg-amber-950 text-amber-300 border-amber-800'
                    : 'bg-slate-950 text-emerald-400 border-emerald-800'
                }`}>
                  Score: {log.sentimentScore > 0 ? '+' : ''}{log.sentimentScore.toFixed(2)}
                </span>
                <span className="text-slate-300 truncate max-w-xs sm:max-w-md">{log.headline}</span>
              </div>
              <span className="text-indigo-300 font-bold text-[10px] shrink-0">{log.actionTaken}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
