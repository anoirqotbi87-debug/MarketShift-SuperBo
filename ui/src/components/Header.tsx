import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ViewMode, ThemeMode, MT5AccountState, RiskConfig } from '../types';
import { LogOut, ShieldAlert, Cpu, FileText, Smartphone, RefreshCw, Zap, WifiOff, AlertTriangle, Play, Radio, Sun, Moon, Contrast, Fingerprint, ChevronDown, Settings2, Wifi, Radio as WsRadio } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { WsStatus } from '../hooks/useMT5WebSocket';
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
  wsStatus?: WsStatus;
  wsErrorMsg?: string;
  onWsReconnect?: () => void;
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
  onSimulateDisconnect,
  wsStatus,
  wsErrorMsg,
  onWsReconnect,
}) => {
  const [isBioModalOpen, setIsBioModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState<boolean>(false);

  React.useEffect(() => {
    const handleOpenSettings = () => setIsSettingsOpen(true);
    window.addEventListener('open-settings', handleOpenSettings);
    return () => window.removeEventListener('open-settings', handleOpenSettings);
  }, []);
  const togglePaperTrading = () => {
    setAccountState(prev => ({
      ...prev,
      isPaperTrading: !prev.isPaperTrading
    }));
  };


  const toggleTheme = () => {
    if (!setThemeMode) return;
    if (themeMode === 'vanguard_obsidian') {
      setThemeMode('lumina_clean');
    } else if (themeMode === 'lumina_clean') {
      setThemeMode('deep_ocean');
    } else if (themeMode === 'deep_ocean') {
      setThemeMode('goldman_prestige');
    } else if (themeMode === 'goldman_prestige') {
      setThemeMode('monochrome_terminal');
    } else {
      setThemeMode('vanguard_obsidian');
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
                  <h1 className="text-base sm:text-lg font-bold text-white tracking-tight uppercase">MarketShift SuperBot V2.0</h1>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 rounded-md uppercase tracking-wider">
                    v2.0 Android
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono tracking-wide">ARCHITECTURE ML MOBILE-FIRST & CENTRE DE CONTRÔLE</p>
              </div>
            </div>

            {/* View Switcher Mobile - Removed, handled by BottomNavigation */}
            {/* Removed mobile settings button from top bar */}
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
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end font-mono mt-2 md:mt-0">

            {/* Removed desktop settings button from top bar */}

            {/* WebSocket Status Indicator */}
            {wsStatus && (
              <button
                onClick={onWsReconnect}
                title={`WebSocket: ${wsStatus}`}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold transition-all ${
                  wsStatus === 'connected'
                    ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                    : wsStatus === 'connecting' || wsStatus === 'reconnecting'
                    ? 'bg-amber-950/60 border-amber-800/60 text-amber-400 animate-pulse'
                    : 'bg-red-950/60 border-red-800/60 text-red-400'
                }`}
              >
                {wsStatus === 'connected' ? (
                  <><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /><span>WS</span></>
                ) : wsStatus === 'reconnecting' ? (
                  <><RefreshCw className="w-3 h-3 animate-spin" /><span>WS</span></>
                ) : wsStatus === 'fallback_polling' ? (
                  <><WifiOff className="w-3 h-3" /><span>POLL</span></>
                ) : (
                  <><AlertTriangle className="w-3 h-3" /><span>WS ERR {wsErrorMsg ? `(${wsErrorMsg})` : ''}</span></>
                )}
              </button>
            )}

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
              <span className="hidden sm:inline">{accountState.isConnected ? accountState.broker : 'DÉCONNECTÉ'}</span>
              <span className="hidden sm:inline text-slate-600">|</span>
              {accountState.isConnected ? (
                <span className="text-emerald-400 font-bold">{accountState.pingMs}ms</span>
              ) : (
                <span className="text-amber-400 font-bold">Reconnexion...</span>
              )}
            </button>

            {/* Auth Logout */}
            <button
              onClick={() => signOut(auth)}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 transition-all shadow-sm"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">SIGN OUT</span>
            </button>
            
            {/* Paper / Real Toggle */}
            <button
              onClick={togglePaperTrading}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold tracking-wide transition-all ${
                accountState.isPaperTrading
                  ? 'bg-amber-950/60 border-amber-700/60 text-amber-300 hover:bg-amber-900/60'
                  : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60'
              }`}
              title="Cliquer pour basculer entre Paper Trading (Démo) et Compte Réel MT5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{accountState.isPaperTrading ? 'PAPER DEMO' : 'COMPTE RÉEL'}</span>
            </button>

            {/* Theme Mode Toggler Menu */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-sm ${
                  themeMode === 'lumina_clean'
                    ? 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 shadow-sm'
                    : themeMode === 'deep_ocean'
                    ? 'bg-[#0d1b2a] border-[#415a77] text-[#e0e1dd] hover:bg-[#1b263b] shadow-sm'
                    : themeMode === 'goldman_prestige'
                    ? 'bg-[#0a0a0a] border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#151515] shadow-sm'
                    : themeMode === 'monochrome_terminal'
                    ? 'bg-black border-green-800 text-green-400 hover:bg-green-950/20 shadow-green-500/20'
                    : 'bg-[#14171c] hover:bg-[#1e2329] border-white/10 text-slate-300'
                }`}
                title="Choisir le thème"
              >
                {themeMode === 'lumina_clean' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden lg:inline">LUMINA</span>
                  </>
                ) : themeMode === 'deep_ocean' ? (
                  <>
                    <Moon className="w-3.5 h-3.5 text-[#e0e1dd]" />
                    <span className="hidden lg:inline">OCEAN</span>
                  </>
                ) : themeMode === 'goldman_prestige' ? (
                  <>
                    <Contrast className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span className="hidden lg:inline">GOLDMAN</span>
                  </>
                ) : themeMode === 'monochrome_terminal' ? (
                  <>
                    <Cpu className="w-3.5 h-3.5 text-green-400" />
                    <span className="hidden lg:inline">TERMINAL</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-slate-300" />
                    <span className="hidden lg:inline">VANGUARD</span>
                  </>
                )}
                <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </button>
              
              {isThemeMenuOpen && (
                <div className="absolute top-full mt-2 right-0 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="p-1">
                    {[
                      { id: 'vanguard_obsidian', icon: Moon, label: 'Vanguard Obsidian' },
                      { id: 'lumina_clean', icon: Sun, label: 'Lumina Clean' },
                      { id: 'deep_ocean', icon: Moon, label: 'Deep Ocean' },
                      { id: 'goldman_prestige', icon: Contrast, label: 'Goldman Prestige' },
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
        {riskConfig && setRiskConfig && typeof document !== 'undefined' && createPortal(
          <SettingsModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)} 
            riskConfig={riskConfig}
            setRiskConfig={setRiskConfig as any}
          />,
          document.body
        )}
        
        {typeof document !== 'undefined' && createPortal(
          <BiometricAuthModal
            isOpen={isBioModalOpen}
            onClose={() => setIsBioModalOpen(false)}
            onSuccess={() => {
              if (onResetCircuitBreaker) onResetCircuitBreaker();
            }}
            title="Réarmement Sécurisé du Bot MT5"
            description="Empreinte digitale / Face ID requise pour réinitialiser le coupe-circuit d'urgence et réautoriser le passage d'ordres."
            actionLabel="Réarmer Coupe-Circuit"
          />,
          document.body
        )}


      </div>
    </header>
  );
};

