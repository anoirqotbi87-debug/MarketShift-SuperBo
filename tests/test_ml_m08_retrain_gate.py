"""
test_ml_m08_retrain_gate.py — Tests unitaires pour M-08 : Garde-fous sur le ré-entraînement ML (Retrain Gate)
"""
import pytest
import os
import json
import pandas as pd
import numpy as np
from unittest.mock import MagicMock, patch
from infrastructure.config import Config
from ml.trainer import MLTrainer, MODEL_DIR

@pytest.fixture
def dummy_ohlcv_df():
    """Génère un DataFrame OHLCV factice pour tester les étapes du trainer."""
    n = 200
    dates = pd.date_range("2026-01-01", periods=n, freq="15min")
    close = np.linspace(1.08, 1.09, n) + np.random.normal(0, 0.001, n)
    high = close + 0.0005
    low = close - 0.0005
    open_ = close - 0.0001
    vol = np.random.randint(100, 1000, n)
    
    return pd.DataFrame({
        "time": dates,
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "tick_volume": vol
    })

def test_retrain_rejected_on_insufficient_samples(dummy_ohlcv_df):
    trainer = MLTrainer()
    trainer._accuracy = 0.60
    initial_acc = trainer._accuracy

    with patch.object(Config, "ML_MIN_SAMPLES", 1000):
        with patch("ml.trainer.telegram_notifier") as mock_notifier:
            # dummy_ohlcv_df n'a que 200 lignes (< 1000)
            res = trainer.train(dummy_ohlcv_df)

            assert res is False
            assert trainer._accuracy == initial_acc
            mock_notifier.notify_critical_event.assert_called_once()
            args, kwargs = mock_notifier.notify_critical_event.call_args
            assert args[0] == "ML_RETRAIN_REJECTED"
            assert "Volume insuffisant" in kwargs.get("reason", "")

def test_retrain_rejected_on_low_accuracy(dummy_ohlcv_df):
    trainer = MLTrainer()
    trainer._accuracy = 0.60
    initial_acc = trainer._accuracy

    # On autorise le sample count mais l'accuracy sera sous le seuil
    with patch.object(Config, "ML_MIN_SAMPLES", 50):
        with patch.object(Config, "ML_MIN_ACCURACY", 0.55):
            with patch("ml.trainer.telegram_notifier") as mock_notifier:
                with patch("ml.trainer.GridSearchCV") as mock_grid:
                    # Mock de l'estimateur retourné
                    mock_estimator = MagicMock()
                    mock_estimator.predict.return_value = np.zeros(20)
                    mock_grid.return_value.best_estimator_ = mock_estimator
                    mock_grid.return_value.best_params_ = {}

                    # Mock de accuracy_score à 0.48 (< 0.55)
                    with patch("ml.trainer.accuracy_score", return_value=0.48):
                        res = trainer.train(dummy_ohlcv_df)

                        assert res is False
                        assert trainer._accuracy == initial_acc
                        mock_notifier.notify_critical_event.assert_called_once()
                        args, kwargs = mock_notifier.notify_critical_event.call_args
                        assert args[0] == "ML_RETRAIN_REJECTED"
                        assert "Accuracy insuffisante" in kwargs.get("reason", "")

def test_retrain_accepted_when_gates_pass(dummy_ohlcv_df, tmp_path):
    trainer = MLTrainer()
    trainer._accuracy = 0.50

    with patch.object(Config, "ML_MIN_SAMPLES", 50):
        with patch.object(Config, "ML_MIN_ACCURACY", 0.55):
            with patch("ml.trainer.telegram_notifier") as mock_notifier:
                with patch("ml.trainer.GridSearchCV") as mock_grid:
                    mock_estimator = MagicMock()
                    mock_estimator.predict.return_value = np.zeros(20)
                    mock_grid.return_value.best_estimator_ = mock_estimator
                    mock_grid.return_value.best_params_ = {}

                    with patch("ml.trainer.accuracy_score", return_value=0.64):
                        with patch("ml.trainer.confusion_matrix", return_value=np.array([[10, 2], [3, 5]])):
                            with patch("ml.trainer.joblib.dump"):
                                with patch("ml.trainer.MODEL_DIR", str(tmp_path)):
                                    res = trainer.train(dummy_ohlcv_df)

                                    assert res is True
                                    assert trainer._accuracy == 0.64
                                    assert trainer._is_trained is True

                                    # Vérification du fichier meta généré
                                    meta_file = tmp_path / "model_meta.json"
                                    assert meta_file.exists()
                                    meta_data = json.loads(meta_file.read_text())
                                    assert meta_data["accuracy"] == 0.64
                                    assert meta_data["confusion_matrix"] == [[10, 2], [3, 5]]
                                    assert meta_data["min_accuracy_threshold"] == 0.55

                                    mock_notifier.notify_critical_event.assert_called_once()
                                    args, kwargs = mock_notifier.notify_critical_event.call_args
                                    assert args[0] == "ML_RETRAIN_SUCCESS"
