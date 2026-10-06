from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from infrastructure.database import Base
import datetime

class BrokerAccount(Base):
    """
    Compte de courtage enregistré via l'UI "Comptes Broker".
    Le mot de passe est chiffré (chiffrement symétrique stdlib, clé dérivée
    de API_SECRET_KEY). Il n'est jamais renvoyé par l'API.
    """
    __tablename__ = "broker_accounts"

    id = Column(Integer, primary_key=True, index=True)
    broker_name = Column(String, default="Custom")
    server = Column(String, index=True)
    login = Column(Integer, index=True)
    password_encrypted = Column(String)
    account_type = Column(String, default="DEMO")  # "DEMO" | "REAL"
    is_active = Column(Boolean, default=False)
    balance = Column(Float, default=0.0)
    equity = Column(Float, default=0.0)
    currency = Column(String, default="USD")
    last_result = Column(String, default="")  # dernier résultat du test/ping
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class TradeRecord(Base):
    __tablename__ = "trade_records"

    id = Column(Integer, primary_key=True, index=True)
    account_login = Column(Integer, index=True, nullable=True) # NOUVEAU: Filtrage par compte
    ticket = Column(Integer, index=True, nullable=True)
    magic = Column(Integer, index=True, nullable=True)  # NOUVEAU: Magic number (0 = Manuel)
    symbol = Column(String, index=True)
    type = Column(String) # "BUY" or "SELL"
    volume = Column(Float)
    open_price = Column(Float)
    close_price = Column(Float, nullable=True)
    sl = Column(Float, nullable=True)
    tp = Column(Float, nullable=True)
    profit = Column(Float, nullable=True)
    open_time = Column(DateTime, default=datetime.datetime.utcnow)
    close_time = Column(DateTime, nullable=True)

class MLPrediction(Base):
    __tablename__ = "ml_predictions"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    xgboost_score = Column(Float)
    lstm_score = Column(Float)
    final_score = Column(Float)
    actual_outcome = Column(Float, nullable=True) # PnL in pips after 1 hour, for continuous learning
