"""
ml/circuit_breaker.py — Disjoncteur déterministe par symbole et global pour l'inférence ML.

Garanties Palier C2 :
- Machine à états : CLOSED, OPEN, HALF_OPEN.
- Seuil de déclenchement par symbole : 3 échecs consécutifs -> OPEN.
- Cooldown : 60.0 secondes.
- Période d'épreuve (HALF_OPEN) : 1 seule sonde simultanée, 2 succès consécutifs requis pour CLOSED.
- Tout échec en HALF_OPEN réouvre immédiatement le disjoncteur (cooldown réinitialisé).
- Découplage charge transitoire : QUEUE_SATURATED n'est pas compté comme une panne du modèle.
- Escalade globale : Déclenchement si 3 symboles distincts sont OPEN dans une fenêtre glissante de 300s,
  ou en cas de panne globale (modèle indisponible / corruption).
- Thread-safe : synchronisation stricte sous RLock. Horloge injectable pour tests déterministes.
"""

import time
import logging
import threading
from enum import Enum
from typing import Callable, Dict, Optional, Set, List, Tuple


class CircuitState(Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class SymbolCircuitBreaker:
    """
    Disjoncteur autonome par instrument financier.
    """
    def __init__(
        self,
        symbol: str,
        failure_threshold: int = 3,
        cooldown_seconds: float = 60.0,
        success_threshold: int = 2,
        clock: Optional[Callable[[], float]] = None
    ):
        self.symbol = symbol
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self.success_threshold = success_threshold
        self._clock = clock or time.monotonic

        self._lock = threading.RLock()
        self._state = CircuitState.CLOSED
        self._consecutive_failures = 0
        self._probe_successes = 0
        self._opened_at = 0.0
        self._probe_in_progress = False
        self._saturated_count = 0

    @property
    def state(self) -> CircuitState:
        with self._lock:
            self._evaluate_state()
            return self._state

    @property
    def consecutive_failures(self) -> int:
        with self._lock:
            return self._consecutive_failures

    @property
    def saturated_count(self) -> int:
        with self._lock:
            return self._saturated_count

    def _evaluate_state(self) -> None:
        """Met à jour l'état en fonction du temps écoulé (cooldown)."""
        now = self._clock()
        if self._state == CircuitState.OPEN:
            if now - self._opened_at >= self.cooldown_seconds:
                self._state = CircuitState.HALF_OPEN
                self._probe_successes = 0
                self._probe_in_progress = False
                logging.info(f"[CircuitBreaker][{self.symbol}] Cooldown écoulé ({self.cooldown_seconds}s). Transition vers HALF_OPEN.")

    def allow_request(self) -> Tuple[bool, Optional[str]]:
        """
        Vérifie si une requête d'inférence est autorisée.
        Retourne (is_allowed, reason_if_rejected).
        """
        with self._lock:
            self._evaluate_state()

            if self._state == CircuitState.CLOSED:
                return True, None

            if self._state == CircuitState.OPEN:
                remaining = max(0.0, self.cooldown_seconds - (self._clock() - self._opened_at))
                return False, f"CIRCUIT_OPEN (cooldown restant: {remaining:.1f}s)"

            if self._state == CircuitState.HALF_OPEN:
                if not self._probe_in_progress:
                    self._probe_in_progress = True
                    return True, None
                else:
                    return False, "HALF_OPEN_BUSY (sonde d'épreuve déjà en cours)"

            return False, "UNKNOWN_STATE"

    def record_success(self) -> None:
        """Enregistre une inférence réussie dans le SLA."""
        with self._lock:
            now_state = self.state

            if now_state == CircuitState.HALF_OPEN:
                self._probe_in_progress = False
                self._probe_successes += 1
                logging.info(
                    f"[CircuitBreaker][{self.symbol}] Sonde HALF_OPEN réussie ({self._probe_successes}/{self.success_threshold})."
                )
                if self._probe_successes >= self.success_threshold:
                    self._state = CircuitState.CLOSED
                    self._consecutive_failures = 0
                    self._probe_successes = 0
                    logging.info(f"[CircuitBreaker][{self.symbol}] ✅ Rétablissement complet. Transition vers CLOSED.")
            elif now_state == CircuitState.CLOSED:
                self._consecutive_failures = 0

    def record_failure(self, reason: str = "ERROR") -> None:
        """Enregistre un échec technique (timeout, exception, sortie invalide)."""
        with self._lock:
            now = self._clock()
            self._evaluate_state()

            if self._state == CircuitState.HALF_OPEN:
                self._probe_in_progress = False
                self._probe_successes = 0
                self._state = CircuitState.OPEN
                self._opened_at = now
                logging.warning(
                    f"[CircuitBreaker][{self.symbol}] 🚨 Échec sonde HALF_OPEN ({reason}). Rebascule immédiate vers OPEN (Cooldown {self.cooldown_seconds}s)."
                )
                return

            if self._state == CircuitState.CLOSED:
                self._consecutive_failures += 1
                logging.warning(
                    f"[CircuitBreaker][{self.symbol}] Échec d'inférence ({reason}) [{self._consecutive_failures}/{self.failure_threshold}]."
                )
                if self._consecutive_failures >= self.failure_threshold:
                    self._state = CircuitState.OPEN
                    self._opened_at = now
                    logging.error(
                        f"[CircuitBreaker][{self.symbol}] 🛑 Seuil atteint ({self.failure_threshold} échecs). Transition vers OPEN (Cooldown {self.cooldown_seconds}s)."
                    )

    def record_queue_saturated(self) -> None:
        """Comptabilise un rejet pour saturation transitoire sans incrémenter les pannes du modèle."""
        with self._lock:
            self._saturated_count += 1
            if self._state == CircuitState.HALF_OPEN:
                # Si la sonde n'a pas pu être exécutée faute de place, libérer le jeton
                self._probe_in_progress = False


class GlobalCircuitBreaker:
    """
    Disjoncteur système global supervisant l'ensemble des symboles.
    Déclenche si 3 symboles distincts tombent en OPEN en moins de 300s, ou sur panne globale.
    """
    def __init__(
        self,
        symbol_window_seconds: float = 300.0,
        global_threshold: int = 3,
        clock: Optional[Callable[[], float]] = None
    ):
        self.symbol_window_seconds = symbol_window_seconds
        self.global_threshold = global_threshold
        self._clock = clock or time.monotonic

        self._lock = threading.RLock()
        self._state = CircuitState.CLOSED
        self._opened_at = 0.0
        self._cooldown_seconds = 300.0
        # Liste de tuples (symbol, opened_at)
        self._recent_symbol_trips: List[Tuple[str, float]] = []

    @property
    def state(self) -> CircuitState:
        with self._lock:
            if self._state == CircuitState.OPEN:
                if self._clock() - self._opened_at >= self._cooldown_seconds:
                    self._state = CircuitState.CLOSED
                    self._recent_symbol_trips.clear()
                    logging.info("[GlobalCircuitBreaker] Cooldown global écoulé. Retour à CLOSED.")
            return self._state

    def record_symbol_trip(self, symbol: str) -> None:
        """Enregistre le déclenchement OPEN d'un symbole pour surveiller l'escalade."""
        with self._lock:
            now = self._clock()
            # Nettoyer les événements expirés
            self._recent_symbol_trips = [
                (s, t) for s, t in self._recent_symbol_trips
                if now - t <= self.symbol_window_seconds
            ]
            self._recent_symbol_trips.append((symbol, now))

            distinct_symbols = {s for s, _ in self._recent_symbol_trips}
            if len(distinct_symbols) >= self.global_threshold and self._state != CircuitState.OPEN:
                self._state = CircuitState.OPEN
                self._opened_at = now
                logging.critical(
                    f"[GlobalCircuitBreaker] 🚨 ALERTE SYSTÈME : {len(distinct_symbols)} symboles disjonctés ({distinct_symbols}) en moins de {self.symbol_window_seconds}s. Transition GLOBALE vers OPEN."
                )

    def trigger_systemic_failure(self, reason: str) -> None:
        """Déclenche immédiatement le disjoncteur global suite à une erreur système irrécupérable."""
        with self._lock:
            self._state = CircuitState.OPEN
            self._opened_at = self._clock()
            logging.critical(f"[GlobalCircuitBreaker] 🚨 PANNE GLOBALE SYSTÈME ({reason}). Transition GLOBALE vers OPEN.")

    def reset(self) -> None:
        """Réinitialisation manuelle ou de test."""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._opened_at = 0.0
            self._recent_symbol_trips.clear()
