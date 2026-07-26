import pandas as pd
import numpy as np
import logging
from typing import Optional
from core.interfaces import Signal, OrderType
from strategies.base import StrategyBase

class SMCStrategy(StrategyBase):
    """
    Stratégie basée sur les concepts Smart Money (SMC) & Inner Circle Trader (ICT).
    Recherche la confluence de Market Structure Shifts (MSS) et de Fair Value Gaps (FVG).
    """
    def __init__(self, name="SMC_ICT", weight=2.0, sl_multiplier=1.0, tp_multiplier=3.0):
        super().__init__(name, weight, sl_multiplier=sl_multiplier, tp_multiplier=tp_multiplier)
        self._df = pd.DataFrame()

    def update_data(self, df: pd.DataFrame):
        self._df = df

    def analyze(self, symbol: str) -> Optional[Signal]:
        if self._df.empty or len(self._df) < 15:
            return None

        try:
            # Récupérer les 15 dernières bougies
            recent = self._df.tail(15).copy()
            recent = recent.reset_index(drop=True)
            
            # --- 1. Détection de Fair Value Gap (FVG) ---
            # Un FVG nécessite 3 bougies. On checke sur les 5 dernières bougies s'il y a un FVG non mitigé.
            bullish_fvg = False
            bearish_fvg = False
            
            # Index -1 est la bougie actuelle (souvent non clôturée, ou la dernière clôturée selon le timeframe)
            # On cherche des FVG formés dans les bougies i-2, i-1, i
            for i in range(len(recent)-4, len(recent)-1):
                c1 = recent.iloc[i-2]
                c3 = recent.iloc[i]
                
                # Bullish FVG: Le bas de la bougie 3 est plus haut que le haut de la bougie 1
                if c3['low'] > c1['high']:
                    gap_size = c3['low'] - c1['high']
                    if gap_size > (c1['high'] * 0.0001): # Filtrer les micro gaps
                        bullish_fvg = True
                        
                # Bearish FVG: Le haut de la bougie 3 est plus bas que le bas de la bougie 1
                if c3['high'] < c1['low']:
                    gap_size = c1['low'] - c3['high']
                    if gap_size > (c1['low'] * 0.0001):
                        bearish_fvg = True

            # --- 2. Détection Market Structure Shift (MSS) ---
            # On calcule le Swing High et Swing Low des bougies 0 à 10
            structure_window = recent.iloc[0:11]
            swing_high = structure_window['high'].max()
            swing_low = structure_window['low'].min()
            
            # On regarde l'action des prix des bougies 11 à 14
            action_window = recent.iloc[11:15]
            current_close = action_window.iloc[-1]['close']
            
            bullish_mss = current_close > swing_high
            bearish_mss = current_close < swing_low

            pip_size = self.get_pip_size(symbol)
            sl_pips, tp_pips, atr = self.compute_sl_tp_pips(self._df, pip_size)

            # Confluence Achat : Bullish MSS + Bullish FVG
            if bullish_mss and bullish_fvg:
                logging.info(f"[{self.name}] 🟢 BULLISH SMC SETUP (MSS + FVG) sur {symbol} | ATR={atr:.5f}")
                return Signal(
                    symbol=symbol,
                    direction=OrderType.BUY,
                    confidence=0.92,
                    source=self.name,
                    sl_pips=sl_pips,
                    tp_pips=tp_pips,
                    atr=atr
                )

            # Confluence Vente : Bearish MSS + Bearish FVG
            if bearish_mss and bearish_fvg:
                logging.info(f"[{self.name}] 🔴 BEARISH SMC SETUP (MSS + FVG) sur {symbol} | ATR={atr:.5f}")
                return Signal(
                    symbol=symbol,
                    direction=OrderType.SELL,
                    confidence=0.92,
                    source=self.name,
                    sl_pips=sl_pips,
                    tp_pips=tp_pips,
                    atr=atr
                )

        except Exception as e:
            logging.error(f"[{self.name}] Erreur SMC/ICT : {e}")

        return None
