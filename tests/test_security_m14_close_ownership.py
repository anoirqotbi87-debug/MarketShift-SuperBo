import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from infrastructure.config import Config
from api.server import app
from core.interfaces import PositionInfo, OrderType


@pytest.fixture
def mock_engine_fixture():
    mock_engine = MagicMock()
    # Position factice avec ticket 10101
    mock_pos = PositionInfo(
        ticket=10101,
        symbol="EURUSD",
        type=OrderType.BUY,
        volume=0.1,
        open_price=1.0850,
        current_price=1.0860,
        sl=1.0820,
        tp=1.0900,
        profit=10.0,
        time=1700000000,
        magic=12345
    )
    mock_engine.state_manager.positions = [mock_pos]
    mock_engine.connector.close_position.return_value = True
    return mock_engine


def test_m14_close_owned_position_success(mock_engine_fixture):
    """M-14: La fermeture d'une position appartenant au compte actif réussit."""
    client = TestClient(app)
    with patch.object(Config, "API_SECRET_KEY", "test_secret_m14_key_12345678"):
        headers = {"X-API-Key": "test_secret_m14_key_12345678"}
        with patch("api.server._engine", mock_engine_fixture):
            response = client.post("/close", json={"ticket": 10101}, headers=headers)
            assert response.status_code == 200
            assert response.json() == {"success": True}
            mock_engine_fixture.connector.close_position.assert_called_once_with(10101)


def test_m14_close_unknown_or_foreign_ticket_rejected_404(mock_engine_fixture):
    """M-14: La fermeture d'un ticket non détenu ou étranger est rejetée avec HTTP 404."""
    client = TestClient(app)
    with patch.object(Config, "API_SECRET_KEY", "test_secret_m14_key_12345678"):
        headers = {"X-API-Key": "test_secret_m14_key_12345678"}
        with patch("api.server._engine", mock_engine_fixture):
            # Ticket 99999 n'existe pas dans mock_engine.state_manager.positions
            response = client.post("/close", json={"ticket": 99999}, headers=headers)
            assert response.status_code == 404
            assert "non trouvée parmi les positions ouvertes" in response.json().get("detail", "")
            mock_engine_fixture.connector.close_position.assert_not_called()
