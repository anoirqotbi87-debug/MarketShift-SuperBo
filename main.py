import uvicorn
import logging
from fastapi import FastAPI
from infrastructure.config import Config
from infrastructure.mt5_connector import MT5Connector
from application.engine import Engine
from api.server import app, init_api
from infrastructure.database import engine, Base, SessionLocal
from infrastructure import models

# Création des tables de la base de données
Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

def main():
    logging.info(f"=== Démarrage MarketShift SuperBot ({Config.ENVIRONMENT}) ===")
    
    # Connecteur Primaire (XM)
    try:
        xm_login = int(Config.XM_LOGIN) if Config.XM_LOGIN else 0
    except ValueError:
        xm_login = 0
    xm_connector = MT5Connector(xm_login, Config.XM_PASSWORD, Config.XM_SERVER)

    # Connecteur Fallback (Exness)
    try:
        exness_login = int(Config.EXNESS_LOGIN) if Config.EXNESS_LOGIN else 0
    except ValueError:
        exness_login = 0
    exness_connector = MT5Connector(exness_login, Config.EXNESS_PASSWORD, Config.EXNESS_SERVER)

    # Routeur Haute Disponibilité
    from infrastructure.broker_router import BrokerRouter
    router = BrokerRouter(primary=xm_connector, fallback=exness_connector)

    db_session = SessionLocal()
    engine = Engine(router, db_session=db_session)
    
    # Injection de l'engine dans l'API
    init_api(engine)
    
    # Démarrage de l'engine (Thread)
    engine.start()
    
    # Démarrage de l'Agent de Surveillance Institutionnel
    from monitoring.surveillance_agent import SurveillanceAgent
    surveillance = SurveillanceAgent(engine)
    surveillance.start()
    
    # Démarrage serveur API (Bloquant)
    logging.info("Démarrage du serveur API sur http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="error")

if __name__ == "__main__":
    main()
