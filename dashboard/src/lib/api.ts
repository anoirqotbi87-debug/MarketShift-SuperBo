import type {
  EquityPoint,
  KpiMetrics,
  RestPosition,
  ServerStatus,
  SymbolOverview,
} from "@/types/trading";

/**
 * Client REST minimal vers l'API FastAPI du bot.
 * Tous les fetchers sont tolérants aux erreurs : en cas d'échec ils
 * retournent des valeurs par défaut sûres plutôt que de faire crasher l'UI.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
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

export { API_URL, API_KEY };