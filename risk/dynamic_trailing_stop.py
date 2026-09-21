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
        atr_value: float,
        tp_price: float = 0.0
    ) -> Optional[float]:
        """
        Calcule le nouveau niveau du Trailing Stop.
        Retourne le nouveau prix du stop si un ajustement est nécessaire, sinon None.
        """
        if pd.isna(atr_value) or atr_value <= 0:
            return None

        # La distance de base est l'ATR multiplié par notre facteur
        distance = atr_value * self.atr_multiplier
        
        profit_pips = (current_price - open_price) if direction == 'BUY' else (open_price - current_price)
        
        # --- NOUVEAU : INSTITUTIONAL BREAK-EVEN ---
        # Si un TP est défini, on passe à Break-Even dès qu'on atteint 50% de la distance vers le TP.
        is_breakeven_ready = False
        if tp_price > 0:
            tp_distance = abs(tp_price - open_price)
            if profit_pips >= (tp_distance * 0.5):
                is_breakeven_ready = True
        elif profit_pips >= (atr_value * 1.5):
            # Fallback si pas de TP
            is_breakeven_ready = True
            
        # 1. Activation Threshold (Patience)
        # On ne touche pas au Stop Loss si le trade n'a pas décollé et qu'on n'est pas prêt pour un BE.
        if profit_pips < (atr_value * 1.0) and not is_breakeven_ready:
            return None
            
        # 2. Détermination de la distance d'élastique
        if profit_pips >= (atr_value * 3.0):
            # Le trade a explosé (Home Run), on serre agressivement pour locker le gain
            distance = atr_value * 0.5
        elif profit_pips >= (atr_value * 2.0):
            # Le trade est très bien parti, on trail à 1.0 ATR
            distance = atr_value * 1.0
        else:
            # Entre 1.0 et 2.0 ATR, on trail gentiment avec la distance de base
            distance = atr_value * self.atr_multiplier
            
        new_stop = None

        if direction == 'BUY':
            proposed_stop = current_price - distance
            if proposed_stop > current_stop:
                new_stop = proposed_stop
            else:
                new_stop = current_stop
                
            # 3. Breakeven garanti (Au prix d'ouverture + léger profit pour payer le spread)
            if is_breakeven_ready and new_stop < open_price:
                new_stop = open_price + (atr_value * 0.1) # Sécurise les frais
                
            # Vérification finale: a-t-on vraiment bougé le stop vers le haut ?
            if new_stop <= current_stop:
                new_stop = None
                
        elif direction == 'SELL':
            proposed_stop = current_price + distance
            if proposed_stop < current_stop:
                new_stop = proposed_stop
            else:
                new_stop = current_stop
                
            # 3. Breakeven garanti (Au prix d'ouverture - léger profit pour payer le spread)
            if is_breakeven_ready and new_stop > open_price:
                new_stop = open_price - (atr_value * 0.1) # Sécurise les frais
                
            # Vérification finale: a-t-on vraiment bougé le stop vers le bas ?
            if new_stop >= current_stop:
                new_stop = None

        return new_stop
