"""
tests/test_palier_c1_contract.py — Validation unitaire du Contrat ML Palier C (Jalon C1)

Scénarios couverts :
1. Modèle non entraîné (is_trained=False) -> Rejet Fail-Closed (aucun bypass).
2. Poids manquants ou scaler absent -> Rejet Fail-Closed.
3. Données d'entrée corrompues (None, df vide, < 10 barres) -> Rejet Fail-Closed.
4. Présence de valeurs non finies (NaN, Inf) dans les features -> Rejet Fail-Closed.
5. Probabilités de sortie corrompues (NaN, Inf, hors [0, 1]) -> Rejet Fail-Closed.
6. Accord directionnel nominal BUY (confiance >= 0.58) -> Signal validé.
7. Accord directionnel nominal SELL (sell_confidence >= 0.58) -> Signal validé.
8. Zone d'incertitude prédictive (< 0.58, ex. 0.50, 0.52, 0.55) -> Rejet Fail-Closed.
9. Veto directionnel (Signal BUY vs IA SELL) -> Rejet Fail-Closed.
10. Mode monocible (XGBoost seul) sous environnement Python 3.14 -> Documenté et validé.
11. Invariance stricte : Zéro ordre broker émis, aucune écriture SQLite.
"""

import math
import pytest
import pandas as pd
import numpy as np
from unittest.mock import MagicMock, patch

from core.interfaces import Signal, OrderType
from ml.predictor import MLPredictor, ML_AVAILABLE, TORCH_AVAILABLE


@pytest.fixture
def dummy_signal_buy():
    return Signal(
        symbol="EURUSD",
        direction=OrderType.BUY,
        price=1.0850,
        sl_pips=15.0,
        tp_pips=30.0,
        confidence=0.85,
        source="Strategy_Test",
        metadata={}
    )


@pytest.fixture
def dummy_signal_sell():
    return Signal(
        symbol="EURUSD",
        direction=OrderType.SELL,
        price=1.0850,
        sl_pips=15.0,
        tp_pips=30.0,
        confidence=0.85,
        source="Strategy_Test",
        metadata={}
    )


@pytest.fixture
def valid_ohlcv_df():
    """Génère 50 barres OHLCV valides."""
    n = 50
    dates = pd.date_range("2026-01-01", periods=n, freq="15min")
    close = np.linspace(1.0800, 1.0850, n)
    return pd.DataFrame({
        "time": dates,
        "open": close - 0.0005,
        "high": close + 0.0010,
        "low": close - 0.0010,
        "close": close,
        "tick_volume": [500] * n
    })


@pytest.fixture
def mock_trainer():
    """Mock d'un MLTrainer configuré avec 12 features standard."""
    trainer = MagicMock()
    trainer.is_trained = True
    trainer.FEATURE_COLUMNS = [
        "ema_diff", "rsi", "macd_hist", "atr_norm", "volume_rel",
        "hour_sin", "hour_cos", "ret_1", "ret_3", "ret_5", "adx", "bb_width"
    ]
    trainer.scaler = MagicMock()
    trainer.scaler.transform = lambda x: np.array(x, dtype=float)
    trainer.xgb_model = MagicMock()
    trainer.lstm_model = None  # Mode dégradé monocible par défaut
    trainer.get_feature_importances = MagicMock(return_value={"rsi": 0.3, "ema_diff": 0.7})

    def fake_build_features(df):
        out = df.copy()
        for col in trainer.FEATURE_COLUMNS:
            out[col] = 1.0
        return out

    trainer._build_features = fake_build_features
    return trainer


# =========================================================================
# TEST 1 : Fail-Closed lorsque le modèle n'est pas entraîné
# =========================================================================
def test_c1_fail_closed_when_not_trained(mock_trainer, dummy_signal_buy, valid_ohlcv_df):
    """Vérifie que l'ancien bug Fail-Open (bypassed signal) est éradiqué."""
    mock_trainer.is_trained = False
    predictor = MLPredictor(mock_trainer)

    result = predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df)

    assert result is None, "FAIL : Un modèle non entraîné doit rejeter le signal (Fail-Closed) !"


