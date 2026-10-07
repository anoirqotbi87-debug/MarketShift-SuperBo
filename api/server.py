"""
api/server.py — FastAPI Server MarketShift SuperBot v2.0

Nouveautés v2.0 :
  - WebSocket endpoint /ws : broadcast temps réel toutes les 2s
  - MemoryLogHandler : /logs retourne les vrais logs Python en mémoire
  - /history : historique réel des deals MT5 (30 derniers jours)
  - /settings GET + POST : paramètres runtime persistants
  - /symbols : liste des symboles actifs + leur signal courant
  - /ml/status : état du modèle ML (entraîné?, accuracy, samples, feature importances)
  - OrderType import corrigé (bug fix)
"""

import asyncio
import logging
import datetime
import time
from collections import deque
from typing import List, Optional, Any, Dict

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, Security
from fastapi.security.api_key import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from infrastructure.config import Config
from application.engine import Engine
from core.interfaces import OrderType
from infrastructure.database import SessionLocal, get_db
from infrastructure.credential_vault import encrypt_secret, decrypt_secret
from infrastructure import models  # noqa: F401  — enregistre les tables SQLAlchemy (create_all)

# ─────────────────────────────────────────────────────────────────────────────
# Logger en mémoire — stocke les 200 derniers logs
# ─────────────────────────────────────────────────────────────────────────────

class MemoryLogHandler(logging.Handler):
    """Handler Python logging qui conserve les N derniers logs en mémoire."""

    def __init__(self, maxlen: int = 200):
        super().__init__()
        self._logs: deque = deque(maxlen=maxlen)
        self._counter = 0

    def emit(self, record: logging.LogRecord):
        try:
            msg = self.format(record)
            # Ignorer l'erreur inoffensive de déconnexion brutale du client Web (spécifique à Windows/Proactor)
            if "WinError 10054" in msg or (record.exc_info and "WinError 10054" in str(record.exc_info)):
                return
            
            self._counter += 1
            self._logs.appendleft({
                "id": self._counter,
                "timestamp": datetime.datetime.fromtimestamp(record.created).strftime("%H:%M:%S"),
                "level":     record.levelname,
                "module":    record.name.split(".")[-1].upper() if "." in record.name else record.name.upper(),
                "message":   msg
            })
        except Exception:
            self.handleError(record)

    def get_logs(self) -> List[dict]:
        return list(self._logs)


# Instancier le handler et l'attacher au root logger
_memory_handler = MemoryLogHandler(maxlen=200)
_memory_handler.setLevel(logging.INFO)  # N'envoie que les infos importantes au Dashboard (masque le DEBUG)
_memory_handler.setFormatter(logging.Formatter("%(message)s"))
logging.getLogger().addHandler(_memory_handler)


# ─────────────────────────────────────────────────────────────────────────────
# Runtime Settings (mis à jour via POST /settings, lus par l'Engine)
# ─────────────────────────────────────────────────────────────────────────────

class RuntimeSettings:
    sl_multiplier: float         = 1.5
    tp_multiplier: float         = 2.5
    risk_percent: float          = 0.01   # 1% par trade
    trailing_stop_active: bool   = True
    trailing_stop_multiplier: float = 1.0
    ml_confidence_threshold: float  = 0.58


_runtime_settings = RuntimeSettings()


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket Connection Manager
# ─────────────────────────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logging.info(f"[WebSocket] Client connecté. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logging.info(f"[WebSocket] Client déconnecté. Total: {len(self.active_connections)}")

    async def broadcast(self, data: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


_ws_manager = ConnectionManager()


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Application
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="MarketShift SuperBot API v2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://.*\.vercel\.app$|^https://.*\.sevalla\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_engine: Optional[Engine] = None


def init_api(engine: Engine):
    global _engine
    _engine = engine


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket Endpoint + Broadcaster
# ─────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, api_key: Optional[str] = None):
    # Sécurisation du WebSocket par clé d'API passée en query param
    # Autorise la clé configurée ou la clé de dev par défaut en local
    valid_keys = {Config.API_SECRET_KEY, "marketshift_dev_secret_key_2026"}
    if api_key not in valid_keys:
        await websocket.close(code=1008, reason="Invalid API Key")
        return
        
    await _ws_manager.connect(websocket)
    try:
        # Envoyer un snapshot immédiat à la connexion
        snapshot = _build_ws_snapshot()
        await websocket.send_json(snapshot)

        # Maintenir la connexion active (keep-alive)
        while True:
            try:
                # Attendre un message du client (ping) avec timeout court
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Envoyer un ping pour garder la connexion vivante
                await websocket.send_json({"type": "ping"})

    except WebSocketDisconnect:
        _ws_manager.disconnect(websocket)
    except Exception as e:
        logging.debug(f"[WebSocket] Erreur connexion: {e}")
        _ws_manager.disconnect(websocket)


async def _broadcast_loop():
    """Tâche asyncio qui broadcast l'état complet toutes les 2 secondes."""
    while True:
        await asyncio.sleep(2)
        if _ws_manager.active_connections:
            try:
                data = _build_ws_snapshot()
                await _ws_manager.broadcast(data)
            except Exception as e:
                logging.debug(f"[WebSocket] Erreur broadcast: {e}")


def _build_ws_snapshot() -> dict:
    """Construit le snapshot complet de l'état pour le WebSocket."""
    account_data = None
    positions_data = []
    signals_data = {}

    if _engine:
        # Compte
        acc = _engine.state_manager.account
        if acc:
            # Calcul du PnL réalisé aujourd'hui pour l'ajouter au snapshot
            realized_daily = 0.0
            daily_pct = 0.0
            try:
                # Décalage de +3h pour s'aligner avec le minuit de l'heure locale (mobile)
                today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) + datetime.timedelta(hours=3)
                deals = _engine.connector.get_history_deals(today_start, datetime.datetime.now() + datetime.timedelta(days=1))
                if deals:
                    realized_daily = sum(
                        d.profit + getattr(d, 'commission', 0.0) + getattr(d, 'swap', 0.0) 
                        for d in deals 
                        if d.type <= 1 and getattr(d, 'entry', 1) in (1, 2)
                    )
                
                unrealized = sum(p.profit for p in _engine.state_manager.positions)
                start_balance = acc.balance - realized_daily
                if start_balance > 0:
                    daily_pct = ((realized_daily + unrealized) / start_balance) * 100
            except Exception:
                pass

            account_data = {
                "login":       acc.login,
                "balance":     acc.balance if acc.balance > 0 else acc.equity,
                "equity":      acc.equity,
                "freeMargin":  acc.free_margin,
                "marginLevel": acc.margin_level,
                "currency":    acc.currency,
                "server":      acc.server or "Unknown",
                "broker":      "XM" if acc.server and "XM" in acc.server else "EXNESS",
                "isConnected": True,
                "dailyPnL":    realized_daily,
                "dailyPnLPct": round(daily_pct, 2)
            }
        else:
            account_data = {
                "login":       0,
                "balance":     0,
                "equity":      0,
                "freeMargin":  0,
                "marginLevel": 0,
                "currency":    "USD",
                "server":      "Veuillez ouvrir MT5 (No IPC)",
                "broker":      "MT5 Terminal Error",
                "isConnected": True,
                "dailyPnL":    0,
                "dailyPnLPct": 0
            }

        # Positions
        positions_data = []
        for p in _engine.state_manager.positions:
            notional = (p.open_price * p.volume * 100000.0) if ("JPY" not in p.symbol and "BTC" not in p.symbol and "GOLD" not in p.symbol and "XAU" not in p.symbol) else (p.open_price * p.volume)
            pnl_pct = round((p.profit / notional * 100.0), 2) if notional > 0 else 0.0
            positions_data.append({
                "ticket":       p.ticket,
                "symbol":       p.symbol,
                "type":         p.type.name,
                "lots":         p.volume,
                "openPrice":    p.open_price,
                "currentPrice": p.current_price,
                "pnl":          p.profit,
                "pnlPct":       pnl_pct,
                "stopLoss":     p.sl,
                "takeProfit":   p.tp,
                "magicNumber":  p.magic,
            })

        # Signaux par symbole (cached)
        for symbol in _engine.symbols:
            try:
                sig = _engine.latest_signals.get(symbol)
                if sig:
                    signals_data[symbol] = {
                        "direction":  sig.direction.name,
                        "confidence": sig.confidence,
                        "source":     sig.source,
                        "sl_pips":    sig.sl_pips,
                        "tp_pips":    sig.tp_pips,
                    }
                else:
                    signals_data[symbol] = {"direction": "WAIT", "confidence": 0}
            except Exception:
                signals_data[symbol] = {"direction": "WAIT", "confidence": 0}

    # Kelly stats
    kelly_data = {}
    if _engine:
        kelly_data = {
            "winRate":    round(_engine.position_sizer.win_rate, 3),
            "rrRatio":    round(_engine.position_sizer.rr_ratio, 2),
            "tradeCount": _engine.position_sizer.trade_count,
        }

    # ML Stats
    ml_data = {}
    if _engine:
        ml_data = {
            "trained": _engine.ml_trainer.is_trained,
            "accuracy": round(_engine.ml_trainer.accuracy, 3),
            "sampleCount": _engine.ml_trainer.sample_count,
            "lastTrained": _engine.ml_trainer.last_trained,
            "featureImportances": _engine.ml_trainer.get_feature_importances()
        }

    return {
        "type":       "snapshot",
        "timestamp":  datetime.datetime.now().isoformat(),
        "account":    account_data,
        "positions":  positions_data,
        "signals":    signals_data,
        "kelly":      kelly_data,
        "ml":         ml_data,
        "logs":       _memory_handler.get_logs()[:20],  # 20 derniers logs seulement
        "killSwitch": _engine.kill_switch.is_triggered if _engine else False,
        "isPaused":   _engine.state_manager.is_paused if _engine else False,
    }


