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
            mock_engine.connector.get_symbol_info.return_value = MagicMock(spread=10, ask=1.0850, bid=1.0848)
            mock_engine._get_pip_size.return_value = 0.0001
            mock_engine._get_pip_value.return_value = 10.0

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
            mock_engine._get_pip_value.return_value = 10.0

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


def test_trade_excessive_risk_rejected_on_standard_account(client):
    with patch.object(Config, "API_SECRET_KEY", "test_key_m01"):
        headers = {"X-API-Key": "test_key_m01"}
        with patch("api.server._engine") as mock_engine:
            mock_engine.kill_switch.is_triggered = False
            mock_engine.pretrade_validator.validate_signal.return_value = True
            mock_engine._compute_sl_tp_prices.return_value = (1.0800, 1.0900)
            mock_engine.state_manager.account = AccountInfo(
                login=123,
                balance=1000.0,
                equity=1000.0,
                free_margin=900.0,
                margin_level=500.0,
                currency="USD",
                server="DemoServer"
            )
            mock_engine.state_manager.positions = []
            mock_engine.connector.get_symbol_info.return_value = MagicMock(spread=10, ask=1.0850, bid=1.0848)
            mock_engine._get_pip_size.return_value = 0.0001
            mock_engine._get_pip_value.return_value = 10.0

            # 1.00 lot avec 50 pips SL = 500$ de risque (50% de l'équité > max 3% = 30$)
            res = client.post(
                "/trade",
                json={
                    "symbol": "EURUSD",
                    "direction": "BUY",
                    "volume": 1.00,
                    "sl_pips": 50.0,
                    "tp_pips": 100.0
                },
                headers=headers
            )
            assert res.status_code == 400
            assert "Risque estimé" in res.json().get("detail", "")


def test_trade_micro_account_tolerates_micro_lot(client):
    with patch.object(Config, "API_SECRET_KEY", "test_key_m01"):
        headers = {"X-API-Key": "test_key_m01"}
        with patch("api.server._engine") as mock_engine:
            mock_engine.kill_switch.is_triggered = False
            mock_engine.pretrade_validator.validate_signal.return_value = True
            mock_engine._compute_sl_tp_prices.return_value = (1.0800, 1.0900)
            mock_engine.connector.execute_order.return_value = {"ticket": 12345, "price": 1.0850, "volume": 0.01}
            # Compte de 10$
            mock_engine.state_manager.account = AccountInfo(
                login=123,
                balance=10.0,
                equity=10.0,
                free_margin=8.0,
                margin_level=300.0,
                currency="USD",
                server="DemoServer"
            )
            mock_engine.state_manager.positions = []
            mock_engine.connector.get_symbol_info.return_value = MagicMock(spread=10, ask=1.0850, bid=1.0848)
            mock_engine._get_pip_size.return_value = 0.0001
            mock_engine._get_pip_value.return_value = 10.0

            # 0.01 lot avec 15 pips SL = 1.50$ (<= max(2.00$, 1.50$) = 2.00$) -> ACCEPTÉ
            res = client.post(
                "/trade",
                json={
                    "symbol": "EURUSD",
                    "direction": "BUY",
                    "volume": 0.01,
                    "sl_pips": 15.0,
                    "tp_pips": 30.0
                },
                headers=headers
            )
            assert res.status_code == 200
            assert res.json().get("ticket") == 12345


def test_trade_micro_account_blocks_excessive_risk(client):
    with patch.object(Config, "API_SECRET_KEY", "test_key_m01"):
        headers = {"X-API-Key": "test_key_m01"}
        with patch("api.server._engine") as mock_engine:
            mock_engine.kill_switch.is_triggered = False
            mock_engine.pretrade_validator.validate_signal.return_value = True
            mock_engine._compute_sl_tp_prices.return_value = (1.0800, 1.0900)
            # Compte de 10$
            mock_engine.state_manager.account = AccountInfo(
                login=123,
                balance=10.0,
                equity=10.0,
                free_margin=8.0,
                margin_level=300.0,
                currency="USD",
                server="DemoServer"
            )
            mock_engine.state_manager.positions = []
            mock_engine.connector.get_symbol_info.return_value = MagicMock(spread=10, ask=1.0850, bid=1.0848)
            mock_engine._get_pip_size.return_value = 0.0001
            mock_engine._get_pip_value.return_value = 10.0

            # 0.10 lot avec 20 pips SL = 20$ de risque (> max(2.00, 1.50) = 2.00$) -> REJETÉ
            res = client.post(
                "/trade",
                json={
                    "symbol": "EURUSD",
                    "direction": "BUY",
                    "volume": 0.10,
                    "sl_pips": 20.0,
                    "tp_pips": 40.0
                },
                headers=headers
            )
            assert res.status_code == 400
            assert "Risque estimé" in res.json().get("detail", "")


