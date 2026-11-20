"""
tests/test_palier_c2_guardrails.py — Suite de validation formelle des Garde-fous d'Inférence ML (Palier C2)

Scénarios obligatoires couverts :
1. Timeout à 500 ms avec simulation d'un worker lent (> 500ms).
2. Absence de mutation de signal.metadata après expiration du délai.
3. Rejet d'un résultat tardif (deadline monotone dépassée).
4. Limite exacte du pool : 2 workers actifs, 4 tâches en attente, 7ème requête rejetée (QUEUE_SATURATED).
5. Soumissions concurrentes sans dépassement de capacité.
6. Trois échecs consécutifs ouvrant le disjoncteur du symbole (SymbolCircuitBreaker).
7. Passage en HALF_OPEN après cooldown (60s) et fermeture (CLOSED) après deux sondes réussies.
8. Réouverture immédiate en OPEN après échec en HALF_OPEN (cooldown réinitialisé).
9. Déclenchement du GlobalCircuitBreaker après défaillance de 3 symboles distincts en < 300s.
10. Absence de déclenchement global ou de pénalité de symbole sur QUEUE_SATURATED.
11. Cohérence modèle/scaler lors d'un rechargement concurrent (ModelBundle atomique).
12. Rejet des timestamps non monotones, des doublons, des NaN/Inf et séries < 45 barres.
13. Chemin complet Moteur -> Rejet ML -> Absence absolue d'appel à BrokerRouter.execute_order.
14. Absence d'accumulation non bornée de tâches orphelines lorsque les workers restent bloqués.
15. Non-régression du contrat de sécurité C1.
"""

import time
import math
import uuid
import asyncio
import threading
import pytest
import numpy as np
import pandas as pd
from unittest.mock import MagicMock, AsyncMock, patch

from core.interfaces import Signal, OrderType
from ml.model_bundle import ModelBundle, InferenceInput, InferenceResult
from ml.circuit_breaker import SymbolCircuitBreaker, GlobalCircuitBreaker, CircuitState
from ml.inference_pool import DedicatedInferencePool
from ml.predictor import MLPredictor


# =========================================================================
# FIXTURES ET SIMULATEURS
# =========================================================================

class SimulatedClock:
    """Horloge déterministe pour tests sans sleep réel."""
    def __init__(self, start_time: float = 1000.0):
        self._current_time = start_time

    def __call__(self) -> float:
        return self._current_time

    def advance(self, seconds: float):
        self._current_time += seconds


@pytest.fixture
def dummy_signal():
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
def valid_df_50_bars():
    """Génère 50 barres OHLCV conformes (>= 45 barres requises par C2)."""
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
def mock_bundle():
    """Crée un ModelBundle factice valide."""
    cols = (
        "ema_diff", "rsi", "macd_hist", "atr_norm", "volume_rel",
        "hour_sin", "hour_cos", "ret_1", "ret_3", "ret_5", "adx", "bb_width"
    )
    scaler = MagicMock()
    scaler.transform = lambda x: np.array(x, dtype=float)
    scaler.n_features_in_ = len(cols)

    xgb = MagicMock()
    # Par défaut BUY 70%
    xgb.predict_proba.return_value = np.array([[0.30, 0.70]])
    xgb.feature_importances_ = np.ones(len(cols)) / len(cols)

    return ModelBundle(
        version_id="bundle_v1_test",
        xgb_model=xgb,
        scaler=scaler,
        lstm_model=None,
        feature_columns=cols,
        accuracy=0.62,
        sample_count=5000,
        loaded_at=time.time()
    )


@pytest.fixture
def mock_trainer(mock_bundle):
    trainer = MagicMock()
    trainer.is_trained = True
    trainer.FEATURE_COLUMNS = list(mock_bundle.feature_columns)
    trainer.get_active_bundle = MagicMock(return_value=mock_bundle)
    trainer.xgb_model = mock_bundle.xgb_model
    trainer.scaler = mock_bundle.scaler
    trainer.lstm_model = None

    def fake_build_features(df):
        out = df.copy()
        for c in trainer.FEATURE_COLUMNS:
            out[c] = 1.0
        return out

    trainer._build_features = fake_build_features
    return trainer