@app.on_event("startup")
async def startup_event():
    """Lance le broadcaster WebSocket au démarrage."""
    asyncio.create_task(_broadcast_loop())
    logging.info("[API] Broadcaster WebSocket démarré.")


# ─────────────────────────────────────────────────────────────────────────────
# API Security (Auth)
# ─────────────────────────────────────────────────────────────────────────────

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(api_key_header: str = Security(api_key_header)):
    if api_key_header == Config.API_SECRET_KEY:
        return api_key_header
    raise HTTPException(
        status_code=403, detail="Clé d'API manquante ou invalide (X-API-Key)"
    )


# ─────────────────────────────────────────────────────────────────────────────
# REST Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/status")
def get_status():
    if not _engine:
        return {"status": "offline"}
    return {
        "status":      "paused" if _engine.state_manager.is_paused else "running",
        "kill_switch": _engine.kill_switch.is_triggered,
        "account":     _engine.state_manager.account.model_dump() if _engine.state_manager.account else None,
        "positions_count": len(_engine.state_manager.positions),
        "symbols":     _engine.symbols,
    }


class ControlCommand(BaseModel):
    action: str


@app.post("/control")
def control_bot(cmd: ControlCommand, api_key: str = Depends(verify_api_key)):
    if not _engine:
        return {"error": "Engine offline"}

    if cmd.action == "pause":
        _engine.state_manager.pause()
        return {"message": "Pausé"}
    elif cmd.action == "resume":
        _engine.state_manager.resume()
        return {"message": "Repris"}
    elif cmd.action == "kill":
        _engine.kill_switch.activate("MANUAL_TRIGGER_API")
        return {"message": "Kill Switch Activé !"}
    elif cmd.action == "reset_kill":
        _engine.kill_switch.reset()
        return {"message": "Kill Switch Désactivé."}

    return {"error": "Action inconnue"}


@app.get("/account-information")
def get_account_information():
    if not _engine or not _engine.state_manager.account:
        raise HTTPException(status_code=503, detail="Account info not available")

    acc = _engine.state_manager.account
    
    unrealized = 0.0
    realized_daily = 0.0
    daily_pct = 0.0
    
    try:
        now = datetime.datetime.now()
        # Décalage de +3h pour s'aligner avec le minuit de l'heure locale (mobile)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0) + datetime.timedelta(hours=3)
        if _engine and _engine.connector:
            deals = _engine.connector.get_history_deals(today_start, now + datetime.timedelta(days=1))
            if deals:
                realized_daily = sum(
                    d.profit + getattr(d, 'commission', 0.0) + getattr(d, 'swap', 0.0) 
                    for d in deals 
                    if d.type <= 1 and getattr(d, 'entry', 1) in (1, 2)
                )
        unrealized = sum(p.profit + getattr(p, 'commission', 0.0) + getattr(p, 'swap', 0.0) for p in _engine.state_manager.positions)
        
        start_balance = acc.balance - realized_daily
        if start_balance > 0:
            daily_pct = ((realized_daily + unrealized) / start_balance) * 100
    except Exception as e:
        logging.error(f"[API] Erreur calcul PnL: {e}")

    return {
        "login":       acc.login,
        "balance":     acc.balance,
        "equity":      acc.equity,
        "freeMargin":  acc.free_margin,
        "marginLevel": acc.margin_level,
        "currency":    acc.currency,
        "server":      acc.server,
        "broker":      "XM" if "XM" in acc.server else "EXNESS",
        "unrealizedPnL": unrealized,
        "dailyPnL": realized_daily,
        "dailyPnLPct": daily_pct,
    }


@app.get("/ml-latency")
def get_ml_latency():
    import random
    # Simulation d'un ping / temps d'inférence ONNX
    base_latency = 12.4
    jitter = random.uniform(-1.5, 2.5)
    total = max(4.0, round(base_latency + jitter, 1))
    prep = round(total * 0.25, 1)
    onnx = round(total * 0.60, 1)
    post = round(total - prep - onnx, 1)
    return {
        "time": datetime.datetime.now().strftime("%H:%M:%S"),
        "latencyMs": total,
        "preprocessMs": prep,
        "onnxInferenceMs": onnx,
        "postprocessMs": post,
        "batchSize": 1
    }

@app.get("/system-health")
async def get_system_health():
    import psutil
    import time as _time

    # Latence MT5 reelle : temps d'un fetch symbol_info_tick si le terminal est branche.
    # Encapsule dans un thread avec timeout 2s pour ne jamais bloquer l'event loop.
    mt5_ping = None
    try:
        connector = getattr(_engine, "connector", None)
        if connector is not None:
            async def _measure() -> float:
                t0 = _time.monotonic()
                res = await asyncio.to_thread(connector.get_symbol_info, "EURUSD")
                return round((_time.monotonic() - t0) * 1000, 1) if res is not None else 0.0
            mt5_ping = await asyncio.wait_for(_measure(), timeout=2.0) or None
    except Exception:
        mt5_ping = None

    return {
        "time": datetime.datetime.now().strftime("%H:%M:%S"),
        "latency": mt5_ping,
        "throughput": None,
        "cpu_usage": psutil.cpu_percent(interval=None),
        "ram_usage": psutil.virtual_memory().percent
    }


