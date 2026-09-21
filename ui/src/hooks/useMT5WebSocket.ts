import { useEffect, useRef, useState, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types WebSocket
// ─────────────────────────────────────────────────────────────────────────────

export interface WsSnapshot {
  type: 'snapshot' | 'ping';
  timestamp?: string;
  account?: {
    login: number;
    balance: number;
    equity: number;
    freeMargin: number;
    marginLevel: number;
    currency: string;
    server: string;
    broker: string;
    isConnected: boolean;
    dailyPnL?: number;
    dailyPnLPct?: number;
  };
  positions?: WsPosition[];
  signals?: Record<string, WsSignal>;
  kelly?: {
    winRate: number;
    rrRatio: number;
    tradeCount: number;
  };
  ml?: {
    trained: boolean;
    accuracy: number;
    sampleCount: number;
    lastTrained: string | null;
    featureImportances: Record<string, number>;
  };
  logs?: WsLog[];
  killSwitch?: boolean;
  isPaused?: boolean;
}

export interface WsPosition {
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  lots: number;
  openPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
  stopLoss: number;
  takeProfit: number;
  magicNumber: number;
}

export interface WsSignal {
  direction: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  source: string;
  sl_pips?: number;
  tp_pips?: number;
}

export interface WsLog {
  timestamp: string;
  level: string;
  module: string;
  message: string;
}

export type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'error' | 'fallback_polling';

// ─────────────────────────────────────────────────────────────────────────────
// Hook useMT5WebSocket
// ─────────────────────────────────────────────────────────────────────────────

interface UseMT5WebSocketOptions {
  url: string;
  onSnapshot?: (data: WsSnapshot) => void;
  onStatusChange?: (status: WsStatus) => void;
  enabled?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
}

export function useMT5WebSocket({
  url,
  onSnapshot,
  onStatusChange,
  enabled = true,
  maxReconnectAttempts = 10,
  reconnectBaseDelayMs = 1000,
}: UseMT5WebSocketOptions) {
  const wsRef        = useRef<WebSocket | null>(null);
  const attemptsRef  = useRef(0);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef   = useRef(true);

  const [status, setStatus]     = useState<WsStatus>('connecting');
  const [lastData, setLastData] = useState<WsSnapshot | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const updateStatus = useCallback((s: WsStatus) => {
    setStatus(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
    }

    updateStatus(attemptsRef.current === 0 ? 'connecting' : 'reconnecting');
    setErrorMsg('');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        attemptsRef.current = 0;
        updateStatus('connected');
        setErrorMsg('');
        console.log('[WS] ✅ Connecté au backend Python');
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data: WsSnapshot = JSON.parse(event.data);
          if (data.type === 'ping') return;
          setLastData(data);
          onSnapshot?.(data);
        } catch (e) {
          console.error('[WS] Erreur parsing:', e);
        }
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        console.warn(`[WS] Connexion fermée (code: ${event.code}). Reconnexion...`);

        if (attemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(
            reconnectBaseDelayMs * Math.pow(2, attemptsRef.current),
            30000
          );
          attemptsRef.current++;
          updateStatus('reconnecting');
          timerRef.current = setTimeout(connect, delay);
        } else {
          updateStatus('fallback_polling');
          console.error('[WS] Max reconnexions atteint. Basculement en mode polling HTTP.');
        }
      };

      ws.onerror = (err: any) => {
        if (!mountedRef.current) return;
        console.error('[WS] Erreur:', err);
        setErrorMsg(err.message || 'Unknown Network Error');
        updateStatus('error');
      };

    } catch (e: any) {
      console.error('[WS] Impossible de créer WebSocket:', e);
      setErrorMsg(e.message || 'Exception during WebSocket creation');
      updateStatus('fallback_polling');
    }
  }, [url, enabled, maxReconnectAttempts, reconnectBaseDelayMs, updateStatus, onSnapshot]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [enabled, connect]);

  const forceReconnect = useCallback(() => {
    attemptsRef.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
    connect();
  }, [connect]);

  return { status, lastData, forceReconnect, errorMsg };
}
