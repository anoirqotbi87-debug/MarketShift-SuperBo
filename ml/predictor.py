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
    Filtre les signaux de trading via le modèle entraîné (ensemble XGBoost + LSTM).
    """

    # Seuil par défaut calibré sur l'accuracy globale du modèle (~62.7%).
    # Surchargeable via env: ML_CONFIDENCE_THRESHOLD (global) ou
    # ML_CONFIDENCE_THRESHOLD_<SYMBOL> (par symbole, ex: ML_CONFIDENCE_THRESHOLD_EURUSD=0.55).
    DEFAULT_CONFIDENCE_THRESHOLD = 0.58

    def __init__(self, trainer: 'MLTrainer'):
        from infrastructure.config import Config
        self._trainer = trainer
        self._confidence_threshold = float(Config.ML_CONFIDENCE_THRESHOLD)
        logging.info(
            f"[MLPredictor] Initialisé (seuil de confidence global: {self._confidence_threshold:.0%})"
        )

    def set_confidence_threshold(self, threshold: float) -> None:
        """Met à jour le seuil de confidence (0.5 - 1.0) global en runtime."""
        self._confidence_threshold = max(0.5, min(1.0, threshold))
        logging.info(f"[MLPredictor] Seuil global mis à jour: {self._confidence_threshold:.0%}")

    def _effective_threshold(self, symbol: str) -> float:
        """
        Seuil effectif pour un symbole: override env par symbole (le cas échéant),
        sinon seuil global (Config à l'init ou valeur runtime via set_confidence_threshold).
        """
        import os
        env_val = os.getenv(f"ML_CONFIDENCE_THRESHOLD_{symbol}")
        if env_val is not None:
            try:
                return float(env_val)
            except ValueError:
                logging.warning(f"[MLPredictor] ML_CONFIDENCE_THRESHOLD_{symbol} invalide: {env_val!r}")
        return self._confidence_threshold

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
            seq_tensor = torch.tensor(np.array([last_10_scaled]), dtype=torch.float32)
            lstm_model.eval()
            with torch.no_grad():
                lstm_out = lstm_model(seq_tensor).item()
            
            lstm_buy_conf = lstm_out
            lstm_sell_conf = 1.0 - lstm_out

            # ENSEMBLE CONSENSUS (Moyenne pondérée: 60% XGB, 40% LSTM)
            buy_confidence = (xgb_buy_conf * 0.6) + (lstm_buy_conf * 0.4)
            sell_confidence = (xgb_sell_conf * 0.6) + (lstm_sell_conf * 0.4)

            feature_importances = self._trainer.get_feature_importances()
            
            # Retourner toujours la direction dominante et sa confiance
            if buy_confidence >= sell_confidence:
                return 'BUY', buy_confidence, feature_importances
            else:
                return 'SELL', sell_confidence, feature_importances

        except Exception as e:
            logging.error(f"[MLPredictor] Erreur de prédiction: {e}")
            return 'WAIT', 0.0, {}

    def filter_signal(self, signal: 'Signal', df: 'pd.DataFrame') -> Optional['Signal']:
        """
        Filtre un signal technique via le modèle ML.
        Le ML agit comme un Validateur Strict (Veto Positif).
        """
        if not self._trainer.is_trained:
            logging.debug(
                "[MLPredictor] Modèle non entraîné, signal technique passé sans filtre ML."
            )
            return signal

        confidence_threshold = self._effective_threshold(signal.symbol)

        direction, confidence, _ = self.predict(df)
        signal_dir = signal.direction.name  # 'BUY' or 'SELL'

        # Log de traçabilité systématique (clé du diagnostic)
        logging.debug(
            f"[MLPredictor] [{signal.symbol}] Signal {signal_dir} | "
            f"IA→{direction} @ {confidence:.1%} | seuil={confidence_threshold:.1%} | "
            f"accord={'OUI' if direction == signal_dir else 'NON ⛔'}"
        )

        if direction == signal_dir:
            if confidence >= confidence_threshold:
                # Accord total et haute confiance
                signal.metadata['ml_confidence'] = confidence
                signal.metadata['ml_validated'] = True
                logging.info(
                    f"[MLPredictor] ✅ Signal {signal_dir} sur {signal.symbol} validé par ML "
                    f"(haute confiance: {confidence:.1%} >= {confidence_threshold:.1%})"
                )
                return signal
            elif confidence >= 0.52: # L'IA penche dans le même sens, mais pas "High Confidence"
                # On laisse passer car l'IA est d'accord sur la tendance (> 52%)
                signal.metadata['ml_confidence'] = confidence
                signal.metadata['ml_validated'] = False
                logging.info(
                    f"[MLPredictor] ⚖️ Signal {signal_dir} autorisé. L'IA est d'accord mais confiance modérée ({confidence:.1%} < {confidence_threshold:.1%})."
                )
                return signal
            else:
                # Confiance trop faible même si la direction mathématique correspond (proche 50/50)
                logging.warning(
                    f"[MLPredictor] 🚫 Signal {signal_dir} REJETÉ. L'IA est trop indécise ({confidence:.1%} < 52%)."
                )
                return None
        else:
            # L'IA pointe dans la direction OPPOSÉE (VETO)
            logging.warning(
                f"[MLPredictor] 🚫 VETO ML : Signal {signal_dir} sur {signal.symbol} REJETÉ "
                f"(L'IA veut {direction} à {confidence:.1%})"
            )
            return None

    @property
    def confidence_threshold(self) -> float:
        return self._confidence_threshold
