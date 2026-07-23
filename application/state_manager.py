import logging
from typing import Optional, List
from core.interfaces import IBrokerConnector, AccountInfo, PositionInfo

class StateManager:
    def __init__(self, connector: IBrokerConnector):
        self.connector = connector
        self._account_info: Optional[AccountInfo] = None
        self._positions: List[PositionInfo] = []
        self._last_update: float = 0.0
        self.is_paused = False

    def update_state(self) -> bool:
        """Met à jour l'état du compte et des positions"""
        if self.is_paused:
            return False
            
        try:
            self._account_info = self.connector.get_account_info()
            self._positions = self.connector.get_positions()
            return True
        except Exception as e:
            logging.error(f"Erreur lors de la mise à jour de l'état: {e}")
            return False

    @property
    def account(self) -> Optional[AccountInfo]:
        return self._account_info

    @property
    def positions(self) -> List[PositionInfo]:
        return self._positions
        
    def get_open_risk(self) -> float:
        """Calcule le risque ouvert actuel (Drawdown en cours)"""
        if not self._account_info or not self._positions:
            return 0.0
            
        floating_profit = sum(p.profit for p in self._positions)
        if floating_profit >= 0:
            return 0.0
            
        return abs(floating_profit) / self._account_info.balance

    def pause(self):
        logging.warning("StateManager: Mise en pause de l'engine.")
        self.is_paused = True

    def resume(self):
        logging.info("StateManager: Reprise de l'engine.")
        self.is_paused = False
