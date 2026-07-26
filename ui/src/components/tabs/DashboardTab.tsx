import React, { useState, useMemo } from 'react';
import { MT5AccountState, ActivePosition, ClosedTrade, MLModelStats, RiskConfig, LogEntry, PriceAlert } from '../../types';
import { PnLEquityChart } from '../PnLEquityChart';
import { EquityBenchmarkChart } from '../EquityBenchmarkChart';
import { DrawdownMonitor } from '../DrawdownMonitor';
import { MarketOverviewSparklines } from '../MarketOverviewSparklines';
import { NewsSentimentModule } from '../NewsSentimentModule';
import { MarketNews } from '../MarketNews';
import { NewsRiskAlertService } from '../NewsRiskAlertService';
import { SymbolCorrelationPanel } from '../SymbolCorrelationPanel';
import { MarketCorrelationHeatmap } from '../MarketCorrelationHeatmap';
import { MarketDepthChart } from '../MarketDepthChart';
import { PortfolioHealthMonitor } from '../PortfolioHealthMonitor';
import { PositionDistributionChart } from '../PositionDistributionChart';
import { FeatureImpactChart } from '../FeatureImpactChart';
import { StrategyValidator } from '../StrategyValidator';
import { PriceAlertsConfig } from '../PriceAlertsConfig';
import { EconomicCalendar } from '../EconomicCalendar';
import { LiveMLLatencyChart } from '../LiveMLLatencyChart';
import { InfrastructureMonitor } from '../InfrastructureMonitor';
import { KellyPositionSizer } from '../KellyPositionSizer';
import { MultiSymbolPanel } from '../MultiSymbolPanel';
import { TradeTagManager, TradeTagPill } from '../TradeTagManager';
import { 
  TrendingUp, TrendingDown, DollarSign, Activity, AlertTriangle, ShieldCheck, XCircle, ArrowUpRight, ArrowDownRight, Download, History, FileSpreadsheet, Filter, Tag, QrCode, Wallet, Search, Calendar, CalendarDays, X, RotateCcw, Fingerprint, BarChart2, Brain, Newspaper, PieChart, Server, Globe, Briefcase 
} from 'lucide-react';
import { BiometricAuthModal } from '../BiometricAuthModal';
import { exportTradesToCSV, exportFullReportToCSV } from '../../utils/csvExport';
import { TradingViewWidget } from '../TradingViewWidget';
import { CollapsibleSection } from '../CollapsibleSection';