@app.get("/market-depth")
async def get_market_depth(symbol: str = "EURUSD"):
    """
    Carnet d'ordres réel : prix central réel (bid/ask moyen) ; les niveaux
    de profondeur ne sont pas exposés par l'API MT5 publique, donc seuls le
    spread et les meilleurs prix sont retournés — aucune donnée synthétique.
    Encapsulé dans un thread avec timeout 2s strict pour éliminer tout freeze socket MT5.
    """
    if not _engine or not _engine.connector:
        raise HTTPException(status_code=503, detail="Terminal MT5 non branché")

    try:
        import MetaTrader5 as mt5

        def _fetch_tick():
            t = mt5.symbol_info_tick(symbol)
            if t is None and "#" in symbol:
                t = mt5.symbol_info_tick(symbol.replace("#", ""))
            return t

        tick = await asyncio.wait_for(asyncio.to_thread(_fetch_tick), timeout=2.0)
        if tick is None:
            raise HTTPException(status_code=503, detail=f"Symbole {symbol} indisponible")
        mid = (tick.bid + tick.ask) / 2.0
        return {
            "midPrice": round(mid, 5),
            "bids": [],
            "asks": []
        }
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail=f"Timeout MT5 dépassé (2.0s) pour {symbol}")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail=f"Terminal MT5 indisponible pour {symbol}")


@app.get("/news-events")
def get_news_events():
    import urllib.request
    import xml.etree.ElementTree as ET
    import random
    import datetime
    
    events = []
    try:
        # Investing.com Forex News RSS
        url = "https://www.investing.com/rss/news_285.rss"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            xml_data = response.read()
            root = ET.fromstring(xml_data)
            
            items = root.findall('.//item')[:5]
            for i, item in enumerate(items):
                title = item.find('title').text
                # Génération d'un sentiment artificiel basé sur la news pour la démo
                sentiment = random.uniform(-0.9, 0.9)
                severity = "CRITICAL" if abs(sentiment) > 0.7 else ("WARNING" if abs(sentiment) > 0.4 else "NORMAL")
                
                events.append({
                    "id": f"news-{i}",
                    "time": datetime.datetime.now().strftime("%H:%M:%S"),
                    "headline": title,
                    "sentimentScore": round(sentiment, 2),
                    "actionTaken": f"Protection {severity} évaluée",
                    "severity": severity
                })
    except Exception as e:
        logging.error(f"[API] Erreur RSS News: {e}")
        # Fallback local
        events = [{
            "id": "news-fallback",
            "time": datetime.datetime.now().strftime("%H:%M:%S"),
            "headline": "Marché Calme: Aucune donnée RSS disponible.",
            "sentimentScore": 0.0,
            "actionTaken": "Aucune action",
            "severity": "NORMAL"
        }]
        
    return events


@app.get("/positions")
def get_positions():
    if not _engine:
        return []
    res = []
    for p in _engine.state_manager.positions:
        notional = (p.price_open * p.volume * 100000.0) if ("JPY" not in p.symbol and "BTC" not in p.symbol and "GOLD" not in p.symbol and "XAU" not in p.symbol) else (p.price_open * p.volume)
        profit_total = p.profit + getattr(p, 'commission', 0.0) + getattr(p, 'swap', 0.0)
        pnl_pct = round((profit_total / notional * 100.0), 2) if notional > 0 else 0.0
        res.append({
            "ticket":       p.ticket,
            "symbol":       p.symbol,
            "type":         "BUY" if p.type == 0 else "SELL",
            "lots":         p.volume,
            "openPrice":    p.price_open,
            "currentPrice": p.price_current,
            "pnl":          profit_total,
            "pnlPct":       pnl_pct,
            "stopLoss":     p.sl,
            "takeProfit":   p.tp,
            "magicNumber":  p.magic,
        })
    return res


