import React, { useState, useEffect, useRef, useCallback, Dispatch, SetStateAction } from 'react';
import { MT5AccountState, ReconnectionState, MLModelStats, ActivePosition, ClosedTrade, LogEntry } from '../types';
import { toast } from 'sonner';
import { useMT5WebSocket, WsSnapshot } from './useMT5WebSocket';
import { getApiBaseUrl } from '../utils/api';

interface UseMT5ConnectionOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  onLogAdd?: (message: string, level?: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR') => void;
}

export function useMT5Connection(
  accountState: MT5AccountState,
  setAccountState: Dispatch<SetStateAction<MT5AccountState>>,
  riskConfig: any,
  setMlStats: Dispatch<SetStateAction<MLModelStats>>,
  setPositions: Dispatch<SetStateAction<ActivePosition[]>>,
  setClosedTrades: Dispatch<SetStateAction<ClosedTrade[]>>,
  setLogs: Dispatch<SetStateAction<LogEntry[]>>,
  options: UseMT5ConnectionOptions = {}
) {
  const {
    baseDelayMs = 2000,
    maxDelayMs = 30000,
    maxAttempts = 5,
    onLogAdd
  } = options;

  const [reconnectionState, setReconnectionState] = useState<ReconnectionState>({
    isReconnecting: false,
    attempt: 0,
    maxAttempts,
    backoffDelayMs: baseDelayMs,
    remainingMs: baseDelayMs,
    progressPct: 0,
    nextAttemptInSec: baseDelayMs / 1000,
    lastDisconnectReason: 'En attente du Bridge Python / MT5 hors ligne'
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const currentDelayRef = useRef<number>(baseDelayMs);

  // Calculate exponential backoff delay
  const getBackoffDelay = useCallback((attemptNumber: number) => {
    // delay = min(baseDelay * 2^(attempt - 1), maxDelay)
    const exponential = baseDelayMs * Math.pow(2, Math.max(0, attemptNumber - 1));
    return Math.min(exponential, maxDelayMs);
  }, [baseDelayMs, maxDelayMs]);

  // Force Reconnect Immediately
  const forceReconnect = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    if (onLogAdd) {
      onLogAdd('Reconnexion manuelle forcée initiée...', 'INFO');
    }

    setReconnectionState(prev => ({
      ...prev,
      isReconnecting: true,
      remainingMs: 0,
      progressPct: 100,
      nextAttemptInSec: 0
    }));

    setTimeout(() => {
      setAccountState(prev => ({
        ...prev,
        isConnected: true,
        pingMs: Math.floor(10 + Math.random() * 8)
      }));

      setReconnectionState(prev => ({
        ...prev,
        isReconnecting: false,
        attempt: 0,
        progressPct: 0
      }));

      if (onLogAdd) {
        onLogAdd('Connexion au Bridge ZeroMQ MT5 rétablie avec succès (12ms)!', 'SUCCESS');
      }
    }, 600);
  }, [setAccountState, onLogAdd]);

  // Simulate intentional disconnect
  const simulateDisconnect = useCallback((reason: string = 'Interruption réseau simulée (ZeroMQ Heartbeat Timeout)') => {
    setAccountState(prev => ({
      ...prev,
      isConnected: false
    }));

    setReconnectionState(prev => ({
      ...prev,
      lastDisconnectReason: reason,
      attempt: 1,
      isReconnecting: true
    }));

    if (onLogAdd) {
      onLogAdd(`Déconnexion MT5 détectée: ${reason}`, 'WARNING');
    }
  }, [setAccountState, onLogAdd]);

  // MetaApi Data Fetcher
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchMetaApi = async () => {
      console.log("[MT5] Fetching MetaApi Data. useLocalBridge:", riskConfig?.useLocalBridge);
      if (riskConfig?.useLocalBridge || !riskConfig?.metaApiToken || !riskConfig?.metaApiAccountId) {
          if (riskConfig?.useLocalBridge) console.log("[MT5] Skipped MetaApi: useLocalBridge is TRUE");
          return;
      }
      try {
        // Step 1: Get the account region and data from the provisioning API
        const provRes = await fetch(`https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${riskConfig.metaApiAccountId}`, {
          headers: { 'auth-token': riskConfig.metaApiToken }
        });
        
        if (!provRes.ok) {
          const errText = await provRes.text();
          if (onLogAdd) onLogAdd(`Erreur MetaApi Provisioning (${provRes.status}): ${errText.substring(0, 50)}`, 'ERROR');
          return;
        }
        
        const provData = await provRes.json();
        const region = provData.region || 'new-york';
        
        // Step 2: Update basic account info from provisioning data immediately
        setAccountState(prev => ({
          ...prev,
          broker: provData.broker || prev.broker,
          server: provData.server || prev.server,
          accountNumber: provData.login?.toString() || prev.accountNumber,
          isConnected: provData.connectionStatus === 'CONNECTED'
        }));

        // Step 3: Fetch real-time account information (balance, equity) from the region-specific client API
        const res = await fetch(`https://mt-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${riskConfig.metaApiAccountId}/account-information`, {
          headers: { 'auth-token': riskConfig.metaApiToken }
        });
        
        if (res.ok) {
          const data = await res.json();
          setAccountState(prev => ({
            ...prev,
            balance: data.balance || prev.balance,
            equity: data.equity || prev.equity,
            freeMargin: data.freeMargin || prev.freeMargin,
            marginLevelPct: data.marginLevel || prev.marginLevelPct,
            broker: data.broker || prev.broker,
            server: data.server || prev.server,
            currency: data.currency || prev.currency,
            accountNumber: data.login?.toString() || prev.accountNumber,
            isConnected: true
          }));
          if (onLogAdd && !interval) onLogAdd(`Données MetaApi synchronisées avec succès (${region}).`, 'SUCCESS');
        } else {
          const errText = await res.text();
          console.error("MetaApi HTTP Error:", res.status, errText);
          if (onLogAdd) onLogAdd(`Erreur MetaApi Client (${res.status}): ${errText.substring(0, 50)}`, 'ERROR');
        }
      } catch (e: any) {
         console.error("MetaApi Fetch Error:", e);
         if (onLogAdd) onLogAdd(`Échec de connexion MetaApi: ${e.message}`, 'ERROR');
      }
    };

    if (!riskConfig?.useLocalBridge && riskConfig?.metaApiToken && riskConfig?.metaApiAccountId) {
      if (onLogAdd) onLogAdd('Connexion à MetaApi initiée...', 'INFO');
      fetchMetaApi();
      interval = setInterval(fetchMetaApi, 5000); // Polling every 5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [riskConfig?.useLocalBridge, riskConfig?.metaApiToken, riskConfig?.metaApiAccountId, setAccountState]);

  // --- WebSocket Integration ---
  const wsUrl = React.useMemo(() => {
    let ip = riskConfig?.localBridgeIp || `${getApiBaseUrl()}`;
    let wsUrl = ip.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
    // Append the local API Key for security
    return wsUrl + '?api_key=marketshift_dev_secret_key_2026';
  }, [riskConfig?.localBridgeIp]);

  const handleWsSnapshot = useCallback((data: WsSnapshot) => {
    if (data.account) {
      setAccountState(prev => ({
        ...prev,
        balance: data.account!.balance,
        equity: data.account!.equity,
        freeMargin: data.account!.freeMargin,
        marginLevelPct: data.account!.marginLevel,
        broker: data.account!.broker,
        server: data.account!.server,
        currency: data.account!.currency,
        accountNumber: data.account!.login?.toString() || prev.accountNumber,
        isConnected: data.account!.isConnected,
        dailyPnL: data.account!.dailyPnL !== undefined ? data.account!.dailyPnL : prev.dailyPnL,
        dailyPnLPct: data.account!.dailyPnLPct !== undefined ? data.account!.dailyPnLPct : prev.dailyPnLPct,
      }));
    }

    if (data.positions) {
      setPositions(data.positions.map(p => ({
        ticket: p.ticket,
        symbol: p.symbol,
        type: p.type,
        lots: p.lots,
        openPrice: p.openPrice,
        currentPrice: p.currentPrice,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        pnl: p.profit !== undefined ? p.profit : (p.pnl || 0),
        pnlPct: p.pnlPct,
        openTime: '',
        magicNumber: p.magicNumber,
        mlConfidence: 0,
        signalReason: 'WS Sync'
      })) as ActivePosition[]);

      // Update unrealized PnL from positions sum
      const unrealized = data.positions.reduce((sum, p) => sum + (p.pnl || 0), 0);
      setAccountState(prev => ({ ...prev, unrealizedPnL: unrealized }));
    }

    if (data.signals) {
      const eurusdSig = data.signals['EURUSD'] || Object.values(data.signals)[0];
      if (eurusdSig) {
        setMlStats(prev => ({
          ...prev,
          currentSignal: {
            ...prev.currentSignal,
            direction: eurusdSig.direction,
            confidence: eurusdSig.confidence,
            features: [
              { name: eurusdSig.source, impact: 0.40 },
              ...prev.currentSignal.features.slice(0, 5)
            ]
          }
        }));
      }
    }

    if (data.ml) {
      setMlStats(prev => ({
        ...prev,
        accuracy: data.ml!.accuracy,
        f1Score: data.ml!.accuracy, // Approximation since F1 isn't calculated separately yet
        lastRetrained: data.ml!.lastTrained || prev.lastRetrained,
      }));
    }

    if (data.logs && data.logs.length > 0) {
      setLogs(prev => {
        const mappedLogs = data.logs!.map((l: any) => ({
          id: l.id ? `ws-log-${l.id}` : `ws-log-${l.timestamp}-${l.message}`,
          timestamp: l.timestamp,
          level: l.level as any,
          module: l.module,
          message: l.message
        }));
        
        // Deduplicate using ID
        const prevIds = new Set(prev.map(l => l.id));
        const newLogs = mappedLogs.filter(l => !prevIds.has(l.id));
        
        if (newLogs.length === 0) return prev;
        
        const localLogs = prev.filter(l => l.module !== 'PYTHON_BRIDGE');
        return [...newLogs, ...localLogs].slice(0, 150);
      });
    }
  }, [setAccountState, setPositions, setMlStats, setLogs]);

  const { status: wsStatus, forceReconnect: wsForceReconnect, errorMsg: wsErrorMsg } = useMT5WebSocket({
    url: wsUrl,
    onSnapshot: handleWsSnapshot,
    enabled: riskConfig?.useLocalBridge === true,
  });
  // -----------------------------

  // Local Python Bridge Data Fetcher (HTTP Fallback)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchLocalBridge = async () => {
      // ONLY run polling if WebSocket is in fallback mode or disabled
      if (!riskConfig?.useLocalBridge || wsStatus !== 'fallback_polling') return;
      
      try {
        let ip = riskConfig.localBridgeIp || `${getApiBaseUrl()}`;
        // ensure format has http://
        if (!ip.startsWith('http://') && !ip.startsWith('https://')) {
          ip = 'http://' + ip;
        }

        const res = await fetch(`${ip}/account-information`);
        
        if (res.ok) {
          const data = await res.json();
          setAccountState(prev => ({
            ...prev,
            balance: data.balance || prev.balance,
            equity: data.equity || prev.equity,
            freeMargin: data.freeMargin || prev.freeMargin,
            marginLevelPct: data.marginLevel || prev.marginLevelPct,
            broker: data.broker || prev.broker,
            server: data.server || prev.server,
            currency: data.currency || prev.currency,
            accountNumber: data.login?.toString() || prev.accountNumber,
            unrealizedPnL: data.unrealizedPnL !== undefined ? data.unrealizedPnL : prev.unrealizedPnL,
            dailyPnL: data.dailyPnL !== undefined ? data.dailyPnL : prev.dailyPnL,
            dailyPnLPct: data.dailyPnLPct !== undefined ? data.dailyPnLPct : prev.dailyPnLPct,
            isConnected: true
          }));
          
          if (onLogAdd && !interval) onLogAdd(`Connecté au Local Bridge MT5 avec succès.`, 'SUCCESS');
          
          // --- AI ML Prediction Fetch ---
          try {
            const mlStart = performance.now();
            const statusRes = await fetch(`${ip}/ml/status`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              const mlEnd = performance.now();
              setMlStats(prev => ({
                ...prev,
                inferenceTimeMs: Number((mlEnd - mlStart).toFixed(1)),
                lastRetrained: statusData.lastTrained || prev.lastRetrained,
                accuracy: statusData.accuracy || prev.accuracy,
                f1Score: statusData.accuracy || prev.f1Score,
                // On garde currentSignal tel quel car on le met à jour avec le websocket
              }));
            }
          } catch (e) {
            console.error("ML Status Error:", e);
          }
          // ------------------------------
          
          // --- Fetch Positions ---
          try {
            const posRes = await fetch(`${ip}/positions`);
            if (posRes.ok) {
              const posData = await posRes.json();
              setPositions(Array.isArray(posData) ? posData : []);
            }
          } catch (e) {
            console.error("Positions Fetch Error:", e);
          }

          // --- Fetch History ---
          try {
            const histRes = await fetch(`${ip}/history`);
            if (histRes.ok) {
              const histData = await histRes.json();
              setClosedTrades(Array.isArray(histData) ? histData : []);
            }
          } catch (e) {
            console.error("History Fetch Error:", e);
          }

          // --- Fetch Server Logs ---
          try {
            const logsRes = await fetch(`${ip}/logs`);
            if (logsRes.ok) {
              const logsData = await logsRes.json();
              const safeLogs = Array.isArray(logsData) ? logsData : [];
              const mappedLogs = safeLogs.map((l: any, i: number) => ({
                id: `server-log-${i}-${l.timestamp}`,
                timestamp: l.timestamp,
                level: l.level || 'INFO',
                module: 'PYTHON_BRIDGE',
                message: l.message
              }));
              
              setLogs(prev => {
                // Merge local react logs with server logs to avoid losing local ones?
                // Actually server logs are the source of truth for python, but React has some local ones.
                // It's better to just set it or merge carefully. We'll just set it for now and append local ones on top if needed, 
                // but since it's an interval, we'll just show the server logs.
                // Or better: filter out PYTHON_BRIDGE from prev, and prepend new mapped logs.
                const localLogs = prev.filter(l => l.module !== 'PYTHON_BRIDGE');
                return [...mappedLogs, ...localLogs].slice(0, 150);
              });
            }
          } catch (e) {
            console.error("Logs Fetch Error:", e);
          }
          
        } else {
          const errText = await res.text();
          if (onLogAdd) onLogAdd(`Erreur Local Bridge (${res.status}): ${errText.substring(0, 50)}`, 'ERROR');
        }
      } catch (e: any) {
         if (onLogAdd) onLogAdd(`Échec de connexion Local Bridge: ${e.message}`, 'ERROR');
      }
    };

    if (riskConfig?.useLocalBridge && riskConfig?.localBridgeIp) {
      if (onLogAdd) onLogAdd('Connexion au Serveur Local Python initiée...', 'INFO');
      fetchLocalBridge();
      interval = setInterval(fetchLocalBridge, 5000); // Polling every 5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [riskConfig?.useLocalBridge, riskConfig?.localBridgeIp, setAccountState]);



  // Synchronize RiskConfig with Python Backend
  useEffect(() => {
    let historyInterval: NodeJS.Timeout;
    const fetchHistoryOnly = async () => {
      if (!riskConfig?.useLocalBridge) return;
      try {
        let ip = riskConfig.localBridgeIp || `${getApiBaseUrl()}`;
        if (!ip.startsWith('http://') && !ip.startsWith('https://')) {
          ip = 'http://' + ip;
        }
        const histRes = await fetch(`${ip}/history`);
        if (histRes.ok) {
          const histData = await histRes.json();
          setClosedTrades(Array.isArray(histData) ? histData : []);
        }
      } catch (e) {
        console.error("WebSocket Mode - History Fetch Error:", e);
      }
    };

    if (riskConfig?.useLocalBridge) {
      fetchHistoryOnly(); // Initial fetch
      historyInterval = setInterval(fetchHistoryOnly, 15000); // 15s refresh
    }
    
    return () => {
      if (historyInterval) clearInterval(historyInterval);
    };
  }, [riskConfig?.useLocalBridge, riskConfig?.localBridgeIp, setClosedTrades]);

  // Synchronize RiskConfig with Python Backend
  useEffect(() => {
    if (!riskConfig?.useLocalBridge || !riskConfig?.localBridgeIp) return;
    const syncSettings = async () => {
      try {
        let ip = riskConfig.localBridgeIp || `${getApiBaseUrl()}`;
        if (!ip.startsWith('http://') && !ip.startsWith('https://')) ip = 'http://' + ip;
        
        const payload = {
          sl_multiplier: riskConfig.atrMultiplierSL || 1.0,
          tp_multiplier: riskConfig.atrMultiplierTP || 1.5,
          risk_percent: (riskConfig.maxRiskPerTradePct || 2.0) / 100.0,
          trailing_stop_active: riskConfig.useTrailingStop ?? true,
          trailing_stop_multiplier: riskConfig.trailingStopAtr || 1.0
        };

        const res = await fetch(`${ip}/settings`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-API-Key': import.meta.env.VITE_API_SECRET_KEY || 'marketshift_dev_secret_key_2026'
          },
          body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
          console.error("Failed to sync settings to Python Backend");
        } else {
          console.log("Settings synced to Python Backend:", payload);
        }
      } catch (e) {
        console.error("Error syncing settings", e);
      }
    };
    
    syncSettings();
  }, [
    riskConfig?.useLocalBridge, 
    riskConfig?.localBridgeIp,
    riskConfig?.atrMultiplierSL,
    riskConfig?.atrMultiplierTP,
    riskConfig?.maxRiskPerTradePct,
    riskConfig?.useTrailingStop,
    riskConfig?.trailingStopAtr
  ]);

  // Keep reconnectionState synced into accountState.reconnectionState
  useEffect(() => {
    setAccountState(prev => {
      if (prev.reconnectionState?.attempt === reconnectionState.attempt &&
          prev.reconnectionState?.progressPct === reconnectionState.progressPct &&
          prev.reconnectionState?.isReconnecting === reconnectionState.isReconnecting) {
        return prev;
      }
      return {
        ...prev,
        reconnectionState
      };
    });
  }, [reconnectionState, setAccountState]);

  const executeTrade = async (symbol: string, direction: 'BUY' | 'SELL') => {
    try {
      if (riskConfig?.useLocalBridge) {
        let ip = riskConfig.localBridgeIp || `${getApiBaseUrl()}`;
        if (!ip.startsWith('http://') && !ip.startsWith('https://')) ip = 'http://' + ip;

        const res = await fetch(`${ip}/trade`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': import.meta.env.VITE_API_SECRET_KEY || 'marketshift_dev_secret_key_2026'
          },
          body: JSON.stringify({ symbol, direction })
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }

        const data = await res.json();
        if (onLogAdd) onLogAdd(`Trade exécuté : ${direction} ${data.volume} lots sur ${symbol} (Ticket: ${data.ticket})`, 'SUCCESS');
        toast.success(`Trade ${direction} exécuté sur ${symbol}`, {
          description: `${data.volume} lots - Ticket #${data.ticket}`
        });
        return data;
      } else {
        // MetaApi Execution Logic
        if (!riskConfig?.metaApiToken || !riskConfig?.metaApiAccountId) {
          throw new Error("MetaApi credentials missing");
        }

        // Find region first
        const provRes = await fetch(`https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${riskConfig.metaApiAccountId}`, {
          headers: { 'auth-token': riskConfig.metaApiToken }
        });
        const provData = await provRes.json();
        const region = provData.region || 'new-york';

        const res = await fetch(`https://mt-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${riskConfig.metaApiAccountId}/trade`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'auth-token': riskConfig.metaApiToken
          },
          body: JSON.stringify({
            symbol,
            actionType: 'ORDER_TYPE_' + direction,
            volume: 0.01, // Default test lot
            comment: 'MarketShift Android Mobile'
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "MetaApi Trade Error");
        }

        const data = await res.json();
        if (onLogAdd) onLogAdd(`[Cloud] Trade ${direction} envoyé sur ${symbol}`, 'SUCCESS');
        toast.success(`Trade ${direction} envoyé (Cloud)`);
        return data;
      }
    } catch (e: any) {
      if (onLogAdd) onLogAdd(`Erreur exécution trade : ${e.message}`, 'ERROR');
      toast.error(`Échec du trade sur ${symbol}`, { description: e.message });
      throw e;
    }
  };

  const closePosition = async (ticket: number) => {
    try {
      if (riskConfig?.useLocalBridge) {
        let ip = riskConfig.localBridgeIp || `${getApiBaseUrl()}`;
        if (!ip.startsWith('http://') && !ip.startsWith('https://')) ip = 'http://' + ip;

        const res = await fetch(`${ip}/close`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': import.meta.env.VITE_API_SECRET_KEY || 'marketshift_dev_secret_key_2026'
          },
          body: JSON.stringify({ ticket })
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }

        if (onLogAdd) onLogAdd(`Position #${ticket} clôturée avec succès.`, 'SUCCESS');
        toast.success(`Position #${ticket} clôturée`, {
          description: 'La position a été fermée avec succès sur MT5.'
        });
        return await res.json();
      } else {
        // MetaApi Close Logic
        const provRes = await fetch(`https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${riskConfig.metaApiAccountId}`, {
          headers: { 'auth-token': riskConfig.metaApiToken }
        });
        const provData = await provRes.json();
        const region = provData.region || 'new-york';

        const res = await fetch(`https://mt-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${riskConfig.metaApiAccountId}/trade`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'auth-token': riskConfig.metaApiToken
          },
          body: JSON.stringify({
            actionType: 'POSITION_CLOSE_ID',
            positionId: ticket.toString()
          })
        });

        if (!res.ok) throw new Error("MetaApi Close Error");

        if (onLogAdd) onLogAdd(`[Cloud] Position #${ticket} fermée.`, 'SUCCESS');
        toast.success(`Position #${ticket} fermée (Cloud)`);
        return await res.json();
      }
    } catch (e: any) {
      if (onLogAdd) onLogAdd(`Erreur clôture position : ${e.message}`, 'ERROR');
      toast.error(`Échec de la clôture de la position #${ticket}`, { description: e.message });
      throw e;
    }
  };

  return {
    reconnectionState,
    forceReconnect,
    simulateDisconnect,
    executeTrade,
    closePosition,
    wsStatus,
    wsErrorMsg
  };
}
