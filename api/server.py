from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from application.engine import Engine
import MetaTrader5 as mt5

app = FastAPI(title="MarketShift SuperBot API")

# Configuration CORS pour autoriser l'app React locale
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # À restreindre en production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_engine: Engine = None

def init_api(engine: Engine):
    global _engine
    _engine = engine

class ControlCommand(BaseModel):
    action: str

@app.get("/status")
def get_status():
    if not _engine: return {"status": "offline"}
    return {
        "status": "paused" if _engine.state_manager.is_paused else "running",
        "kill_switch": _engine.kill_switch.is_triggered,
        "account": _engine.state_manager.account.model_dump() if _engine.state_manager.account else None,
        "positions_count": len(_engine.state_manager.positions)
    }

@app.post("/control")
def control_bot(cmd: ControlCommand):
    if not _engine: return {"error": "Engine offline"}
    
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

# --- NOUVEAUX ENDPOINTS POUR REACT UI ---

@app.get("/account-information")
def get_account_information():
    if not _engine or not _engine.state_manager.account:
        raise HTTPException(status_code=503, detail="Account info not available")
    
    acc = _engine.state_manager.account
    return {
        "login": acc.login,
        "balance": acc.balance,
        "equity": acc.equity,
        "freeMargin": acc.free_margin,
        "marginLevel": acc.margin_level,
        "currency": acc.currency,
        "server": acc.server,
        "broker": "XM" if "XM" in acc.server else "EXNESS"
    }

@app.get("/positions")
def get_positions():
    if not _engine: return []
    positions = _engine.state_manager.positions
    return [
        {
            "ticket": p.ticket,
            "symbol": p.symbol,
            "type": p.type.name,
            "volume": p.volume,
            "openPrice": p.open_price,
            "currentPrice": p.current_price,
            "profit": p.profit,
            "magic": p.magic
        } for p in positions
    ]

@app.get("/history")
def get_history():
    # Simulation (TODO: brancher mt5.history_deals_get)
    return []

@app.get("/logs")
def get_logs():
    # Retourne des logs simulés pour le moment (TODO: Custom Logging Handler en mémoire)
    return [
        {"timestamp": "Maintenant", "level": "INFO", "message": "SuperBot Backend OK"}
    ]

class TradeRequest(BaseModel):
    symbol: str
    direction: str
    volume: float = 0.01

@app.post("/trade")
def execute_trade(req: TradeRequest):
    if not _engine: raise HTTPException(status_code=503, detail="Engine offline")
    
    # Bypass l'aggregator pour un trade manuel, mais pas le Kill Switch
    if _engine.kill_switch.is_triggered:
        raise HTTPException(status_code=403, detail="KILL SWITCH IS ACTIVE")
        
    order_type = OrderType.BUY if req.direction.upper() == "BUY" else OrderType.SELL
    result = _engine.connector.execute_order(req.symbol, order_type, req.volume)
    
    if not result:
        raise HTTPException(status_code=500, detail="Echec de l'ordre")
    
    return result

class CloseRequest(BaseModel):
    ticket: int

@app.post("/close")
def close_trade(req: CloseRequest):
    if not _engine: raise HTTPException(status_code=503, detail="Engine offline")
    success = _engine.connector.close_position(req.ticket)
    if not success:
        raise HTTPException(status_code=500, detail="Echec de la clôture")
    return {"success": True}

@app.get("/predict")
def predict_signal(symbol: str = "EURUSD"):
    if not _engine: return {"signal": "WAIT", "confidence": 0}
    # Interroge directement notre nouveau SignalAggregator
    sig = _engine.aggregator.aggregate(symbol)
    if sig:
        return {
            "signal": sig.direction.name,
            "confidence": sig.confidence,
            "reason": sig.source
        }
    return {"signal": "WAIT", "confidence": 0, "reason": "No consensus"}

@app.post("/settings")
def update_settings(settings: dict):
    # Endpoint pour recevoir les paramètres de risque de l'UI
    return {"status": "received"}