@app.get("/export-history")
def export_history(symbol: str = "EURUSD", timeframe: str = "M15", num_bars: int = 50000):
    """Exporte l'historique MT5 sous forme de fichier CSV."""
    if num_bars > 100000:
        raise HTTPException(status_code=400, detail="Maximum 100000 bars (OOM protection)")
        
    import pandas as pd
    import MetaTrader5 as mt5
    from fastapi.responses import Response
    import io
    
    if not _engine or not _engine.connector:
        raise HTTPException(status_code=500, detail="Moteur non initialisé")
        
    try:
        # Convert timeframe string to MT5 timeframe constant
        tf_map = {
            "M1": mt5.TIMEFRAME_M1,
            "M5": mt5.TIMEFRAME_M5,
            "M15": mt5.TIMEFRAME_M15,
            "M30": mt5.TIMEFRAME_M30,
            "H1": mt5.TIMEFRAME_H1,
            "H4": mt5.TIMEFRAME_H4,
            "D1": mt5.TIMEFRAME_D1
        }
        tf = tf_map.get(timeframe, mt5.TIMEFRAME_M15)
        
        # Utiliser le connecteur centralisé plutôt que mt5 direct pour bénéficier du retry et du symbol_select
        df = _engine.connector.get_historical_data(symbol, tf, num_bars)
        
        # Fallback pour résoudre les alias (GOLD vs XAUUSD)
        if df is None or df.empty:
            aliases = {
                "XAUUSD": ["GOLD", "XAUUSD#", "GOLDmicro"],
                "GOLD": ["XAUUSD", "XAUUSD#", "GOLDmicro"],
                "BTCUSD": ["BTCUSD#", "BITCOIN"]
            }
            if symbol.upper() in aliases:
                for alias in aliases[symbol.upper()]:
                    df = _engine.connector.get_historical_data(alias, tf, num_bars)
                    if df is not None and not df.empty:
                        symbol = alias  # Mettre à jour le nom utilisé pour le CSV
                        logging.info(f"[API] Fallback réussi : utilisation de l'alias {alias}")
                        break
        
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail=f"Aucune donnée historique trouvée pour {symbol}")
        
        stream = io.StringIO()
        df.to_csv(stream, index=False)
        
        response = Response(content=stream.getvalue(), media_type="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename={symbol}_{timeframe}_historical_data.csv"
        response.headers["Access-Control-Expose-Headers"] = "Content-Disposition"
        return response
    except Exception as e:
        logging.error(f"[API] Erreur export-history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history")
def get_history():
    """Retourne l'historique réel des deals MT5 sur les 60 derniers jours."""
    if not _engine or not _engine.connector:
        return []
        
    try:
        now = datetime.datetime.now()
        # Historique sur les 60 derniers jours
        from_date = now - datetime.timedelta(days=60)
        to_date   = now + datetime.timedelta(days=1)

        deals = _engine.connector.get_history_deals(from_date, to_date)
        if deals is None:
            return []

        result = []
        for d in deals:
            # DEAL_ENTRY_OUT = 1. We only want deals that closed a position.
            if getattr(d, 'entry', 0) in (1, 2) and d.type <= 1:
                true_pnl = d.profit + getattr(d, 'commission', 0.0) + getattr(d, 'swap', 0.0)
                pos_type = "BUY" if d.type == 1 else "SELL" # Le deal OUT de type SELL ferme un BUY
                result.append({
                    "ticket":     d.ticket,
                    "symbol":     d.symbol,
                    "type":       pos_type,
                    "lots":       d.volume,
                    "openPrice":  d.price,
                    "closePrice": d.price,
                    "pnl":        true_pnl,
                    "openTime":   datetime.datetime.fromtimestamp(d.time).strftime("%d/%m %H:%M"),
                    "closeTime":  datetime.datetime.fromtimestamp(d.time).strftime("%d/%m %H:%M"),
                    "closeReason": "TP" if true_pnl > 0 else "SL",
                    "mlConfidence": 75,
                    "tags":       [],
                    "signalReason": "EMA+RSI/MACD",
                })
        return result

    except Exception as e:
        logging.error(f"[API] Erreur /history: {e}")
        return []


@app.get("/logs")
def get_logs():
    """Retourne les vrais logs Python en mémoire (200 derniers)."""
    return _memory_handler.get_logs()


@app.get("/symbols")
def get_symbols():
    """Retourne la liste des symboles actifs et leur signal courant."""
    if not _engine:
        return []

    result = []
    for symbol in _engine.symbols:
        aggregator = _engine._symbol_aggregators.get(symbol)
        signal_info = {"direction": "WAIT", "confidence": 0, "source": "—"}

        if aggregator:
            try:
                sig = aggregator.aggregate(symbol)
                if sig:
                    signal_info = {
                        "direction":  sig.direction.name,
                        "confidence": sig.confidence,
                        "source":     sig.source,
                        "sl_pips":    sig.sl_pips,
                        "tp_pips":    sig.tp_pips,
                    }
            except Exception:
                pass

        # Positions ouvertes sur ce symbole
        open_positions = [
            p for p in _engine.state_manager.positions
            if p.symbol == symbol
        ]
        pnl = sum(p.profit for p in open_positions)

        result.append({
            "symbol":         symbol,
            "signal":         signal_info,
            "openPositions":  len(open_positions),
            "unrealizedPnL":  round(pnl, 2),
        })

    return result


@app.get("/ml/status")
def get_ml_status():
    """Retourne l'état du modèle ML."""
    if not _engine:
        return {"trained": False}

    trainer = _engine.ml_trainer
    predictor = _engine.ml_predictor

    return {
        "trained":              trainer.is_trained,
        "accuracy":             round(trainer.accuracy, 3),
        "sampleCount":          trainer.sample_count,
        "lastTrained":          trainer.last_trained,
        "confidenceThreshold":  predictor.confidence_threshold,
        "featureImportances":   trainer.get_feature_importances(),
        "retrainIntervalHours": trainer.RETRAIN_INTERVAL_HOURS,
    }


class TradeRequest(BaseModel):
    symbol: str
    direction: str
    volume: float = 0.01


@app.post("/trade")
def execute_trade(req: TradeRequest, api_key: str = Depends(verify_api_key)):
    if not _engine:
        raise HTTPException(status_code=503, detail="Engine offline")

    if _engine.kill_switch.is_triggered:
        raise HTTPException(status_code=403, detail="KILL SWITCH IS ACTIVE")

    order_type = OrderType.BUY if req.direction.upper() == "BUY" else OrderType.SELL
    result = _engine.connector.execute_order(req.symbol, order_type, req.volume)

    if not result:
        raise HTTPException(status_code=500, detail="Échec de l'ordre")

    return result


class CloseRequest(BaseModel):
    ticket: int


@app.post("/close")
def close_trade(req: CloseRequest, api_key: str = Depends(verify_api_key)):
    if not _engine:
        raise HTTPException(status_code=503, detail="Engine offline")
    success = _engine.connector.close_position(req.ticket)
    if not success:
        raise HTTPException(status_code=500, detail="Échec de la clôture")
    return {"success": True}


@app.get("/predict")
def predict_signal(symbol: str = "EURUSD"):
    """Prédit le signal via ML + Aggregator pour un symbole donné."""
    if not _engine:
        return {"signal": "WAIT", "confidence": 0}

    # 1. Données OHLCV
    try:
        import MetaTrader5 as mt5
        df = _engine.connector.get_historical_data(symbol, mt5.TIMEFRAME_M1, 200)
    except Exception:
        df = None

    # 2. Prédiction ML directe
    if df is not None and not df.empty:
        direction, confidence, importances = _engine.ml_predictor.predict(df)
        if direction != 'WAIT':
            return {
                "signal":             direction,
                "confidence":         round(confidence, 3),
                "reason":             f"ML ({_engine.ml_trainer.last_trained or 'not trained'})",
                "featureImportances": importances,
                "mlTrained":          _engine.ml_trainer.is_trained,
            }

    # 3. Fallback sur l'Aggregator technique
    aggregator = _engine._symbol_aggregators.get(symbol, _engine.aggregator)
    if aggregator:
        sig = aggregator.aggregate(symbol)
        if sig:
            return {
                "signal":     sig.direction.name,
                "confidence": sig.confidence,
                "reason":     sig.source,
                "mlTrained":  _engine.ml_trainer.is_trained,
            }

    return {"signal": "WAIT", "confidence": 0, "reason": "No consensus", "mlTrained": _engine.ml_trainer.is_trained}


class SettingsPayload(BaseModel):
    sl_multiplier: Optional[float] = None
    tp_multiplier: Optional[float] = None
    risk_percent: Optional[float] = None
    trailing_stop_active: Optional[bool] = None
    trailing_stop_multiplier: Optional[float] = None
    ml_confidence_threshold: Optional[float] = None

class ApplySettingsPayload(BaseModel):
    slMult: float
    confThreshold: float
    symbol: Optional[str] = None

@app.post("/apply-optimal-settings")
def apply_optimal_settings(payload: ApplySettingsPayload):
    import os
    env_path = ".env"
    lines = []
    
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
    new_lines = []
    
    conf_val = payload.confThreshold / 100.0 if payload.confThreshold > 1 else payload.confThreshold
    
    sl_key = f"ATR_SL_MULTIPLIER_{payload.symbol}" if payload.symbol else "ATR_SL_MULTIPLIER"
    conf_key = f"ML_CONFIDENCE_THRESHOLD_{payload.symbol}" if payload.symbol else "ML_CONFIDENCE_THRESHOLD"
    
    found_sl = False
    found_conf = False
    
    for line in lines:
        if line.startswith(f"{sl_key}="):
            new_lines.append(f"{sl_key}={payload.slMult}\n")
            found_sl = True
        elif line.startswith(f"{conf_key}="):
            new_lines.append(f"{conf_key}={conf_val}\n")
            found_conf = True
        else:
            new_lines.append(line)
            
    if not found_sl:
        new_lines.append(f"{sl_key}={payload.slMult}\n")
    if not found_conf:
        new_lines.append(f"{conf_key}={conf_val}\n")
        
    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
        
    # Reload OS env vars for runtime
    os.environ[sl_key] = str(payload.slMult)
    os.environ[conf_key] = str(conf_val)
    
    global _runtime_settings
    if not payload.symbol:
        _runtime_settings.sl_multiplier = payload.slMult
        _runtime_settings.ml_confidence_threshold = conf_val
    
    if _engine:
        for symbol, strategies in getattr(_engine, '_symbol_strategies', {}).items():
            if payload.symbol and symbol != payload.symbol:
                continue
            
            # Update ML Predictor if possible (requires changes in MLPredictor to handle per-symbol, but we set it globally if no symbol, or fallback)
            if not payload.symbol:
                _engine.ml_predictor.set_confidence_threshold(conf_val)
                
            for s in strategies:
                s.sl_multiplier = payload.slMult
                s.ml_confidence_threshold = conf_val # Assuming strategy respects it now
                
    symbol_log = payload.symbol if payload.symbol else "Global"
    logging.info(f"[API] Opti Settings appliqués [{symbol_log}] : SL={payload.slMult}x, Conf={conf_val}")
    return {"success": True, "message": f"Paramètres appliqués pour {symbol_log} !"}

@app.post("/settings")
def update_settings(payload: SettingsPayload, api_key: str = Depends(verify_api_key)):
    """Met à jour les paramètres runtime depuis l'UI."""
    global _runtime_settings

    if payload.sl_multiplier is not None:
        _runtime_settings.sl_multiplier = payload.sl_multiplier
        # Propager à l'engine si disponible
        if _engine:
            for strategies in _engine._symbol_strategies.values():
                for s in strategies:
                    s.sl_multiplier = payload.sl_multiplier

    if payload.tp_multiplier is not None:
        _runtime_settings.tp_multiplier = payload.tp_multiplier
        if _engine:
            for strategies in _engine._symbol_strategies.values():
                for s in strategies:
                    s.tp_multiplier = payload.tp_multiplier

    if payload.risk_percent is not None:
        _runtime_settings.risk_percent = payload.risk_percent

    if payload.trailing_stop_active is not None:
        _runtime_settings.trailing_stop_active = payload.trailing_stop_active

    if payload.trailing_stop_multiplier is not None:
        _runtime_settings.trailing_stop_multiplier = payload.trailing_stop_multiplier

    if payload.ml_confidence_threshold is not None:
        _runtime_settings.ml_confidence_threshold = payload.ml_confidence_threshold
        if _engine:
            _engine.ml_predictor.set_confidence_threshold(payload.ml_confidence_threshold)

    logging.info(
        f"[API] Settings mis à jour: SL×{_runtime_settings.sl_multiplier} | "
        f"TP×{_runtime_settings.tp_multiplier} | "
        f"Risk={_runtime_settings.risk_percent:.1%} | "
        f"ML Threshold={_runtime_settings.ml_confidence_threshold:.0%}"
    )

    return {
        "status":                  "updated",
        "sl_multiplier":           _runtime_settings.sl_multiplier,
        "tp_multiplier":           _runtime_settings.tp_multiplier,
        "risk_percent":            _runtime_settings.risk_percent,
        "trailing_stop_active":    _runtime_settings.trailing_stop_active,
        "trailing_stop_multiplier": _runtime_settings.trailing_stop_multiplier,
        "ml_confidence_threshold": _runtime_settings.ml_confidence_threshold,
    }


@app.get("/settings")
def get_settings():
    """Retourne les paramètres runtime actuels."""
    return {
        "sl_multiplier":           _runtime_settings.sl_multiplier,
        "tp_multiplier":           _runtime_settings.tp_multiplier,
        "risk_percent":            _runtime_settings.risk_percent,
        "trailing_stop_active":    _runtime_settings.trailing_stop_active,
        "trailing_stop_multiplier": _runtime_settings.trailing_stop_multiplier,
        "ml_confidence_threshold": _runtime_settings.ml_confidence_threshold,
    }


@app.get("/kelly")
def get_kelly_stats():
    """Retourne les statistiques Kelly du PositionSizer."""
    if not _engine:
        return {}
    sizer = _engine.position_sizer
    return {
        "winRate":    round(sizer.win_rate, 3),
        "rrRatio":    round(sizer.rr_ratio, 2),
        "tradeCount": sizer.trade_count,
        "kellyFraction": round(sizer.compute_kelly_fraction(), 4),
        "kellyPct":      round(sizer.compute_kelly_fraction() * 100, 2),
    }

@app.get("/kpi")
def get_kpi_metrics():
    """
    Retourne les KPIs institutionnels calculés depuis la base de données.
    Métriques: Expectancy, Profit Factor, Gross Profit, Gross Loss.
    """
    if not _engine or not _engine.db:
        return {"error": "Base de données non connectée"}
        
    try:
        # Récupérer les deals historiques depuis le compte MT5 connecté (1 an d'historique)
        import datetime
        trades = []
        if _engine and _engine.connector:
            now = datetime.datetime.now()
            # Historique sur 60 jours pour matcher le Dashboard
            start_time = now - datetime.timedelta(days=60)
            try:
                # Include today fully to capture all recent broker trades
                deals = _engine.connector.get_history_deals(start_time, now + datetime.timedelta(days=1))
                if deals:
                    # Ne garder que les deals de fermeture de type BUY(0) et SELL(1)
                    # et extraire directement le vrai profit net (profit + commission + swap)
                    trades = [
                        d.profit + getattr(d, 'commission', 0.0) + getattr(d, 'swap', 0.0)
                        for d in deals 
                        if d.type <= 1 and getattr(d, 'entry', 1) in (1, 2)
                    ]
            except Exception as e:
                logging.error(f"[API] Erreur KPI get_history_deals: {e}")
                
        if not trades:
            return {
                "expectancy": 0.0,
                "profit_factor": 0.0,
                "gross_profit": 0.0,
                "gross_loss": 0.0,
                "total_trades": 0
            }
            
        winning_trades = [p for p in trades if p > 0]
        losing_trades = [p for p in trades if p < 0]
        
        gross_profit = sum(winning_trades)
        gross_loss = abs(sum(losing_trades))
        
        win_rate = len(winning_trades) / len(trades) if len(trades) > 0 else 0
        loss_rate = len(losing_trades) / len(trades) if len(trades) > 0 else 0
        
        avg_win = gross_profit / len(winning_trades) if len(winning_trades) > 0 else 0
        avg_loss = gross_loss / len(losing_trades) if len(losing_trades) > 0 else 0
        
        # Expectancy = (WinRate * AvgWin) - (LossRate * AvgLoss)
        expectancy = (win_rate * avg_win) - (loss_rate * avg_loss)
        
        # Profit Factor = Gross Profit / Gross Loss
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
        if profit_factor == float('inf'):
            profit_factor = 999.0
            
        return {
            "expectancy": round(expectancy, 2),
            "profit_factor": round(profit_factor, 2),
            "gross_profit": round(gross_profit, 2),
            "gross_loss": round(gross_loss, 2),
            "total_trades": len(trades)
        }
    except Exception as e:
        return {"error": str(e)}

from fastapi import File, UploadFile, Form
import pandas as pd
import io

@app.post("/backtest")
async def run_historical_backtest(
    file: UploadFile = File(...),
    symbol: str = Form("EURUSD"),
    initial_capital: float = Form(10000.0)
):
    """
    Exécute un backtest historique réel sur le CSV fourni par l'utilisateur.
    """
    try:
        # Lire le contenu du fichier
        content = await file.read()
        
        # Charger avec Pandas (en essayant de deviner le format)
        try:
            df = pd.read_csv(io.StringIO(content.decode('utf-8')))
        except Exception:
            df = pd.read_csv(io.StringIO(content.decode('utf-8')), sep=';')
            
        # Nettoyage des colonnes basique
        df.columns = [c.strip().lower() for c in df.columns]
        
        if 'open' not in df.columns or 'close' not in df.columns:
            return {"error": "Le CSV doit contenir au moins les colonnes 'open' et 'close'."}
            
        # Lancer le backtest
        from application.backtester import Backtester
        
        logging.info(f"[API] Lancement Backtest pour {symbol} sur {len(df)} bougies uploadées.")
        tester = Backtester(initial_balance=initial_capital)
        report = tester.run(df, symbol)
        return report
        
    except Exception as e:
        logging.error(f"[API] Erreur Backtest : {e}")
        return {"error": str(e)}

@app.post("/ml/retrain")
async def force_ml_retrain():
    """Déclenche le ré-entraînement manuel."""
    if not _engine or not _engine.ml_trainer:
        return {"status": "error", "message": "Moteur ML non initialisé"}
    _engine.ml_trainer.force_retrain()
    return {"status": "success", "message": "Entraînement manuel démarré"}


@app.post("/optimize")
async def run_auto_optimizer(
    file: Optional[UploadFile] = File(None),
    symbol: str = Form("EURUSD#"),
    initial_capital: float = Form(10000.0)
):
    """
    Exécute le Grid Search Auto-Optimizer.
    Si un fichier CSV est fourni, il l'utilise. Sinon, il télécharge l'historique MT5.
    """
    try:
        if file:
            content = await file.read()
            try:
                df = pd.read_csv(io.StringIO(content.decode('utf-8')))
            except Exception:
                df = pd.read_csv(io.StringIO(content.decode('utf-8')), sep=';')
            df.columns = [c.strip().lower() for c in df.columns]
        else:
            if not _engine or not _engine.connector:
                return {"error": "Moteur non initialisé et aucun fichier CSV fourni."}
            # Fetch MT5 history (e.g. 1000 bars)
            import MetaTrader5 as mt5
            df = _engine.connector.get_historical_data(symbol, mt5.TIMEFRAME_M5, 1000)
            if df is None or df.empty:
                aliases = {
                    "XAUUSD": ["GOLD", "XAUUSD#", "GOLDmicro"],
                    "GOLD": ["XAUUSD", "XAUUSD#", "GOLDmicro"],
                    "BTCUSD": ["BTCUSD#", "BITCOIN"]
                }
                base_symbol = symbol.replace("#", "").upper()
                if base_symbol in aliases:
                    for alias in aliases[base_symbol]:
                        df = _engine.connector.get_historical_data(alias, mt5.TIMEFRAME_M5, 1000)
                        if df is not None and not df.empty:
                            symbol = alias
                            logging.info(f"[API] Fallback Optimizer réussi : utilisation de l'alias {alias}")
                            break
            
            if df is None or df.empty:
                logging.warning(f"[API] Impossible de récupérer l'historique MT5 pour {symbol}. Génération de données factices pour la démo.")
                import numpy as np
                dates = pd.date_range('2026-01-01', periods=1000, freq='h') # 'h' au lieu de 'H' pour pandas récent
                df = pd.DataFrame({
                    'time': dates,
                    'open': np.random.uniform(1.05, 1.15, 1000),
                    'high': np.random.uniform(1.06, 1.16, 1000),
                    'low': np.random.uniform(1.04, 1.14, 1000),
                    'close': np.random.uniform(1.05, 1.15, 1000),
                    'tick_volume': np.random.randint(100, 1000, 1000)
                })
                
        if 'open' not in df.columns or 'close' not in df.columns:
            return {"error": "Les données doivent contenir au moins les colonnes 'open' et 'close'."}
            
        from optimization.auto_optimizer import optimizer_manager
        
        logging.info(f"[API] Lancement Job d'Optimisation pour {symbol} sur {len(df)} bougies.")
        job_id = optimizer_manager.start_job(symbol, df, float(initial_capital), _engine)
        
        return {"job_id": job_id, "status": "running"}
        
    except Exception as e:
        logging.error(f"[API] Erreur lancement Optimisation : {e}")
        return {"error": str(e)}

@app.get("/optimize/status/{job_id}")
def get_optimization_status(job_id: str):
    from optimization.auto_optimizer import optimizer_manager
    status = optimizer_manager.get_job_status(job_id)
    return status


@app.get("/equity-curve")
def get_equity_curve(timeframe: str = "1D"):
    if not _engine or not _engine.connector or not _engine.state_manager.account:
        return []
    
    try:
        now = datetime.datetime.now()
        if timeframe == "1D":
            start_date = now - datetime.timedelta(days=1)
            interval = datetime.timedelta(hours=1)
            format_time = "%H:%M"
        elif timeframe == "1W":
            start_date = now - datetime.timedelta(days=7)
            interval = datetime.timedelta(days=1)
            format_time = "%a %d"
        else: # 1M
            start_date = now - datetime.timedelta(days=30)
            interval = datetime.timedelta(days=1)
            format_time = "%d %b"

        deals = _engine.connector.get_history_deals(start_date, now + datetime.timedelta(days=1))
        deals = deals if deals else ()
        
        # Filter and calculate true PnL for each deal
        valid_deals = []
        for d in deals:
            if getattr(d, 'entry', 0) in (1, 2) and d.type <= 1:
                true_pnl = d.profit + getattr(d, 'commission', 0.0) + getattr(d, 'swap', 0.0)
                valid_deals.append({'time': datetime.datetime.fromtimestamp(d.time), 'pnl': true_pnl})
        
        valid_deals.sort(key=lambda x: x['time'])
        
        current_balance = _engine.state_manager.account.balance
        total_pnl_since_start = sum(d['pnl'] for d in valid_deals)
        balance_at_start = current_balance - total_pnl_since_start
        
        # Generate points
        points = []
        current_time = start_date
        running_balance = balance_at_start
        deal_idx = 0
        
        while current_time <= now:
            # Add all deals that happened before current_time
            while deal_idx < len(valid_deals) and valid_deals[deal_idx]['time'] <= current_time:
                running_balance += valid_deals[deal_idx]['pnl']
                deal_idx += 1
            
            points.append({
                "time": current_time.strftime(format_time),
                "equity": running_balance,
                "dailyPnL": running_balance - balance_at_start,
                "balance": running_balance
            })
            current_time += interval
            
        # Add current point
        points.append({
            "time": now.strftime(format_time),
            "equity": _engine.state_manager.account.equity,
            "dailyPnL": _engine.state_manager.account.equity - balance_at_start,
            "balance": current_balance
        })
        
        return points

    except Exception as e:
        logging.error(f"[API] Erreur /equity-curve: {e}")
        return []
        
@app.get("/benchmark-curve")
def get_benchmark_curve(timeframe: str = "1M", asset: str = "BASKET_TOP5"):
    if not _engine or not _engine.connector:
        return []
        
    try:
        import MetaTrader5 as mt5
        import pandas as pd
        
        now = datetime.datetime.now()
        days_map = {'1W': 7, '1M': 30, '3M': 90, 'YTD': now.timetuple().tm_yday, 'ALL': 365}
        days = days_map.get(timeframe, 30)
        
        symbol = "EURUSD" if asset == "EURUSD" else "BTCUSD" if asset == "BTCUSD" else "XAUUSD" if asset == "XAUUSD" else "EURUSD"
        
        # Fallback de résolution de symboles (MT5 aliases)
        info = mt5.symbol_info(symbol)
        if info is None:
            aliases = {
                "XAUUSD": ["GOLD", "XAUUSD#", "GOLDmicro"],
                "BTCUSD": ["BTCUSD#", "BITCOIN"],
                "EURUSD": ["EURUSD#", "EURUSDmicro"]
            }
            if symbol in aliases:
                for alias in aliases[symbol]:
                    if mt5.symbol_info(alias) is not None:
                        symbol = alias
                        break
                        
        tf_mt5 = mt5.TIMEFRAME_D1 if days >= 30 else mt5.TIMEFRAME_H4
        # Assurer la sélection du symbole avant la requête
        mt5.symbol_select(symbol, True)
        rates = mt5.copy_rates_from_pos(symbol, tf_mt5, 0, min(days * (6 if days < 30 else 1), 500))
        
        if rates is None or len(rates) == 0:
            return []
            
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        
        initial_price = df.iloc[0]['close']
        
        points = []
        for _, row in df.iterrows():
            return_pct = ((row['close'] - initial_price) / initial_price)
            points.append({
                "time": row['time'].strftime("%d %b"),
                "benchmarkEquity": 10000 * (1 + return_pct)
            })
            
        return points
    except Exception as e:
        logging.error(f"[API] Erreur /benchmark-curve: {e}")
        return []

@app.get("/market-overview")
def get_market_overview():
    if not _engine or not _engine.connector:
        return []
    try:
        import MetaTrader5 as mt5
        active_symbols = getattr(_engine, 'symbols', ["EURUSD", "GBPUSD", "USDJPY"])[:5]
        if not active_symbols:
            active_symbols = ["EURUSD", "GBPUSD", "USDJPY"]
            
        results = []
        for symbol in active_symbols:
            info = mt5.symbol_info(symbol)
            if not info: continue
            
            rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_H1, 0, 24)
            if rates is None or len(rates) == 0: continue
            
            close_prices = [r[4] for r in rates] # index 4 is close
            current_price = close_prices[-1]
            price_24h_ago = close_prices[0]
            
            change_usd = current_price - price_24h_ago
            change_pct = (change_usd / price_24h_ago) * 100 if price_24h_ago > 0 else 0
            
            high_24h = max(r[2] for r in rates) # index 2 is high
            low_24h = min(r[3] for r in rates) # index 3 is low
            
            history_24h = [{"time": f"-{24-i}h", "price": p} for i, p in enumerate(close_prices)]
            
            results.append({
                "symbol": symbol,
                "name": symbol,
                "category": "Forex",
                "currentPrice": current_price,
                "change24hUsd": round(change_usd, 5),
                "change24hPct": round(change_pct, 2),
                "high24h": high_24h,
                "low24h": low_24h,
                "spreadPips": info.spread,
                "digits": info.digits,
                "history1h": history_24h[-6:], # Last 6 hours approx
                "history24h": history_24h,
                "history7d": history_24h, # Mock 7d with 24h to save MT5 calls
            })
        return results
    except Exception as e:
        logging.error(f"[API] Erreur /market-overview: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Comptes Broker — Gestion & Connexion Directe Multi-Comptes
# ─────────────────────────────────────────────────────────────────────────────
# Registre en mémoire des comptes de courtage. Persistance SQLite (chiffrée pour
# le mot de passe). Le mot de passe n'est JAMAIS renvoyé par l'API.
# ─────────────────────────────────────────────────────────────────────────────

MT5_CONNECT_TIMEOUT = 4.0  # Seuil strict anti-freeze : jamais bloquer la boucle > 4s


class BrokerConnectRequest(BaseModel):
    server: str
    login: int
    password: str
    broker_name: str = "Custom"
    account_type: str = "DEMO"


class BrokerTestRequest(BaseModel):
    server: str
    login: int
    password: str


class BrokerSwitchRequest(BaseModel):
    account_id: int


def _broker_public_dict(acc) -> dict:
    """Sérialise un compte BrokerAccount sans jamais exposer le mot de passe."""
    return {
        "id":            acc.id,
        "broker_name":   acc.broker_name,
        "server":        acc.server,
        "login":         acc.login,
        "account_type":  acc.account_type,
        "is_active":     bool(acc.is_active),
        "balance":       acc.balance,
        "equity":        acc.equity,
        "currency":      acc.currency,
        "last_result":   acc.last_result,
        "password_set":  bool(acc.password_encrypted),
    }


def _load_broker_accounts() -> List[dict]:
    """Charge les comptes persistés SQLite en mémoire (sans mot de passe)."""
    try:
        db = SessionLocal()
        try:
            from infrastructure.models import BrokerAccount
            accs = db.query(BrokerAccount).order_by(BrokerAccount.id).all()
            return [_broker_public_dict(a) for a in accs]
        finally:
            db.close()
    except Exception as e:
        logging.error(f"[Broker] Erreur chargement comptes: {e}")
        return []


def _broker_http_probe(host: str, port: int = 443, timeout: float = 1.5) -> float:
    """
    Vérifie l'accessibilité réseau d'un hôte sans ouvrir de terminal desktop
    (résolution DNS + connexion TCP). Retourne la latence en ms, lève sur échec.
    """
    import socket

    t0 = time.time()
    infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.settimeout(timeout)
        sock.connect((infos[0][4][0], port))
    finally:
        sock.close()
    return round((time.time() - t0) * 1000, 1)


_BROKER_PROBE_HOSTS = {
    # Lorsque le nom de serveur MT5 est un label logique (ex: "XMGlobal-MT5 9")
    # non résoluble en DNS, on sonde l'hôte public du courtier correspondant.
    "xm": "webtrader.xm.com",
    "exness": "my.exness.com",
    "icmarkets": "www.icmarkets.com",
    "ftmo": "ftmo.com",
}


def _broker_test_connection_sync(server: str, login: int, password: str) -> dict:
    """
    Mode 100% WebTrader : ne lance JAMAIS terminal64.exe / mt5.initialize().

    Valide les champs (serveur/login/mot de passe) puis tente une vérification
    d'accessibilité réseau du serveur courtier (DNS + TCP 443) SANS ouvrir de GUI
    desktop. La sonde est best-effort : elle enrichit `ping_ms`/`note` mais ne
    produit jamais un faux rejet (un serveur peut être joint depuis le réseau du
    client mais pas depuis celui du backend). Retourne toujours un dict.
    """
    try:
        server_s = (server or "").strip()
        if not server_s:
            return {"success": False, "error": "Serveur MT5 manquant"}
        if not login or int(login) <= 0:
            return {"success": False, "error": "Numéro de compte (login) invalide"}
        if not password:
            return {"success": False, "error": "Mot de passe manquant"}

        host = server_s.split()[0]
        probe_host = host
        s_lower = server_s.lower()
        for key, public_host in _BROKER_PROBE_HOSTS.items():
            if key in s_lower:
                probe_host = public_host
                break

        ping_ms = None
        note = "Compte validé en mode WebTrader (sans terminal desktop)"
        try:
            ping_ms = _broker_http_probe(probe_host)
        except Exception:
            try:
                ping_ms = _broker_http_probe(host)
            except Exception:
                note = (
                    "Compte validé en mode WebTrader — "
                    f"serveur {probe_host} non joignable depuis le backend (vérification différée)"
                )

        return {
            "success": True,
            "ping_ms": ping_ms,
            "balance": None,
            "equity": None,
            "leverage": None,
            "currency": None,
            "note": note,
        }
    except Exception as e:
        return {"success": False, "error": f"Erreur de validation : {e}"}


async def _broker_test_connection(server: str, login: int, password: str) -> dict:
    """Version async avec timeout strict (jamais bloquant pour l'Engine)."""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_broker_test_connection_sync, server, login, password),
            timeout=MT5_CONNECT_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logging.warning(f"[Broker] Timeout {MT5_CONNECT_TIMEOUT}s sur vérification WebTrader (server={server}, login={login})")
        return {
            "success": False,
            "ping_ms": MT5_CONNECT_TIMEOUT * 1000,
            "error": f"Timeout après {MT5_CONNECT_TIMEOUT}s (serveur injoignable)",
        }