// Date parser helper for trades with time strings or date strings
function parseTradeDate(timeStr: string | number): Date {
  if (!timeStr) return new Date();

  if (typeof timeStr === 'number') {
    // If it's a Unix timestamp in seconds (MT5 format), convert to milliseconds
    if (timeStr < 20000000000) return new Date(timeStr * 1000);
    return new Date(timeStr);
  }

  const trimmed = String(timeStr).trim();
  if (trimmed.includes('-') || trimmed.includes('/')) {
    const formatted = trimmed.replace(' ', 'T');
    const parsed = new Date(formatted);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const timeParts = trimmed.split(':');
  if (timeParts.length >= 2) {
    const d = new Date();
    d.setHours(parseInt(timeParts[0], 10) || 0, parseInt(timeParts[1], 10) || 0, parseInt(timeParts[2] || '0', 10) || 0, 0);
    return d;
  }

  return new Date();
}

interface DashboardTabProps {
  accountState: MT5AccountState;
  positions: ActivePosition[];
  setPositions?: React.Dispatch<React.SetStateAction<ActivePosition[]>>;
  closedTrades: ClosedTrade[];
  setClosedTrades?: React.Dispatch<React.SetStateAction<ClosedTrade[]>>;
  mlStats: MLModelStats;
  riskConfig: RiskConfig;
  setRiskConfig?: React.Dispatch<React.SetStateAction<RiskConfig>>;
  logs?: LogEntry[];
  alerts?: PriceAlert[];
  setAlerts?: React.Dispatch<React.SetStateAction<PriceAlert[]>>;
  onTriggerAlertToast?: (alert: PriceAlert, currentPrice: number) => void;
  onClosePosition: (ticket: number) => void;
  onCloseAllPositions: () => void;
  onOpenDepositModal?: () => void;
  onResetCircuitBreaker?: () => void;
  onApplyNewsWeightToML?: (boostPct: number, reason: string) => void;
  executeTrade?: (symbol: string, direction: 'BUY' | 'SELL') => Promise<any>;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  accountState,
  positions,
  setPositions,
  closedTrades = [],
  setClosedTrades,
  mlStats,
  riskConfig,
  setRiskConfig,
  logs = [],
  alerts = [],
  setAlerts,
  onTriggerAlertToast,
  onClosePosition,
  onCloseAllPositions,
  onOpenDepositModal,
  onResetCircuitBreaker,
  onApplyNewsWeightToML,
  executeTrade
}) => {
  const [isBioModalOpen, setIsBioModalOpen] = useState<boolean>(false);
  const [dashboardSubTab, setDashboardSubTab] = useState<'OVERVIEW' | 'TRADING' | 'CHART' | 'RISK' | 'ANALYTICS' | 'INFRASTRUCTURE'>('OVERVIEW');
  const [activeTagFilter, setActiveTagFilter] = useState<string>('ALL');
  const [closedTagFilter, setClosedTagFilter] = useState<string>('ALL');

  // Search & Date Filter States for Closed Trades
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [datePreset, setDatePreset] = useState<'ALL' | 'TODAY' | '7D' | '30D' | 'CUSTOM'>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Tag helper functions for Active Positions
  const handleAddTagToPosition = (ticket: number, tag: string) => {
    if (!setPositions) return;
    const formatted = tag.startsWith('#') ? tag : `#${tag}`;
    setPositions(prev => prev.map(p => {
      if (p.ticket === ticket) {
        const existing = p.tags || [];
        if (!existing.includes(formatted)) {
          return { ...p, tags: [...existing, formatted] };
        }
      }
      return p;
    }));
  };

  const handleRemoveTagFromPosition = (ticket: number, tag: string) => {
    if (!setPositions) return;
    setPositions(prev => prev.map(p => {
      if (p.ticket === ticket) {
        return { ...p, tags: (p.tags || []).filter(t => t !== tag) };
      }
      return p;
    }));
  };

  // Tag helper functions for Closed Trades
  const handleAddTagToTrade = (ticket: number, tag: string) => {
    if (!setClosedTrades) return;
    const formatted = tag.startsWith('#') ? tag : `#${tag}`;
    setClosedTrades(prev => prev.map(t => {
      if (t.ticket === ticket) {
        const existing = t.tags || [];
        if (!existing.includes(formatted)) {
          return { ...t, tags: [...existing, formatted] };
        }
      }
      return t;
    }));
  };

  const handleRemoveTagFromTrade = (ticket: number, tag: string) => {
    if (!setClosedTrades) return;
    setClosedTrades(prev => prev.map(t => {
      if (t.ticket === ticket) {
        return { ...t, tags: (t.tags || []).filter(t => t !== tag) };
      }
      return t;
    }));
  };

  // Extract all unique tags across positions
  const allActiveTags = Array.from(
    new Set(positions.flatMap(p => p.tags || []))
  );

  // Extract all unique tags across closed trades
  const allClosedTags = Array.from(
    new Set(closedTrades.flatMap(t => t.tags || []))
  );

  // Filter positions
  const filteredPositions = activeTagFilter === 'ALL'
    ? positions
    : positions.filter(p => p.tags?.includes(activeTagFilter));

  // Filter closed trades by Tag, Search Query (ticket/symbol/reason), and Date Range
  const filteredClosedTrades = useMemo(() => {
    return closedTrades.filter(trade => {
      // 1. Tag filter
      if (closedTagFilter !== 'ALL' && !trade.tags?.includes(closedTagFilter)) {
        return false;
      }

      // 2. Search query filter (ticket, symbol, signal reason, close reason, tags)
      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim().toLowerCase();
        const ticketMatch = String(trade.ticket).toLowerCase().includes(q);
        const symbolMatch = String(trade.symbol).toLowerCase().includes(q);
        const reasonMatch = (trade.signalReason || '').toLowerCase().includes(q);
        const closeReasonMatch = (trade.closeReason || '').toLowerCase().includes(q);
        const tagMatch = trade.tags?.some(t => (t || '').toLowerCase().includes(q));

        if (!ticketMatch && !symbolMatch && !reasonMatch && !closeReasonMatch && !tagMatch) {
          return false;
        }
      }

      // 3. Date / Time range filter
      const tradeDate = parseTradeDate(trade.closeTime || trade.openTime);
      const now = new Date();

      if (datePreset === 'TODAY') {
        const todayStr = now.toISOString().split('T')[0];
        const tradeStr = tradeDate.toISOString().split('T')[0];
        if (todayStr !== tradeStr) return false;
      } else if (datePreset === '7D') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        if (tradeDate < sevenDaysAgo) return false;
      } else if (datePreset === '30D') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        if (tradeDate < thirtyDaysAgo) return false;
      } else if (datePreset === 'CUSTOM') {
        if (startDate) {
          const start = new Date(startDate + 'T00:00:00');
          if (tradeDate < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate + 'T23:59:59');
          if (tradeDate > end) return false;
        }
      }

      return true;
    });
  }, [closedTrades, closedTagFilter, searchQuery, datePreset, startDate, endDate]);

  // Statistics for the filtered trades subset
  const filteredStats = useMemo(() => {
    const count = filteredClosedTrades.length;
    const totalPnL = filteredClosedTrades.reduce((acc, t) => acc + t.pnl, 0);
    const winningCount = filteredClosedTrades.filter(t => t.pnl > 0).length;
    const winRate = count > 0 ? Math.round((winningCount / count) * 100) : 0;

    return { count, totalPnL, winningCount, winRate };
  }, [filteredClosedTrades]);
  return (
    <div className="space-y-4 text-slate-100">
      
      {/* Circuit Breaker Alert Banner if triggered */}
      {riskConfig.circuitBreakerActive && (
        <div className="bg-red-950/80 border border-red-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-200 shadow-md font-sans">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5 animate-bounce" />
            <div className="space-y-0.5">
              <div className="font-bold text-red-300 uppercase font-mono tracking-wide">COUPE-CIRCUIT D'URGENCE ACTIVÉ</div>
              <div className="text-[11px] text-red-200">{riskConfig.circuitBreakerReason || 'Alerte de risque déclenchée. Les nouveaux trades sont verrouillés.'}</div>
            </div>
          </div>

          {onResetCircuitBreaker && (
            <button
              onClick={() => setIsBioModalOpen(true)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold font-mono text-[11px] transition-all shadow-md flex items-center justify-center gap-1.5 shrink-0 uppercase tracking-tight"
            >
              <Fingerprint className="w-4 h-4 text-emerald-200" />
              <span>Réarmer Bot (Biométrie)</span>
            </button>
          )}
        </div>
      )}

      {/* Biometric Prompt Modal for Circuit Breaker Reset */}
      <BiometricAuthModal
        isOpen={isBioModalOpen}
        onClose={() => setIsBioModalOpen(false)}
        onSuccess={() => {
          if (onResetCircuitBreaker) onResetCircuitBreaker();
        }}
        title="Réarmement Sécurisé du Bot MT5"
        description="Empreinte digitale / Face ID requise pour réinitialiser le coupe-circuit et réautoriser le passage d'ordres en production."
        actionLabel="Réarmer Coupe-Circuit"
      />

      {/* Hero Balance Section (2026 UI Redesign) */}
      <div className="flex flex-col items-center justify-center py-6 glass-card rounded-3xl relative overflow-hidden">
        {/* Subtle glowing background effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-600/20 blur-3xl rounded-full pointer-events-none" />
        
        <div className="text-[11px] text-slate-400 font-sans font-medium uppercase tracking-widest mb-1">
          Solde du Portefeuille
        </div>
        
        <div className="hero-balance mb-2 flex items-center gap-1">
          <span className="text-2xl text-slate-500 font-normal">$</span>
          {accountState.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
        
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono shadow-sm ${
          accountState.dailyPnL >= 0 
            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50' 
            : 'bg-red-950/60 text-red-400 border border-red-800/50'
        }`}>
          {accountState.dailyPnL >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {accountState.dailyPnL >= 0 ? '+' : ''}${accountState.dailyPnL.toFixed(2)} ({accountState.dailyPnLPct}%) Aujourd'hui
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center gap-4 mt-6">
          {onOpenDepositModal && (
            <button
              onClick={onOpenDepositModal}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-2xl font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all"
            >
              <Wallet className="w-4 h-4" />
              <span>Dépôt / Retrait</span>
            </button>
          )}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 font-sans">Marge Libre</span>
            <span className="text-xs font-bold text-slate-300 font-mono">${accountState.freeMargin.toFixed(0)}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 font-sans">Niveau</span>
            <span className="text-xs font-bold text-indigo-400 font-mono">{accountState.marginLevelPct}%</span>
          </div>
        </div>
      </div>

      {/* Modern iOS-Style Segmented Control for Sub-Tabs */}
      <div className="flex justify-center w-full mt-2 mb-4">
        <div className="segmented-control w-full max-w-sm">
          <div 
            className="segmented-indicator"
            style={{ 
              width: '33.33%', 
              transform: `translateX(${
                dashboardSubTab === 'OVERVIEW' ? '0%' : 
                dashboardSubTab === 'CHART' ? '100%' : 
                dashboardSubTab === 'TRADING' ? '200%' : '0%'
              })`
            }}
          />
          <button
            onClick={() => setDashboardSubTab('OVERVIEW')}
            className={`segmented-control-btn ${dashboardSubTab === 'OVERVIEW' ? 'active' : ''}`}
          >
            Résumé
          </button>
          <button
            onClick={() => setDashboardSubTab('CHART')}
            className={`segmented-control-btn ${dashboardSubTab === 'CHART' ? 'active' : ''}`}
          >
            Graphique
          </button>
          <button
            onClick={() => setDashboardSubTab('TRADING')}
            className={`segmented-control-btn ${dashboardSubTab === 'TRADING' ? 'active' : ''}`}
          >
            Historique
          </button>
        </div>
      </div>

      {/* 1. OVERVIEW SUB-TAB CONTENT */}
      {dashboardSubTab === 'OVERVIEW' && (
        <div className="space-y-4 animate-in fade-in">
          
          <CollapsibleSection 
            title="Performance Globale" 
            icon={<BarChart2 className="w-4 h-4" />} 
            defaultExpanded={true}
          >
            {/* Interactive PnL & Equity Evolution Chart */}
            <PnLEquityChart accountState={accountState} />

            {/* Equity Curve vs Buy & Hold Benchmark Chart */}
            <EquityBenchmarkChart accountState={accountState} />
          </CollapsibleSection>

          <CollapsibleSection 
            title="Aperçu du Marché" 
            icon={<Globe className="w-4 h-4" />} 
            defaultExpanded={false}
          >
            {/* Market Overview Top 5 Watched Symbols Sparklines */}
            <MarketOverviewSparklines />
          </CollapsibleSection>

          <CollapsibleSection
            title="Multi-Symbole & Gestion du Risque (Kelly)"
            icon={<Globe className="w-4 h-4" />}
            defaultExpanded={true}
          >
            <div className="space-y-4">
              <MultiSymbolPanel positions={positions} isConnected={accountState.isConnected} localBridgeIp={`http://${window.location.hostname}:8000`} />
              <KellyPositionSizer 
                isConnected={accountState.isConnected} 
                localBridgeIp={`http://${window.location.hostname}:8000`} 
                maxRiskPct={riskConfig.maxRiskPerTradePct}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="Positions Actives (Résumé)" 
            icon={<Briefcase className="w-4 h-4" />} 
            defaultExpanded={false}
          >
            {/* Quick Active Positions List inside Overview */}
            {positions.length > 0 ? (
              <div className="space-y-2 font-mono">
                {positions.slice(0, 3).map((pos) => (
                  <div key={pos.ticket} className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        pos.type === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'
                      }`}>
                        {pos.type} {pos.lots}
                      </span>
                      <span className="font-bold text-white">{pos.symbol}</span>
                    </div>
                    <div className={`font-bold text-sm ${pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-slate-500">Aucune position ouverte.</div>
            )}
          </CollapsibleSection>
        </div>
      )}

      {/* 4. ANALYTICS SUB-TAB CONTENT */}
      {dashboardSubTab === 'ANALYTICS' && (
        <div className="space-y-4 animate-in fade-in">
          {/* ML Live Signal & Confidence Widget */}
          <div className="glass-card p-3.5 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 uppercase tracking-wide">Signal Inférence ML (XGBoost + LSTM)</span>
              <span className="px-2 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 text-[10px] font-mono border border-indigo-700/60 font-bold">
                Latence: {mlStats.inferenceTimeMs}ms
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-xl ${
                  mlStats.currentSignal.direction === 'BUY'
                    ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-700/60 status-glow'
                    : 'bg-red-950/90 text-red-400 border border-red-700/60'
                }`}>
                  {mlStats.currentSignal.direction === 'BUY' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                </div>
                <div>
                  <div className="text-xs font-bold text-white uppercase tracking-tight font-mono">
                    {mlStats.currentSignal.symbol} : {mlStats.currentSignal.direction}
                  </div>
                  <div className="text-[10px] text-slate-400 font-sans">
                    Caractéristiques Clés: RSI + ATR Breakdown
                  </div>
                </div>
              </div>

              <div className="text-right font-mono">
                <div className="text-sm font-extrabold text-indigo-400">
                  {mlStats.currentSignal.confidence}%
                </div>
                <div className="text-[10px] text-slate-400 font-sans">Score Confiance</div>
              </div>
            </div>

            {/* Execute Trade Button */}
            {executeTrade && (
              <div className="pt-2">
                <button
                  onClick={() => executeTrade(mlStats.currentSignal.symbol, mlStats.currentSignal.direction as 'BUY'|'SELL')}
                  className={`w-full py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 ${
                    mlStats.currentSignal.direction === 'BUY'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50'
                      : 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/50'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  Exécuter Vrai Ordre ({mlStats.currentSignal.direction})
                </button>
              </div>
            )}
          </div>

          {/* Feature Impact Horizontal Bar Chart (Recharts) for XGBoost + LSTM Ensemble */}
          <FeatureImpactChart mlStats={mlStats} />

          {/* Live ML Inference Latency Real-time Monitoring Chart */}
          <LiveMLLatencyChart mlStats={mlStats} />

          {/* Strategy Validator & ML Feature Toggling Simulation Panel */}
          <StrategyValidator mlStats={mlStats} />
        </div>
      )}

      {/* 5. INFRASTRUCTURE SUB-TAB CONTENT */}
      {dashboardSubTab === 'INFRASTRUCTURE' && (
        <div className="space-y-4 animate-in fade-in">
          <InfrastructureMonitor accountState={accountState} />
        </div>
      )}

      {/* 3. RISK SUB-TAB CONTENT */}
      {dashboardSubTab === 'RISK' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Automated News-Driven Risk Alert & Protective Hedge Service */}
          <NewsRiskAlertService 
            positions={positions}
            riskConfig={riskConfig}
            setRiskConfig={setRiskConfig}
            onTriggerAlertToast={(title, msg, type) => {
              if (onTriggerAlertToast) {
                onTriggerAlertToast({
                  id: `news-toast-${Date.now()}`,
                  symbol: 'MACRO_NEWS',
                  targetPrice: 0,
                  condition: 'ABOVE',
                  createdAt: new Date().toLocaleTimeString('fr-FR'),
                  note: `${title}: ${msg}`,
                  isActive: true
                }, 0);
              }
            }}
          />

          {/* Real-time Market News Headlines & Dynamic Sentiment Score Indicator (-1.0 to +1.0) */}
          <MarketNews onApplyNewsWeightToML={onApplyNewsWeightToML} />

          {/* Real-time Financial News Sentiment Analysis Module */}
          <NewsSentimentModule />

          {/* Macro Economic Calendar & High-Volatility Auto-Trading Guard */}
          <EconomicCalendar />
        </div>
      )}

      {/* CHART SUB-TAB CONTENT */}
      {dashboardSubTab === 'CHART' && (
        <div className="space-y-4 animate-in fade-in h-[500px]">
          <div className="glass-card p-2 rounded-2xl h-full border border-slate-800">
            <TradingViewWidget symbol={`FX:${mlStats.currentSignal.symbol || 'EURUSD'}`} theme="dark" />
          </div>
        </div>
      )}

      {/* 2. TRADING SUB-TAB CONTENT */}
      {dashboardSubTab === 'TRADING' && (
        <div className="space-y-4 animate-in fade-in">

          <CollapsibleSection 
            title={`Positions MT5 Actives (${positions.length})`}
            icon={<Briefcase className="w-4 h-4" />}
            defaultExpanded={true}
            contentClassName="p-0" // Custom padding because the active tags need spacing differently
            headerRight={
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); exportTradesToCSV(positions, closedTrades); }}
                  className="p-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 rounded-lg text-indigo-300 transition-colors"
                  title="Exporter positions"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                {positions.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCloseAllPositions(); }}
                    className="p-1.5 bg-red-950/60 hover:bg-red-900 border border-red-800/80 rounded-lg text-red-400 transition-colors"
                    title="Tout Clôturer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            }
          >
            <div className="p-3.5 space-y-3">
              {/* Modern Native Selectbox for Active Tags */}
              {positions.length > 0 && allActiveTags.length > 0 && (
                <div className="flex items-center gap-2 pb-1">
                  <span className="text-slate-400 text-[10px] font-mono flex items-center gap-1">
                    <Filter className="w-3 h-3 text-indigo-400" /> Filtrer:
                  </span>
                  <select
                    value={activeTagFilter}
                    onChange={(e) => setActiveTagFilter(e.target.value)}
                    className="modern-select flex-1"
                  >
                    <option value="ALL">Tous les tags ({positions.length})</option>
                    {allActiveTags.map(tag => (
                      <option key={tag} value={tag}>
                        {tag} ({positions.filter(p => p.tags?.includes(tag)).length})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {filteredPositions.length === 0 ? (
                <div className="text-center py-6 bg-slate-950/50 rounded-xl border border-slate-800/60 text-xs text-slate-500">
                  {activeTagFilter !== 'ALL' 
                    ? `Aucune position avec le tag ${activeTagFilter}.` 
                    : 'Aucune position ouverte actuellement. Le bot analyse le marché en direct.'}
                </div>
              ) : (
                <div className="space-y-2 font-mono">
                  {filteredPositions.map((pos) => (
                    <div key={pos.ticket} className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              pos.type === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'
                            }`}>
                              {pos.type} {pos.lots} Lots
                            </span>
                            <span className="font-bold text-white text-sm">{pos.symbol}</span>
                            <span className="text-[10px] text-slate-500">#{pos.ticket}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2">
                            <span>Prix: {pos.openPrice}</span>
                            <span>→ {pos.currentPrice}</span>
                            <span className="text-indigo-400 font-bold">ML {pos.mlConfidence}%</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <div className="text-right">
                            <div className={`font-bold text-sm ${pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                            </div>
                            <div className="text-[9px] text-slate-500">SL: {pos.stopLoss}</div>
                          </div>

                          <button
                            onClick={() => onClosePosition(pos.ticket)}
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                            title="Clôturer cette position"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Tag Categorization Control Bar */}
                      <div className="pt-2 border-t border-slate-900/80 flex items-center justify-between">
                        <TradeTagManager
                          tags={pos.tags}
                          onAddTag={(tag) => handleAddTagToPosition(pos.ticket, tag)}
                          onRemoveTag={(tag) => handleRemoveTagFromPosition(pos.ticket, tag)}
                        />
                        <span className="text-[9px] text-slate-500 font-sans">{pos.signalReason}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={`Historique des Trades Clôturés`}
            icon={<History className="w-4 h-4" />}
            defaultExpanded={false}
            contentClassName="p-0"
            headerRight={
              <button
                onClick={(e) => { e.stopPropagation(); exportFullReportToCSV(accountState, positions, closedTrades, logs); }}
                className="p-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 rounded-lg text-emerald-400 transition-colors"
                title="Exporter rapport complet (CSV)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </button>
            }
          >
            <div className="p-3.5 space-y-3">
              {/* Filtered Trades Stats Summary & Reset Button */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px] font-mono bg-slate-950/40 p-2 rounded-xl border border-slate-800/60">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-slate-400">
                    Résultats: <strong className="text-white">{filteredStats.count}</strong> trade(s)
                  </span>
                  <span className="text-slate-400">
                    PnL Filtré: <strong className={`font-bold ${filteredStats.totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {filteredStats.totalPnL >= 0 ? '+' : ''}${filteredStats.totalPnL.toFixed(2)}
                    </strong>
                  </span>
                  <span className="text-slate-400">
                    Taux de Victoire: <strong className="text-emerald-300">{filteredStats.winRate}%</strong> ({filteredStats.winningCount}/{filteredStats.count})
                  </span>
          </div>

          {(searchQuery !== '' || datePreset !== 'ALL' || closedTagFilter !== 'ALL' || startDate !== '' || endDate !== '') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setDatePreset('ALL');
                setClosedTagFilter('ALL');
                setStartDate('');
                setEndDate('');
              }}
              className="flex items-center gap-1 text-slate-400 hover:text-white bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 transition-colors"
            >
              <RotateCcw className="w-3 h-3 text-indigo-400" />
              <span>Réinitialiser Filtres</span>
            </button>
          )}
        </div>

        {/* Trades Cards List */}
        {filteredClosedTrades.length === 0 ? (
          <div className="text-center py-6 bg-slate-950/50 rounded-xl border border-slate-800/60 text-xs text-slate-400 space-y-1">
            <div className="font-bold text-slate-300">Aucun trade ne correspond aux critères sélectionnés</div>
            <p className="text-[10px] text-slate-500">
              Essayez de modifier la recherche (ticket/symbole), d'élargir la plage de dates ou de réinitialiser les filtres.
            </p>
          </div>
        ) : (
          <div className="space-y-2 font-mono">
            {filteredClosedTrades.map((trade) => (
              <div key={trade.ticket} className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 text-xs space-y-2 hover:border-slate-700 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        trade.type === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'
                      }`}>
                        {trade.type} {trade.lots}
                      </span>
                      <span className="font-bold text-white text-sm">{trade.symbol}</span>
                      <span className="text-[10px] text-slate-500">#{trade.ticket}</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-slate-800 text-indigo-300 rounded border border-slate-700">
                        {trade.closeReason}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-2 font-sans">
                      <span>Ouv: {trade.openPrice} ({trade.openTime})</span>
                      <span>→ Ferm: {trade.closePrice} ({trade.closeTime})</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`font-bold text-sm ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      Confiance ML: {trade.mlConfidence}%
                    </div>
                  </div>
                </div>

                {/* Tag Categorization Control Bar */}
                <div className="pt-2 border-t border-slate-900/80 flex items-center justify-between">
                  <TradeTagManager
                    tags={trade.tags}
                    onAddTag={(tag) => handleAddTagToTrade(trade.ticket, tag)}
                    onRemoveTag={(tag) => handleRemoveTagFromTrade(trade.ticket, tag)}
                  />
                  <span className="text-[9px] text-slate-500 font-sans">{trade.signalReason}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </CollapsibleSection>
      </div>
      )}

    </div>
  );
};

