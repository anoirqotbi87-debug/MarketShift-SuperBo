"""
ml/predictor.py — Filtre ML pour les signaux de trading MarketShift SuperBot

Utilise le modèle entraîné par MLTrainer pour filtrer les signaux techniques.
Si la confidence ML < seuil configuré, le signal est ignoré.
"""

import logging
from typing import Optional, Tuple, TYPE_CHECKING
import numpy as np

try:
    ML_AVAILABLE = True
    import pandas as pd
except ImportError:
    ML_AVAILABLE = False

if TYPE_CHECKING:
    from ml.trainer import MLTrainer
    from core.interfaces import Signal


class MLPredictor:
    """
    Filtre les signaux de trading via le modèle XGBoost entraîné.
    """

    DEFAULT_CONFIDENCE_THRESHOLD = 0.60   # 60% de confidence minimum

    def __init__(self, trainer: 'MLTrainer'):
        self._trainer = trainer
        self._confidence_threshold = self.DEFAULT_CONFIDENCE_THRESHOLD
        logging.info(
            f"[MLPredictor] Initialisé (seuil de confidence: {self._confidence_threshold:.0%})"
        )

    def set_confidence_threshold(self, threshold: float) -> None:
        """Met à jour le seuil de confidence (0.5 - 1.0)."""
        self._confidence_threshold = max(0.5, min(1.0, threshold))
        logging.info(f"[MLPredictor] Seuil mis à jour: {self._confidence_threshold:.0%}")

    def predict(self, df: 'pd.DataFrame') -> Tuple[str, float, dict]:
        """
        Prédit la direction du marché à partir des données OHLCV.

        Args:
            df: DataFrame OHLCV avec au minimum 50 barres

        Returns:
            Tuple[direction, confidence, feature_importances]
            direction: 'BUY', 'SELL', ou 'WAIT'
            confidence: float entre 0 et 1
            feature_importances: dict des importances de features
        """
        if not ML_AVAILABLE or not self._trainer.is_trained:
            return 'WAIT', 0.0, {}

        try:
            model   = self._trainer.model
            scaler  = self._trainer.scaler

            if model is None or scaler is None:
                return 'WAIT', 0.0, {}

            # Construire les features sur les dernières barres
            features = self._build_last_features(df)
            if features is None:
                return 'WAIT', 0.0, {}

            # Normaliser et prédire
            features_scaled = scaler.transform([features])
            proba = model.predict_proba(features_scaled)[0]

            # proba[1] = probabilité de hausse (BUY)
            buy_confidence  = float(proba[1])
            sell_confidence = float(proba[0])

            feature_importances = self._trainer.get_feature_importances()

            if buy_confidence >= self._confidence_threshold:
                logging.info(
                    f"[MLPredictor] ✅ Signal BUY validé (confidence: {buy_confidence:.1%})"
                )
                return 'BUY', buy_confidence, feature_importances

            elif sell_confidence >= self._confidence_threshold:
                logging.info(
                    f"[MLPredictor] ✅ Signal SELL validé (confidence: {sell_confidence:.1%})"
                )
                return 'SELL', sell_confidence, feature_importances

            else:
                logging.debug(
                    f"[MLPredictor] ⏸ WAIT — Buy: {buy_confidence:.1%}, "
                    f"Sell: {sell_confidence:.1%} (seuil: {self._confidence_threshold:.1%})"
                )
                return 'WAIT', max(buy_confidence, sell_confidence), feature_importances

        except Exception as e:
            logging.error(f"[MLPredictor] Erreur de prédiction: {e}")
            return 'WAIT', 0.0, {}

    def filter_signal(self, signal: 'Signal', df: 'pd.DataFrame') -> Optional['Signal']:
        """
        Filtre un signal technique via le modèle ML.

        Args:
            signal: Signal technique de l'Aggregator
            df: DataFrame OHLCV pour le contexte

        Returns:
            Le signal si validé par le ML, None si rejeté.
        """
        if not self._trainer.is_trained:
            logging.debug(
                "[MLPredictor] Modèle non entraîné, signal technique passé sans filtre ML."
            )
            return signal

        direction, confidence, _ = self.predict(df)

        signal_dir = signal.direction.name  # 'BUY' or 'SELL'

        if direction == signal_dir and confidence >= self._confidence_threshold:
            # ML confirme le signal technique
            signal.metadata['ml_confidence'] = confidence
            signal.metadata['ml_validated'] = True
            logging.info(
                f"[MLPredictor] ✅ Signal {signal_dir} confirmé par ML "
                f"(confidence: {confidence:.1%})"
            )
            return signal

        elif direction == 'WAIT' or direction != signal_dir:
            logging.warning(
                f"[MLPredictor] ❌ Signal {signal_dir} REJETÉ par ML "
                f"(ML dit: {direction} @ {confidence:.1%})"
            )
            return None

        return signal

    def _build_last_features(self, df: 'pd.DataFrame') -> Optional[list]:
        """
        Construit le vecteur de features pour la dernière bougie.
        """
        try:
            if len(df) < 30:
                return None

            df = df.copy()

            # EMA diff
            ema9  = df['close'].ewm(span=9,  adjust=False).mean()
            ema21 = df['close'].ewm(span=21, adjust=False).mean()
            ema_diff = float((ema9.iloc[-1] - ema21.iloc[-1]) / df['close'].iloc[-1])

            # RSI 14
            delta = df['close'].diff()
            gain  = delta.clip(lower=0).rolling(14).mean()
            loss  = (-delta.clip(upper=0)).rolling(14).mean()
            rs    = gain / loss.replace(0, 1e-9)
            rsi   = float(100 - (100 / (1 + rs)).iloc[-1])

            # MACD hist
            ema12 = df['close'].ewm(span=12, adjust=False).mean()
            ema26 = df['close'].ewm(span=26, adjust=False).mean()
            macd  = ema12 - ema26
            sig   = macd.ewm(span=9, adjust=False).mean()
            macd_hist = float((macd.iloc[-1] - sig.iloc[-1]) / df['close'].iloc[-1])

            # ATR norm
            tr = pd.concat([
                df['high'] - df['low'],
                (df['high'] - df['close'].shift()).abs(),
                (df['low']  - df['close'].shift()).abs()
            ], axis=1).max(axis=1)
            atr_norm = float(tr.rolling(14).mean().iloc[-1] / df['close'].iloc[-1])

            # Volume relatif
            vol_col = 'tick_volume' if 'tick_volume' in df.columns else 'volume' if 'volume' in df.columns else None
            if vol_col:
                vol_ma = df[vol_col].rolling(20).mean().iloc[-1]
                vol_rel = float(df[vol_col].iloc[-1] / vol_ma) if vol_ma > 0 else 1.0
            else:
                vol_rel = 1.0

            # Heure
            if 'time' in df.columns:
                try:
                    hour = pd.to_datetime(df['time'].iloc[-1]).hour
                    hour_sin = float(np.sin(2 * np.pi * hour / 24))
                    hour_cos = float(np.cos(2 * np.pi * hour / 24))
                except Exception:
                    hour_sin, hour_cos = 0.0, 1.0
            else:
                hour_sin, hour_cos = 0.0, 1.0

            # Retours
            close = df['close']
            ret_1 = float(close.pct_change(1).iloc[-1])
            ret_3 = float(close.pct_change(3).iloc[-1])
            ret_5 = float(close.pct_change(5).iloc[-1])

            return [ema_diff, rsi, macd_hist, atr_norm, vol_rel,
                    hour_sin, hour_cos, ret_1, ret_3, ret_5]

        except Exception as e:
            logging.error(f"[MLPredictor] Erreur construction features: {e}")
            return None

    @property
    def confidence_threshold(self) -> float:
        return self._confidence_threshold