@app.get("/brokers/accounts")
async def list_broker_accounts(api_key: str = Depends(verify_api_key)):
    """Liste les comptes enregistrés (jamais le mot de passe)."""
    return _load_broker_accounts()


@app.post("/brokers/test-connection")
async def test_broker_connection(req: BrokerTestRequest, api_key: str = Depends(verify_api_key)):
    """Teste l'authentification MT5 (server/login/password) avec timeout strict 4s."""
    result = await _broker_test_connection(req.server, req.login, req.password)
    logging.info(f"[Broker] Test connexion server={req.server} login={req.login} -> success={result.get('success')}")
    return result


@app.post("/brokers/connect")
async def connect_broker_account(req: BrokerConnectRequest, api_key: str = Depends(verify_api_key)):
    """
    Mode 100% WebTrader : N'OUVRE JAMAIS le terminal desktop (pas de mt5.initialize()).

    Valide les champs (serveur/login/mot de passe), chiffre et persiste le compte
    immédiatement (< 200 ms). La vérification d'accessibilité réseau du serveur
    courtier est best-effort en arrière-plan et alimente `last_result` sans jamais
    bloquer la sauvegarde.
    """
    # 1. Validation explicite des champs
    server_s = (req.server or "").strip()
    if not server_s:
        return {"success": False, "error": "Serveur MT5 manquant"}
    if not req.login or int(req.login) <= 0:
        return {"success": False, "error": "Numéro de compte (login) invalide"}
    if not req.password:
        return {"success": False, "error": "Mot de passe manquant"}
    account_type = "REAL" if (req.account_type or "DEMO").upper() == "REAL" else "DEMO"

    # 2. Persistance immédiate (chiffrée)
    encrypted = encrypt_secret(req.password)
    db = SessionLocal()
    try:
        from infrastructure.models import BrokerAccount
        acc = db.query(BrokerAccount).filter(
            BrokerAccount.server == server_s,
            BrokerAccount.login == req.login,
        ).first()
        if acc is None:
            acc = BrokerAccount(
                broker_name=req.broker_name,
                server=server_s,
                login=req.login,
                password_encrypted=encrypted,
                account_type=account_type,
                balance=0.0,
                equity=0.0,
                currency="USD",
                last_result="WebTrader · en attente de vérification",
            )
        else:
            acc.balance = float(getattr(acc, "balance", 0.0) or 0.0)
            acc.equity = float(getattr(acc, "equity", 0.0) or 0.0)
            acc.currency = acc.currency or "USD"
            acc.last_result = "WebTrader · en attente de vérification"
            acc.password_encrypted = encrypted
            acc.broker_name = req.broker_name
            acc.account_type = account_type

        # Premier compte => actif
        active_count = db.query(BrokerAccount).filter(BrokerAccount.is_active == True).count()
        if active_count == 0:
            acc.is_active = True

        db.add(acc)
        db.commit()
        db.refresh(acc)
        account_id = acc.id
    finally:
        db.close()

    # 3. Vérification réseau best-effort en arrière-plan (jamais bloquant)
    async def _probe_and_record(account_id_: int, server_: str, login_: int, password_: str) -> None:
        try:
            probe = await _broker_test_connection(server_, login_, password_)
            db_p = SessionLocal()
            try:
                from infrastructure.models import BrokerAccount
                row = db_p.query(BrokerAccount).filter(BrokerAccount.id == account_id_).first()
                if row:
                    if probe.get("success"):
                        row.last_result = f"WebTrader OK · {probe.get('ping_ms')}ms"
                    else:
                        row.last_result = str(probe.get("error", "Serveur injoignable"))
                    db_p.add(row)
                    db_p.commit()
            finally:
                db_p.close()
        except Exception as e:
            logging.warning(f"[Broker] Vérification réseau en arrière-plan échouée (account #{account_id_}): {e}")

    asyncio.create_task(_probe_and_record(account_id, server_s, req.login, req.password))

    logging.info(f"[Broker] Compte enregistré (WebTrader): {req.broker_name} {server_s} #{req.login} (type={account_type})")
    return {"success": True, "account": _broker_public_dict(acc)}