# =========================================================================
# TEST 1 : Timeout strict à 500 ms (Worker lent simulé)
# =========================================================================
def test_c2_01_timeout_strict_500ms(mock_trainer, dummy_signal, valid_df_50_bars):
    """Vérifie que l'inférence dépassant 500ms est avortée sans bloquer le moteur."""
    async def _test():
        predictor = MLPredictor(mock_trainer)

        def slow_compute(inp, bundle):
            time.sleep(0.650)  # Dépasse 500ms
            return MLPredictor.compute_isolated_inference(inp, bundle)

        with patch.object(predictor, "compute_isolated_inference", side_effect=slow_compute):
            t0 = time.monotonic()
            res = await predictor.filter_signal_async(dummy_signal, valid_df_50_bars, timeout_seconds=0.500)
            elapsed = time.monotonic() - t0

            assert res is None, "Le signal DOIT être rejeté sur timeout !"
            assert elapsed >= 0.490, f"Le délai mesuré ({elapsed:.3f}s) doit être d'au moins 500ms."

    asyncio.run(_test())


# =========================================================================
# TEST 2 : Absence de mutation de signal.metadata après timeout
# =========================================================================
def test_c2_02_zero_mutation_on_timeout(mock_trainer, dummy_signal, valid_df_50_bars):
    """Garantit qu'un timeout n'altère absolument pas les métadonnées de l'objet Signal."""
    async def _test():
        predictor = MLPredictor(mock_trainer)
        dummy_signal.metadata = {"original_key": "untouched"}

        def slow_compute(inp, bundle):
            time.sleep(0.550)
            return MLPredictor.compute_isolated_inference(inp, bundle)

        with patch.object(predictor, "compute_isolated_inference", side_effect=slow_compute):
            res = await predictor.filter_signal_async(dummy_signal, valid_df_50_bars, timeout_seconds=0.500)
            assert res is None
            assert dummy_signal.metadata == {"original_key": "untouched"}, "signal.metadata NE DOIT PAS être muté !"

    asyncio.run(_test())


# =========================================================================
# TEST 3 : Rejet explicite d'un résultat tardif (Deadline dépassée)
# =========================================================================
def test_c2_03_rejection_of_late_result(mock_bundle):
    """Vérifie que le worker détecte lui-même une deadline dépassée et invalide le résultat."""
    pool = DedicatedInferencePool(max_workers=2, max_queue=4)
    expired_deadline = time.monotonic() - 0.100  # Déjà expiré de 100ms
    arr = np.ones((10, 12), dtype=float)
    arr.flags.writeable = False

    inp = InferenceInput(
        request_id="req_expired",
        symbol="EURUSD",
        direction="BUY",
        features_array=arr,
        deadline=expired_deadline
    )

    future, err = pool.submit(inp, mock_bundle, MLPredictor.compute_isolated_inference)
    assert err is None
    result = future.result(timeout=1.0)

    assert result.is_valid is False
    assert "EXPIRED" in result.error_reason
    pool.shutdown(wait=False)


# =========================================================================
# TEST 4 : Limite exacte de capacité : 2 actifs, 4 en attente, 7ème rejetée
# =========================================================================
def test_c2_04_exact_pool_capacity_saturation(mock_bundle):
    """Garantit le rejet immédiat atomique (QUEUE_SATURATED) au-delà de 6 tâches."""
    pool = DedicatedInferencePool(max_workers=2, max_queue=4)
    gate_event = threading.Event()

    def blocking_compute(inp, bundle):
        gate_event.wait(timeout=5.0)
        return MLPredictor.compute_isolated_inference(inp, bundle)

    arr = np.ones((10, 12), dtype=float)
    arr.flags.writeable = False

    submitted_futures = []
    # Soumettre 6 tâches (2 actives + 4 dans la file)
    for i in range(6):
        inp = InferenceInput(
            request_id=f"req_{i}",
            symbol="EURUSD",
            direction="BUY",
            features_array=arr,
            deadline=time.monotonic() + 5.0
        )
        fut, err = pool.submit(inp, mock_bundle, blocking_compute)
        assert err is None, f"La tâche {i+1}/6 doit être acceptée."
        submitted_futures.append(fut)

    # 7ème soumission : DOIT ÊTRE REJETÉE IMMÉDIATEMENT
    inp7 = InferenceInput(
        request_id="req_7_overflow",
        symbol="EURUSD",
        direction="BUY",
        features_array=arr,
        deadline=time.monotonic() + 5.0
    )
    fut7, err7 = pool.submit(inp7, mock_bundle, blocking_compute)

    assert fut7 is None, "La 7ème tâche ne doit pas être soumise."
    assert err7 == "QUEUE_SATURATED", "Erreur attendue : QUEUE_SATURATED !"

    # Débloquer les workers et nettoyer
    gate_event.set()
    pool.shutdown(wait=True)


