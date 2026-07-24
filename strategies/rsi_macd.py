import pandas as pd
import ta
import logging
from typing import Optional
from core.interfaces import Signal, OrderType
from strategies.base import StrategyBase


class RsiMacdStrategy(StrategyBase):
    def __init__(self, name="RSI_MACD", weight=1.5, rsi_period=14,
                 rsi_overbought=70, rsi_oversold=30,
                 sl_multiplier=1.5, tp_multiplier=2.5):
        super().__init__(name, weight, sl_multiplier=sl_multiplier, tp_multiplier=tp_multiplier)
        self.rsi_period     = rsi_period
        self.rsi_overbought = rsi_overbought
        self.rsi_oversold   = rsi_oversold
        self._df = pd.DataFrame()

    def update_data(self, df: pd.DataFrame):
        self._df = df

    def analyze(self, symbol: str) -> Optional[Signal]:
        """Fusionne RSI Extreme + Confirmation MACD + SL/TP ATR-based."""
        if self._df.empty or len(self._df) < 35:  # MACD requiert au moins 26+9 périodes
            return None

        try:
            close_prices = self._df['close']

            # Calcul RSI
            rsi = ta.momentum.rsi(close_prices, window=self.rsi_period)

            # Calcul MACD
            macd_diff = ta.trend.macd_diff(close_prices)  # Histogramme

            current_rsi      = rsi.iloc[-1]
            current_macd_diff = macd_diff.iloc[-1]
            prev_macd_diff    = macd_diff.iloc[-2]

            if pd.isna(current_rsi) or pd.isna(current_macd_diff):
                return None

            # Calculer SL/TP basés sur l'ATR
            pip_size = self.get_pip_size(symbol)
            sl_pips, tp_pips, atr = self.compute_sl_tp_pips(self._df, pip_size)

            # Condition d'Achat (Buy)
            # RSI en survente ET le MACD commence à se retourner à la hausse
            if current_rsi < self.rsi_oversold and current_macd_diff > prev_macd_diff and current_macd_diff < 0:
                logging.info(
                    f"[{self.name}] 🟢 Signal d'achat sur {symbol} (RSI: {current_rsi:.2f}) | "
                    f"ATR={atr:.5f} | SL={sl_pips:.1f}p | TP={tp_pips:.1f}p"
                )
                return Signal(
                    symbol=symbol,
                    direction=OrderType.BUY,
                    confidence=0.75,
                    source=self.name,
                    sl_pips=sl_pips,
                    tp_pips=tp_pips,
                    atr=atr
                )

            # Condition de Vente (Sell)
            # RSI en surachat ET le MACD commence à se retourner à la baisse
            if current_rsi > self.rsi_overbought and current_macd_diff < prev_macd_diff and current_macd_diff > 0:
                logging.info(
                    f"[{self.name}] 🔴 Signal de vente sur {symbol} (RSI: {current_rsi:.2f}) | "
                    f"ATR={atr:.5f} | SL={sl_pips:.1f}p | TP={tp_pips:.1f}p"
                )
                return Signal(
                    symbol=symbol,
                    direction=OrderType.SELL,
                    confidence=0.75,
                    source=self.name,
                    sl_pips=sl_pips,
                    tp_pips=tp_pips,
                    atr=atr
                )

        except Exception as e:
            logging.error(f"[{self.name}] Erreur d'analyse: {e}")

        return None
