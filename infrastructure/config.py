import logging
from typing import List
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class AppConfig(BaseSettings):
    ENVIRONMENT: str = Field("development")
    ACTIVE_BROKER: str = Field("xm")
    SIMULATION_MODE: bool = Field(True)
    API_SECRET_KEY: str = Field("marketshift_dev_secret_key_2026")

    # ── Multi-Symbole ─────────────────────────────────────────────────────────
    TRADING_SYMBOLS_RAW: str = Field(
        default="EURUSD,GBPUSD,USDJPY,XAUUSD", 
        validation_alias="TRADING_SYMBOLS"
    )
    MAX_POSITIONS: int = Field(5, ge=1)

    # ── Risk settings ────────────────────────────────────────────────────────
    MAX_DAILY_LOSS_PCT: float = Field(0.05, ge=0.0, le=1.0)
    MAX_RISK_PER_TRADE_PCT: float = Field(0.01, ge=0.0, le=1.0)
    EMERGENCY_CLOSE_ENABLED: bool = Field(True)
    CIRCUIT_BREAKER_MAX_VIOLATIONS: int = Field(5, ge=1)

    # ── ATR SL/TP Multipliers ────────────────────────────────────────────────
    ATR_SL_MULTIPLIER: float = Field(1.5, ge=0.1)
    ATR_TP_MULTIPLIER: float = Field(2.5, ge=0.1)

    # ── ML ────────────────────────────────────────────────────────────────────
    ML_CONFIDENCE_THRESHOLD: float = Field(0.60, ge=0.0, le=1.0)

    # ── Credentials ───────────────────────────────────────────────────────────
    XM_LOGIN: str = Field("")
    XM_PASSWORD: str = Field("")
    XM_SERVER: str = Field("XMGlobal-MT5Real")
    
    EXNESS_LOGIN: str = Field("")
    EXNESS_PASSWORD: str = Field("")
    EXNESS_SERVER: str = Field("")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def TRADING_SYMBOLS(self) -> List[str]:
        return [s.strip() for s in self.TRADING_SYMBOLS_RAW.split(",") if s.strip()]

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

try:
    Config = AppConfig()
except Exception as e:
    logging.critical(f"Erreur fatale de configuration (.env invalide) : {e}")
    raise
