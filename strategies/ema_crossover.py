import pandas as pd
import numpy as np
import ta
import logging
from typing import Optional
from core.interfaces import Signal, OrderType
from strategies.base import StrategyBase


class EMACrossoverStrategy(StrategyBase):
    def __init__(self, name="EMA_Crossover", weight=1.0, short_period=9, long_period=21,
                 sl_multiplier=1.5, tp_multiplier=2.5):
        super().__init__(name, weight, sl_multiplier=sl_multiplier, tp_multiplier=tp_multiplier)
        self.short_period = short_period
        self.long_period  = long_period

        # État interne
        self._df = pd.DataFrame()

    def update_data(self, df: pd.DataFrame):
        """Met à jour les données de marché internes de la stratégie."""
        self._df = df

    def analyze(self, symbol: str) -> Optional[Signal]:
        """Analyse l'historique et retourne un Signal selon le croisement des EMA."""
        if self._df.empty or len(self._df) < self.long_period + 2:
            return None

        try:
            # Calcul des indicateurs techniques
            close_prices = self._df['close']
            ema_short = ta.trend.ema_indicator(close_prices, window=self.short_period)
            ema_long  = ta.trend.ema_indicator(close_prices, window=self.long_period)

            current_short = ema_short.iloc[-1]
            current_long  = ema_long.iloc[-1]
            prev_short    = ema_short.iloc[-2]
            prev_long     = ema_long.iloc[-2]

            if pd.isna(current_short) or pd.isna(current_long):
                return None

            # --- Filtre ADX (Tendance forte) ---
            adx_indicator = ta.trend.ADXIndicator(
                high=self._df['high'], 
                low=self._df['low'], 
                close=self._df['close'], 
                window=14
            )
            current_adx = adx_indicator.adx().iloc[-1]
            if pd.isna(current_adx) or current_adx < 15.0:
                return None # Marché en range, on ignore le croisement

            # Filtre Volume supprimé pour le Forex (souvent non représentatif)

            # Calculer SL/TP basés sur l'ATR
            pip_size = self.get_pip_size(symbol)
            sl_pips, tp_pips, atr = self.compute_sl_tp_pips(self._df, pip_size)

            # Golden Cross (Achat)
            if current_short > current_long and prev_short <= prev_long:
                logging.debug(
                    f"[{self.name}] 🟢 GOLDEN CROSS sur {symbol} | "
                    f"ATR={atr:.5f} | SL={sl_pips:.1f}p | TP={tp_pips:.1f}p"
                )
                return Signal(
                    symbol=symbol,
                    direction=OrderType.BUY,
                    confidence=0.85,
                    source=self.name,
                    sl_pips=sl_pips,
                    tp_pips=tp_pips,
                    atr=atr
                )

            # Death Cross (Vente)
            if current_short < current_long and prev_short >= prev_long:
                logging.debug(
                    f"[{self.name}] 🔴 DEATH CROSS sur {symbol} | "
                    f"ATR={atr:.5f} | SL={sl_pips:.1f}p | TP={tp_pips:.1f}p"
                )
                return Signal(
                    symbol=symbol,
                    direction=OrderType.SELL,
                    confidence=0.85,
                    source=self.name,
                    sl_pips=sl_pips,
                    tp_pips=tp_pips,
                    atr=atr
                )

        except Exception as e:
            logging.error(f"[{self.name}] Erreur lors de l'analyse : {e}")

        return None
