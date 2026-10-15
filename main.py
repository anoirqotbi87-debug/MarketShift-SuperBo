import sys
import multiprocessing
import uvicorn
import logging

# Force UTF-8 encoding for Windows terminals to prevent emoji crashes
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass

logging.basicConfig(
    level=logging.DEBUG, 
    format='%(asctime)s - %(levelname)s - %(message)s',
    force=True,
    handlers=[
        logging.FileHandler("marketshift.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)

from infrastructure.config import Config
from application.engine import Engine
from api.server import app, init_api
from infrastructure.database import engine, Base, SessionLocal

# Création des tables de la base de données
Base.metadata.create_all(bind=engine)

# La configuration de logging a été déplacée au début du fichier.

def main():
    logging.info(f"=== Démarrage MarketShift SuperBot V2.0 ({Config.ENVIRONMENT}) ===")
    
    # Routeur Multi-Courtiers / Connecteur selon BROKER_MODE
    from infrastructure.broker_router import create_connector_from_config
    router = create_connector_from_config(Config)

    print("Step 2: DB Session"); sys.stdout.flush()
    db_session = SessionLocal()
    engine = Engine(router, db_session=db_session)
    
    print("Step 3: init_api"); sys.stdout.flush()
    # Injection de l'engine dans l'API
    init_api(engine)
    
    print("Step 4: engine.start()"); sys.stdout.flush()
    # Démarrage de l'engine (Thread)
    engine.start()
    
    print("Step 5: Surveillance"); sys.stdout.flush()
    # Démarrage de l'Agent de Surveillance Institutionnel
    from monitoring.surveillance_agent import SurveillanceAgent
    surveillance = SurveillanceAgent(engine)
    surveillance.start()
    
    print("Step 6: Uvicorn"); sys.stdout.flush()
    # Démarrage serveur API (Bloquant)
    logging.info("Démarrage du serveur API sur http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    main()
