import pandas as pd
import numpy as np
import ta
import logging
from typing import Optional
from core.interfaces import Signal, OrderType
from strategies.base import StrategyBase

class EMACrossoverStrategy(StrategyBase):
    def __init__(self, name="EMA_Crossover", weight=1.0, short_period=9, long_period=21):
        super().__init__(name, weight)
        self.short_period = short_period
        self.long_period = long_period
        
        # État interne
        self._df = pd.DataFrame()

    def update_data(self, df: pd.DataFrame):
        """Met à jour les données de marché internes de la stratégie"""
        self._df = df

    def analyze(self, symbol: str) -> Optional[Signal]:
        """Analyse l'historique et retourne un Signal selon le croisement des EMA"""
        if self._df.empty or len(self._df) < self.long_period + 2:
            return None
            
        try:
            # Calcul des indicateurs techniques
            close_prices = self._df['close']
            ema_short = ta.trend.ema_indicator(close_prices, window=self.short_period)
            ema_long = ta.trend.ema_indicator(close_prices, window=self.long_period)
            
            # Les deux dernières valeurs
            current_short = ema_short.iloc[-1]
            current_long = ema_long.iloc[-1]
            prev_short = ema_short.iloc[-2]
            prev_long = ema_long.iloc[-2]
            
            if pd.isna(current_short) or pd.isna(current_long):
                return None
                
            # Golden Cross (Achat)
            if current_short > current_long and prev_short <= prev_long:
                logging.info(f"[{self.name}] 🟢 GOLDEN CROSS détecté sur {symbol}")
                return Signal(
                    symbol=symbol,
                    direction=OrderType.BUY,
                    confidence=0.85,  # Confiance forte car c'est un croisement net
                    source=self.name
                )
                
            # Death Cross (Vente)
            if current_short < current_long and prev_short >= prev_long:
                logging.info(f"[{self.name}] 🔴 DEATH CROSS détecté sur {symbol}")
                return Signal(
                    symbol=symbol,
                    direction=OrderType.SELL,
                    confidence=0.85,
                    source=self.name
                )
                
        except Exception as e:
            logging.error(f"[{self.name}] Erreur lors de l'analyse : {e}")
            
        return None
