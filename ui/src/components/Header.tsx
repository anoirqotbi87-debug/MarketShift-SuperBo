import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import React, { useState } from 'react';
import { ViewMode, ThemeMode, MT5AccountState, RiskConfig } from '../types';
import { LogOut, ShieldAlert, Cpu, FileText, Smartphone, RefreshCw, Zap, WifiOff, AlertTriangle, Play, Radio, Sun, Moon, Contrast, Fingerprint, ChevronDown, Settings2 } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { BiometricAuthModal } from './BiometricAuthModal';

interface HeaderProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  themeMode?: ThemeMode;
  setThemeMode?: (mode: ThemeMode) => void;
  accountState: MT5AccountState;
  setAccountState: React.Dispatch<React.SetStateAction<MT5AccountState>>;
  riskConfig: RiskConfig;
  setRiskConfig?: React.Dispatch<React.SetStateAction<RiskConfig>>;
  onTriggerCircuitBreaker: () => void;
  onResetCircuitBreaker?: () => void;
  onForceReconnect?: () => void;
  onSimulateDisconnect?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  viewMode,
  setViewMode,
  themeMode = 'cyber_dark',
  setThemeMode,
  accountState,
  setAccountState,
  riskConfig,
  setRiskConfig,
  onTriggerCircuitBreaker,
  onResetCircuitBreaker,
  onForceReconnect,
  onSimulateDisconnect
}) => {
  const [isBioModalOpen, setIsBioModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState<boolean>(false);
  const togglePaperTrading = () => {
    setAccountState(prev => ({
      ...prev,
      isPaperTrading: !prev.isPaperTrading
    }));
  };


  const toggleTheme = () => {
    if (!setThemeMode) return;
    if (themeMode === 'neon_synthwave') {
      setThemeMode('arctic_light');
    } else if (themeMode === 'arctic_light') {
      setThemeMode('monochrome_terminal');
    } else if (themeMode === 'monochrome_terminal') {
      setThemeMode('high_contrast_pro');
    } else if (themeMode === 'high_contrast_pro') {
      setThemeMode('cyber_dark');
    } else {
      setThemeMode('neon_synthwave');
    }
  };

  const handleToggleConnectionState = () => {
    if (accountState.isConnected) {
      if (onSimulateDisconnect) {
        onSimulateDisconnect();
      } else {
        setAccountState(prev => ({ ...prev, isConnected: false }));
      }
    } else {
      if (onForceReconnect) {
        onForceReconnect();
      } else {
        setAccountState(prev => ({ ...prev, isConnected: true }));
      }
    }
  };

  const reconn = accountState.reconnectionState;

  return (
    <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-50 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-2">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-lg shadow-indigo-600/30 indigo-glow">
                M
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold text-white tracking-tight uppercase">MarketShift Pro V3.4</h1>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 rounded-md uppercase tracking-wider">
                    v3.4 Android
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono tracking-wide">ARCHITECTURE ML MOBILE-FIRST & CENTRE DE CONTRÔLE</p>
              </div>
            </div>

            {/* View Switcher Mobile */}
            <div className="flex md:hidden bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setViewMode('simulator')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'simulator'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                App
              </button>
              <button
                onClick={() => setViewMode('doc')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'doc'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Plan
              </button>
            </div>
          </div>

          {/* Center: Main View Toggle Desktop */}
          <div className="hidden md:flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800/80 shadow-inner">
            <button
              onClick={() => setViewMode('simulator')}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'simulator'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Smartphone className="w-4 h-4 text-indigo-300" />
              Simulateur Hub Mobile Android
            </button>
            <button
              onClick={() => setViewMode('doc')}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'doc'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileText className="w-4 h-4 text-indigo-300" />
              Plan d'Action & Architecture Technique
            </button>
          </div>

          {/* Right Status Controls */}
          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end font-mono">
            
            {/* Connection Status Pill & Simulation Switch */}
            <button
              onClick={handleToggleConnectionState}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-sm ${
                accountState.isConnected
                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                  : 'bg-red-950/90 border-red-800 text-red-300 animate-pulse'
              }`}
              title={accountState.isConnected ? 'Cliquer pour simuler une déconnexion MT5' : 'Cliquer pour forcer la reconnexion immédiatement'}
            >
              <span className={`w-2 h-2 rounded-full ${accountState.isConnected ? 'bg-emerald-400 status-glow' : 'bg-red-500 animate-ping'}`} />
              <span>{accountState.isConnected ? accountState.broker : 'DÉCONNECTÉ'}</span>
              <span className="text-slate-600">|</span>
              {accountState.isConnected ? (
                <span className="text-emerald-400 font-bold">{accountState.pingMs}ms</span>
              ) : (
                <span className="text-amber-400 font-bold">Reconnexion...</span>
              )}
            </button>

            {/* Auth Logout */}
            <button
              onClick={() => signOut(auth)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 transition-all shadow-sm"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">SIGN OUT</span>
            </button>
            
            {/* Paper / Real Toggle */}
            <button
              onClick={togglePaperTrading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold tracking-wide transition-all ${
                accountState.isPaperTrading
                  ? 'bg-amber-950/60 border-amber-700/60 text-amber-300 hover:bg-amber-900/60'
                  : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60'
              }`}
              title="Cliquer pour basculer entre Paper Trading (Démo) et Compte Réel MT5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{accountState.isPaperTrading ? 'PAPER DEMO' : 'COMPTE RÉEL'}</span>
            </button>

            {/* Theme Mode Toggler Menu */}
            <div className="relative">
              <button
                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-sm ${
                  themeMode === 'neon_synthwave'
                    ? 'bg-fuchsia-950/50 border-fuchsia-500 text-fuchsia-300 hover:bg-fuchsia-900 shadow-fuchsia-500/20'
                    : themeMode === 'arctic_light'
                    ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50 shadow-sm'
                    : themeMode === 'monochrome_terminal'
                    ? 'bg-black border-green-800 text-green-400 hover:bg-green-950/20 shadow-green-500/20'
                    : themeMode === 'high_contrast_pro'
                    ? 'bg-indigo-950 border-indigo-500 text-indigo-300 hover:bg-indigo-900 shadow-indigo-500/20'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
                title="Choisir le thème"
              >
                {themeMode === 'high_contrast_pro' ? (
                  <>
                    <Contrast className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden lg:inline">PRO</span>
                  </>
                ) : themeMode === 'neon_synthwave' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span className="hidden lg:inline">NEON</span>
                  </>
                ) : themeMode === 'arctic_light' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden lg:inline">ARCTIC</span>
                  </>
                ) : themeMode === 'monochrome_terminal' ? (
                  <>
                    <Cpu className="w-3.5 h-3.5 text-green-400" />
                    <span className="hidden lg:inline">TERMINAL</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="hidden lg:inline">DARK</span>
                  </>
                )}
                <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </button>
              
              {isThemeMenuOpen && (
                <div className="absolute top-full mt-2 right-0 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="p-1">
                    {[
                      { id: 'cyber_dark', icon: Moon, label: 'Cyber Dark' },
                      { id: 'high_contrast_pro', icon: Contrast, label: 'High Contrast Pro' },
                      { id: 'neon_synthwave', icon: Sun, label: 'Neon Synthwave' },
                      { id: 'arctic_light', icon: Sun, label: 'Arctic Light' },
                      { id: 'monochrome_terminal', icon: Cpu, label: 'Mono Terminal' },
                    ].map((theme) => {
                      const Icon = theme.icon;
                      return (
                        <button
                          key={theme.id}
                          onClick={() => {
                            if (setThemeMode) setThemeMode(theme.id as ThemeMode);
                            setIsThemeMenuOpen(false);
                          }}
                          className={`flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold rounded-lg text-left transition-colors ${
                            themeMode === theme.id ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {theme.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Settings Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all shadow-sm"
              title="Paramètres de l'application"
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {/* Emergency Circuit Breaker Kill Switch / Reset Button */}
            <button
              onClick={() => {
                if (riskConfig.circuitBreakerActive) {
                  setIsBioModalOpen(true);
                } else {
                  onTriggerCircuitBreaker();
                }
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-md ${
                riskConfig.circuitBreakerActive
                  ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white shadow-emerald-600/30 hover:scale-105 active:scale-95 animate-pulse'
                  : 'bg-red-600 hover:bg-red-500 border-red-500 text-white shadow-red-600/30 hover:scale-105 active:scale-95'
              }`}
              title={
                riskConfig.circuitBreakerActive
                  ? "Cliquer pour réarmer le bot via authentification biométrique"
                  : "Interrupteur d'urgence: Arrête le bot et ferme les ordres immédiatement"
              }
            >
              {riskConfig.circuitBreakerActive ? <Fingerprint className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
              <span className="hidden sm:inline">
                {riskConfig.circuitBreakerActive ? 'RÉARMER (BIOMÉTRIE)' : 'STOP D\'URGENCE'}
              </span>
            </button>

          </div>

        </div>

        {/* Biometric Prompt Modal for Header Reset */}
        {riskConfig && setRiskConfig && (
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
          riskConfig={riskConfig}
          setRiskConfig={setRiskConfig as any}
        />
      )}
      <BiometricAuthModal
          isOpen={isBioModalOpen}
          onClose={() => setIsBioModalOpen(false)}
          onSuccess={() => {
            if (onResetCircuitBreaker) onResetCircuitBreaker();
          }}
          title="Réarmement Sécurisé du Bot MT5"
          description="Empreinte digitale / Face ID requise pour réinitialiser le coupe-circuit d'urgence et réautoriser le passage d'ordres."
          actionLabel="Réarmer Coupe-Circuit"
        />

        {/* RECONNECTION PROGRESS BAR BANNER (Triggers automatically when isConnected is false) */}
        {!accountState.isConnected && (
          <div className="bg-red-950/90 border border-red-700/80 rounded-2xl p-3 shadow-2xl backdrop-blur-md text-red-100 font-mono space-y-2 animate-slideDown">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-red-900/80 border border-red-600 rounded-xl text-red-300 animate-pulse shrink-0">
                  <WifiOff className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                    <span>Coupure MT5 Détectée</span>
                    <span className="px-2 py-0.2 bg-red-900/80 text-amber-300 border border-amber-600/80 text-[10px] rounded-full font-mono">
                      Backoff Exponentiel #{reconn?.attempt || 1}
                    </span>
                  </div>
                  <div className="text-[11px] text-red-200/90 font-sans">
                    Prochaine tentative dans <span className="font-bold text-amber-300">{reconn?.nextAttemptInSec || 2.0}s</span> (Délai exponentiel : {(reconn?.backoffDelayMs || 2000) / 1000}s)
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={onForceReconnect || handleToggleConnectionState}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-[11px] flex items-center gap-1.5 shadow-md transition-all uppercase tracking-wider shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Forcer Reconnexion</span>
                </button>
              </div>

            </div>

            {/* Progress Bar Track */}
            <div className="space-y-1">
              <div className="w-full bg-slate-900/90 h-2 rounded-full overflow-hidden border border-red-800/80">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 transition-all duration-75 ease-linear rounded-full shadow-[0_0_12px_rgba(245,158,11,0.6)]"
                  style={{ width: `${reconn?.progressPct || 0}%` }}
                />
              </div>

              <div className="flex justify-between text-[9px] text-red-300/80 font-sans">
                <span>Raison: {reconn?.lastDisconnectReason || 'Interruption Socket ZeroMQ'}</span>
                <span>Progression : {Math.round(reconn?.progressPct || 0)}%</span>
              </div>
            </div>

          </div>
        )}

      </div>
    </header>
  );
};

