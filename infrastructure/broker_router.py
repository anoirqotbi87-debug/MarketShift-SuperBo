import logging
import threading
from typing import Optional, List, Dict, Any
from core.interfaces import IBrokerConnector, AccountInfo, PositionInfo, OrderType

try:
    from infrastructure.telegram_notifier import TelegramNotifier, telegram_notifier
except ImportError:
    TelegramNotifier = None  # type: ignore
    telegram_notifier = None  # type: ignore

class BrokerRouter(IBrokerConnector):
    """
    Routeur Multi-Courtiers pour la Haute Disponibilité.
    Encapsule deux connexions (Primary et Fallback) et route les opérations 
    automatiquement vers le fallback si le primaire défaille.
    """
    def __init__(self, primary: IBrokerConnector, fallback: IBrokerConnector, notifier: Optional[Any] = None):
        self.primary = primary
        self.fallback = fallback
        self.notifier = notifier if notifier is not None else telegram_notifier
        self._active_broker = self.primary
        self.connected = False
        self._lock = threading.Lock()

    def connect(self) -> bool:
        primary_ok = self.primary.connect()
        
        if primary_ok:
            self._active_broker = self.primary
            self.connected = True
            logging.info("[Router] Connecté au courtier PRIMAIRE avec succès.")
            return True
            
        logging.warning("[Router] ⚠️ Primaire injoignable, tentative de connexion au FALLBACK.")
        fallback_ok = self.fallback.connect()
        
        if fallback_ok:
            self._active_broker = self.fallback
            self.connected = True
            logging.info("[Router] ✅ Connecté au courtier FALLBACK avec succès.")
            if self.notifier:
                try:
                    self.notifier.notify_critical_event(
                        "BROKER_FAILOVER",
                        reason="Primary broker unreachable during connect",
                        details="Switched to fallback broker successfully"
                    )
                except Exception as e:
                    logging.error(f"[Router] Erreur notification failover: {e}")
            return True
            
        logging.error("[Router] ❌ Échec critique : Primaire et Fallback injoignables.")
        self.connected = False
        if self.notifier:
            try:
                self.notifier.notify_critical_event(
                    "MT5_DISCONNECT",
                    reason="Primaire et Fallback injoignables (Primary and fallback brokers unreachable)",
                    details="Both primary and fallback MT5 connections failed during connect()"
                )
            except Exception as e:
                logging.error(f"[Router] Erreur notification deconnexion: {e}")
        return False

    def disconnect(self) -> None:
        self.primary.disconnect()
        self.fallback.disconnect()
        self.connected = False
        logging.info("[Router] Routeur multi-courtiers déconnecté.")

    def _switch_to_fallback(self) -> bool:
        """Tente de basculer sur le courtier de secours."""
        with self._lock:
            if self._active_broker == self.fallback and getattr(self.fallback, 'connected', False):
                return True

            logging.warning("[Router] 🔄 Tentative de bascule (Failover) vers le courtier Fallback...")
            if not getattr(self.fallback, 'connected', False):
                if not self.fallback.connect():
                    logging.error("[Router] ❌ Échec du Failover : Fallback injoignable.")
                    if self.notifier:
                        try:
                            self.notifier.notify_critical_event(
                                "MT5_DISCONNECT",
                                reason="Failover failed: Fallback broker unreachable (Fallback injoignable)",
                                details="Primary broker failed and fallback connection attempt failed"
                            )
                        except Exception as e:
                            logging.error(f"[Router] Erreur notification echec failover: {e}")
                    return False
                    
            self._active_broker = self.fallback
            logging.info("[Router] ✅ Failover réussi. Trafic routé vers le Fallback.")
            if self.notifier:
                try:
                    self.notifier.notify_critical_event(
                        "BROKER_FAILOVER",
                        reason="Primary broker failure during operation",
                        details="Active broker switched from primary to fallback"
                    )
                except Exception as e:
                    logging.error(f"[Router] Erreur notification failover: {e}")
            return True

    def get_account_info(self) -> Optional[AccountInfo]:
        info = self._active_broker.get_account_info()
        if info is None and self._active_broker == self.primary:
            if self._switch_to_fallback():
                return self._active_broker.get_account_info()
        return info

    def get_positions(self, symbol: Optional[str] = None) -> List[PositionInfo]:
        positions = self._active_broker.get_positions(symbol)
        if not positions and getattr(self._active_broker, 'connected', False) == False:
             if self._active_broker == self.primary and self._switch_to_fallback():
                 return self._active_broker.get_positions(symbol)
        return positions

    def execute_order(self, symbol: str, order_type: OrderType, volume: float, sl: float = 0.0, tp: float = 0.0, magic: int = 0) -> Optional[Dict[str, Any]]:
        result = self._active_broker.execute_order(symbol, order_type, volume, sl, tp, magic)
        if result is None and self._active_broker == self.primary:
            if self._switch_to_fallback():
                return self._active_broker.execute_order(symbol, order_type, volume, sl, tp, magic)
        return result

    def close_position(self, ticket: int) -> bool:
        # La clôture de position est spécifique au courtier où elle a été ouverte.
        # On tente d'abord sur l'actif, sinon sur l'autre.
        success = self._active_broker.close_position(ticket)
        if not success:
            other_broker = self.fallback if self._active_broker == self.primary else self.primary
            return other_broker.close_position(ticket)
        return success

    def modify_position(self, ticket: int, symbol: str, new_sl: float) -> bool:
        success = self._active_broker.modify_position(ticket, symbol, new_sl)
        if not success:
            other_broker = self.fallback if self._active_broker == self.primary else self.primary
            return other_broker.modify_position(ticket, symbol, new_sl)
        return success

    def get_historical_data(self, symbol: str, timeframe: int, num_candles: int) -> Optional[Any]:
        data = self._active_broker.get_historical_data(symbol, timeframe, num_candles)
        if data is None and self._active_broker == self.primary:
            if self._switch_to_fallback():
                return self._active_broker.get_historical_data(symbol, timeframe, num_candles)
        return data

    def get_symbol_info(self, symbol: str) -> Optional[Any]:
        info = self._active_broker.get_symbol_info(symbol)
        if info is None and self._active_broker == self.primary:
            if self._switch_to_fallback():
                return self._active_broker.get_symbol_info(symbol)
        return info

    def get_history_deals(self, from_date: Any, to_date: Any) -> Optional[Any]:
        deals = self._active_broker.get_history_deals(from_date, to_date)
        if deals is None and self._active_broker == self.primary:
            if self._switch_to_fallback():
                return self._active_broker.get_history_deals(from_date, to_date)
        return deals