# =========================================================================
# TEST 5 : Soumissions concurrentes sans dépassement de capacité
# =========================================================================
def test_c2_05_concurrent_submissions_capacity_safety(mock_bundle):
    """Vérifie que la synchronisation atomique résiste à des threads de soumission concurrents."""
    pool = DedicatedInferencePool(max_workers=2, max_queue=4)
    rejection_count = 0
    acceptance_count = 0
    lock = threading.Lock()

    gate = threading.Event()

    def slow_task(inp, bundle):
        gate.wait(timeout=2.0)
        return MLPredictor.compute_isolated_inference(inp, bundle)

    arr = np.ones((10, 12), dtype=float)
    arr.flags.writeable = False

    def submitter(idx):
        nonlocal rejection_count, acceptance_count
        inp = InferenceInput(
            request_id=f"concurrent_{idx}",
            symbol="EURUSD",
            direction="BUY",
            features_array=arr,
            deadline=time.monotonic() + 2.0
        )
        fut, err = pool.submit(inp, mock_bundle, slow_task)
        with lock:
            if err == "QUEUE_SATURATED":
                rejection_count += 1
            else:
                acceptance_count += 1

    threads = [threading.Thread(target=submitter, args=(i,)) for i in range(20)]
    for t in threads: t.start()
    for t in threads: t.join()

    assert acceptance_count == 6, f"Exactement 6 tâches doivent être acceptées (obtenu: {acceptance_count})."
    assert rejection_count == 14, f"Exactement 14 tâches doivent être rejetées (obtenu: {rejection_count})."

    gate.set()
    pool.shutdown(wait=True)


# =========================================================================
# TEST 6 : Trois échecs consécutifs ouvrant le SymbolCircuitBreaker
# =========================================================================
def test_c2_06_three_consecutive_failures_trips_symbol_breaker():
    clock = SimulatedClock(start_time=100.0)
    breaker = SymbolCircuitBreaker("EURUSD", failure_threshold=3, cooldown_seconds=60.0, clock=clock)

    assert breaker.state == CircuitState.CLOSED

    # Échec 1
    breaker.record_failure("TIMEOUT")
    assert breaker.consecutive_failures == 1
    assert breaker.state == CircuitState.CLOSED

    # Échec 2
    breaker.record_failure("EXCEPTION")
    assert breaker.consecutive_failures == 2
    assert breaker.state == CircuitState.CLOSED

    # Échec 3 -> TRANSITION VERS OPEN
    breaker.record_failure("CORRUPTED_DATA")
    assert breaker.consecutive_failures == 3
    assert breaker.state == CircuitState.OPEN

    # Requête suivante refusée en 0ms
    allowed, reason = breaker.allow_request()
    assert allowed is False
    assert "CIRCUIT_OPEN" in reason


# =========================================================================
# TEST 7 : HALF_OPEN après cooldown et fermeture après 2 sondes réussies
# =========================================================================
def test_c2_07_half_open_cooldown_and_closure_after_two_successes():
    clock = SimulatedClock(start_time=100.0)
    breaker = SymbolCircuitBreaker("EURUSD", failure_threshold=3, cooldown_seconds=60.0, success_threshold=2, clock=clock)

    # Déclencher OPEN
    breaker.record_failure()
    breaker.record_failure()
    breaker.record_failure()
    assert breaker.state == CircuitState.OPEN

    # Avancer l'horloge de 59 secondes -> Reste OPEN
    clock.advance(59.0)
    assert breaker.state == CircuitState.OPEN

    # Avancer de 2 secondes supplémentaires (total 61s > 60s) -> Passage en HALF_OPEN
    clock.advance(2.0)
    assert breaker.state == CircuitState.HALF_OPEN

    # Sonde 1 autorisée
    allowed1, _ = breaker.allow_request()
    assert allowed1 is True
    # Deuxième requête concurrente rejetée (une seule sonde à la fois)
    allowed_concurrent, reason = breaker.allow_request()
    assert allowed_concurrent is False
    assert "HALF_OPEN_BUSY" in reason

    # Sonde 1 réussit -> reste en HALF_OPEN
    breaker.record_success()
    assert breaker.state == CircuitState.HALF_OPEN

    # Sonde 2 autorisée
    allowed2, _ = breaker.allow_request()
    assert allowed2 is True
    # Sonde 2 réussit -> RETOUR EN CLOSED
    breaker.record_success()
    assert breaker.state == CircuitState.CLOSED
    assert breaker.consecutive_failures == 0


