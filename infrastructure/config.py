import os
import logging
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

class Config:
    ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
    ACTIVE_BROKER = os.getenv("ACTIVE_BROKER", "xm").upper()
    SIMULATION_MODE = os.getenv("SIMULATION_MODE", "true").lower() == "true"
    
    # Risk settings
    MAX_DAILY_LOSS_PCT = float(os.getenv("MAX_DAILY_LOSS_PCT", 0.05))
    MAX_RISK_PER_TRADE_PCT = float(os.getenv("MAX_RISK_PER_TRADE_PCT", 0.01))
    EMERGENCY_CLOSE_ENABLED = os.getenv("EMERGENCY_CLOSE_ENABLED", "true").lower() == "true"
    CIRCUIT_BREAKER_MAX_VIOLATIONS = int(os.getenv("CIRCUIT_BREAKER_MAX_VIOLATIONS", 5))
    
    # ML
    ML_CONFIDENCE_THRESHOLD = float(os.getenv("ML_CONFIDENCE_THRESHOLD", 0.75))

    @classmethod
    def get_broker_credentials(cls):
        """Récupère les identifiants du broker actif"""
        if cls.ACTIVE_BROKER == "XM":
            login = os.getenv("XM_LOGIN", "")
            password = os.getenv("XM_PASSWORD", "")
            server = os.getenv("XM_SERVER", "XMGlobal-MT5Real")
        elif cls.ACTIVE_BROKER == "EXNESS":
            login = os.getenv("EXNESS_LOGIN", "")
            password = os.getenv("EXNESS_PASSWORD", "")
            server = os.getenv("EXNESS_SERVER", "")
        else:
            logging.error(f"Broker inconnu: {cls.ACTIVE_BROKER}")
            return 0, "", ""
            
        try:
            login_int = int(login) if login else 0
            return login_int, password, server
        except ValueError:
            logging.error("Le login MT5 doit être un nombre")
            return 0, password, server
