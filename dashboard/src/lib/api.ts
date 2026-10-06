import type {
  ApplySettingsPayload,
  ApplySettingsResponse,
  BacktestReport,
  BenchmarkPoint,
  ConnectionProfile,
  EquityPoint,
  HistoryBar,
  KellyApiResponse,
  KpiMetrics,
  MarketDepthData,
  MarketOverviewEntry,
  MlLatencyPoint,
  MlStatus,
  NewsEvent,
  OptimizeJobResponse,
  OptimizeJobStatus,
  PredictResponse,
  RestPosition,
  RuntimeSettings,
  ServerStatus,
  SettingsPatch,
  SymbolOverview,
  SystemHealth,
} from "@/types/trading";

/**
 * Client REST minimal vers l'API FastAPI du bot.
 * Tous les fetchers sont tolérants aux erreurs : en cas d'échec ils
 * retournent des valeurs par défaut sûres plutôt que de faire crasher l'UI.
 *
 * URL dynamique : la connexion hybride permet de basculer entre localhost et
 * une URL publique (tunnel). La sélection est persistée en localStorage.
 */

const ENV_API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";
const ENV_WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

const STORAGE_KEY = "marketshift.connection";

/** Profil provenant des variables d'environnement (.env) — défaut de build. */
const ENV_PROFILE: ConnectionProfile = {
  label: ENV_API_URL.includes("localhost") ? "Env (localhost)" : "Env (public)",
  apiUrl: ENV_API_URL,
  wsUrl: ENV_WS_URL,
};

const LOCAL_PROFILE: ConnectionProfile = {
  label: "Local (localhost:8000)",
  apiUrl: "http://localhost:8000",
  wsUrl: "ws://localhost:8000/ws",
};

const DEFAULT_PROFILES: ConnectionProfile[] = [
  ENV_PROFILE,
  LOCAL_PROFILE,
];

let currentApiUrl = loadApiUrl();

function loadApiUrl(): string {
  if (typeof window === "undefined") return ENV_API_URL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const prof = JSON.parse(raw) as ConnectionProfile;
      return prof.apiUrl.replace(/\/$/, "");
    }
  } catch {
    // ignore
  }
  return ENV_API_URL;
}

let currentWsUrl = ENV_WS_URL;

/** Définit la connexion active (hashée en localStorage) et renvoie la {@link ConnectionProfile}. */
export function setConnection(profile: ConnectionProfile): ConnectionProfile {
  currentApiUrl = profile.apiUrl.replace(/\/$/, "");
  currentWsUrl = profile.wsUrl;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // ignore (mode privé, etc.)
    }
  }
  return profile;
}

/** Récupère la connexion active (depuis localStorage si dispo). */
export function getConnection(): ConnectionProfile {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as ConnectionProfile;
    } catch {
      // ignore
    }
  }
  const api = currentApiUrl ?? ENV_API_URL;
  return {
    label: api.includes("localhost") ? "Local (localhost:8000)" : "Public (tunnel)",
    apiUrl: api,
    wsUrl: currentWsUrl,
  };
}

