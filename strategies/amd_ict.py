import pandas as pd
import numpy as np
import logging
from typing import Optional
from core.interfaces import Signal, OrderType
from strategies.base import StrategyBase

class AMDStrategy(StrategyBase):
    """
    Stratégie basée sur les concepts AMD (Accumulation, Manipulation, Distribution) d'ICT.
    Identifie l'accumulation pendant la session asiatique (00:00 - 08:00 UTC).
    Cherche une manipulation (Sweep de liquidité) lors de l'ouverture de Londres/NY.
    Déclenche un signal de distribution après un rejet (Sweep) et un Market Structure Shift (MSS).
    """
    def __init__(self, name="AMD_ICT", weight=2.5, sl_multiplier=2.0, tp_multiplier=3.0):
        super().__init__(name, weight, sl_multiplier=sl_multiplier, tp_multiplier=tp_multiplier)
        self._df = pd.DataFrame()

    def update_data(self, df: pd.DataFrame):
        self._df = df.copy()

    def analyze(self, symbol: str) -> Optional[Signal]:
        # Nous avons besoin de suffisamment de données pour englober la session asiatique
        # Sur du M5, 8 heures = 96 bougies. Assurons-nous d'avoir au moins 150 bougies.
        if self._df.empty or len(self._df) < 150:
            return None

        try:
            df = self._df
            
            # S'assurer qu'il y a une colonne temporelle
            time_col = None
            if 'time' in df.columns:
                time_col = 'time'
            elif df.index.name == 'time' or isinstance(df.index, pd.DatetimeIndex):
                # Si l'index est le temps, on le reset pour l'avoir en colonne
                df = df.reset_index()
                if 'time' in df.columns:
                    time_col = 'time'
                elif 'index' in df.columns:
                    df = df.rename(columns={'index': 'time'})
                    time_col = 'time'
            
            if not time_col:
                # Impossible de traiter les sessions si on n'a pas l'heure
                return None

            # Convertir en datetime si ce n'est pas fait (MT5 renvoie souvent des timestamp UNIX ou string)
            if not pd.api.types.is_datetime64_any_dtype(df['time']):
                df['time'] = pd.to_datetime(df['time'], unit='s', errors='coerce')
                
            # Travailler sur le dernier jour de trading disponible
            last_time = df['time'].iloc[-1]
            current_date = last_time.date()
            
            # Filtrer les données du jour actuel
            df_today = df[df['time'].dt.date == current_date].copy()
            if df_today.empty:
                return None

            # --- Phase 1 : ACCUMULATION (Session Asiatique 00:00 - 08:00 UTC) ---
            # On extrait la boîte asiatique
            asian_session = df_today[(df_today['time'].dt.hour >= 0) & (df_today['time'].dt.hour < 8)]
            if asian_session.empty:
                return None
                
            asian_high = asian_session['high'].max()
            asian_low = asian_session['low'].min()
            
            # --- Phase 2 : MANIPULATION & DISTRIBUTION ---
            # On regarde les bougies après 08:00 (Londres / NY)
            london_ny_session = df_today[df_today['time'].dt.hour >= 8]
            if london_ny_session.empty:
                return None
                
            # On prend les 5 dernières bougies pour voir si on est EN TRAIN de faire un sweep + MSS
            recent = df_today.tail(6).copy().reset_index(drop=True)
            if len(recent) < 6:
                return None
                
            current_close = recent.iloc[-1]['close']
            
            # Détection d'un Bullish AMD (Manipulation vers le bas, Distribution vers le haut)
            # Condition 1: Le prix est descendu SOUS le plus bas asiatique (Sweep / Manipulation)
            # Condition 2: Le prix est remonté et a clôturé AU DESSUS d'un récent Swing High (MSS)
            
            # Vérifier s'il y a eu une manipulation en dessous du Asian Low dans la session actuelle
            manipulated_low = (london_ny_session['low'] < asian_low).any()
            
            # Détécter un Market Structure Shift (MSS) haussier récent
            # On prend un micro swing high sur les 4 bougies précédentes
            micro_swing_high = recent.iloc[0:4]['high'].max()
            bullish_mss = current_close > micro_swing_high
            
            # Rejet : la bougie actuelle ou précédente a sweepé mais clôture agressivement plus haut
            recent_sweep_low = (recent['low'] < asian_low).any()
            
            pip_size = self.get_pip_size(symbol)
            sl_pips, tp_pips, atr = self.compute_sl_tp_pips(self._df, pip_size)

            if manipulated_low and recent_sweep_low and bullish_mss:
                # AMD BULLISH Confirmé
                logging.debug(f"[{self.name}] 🟢 AMD SETUP DETECTED (Accumulation Sweep Low) sur {symbol} | Asian Low={asian_low}")
                return Signal(
                    symbol=symbol,
                    direction=OrderType.BUY,
                    confidence=0.95,
                    source=self.name,
                    sl_pips=sl_pips,
                    tp_pips=tp_pips,
                    atr=atr
                )

            # Détection d'un Bearish AMD (Manipulation vers le haut, Distribution vers le bas)
            manipulated_high = (london_ny_session['high'] > asian_high).any()
            micro_swing_low = recent.iloc[0:4]['low'].min()
            bearish_mss = current_close < micro_swing_low
            recent_sweep_high = (recent['high'] > asian_high).any()

            if manipulated_high and recent_sweep_high and bearish_mss:
                # AMD BEARISH Confirmé
                logging.debug(f"[{self.name}] 🔴 AMD SETUP DETECTED (Accumulation Sweep High) sur {symbol} | Asian High={asian_high}")
                return Signal(
                    symbol=symbol,
                    direction=OrderType.SELL,
                    confidence=0.95,
                    source=self.name,
                    sl_pips=sl_pips,
                    tp_pips=tp_pips,
                    atr=atr
                )

        except Exception as e:
            logging.error(f"[{self.name}] Erreur AMD : {e}")

        return None
