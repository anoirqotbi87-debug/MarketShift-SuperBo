import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from infrastructure.config import Config, AppConfig
from api.server import app

def test_api_secret_key_default_empty():
    cfg = AppConfig(_env_file=None)
    assert cfg.API_SECRET_KEY == ""

def test_api_secret_key_production_failfast():
    with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
        with patch.dict("os.environ", {"ENVIRONMENT": "production", "API_SECRET_KEY": ""}):
            cfg = AppConfig()
            if cfg.ENVIRONMENT.lower() not in ("development", "dev", "test") and not cfg.API_SECRET_KEY:
                raise ValueError("CRITICAL SECURITY ERROR: API_SECRET_KEY must be set in production/staging environment.")

def test_websocket_rejects_arbitrary_or_hardcoded_key_when_secret_set():
    client = TestClient(app)
    with patch.object(Config, "API_SECRET_KEY", "real_secure_token_abc123"):
        # Tentative avec l'ancienne clé en dur -> doit être refusée avec code 1008
        with pytest.raises(Exception):
            with client.websocket_connect("/ws?api_key=marketshift_dev_secret_key_2026"):
                pass

        # Tentative avec la vraie clé -> acceptée
        with client.websocket_connect("/ws?api_key=real_secure_token_abc123") as ws:
            data = ws.receive_json()
            assert data.get("type") == "snapshot"

def test_verify_api_key_refuses_invalid_header_when_secret_set():
    client = TestClient(app)
    with patch.object(Config, "API_SECRET_KEY", "real_secure_token_abc123"):
        # Requête sans en-tête sur un endpoint protégé
        res = client.post("/control", json={"action": "pause"})
        assert res.status_code == 403

        # Requête avec l'ancienne clé dev
        res_dev = client.post(
            "/control",
            json={"action": "pause"},
            headers={"X-API-Key": "marketshift_dev_secret_key_2026"}
        )
        assert res_dev.status_code == 403

        # Requête avec la vraie clé configurée
        with patch("api.server._engine") as mock_engine:
            mock_engine.state_manager.pause = MagicMock()
            res_ok = client.post(
                "/control",
                json={"action": "pause"},
                headers={"X-API-Key": "real_secure_token_abc123"}
            )
            assert res_ok.status_code == 200
