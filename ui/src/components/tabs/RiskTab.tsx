import React, { useState } from 'react';
import { RiskConfig } from '../../types';
import { Shield, Lock, ShieldAlert, Sliders, CheckCircle2, Fingerprint, Newspaper, AlertTriangle } from 'lucide-react';
import { BiometricAuthModal } from '../BiometricAuthModal';
import { CollapsibleSection } from '../CollapsibleSection';

interface RiskTabProps {
  riskConfig: RiskConfig;
  setRiskConfig: React.Dispatch<React.SetStateAction<RiskConfig>>;
  onTriggerCircuitBreaker: () => void;
  onResetCircuitBreaker: () => void;
}

export const RiskTab: React.FC<RiskTabProps> = ({
  riskConfig,
  setRiskConfig,
  onTriggerCircuitBreaker,
  onResetCircuitBreaker
}) => {
  const [isBioModalOpen, setIsBioModalOpen] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<'RESET_BREAKER' | 'UNLOCK_RISK' | null>(null);
  const [isRiskUnlocked, setIsRiskUnlocked] = useState<boolean>(false);

  const handleRequestResetBreaker = () => {
    setPendingAction('RESET_BREAKER');
    setIsBioModalOpen(true);
  };

  const handleRequestUnlockRisk = () => {
    if (isRiskUnlocked) {
      setIsRiskUnlocked(false);
    } else {
      setPendingAction('UNLOCK_RISK');
      setIsBioModalOpen(true);
    }
  };

  const handleAuthSuccess = () => {
    if (pendingAction === 'RESET_BREAKER') {
      onResetCircuitBreaker();
    } else if (pendingAction === 'UNLOCK_RISK') {
      setIsRiskUnlocked(true);
    }
    setPendingAction(null);
  };

  return (
    <div className="space-y-4 text-slate-100 text-xs">
      
      {/* Keystore Security Badge */}
      <div className="glass-card rounded-2xl p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 rounded-xl status-glow">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-white text-sm uppercase font-mono tracking-tight">Android Keystore Chiffré</div>
            <div className="text-[10px] text-slate-400 font-sans">AES-256-GCM Hardware TrustZone & Biométrie Active</div>
          </div>
        </div>
        <span className="text-[10px] text-emerald-300 font-mono font-bold flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-700/60 px-2.5 py-1 rounded-xl status-glow">
          <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
          BIOMÉTRIE ACTIVE
        </span>
      </div>

      {/* Circuit Breaker Controls */}
      <CollapsibleSection
        title="Coupe-Circuit & Alertes"
        icon={<ShieldAlert className="w-4 h-4" />}
        defaultExpanded={true}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between font-bold text-slate-200">
            <span className="flex items-center gap-1.5 uppercase tracking-wide">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              Coupe-Circuit d'Urgence
            </span>
            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold ${
              riskConfig.circuitBreakerActive ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
            }`}>
              {riskConfig.circuitBreakerActive ? 'DÉCLENCHÉ' : 'OPÉRATIONNEL'}
            </span>
          </div>

          <p className="text-[11px] text-slate-400 font-sans">
            Le coupe-circuit bloque automatiquement tout nouvel ordre si la perte journalière dépasse {riskConfig.maxDailyLossPct}% ou en cas d'anomalie réseau.
          </p>

          {riskConfig.circuitBreakerActive ? (
            <button
              onClick={handleRequestResetBreaker}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold font-mono text-xs transition-all shadow-lg shadow-emerald-600/30 uppercase flex items-center justify-center gap-2"
            >
              <Fingerprint className="w-4 h-4" />
              <span>Réarmer Bot (Authentification Biométrique)</span>
            </button>
          ) : (
            <button
              onClick={onTriggerCircuitBreaker}
              className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold font-mono text-xs transition-all shadow-lg shadow-red-600/30 uppercase"
            >
              Déclencher Coupe-Circuit d'Urgence
            </button>
          )}
        </div>
      </CollapsibleSection>

      {/* Position Sizing & Kelly Slider */}
      <CollapsibleSection
        title="Gestion de Position & Marges"
        icon={<Sliders className="w-4 h-4" />}
        defaultExpanded={false}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between font-bold text-slate-200">
            <span className="flex items-center gap-1.5 uppercase tracking-wide">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              Dimensionnement Positions & Risque MT5
            </span>

            <button
              onClick={handleRequestUnlockRisk}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-mono text-[10px] font-bold transition-all ${
                isRiskUnlocked 
                  ? 'bg-amber-950 text-amber-300 border border-amber-800' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
              }`}
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>{isRiskUnlocked ? 'Verrouiller' : 'Déverrouiller'}</span>
            </button>
          </div>

          {!isRiskUnlocked && (
            <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-center gap-1.5 text-center">
              <Lock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Paramètres Protégés par Authentification Biométrique Production</span>
            </div>
          )}

          {/* Risk Per Trade Slider */}
          <div className={`space-y-1 font-mono ${!isRiskUnlocked ? 'opacity-60 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-sans">Risque par Trade (% capital) :</span>
              <span className="font-bold text-indigo-400">{riskConfig.maxRiskPerTradePct}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.1"
              disabled={!isRiskUnlocked}
              value={riskConfig.maxRiskPerTradePct}
              onChange={(e) => setRiskConfig(prev => ({ ...prev, maxRiskPerTradePct: parseFloat(e.target.value) }))}
              className="w-full accent-indigo-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>

          {/* Max Daily Loss */}
          <div className={`space-y-1 font-mono ${!isRiskUnlocked ? 'opacity-60 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-sans">Perte Maximale Journalière (Max Loss) :</span>
              <span className="font-bold text-red-400">{riskConfig.maxDailyLossPct}%</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="6.0"
              step="0.5"
              disabled={!isRiskUnlocked}
              value={riskConfig.maxDailyLossPct}
              onChange={(e) => setRiskConfig(prev => ({ ...prev, maxDailyLossPct: parseFloat(e.target.value) }))}
              className="w-full accent-red-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>

          {/* ATR Multipliers */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 font-mono">
            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 space-y-1">
              <div className="text-[10px] text-slate-400 font-sans">Stop Loss (ATR)</div>
              <div className="font-bold text-amber-400">{riskConfig.atrMultiplierSL}x ATR</div>
            </div>
            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 space-y-1">
              <div className="text-[10px] text-slate-400 font-sans">Take Profit (ATR)</div>
              <div className="font-bold text-emerald-400">{riskConfig.atrMultiplierTP}x ATR</div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* News Sentiment Filter Controls */}
      <CollapsibleSection
        title="Actualités & Sentiment"
        icon={<Newspaper className="w-4 h-4" />}
        defaultExpanded={false}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between font-bold text-slate-200">
            <span className="flex items-center gap-1.5 uppercase tracking-wide">
              <Newspaper className="w-3.5 h-3.5 text-indigo-400" />
              Filtre de Sentiment Macro-Économique (News NLP)
            </span>
            <button
              onClick={() => {
                if (isRiskUnlocked) {
                  setRiskConfig(prev => ({
                    ...prev,
                    enableNewsSentimentFilter: !(prev.enableNewsSentimentFilter ?? true)
                  }));
                }
              }}
              disabled={!isRiskUnlocked}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold transition-all border ${
                (riskConfig.enableNewsSentimentFilter ?? true)
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700/80'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              } ${!isRiskUnlocked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}
            >
              {(riskConfig.enableNewsSentimentFilter ?? true) ? 'FILTRE ACTIF ✓' : 'FILTRE INACTIF'}
            </button>
          </div>

          <p className="text-[11px] text-slate-400 font-sans">
            Si le score de sentiment calculé par le module d'analyse NLP des actualités financières descend sous le seuil défini, le bot cesse automatiquement d'exécuter de nouveaux ordres pour éviter les secousses de forte volatilité.
          </p>

          {/* Sentiment Threshold Slider */}
          <div className={`space-y-1.5 font-mono ${!(riskConfig.enableNewsSentimentFilter ?? true) || !isRiskUnlocked ? 'opacity-60 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-sans">Seuil de Sentiment Minimal Autorisé :</span>
              <span className="font-bold text-rose-400 bg-rose-950/80 border border-rose-800 px-2 py-0.5 rounded text-[11px]">
                {(riskConfig.minNewsSentimentScore ?? -0.60).toFixed(2)}
              </span>
            </div>
            
            <input
              type="range"
              min="-0.90"
              max="0.00"
              step="0.05"
              disabled={!(riskConfig.enableNewsSentimentFilter ?? true) || !isRiskUnlocked}
              value={riskConfig.minNewsSentimentScore ?? -0.60}
              onChange={(e) => setRiskConfig(prev => ({ ...prev, minNewsSentimentScore: parseFloat(e.target.value) }))}
              className="w-full accent-rose-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer disabled:cursor-not-allowed"
            />

            <div className="flex justify-between text-[9.5px] text-slate-500">
              <span>-0.90 (Panique Extreme)</span>
              <span>-0.60 (Recommandé)</span>
              <span>0.00 (Neutre)</span>
            </div>
          </div>

          {/* Status Indicator Banner */}
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2 text-[11px] font-mono">
            <AlertTriangle className={`w-4 h-4 shrink-0 ${
              (riskConfig.enableNewsSentimentFilter ?? true) ? 'text-amber-400' : 'text-slate-500'
            }`} />
            <span className="text-slate-300">
              {(riskConfig.enableNewsSentimentFilter ?? true)
                ? `Le bot bloquera tout nouveau trade dès que le sentiment sera < ${(riskConfig.minNewsSentimentScore ?? -0.60).toFixed(2)}.`
                : 'Le filtrage de sentiment est désactivé. Le bot prendra des trades sans filtre d’actualités.'}
            </span>
          </div>
        </div>
      </CollapsibleSection>

      {/* Biometric Prompt Modal */}
      <BiometricAuthModal
        isOpen={isBioModalOpen}
        onClose={() => setIsBioModalOpen(false)}
        onSuccess={handleAuthSuccess}
        title={pendingAction === 'UNLOCK_RISK' ? "Modification du Risque MT5" : "Réarmement Sécurisé du Bot"}
        description={
          pendingAction === 'UNLOCK_RISK'
            ? "Empreinte digitale / Face ID requise pour déverrouiller et modifier les plafonds de perte et de risque par trade."
            : "Empreinte digitale / Face ID requise pour réinitialiser le coupe-circuit et réautoriser le passage d'ordres MT5."
        }
        actionLabel={pendingAction === 'UNLOCK_RISK' ? "Autoriser Modification" : "Réarmer Coupe-Circuit"}
      />

    </div>
  );
};
