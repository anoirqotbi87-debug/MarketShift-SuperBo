import logging
from application.state_manager import StateManager
from agents.kill_switch import KillSwitch
from infrastructure.config import Config

class CircuitBreaker:
    def __init__(self, state_manager: StateManager, kill_switch: KillSwitch):
        self.state_manager = state_manager
        self.kill_switch = kill_switch
        self.max_daily_loss_pct = Config.MAX_DAILY_LOSS_PCT
        self.initial_balance = 0.0

    def check(self) -> bool:
        """Vérifie si la perte maximale journalière est atteinte. Retourne True si OK."""
        account = self.state_manager.account
        if not account:
            return True

        # Initialisation de la balance de départ (simulée pour le moment)
        if self.initial_balance == 0.0:
            self.initial_balance = account.balance

        current_equity = account.equity
        loss_pct = (self.initial_balance - current_equity) / self.initial_balance

        if loss_pct >= self.max_daily_loss_pct:
            logging.warning(f"Circuit Breaker déclenché ! Perte: {loss_pct*100:.2f}% (Max {self.max_daily_loss_pct*100:.2f}%)")
            self.kill_switch.activate(reason="MAX_DAILY_LOSS_REACHED")
            return False

        return True
