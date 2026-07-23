import logging
from core.interfaces import Signal, AccountInfo
from infrastructure.config import Config

class OrderPreCheckerAgent:
    def __init__(self):
        self.max_risk_pct = Config.MAX_RISK_PER_TRADE_PCT

    def validate_signal(self, signal: Signal, account: AccountInfo) -> bool:
        """Sanity check RTS 6: Vérifie si l'ordre est raisonnable avant exécution."""
        if not account:
            return False

        if signal.confidence < Config.ML_CONFIDENCE_THRESHOLD:
            logging.warning(f"OrderPreChecker: Confiance ML trop faible ({signal.confidence} < {Config.ML_CONFIDENCE_THRESHOLD})")
            return False

        # Exemple: Vérifier que le spread n'est pas aberrant ou que le margin level est OK
        if account.margin_level > 0 and account.margin_level < 150.0:
            logging.warning("OrderPreChecker: Margin level trop faible (< 150%)")
            return False

        logging.info(f"OrderPreChecker: Signal {signal.symbol} {signal.direction.name} validé.")
        return True
