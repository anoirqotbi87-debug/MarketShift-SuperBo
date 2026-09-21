import React, { useState, useEffect, useCallback } from 'react';
import { ViewMode, ThemeMode, MT5AccountState, ActivePosition, ClosedTrade, MLModelStats, RiskConfig, LogEntry } from './types';
import { auth, db, isMockConfig } from './firebase';
// Mock User type since firebase is removed
interface User {
  uid: string;
  email: string;
}
import { LoginScreen } from './components/LoginScreen';
import { Header } from './components/Header';
import { MainAppView } from './components/MainAppView';
import { ArchitectureDocView } from './components/ArchitectureDocView';
import { BottomNavigation } from './components/BottomNavigation';
import { useMT5Connection } from './hooks/useMT5Connection';
import { ReconnectionToast } from './components/ReconnectionToast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from 'sonner';
import { getApiBaseUrl } from './utils/api';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('simulator');
  const [activeTab, setActiveTab] = useState<ActiveTabSimulator>('dashboard');

  // Theme Mode ('vanguard_obsidian' | 'lumina_clean' | 'deep_ocean' | 'goldman_prestige' | 'monochrome_terminal') with localStorage persistence
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('marketshift_theme_mode');
      if (saved && ['vanguard_obsidian', 'lumina_clean', 'deep_ocean', 'goldman_prestige', 'monochrome_terminal'].includes(saved)) {
        return saved as ThemeMode;
      }
    } catch {
      // fallback if localStorage disabled
    }
    return 'vanguard_obsidian';
  });

  // Apply theme class to document root for global CSS overrides
  useEffect(() => {
    try {
      localStorage.setItem('marketshift_theme_mode', themeMode);
    } catch {
      // ignore
    }
    
    document.documentElement.classList.remove('theme-lumina-clean', 'theme-deep-ocean', 'theme-goldman-prestige', 'theme-monochrome-terminal');
    
    // Add current theme class
    if (themeMode === 'lumina_clean') {
      document.documentElement.classList.add('theme-lumina-clean');
    } else if (themeMode === 'deep_ocean') {
      document.documentElement.classList.add('theme-deep-ocean');
    } else if (themeMode === 'goldman_prestige') {
      document.documentElement.classList.add('theme-goldman-prestige');
    } else if (themeMode === 'monochrome_terminal') {
      document.documentElement.classList.add('theme-monochrome-terminal');
    }
    // vanguard_obsidian is the default, no class needed
  }, [themeMode]);

  // MT5 Account State
  const [accountState, setAccountState] = useState<MT5AccountState>({
    accountNumber: '-',
    broker: '-',
    server: '-',
    balance: 0.00,
    equity: 0.00,
    freeMargin: 0.00,
    marginLevelPct: 0.0,
    unrealizedPnL: 0.00,
    dailyPnL: 0.00,
    dailyPnLPct: 0.00,
    currency: 'USD',
    isPaperTrading: false,
    isConnected: false,
    pingMs: 0
  });

  // Active MT5 Positions
  const [positions, setPositions] = useState<ActivePosition[]>([]);

  // Closed MT5 Trades History
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);

  // ML Model Stats (Empty/Loading state initially)
  const [mlStats, setMlStats] = useState<MLModelStats>({
    modelName: 'XGBoost_LSTM_Ensemble_v2.4',
    architecture: 'XGBoost + LSTM Ensemble',
    accuracy: 0.0,
    f1Score: 0.0,
    inferenceTimeMs: 0.0,
    lastRetrained: '-',
    featuresCount: 38,
    currentSignal: {
      symbol: '-',
      direction: 'NEUTRAL',
      confidence: 0,
      features: []
    }
  });

  const [riskConfig, setRiskConfig] = useState<RiskConfig>(() => {
    try {
      const saved = localStorage.getItem('marketshift_risk_config');
      console.log("[App] Loading RiskConfig from localStorage:", saved);
      if (saved) {
        const parsed = JSON.parse(saved);

        // --- AUTO-FIX / MIGRATION ---
        // 1. If it looks like a fresh install or bad data, default to Cloud
        if (parsed.useLocalBridge === undefined) parsed.useLocalBridge = false;

        // 2. If the user put the UUID in the Token field (common mistake)
        // UUIDs are 36 chars long. Real MetaApi tokens are very long JWTs.
        if (parsed.metaApiToken && parsed.metaApiToken.length === 36 && parsed.metaApiToken.includes('-')) {
            console.warn("[App] MIGRATION: Moving UUID from Token to AccountID field");
            parsed.metaApiAccountId = parsed.metaApiToken;
            parsed.metaApiToken = "";
            parsed.useLocalBridge = false;
        }

        // Keep the saved IP if it exists, otherwise default to hostname
        if (!parsed.localBridgeIp) {
            parsed.localBridgeIp = `${getApiBaseUrl()}`;
        }
        return parsed;
      }
    } catch {
      // fallback
    }
    return {
      maxRiskPerTradePct: 1.0,
      maxDailyLossPct: 3.0,
      maxTotalDrawdownPct: 8.0,
      maxOpenPositions: 3,
      atrMultiplierSL: 1.8,
      atrMultiplierTP: 3.2,
      useTrailingStop: true,
      trailingStopAtr: 1.5,
      useKellyCriterion: true,
      circuitBreakerActive: false,
      enableNewsSentimentFilter: true,
      minNewsSentimentScore: -0.60,
      useLocalBridge: false,
      localBridgeIp: `${getApiBaseUrl()}`
    };
  });

  // Log Entries Stream
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Callback to append logs from connection hook
  const handleAddConnectionLog = useCallback((message: string, level: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR' = 'INFO') => {
    setLogs(prev => [
      {
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        level,
        module: 'MT5_BRIDGE',
        message
      },
      ...prev
    ]);
  }, []);

  // Hook for MT5 automatic reconnection with exponential backoff

  const handleApplyNewsWeightToML = (boostPct: number, reason: string) => {
    setMlStats(prev => {
      const currentConf = prev.currentSignal.confidence;
      const newConf = Math.min(100, Math.max(0, currentConf + boostPct * 100));
      return {
        ...prev,
        currentSignal: {
          ...prev.currentSignal,
          confidence: Math.round(newConf * 10) / 10,
          features: [
            { name: `NLP Impact: ${reason.substring(0, 20)}...`, impact: Math.abs(boostPct) },
            ...prev.currentSignal.features
          ].slice(0, 8)
        }
      };
    });
    
    setLogs(prev => [
      {
        id: `log-news-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: 'ML_PRED',
        module: 'ML_ENGINE',
        message: `NLP News Weight appliqué: ${boostPct > 0 ? '+' : ''}${(boostPct * 100).toFixed(1)}% (${reason})`
      },
      ...prev
    ]);
  };

  const { forceReconnect, simulateDisconnect, executeTrade, closePosition, wsStatus, wsErrorMsg } = useMT5Connection(
    accountState,
    setAccountState,
    riskConfig,
    setMlStats,
    setPositions,
    setClosedTrades,
    setLogs,
    {
      baseDelayMs: 2000,
      maxDelayMs: 30000,
      maxAttempts: 5,
      onLogAdd: handleAddConnectionLog
    }
  );

  // Handle Triggering Circuit Breaker
  const handleTriggerCircuitBreaker = () => {
    setRiskConfig(prev => ({
      ...prev,
      circuitBreakerActive: true,
      circuitBreakerReason: 'Arrêt d\'urgence déclenché manuellement depuis l\'application Android.',
      circuitBreakerTriggeredAt: new Date().toLocaleTimeString()
    }));

    setLogs(prev => [
      {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        level: 'CIRCUIT_BREAKER',
        module: 'RISK_ENGINE',
        message: 'COUPE-CIRCUIT D\'URGENCE DÉCLENCHÉ: Nouveau trade verrouillé.'
      },
      ...prev
    ]);
  };

  // Handle Resetting Circuit Breaker
  const handleResetCircuitBreaker = () => {
    setRiskConfig(prev => ({
      ...prev,
      circuitBreakerActive: false,
      circuitBreakerReason: undefined,
      circuitBreakerTriggeredAt: undefined
    }));

    setLogs(prev => [
      {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        level: 'SUCCESS',
        module: 'RISK_ENGINE',
        message: 'Coupe-circuit réarmé. Le bot reprend l\'analyse normale.'
      },
      ...prev
    ]);
  };


  useEffect(() => {
    if (isMockConfig || !auth) {
      setUser({ uid: 'mock-user-123', email: 'demo@example.com' } as User);
      setAuthLoading(false);
      return;
    }

    // Mock auth logic
    setUser({ uid: 'mock-user-123', email: 'demo@example.com' } as User);
    setAuthLoading(false);
  }, []);

  // Save risk config to firestore when it changes (debounce could be added, but simplistic for now)
  useEffect(() => {
    try {
      localStorage.setItem('marketshift_risk_config', JSON.stringify(riskConfig));
    } catch (e) {
      console.error('Failed to save riskConfig locally', e);
    }

    if (isMockConfig || !db) return;
    
    // Removed firebase write logic
    if (user && !authLoading) {
      console.log('Would save to firestore:', riskConfig);
    }
  }, [riskConfig, user, authLoading]);

  // Removed fake periodic heartbeat simulation in production mode

  if (authLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>;
  if (!user) return <LoginScreen />;

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950">
      
      {/* Global Alerts */}
      <Toaster theme="dark" position="top-right" richColors />

      {/* App Header */}
      <Header 
        viewMode={viewMode}
        setViewMode={setViewMode}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        accountState={accountState}
        setAccountState={setAccountState}
        riskConfig={riskConfig}
        setRiskConfig={setRiskConfig}
        onTriggerCircuitBreaker={handleTriggerCircuitBreaker}
        onResetCircuitBreaker={handleResetCircuitBreaker}
        onForceReconnect={forceReconnect}
        onSimulateDisconnect={simulateDisconnect}
        isWsConnected={wsStatus === 'connected'}
        wsStatus={wsStatus}
        wsErrorMsg={wsErrorMsg}
        onWsReconnect={forceReconnect}
      />

      {/* Main View Area */}
      <main className="flex-1 overflow-hidden relative">
        {viewMode === 'simulator' ? (
          <ErrorBoundary>
            <MainAppView
              accountState={accountState}
              setAccountState={setAccountState}
              positions={positions}
              setPositions={setPositions}
              closedTrades={closedTrades}
              setClosedTrades={setClosedTrades}
              mlStats={mlStats}
              onApplyNewsWeightToML={handleApplyNewsWeightToML}
              riskConfig={riskConfig}
              setRiskConfig={setRiskConfig}
              logs={logs}
              setLogs={setLogs}
              onTriggerCircuitBreaker={handleTriggerCircuitBreaker}
              onResetCircuitBreaker={handleResetCircuitBreaker}
              executeTrade={executeTrade}
              closePosition={closePosition}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          </ErrorBoundary>
        ) : (
          <ArchitectureDocView />
        )}
        <ReconnectionToast reconnectionState={accountState.reconnectionState} />
      </main>

      <footer className="hidden md:block border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>BotTrading MT5 Android ML — Architecture & Engine Hub</div>
          <div className="text-[11px]">Développé avec React 19, Tailwind CSS, Express, ZeroMQ & Gemini AI</div>
        </div>
      </footer>

      <BottomNavigation
        viewMode={viewMode}
        setViewMode={setViewMode}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </div>
  );
}
