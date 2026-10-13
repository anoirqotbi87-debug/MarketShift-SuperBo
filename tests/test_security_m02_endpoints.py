import io
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from infrastructure.config import Config
from api.server import app

@pytest.fixture
def client():
    return TestClient(app)

def test_endpoints_without_api_key_return_403(client):
    with patch.object(Config, "API_SECRET_KEY", "prod_secret_token_123"):
        # 1. POST /apply-optimal-settings
        res_apply = client.post("/apply-optimal-settings", json={"slMult": 2.0, "confThreshold": 0.6})
        assert res_apply.status_code == 403, f"Expected 403, got {res_apply.status_code}"

        # 2. POST /ml/retrain
        res_retrain = client.post("/ml/retrain")
        assert res_retrain.status_code == 403, f"Expected 403, got {res_retrain.status_code}"

        # 3. POST /backtest
        csv_file = io.BytesIO(b"time,open,high,low,close,volume\n2026-01-01,1.1,1.2,1.0,1.15,100")
        res_backtest = client.post(
            "/backtest",
            data={"symbol": "EURUSD", "initial_capital": 10000.0},
            files={"file": ("test.csv", csv_file, "text/csv")}
        )
        assert res_backtest.status_code == 403, f"Expected 403, got {res_backtest.status_code}"

        # 4. POST /optimize
        res_optimize = client.post(
            "/optimize",
            data={"symbol": "EURUSD#", "initial_capital": 10000.0}
        )
        assert res_optimize.status_code == 403, f"Expected 403, got {res_optimize.status_code}"

def test_endpoints_with_valid_api_key_accepted(client):
    with patch.object(Config, "API_SECRET_KEY", "prod_secret_token_123"):
        headers = {"X-API-Key": "prod_secret_token_123"}

        # 1. POST /apply-optimal-settings
        with patch("api.server.open", create=True):
            res_apply = client.post(
                "/apply-optimal-settings",
                json={"slMult": 2.0, "confThreshold": 0.6},
                headers=headers
            )
            assert res_apply.status_code == 200

        # 2. POST /ml/retrain
        with patch("api.server._engine") as mock_engine:
            mock_engine.ml_trainer = MagicMock()
            res_retrain = client.post("/ml/retrain", headers=headers)
            assert res_retrain.status_code == 200
            assert res_retrain.json().get("status") == "success"

def test_backtest_file_size_exceeding_20mb_returns_413(client):
    with patch.object(Config, "API_SECRET_KEY", "prod_secret_token_123"):
        headers = {"X-API-Key": "prod_secret_token_123"}
        # Fichier simulé de plus de 20 Mo (21 Mo)
        oversized_data = b"0" * (21 * 1024 * 1024)
        res = client.post(
            "/backtest",
            data={"symbol": "EURUSD", "initial_capital": 10000.0},
            files={"file": ("large.csv", io.BytesIO(oversized_data), "text/csv")},
            headers=headers
        )
        assert res.status_code == 413
