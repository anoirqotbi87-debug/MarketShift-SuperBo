import logging
import datetime
from typing import Optional, Dict, Any
from application.state_manager import StateManager
from agents.kill_switch import KillSwitch
from infrastructure.config import Config

class CircuitBreaker:
    def __init__(self, state_manager: StateManager, kill_switch: KillSwitch):
        self.state_manager = state_manager
        self.kill_switch = kill_switch
        self.max_daily_loss_pct: float = Config.MAX_DAILY_LOSS_PCT
        self.trailing_dd_enabled: bool = getattr(Config, "CIRCUIT_BREAKER_TRAILING_DD_ENABLED", True)
        self.profit_lock_pct: float = getattr(Config, "CIRCUIT_BREAKER_PROFIT_LOCK_PCT", 0.0)

        self.daily_start_balance: float = 0.0
        self.high_water_mark: float = 0.0
        self.last_reset_date: Optional[datetime.date] = None

    @property
    def initial_balance(self) -> float:
        """Compatibilité ascendante avec le code legacy."""
        return self.daily_start_balance

    @initial_balance.setter
    def initial_balance(self, value: float):
        self.daily_start_balance = value

    def check(self, current_date: Optional[datetime.date] = None) -> bool:
        """
        Vérifie si la perte maximale journalière ou le trailing drawdown est atteint.
        Gère le rollover quotidien à minuit.
        Retourne True si OK, False si déclenché.
        """
        account = self.state_manager.account
        if not account:
            return True

        if current_date is None:
            current_date = datetime.date.today()

        # 1. Rollover journalier ou initialisation au démarrage
        if self.daily_start_balance == 0.0 or self.last_reset_date != current_date:
            if account.balance > 0:
                self.daily_start_balance = account.balance
                self.high_water_mark = max(account.balance, account.equity)
                self.last_reset_date = current_date
                logging.info(
                    f"[CircuitBreaker] 🌅 Rollover journalier ({current_date}) : "
                    f"nouveau solde de référence={self.daily_start_balance:.2f}, HWM={self.high_water_mark:.2f}"
                )
            else:
                return True  # Balance non encore chargée

        current_equity = account.equity
        if current_equity > self.high_water_mark:
            self.high_water_mark = current_equity

        # 2. Perte journalière fixe par rapport au solde de départ
        if self.daily_start_balance > 0:
            loss_pct = (self.daily_start_balance - current_equity) / self.daily_start_balance
            if loss_pct >= self.max_daily_loss_pct:
                logging.warning(
                    f"[CircuitBreaker] 🚨 Perte journalière max atteinte ! "
                    f"Perte: {loss_pct*100:.2f}% (Seuil {self.max_daily_loss_pct*100:.2f}%)"
                )
                self.kill_switch.activate(reason="MAX_DAILY_LOSS_REACHED")
                return False

        # 3. Trailing Drawdown depuis le sommet (High Water Mark) de la journée
        if self.trailing_dd_enabled and self.high_water_mark > 0:
            trailing_dd = (self.high_water_mark - current_equity) / self.high_water_mark
            if trailing_dd >= self.max_daily_loss_pct:
                logging.warning(
                    f"[CircuitBreaker] 🚨 Trailing Drawdown max atteint ! "
                    f"Recul: {trailing_dd*100:.2f}% depuis pic {self.high_water_mark:.2f} (Seuil {self.max_daily_loss_pct*100:.2f}%)"
                )
                self.kill_switch.activate(reason="TRAILING_DRAWDOWN_LIMIT_REACHED")
                return False

        # 4. Profit Lock : Si le gain intraday a atteint un seuil significatif et retombe sous le verrou
        if self.profit_lock_pct > 0 and self.daily_start_balance > 0:
            # Palier d'activation : gain de pointe >= 2 * profit_lock_pct
            peak_gain_pct = (self.high_water_mark - self.daily_start_balance) / self.daily_start_balance
            if peak_gain_pct >= self.profit_lock_pct * 2:
                # Verrou : si le profit actuel repasse sous profit_lock_pct
                current_gain_pct = (current_equity - self.daily_start_balance) / self.daily_start_balance
                if current_gain_pct < self.profit_lock_pct:
                    logging.warning(
                        f"[CircuitBreaker] 🔒 Profit Lock déclenché ! "
                        f"Gain actuel {current_gain_pct*100:.2f}% sous le seuil garanti de {self.profit_lock_pct*100:.2f}% (Pic {peak_gain_pct*100:.2f}%)"
                    )
                    self.kill_switch.activate(reason="PROFIT_LOCK_TRIGGERED")
                    return False

        return True

    def get_metrics(self) -> Dict[str, Any]:
        """Retourne les métriques courantes du Circuit Breaker."""
        account = self.state_manager.account
        current_equity = account.equity if account else 0.0
        pnl = current_equity - self.daily_start_balance if self.daily_start_balance > 0 else 0.0
        pnl_pct = pnl / self.daily_start_balance if self.daily_start_balance > 0 else 0.0

        return {
            "daily_start_balance": round(self.daily_start_balance, 2),
            "high_water_mark": round(self.high_water_mark, 2),
            "current_daily_pnl": round(pnl, 2),
            "current_daily_pnl_pct": round(pnl_pct, 4),
            "last_reset_date": str(self.last_reset_date) if self.last_reset_date else None,
            "max_daily_loss_pct": self.max_daily_loss_pct,
            "trailing_dd_enabled": self.trailing_dd_enabled,
            "profit_lock_pct": self.profit_lock_pct
        }
