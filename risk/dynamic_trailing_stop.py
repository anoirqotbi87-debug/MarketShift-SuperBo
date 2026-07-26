import logging
import pandas as pd
from typing import Optional

class DynamicTrailingStop:
    """
    Trailing Stop Élastique (Inspiré de Freqtrade).
    Ajuste la distance du stop-loss de manière asymétrique en fonction de la volatilité (ATR).
    """

    def __init__(self, atr_multiplier_base: float = 1.5, max_profit_lock_pct: float = 0.8):
        self.atr_multiplier = atr_multiplier_base
        self.max_profit_lock_pct = max_profit_lock_pct
        logging.info("[DynamicTrailingStop] Module initialisé.")

    def calculate_new_stop(
        self, 
        current_price: float, 
        open_price: float, 
        current_stop: float, 
        direction: str, 
        atr_value: float
    ) -> Optional[float]:
        """
        Calcule le nouveau niveau du Trailing Stop.
        Retourne le nouveau prix du stop si un ajustement est nécessaire, sinon None.
        """
        if pd.isna(atr_value) or atr_value <= 0:
            return None

        # La distance de base est l'ATR multiplié par notre facteur
        distance = atr_value * self.atr_multiplier
        
        # Plus le trade est en profit, plus on resserre agressivement (élasticité)
        profit_pips = (current_price - open_price) if direction == 'BUY' else (open_price - current_price)
        
        # Si le profit dépasse 2x l'ATR, on divise la distance par 2 pour "locker" le gain
        if profit_pips > (atr_value * 2):
            distance = distance * 0.5
            
        new_stop = None

        if direction == 'BUY':
            proposed_stop = current_price - distance
            if proposed_stop > current_stop and proposed_stop < current_price:
                new_stop = proposed_stop
        elif direction == 'SELL':
            proposed_stop = current_price + distance
            if proposed_stop < current_stop and proposed_stop > current_price:
                new_stop = proposed_stop

        return new_stop
