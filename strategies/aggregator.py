import logging
from typing import List, Optional
from core.interfaces import Signal, OrderType
from strategies.base import StrategyBase

class SignalAggregator:
    def __init__(self, strategies: List[StrategyBase]):
        self.strategies = strategies

    def aggregate(self, symbol: str) -> Optional[Signal]:
        """Fusionne les signaux de toutes les stratégies en un seul (Advisory Mode)."""
        signals = []
        for strategy in self.strategies:
            sig = strategy.analyze(symbol)
            if sig:
                signals.append((sig, strategy.weight))

        if not signals:
            return None

        buy_score = 0.0
        sell_score = 0.0
        total_weight = 0.0

        for sig, weight in signals:
            total_weight += weight
            if sig.direction == OrderType.BUY:
                buy_score += sig.confidence * weight
            else:
                sell_score += sig.confidence * weight

        # S'il n'y a pas de consensus clair, on ignore
        if total_weight == 0:
            return None

        final_buy_confidence = buy_score / total_weight
        final_sell_confidence = sell_score / total_weight

        # On exige un fort consensus pour valider
        if final_buy_confidence > 0.6 and final_buy_confidence > final_sell_confidence:
            return Signal(
                symbol=symbol,
                direction=OrderType.BUY,
                confidence=final_buy_confidence,
                source="Aggregator_Consensus"
            )
        elif final_sell_confidence > 0.6 and final_sell_confidence > final_buy_confidence:
            return Signal(
                symbol=symbol,
                direction=OrderType.SELL,
                confidence=final_sell_confidence,
                source="Aggregator_Consensus"
            )

        return None
