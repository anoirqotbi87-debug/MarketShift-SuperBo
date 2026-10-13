"""
test_api_m10_env_writes.py — Tests unitaires pour M-10 : Validation stricte des bornes et écriture atomique .env
"""
import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.server import app
from infrastructure.config import Config
from utils.env_writer import atomic_update_env

@pytest.fixture
def client():
    return TestClient(app)

def test_apply_settings_out_of_bounds_sl_returns_422(client):
    with patch.object(Config, "API_SECRET_KEY", "test_key_m10"):
        headers = {"X-API-Key": "test_key_m10"}

        # SL trop faible (< 0.5)
        res_low = client.post(
            "/apply-optimal-settings",
            json={"slMult": 0.2, "confThreshold": 0.60},
            headers=headers
        )
        assert res_low.status_code == 422

        # SL trop élevé (> 5.0)
        res_high = client.post(
            "/apply-optimal-settings",
            json={"slMult": 6.5, "confThreshold": 0.60},
            headers=headers
        )
        assert res_high.status_code == 422

def test_apply_settings_out_of_bounds_confidence_returns_422(client):
    with patch.object(Config, "API_SECRET_KEY", "test_key_m10"):
        headers = {"X-API-Key": "test_key_m10"}

        # Confiance trop faible (< 0.50 ou < 50%)
        res_low_dec = client.post(
            "/apply-optimal-settings",
            json={"slMult": 1.5, "confThreshold": 0.40},
            headers=headers
        )
        assert res_low_dec.status_code == 422

        res_low_pct = client.post(
            "/apply-optimal-settings",
            json={"slMult": 1.5, "confThreshold": 45.0},
            headers=headers
        )
        assert res_low_pct.status_code == 422

        # Confiance trop élevée (> 0.90 ou > 90%)
        res_high_dec = client.post(
            "/apply-optimal-settings",
            json={"slMult": 1.5, "confThreshold": 0.95},
            headers=headers
        )
        assert res_high_dec.status_code == 422

        res_high_pct = client.post(
            "/apply-optimal-settings",
            json={"slMult": 1.5, "confThreshold": 95.0},
            headers=headers
        )
        assert res_high_pct.status_code == 422

def test_apply_settings_valid_values_succeeds(client, tmp_path):
    temp_env = tmp_path / ".env"
    temp_env.write_text("EXISTING_KEY=123\nATR_SL_MULTIPLIER=1.5\n", encoding="utf-8")

    with patch.object(Config, "API_SECRET_KEY", "test_key_m10"):
        headers = {"X-API-Key": "test_key_m10"}
        with patch("api.server.atomic_update_env") as mock_atomic:
            res = client.post(
                "/apply-optimal-settings",
                json={"slMult": 2.0, "confThreshold": 65.0, "symbol": "EURUSD"},
                headers=headers
            )
            assert res.status_code == 200
            mock_atomic.assert_called_once()
            call_args = mock_atomic.call_args[0][0]
            assert call_args["ATR_SL_MULTIPLIER_EURUSD"] == "2.0"
            assert call_args["ML_CONFIDENCE_THRESHOLD_EURUSD"] == "0.65"

def test_atomic_update_env_preserves_content_and_updates(tmp_path):
    env_file = tmp_path / ".env"
    initial_content = "APP_ENV=test\nATR_SL_MULTIPLIER=1.5\nTELEGRAM_CHAT_ID=999\n"
    env_file.write_text(initial_content, encoding="utf-8")

    # Mise à jour atomique
    success = atomic_update_env(
        {"ATR_SL_MULTIPLIER": "2.5", "NEW_VAR": "HELLO"},
        env_path=str(env_file)
    )
    assert success is True

    result_text = env_file.read_text(encoding="utf-8")
    assert "APP_ENV=test" in result_text
    assert "ATR_SL_MULTIPLIER=2.5" in result_text
    assert "TELEGRAM_CHAT_ID=999" in result_text
    assert "NEW_VAR=HELLO" in result_text