# =========================================================================
# TEST 2 : Fail-Closed en cas de poids de modèle ou scaler manquants
# =========================================================================
def test_c1_fail_closed_when_weights_missing(mock_trainer, dummy_signal_buy, valid_ohlcv_df):
    mock_trainer.is_trained = True
    mock_trainer.xgb_model = None
    predictor = MLPredictor(mock_trainer)

    result = predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df)
    assert result is None, "FAIL : xgb_model=None doit rejeter le signal !"

    mock_trainer.xgb_model = MagicMock()
    mock_trainer.scaler = None
    result2 = predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df)
    assert result2 is None, "FAIL : scaler=None doit rejeter le signal !"


# =========================================================================
# TEST 3 : Données d'entrée invalides (None, DataFrame vide, < 10 barres)
# =========================================================================
def test_c1_fail_closed_on_invalid_input_data(mock_trainer, dummy_signal_buy):
    mock_trainer.is_trained = True
    predictor = MLPredictor(mock_trainer)

    # DataFrame None
    assert predictor.filter_signal(dummy_signal_buy, None) is None
    # Signal None
    assert predictor.filter_signal(None, pd.DataFrame()) is None
    # DataFrame vide
    assert predictor.filter_signal(dummy_signal_buy, pd.DataFrame()) is None
    # DataFrame insuffisant (< 10 barres)
    short_df = pd.DataFrame({"open": [1.0]*5, "close": [1.0]*5})
    assert predictor.filter_signal(dummy_signal_buy, short_df) is None


# =========================================================================
# TEST 4 : Présence de valeurs non finies (NaN / Inf) dans les features
# =========================================================================
def test_c1_fail_closed_on_nan_and_inf_features(mock_trainer, dummy_signal_buy, valid_ohlcv_df):
    mock_trainer.is_trained = True
    predictor = MLPredictor(mock_trainer)

    # Injection de NaN
    def build_features_with_nan(df):
        out = df.copy()
        for col in mock_trainer.FEATURE_COLUMNS:
            out[col] = 1.0
        out.loc[out.index[-1], "rsi"] = np.nan
        return out

    mock_trainer._build_features = build_features_with_nan
    assert predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df) is None, "FAIL : NaN dans les features doit être rejeté !"

    # Injection de +Inf
    def build_features_with_inf(df):
        out = df.copy()
        for col in mock_trainer.FEATURE_COLUMNS:
            out[col] = 1.0
        out.loc[out.index[-1], "rsi"] = np.inf
        return out

    mock_trainer._build_features = build_features_with_inf
    assert predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df) is None, "FAIL : Inf dans les features doit être rejeté !"


# =========================================================================
# TEST 5 : Probabilités de sortie corrompues ou non finies
# =========================================================================
def test_c1_fail_closed_on_corrupted_model_probabilities(mock_trainer, dummy_signal_buy, valid_ohlcv_df):
    mock_trainer.is_trained = True
    predictor = MLPredictor(mock_trainer)

    # Proba NaN
    mock_trainer.xgb_model.predict_proba.return_value = np.array([[np.nan, np.nan]])
    assert predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df) is None, "FAIL : Proba NaN doit être rejetée !"

    # Proba hors [0, 1]
    mock_trainer.xgb_model.predict_proba.return_value = np.array([[-0.2, 1.2]])
    assert predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df) is None, "FAIL : Proba hors bornes [0, 1] doit être rejetée !"

    # Proba non numérique
    mock_trainer.xgb_model.predict_proba.return_value = np.array([["bad", "val"]])
    assert predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df) is None, "FAIL : Proba chaîne de caractères doit être rejetée !"


