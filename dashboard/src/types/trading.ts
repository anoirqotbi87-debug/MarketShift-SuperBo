/**
 * Typages des données échangées avec le backend MarketShift-SuperBot.
 * Alignés sur les payloads réels de api/server.py (snapshot WS + endpoints REST).
 */

export interface AccountInfo {
  login: number;
  balance: number;
  equity: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
  server: string;
  broker: string;
  isConnected: boolean;
  dailyPnL: number;
  dailyPnLPct: number;
}

export interface WsPosition {
  ticket: number;
  symbol: string;
  type: "BUY" | "SELL";
  lots: number;
  openPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
  stopLoss: number;
  takeProfit: number;
  magicNumber: number;
}

export interface SignalData {
  direction: string;
  confidence: number;
  source: string;
  sl_pips?: number;
  tp_pips?: number;
}

export interface KellyStats {
  winRate: number;
  rrRatio: number;
  tradeCount: number;
}

export interface MlStats {
  trained: boolean;
  accuracy: number;
  sampleCount: number;
  lastTrained: string;
  featureImportances: Array<{ feature: string; importance: number }>;
}

export type LogLevel = "INFO" | "WARNING" | "ERROR" | "DEBUG";

export interface EngineLog {
  time: string;
  level: LogLevel;
  message: string;
}

export interface WsSnapshot {
  type: string;
  timestamp: string;
  account: AccountInfo;
  positions: WsPosition[];
  signals: Record<string, SignalData>;
  kelly: KellyStats;
  ml: MlStats;
  logs: EngineLog[];
  killSwitch: boolean;
  isPaused: boolean;
}

export interface EquityPoint {
  time: string;
  equity: number;
  dailyPnL: number;
  balance: number;
}

export interface KpiMetrics {
  expectancy: number;
  profit_factor: number;
  gross_profit: number;
  gross_loss: number;
  total_trades: number;
  error?: string;
}

export interface SymbolOverview {
  symbol: string;
  signal: SignalData;
  openPositions: number;
  unrealizedPnL: number;
}

export interface ServerStatus {
  status: string;
  kill_switch: boolean;
  account: AccountInfo | null;
  positions_count: number;
  symbols: string[];
}

/** Réponse de l'API REST pour les positions (mêmes champs que le WS). */
export type RestPosition = WsPosition;

/** Raw message reçu de la socket (avant parsing). */
export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

/** Types possibles des messages reçus (broadcast). */
export type RawSnapshotPayload = Omit<WsSnapshot, "type"> & { type?: string };