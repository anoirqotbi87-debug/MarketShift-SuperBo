import logging
from typing import List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class AppConfig(BaseSettings):
    ENVIRONMENT: str = Field("development")
    ACTIVE_BROKER: str = Field("xm")
    SIMULATION_MODE: bool = Field(True)
    API_SECRET_KEY: str = Field("")

    # ── Multi-Symbole ─────────────────────────────────────────────────────────
    TRADING_SYMBOLS_RAW: str = Field(
        default="EURUSD,GBPUSD,USDJPY,XAUUSD", 
        validation_alias="TRADING_SYMBOLS"
    )
    MAX_POSITIONS: int = Field(5, ge=1)

    # ── Risk settings ────────────────────────────────────────────────────────
    MAX_DAILY_LOSS_PCT: float = Field(0.05, ge=0.0)
    MAX_RISK_PER_TRADE_PCT: float = Field(0.01, ge=0.0, le=1.0)
    EMERGENCY_CLOSE_ENABLED: bool = Field(True)
    CIRCUIT_BREAKER_MAX_VIOLATIONS: int = Field(5, ge=1)
    CIRCUIT_BREAKER_TRAILING_DD_ENABLED: bool = Field(True, description="Active le calcul du trailing drawdown depuis le pic d'équité de la journée")
    CIRCUIT_BREAKER_PROFIT_LOCK_PCT: float = Field(0.0, ge=0.0, description="Verrouillage du profit journalier (ex: 0.015)")

    # ── ATR SL/TP Multipliers ────────────────────────────────────────────────
    ATR_SL_MULTIPLIER: float = Field(1.5, ge=0.1)
    ATR_TP_MULTIPLIER: float = Field(2.5, ge=0.1)

    # ── ML ────────────────────────────────────────────────────────────────────
    # Seuil calibré à 58% (cohérent avec l'accuracy modèle ~62.7%).
    # Overridable par symbole via ML_CONFIDENCE_THRESHOLD_EURUSD=0.55 dans .env
    ML_CONFIDENCE_THRESHOLD: float = Field(0.58, ge=0.0, le=1.0)
    ML_MIN_ACCURACY: float = Field(0.55, ge=0.0, le=1.0, description="Accuracy minimale requise pour valider un ré-entraînement ML")
    ML_MIN_SAMPLES: int = Field(10000, ge=100, description="Nombre minimal de barres requises pour valider un ré-entraînement ML")

    # ── Credentials ───────────────────────────────────────────────────────────
    XM_LOGIN: str = Field("")
    XM_PASSWORD: str = Field("")
    XM_SERVER: str = Field("XMGlobal-MT5Real")
    
    EXNESS_LOGIN: str = Field("")
    EXNESS_PASSWORD: str = Field("")
    EXNESS_SERVER: str = Field("")

    # ── Telegram Alert Settings ──────────────────────────────────────────────
    TELEGRAM_BOT_TOKEN: str = Field(default="", description="Telegram Bot API Token")
    TELEGRAM_CHAT_ID: str = Field(default="", description="Telegram Chat ID for alerts")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def TRADING_SYMBOLS(self) -> List[str]:
        return [s.strip() for s in self.TRADING_SYMBOLS_RAW.split(",") if s.strip()]

    @property
    def is_telegram_enabled(self) -> bool:
        return bool(
            self.TELEGRAM_BOT_TOKEN and self.TELEGRAM_BOT_TOKEN.strip() and
            self.TELEGRAM_CHAT_ID and self.TELEGRAM_CHAT_ID.strip()
        )

    @field_validator('ACTIVE_BROKER', mode='after')
    @classmethod
    def upper_broker(cls, v):
        return v.upper()

    def get_broker_credentials(self):
        """Récupère les identifiants du broker actif."""
        if self.ACTIVE_BROKER == "XM":
            login = self.XM_LOGIN
            password = self.XM_PASSWORD
            server = self.XM_SERVER
        elif self.ACTIVE_BROKER == "EXNESS":
            login = self.EXNESS_LOGIN
            password = self.EXNESS_PASSWORD
            server = self.EXNESS_SERVER
        else:
            logging.error(f"Broker inconnu: {self.ACTIVE_BROKER}")
            return 0, "", ""

        try:
            login_int = int(login) if login else 0
            return login_int, password, server
        except ValueError:
            logging.error("Le login MT5 doit être un nombre")
            return 0, password, server

    def get_symbol_sl_multiplier(self, symbol: str) -> float:
        import os
        val = os.getenv(f"ATR_SL_MULTIPLIER_{symbol}")
        if val is not None:
            try: return float(val)
            except ValueError: pass
        return self.ATR_SL_MULTIPLIER

    def get_symbol_tp_multiplier(self, symbol: str) -> float:
        import os
        val = os.getenv(f"ATR_TP_MULTIPLIER_{symbol}")
        if val is not None:
            try: return float(val)
            except ValueError: pass
        return self.ATR_TP_MULTIPLIER
        
    def get_symbol_ml_confidence(self, symbol: str) -> float:
        import os
        val = os.getenv(f"ML_CONFIDENCE_THRESHOLD_{symbol}")
        if val is not None:
            try: return float(val)
            except ValueError: pass
        return self.ML_CONFIDENCE_THRESHOLD

    @property
    def is_real_broker_configured(self) -> bool:
        """Détecte si un compte de courtier réel (non-démo) est configuré."""
        login, password, server = self.get_broker_credentials()
        if login and password:
            server_str = str(server or "").lower()
            if "demo" not in server_str and ("real" in server_str or "live" in server_str or server_str):
                return True
        return False

    def is_secret_robust(self, secret: Optional[str]) -> bool:
        """Vérifie qu'une clé API a au moins 32 caractères et n'est pas un placeholder."""
        if not secret:
            return False
        s = secret.strip()
        if len(s) < 32:
            return False
        lower_s = s.lower()
        placeholders = {
            "your_api_secret_key",
            "your_api_secret_key_here",
            "your_api_key_here",
            "marketshift_dev_secret_key_2026",
            "change_me",
            "secret",
            "admin",
            "password",
            "12345678",
            "your_mt5_password_here",
            "your_mt5_login_here",
        }
        if lower_s in placeholders or any(p in lower_s for p in ("your_api", "placeholder", "changeme")):
            return False
        return True

    def validate_security_failfast(self) -> None:
        """
        Contrôle fail-fast : exige une API_SECRET_KEY robuste (>= 32 caractères, non-placeholder)
        dès que ENVIRONMENT est en production/staging OU dès qu'un compte broker non-démo (réel) est configuré,
        indépendamment du flag SIMULATION_MODE.
        """
        is_prod_staging = self.ENVIRONMENT.lower() in ("production", "staging", "prod")
        is_real = self.is_real_broker_configured

        if is_prod_staging or is_real:
            if not self.is_secret_robust(self.API_SECRET_KEY):
                reason = "en production/staging" if is_prod_staging else "avec un compte broker réel (non-démo)"
                masked = f"{self.API_SECRET_KEY[:4]}..." if self.API_SECRET_KEY else "vide"
                msg = (
                    f"CRITICAL SECURITY ERROR: Une API_SECRET_KEY robuste (>= 32 caractères, non-placeholder) "
                    f"est strictement obligatoire {reason}. Valeur actuelle : {masked}."
                )
                logging.critical(msg)
                raise ValueError(msg)

try:
    Config = AppConfig()
    import sys
    import os
    if "pytest" not in sys.modules and not os.getenv("PYTEST_CURRENT_TEST"):
        Config.validate_security_failfast()
except Exception as e:
    logging.critical(f"Erreur fatale de configuration (.env invalide) : {e}")
    raise
