import collections
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
        # Le point de linéarisation est le DÉMARRAGE EFFECTIF de l'appel broker,
        # pas l'admission côté worker : begin_emission_in_thread() est appelée
        # dans le thread d'exécution, juste avant execute_order(), sous ce même
        # verrou que prennent activate() et reset().
        #   - l'appel démarre AVANT l'activation  -> il est engagé, suivi jusqu'à
        #     sa terminaison réelle et jamais présenté comme annulé ;
        #   - l'activation passe AVANT le démarrage -> execute_order() n'est
        #     jamais appelée, même si l'ordre a déjà été dépilé.
        # Le verrou n'est JAMAIS tenu pendant l'appel broker : uniquement autour
        # du contrôle et de l'enregistrement du démarrage (section critique
        # courte, sans I/O).
        self._emission_epoch: int = 0
        self._in_flight_emissions: int = 0          # appels broker réellement en cours
        self._in_flight_at_activation: int = 0
        self._active_emissions: dict = {}           # emission_id -> infos de suivi
        self._abandoned_ids: set = set()            # abandonnés AVANT tout démarrage
        self._abandoned_in_flight: int = 0          # abandonnés par le worker, thread encore actif
        self._finished_after_abandon: int = 0       # threads terminés APRÈS abandon du worker
        # Identifiants déjà terminés (borne mémoire) : permet à un mark_abandoned()
        # qui arrive APRÈS la terminaison du thread de ne pas laisser d'entrée
        # terminale inutile dans _abandoned_ids.
        self._completed_ids: "collections.OrderedDict[str, None]" = collections.OrderedDict()
        self._completed_ids_max: int = 2048
        self._last_gate_to_call_ms: Optional[float] = None
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
        """Nombre d'appels broker démarrés et non encore terminés."""
        with self._lock:
            return self._in_flight_emissions

    @property
    def in_flight_at_activation(self) -> int:
        with self._lock:
            return self._in_flight_at_activation

    @property
    def abandoned_in_flight(self) -> int:
        """Émissions abandonnées par le worker dont le thread tourne encore."""
        with self._lock:
            return self._abandoned_in_flight

    @property
    def finished_after_abandon(self) -> int:
        with self._lock:
            return self._finished_after_abandon

    @property
    def last_gate_to_call_ms(self) -> Optional[float]:
        """Dernier écart mesuré barrière logique -> entrée réelle connecteur."""
        with self._lock:
            return self._last_gate_to_call_ms

    def active_emissions(self) -> dict:
        """Instantané des appels broker en cours (suivi INDETERMINATE)."""
        with self._lock:
            return {k: dict(v) for k, v in self._active_emissions.items()}

    def register_neutralizer(self, callback: Optional[Callable[[str], None]]) -> None:
        """Enregistre le callback chargé de neutraliser la file d'ordres en attente."""
        with self._lock:
            self._neutralizer = callback

    def stamp_emission_epoch(self) -> Optional[int]:
        """Estampille un ordre à mettre en file, atomiquement avec le contrôle
        de l'état d'urgence.

        Retourne la génération courante, ou ``None`` si le KillSwitch est déjà
        activé (l'ordre ne doit jamais entrer en file). Une activation ou un
        réarmement survenant après cet appel rend l'estampille périmée, donc
        l'ordre sera refusé au démarrage : aucune génération « fraîche » ne peut
        être attribuée à un signal produit avant l'arrêt.
        """
        with self._lock:
            if self.is_triggered:
                return None
            return self._emission_epoch

    def begin_emission_in_thread(
        self,
        emission_id: str,
        epoch: Optional[int] = None,
    ) -> Tuple[bool, str]:
        """Point de linéarisation : appelée DANS le thread, juste avant
        ``execute_order()``.

        Sous verrou, cette méthode :
          1. refuse si le KillSwitch est activé ou si la génération est périmée ;
          2. refuse si l'émission a été abandonnée avant d'avoir démarré ;
          3. enregistre sinon le démarrage (compteur + suivi nominatif).

        Retourne (True, "STARTED") ou (False, motif). Motifs :
          - "KILL_SWITCH_ACTIVE" ;
          - "STALE_EPOCH" ;
          - "ABANDONED_BEFORE_START" (timeout/annulation survenu avant le départ).
        """
        import time
        with self._lock:
            if self.is_triggered:
                return False, "KILL_SWITCH_ACTIVE"
            if epoch is not None and int(epoch) != self._emission_epoch:
                return False, "STALE_EPOCH"
            if emission_id in self._abandoned_ids:
                self._abandoned_ids.discard(emission_id)
                return False, "ABANDONED_BEFORE_START"
            self._in_flight_emissions += 1
            self._active_emissions[emission_id] = {
                "started_at": time.time(),
                "epoch": self._emission_epoch,
                "abandoned": False,
                "outcome": None,
            }
            return True, "STARTED"

    def note_call_entered(self, emission_id: str, gate_exit_at: Optional[float] = None) -> None:
        """Trace l'entrée effective dans ``execute_order()``.

        Permet de mesurer l'intervalle résiduel entre le franchissement logique
        de la barrière et l'entrée physique dans le connecteur (contrat B de la
        revue : le point de non-retour est logique, la mesure rend l'écart
        observable au lieu de le supposer nul).
        """
        import time
        with self._lock:
            info = self._active_emissions.get(emission_id)
            if info is None:
                return
            info["call_entered_at"] = time.time()
            if gate_exit_at is not None:
                gap_ms = (time.perf_counter() - gate_exit_at) * 1000.0
                info["gate_to_call_ms"] = gap_ms
                self._last_gate_to_call_ms = gap_ms

    def mark_abandoned(self, emission_id: str) -> None:
        """Le worker renonce à attendre cette émission (timeout ou annulation).

        Un timeout de coroutine n'arrête PAS le thread : si l'appel a démarré, il
        reste compté en vol et suivi jusqu'à sa terminaison réelle. S'il n'a pas
        encore démarré, il est marqué pour refus au démarrage — il ne pourra donc
        jamais partir après coup.
        """
        with self._lock:
            info = self._active_emissions.get(emission_id)
            if info is None:
                # Le thread a pu se terminer AVANT que le worker ne traite son
                # timeout : l'identifiant est déjà terminal, ne rien mémoriser.
                if emission_id in self._completed_ids:
                    return
                self._abandoned_ids.add(emission_id)
                return
            if not info.get("abandoned"):
                info["abandoned"] = True
                self._abandoned_in_flight += 1

    def finish_emission(self, emission_id: str, outcome: Optional[str] = None) -> None:
        """Clôture comptable, appelée par le thread à sa terminaison RÉELLE."""
        with self._lock:
            info = self._active_emissions.pop(emission_id, None)
            if info is None:
                self._abandoned_ids.discard(emission_id)
                return
            self._abandoned_ids.discard(emission_id)
            self._remember_completed(emission_id)
            if self._in_flight_emissions > 0:
                self._in_flight_emissions -= 1
            if info.get("abandoned"):
                if self._abandoned_in_flight > 0:
                    self._abandoned_in_flight -= 1
                self._finished_after_abandon += 1
                logging.warning(
                    f"KillSwitch: émission {emission_id} abandonnée par le worker terminée "
                    f"tardivement (outcome={outcome}) — suivi clôturé après terminaison réelle."
                )

    def _remember_completed(self, emission_id: str) -> None:
        """Mémorise (de façon bornée) qu'une émission est déjà terminale."""
        self._completed_ids[emission_id] = None
        self._completed_ids.move_to_end(emission_id)
        while len(self._completed_ids) > self._completed_ids_max:
            self._completed_ids.popitem(last=False)

    def activate(self, reason: str):
        """Active l'arrêt d'urgence et ferme toutes les positions (Article 12 RTS 6).

        Le verrou n'est tenu QUE pendant l'établissement atomique de l'état
        d'urgence (drapeau + invalidation de génération + instantané des
        émissions en cours). Toutes les opérations externes (neutralisation de
        la file, comptage/fermeture des positions, notifications) s'exécutent
        hors verrou : aucune I/O ne peut retarder la barrière d'émission ni
        bloquer un thread broker qui clôture son émission.
        """
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
            neutralizer = self._neutralizer
            in_flight_at_activation = self._in_flight_at_activation
            logging.critical(f"⚠️ KILL SWITCH ACTIVÉ ⚠️ Raison: {reason}")
            if in_flight_at_activation:
                logging.critical(
                    f"KillSwitch: {in_flight_at_activation} émission(s) LOGIQUEMENT engagée(s) "
                    "au moment de l'activation — suivi/réconciliation requis, aucune annulation "
                    "ni transmission réseau confirmée supposée."
                )

        # ── Hors verrou : opérations externes potentiellement lentes ────────
        if neutralizer:
            try:
                neutralizer(reason)
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