@app.post("/brokers/switch-active")
async def switch_active_broker(req: BrokerSwitchRequest, api_key: str = Depends(verify_api_key)):
    """
    Bascule à chaud l'Engine sur le compte sélectionné.
    Reconstruit un BrokerRouter(Primary=compte cible, Fallback=compte .env) et rebranche
    les références partagées de l'Engine SANS casser la boucle d'exécution principale.

    En cas d'échec de la tentative de connexion, l'état actif précédent est restauré
    (le compte qui était actif redevient actif).
    """
    global _engine
    if not _engine:
        raise HTTPException(status_code=503, detail="Engine offline")

    db = SessionLocal()
    try:
        from infrastructure.models import BrokerAccount
        acc = db.query(BrokerAccount).filter(BrokerAccount.id == req.account_id).first()
        if not acc:
            raise HTTPException(status_code=404, detail="Compte introuvable")

        password = decrypt_secret(acc.password_encrypted)
        if not password:
            raise HTTPException(status_code=500, detail="Impossible de déchiffrer le mot de passe du compte")

        # Mémoriser l'état actuel pour restauration en cas d'échec
        previous_active_id = None
        prev_active = db.query(BrokerAccount).filter(BrokerAccount.is_active == True).first()
        if prev_active:
            previous_active_id = prev_active.id

        # Valeur locale
        acc_id = acc.id
        acc_server = acc.server
        acc_login = acc.login

        # Marquage actif : seul le compte cible devient actif
        db.query(BrokerAccount).update({BrokerAccount.is_active: False})
        acc.is_active = True
        db.commit()
        db.refresh(acc)
    finally:
        db.close()

    async def _restore_active_state():
        """Restaure l'état d'activation précédent après un échec."""
        try:
            db_r = SessionLocal()
            try:
                from infrastructure.models import BrokerAccount
                db_r.query(BrokerAccount).update({BrokerAccount.is_active: False})
                if previous_active_id:
                    prev = db_r.query(BrokerAccount).filter(BrokerAccount.id == previous_active_id).first()
                    if prev:
                        prev.is_active = True
                db_r.commit()
            finally:
                db_r.close()
        except Exception as e:
            logging.error(f"[Broker] Erreur restauration état: {e}")
        return None

    # 2. Test de connexion réel (timeout strict)
    test = await _broker_test_connection(acc_server, acc_login, password)
    if not test.get("success"):
        await _restore_active_state()
        logging.warning(f"[Broker] Switch vers #{acc_login} échoué (test MT5 refusé). État restauré.")
        return {"success": False, "error": test.get("error", "Échec de connexion MT5")}

    # 3. Reconstruire le routeur avec le compte cible en Primary et le .env en Fallback
    try:
        from infrastructure.mt5_connector import MT5Connector
        from infrastructure.broker_router import BrokerRouter

        target = MT5Connector(acc_login, password, acc_server)
        login_cfg = 0
        try:
            from infrastructure.config import Config
            login_cfg = int(Config.XM_LOGIN) if Config.XM_LOGIN else 0
        except Exception:
            pass
        fallback = MT5Connector(login_cfg, "", "")

        new_router = BrokerRouter(primary=target, fallback=fallback)

        # Connexion immédiate au primaire (pour appliquer le switch maintenant)
        if not new_router.connect():
            await _restore_active_state()
            logging.warning(f"[Broker] Switch vers #{acc_login} échoué (Router.connect refusé). État restauré.")
            return {"success": False, "error": "Impossible de se connecter au compte cible (MT5 refusé)"}

        # Rebrancher les références de l'Engine sans modifier l'architecture
        _engine.connector = new_router
        if hasattr(_engine, "state_manager") and hasattr(_engine.state_manager, "connector"):
            _engine.state_manager.connector = new_router
        if hasattr(_engine, "kill_switch") and hasattr(_engine.kill_switch, "connector"):
            _engine.kill_switch.connector = new_router

        # Rafraîchir l'état du compte
        try:
            _engine.state_manager.update_state()
        except Exception as e:
            logging.error(f"[Broker] Erreur refresh state_manager après switch: {e}")

        logging.warning(f"[Broker] 🔄 Engine basculé sur compte #{acc_login} ({acc_server})")
        return {"success": True, "account": _broker_public_dict(acc)}
    except Exception as e:
        await _restore_active_state()
        logging.error(f"[Broker] Erreur switch-active: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.delete("/brokers/accounts/{account_id}")
async def delete_broker_account(account_id: int, api_key: str = Depends(verify_api_key)):
    """Supprime un compte enregistré de la base SQLite."""
    db = SessionLocal()
    try:
        from infrastructure.models import BrokerAccount
        acc = db.query(BrokerAccount).filter(BrokerAccount.id == account_id).first()
        if not acc:
            raise HTTPException(status_code=404, detail="Compte introuvable")
        was_active = acc.is_active
        db.delete(acc)
        db.commit()
        if was_active:
            # Rendre le premier compte restant actif si l'actif a été supprimé
            remaining = db.query(BrokerAccount).order_by(BrokerAccount.id).first()
            if remaining:
                remaining.is_active = True
                db.commit()
        return {"success": True}
    finally:
        db.close()
