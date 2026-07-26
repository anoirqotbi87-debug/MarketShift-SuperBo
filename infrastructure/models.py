from sqlalchemy import Column, Integer, String, Float, DateTime
from infrastructure.database import Base
import datetime

class TradeRecord(Base):
    __tablename__ = "trade_records"

    id = Column(Integer, primary_key=True, index=True)
    ticket = Column(Integer, index=True, nullable=True)
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
