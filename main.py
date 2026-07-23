import uvicorn
import logging
from infrastructure.config import Config
from infrastructure.mt5_connector import MT5Connector
from application.engine import Engine
from api.server import app, init_api

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def main():
    logging.info(f"=== Démarrage MarketShift SuperBot ({Config.ENVIRONMENT}) ===")
    
    login, password, server = Config.get_broker_credentials()
    if not login or not password:
        logging.error("Identifiants de broker manquants ou invalides.")
        return

    connector = MT5Connector(login, password, server)
    engine = Engine(connector)
    
    # Injection de l'engine dans l'API
    init_api(engine)
    
    # Démarrage de l'engine (Thread)
    engine.start()
    
    # Démarrage serveur API (Bloquant)
    logging.info("Démarrage du serveur API sur http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="error")

if __name__ == "__main__":
    main()
