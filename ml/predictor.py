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
    import torch
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
            xgb_model = self._trainer.xgb_model
            lstm_model = self._trainer.lstm_model
            scaler  = self._trainer.scaler

            if xgb_model is None or lstm_model is None or scaler is None:
                return 'WAIT', 0.0, {}

            # Construire toutes les features pour le df
            processed_df = self._trainer._build_features(df)
            if processed_df is None or len(processed_df) < 10:
                return 'WAIT', 0.0, {}

            # Prendre les 10 dernières barres pour le LSTM
            last_10 = processed_df[self._trainer.FEATURE_COLUMNS].values[-10:]
            
            # Normaliser
            last_10_scaled = scaler.transform(last_10)
            
            # Prédiction XGBoost (sur la toute dernière barre)
            xgb_proba = xgb_model.predict_proba([last_10_scaled[-1]])[0]
            xgb_buy_conf = float(xgb_proba[1])
            xgb_sell_conf = float(xgb_proba[0])

            # Prédiction LSTM (sur la séquence des 10 dernières barres)
            seq_tensor = torch.tensor([last_10_scaled], dtype=torch.float32)
            lstm_model.eval()
            with torch.no_grad():
                lstm_out = lstm_model(seq_tensor).item()
            
            lstm_buy_conf = lstm_out
            lstm_sell_conf = 1.0 - lstm_out

            # ENSEMBLE CONSENSUS (Moyenne pondérée: 60% XGB, 40% LSTM)
            buy_confidence = (xgb_buy_conf * 0.6) + (lstm_buy_conf * 0.4)
            sell_confidence = (xgb_sell_conf * 0.6) + (lstm_sell_conf * 0.4)

            feature_importances = self._trainer.get_feature_importances()

            if buy_confidence >= self._confidence_threshold:
                logging.info(
                    f"[MLPredictor] ✅ Signal BUY validé (Ensemble: {buy_confidence:.1%} | XGB:{xgb_buy_conf:.1%} LSTM:{lstm_buy_conf:.1%})"
                )
                return 'BUY', buy_confidence, feature_importances

            elif sell_confidence >= self._confidence_threshold:
                logging.info(
                    f"[MLPredictor] ✅ Signal SELL validé (Ensemble: {sell_confidence:.1%} | XGB:{xgb_sell_conf:.1%} LSTM:{lstm_sell_conf:.1%})"
                )
                return 'SELL', sell_confidence, feature_importances

            else:
                logging.debug(
                    f"[MLPredictor] ⏸ WAIT — Buy: {buy_confidence:.1%}, Sell: {sell_confidence:.1%} (seuil: {self._confidence_threshold:.1%})"
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
                f"[MLPredictor] ✅ Signal {signal_dir} sur {signal.symbol} confirmé par ML "
                f"(confidence: {confidence:.1%})"
            )
            return signal

        elif direction == 'WAIT' or direction != signal_dir:
            logging.warning(
                f"[MLPredictor] ❌ Signal {signal_dir} sur {signal.symbol} REJETÉ par ML "
                f"(ML dit: {direction} @ {confidence:.1%})"
            )
            return None

        return signal



    @property
    def confidence_threshold(self) -> float:
        return self._confidence_threshold