export { DEFAULT_PROFILES, ENV_API_URL, ENV_WS_URL, API_KEY };

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${currentApiUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchServerStatus(): Promise<ServerStatus | null> {
  return request<ServerStatus>("/status");
}

export async function fetchPositions(): Promise<RestPosition[]> {
  const data = await request<RestPosition[]>("/positions");
  return Array.isArray(data) ? data : [];
}

export async function fetchEquityCurve(
  timeframe: "1D" | "1W" | "1M" = "1D",
): Promise<EquityPoint[]> {
  const data = await request<EquityPoint[]>(`/equity-curve?timeframe=${timeframe}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchKpiMetrics(): Promise<KpiMetrics | null> {
  return request<KpiMetrics>("/kpi");
}

export async function fetchSymbols(): Promise<SymbolOverview[]> {
  const data = await request<SymbolOverview[]>("/symbols");
  return Array.isArray(data) ? data : [];
}

/** POST /control — kill switch, reset, pause, resume. */
export async function sendControlCommand(action: "kill" | "reset_kill" | "pause" | "resume") {
  return request<{ message?: string; error?: string }>("/control", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Runtime settings
// ────────────────────────────────────────────────────────────────────────────

export async function fetchSettings(): Promise<RuntimeSettings | null> {
  return request<RuntimeSettings>("/settings");
}

export async function updateSettings(patch: SettingsPatch): Promise<RuntimeSettings | null> {
  return request<RuntimeSettings>("/settings", {
    method: "POST",
    body: JSON.stringify(patch),
  });
}

export async function fetchKelly(): Promise<KellyApiResponse | null> {
  return request<KellyApiResponse>("/kelly");
}

// ────────────────────────────────────────────────────────────────────────────
// Grid Search / Optimizer (multipart) + polling
// ────────────────────────────────────────────────────────────────────────────

export async function startOptimize(params: {
  symbol: string;
  initialCapital: number;
  file?: File | null;
}): Promise<OptimizeJobResponse | null> {
  const form = new FormData();
  form.append("symbol", params.symbol);
  form.append("initial_capital", String(params.initialCapital));
  if (params.file) form.append("file", params.file);

  try {
    const res = await fetch(`${currentApiUrl}/optimize`, {
      method: "POST",
      headers: API_KEY ? { "X-API-Key": API_KEY } : {},
      body: form,
    });
    if (!res.ok) return null;
    return (await res.json()) as OptimizeJobResponse;
  } catch {
    return null;
  }
}

export async function fetchOptimizeStatus(jobId: string): Promise<OptimizeJobStatus | null> {
  return request<OptimizeJobStatus>(`/optimize/status/${encodeURIComponent(jobId)}`);
}

export async function applyOptimalSettings(
  payload: ApplySettingsPayload,
): Promise<ApplySettingsResponse | null> {
  return request<ApplySettingsResponse>("/apply-optimal-settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Backtest (upload CSV)
// ────────────────────────────────────────────────────────────────────────────

export async function runBacktest(params: {
  symbol: string;
  initialCapital: number;
  file: File;
}): Promise<BacktestReport | null> {
  const form = new FormData();
  form.append("symbol", params.symbol);
  form.append("initial_capital", String(params.initialCapital));
  form.append("file", params.file);

  try {
    const res = await fetch(`${currentApiUrl}/backtest`, {
      method: "POST",
      headers: API_KEY ? { "X-API-Key": API_KEY } : {},
      body: form,
    });
    if (!res.ok) return null;
    return (await res.json()) as BacktestReport;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Analytique avancée — endpoints observabilité / temps réel
// ────────────────────────────────────────────────────────────────────────────

export async function fetchMlLatency(): Promise<MlLatencyPoint | null> {
  return request<MlLatencyPoint>("/ml-latency");
}

export async function fetchSystemHealth(): Promise<SystemHealth | null> {
  return request<SystemHealth>("/system-health");
}

export async function fetchMarketDepth(symbol = "EURUSD"): Promise<MarketDepthData | null> {
  return request<MarketDepthData>(`/market-depth?symbol=${encodeURIComponent(symbol)}`);
}

export async function fetchNewsEvents(): Promise<NewsEvent[]> {
  const data = await request<NewsEvent[]>("/news-events");
  return Array.isArray(data) ? data : [];
}

export async function fetchMlStatus(): Promise<MlStatus | null> {
  return request<MlStatus>("/ml/status");
}

export async function fetchPredict(symbol = "EURUSD"): Promise<PredictResponse | null> {
  return request<PredictResponse>(`/predict?symbol=${encodeURIComponent(symbol)}`);
}

export async function fetchMarketOverview(): Promise<MarketOverviewEntry[]> {
  const data = await request<MarketOverviewEntry[]>("/market-overview");
  return Array.isArray(data) ? data : [];
}

export async function fetchBenchmarkCurve(
  timeframe = "1M",
  asset = "BASKET_TOP5",
): Promise<BenchmarkPoint[]> {
  const data = await request<BenchmarkPoint[]>(
    `/benchmark-curve?timeframe=${encodeURIComponent(timeframe)}&asset=${encodeURIComponent(asset)}`,
  );
  return Array.isArray(data) ? data : [];
}

export async function fetchHistory(symbol = "EURUSD", timeframe = "M15", bars = 200): Promise<HistoryBar[]> {
  const data = await request<HistoryBar[]>(
    `/history?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&num_bars=${bars}`,
  );
  return Array.isArray(data) ? data : [];
}

export async function retrainMlModel(): Promise<{ status?: string; error?: string } | null> {
  try {
    const res = await fetch(`${currentApiUrl}/ml/retrain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as { status?: string; error?: string };
  } catch {
    return null;
  }
}

/** Récupère l'historique MT5 /export-history (ouvre un téléchargement). */
export function exportHistoryUrl(symbol: string, timeframe = "M15", numBars = 50000): string {
  return `${currentApiUrl}/export-history?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&num_bars=${numBars}`;
}