def test_trade_fail_closed_when_risk_cannot_be_calculated(client):
    """Vérifie le principe Fail-Closed : Si le calcul du risque échoue, l'ordre est REJETÉ (400/503)."""
    with patch.object(Config, "API_SECRET_KEY", "test_key_m01"):
        headers = {"X-API-Key": "test_key_m01"}
        with patch("api.server._engine") as mock_engine:
            mock_engine.kill_switch.is_triggered = False
            mock_engine.pretrade_validator.validate_signal.return_value = True
            mock_engine._compute_sl_tp_prices.return_value = (1.0800, 1.0900)
            mock_engine.state_manager.account = AccountInfo(
                login=123,
                balance=100.0,
                equity=100.0,
                free_margin=90.0,
                margin_level=300.0,
                currency="USD",
                server="DemoServer"
            )
            # Cas 1 : Symbole introuvable -> Doit refuser l'ordre (Fail-Closed)
            mock_engine.connector.get_symbol_info.return_value = None
            res = client.post(
                "/trade",
                json={"symbol": "UNKNOWN", "direction": "BUY", "volume": 0.01, "sl_pips": 20.0},
                headers=headers
            )
            assert res.status_code == 400
            assert "Fail-Closed" in res.json().get("detail", "")

            # Cas 2 : Valeur de pip invalide (0.0) -> Doit refuser l'ordre (Fail-Closed)
            mock_engine.connector.get_symbol_info.return_value = MagicMock(spread=10)
            mock_engine._get_pip_size.return_value = 0.0001
            mock_engine._get_pip_value.return_value = 0.0
            res2 = client.post(
                "/trade",
                json={"symbol": "EURUSD", "direction": "BUY", "volume": 0.01, "sl_pips": 20.0},
                headers=headers
            )
            assert res2.status_code == 400
            assert "Fail-Closed" in res2.json().get("detail", "")


def test_broker_router_anti_duplicate_identifies_genuinely_new_position():
    """Détecte une position nouvellement apparue après timeout du broker primaire."""
    from infrastructure.broker_router import BrokerRouter
    from core.interfaces import PositionInfo, OrderType

    primary = MagicMock()
    fallback = MagicMock()
    router = BrokerRouter(primary, fallback)

    new_pos = PositionInfo(
        ticket=888,
        symbol="EURUSD",
        type=OrderType.BUY,
        volume=0.01,
        open_price=1.0850,
        current_price=1.0850,
        sl=1.0800,
        tp=1.0900,
        profit=0.0,
        time=1000,
        magic=123456
    )

    # 1er appel à get_positions (avant ordre) -> vide
    # execute_order -> None (timeout)
    # 2eme appel à get_positions (après ordre) -> new_pos apparue
    primary.get_positions.side_effect = [[], [new_pos]]
    primary.execute_order.return_value = None

    res = router.execute_order("EURUSD", OrderType.BUY, 0.01, 1.0800, 1.0900, magic=123456)
    assert res is not None
    assert res["ticket"] == 888
    fallback.execute_order.assert_not_called()


def test_broker_router_does_not_falsely_match_preexisting_position():
    """Vérifie qu'une ancienne position ayant le même magic number n'est PAS confondue avec l'ordre expiré."""
    from infrastructure.broker_router import BrokerRouter
    from core.interfaces import PositionInfo, OrderType

    primary = MagicMock()
    fallback = MagicMock()
    fallback.connect.return_value = True
    fallback.execute_order.return_value = {"ticket": 999, "price": 1.0852, "volume": 0.01}
    router = BrokerRouter(primary, fallback)

    old_pos = PositionInfo(
        ticket=111,
        symbol="EURUSD",
        type=OrderType.BUY,
        volume=0.01,
        open_price=1.0820,
        current_price=1.0850,
        sl=1.0780,
        tp=1.0880,
        profit=3.0,
        time=500,
        magic=123456
    )

    # 1er appel (avant ordre) : old_pos existe déjà
    # execute_order -> None (timeout ambigu)
    # 2e appel (après ordre) : toujours seulement old_pos (aucune nouvelle position)
    primary.get_positions.side_effect = [[old_pos], [old_pos]]
    primary.execute_order.return_value = None

    res = router.execute_order("EURUSD", OrderType.BUY, 0.01, 1.0800, 1.0900, magic=123456)
    # Aucune nouvelle position prouvée : la position 111 pré-existante n'est PAS adoptée
    # et l'ordre est laissé INDETERMINATE (None -> 504 réconciliable) — pas de double exécution.
    assert res is None
    fallback.execute_order.assert_not_called()