# =========================================================================
# TEST 6 : Accord directionnel nominal BUY (confiance >= 0.58)
# =========================================================================
def test_c1_nominal_buy_acceptance(mock_trainer, dummy_signal_buy, valid_ohlcv_df):
    mock_trainer.is_trained = True
    # XGBoost prédit [P(SELL)=0.30, P(BUY)=0.70] -> BUY avec 70% >= 58%
    mock_trainer.xgb_model.predict_proba.return_value = np.array([[0.30, 0.70]])
    predictor = MLPredictor(mock_trainer)

    result = predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df)

    assert result is not None, "Le signal BUY à 70% doit être accepté !"
    assert result.metadata["ml_validated"] is True
    assert pytest.approx(result.metadata["ml_confidence"], 0.001) == 0.70
    assert result.metadata["ml_engine_mode"] == "XGBOOST_ONLY"


# =========================================================================
# TEST 7 : Accord directionnel nominal SELL (sell_confidence >= 0.58)
# =========================================================================
def test_c1_nominal_sell_acceptance(mock_trainer, dummy_signal_sell, valid_ohlcv_df):
    mock_trainer.is_trained = True
    # XGBoost prédit [P(SELL)=0.75, P(BUY)=0.25] -> SELL avec 75% >= 58% (P(BUY) <= 0.42)
    mock_trainer.xgb_model.predict_proba.return_value = np.array([[0.75, 0.25]])
    predictor = MLPredictor(mock_trainer)

    result = predictor.filter_signal(dummy_signal_sell, valid_ohlcv_df)

    assert result is not None, "Le signal SELL à 75% doit être accepté !"
    assert result.metadata["ml_validated"] is True
    assert pytest.approx(result.metadata["ml_confidence"], 0.001) == 0.75


# =========================================================================
# TEST 8 : Zone d'incertitude prédictive (< 0.58) -> Rejet Fail-Closed
# =========================================================================
@pytest.mark.parametrize("p_sell, p_buy", [
    (0.50, 0.50),  # Incertitude totale 50/50
    (0.48, 0.52),  # Légère tendance haussière mais < 58%
    (0.45, 0.55),  # 55% < 58%
    (0.43, 0.57),  # 57% < 58%
])
def test_c1_rejection_in_uncertainty_zone(mock_trainer, dummy_signal_buy, valid_ohlcv_df, p_sell, p_buy):
    mock_trainer.is_trained = True
    mock_trainer.xgb_model.predict_proba.return_value = np.array([[p_sell, p_buy]])
    predictor = MLPredictor(mock_trainer)

    result = predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df)

    assert result is None, f"FAIL : BUY avec proba {p_buy:.1%} (< 58%) DOIT être rejeté !"


# =========================================================================
# TEST 9 : Veto directionnel (Signal BUY vs IA SELL)
# =========================================================================
def test_c1_veto_directional_divergence(mock_trainer, dummy_signal_buy, valid_ohlcv_df):
    mock_trainer.is_trained = True
    # L'IA prédit SELL avec 80% de confiance
    mock_trainer.xgb_model.predict_proba.return_value = np.array([[0.80, 0.20]])
    predictor = MLPredictor(mock_trainer)

    result = predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df)

    assert result is None, "FAIL : Signal BUY alors que l'IA prédit SELL doit être VETO !"


# =========================================================================
# TEST 10 : Invariance Broker et Risque (Zéro appel broker, zéro SQLite)
# =========================================================================
def test_c1_zero_broker_calls_and_zero_sqlite_writes(mock_trainer, dummy_signal_buy, valid_ohlcv_df):
    """Vérifie qu'aucune méthode broker ou d'écriture DB n'est appelée par le filtre ML."""
    mock_trainer.is_trained = True
    mock_trainer.xgb_model.predict_proba.return_value = np.array([[0.30, 0.70]])
    predictor = MLPredictor(mock_trainer)

    with patch("infrastructure.broker_router.BrokerRouter") as mock_router, \
         patch("sqlite3.connect") as mock_sqlite:
        
        result = predictor.filter_signal(dummy_signal_buy, valid_ohlcv_df)

        assert result is not None
        mock_router.execute_order.assert_not_called()
        mock_sqlite.assert_not_called()
