import pandas as pd
import ta
import logging
from typing import Optional
from core.interfaces import Signal, OrderType
from strategies.base import StrategyBase

class RsiMacdStrategy(StrategyBase):
    def __init__(self, name="RSI_MACD", weight=1.5, rsi_period=14, rsi_overbought=70, rsi_oversold=30):
        super().__init__(name, weight)
        self.rsi_period = rsi_period
        self.rsi_overbought = rsi_overbought
        self.rsi_oversold = rsi_oversold
        self._df = pd.DataFrame()

    def update_data(self, df: pd.DataFrame):
        self._df = df

    def analyze(self, symbol: str) -> Optional[Signal]:
        """Fusionne RSI Extreme + Confirmation MACD"""
        if self._df.empty or len(self._df) < 35:  # MACD requiert au moins 26+9 périodes
            return None

        try:
            close_prices = self._df['close']
            
            # Calcul RSI
            rsi = ta.momentum.rsi(close_prices, window=self.rsi_period)
            
            # Calcul MACD
            macd = ta.trend.macd(close_prices)
            macd_signal = ta.trend.macd_signal(close_prices)
            macd_diff = ta.trend.macd_diff(close_prices) # Histogramme

            current_rsi = rsi.iloc[-1]
            current_macd_diff = macd_diff.iloc[-1]
            prev_macd_diff = macd_diff.iloc[-2]

            if pd.isna(current_rsi) or pd.isna(current_macd_diff):
                return None

            # Condition d'Achat (Buy)
            # RSI en survente (oversold) ET le MACD commence à se retourner à la hausse
            if current_rsi < self.rsi_oversold and current_macd_diff > prev_macd_diff and current_macd_diff < 0:
                logging.info(f"[{self.name}] 🟢 Signal d'achat détecté sur {symbol} (RSI: {current_rsi:.2f})")
                return Signal(
                    symbol=symbol,
                    direction=OrderType.BUY,
                    confidence=0.75,
                    source=self.name
                )

            # Condition de Vente (Sell)
            # RSI en surachat (overbought) ET le MACD commence à se retourner à la baisse
            if current_rsi > self.rsi_overbought and current_macd_diff < prev_macd_diff and current_macd_diff > 0:
                logging.info(f"[{self.name}] 🔴 Signal de vente détecté sur {symbol} (RSI: {current_rsi:.2f})")
                return Signal(
                    symbol=symbol,
                    direction=OrderType.SELL,
                    confidence=0.75,
                    source=self.name
                )

        except Exception as e:
            logging.error(f"[{self.name}] Erreur d'analyse: {e}")

        return None
