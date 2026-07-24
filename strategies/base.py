from abc import ABC, abstractmethod
from typing import Optional, Tuple
import logging

try:
    import pandas as pd
    import numpy as np
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False

from core.interfaces import Signal, IStrategy


class StrategyBase(IStrategy):
    """
    Classe de base pour toutes les stratégies de MarketShift SuperBot.
    Fournit les méthodes utilitaires communes : ATR, SL/TP.
    """

    # Multiplicateurs ATR par défaut (surchargeables par chaque stratégie)
    DEFAULT_ATR_PERIOD    = 14
    DEFAULT_SL_MULTIPLIER = 1.5   # SL = 1.5 × ATR
    DEFAULT_TP_MULTIPLIER = 2.5   # TP = 2.5 × ATR  (R:R = 1.67)

    def __init__(self, name: str, weight: float = 1.0,
                 sl_multiplier: float = DEFAULT_SL_MULTIPLIER,
                 tp_multiplier: float = DEFAULT_TP_MULTIPLIER):
        self.name = name
        self.weight = weight
        self.sl_multiplier = sl_multiplier
        self.tp_multiplier = tp_multiplier
        self._df = None  # DataFrame OHLCV courant, mis à jour par update_data()

    def update_data(self, df) -> None:
        """Stocke les nouvelles données OHLCV."""
        self._df = df

    @abstractmethod
    def analyze(self, symbol: str) -> Optional[Signal]:
        """Analyse le symbole et retourne un Signal (ou None s'il n'y a pas d'opportunité)."""
        pass

    # ─────────────────────────────────────────────────────────────────────────
    # Utilitaires ATR & SL/TP
    # ─────────────────────────────────────────────────────────────────────────

    def compute_atr(self, df, period: int = DEFAULT_ATR_PERIOD) -> float:
        """
        Calcule l'Average True Range (ATR) sur les N dernières barres.

        Returns:
            float: Valeur ATR courante (en prix, ex: 0.00125 pour EURUSD)
        """
        if not PANDAS_AVAILABLE or df is None or len(df) < period + 1:
            return 0.0

        try:
            high  = df['high']
            low   = df['low']
            close = df['close']

            tr = pd.concat([
                high - low,
                (high - close.shift()).abs(),
                (low  - close.shift()).abs()
            ], axis=1).max(axis=1)

            atr = float(tr.rolling(period).mean().iloc[-1])
            return atr if not (atr != atr) else 0.0  # NaN check

        except Exception as e:
            logging.error(f"[{self.name}] Erreur calcul ATR: {e}")
            return 0.0

    def compute_sl_tp_pips(self, df, pip_size: float = 0.0001,
                           period: int = DEFAULT_ATR_PERIOD) -> Tuple[float, float, float]:
        """
        Calcule les SL et TP en pips basés sur l'ATR.

        Args:
            df: DataFrame OHLCV
            pip_size: Taille d'un pip (0.0001 pour EUR/USD, 0.01 pour USD/JPY, 0.1 pour XAU/USD)
            period: Période ATR

        Returns:
            Tuple[sl_pips, tp_pips, atr_value]
        """
        atr = self.compute_atr(df, period)

        if atr <= 0 or pip_size <= 0:
            # Valeurs par défaut si ATR indisponible
            return 20.0, 35.0, 0.0

        sl_pips = round((atr * self.sl_multiplier) / pip_size, 1)
        tp_pips = round((atr * self.tp_multiplier) / pip_size, 1)

        # Limites de sécurité
        sl_pips = max(5.0, min(sl_pips, 200.0))
        tp_pips = max(8.0, min(tp_pips, 400.0))

        return sl_pips, tp_pips, atr

    @staticmethod
    def get_pip_size(symbol: str) -> float:
        """Retourne la taille d'un pip selon le symbole.
        Gère les suffixes broker XM (#) et noms alternatifs (GOLD# = Or).
        """
        # Normaliser : supprimer # et suffixes broker
        s = symbol.upper().replace('#', '').replace('.', '')
        if 'JPY' in s:
            return 0.01     # Paires JPY
        elif 'XAU' in s or s == 'GOLD':
            return 0.1      # Or (XAUUSD ou GOLD#)
        elif 'XAG' in s or s == 'SILVER':
            return 0.001    # Argent
        elif 'BTC' in s or 'ETH' in s:
            return 1.0      # Crypto
        else:
            return 0.0001   # Forex standard (EUR/USD, GBP/USD, etc.)
