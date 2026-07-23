import logging
from infrastructure.mt5_connector import MT5Connector

class KillSwitch:
    def __init__(self, connector: MT5Connector):
        self.connector = connector
        self.is_triggered = False

    def activate(self, reason: str):
        """Active l'arrêt d'urgence et ferme toutes les positions (Article 12 RTS 6)"""
        if self.is_triggered:
            return

        logging.critical(f"⚠️ KILL SWITCH ACTIVÉ ⚠️ Raison: {reason}")
        self.is_triggered = True
        self._close_all_positions()

    def _close_all_positions(self):
        """Ferme drastiquement toutes les positions ouvertes"""
        if not self.connector.connected:
            logging.error("KillSwitch: Impossible de fermer les positions, MT5 non connecté.")
            return

        positions = self.connector.get_positions()
        for pos in positions:
            success = self.connector.close_position(pos.ticket)
            if success:
                logging.info(f"KillSwitch: Position {pos.ticket} fermée avec succès.")
            else:
                logging.error(f"KillSwitch: ECHEC de la fermeture de la position {pos.ticket} !")

    def reset(self):
        """Désactive le Kill Switch (Nécessite intervention manuelle/biométrique dans l'UI)"""
        logging.warning("Kill Switch réarmé.")
        self.is_triggered = False
