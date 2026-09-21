import logging
import threading
from typing import Any, Optional
from infrastructure.mt5_connector import MT5Connector

try:
    from infrastructure.telegram_notifier import TelegramNotifier, telegram_notifier
except ImportError:
    TelegramNotifier = None  # type: ignore
    telegram_notifier = None  # type: ignore


class KillSwitch:
    def __init__(self, connector: Any, notifier: Optional[Any] = None):
        self.connector = connector
        self.notifier = notifier if notifier is not None else telegram_notifier
        self.is_triggered: bool = False
        self._lock: threading.Lock = threading.Lock()

    def activate(self, reason: str):
        """Active l'arrêt d'urgence et ferme toutes les positions (Article 12 RTS 6)"""
        with self._lock:
            if self.is_triggered:
                return

            self.is_triggered = True
            logging.critical(f"⚠️ KILL SWITCH ACTIVÉ ⚠️ Raison: {reason}")

            pos_count = 0
            try:
                if hasattr(self.connector, "get_positions"):
                    positions = self.connector.get_positions()
                    pos_count = len(positions) if positions else 0
            except Exception as e:
                logging.warning(f"KillSwitch: Impossible de décompter les positions: {e}")

            if self.notifier:
                try:
                    self.notifier.notify_critical_event(
                        "KILL_SWITCH",
                        reason=reason,
                        details=f"Emergency liquidation triggered: {pos_count} positions closed"
                    )
                except Exception as notif_err:
                    logging.error(f"KillSwitch: Erreur dispatch notification: {notif_err}")

            self._close_all_positions()

    def _close_all_positions(self):
        """Ferme drastiquement toutes les positions ouvertes"""
        if not getattr(self.connector, "connected", False):
            logging.error("KillSwitch: Impossible de fermer les positions, MT5 non connecté.")
            return

        try:
            positions = self.connector.get_positions()
            for pos in positions:
                success = self.connector.close_position(pos.ticket)
                if success:
                    logging.info(f"KillSwitch: Position {pos.ticket} fermée avec succès.")
                else:
                    logging.error(f"KillSwitch: ECHEC de la fermeture de la position {pos.ticket} !")
        except Exception as e:
            logging.error(f"KillSwitch: Erreur lors de la fermeture des positions: {e}")

    def reset(self):
        """Désactive le Kill Switch (Nécessite intervention manuelle/biométrique dans l'UI)"""
        with self._lock:
            logging.warning("Kill Switch réarmé.")
            self.is_triggered = False

