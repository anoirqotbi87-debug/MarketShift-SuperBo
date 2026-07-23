from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from application.engine import Engine

app = FastAPI(title="MarketShift SuperBot API")
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
