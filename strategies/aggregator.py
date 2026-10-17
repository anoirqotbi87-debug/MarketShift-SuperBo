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
        
        # --- Accumulateurs pour SL/TP/ATR pondérés ---
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
                w = sig.confidence * weight
                total_sl += sig.sl_pips * w
                total_tp += sig.tp_pips * w
                total_atr += (sig.atr or 0.0) * w
                sl_tp_weight += w

        if active_weight == 0:
            return None
            
        # Log du résumé pour le symbole
        buy_pct = (buy_score / active_weight) * 100
        sell_pct = (sell_score / active_weight) * 100
        logging.info(f"[Aggregator] {symbol} | Forces Brutes -> BUY: {buy_pct:.1f}% | SELL: {sell_pct:.1f}%")

        # --- DÉTECTION DE CONFLIT DIRECTIONNEL ---
        # Si une stratégie crie ACHAT et une autre crie VENTE avec une force significative (>35%),
        # il y a divergence technique/institutionnelle -> neutralisation immédiate.
        if buy_score > 0 and sell_score > 0:
            conflict_ratio = min(buy_score, sell_score) / max(buy_score, sell_score)
            if conflict_ratio > 0.35:
                logging.warning(
                    f"[Aggregator] ⚠️ Signal NEUTRALISÉ sur {symbol} : Conflit directionnel direct "
                    f"(BUY score: {buy_score:.2f} vs SELL score: {sell_score:.2f}, divergence: {conflict_ratio*100:.0f}%)"
                )
                return None

        # Moyenne pondérée des SL/TP/ATR
        final_sl = round(total_sl / sl_tp_weight, 1) if sl_tp_weight > 0 else None
        final_tp = round(total_tp / sl_tp_weight, 1) if sl_tp_weight > 0 else None
        final_atr = (total_atr / sl_tp_weight) if sl_tp_weight > 0 else None

        # Détermination de la direction dominante
        dominant_direction = OrderType.BUY if buy_score > sell_score else OrderType.SELL
        agreeing_signals = [sig for sig, _ in signals if sig.direction == dominant_direction]
        num_agreeing = len(agreeing_signals)
        sources_list = [sig.source for sig in agreeing_signals]

        raw_confidence = (buy_score if dominant_direction == OrderType.BUY else sell_score) / active_weight

        # Étalonnage de la confiance :
        # - Si confluence de 2+ stratégies : bonus de confirmation (jusqu'à 0.95)
        # - Si 1 seule stratégie : confiance bornée à 0.75 max pour éviter de court-circuiter les filtres de sécurité
        if num_agreeing >= 2:
            final_confidence = min(0.95, raw_confidence * 1.1)
            source_name = f"Confluence_{'+'.join(sources_list)}"
        else:
            final_confidence = min(0.75, raw_confidence)
            source_name = sources_list[0] if sources_list else "Aggregator_Single"

        if dominant_direction == OrderType.BUY and final_confidence >= 0.50:
            return Signal(
                symbol=symbol,
                direction=OrderType.BUY,
                confidence=round(final_confidence, 2),
                source=source_name,
                sl_pips=final_sl,
                tp_pips=final_tp,
                atr=final_atr
            )
        elif dominant_direction == OrderType.SELL and final_confidence >= 0.50:
            return Signal(
                symbol=symbol,
                direction=OrderType.SELL,
                confidence=round(final_confidence, 2),
                source=source_name,
                sl_pips=final_sl,
                tp_pips=final_tp,
                atr=final_atr
            )

        return None
