"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WsSnapshot } from "@/types/trading";

/**
 * Client WebSocket temps réel avec reconnexion exponentielle.
 *
 * - URL dérivée de NEXT_PUBLIC_WS_URL + api_key en query param.
 * - Reconnexion : 1s, 2s, 5s, 10s (puis plafonné à 10s).
 * - État exposé : snapshot (dernier état reçu), connected, latency.
 * - Garde-fou : ignore les messages "ping" / malformés.
 */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000];

const DEFAULT_SNAPSHOT: WsSnapshot = {
  type: "snapshot",
  timestamp: "",
  account: {
    login: 0,
    balance: 0,
    equity: 0,
    freeMargin: 0,
    marginLevel: 0,
    currency: "USD",
    server: "Déconnecté",
    broker: "XM",
    isConnected: false,
    dailyPnL: 0,
    dailyPnLPct: 0,
  },
  positions: [],
  signals: {},
  kelly: { winRate: 0, rrRatio: 0, tradeCount: 0 },
  ml: { trained: false, accuracy: 0, sampleCount: 0, lastTrained: "", featureImportances: [] },
  logs: [],
  killSwitch: false,
  isPaused: false,
};

export function useMarketShiftWS() {
  const [snapshot, setSnapshot] = useState<WsSnapshot>(DEFAULT_SNAPSHOT);
  const [connected, setConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Latence mesurée au prochain message reçu après un ping keep-alive.
  const pendingLatencyAtRef = useRef<number | null>(null);

  // connect et scheduleReconnect sont mutuellement récursifs ; on passe par
  // des refs pour stabiliser les identités sans dépendance circulaire.
  const connectRef = useRef<() => void>(() => {});
  const scheduleReconnectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    // Si une socket est en cours d'ouverture/connexion, on ne relance pas.
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const url = `${WS_URL}?api_key=${encodeURIComponent(API_KEY)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnectRef.current();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 0;
      // Broadcast de snapshot toutes les 2s côté serveur ; on mesure la
      // latence sur la réception d'un message après envoi d'un ping.
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          pendingLatencyAtRef.current = performance.now();
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 15000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as WsSnapshot;
        // Le serveur envoie des messages { type: "ping" } sans payload utile.
        if (!data || data.type === "ping") return;

        setSnapshot(data);
        if (pendingLatencyAtRef.current !== null) {
          setLatencyMs(Math.round(performance.now() - pendingLatencyAtRef.current));
          pendingLatencyAtRef.current = null;
        }
      } catch {
        // Message non-JSON : ignorer silencieusement.
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      scheduleReconnectRef.current();
    };

    ws.onerror = () => {
      // On laisse onclose déclencher la reconnexion.
    };
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    const delay = RECONNECT_DELAYS[Math.min(retryRef.current, RECONNECT_DELAYS.length - 1)];
    retryRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectRef.current();
    }, delay);
  }, []);

  connectRef.current = connect;
  scheduleReconnectRef.current = scheduleReconnect;

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect]);

  return { snapshot, connected, latencyMs };
}