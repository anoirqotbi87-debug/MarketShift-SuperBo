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
            self._counter += 1
            self._logs.appendleft({
                "id": self._counter,
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
            }

        # Positions
        positions_data = [
            {
                "ticket":       p.ticket,
                "symbol":       p.symbol,
                "type":         p.type.name,
                "lots":         p.volume,
                "openPrice":    p.open_price,
                "currentPrice": p.current_price,
                "pnl":          p.profit,
                "pnlPct":       0,
                "stopLoss":     p.sl,
                "takeProfit":   p.tp,
                "magicNumber":  p.magic,
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
        import MetaTrader5 as mt5
        today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        deals = mt5.history_deals_get(today_start, datetime.datetime.now())
        if deals:
            realized_daily = sum(d.profit for d in deals if d.type <= 1)
        unrealized = sum(p.profit for p in _engine.state_manager.positions)
        
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
        "dailyPnL": realized_daily + unrealized,
        "dailyPnLPct": daily_pct,
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
            "lots":         p.volume,
            "openPrice":    p.open_price,
            "currentPrice": p.current_price,
            "pnl":          p.profit,
            "pnlPct":       0,
            "stopLoss":     p.sl,
            "takeProfit":   p.tp,
            "magicNumber":  p.magic,
        }
        for p in _engine.state_manager.positions
    ]


@app.get("/history")
def get_history():
    """Retourne l'historique réel des deals MT5 sur les 30 derniers jours."""
    try:
        import MetaTrader5 as mt5
        from_date = datetime.datetime.now() - datetime.timedelta(days=30)
        to_date   = datetime.datetime.now() + datetime.timedelta(days=1)

        deals = mt5.history_deals_get(from_date, to_date)
        if deals is None:
            return []

        result = []
        for d in deals:
            # DEAL_ENTRY_OUT = 1. We only want deals that closed a position.
            if getattr(d, 'entry', 0) == 1 and d.type <= 1:
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
        from infrastructure.models import TradeRecord
        from sqlalchemy import func
        
        db = _engine.db
        
        # Récupérer tous les trades
        trades = db.query(TradeRecord).all()
        if not trades:
            return {
                "expectancy": 0.0,
                "profit_factor": 0.0,
                "gross_profit": 0.0,
                "gross_loss": 0.0,
                "total_trades": 0
            }
            
        winning_trades = [t.profit for t in trades if t.profit > 0]
        losing_trades = [t.profit for t in trades if t.profit < 0]
        
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
        report = tester.run(df)
        return report
        
    except Exception as e:
        logging.error(f"[API] Erreur Backtest : {e}")
        return {"error": str(e)}

class SettingsPayload(BaseModel):
    sl_multiplier: Optional[float] = None
    tp_multiplier: Optional[float] = None
    risk_percent: Optional[float] = None
    trailing_stop_active: Optional[bool] = None
    trailing_stop_multiplier: Optional[float] = None
    ml_confidence_threshold: Optional[float] = None


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
        from infrastructure.models import TradeRecord
        from sqlalchemy import func
        
        db = _engine.db
        
        # Récupérer tous les trades
        trades = db.query(TradeRecord).all()
        if not trades:
            return {
                "expectancy": 0.0,
                "profit_factor": 0.0,
                "gross_profit": 0.0,
                "gross_loss": 0.0,
                "total_trades": 0
            }
            
        winning_trades = [t.profit for t in trades if t.profit > 0]
        losing_trades = [t.profit for t in trades if t.profit < 0]
        
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
            df = _engine.connector.get_historical_data(symbol, 1000)
            if df is None or df.empty:
                return {"error": f"Impossible de récupérer l'historique MT5 pour {symbol}."}
        
        if 'open' not in df.columns or 'close' not in df.columns:
            return {"error": "Les données doivent contenir au moins les colonnes 'open' et 'close'."}
            
        from optimization.auto_optimizer import AutoOptimizer
        
        logging.info(f"[API] Lancement Optimisation pour {symbol} sur {len(df)} bougies.")
        optimizer = AutoOptimizer(df=df, initial_balance=initial_capital)
        report = optimizer.optimize(symbol)
        
        return report
        
    except Exception as e:
        logging.error(f"[API] Erreur Optimisation : {e}")
        return {"error": str(e)}
