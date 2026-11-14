import logging
import threading
from typing import Any, Callable, Optional, Tuple
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
        self.activated_at: float = 0.0
        # RLock : activate() appelle le neutraliseur (callback moteur) sous verrou.
        self._lock: threading.RLock = threading.RLock()

        # ── Barrière d'émission (EXEC-01) ────────────────────────────────────
        # Toute émission d'ordre doit être admise par try_begin_emission(), qui
        # partage ce verrou avec activate()/reset(). Points de linéarisation :
        #   - l'ordre est admis AVANT l'activation  -> appel déjà engagé, à suivre
        #     (éventuellement à réconcilier), jamais présenté comme annulé ;
        #   - l'activation passe AVANT l'admission -> l'émission est refusée,
        #     même pour un ordre déjà dépilé de la file.
        self._emission_epoch: int = 0
        self._in_flight_emissions: int = 0
        self._in_flight_at_activation: int = 0
        self._neutralizer: Optional[Callable[[str], None]] = None

    # ── Barrière d'émission ──────────────────────────────────────────────────

    @property
    def emission_epoch(self) -> int:
        """Génération courante d'émission. Tout payload estampillé d'une
        génération antérieure est périmé (activation ou réarmement survenu)."""
        with self._lock:
            return self._emission_epoch

    @property
    def in_flight_emissions(self) -> int:
        with self._lock:
            return self._in_flight_emissions

    @property
    def in_flight_at_activation(self) -> int:
        with self._lock:
            return self._in_flight_at_activation

    def register_neutralizer(self, callback: Optional[Callable[[str], None]]) -> None:
        """Enregistre le callback chargé de neutraliser la file d'ordres en attente."""
        with self._lock:
            self._neutralizer = callback

    def try_begin_emission(self, epoch: Optional[int] = None) -> Tuple[bool, str]:
        """Point d'entrée atomique de toute émission d'ordre.

        Retourne (True, "ADMITTED") si l'émission peut commencer, sinon
        (False, motif). Le motif est l'un de :
          - "KILL_SWITCH_ACTIVE" : arrêt d'urgence déjà déclenché ;
          - "STALE_EPOCH"        : payload antérieur à une activation/réarmement.
        """
        with self._lock:
            if self.is_triggered:
                return False, "KILL_SWITCH_ACTIVE"
            if epoch is not None and int(epoch) != self._emission_epoch:
                return False, "STALE_EPOCH"
            self._in_flight_emissions += 1
            return True, "ADMITTED"

    def end_emission(self) -> None:
        """Clôture comptable d'une émission admise (succès, échec ou timeout).

        Un timeout ne clôt PAS l'appel broker déjà parti dans son thread :
        l'appelant doit le classer INDETERMINATE et le suivre jusqu'à
        réconciliation. Cette méthode ne fait que décrémenter le compteur.
        """
        with self._lock:
            if self._in_flight_emissions > 0:
                self._in_flight_emissions -= 1

    def activate(self, reason: str):
        """Active l'arrêt d'urgence et ferme toutes les positions (Article 12 RTS 6)"""
        with self._lock:
            if self.is_triggered:
                return

            import time
            self.is_triggered = True
            self.activated_at = time.time()
            # Toute génération précédente devient périmée : aucun payload déjà
            # en file (ou estampillé avant l'activation) ne pourra être émis.
            self._emission_epoch += 1
            self._in_flight_at_activation = self._in_flight_emissions
            if self._in_flight_at_activation:
                logging.critical(
                    f"KillSwitch: {self._in_flight_at_activation} émission(s) déjà engagée(s) "
                    "au moment de l'activation — suivi/réconciliation requis, aucune annulation supposée."
                )
            logging.critical(f"⚠️ KILL SWITCH ACTIVÉ ⚠️ Raison: {reason}")

            if self._neutralizer:
                try:
                    self._neutralizer(reason)
                except Exception as neu_err:
                    logging.error(f"KillSwitch: Erreur neutralisation file d'ordres: {neu_err}")

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

    def reset(self, confirm_token: Optional[str] = None, min_cooldown_seconds: float = 60.0):
        """
        Désactive le Kill Switch.
        Requiert une confirmation explicite (token 'RESET_KILL_SWITCH')
        et un délai minimal de temporisation post-activation (60 secondes).
        """
        import time
        with self._lock:
            if not self.is_triggered:
                logging.info("[KillSwitch] Déjà inactif.")
                return True

            if confirm_token != "RESET_KILL_SWITCH":
                raise PermissionError("Confirmation invalide : le token 'RESET_KILL_SWITCH' est requis.")

            elapsed = time.time() - self.activated_at
            if elapsed < min_cooldown_seconds:
                remaining = int(min_cooldown_seconds - elapsed)
                raise PermissionError(
                    f"Délai de sécurité actif : réarmement impossible avant {remaining}s après activation."
                )

            logging.critical("🚨 [KillSwitch] Réarmement manuel confirmé par l'opérateur autorisé.")
            self.is_triggered = False
            self.activated_at = 0.0
            # Nouvelle génération : les payloads antérieurs à l'activation restent
            # définitivement périmés et ne peuvent pas être réémis après réarmement.
            self._emission_epoch += 1
            self._in_flight_at_activation = 0

            if self.notifier:
                try:
                    self.notifier.notify_critical_event(
                        "KILL_SWITCH_RESET",
                        reason="Réarmement manuel autorisé",
                        details="Le système reprend ses opérations sous surveillance."
                    )
                except Exception as notif_err:
                    logging.error(f"KillSwitch: Erreur dispatch notification réarmement: {notif_err}")

            return True

