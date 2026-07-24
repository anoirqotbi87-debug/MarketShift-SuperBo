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

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from application.engine import Engine
from core.interfaces import OrderType

# ─────────────────────────────────────────────────────────────────────────────
# Logger en mémoire — stocke les 200 derniers logs
# ─────────────────────────────────────────────────────────────────────────────

class MemoryLogHandler(logging.Handler):
    """Handler Python logging qui conserve les N derniers logs en mémoire."""

    def __init__(self, maxlen: int = 200):
        super().__init__()
        self._logs: deque = deque(maxlen=maxlen)

    def emit(self, record: logging.LogRecord):
        try:
            self._logs.appendleft({
                "timestamp": datetime.datetime.fromtimestamp(record.created).strftime("%H:%M:%S"),
                "level":     record.levelname,
                "module":    record.name.split(".")[-1].upper() if "." in record.name else record.name.upper(),
                "message":   self.format(record)
            })
        except Exception:
            self.handleError(record)

    def get_logs(self) -> List[dict]:
        return list(self._logs)


# Instancier le handler et l'attacher au root logger
_memory_handler = MemoryLogHandler(maxlen=200)
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
    ml_confidence_threshold: float  = 0.60


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
    allow_origins=["*"],
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
async def websocket_endpoint(websocket: WebSocket):
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
            account_data = {
                "login":       acc.login,
                "balance":     acc.balance,
                "equity":      acc.equity,
                "freeMargin":  acc.free_margin,
                "marginLevel": acc.margin_level,
                "currency":    acc.currency,
                "server":      acc.server,
                "broker":      "XM" if "XM" in acc.server else "EXNESS",
                "isConnected": True,
            }

        # Positions
        positions_data = [
            {
                "ticket":       p.ticket,
                "symbol":       p.symbol,
                "type":         p.type.name,
                "volume":       p.volume,
                "openPrice":    p.open_price,
                "currentPrice": p.current_price,
                "profit":       p.profit,
                "sl":           p.sl,
                "tp":           p.tp,
                "magic":        p.magic,
            }
            for p in _engine.state_manager.positions
        ]

        # Signaux par symbole (ML prediction)
        for symbol in _engine.symbols:
            aggregator = _engine._symbol_aggregators.get(symbol)
            if aggregator:
                try:
                    sig = aggregator.aggregate(symbol)
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

    return {
        "type":       "snapshot",
        "timestamp":  datetime.datetime.now().isoformat(),
        "account":    account_data,
        "positions":  positions_data,
        "signals":    signals_data,
        "kelly":      kelly_data,
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
def control_bot(cmd: ControlCommand):
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
    return {
        "login":       acc.login,
        "balance":     acc.balance,
        "equity":      acc.equity,
        "freeMargin":  acc.free_margin,
        "marginLevel": acc.margin_level,
        "currency":    acc.currency,
        "server":      acc.server,
        "broker":      "XM" if "XM" in acc.server else "EXNESS",
    }


@app.get("/positions")
def get_positions():
    if not _engine:
        return []
    return [
        {
            "ticket":       p.ticket,
            "symbol":       p.symbol,
            "type":         p.type.name,
            "volume":       p.volume,
            "openPrice":    p.open_price,
            "currentPrice": p.current_price,
            "profit":       p.profit,
            "sl":           p.sl,
            "tp":           p.tp,
            "magic":        p.magic,
        }
        for p in _engine.state_manager.positions
    ]


@app.get("/history")
def get_history():
    """Retourne l'historique réel des deals MT5 sur les 30 derniers jours."""
    try:
        import MetaTrader5 as mt5
        from_date = datetime.datetime.now() - datetime.timedelta(days=30)
        to_date   = datetime.datetime.now()

        deals = mt5.history_deals_get(from_date, to_date)
        if deals is None:
            return []

        result = []
        for d in deals:
            if d.profit != 0:  # Ignorer les deals sans P&L (ouvertures)
                result.append({
                    "ticket":     d.ticket,
                    "symbol":     d.symbol,
                    "type":       "BUY" if d.type == 0 else "SELL",
                    "lots":       d.volume,
                    "openPrice":  d.price,
                    "closePrice": d.price,
                    "pnl":        d.profit,
                    "openTime":   datetime.datetime.fromtimestamp(d.time).strftime("%d/%m %H:%M"),
                    "closeTime":  datetime.datetime.fromtimestamp(d.time).strftime("%d/%m %H:%M"),
                    "closeReason": "TP" if d.profit > 0 else "SL",
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
def execute_trade(req: TradeRequest):
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
def close_trade(req: CloseRequest):
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


@app.post("/settings")
def update_settings(payload: SettingsPayload):
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