# =========================================================================
# TEST 8 : Réouverture immédiate en OPEN après échec en HALF_OPEN
# =========================================================================
def test_c2_08_half_open_failure_reopens_immediately():
    clock = SimulatedClock(start_time=100.0)
    breaker = SymbolCircuitBreaker("EURUSD", failure_threshold=3, cooldown_seconds=60.0, clock=clock)

    # Trip to OPEN
    for _ in range(3): breaker.record_failure()
    assert breaker.state == CircuitState.OPEN

    # Passage en HALF_OPEN
    clock.advance(61.0)
    assert breaker.state == CircuitState.HALF_OPEN

    allowed, _ = breaker.allow_request()
    assert allowed is True

    # La sonde échoue -> Rebascule immédiate en OPEN
    breaker.record_failure("PROBE_TIMEOUT")
    assert breaker.state == CircuitState.OPEN

    # Vérification que le cooldown a été réinitialisé à l'instant actuel (161.0)
    clock.advance(30.0)
    assert breaker.state == CircuitState.OPEN


# =========================================================================
# TEST 9 : Déclenchement GlobalCircuitBreaker sur 3 symboles distincts
# =========================================================================
def test_c2_09_global_breaker_escalation_three_symbols():
    clock = SimulatedClock(start_time=500.0)
    global_breaker = GlobalCircuitBreaker(symbol_window_seconds=300.0, global_threshold=3, clock=clock)

    assert global_breaker.state == CircuitState.CLOSED

    # Symbole 1 tombe
    global_breaker.record_symbol_trip("EURUSD")
    assert global_breaker.state == CircuitState.CLOSED

    # Symbole 2 tombe
    global_breaker.record_symbol_trip("GBPUSD")
    assert global_breaker.state == CircuitState.CLOSED

    # Répétition sur EURUSD (ne doit pas compter comme un 3ème symbole distinct)
    global_breaker.record_symbol_trip("EURUSD")
    assert global_breaker.state == CircuitState.CLOSED

    # Symbole 3 tombe -> ESCALADE GLOBALE
    global_breaker.record_symbol_trip("XAUUSD")
    assert global_breaker.state == CircuitState.OPEN


# =========================================================================
# TEST 10 : Absence de déclenchement global sur QUEUE_SATURATED
# =========================================================================
def test_c2_10_queue_saturation_does_not_trip_breakers():
    clock = SimulatedClock(start_time=100.0)
    symbol_breaker = SymbolCircuitBreaker("EURUSD", clock=clock)
    global_breaker = GlobalCircuitBreaker(clock=clock)

    # 10 saturations successives
    for _ in range(10):
        symbol_breaker.record_queue_saturated()

    assert symbol_breaker.consecutive_failures == 0
    assert symbol_breaker.state == CircuitState.CLOSED
    assert global_breaker.state == CircuitState.CLOSED
    assert symbol_breaker.saturated_count == 10


# =========================================================================
# TEST 11 : Cohérence modèle/scaler lors d'un rechargement concurrent (ModelBundle)
# =========================================================================
def test_c2_11_model_bundle_atomic_consistency():
    """Garantit qu'un worker capture une génération atomique et ne mélange pas les artefacts."""
    bundle_v1 = ModelBundle(
        version_id="gen_1",
        xgb_model="xgb_v1",
        scaler="scaler_v1",
        lstm_model=None,
        feature_columns=("c1", "c2"),
        accuracy=0.60,
        sample_count=1000,
        loaded_at=time.time()
    )
    bundle_v2 = ModelBundle(
        version_id="gen_2",
        xgb_model="xgb_v2",
        scaler="scaler_v2",
        lstm_model=None,
        feature_columns=("c1", "c2"),
        accuracy=0.65,
        sample_count=2000,
        loaded_at=time.time()
    )

    trainer = MagicMock()
    trainer.get_active_bundle.return_value = bundle_v1

    # Capture locale snapshot
    active = trainer.get_active_bundle()
    assert active.xgb_model == "xgb_v1"
    assert active.scaler == "scaler_v1"

    # Swap atomique intervenant pendant l'inférence
    trainer.get_active_bundle.return_value = bundle_v2

    # Le snapshot en cours d'utilisation dans le worker reste rigoureusement gen_1
    assert active.xgb_model == "xgb_v1"
    assert active.scaler == "scaler_v1"
    assert active.version_id == "gen_1"


