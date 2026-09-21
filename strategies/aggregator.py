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
        active_weight = 0.0
        
        # --- NOUVEAU: Accumulateurs pour SL/TP/ATR pondérés ---
        total_sl = 0.0
        total_tp = 0.0
        total_atr = 0.0
        sl_tp_weight = 0.0

        for sig, weight in signals:
            active_weight += weight
            if sig.direction == OrderType.BUY:
                buy_score += sig.confidence * weight
            else:
                sell_score += sig.confidence * weight
                
            # Accumuler les valeurs SL/TP si elles existent
            if sig.sl_pips is not None and sig.tp_pips is not None:
                # Plus la stratégie a de poids/confiance, plus son SL/TP pèse dans la balance
                w = sig.confidence * weight
                total_sl += sig.sl_pips * w
                total_tp += sig.tp_pips * w
                total_atr += (sig.atr or 0.0) * w
                sl_tp_weight += w

        # S'il n'y a pas de consensus clair, on ignore
        if active_weight == 0:
            return None
            
        # Log du résumé pour le symbole
        buy_pct = (buy_score / active_weight) * 100
        sell_pct = (sell_score / active_weight) * 100
        logging.info(f"[Aggregator] {symbol} | Forces Brutes -> BUY: {buy_pct:.1f}% | SELL: {sell_pct:.1f}%")

        final_buy_confidence = buy_score / active_weight
        final_sell_confidence = sell_score / active_weight
        
        # Moyenne pondérée des SL/TP/ATR
        final_sl = round(total_sl / sl_tp_weight, 1) if sl_tp_weight > 0 else None
        final_tp = round(total_tp / sl_tp_weight, 1) if sl_tp_weight > 0 else None
        final_atr = (total_atr / sl_tp_weight) if sl_tp_weight > 0 else None

        # On exige un fort consensus pour valider
        if final_buy_confidence > 0.5 and final_buy_confidence > final_sell_confidence:
            return Signal(
                symbol=symbol,
                direction=OrderType.BUY,
                confidence=final_buy_confidence,
                source="Aggregator_Consensus",
                sl_pips=final_sl,
                tp_pips=final_tp,
                atr=final_atr
            )
        elif final_sell_confidence > 0.5 and final_sell_confidence > final_buy_confidence:
            return Signal(
                symbol=symbol,
                direction=OrderType.SELL,
                confidence=final_sell_confidence,
                source="Aggregator_Consensus",
                sl_pips=final_sl,
                tp_pips=final_tp,
                atr=final_atr
            )

        return None
