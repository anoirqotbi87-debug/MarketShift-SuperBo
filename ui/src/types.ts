export type ViewMode = 'simulator' | 'doc';
export type ThemeMode = 'cyber_dark' | 'high_contrast_pro' | 'neon_synthwave' | 'arctic_light' | 'monochrome_terminal';

export type ActiveTabSimulator = 
  | 'dashboard' 
  | 'ml_engine' 
  | 'mt5_bridge' 
  | 'risk_security' 
  | 'backtester' 
  | 'terminal_logs' 
  | 'ai_assistant';

export interface ReconnectionState {
  isReconnecting: boolean;
  attempt: number;
  maxAttempts: number;
  backoffDelayMs: number;
  remainingMs: number;
  progressPct: number;
  nextAttemptInSec: number;
  lastDisconnectReason?: string;
}

export interface MT5AccountState {
  accountNumber: string;
  broker: string;
  server: string;
  balance: number;
  equity: number;
  freeMargin: number;
  marginLevelPct: number;
  unrealizedPnL: number;
  dailyPnL: number;
  dailyPnLPct: number;
  currency: string;
  isPaperTrading: boolean;
  isConnected: boolean;
  pingMs: number;
  reconnectionState?: ReconnectionState;
}

export interface ActivePosition {
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  lots: number;
  openPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  pnlPct: number;
  openTime: string;
  magicNumber: number;
  mlConfidence: number;
  signalReason: string;
  tags?: string[];
}

export interface ClosedTrade {
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  lots: number;
  openPrice: number;
  closePrice: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  pnlPct: number;
  openTime: string;
  closeTime: string;
  magicNumber: number;
  mlConfidence: number;
  signalReason: string;
  closeReason: 'CLOSED_MANUAL' | 'TAKE_PROFIT' | 'STOP_LOSS' | 'CIRCUIT_BREAKER';
  tags?: string[];
}

export interface MLModelStats {
  modelName: string;
  architecture: 'XGBoost + LSTM Ensemble' | 'LightGBM + PPO' | 'Transformer-TimeNet';
  accuracy: number;
  f1Score: number;
  inferenceTimeMs: number;
  lastRetrained: string;
  featuresCount: number;
  currentSignal: {
    symbol: string;
    direction: 'BUY' | 'SELL' | 'HOLD';
    confidence: number; // 0 to 100
    features: { name: string; impact: number }[];
  };
}

export interface RiskConfig {
  maxRiskPerTradePct: number; // e.g. 1.0%
  maxDailyLossPct: number; // e.g. 3.0%
  maxTotalDrawdownPct: number; // e.g. 8.0%
  maxOpenPositions: number;
  atrMultiplierSL: number;
  atrMultiplierTP: number;
  useTrailingStop: boolean;
  trailingStopAtr: number;
  useKellyCriterion: boolean;
  circuitBreakerActive: boolean;
  circuitBreakerReason?: string;
  circuitBreakerTriggeredAt?: string;
  enableNewsSentimentFilter?: boolean;
  minNewsSentimentScore?: number; // range -1.0 to +1.0 (e.g. -0.60)
  metaApiToken?: string;
  metaApiAccountId?: string;
  useLocalBridge?: boolean;
  localBridgeIp?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'ML_PRED' | 'MT5_EXEC' | 'CIRCUIT_BREAKER';
  module: 'ANDROID_UI' | 'ML_ENGINE' | 'MT5_BRIDGE' | 'RISK_ENGINE' | 'SYSTEM';
  message: string;
  details?: Record<string, any>;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  timestamp: string;
  relatedSymbol: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number; // -1.0 to +1.0
  summary: string;
  impactLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  mlWeightMultiplier: number; // e.g. +0.15 (+15% boost) or -0.20 (-20% penalty)
}

export interface NewsSentimentSummary {
  overallScore: number; // -100 to +100
  overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  articlesAnalyzedCount: number;
  lastUpdated: string;
  symbolSentiments: Record<string, { score: number; sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; newsCount: number }>;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: 'ABOVE' | 'BELOW';
  targetPrice: number;
  note?: string;
  enabled: boolean;
  isTriggered: boolean;
  triggeredAt?: string;
  triggeredPrice?: number;
  createdAt: string;
}

export interface EconomicEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  flagEmoji: string;
  time: string; // e.g. "14:30"
  date: string; // e.g. "Aujourd'hui", "Demain"
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  actual?: string;
  forecast?: string;
  previous?: string;
  category: 'INFLATION' | 'EMPLOYMENT' | 'CENTRAL_BANK' | 'GROWTH' | 'TRADE';
  autoTradingPaused: boolean; // if high volatility pause guard applies
}

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  category: 'PRICE_ALERT' | 'TRADE_EXECUTION' | 'CIRCUIT_BREAKER' | 'ML_SIGNAL' | 'SYSTEM';
  severity?: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  read?: boolean;
  symbol?: string;
  pnl?: number;
}

export interface ArchitectureDocSection {
  id: string;
  number: number;
  title: string;
  summary: string;
  subsections: {
    title: string;
    content: string;
    codeSnippet?: {
      language: 'python' | 'kotlin' | 'mql5' | 'json' | 'sql' | 'bash';
      code: string;
      caption?: string;
    };
    highlights?: string[];
  }[];
}
