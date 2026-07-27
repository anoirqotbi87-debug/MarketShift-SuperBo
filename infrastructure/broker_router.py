import logging
from typing import Optional, List, Dict, Any
from core.interfaces import IBrokerConnector, AccountInfo, PositionInfo, OrderType

class BrokerRouter(IBrokerConnector):
    """
    Routeur Multi-Courtiers pour la Haute Disponibilité.
    Encapsule deux connexions (Primary et Fallback) et route les opérations 
    automatiquement vers le fallback si le primaire défaille.
    """
    def __init__(self, primary: IBrokerConnector, fallback: IBrokerConnector):
        self.primary = primary
        self.fallback = fallback
        self._active_broker = self.primary
        self.connected = False

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
            return True
            
        logging.error("[Router] ❌ Échec critique : Primaire et Fallback injoignables.")
        self.connected = False
        return False

    def disconnect(self) -> None:
        self.primary.disconnect()
        self.fallback.disconnect()
        self.connected = False
        logging.info("[Router] Routeur multi-courtiers déconnecté.")

    def _switch_to_fallback(self) -> bool:
        """Tente de basculer sur le courtier de secours."""
        logging.warning("[Router] 🔄 Tentative de bascule (Failover) vers le courtier Fallback...")
        if not getattr(self.fallback, 'connected', False):
            if not self.fallback.connect():
                logging.error("[Router] ❌ Échec du Failover : Fallback injoignable.")
                return False
                
        self._active_broker = self.fallback
        logging.info("[Router] ✅ Failover réussi. Trafic routé vers le Fallback.")
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
