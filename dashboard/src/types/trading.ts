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

export type BrokerAccountType = "DEMO" | "REAL";

/** Compte de courtage enregistré (mot de passe JAMAIS exposé côté API). */
export interface BrokerAccount {
  id: number;
  broker_name: string;
  server: string;
  login: number;
  account_type: BrokerAccountType;
  is_active: boolean;
  balance: number;
  equity: number;
  currency: string;
  last_result: string;
  password_set: boolean;
}

/** Résultat d'un test de connexion MT5 réel. */
export interface BrokerTestResult {
  success: boolean;
  ping_ms?: number;
  balance?: number;
  equity?: number;
  leverage?: number;
  currency?: string;
  error?: string;
  note?: string;
}

export interface BrokerConnectResponse {
  success: boolean;
  account?: BrokerAccount;
  error?: string;
}

export interface BrokerSwitchResponse {
  success: boolean;
  account?: BrokerAccount;
  error?: string;
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

// ────────────────────────────────────────────────────────────────────────────
// Settings runtime (GET /settings, POST /settings)
// ────────────────────────────────────────────────────────────────────────────

export interface RuntimeSettings {
  sl_multiplier: number;
  tp_multiplier: number;
  risk_percent: number;
  trailing_stop_active: boolean;
  trailing_stop_multiplier: number;
  ml_confidence_threshold: number;
}

/** Corps accepté par POST /settings (tous champs optionnels). */
export interface SettingsPatch {
  sl_multiplier?: number;
  tp_multiplier?: number;
  risk_percent?: number;
  trailing_stop_active?: boolean;
  trailing_stop_multiplier?: number;
  ml_confidence_threshold?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Kelly API (GET /kelly)
// ────────────────────────────────────────────────────────────────────────────

export interface KellyApiResponse {
  winRate: number;
  rrRatio: number;
  tradeCount: number;
  kellyFraction: number;
  kellyPct: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Optimize / Grid Search (POST /optimize, GET /optimize/status/{job_id})
// ────────────────────────────────────────────────────────────────────────────

export interface OptimizeJobResponse {
  job_id?: string;
  status: string;
  error?: string;
}

export interface OptimizeJobStatus {
  job_id?: string;
  status?: string;
  progress?: number;
  best_params?: Record<string, number | string>;
  results?: OptimizeResult[];
  error?: string;
  message?: string;
}

export interface OptimizeResult {
  rank: number;
  sl_multiplier: number;
  ml_threshold: number;
  kelly_fraction: number;
  smc_weight: number;
  amd_weight: number;
  win_rate: number;
  profit_factor: number;
  max_drawdown: number;
  sharpe_ratio: number;
  net_profit: number;
  trades: number;
}

/** Ligne de résultat construite côté client (fallback / status). */
export interface GridResultRow {
  rank: number;
  params: Record<string, number>;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpe: number;
  netProfit: number;
  trades: number;
}

export type ObjectiveFunction = "sharpe" | "net_profit" | "calmar";

// ────────────────────────────────────────────────────────────────────────────
// Apply optimal settings (POST /apply-optimal-settings)
// ────────────────────────────────────────────────────────────────────────────

export interface ApplySettingsPayload {
  slMult: number;
  confThreshold: number;
  symbol?: string;
}

export interface ApplySettingsResponse {
  status?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────────────────
// Backtest (POST /backtest — upload CSV)
// ────────────────────────────────────────────────────────────────────────────

export interface BacktestReport {
  total_trades?: number;
  win_rate?: number;
  profit_factor?: number;
  max_drawdown?: number;
  sharpe_ratio?: number;
  net_profit?: number;
  initial_balance?: number;
  final_balance?: number;
  equity_curve?: Array<{ time: string; equity: number }>;
  error?: string;
  avg_trade?: number;
  max_loss_streak?: number;
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────────────────
// Connectivité hybride
// ────────────────────────────────────────────────────────────────────────────

export interface ConnectionProfile {
  label: string;
  apiUrl: string;
  wsUrl: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Analytique avancée (endpoints backend /ml-latency, /system-health, /market-depth,
// /news-events, /ml/status, /predict, /market-overview, /benchmark-curve, /history)
// ────────────────────────────────────────────────────────────────────────────

export interface MlLatencyPoint {
  time: string;
  latencyMs: number;
  preprocessMs: number;
  onnxInferenceMs: number;
  postprocessMs: number;
  batchSize: number;
}

export interface SystemHealth {
  time: string;
  latency: number;
  throughput: number;
  cpu_usage: number;
  ram_usage: number;
}

export interface MarketDepthLevel {
  price: number;
  volume: number;
  totalVolume: number;
  ordersCount: number;
}

export interface MarketDepthData {
  midPrice: number;
  bids: MarketDepthLevel[];
  asks: MarketDepthLevel[];
}

export interface NewsEvent {
  id: string;
  time: string;
  headline: string;
  sentimentScore: number;
  actionTaken: string;
  severity: "NORMAL" | "WARNING" | "CRITICAL";
}

export interface MlStatus {
  trained: boolean;
  accuracy: number;
  sampleCount: number;
  lastTrained: string;
  confidenceThreshold: number;
  featureImportances: Array<{ feature: string; importance: number }>;
  retrainIntervalHours: number;
}

export interface PredictResponse {
  signal: "BUY" | "SELL" | "WAIT" | "HOLD";
  confidence: number;
  reason?: string;
  featureImportances?: Array<{ feature: string; importance: number }>;
  mlTrained?: boolean;
  error?: string;
}

export interface MarketOverviewEntry {
  symbol: string;
  price: number;
  changeUsd: number;
  changePct: number;
  high24h: number;
  low24h: number;
  volume: number;
  signal?: "BUY" | "SELL" | "NEUTRAL" | "WAIT";
}

export interface BenchmarkPoint {
  time: string;
  benchmarkEquity: number;
}

export interface ClosedDeal {
  ticket: number;
  symbol: string;
  type: "BUY" | "SELL";
  lots: number;
  openPrice: number;
  closePrice: number;
  pnl: number;
  openTime: string;
  closeTime: string;
  closeReason: string;
  mlConfidence: number;
  tags: string[];
  signalReason: string;
}

export interface HistoryBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
}

/** GTK / widget de positionnement Kelly enrichi (calculs côté client). */
export interface KellyPositionSize {
  kellyPct: number;
  riskPct: number;
  positionSize: number;
  lots: number;
  pipValuePerLot: number;
  accountBalance: number;
}

export interface PriceAlertItem {
  id: string;
  symbol: string;
  condition: "ABOVE" | "BELOW";
  targetPrice: number;
  note?: string;
  enabled: boolean;
  isTriggered: boolean;
  createdAt: string;
}