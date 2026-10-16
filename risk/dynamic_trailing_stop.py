import logging
import pandas as pd
from typing import Optional

class DynamicTrailingStop:
    """
    Trailing Stop Élastique (Inspiré de Freqtrade).
    Ajuste la distance du stop-loss de manière asymétrique en fonction de la volatilité (ATR).
    """

    def __init__(self, atr_multiplier_base: float = 1.8, max_profit_lock_pct: float = 0.8):
        self.atr_multiplier = atr_multiplier_base
        self.max_profit_lock_pct = max_profit_lock_pct
        logging.info("[DynamicTrailingStop] Module initialisé.")

    def calculate_new_stop(
        self, 
        current_price: float, 
        open_price: float, 
        current_stop: float, 
        direction: str, 
        atr_value: float,
        tp_price: float = 0.0
    ) -> Optional[float]:
        """
        Calcule le nouveau niveau du Trailing Stop.
        Retourne le nouveau prix du stop si un ajustement est nécessaire, sinon None.
        """
        if pd.isna(atr_value) or atr_value <= 0:
            return None

        profit_pips = (current_price - open_price) if direction == 'BUY' else (open_price - current_price)
        
        # --- INSTITUTIONAL BREAK-EVEN ---
        # Ne passer à Break-Even que lorsque le trade atteint 65% du chemin vers le TP (ou 2.0 ATR si pas de TP),
        # afin de ne pas étouffer le trade lors du premier pullback sain.
        is_breakeven_ready = False
        if tp_price > 0:
            tp_distance = abs(tp_price - open_price)
            if profit_pips >= (tp_distance * 0.65):
                is_breakeven_ready = True
        elif profit_pips >= (atr_value * 2.0):
            is_breakeven_ready = True
            
        # 1. Activation Threshold (Patience)
        # On ne touche pas au Stop Loss si le trade n'a pas décollé et qu'on n'est pas prêt pour un BE.
        if profit_pips < (atr_value * 1.5) and not is_breakeven_ready:
            return None
            
        # 2. Détermination de la distance d'élastique
        if profit_pips >= (atr_value * 3.5):
            # Le trade a explosé (Home Run), on serre pour sécuriser le gros gain
            distance = atr_value * 1.0
        elif profit_pips >= (atr_value * 2.5):
            # Le trade est bien avancé, on trail à 1.5 ATR
            distance = atr_value * 1.5
        else:
            # Trailing standard avec la distance de base confortable pour laisser respirer
            distance = atr_value * max(self.atr_multiplier, 1.8)
            
        new_stop = None

        if direction == 'BUY':
            proposed_stop = current_price - distance
            if proposed_stop > current_stop:
                new_stop = proposed_stop
            else:
                new_stop = current_stop
                
            # 3. Breakeven garanti (Au prix d'ouverture + léger profit pour payer le spread/frais)
            if is_breakeven_ready and new_stop < open_price:
                new_stop = open_price + (atr_value * 0.1)
                
            # Vérification finale: a-t-on vraiment bougé le stop vers le haut ?
            if new_stop <= current_stop:
                new_stop = None
                
        elif direction == 'SELL':
            proposed_stop = current_price + distance
            if proposed_stop < current_stop:
                new_stop = proposed_stop
            else:
                new_stop = current_stop
                
            # 3. Breakeven garanti (Au prix d'ouverture - léger profit pour payer le spread/frais)
            if is_breakeven_ready and new_stop > open_price:
                new_stop = open_price - (atr_value * 0.1)
                
            # Vérification finale: a-t-on vraiment bougé le stop vers le bas ?
            if new_stop >= current_stop:
                new_stop = None

        return new_stop
