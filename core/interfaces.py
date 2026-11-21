from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from enum import Enum
import datetime

class OrderType(Enum):
    BUY = "BUY"
    SELL = "SELL"

class Signal(BaseModel):
    symbol: str
    direction: OrderType
    confidence: float
    source: str  # e.g., "EMA_Strategy", "ML_Filter"
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.now)
    metadata: Dict[str, Any] = {}
    # ATR-based SL/TP (en pips, calculés par les stratégies)
    sl_pips: Optional[float] = None
    tp_pips: Optional[float] = None
    atr: Optional[float] = None

class AccountInfo(BaseModel):
    login: int
    balance: float
    equity: float
    free_margin: float
    margin_level: float
    currency: str
    server: str
    trade_mode: int = -1

    @property
    def is_certified_demo(self) -> bool:
        return self.trade_mode == 0

class SystemReadiness:
    """
    Superviseur d'état et d'éligibilité opérationnelle globale (Palier A - Réserve 2).
    """
    _storage_ready: bool = True
    _storage_reason: str = "Initial"
    _engine_ready: bool = True
    _engine_reason: str = "Initial"
    _broker_ready: bool = True
    _broker_reason: str = "Initial"

    @classmethod
    def set_storage_ready(cls, ready: bool, reason: str = "") -> None:
        cls._storage_ready = bool(ready)
        cls._storage_reason = str(reason)

    @classmethod
    def set_engine_ready(cls, ready: bool, reason: str = "") -> None:
        cls._engine_ready = bool(ready)
        cls._engine_reason = str(reason)

    @classmethod
    def set_broker_ready(cls, ready: bool, reason: str = "") -> None:
        cls._broker_ready = bool(ready)
        cls._broker_reason = str(reason)

    @classmethod
    def is_ready(cls) -> bool:
        return cls._storage_ready and cls._engine_ready and cls._broker_ready

    @classmethod
    def get_status_summary(cls) -> Dict[str, Any]:
        return {
            "ready": cls.is_ready(),
            "storage_ready": cls._storage_ready,
            "storage_reason": cls._storage_reason,
            "engine_ready": cls._engine_ready,
            "engine_reason": cls._engine_reason,
            "broker_ready": cls._broker_ready,
            "broker_reason": cls._broker_reason
        }

    @classmethod
    def reset(cls) -> None:
        cls._storage_ready = True
        cls._engine_ready = True
        cls._broker_ready = True
        cls._storage_reason = "Reset"
        cls._engine_reason = "Reset"
        cls._broker_reason = "Reset"

class PositionInfo(BaseModel):
    ticket: int
    symbol: str
    type: OrderType
    volume: float
    open_price: float
    current_price: float
    sl: float
    tp: float
    profit: float
    time: int
    magic: int
    comment: str = ""

class IBrokerConnector(ABC):
    @abstractmethod
    def connect(self) -> bool:
        pass

    @abstractmethod
    def disconnect(self) -> None:
        pass

    @abstractmethod
    def get_account_info(self) -> Optional[AccountInfo]:
        pass

    @abstractmethod
    def get_positions(self, symbol: Optional[str] = None) -> List[PositionInfo]:
        pass

    @abstractmethod
    def execute_order(self, symbol: str, order_type: OrderType, volume: float, sl: float = 0.0, tp: float = 0.0, magic: int = 0, comment: str = "") -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def close_position(self, ticket: int) -> bool:
        pass

    @abstractmethod
    def modify_position(self, ticket: int, symbol: str, new_sl: float) -> bool:
        pass

    @abstractmethod
    def get_historical_data(self, symbol: str, timeframe: int, num_candles: int) -> Optional[Any]:
        """Récupère l'historique OHLCV sous forme de DataFrame"""
        pass

    @abstractmethod
    def get_symbol_info(self, symbol: str) -> Optional[Any]:
        pass

    @abstractmethod
    def get_history_deals(self, from_date: Any, to_date: Any) -> Optional[Any]:
        pass

class IStrategy(ABC):
    @abstractmethod
    def analyze(self, symbol: str) -> Optional[Signal]:
        pass