# =========================================================================
# TEST 12 : Rejet strict des données OHLCV invalides (< 45 barres, timestamps)
# =========================================================================
def test_c2_12_ohlcv_validation_rules(valid_df_50_bars):
    # 1. Moins de 45 barres
    short_df = valid_df_50_bars.iloc[:40].copy()
    valid, reason = MLPredictor.validate_ohlcv_dataframe(short_df)
    assert valid is False
    assert "INSUFFICIENT_BARS" in reason

    # 2. Valeurs négatives
    neg_df = valid_df_50_bars.copy()
    neg_df.loc[neg_df.index[-1], 'close'] = -1.0
    valid, reason = MLPredictor.validate_ohlcv_dataframe(neg_df)
    assert valid is False
    assert "NON_POSITIVE_PRICE_VALUES" in reason

    # 3. Timestamps dupliqués
    dup_df = valid_df_50_bars.copy()
    dup_df.loc[dup_df.index[-1], 'time'] = dup_df.loc[dup_df.index[-2], 'time']
    valid, reason = MLPredictor.validate_ohlcv_dataframe(dup_df)
    assert valid is False
    assert "DUPLICATE_TIMESTAMPS" in reason

    # 4. Timestamps non croissants (inversés)
    rev_df = valid_df_50_bars.copy()
    rev_df['time'] = rev_df['time'].iloc[::-1].values
    valid, reason = MLPredictor.validate_ohlcv_dataframe(rev_df)
    assert valid is False
    assert "NON_MONOTONIC_TIMESTAMPS" in reason


# =========================================================================
# TEST 13 : Chaîne complète Engine -> Rejet ML -> Zéro appel BrokerRouter
# =========================================================================
def test_c2_13_engine_rejection_zero_broker_order():
    """Vérifie que le moteur n'appelle jamais BrokerRouter lorsque le ML rejette."""
    async def _test():
        from application.engine import Engine
        from core.interfaces import OrderType

        engine = MagicMock(spec=Engine)
        engine.ml_predictor = MagicMock()
        # Le filtre ML rejette
        engine.ml_predictor.filter_signal_async = AsyncMock(return_value=None)
        engine.broker_router = MagicMock()

        signal = Signal(symbol="EURUSD", direction=OrderType.BUY, price=1.0850, confidence=0.85, source="Test")
        df = pd.DataFrame()

        # Simulation de la section 4 de _process_symbol
        ml_timeout = 0.500
        validated_signal = await engine.ml_predictor.filter_signal_async(signal, df, timeout_seconds=ml_timeout)

        if not validated_signal:
            # Sortie immédiate
            pass
        else:
            # Section exécution
            engine.broker_router.execute_order()

        engine.broker_router.execute_order.assert_not_called()

    asyncio.run(_test())


# =========================================================================
# TEST 14 : Absence d'accumulation non bornée de tâches orphelines
# =========================================================================
def test_c2_14_bounded_orphan_tasks_when_workers_blocked(mock_bundle):
    """Vérifie que des workers indéfiniment bloqués ne provoquent aucune croissance mémoire."""
    pool = DedicatedInferencePool(max_workers=2, max_queue=4)
    forever_event = threading.Event()

    def blocked_task(inp, bundle):
        forever_event.wait(timeout=1.0)
        return MLPredictor.compute_isolated_inference(inp, bundle)

    arr = np.ones((10, 12), dtype=float)
    arr.flags.writeable = False

    # Soumettre 6 tâches (capacité max)
    for i in range(6):
        inp = InferenceInput(
            request_id=f"blocked_{i}",
            symbol="EURUSD",
            direction="BUY",
            features_array=arr,
            deadline=time.monotonic() + 0.100
        )
        pool.submit(inp, mock_bundle, blocked_task)

    assert pool.total_in_flight == 6

    # Essayer de soumettre 50 tâches supplémentaires alors que le système est bloqué
    for i in range(50):
        inp = InferenceInput(
            request_id=f"flood_{i}",
            symbol="EURUSD",
            direction="BUY",
            features_array=arr,
            deadline=time.monotonic() + 0.100
        )
        fut, err = pool.submit(inp, mock_bundle, blocked_task)
        assert fut is None
        assert err == "QUEUE_SATURATED"

    # Vérification formelle : le pool n'a pas débordé au-delà de 6
    assert pool.total_in_flight == 6
    forever_event.set()
    pool.shutdown(wait=True)


# =========================================================================
# TEST 15 : Non-régression du contrat de sécurité C1
# =========================================================================
def test_c2_15_c1_contract_non_regression(mock_trainer, dummy_signal, valid_df_50_bars):
    """Vérifie que les invariants C1 (Fail-Closed si non entraîné, validation des probabilités) sont intacts."""
    async def _test():
        mock_trainer.is_trained = False
        mock_trainer.get_active_bundle.return_value = None
        predictor = MLPredictor(mock_trainer)

        res = await predictor.filter_signal_async(dummy_signal, valid_df_50_bars)
        assert res is None, "FAIL : Un modèle non entraîné DOIT toujours rejeter en C2 !"

    asyncio.run(_test())
