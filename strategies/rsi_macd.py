import pandas as pd
import ta
import logging
from typing import Optional
from core.interfaces import Signal, OrderType
from strategies.base import StrategyBase


class RsiMacdStrategy(StrategyBase):
    def __init__(self, name="RSI_MACD", weight=1.5, rsi_period=14,
                 rsi_overbought=70, rsi_oversold=30,
                 sl_multiplier=2.0, tp_multiplier=3.0):
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

            current_rsi       = rsi.iloc[-1]
            prev_rsi          = rsi.iloc[-2]
            current_macd_diff = macd_diff.iloc[-1]
            prev_macd_diff    = macd_diff.iloc[-2]

            if pd.isna(current_rsi) or pd.isna(current_macd_diff):
                return None

            # --- Filtre de Tendance Macro (HTF Proxy via EMA 200) ---
            macro_trend_bullish = True
            macro_trend_bearish = True
            if len(self._df) >= 200:
                ema_200 = self._df['close'].ewm(span=200, adjust=False).mean().iloc[-1]
                macro_trend_bullish = close_prices.iloc[-1] > ema_200
                macro_trend_bearish = close_prices.iloc[-1] < ema_200

            # --- NOUVEAU : Filtre de Régime de Marché (ADX) ---
            # Si l'ADX > 25, le marché est en tendance forte. Le RSI (retour à la moyenne) perd en fiabilité.
            try:
                adx_series = ta.trend.adx(self._df['high'], self._df['low'], self._df['close'], window=14)
                current_adx = adx_series.iloc[-1]
            except Exception:
                current_adx = 20.0 # Default to range if error

            # Calculer SL/TP basés sur l'ATR
            pip_size = self.get_pip_size(symbol)
            sl_pips, tp_pips, atr = self.compute_sl_tp_pips(self._df, pip_size)

            # --- Régime Multiplier ---
            # Réduit la confiance de 50% si le marché est en forte tendance (ADX > 25)
            regime_multiplier = 0.5 if current_adx > 25 else 1.0

            # Condition d'Achat (Buy)
            # 1. Tendance macro haussière
            # 2. RSI en hausse mais pas encore suracheté
            # 3. MACD s'incurve à la hausse
            buy_rsi_bounce = current_rsi > prev_rsi and current_rsi < 55
            if macro_trend_bullish and buy_rsi_bounce and current_macd_diff > prev_macd_diff:
                logging.debug(
                    f"[{self.name}] 🟢 Signal d'achat sur {symbol} (RSI rebond: {prev_rsi:.1f}->{current_rsi:.1f}) | ADX={current_adx:.1f} | "
                    f"ATR={atr:.5f} | SL={sl_pips:.1f}p | TP={tp_pips:.1f}p"
                )
                return Signal(
                    symbol=symbol,
                    direction=OrderType.BUY,
                    confidence=0.8 * regime_multiplier,
                    source=self.name,
                    sl_pips=sl_pips,
                    tp_pips=tp_pips,
                    atr=atr
                )

            # Condition de Vente (Sell)
            # 1. Tendance macro baissière
            # 2. RSI en baisse mais pas encore survendu
            # 3. MACD s'incurve à la baisse
            sell_rsi_bounce = current_rsi < prev_rsi and current_rsi > 45
            if macro_trend_bearish and sell_rsi_bounce and current_macd_diff < prev_macd_diff:
                logging.debug(
                    f"[{self.name}] 🔴 Signal de vente sur {symbol} (RSI: {current_rsi:.2f}) | ADX={current_adx:.1f} | "
                    f"ATR={atr:.5f} | SL={sl_pips:.1f}p | TP={tp_pips:.1f}p"
                )
                return Signal(
                    symbol=symbol,
                    direction=OrderType.SELL,
                    confidence=0.75 * regime_multiplier,
                    source=self.name,
                    sl_pips=sl_pips,
                    tp_pips=tp_pips,
                    atr=atr
                )

        except Exception as e:
            logging.error(f"[{self.name}] Erreur d'analyse: {e}")

        return None
