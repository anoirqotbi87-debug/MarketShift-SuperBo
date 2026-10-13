import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from core.execution_metrics import ExecutionMetricsCollector, execution_metrics
from api.server import app
from core.interfaces import Signal, OrderType, AccountInfo
from risk.pretrade_validator import PreTradeValidator


def test_m15_metrics_collector_calculations():
    """M-15: Vérifie le calcul exact de latence, slippage et fill rate dans le collecteur."""
    collector = ExecutionMetricsCollector()
    collector.reset()

    # Tentative 1 : succès (latence 40ms, slippage 0.5 pips)
    collector.record_order_attempt()
    collector.record_order_execution(latency_ms=40.0, slippage_pips=0.5, success=True)

    # Tentative 2 : succès (latence 60ms, slippage 1.5 pips)
    collector.record_order_attempt()
    collector.record_order_execution(latency_ms=60.0, slippage_pips=1.5, success=True)

    # Tentative 3 : échec / timeout (latence 100ms)
    collector.record_order_attempt()
    collector.record_order_execution(latency_ms=100.0, success=False)

    metrics = collector.get_metrics()
    assert metrics["orders_attempted"] == 3
    assert metrics["orders_executed"] == 2
    assert metrics["fill_rate_pct"] == round(2 / 3 * 100.0, 2)
    assert metrics["last_routing_latency_ms"] == 100.0
    # Moyenne de 40, 60, 100 = 66.67 ms
    assert metrics["avg_routing_latency_ms"] == 66.67
    # Moyenne de slippage sur les 2 ordres exécutés : (0.5 + 1.5) / 2 = 1.0 pip
    assert metrics["avg_slippage_pips"] == 1.0


def test_m15_pretrade_rejection_tracking():
    """M-15: Vérifie le comptage et l'enregistrement des motifs de rejet par le PreTradeValidator."""
    execution_metrics.reset()
    validator = PreTradeValidator()

    # 1. Rejet par spread élevé
    dummy_signal = Signal(
        symbol="EURUSD",
        direction=OrderType.BUY,
        source="TEST",
        sl_pips=20.0,
        tp_pips=40.0,
        confidence=0.85
    )
    dummy_account = AccountInfo(
        login=12345,
        balance=1000.0,
        equity=1000.0,
        margin=100.0,
        free_margin=900.0,
        margin_level=1000.0,
        currency="USD",
        server="TestServer"
    )

    # Spread de 50.0 > 3.0 max pour EURUSD -> Rejet HIGH_SPREAD
    allowed = validator.validate_signal(dummy_signal, dummy_account, current_spread_pips=50.0)
    assert allowed is False

    # 2. Rejet par confiance ML insuffisante
    low_conf_signal = Signal(
        symbol="EURUSD",
        direction=OrderType.BUY,
        source="TEST",
        sl_pips=20.0,
        tp_pips=40.0,
        confidence=0.10
    )
    allowed_ml = validator.validate_signal(low_conf_signal, dummy_account, current_spread_pips=1.0)
    assert allowed_ml is False

    metrics = execution_metrics.get_metrics()
    assert metrics["pretrade_rejections"]["total"] >= 2
    assert "HIGH_SPREAD" in metrics["pretrade_rejections"]["by_reason"]
    assert "LOW_ML_CONFIDENCE" in metrics["pretrade_rejections"]["by_reason"]


def test_m15_status_endpoint_exposes_execution_metrics():
    """M-15: Vérifie que GET /status expose bien le bloc execution_metrics."""
    execution_metrics.reset()
    execution_metrics.record_order_attempt()
    execution_metrics.record_order_execution(latency_ms=25.5, slippage_pips=0.2, success=True)
    execution_metrics.record_pretrade_rejection("HIGH_SPREAD")

    mock_engine = MagicMock()
    mock_engine.state_manager.is_paused = False
    mock_engine.kill_switch.is_triggered = False
    mock_engine.state_manager.account = None
    mock_engine.state_manager.positions = []
    mock_engine.symbols = ["EURUSD"]
    mock_engine.circuit_breaker.get_metrics.return_value = {
        "daily_start_balance": 1000.0,
        "current_daily_pnl_pct": 0.0,
        "high_water_mark": 1000.0
    }

    with patch("api.server._engine", mock_engine):
        client = TestClient(app)
        res = client.get("/status")
        assert res.status_code == 200
        data = res.json()

        assert "execution_metrics" in data
        exec_m = data["execution_metrics"]
        assert exec_m["orders_attempted"] == 1
        assert exec_m["orders_executed"] == 1
        assert exec_m["last_routing_latency_ms"] == 25.5
        assert exec_m["avg_slippage_pips"] == 0.2
        assert exec_m["fill_rate_pct"] == 100.0
        assert exec_m["pretrade_rejections"]["total"] == 1
        assert exec_m["pretrade_rejections"]["by_reason"].get("HIGH_SPREAD") == 1
