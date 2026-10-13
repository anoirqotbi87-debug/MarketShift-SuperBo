import threading
from typing import Dict, List, Any


class ExecutionMetricsCollector:
    """
    Collecteur thread-safe des métriques d'exécution et de latence (RTS 6 / MiFID II).
    Mesure la qualité d'exécution des ordres et les rejets pré-trade.
    """

    def __init__(self, max_history: int = 200):
        self._lock = threading.Lock()
        self.max_history = max_history

        self.orders_attempted: int = 0
        self.orders_executed: int = 0

        self.last_routing_latency_ms: float = 0.0
        self._latencies_ms: List[float] = []
        self._slippages_pips: List[float] = []

        self.total_pretrade_rejections: int = 0
        self.rejections_by_reason: Dict[str, int] = {}

    def record_order_attempt(self) -> None:
        """Enregistre une tentative de routage d'ordre."""
        with self._lock:
            self.orders_attempted += 1

    def record_order_execution(
        self,
        latency_ms: float,
        slippage_pips: float = 0.0,
        success: bool = True
    ) -> None:
        """Enregistre le résultat de l'exécution d'un ordre (latence et slippage)."""
        with self._lock:
            self.last_routing_latency_ms = round(latency_ms, 2)
            self._latencies_ms.append(latency_ms)
            if len(self._latencies_ms) > self.max_history:
                self._latencies_ms.pop(0)

            if success:
                self.orders_executed += 1
                self._slippages_pips.append(abs(slippage_pips))
                if len(self._slippages_pips) > self.max_history:
                    self._slippages_pips.pop(0)

    def record_pretrade_rejection(self, reason: str) -> None:
        """Enregistre un rejet en amont par le PreTradeValidator."""
        clean_reason = reason.strip() if reason else "UNKNOWN_REASON"
        with self._lock:
            self.total_pretrade_rejections += 1
            self.rejections_by_reason[clean_reason] = (
                self.rejections_by_reason.get(clean_reason, 0) + 1
            )

    def get_metrics(self) -> Dict[str, Any]:
        """Retourne un snapshot complet des métriques d'exécution."""
        with self._lock:
            avg_latency = (
                sum(self._latencies_ms) / len(self._latencies_ms)
                if self._latencies_ms
                else 0.0
            )
            avg_slippage = (
                sum(self._slippages_pips) / len(self._slippages_pips)
                if self._slippages_pips
                else 0.0
            )
            fill_rate = (
                (self.orders_executed / self.orders_attempted * 100.0)
                if self.orders_attempted > 0
                else 0.0
            )

            return {
                "avg_routing_latency_ms": round(avg_latency, 2),
                "last_routing_latency_ms": round(self.last_routing_latency_ms, 2),
                "fill_rate_pct": round(fill_rate, 2),
                "avg_slippage_pips": round(avg_slippage, 2),
                "orders_attempted": self.orders_attempted,
                "orders_executed": self.orders_executed,
                "pretrade_rejections": {
                    "total": self.total_pretrade_rejections,
                    "by_reason": dict(self.rejections_by_reason),
                },
            }

    def reset(self) -> None:
        """Réinitialise les métriques (utile pour les tests et le rollover)."""
        with self._lock:
            self.orders_attempted = 0
            self.orders_executed = 0
            self.last_routing_latency_ms = 0.0
            self._latencies_ms.clear()
            self._slippages_pips.clear()
            self.total_pretrade_rejections = 0
            self.rejections_by_reason.clear()


# Instance singleton globale
execution_metrics = ExecutionMetricsCollector()
