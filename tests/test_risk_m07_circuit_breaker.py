"""
test_risk_m07_circuit_breaker.py — Tests unitaires pour M-07 : Rollover journalier, Trailing Drawdown et Profit Lock
"""
import pytest
import datetime
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from core.interfaces import AccountInfo
from application.state_manager import StateManager
from agents.kill_switch import KillSwitch
from agents.circuit_breaker import CircuitBreaker
from api.server import app

@pytest.fixture
def mock_setup():
    connector = MagicMock()
    connector.connect.return_value = True
    account = AccountInfo(
        login=123456,
        balance=10000.0,
        equity=10000.0,
        free_margin=10000.0,
        margin_level=100.0,
        currency="USD",
        server="DemoServer"
    )
    connector.get_account_info.return_value = account
    connector.get_positions.return_value = []

    state_mgr = StateManager(connector)
    state_mgr._account_info = account

    notifier = MagicMock()
    kill_switch = KillSwitch(connector, notifier=notifier)
    kill_switch.activate = MagicMock()

    cb = CircuitBreaker(state_mgr, kill_switch)
    cb.max_daily_loss_pct = 0.05
    cb.trailing_dd_enabled = True
    cb.profit_lock_pct = 0.0

    return state_mgr, kill_switch, cb, account

def test_daily_rollover_resets_balance(mock_setup):
    state_mgr, kill_switch, cb, account = mock_setup

    day1 = datetime.date(2026, 10, 13)
    day2 = datetime.date(2026, 10, 14)

    # Jour 1 : Initialisation
    account.balance = 10000.0
    account.equity = 10000.0
    assert cb.check(current_date=day1) is True
    assert cb.daily_start_balance == 10000.0
    assert cb.high_water_mark == 10000.0
    assert cb.last_reset_date == day1

    # Jour 1 : Profit intraday
    account.equity = 10600.0
    assert cb.check(current_date=day1) is True
    assert cb.high_water_mark == 10600.0
    assert cb.daily_start_balance == 10000.0

    # Rollover Jour 2 : Nouveau solde de référence
    account.balance = 10600.0
    account.equity = 10600.0
    assert cb.check(current_date=day2) is True
    assert cb.daily_start_balance == 10600.0
    assert cb.high_water_mark == 10600.0
    assert cb.last_reset_date == day2
    kill_switch.activate.assert_not_called()

def test_max_daily_loss_triggers_kill_switch(mock_setup):
    state_mgr, kill_switch, cb, account = mock_setup
    day1 = datetime.date(2026, 10, 13)

    account.balance = 10000.0
    account.equity = 10000.0
    cb.check(current_date=day1)

    # Perte journalière de 5.5% (> 5%)
    account.equity = 9450.0
    assert cb.check(current_date=day1) is False
    kill_switch.activate.assert_called_once_with(reason="MAX_DAILY_LOSS_REACHED")

def test_trailing_drawdown_triggers_from_peak(mock_setup):
    state_mgr, kill_switch, cb, account = mock_setup
    day1 = datetime.date(2026, 10, 13)

    account.balance = 10000.0
    account.equity = 10000.0
    cb.check(current_date=day1)

    # Pic à 12000
    account.equity = 12000.0
    cb.check(current_date=day1)
    assert cb.high_water_mark == 12000.0

    # Chute de 6% par rapport au pic (12000 * 0.94 = 11280)
    # L'equity (11200) reste supérieure au départ (10000), mais recul de 800/12000 = 6.67% > 5%
    account.equity = 11200.0
    assert cb.check(current_date=day1) is False
    kill_switch.activate.assert_called_once_with(reason="TRAILING_DRAWDOWN_LIMIT_REACHED")

def test_profit_lock_triggers_when_falling_below_guarantee(mock_setup):
    state_mgr, kill_switch, cb, account = mock_setup
    day1 = datetime.date(2026, 10, 13)

    cb.profit_lock_pct = 0.02  # Verrouille 2% de gain si le pic dépasse 4% (2 * 2%)
    account.balance = 10000.0
    account.equity = 10000.0
    cb.check(current_date=day1)

    # Pic à +5% (10500 > 10000 * 1.04)
    account.equity = 10500.0
    cb.check(current_date=day1)

    # Retombe à +1.5% (10150 < 10200) -> déclenchement profit lock
    account.equity = 10150.0
    assert cb.check(current_date=day1) is False
    kill_switch.activate.assert_called_once_with(reason="PROFIT_LOCK_TRIGGERED")

def test_status_endpoint_exposes_circuit_breaker_metrics(mock_setup):
    state_mgr, kill_switch, cb, account = mock_setup
    day1 = datetime.date(2026, 10, 13)

    account.balance = 10000.0
    account.equity = 10250.0
    cb.check(current_date=day1)

    mock_engine = MagicMock()
    mock_engine.state_manager = state_mgr
    mock_engine.kill_switch = kill_switch
    mock_engine.circuit_breaker = cb
    mock_engine.symbols = ["EURUSD"]

    with patch("api.server._engine", mock_engine):
        client = TestClient(app)
        response = client.get("/status")
        assert response.status_code == 200
        data = response.json()

        assert "daily_start_balance" in data
        assert data["daily_start_balance"] == 10000.0
        assert "high_water_mark" in data
        assert data["high_water_mark"] == 10250.0
        assert "current_daily_pnl_pct" in data
        assert data["current_daily_pnl_pct"] == 0.025
        assert "circuit_breaker" in data
        assert data["circuit_breaker"]["daily_start_balance"] == 10000.0

