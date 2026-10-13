import pytest
import pandas as pd
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from infrastructure.config import Config
from api.server import app
from core.interfaces import OrderType, AccountInfo

@pytest.fixture
def client():
    return TestClient(app)

def test_trade_without_sl_returns_422(client):
    with patch.object(Config, "API_SECRET_KEY", "test_key_m01"):
        headers = {"X-API-Key": "test_key_m01"}
        with patch("api.server._engine") as mock_engine:
            mock_engine.kill_switch.is_triggered = False

            # 1. Requête sans SL ni TP
            res = client.post(
                "/trade",
                json={"symbol": "EURUSD", "direction": "BUY", "volume": 0.02},
                headers=headers
            )
            assert res.status_code == 422
            assert "Stop Loss est obligatoire" in res.json().get("detail", "")

            # 2. Requête avec sl_price <= 0
            res_zero = client.post(
                "/trade",
                json={"symbol": "EURUSD", "direction": "BUY", "volume": 0.02, "sl_price": 0.0},
                headers=headers
            )
            assert res_zero.status_code == 422

            # 3. Requête avec volume <= 0
            res_neg_vol = client.post(
                "/trade",
                json={"symbol": "EURUSD", "direction": "BUY", "volume": -0.01, "sl_price": 1.05},
                headers=headers
            )
            assert res_neg_vol.status_code == 422

def test_trade_with_sl_price_executes_with_stop_loss(client):
    with patch.object(Config, "API_SECRET_KEY", "test_key_m01"):
        headers = {"X-API-Key": "test_key_m01"}
        with patch("api.server._engine") as mock_engine:
            mock_engine.kill_switch.is_triggered = False
            mock_engine.connector.execute_order.return_value = {
                "ticket": 999123,
                "price": 1.0850,
                "volume": 0.05
            }
            mock_engine.pretrade_validator.validate_signal.return_value = True
            mock_engine.state_manager.account = AccountInfo(
                login=123,
                balance=10000.0,
                equity=10000.0,
                free_margin=9000.0,
                margin_level=500.0,
                currency="USD",
                server="DemoServer"
            )
            mock_engine.state_manager.positions = []
            mock_engine.connector.get_symbol_info.return_value = MagicMock(spread=10)
            mock_engine._get_pip_size.return_value = 0.0001

            res = client.post(
                "/trade",
                json={
                    "symbol": "EURUSD",
                    "direction": "BUY",
                    "volume": 0.05,
                    "sl_price": 1.0810,
                    "tp_price": 1.0920
                },
                headers=headers
            )
            assert res.status_code == 200
            data = res.json()
            assert data.get("ticket") == 999123

            # Vérifier que execute_order a reçu le sl et tp
            mock_engine.connector.execute_order.assert_called_once_with(
                "EURUSD",
                OrderType.BUY,
                0.05,
                sl=1.0810,
                tp=1.0920
            )

def test_trade_with_sl_pips_computes_prices_and_logs_audit(client):
    with patch.object(Config, "API_SECRET_KEY", "test_key_m01"):
        headers = {"X-API-Key": "test_key_m01"}
        with patch("api.server._engine") as mock_engine:
            mock_engine.kill_switch.is_triggered = False
            mock_engine.connector.execute_order.return_value = {
                "ticket": 888456,
                "price": 1.0850,
                "volume": 0.01
            }
            mock_engine._get_pip_size.return_value = 0.0001
            mock_engine._tf_m1 = 1
            mock_engine.connector.get_historical_data.return_value = pd.DataFrame([{"close": 1.0850}])
            mock_engine._compute_sl_tp_prices.return_value = (1.0830, 1.0890)
            mock_engine.pretrade_validator.validate_signal.return_value = True
            mock_engine.state_manager.account = AccountInfo(
                login=123,
                balance=10000.0,
                equity=10000.0,
                free_margin=9000.0,
                margin_level=500.0,
                currency="USD",
                server="DemoServer"
            )
            mock_engine.state_manager.positions = []
            mock_engine.connector.get_symbol_info.return_value = MagicMock(spread=8)

            res = client.post(
                "/trade",
                json={
                    "symbol": "EURUSD",
                    "direction": "BUY",
                    "volume": 0.01,
                    "sl_pips": 20.0,
                    "tp_pips": 40.0
                },
                headers=headers
            )
            assert res.status_code == 200
            data = res.json()
            assert data.get("ticket") == 888456
            mock_engine.connector.execute_order.assert_called_once_with(
                "EURUSD",
                OrderType.BUY,
                0.01,
                sl=1.0830,
                tp=1.0890
            )
