"""
Tests Phase T2 — MetaApiConnector & Routage BROKER_MODE (B-01, B-02, B-03)

Tests entièrement synchrones — aucun appel réel asyncio, MetaApi ou MT5.
Stratégie : on patch '_run_async' pour retourner directement les valeurs mockées
et on patch 'METAAPI_AVAILABLE' pour simuler la présence du SDK.
"""

import pytest
from unittest.mock import MagicMock, patch
from core.interfaces import OrderType, AccountInfo, PositionInfo


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

import asyncio

def _mock_run_async(ret_val):
    def side_effect(coro):
        if asyncio.iscoroutine(coro):
            coro.close()
        return ret_val
    return side_effect


def _make_connector(token="tok123", account_id="acc-abc", region="vint-hill"):
    """Instancie MetaApiConnector sans SDK réel (import tolérant)."""
    from infrastructure.metaapi_connector import MetaApiConnector
    return MetaApiConnector(token=token, account_id=account_id, region=region)


# ──────────────────────────────────────────────────────────────────────────────
# T2-01 : get_account_info via _run_async mocké
# ──────────────────────────────────────────────────────────────────────────────

def test_t2_metaapi_connect_and_account_info():
    """
    Vérifie que get_account_info() retourne un AccountInfo cohérent
    quand _run_async est mocké pour retourner directement la valeur.
    """
    from infrastructure.metaapi_connector import MetaApiConnector

    expected_info = AccountInfo(
        login=123456,
        balance=10000.0,
        equity=10050.0,
        free_margin=9500.0,
        margin_level=105.5,
        currency="USD",
        server="XMGlobal-MT5Demo5",
    )

    connector = _make_connector()
    connector.connected = True
    connector._connection = MagicMock()

    with patch("infrastructure.metaapi_connector.METAAPI_AVAILABLE", True), \
         patch("infrastructure.metaapi_connector._run_async", side_effect=_mock_run_async(expected_info)):
        info = connector.get_account_info()

    assert info is not None, "get_account_info doit retourner un AccountInfo"
    assert isinstance(info, AccountInfo)
    assert info.login == 123456
    assert info.balance == 10000.0
    assert info.currency == "USD"
    assert info.server == "XMGlobal-MT5Demo5"


# ──────────────────────────────────────────────────────────────────────────────
# T2-02 : Rejet obligatoire si SL absent ou nul (M-01)
# Pas besoin de _run_async ici — le rejet se fait AVANT tout appel async
# ──────────────────────────────────────────────────────────────────────────────

def test_t2_metaapi_execute_order_requires_stop_loss():
    """
    RÈGLE M-01 : execute_order doit lever ValueError si sl <= 0.
    Le rejet intervient AVANT tout appel réseau, donc pas de mock async nécessaire.
    """
    connector = _make_connector()
    connector.connected = True
    connector._connection = MagicMock()

    with patch("infrastructure.metaapi_connector.METAAPI_AVAILABLE", True):
        # sl = 0.0 → rejeté
        with pytest.raises(ValueError, match="Stop Loss obligatoire"):
            connector.execute_order("EURUSD", OrderType.BUY, 0.1, sl=0.0, tp=1.1300)

        # sl = -1.5 → rejeté
        with pytest.raises(ValueError, match="Stop Loss obligatoire"):
            connector.execute_order("EURUSD", OrderType.BUY, 0.1, sl=-1.5, tp=1.1300)

        # sl = None → rejeté
        with pytest.raises(ValueError, match="Stop Loss obligatoire"):
            connector.execute_order("GBPUSD", OrderType.SELL, 0.05, sl=None, tp=1.2600)  # type: ignore


# ──────────────────────────────────────────────────────────────────────────────
# T2-03 : Ordre avec SL valide — exécution + métriques M-15
# ──────────────────────────────────────────────────────────────────────────────

def test_t2_metaapi_execute_order_with_valid_sl_and_metrics():
    """
    Un ordre avec SL valide doit s'exécuter et le résultat doit contenir
    les champs ticket, symbol, latency_ms.
    _run_async est mocké pour renvoyer le résultat de l'ordre directement.
    """
    connector = _make_connector()
    connector.connected = True
    connector._connection = MagicMock()

    mock_metrics = MagicMock()
    connector._execution_metrics = mock_metrics

    expected_result = {
        "ticket": "pos-001",
        "symbol": "EURUSD",
        "order_type": "BUY",
        "volume": 0.1,
        "sl": 1.0850,
        "tp": 1.0950,
        "latency_ms": 125.3,
    }

    with patch("infrastructure.metaapi_connector.METAAPI_AVAILABLE", True), \
         patch("infrastructure.metaapi_connector._run_async", side_effect=_mock_run_async(expected_result)):
        result = connector.execute_order(
            symbol="EURUSD",
            order_type=OrderType.BUY,
            volume=0.1,
            sl=1.0850,
            tp=1.0950,
            magic=42,
        )

    assert result is not None, "execute_order doit retourner un dict non-None"
    assert result["ticket"] == "pos-001"
    assert result["symbol"] == "EURUSD"
    assert result["sl"] == 1.0850
    assert "latency_ms" in result
    assert result["latency_ms"] >= 0.0


# ──────────────────────────────────────────────────────────────────────────────
# T2-04 : get_positions et close_position mockés
# ──────────────────────────────────────────────────────────────────────────────

def test_t2_metaapi_positions_and_close_position():
    """
    Vérifie que get_positions() retourne une liste de PositionInfo
    et que close_position() retourne True en cas de succès mocké.
    """
    connector = _make_connector()
    connector.connected = True
    connector._connection = MagicMock()

    expected_positions = [
        PositionInfo(
            ticket=99001,
            symbol="EURUSD",
            type=OrderType.BUY,
            volume=0.1,
            open_price=1.0900,
            current_price=1.0920,
            sl=1.0850,
            tp=1.0950,
            profit=20.0,
            time=0,
            magic=1,
        )
    ]

    with patch("infrastructure.metaapi_connector.METAAPI_AVAILABLE", True), \
         patch("infrastructure.metaapi_connector._run_async", side_effect=_mock_run_async(expected_positions)):
        positions = connector.get_positions()

    assert len(positions) == 1
    pos = positions[0]
    assert isinstance(pos, PositionInfo)
    assert pos.ticket == 99001
    assert pos.symbol == "EURUSD"
    assert pos.type == OrderType.BUY
    assert pos.sl == 1.0850

    with patch("infrastructure.metaapi_connector.METAAPI_AVAILABLE", True), \
         patch("infrastructure.metaapi_connector._run_async", side_effect=_mock_run_async(True)):
        success = connector.close_position(99001)

    assert success is True


# ──────────────────────────────────────────────────────────────────────────────
# T2-05 : Timeouts adaptatifs selon BROKER_MODE (B-02)
# ──────────────────────────────────────────────────────────────────────────────

def test_t2_config_timeouts_adapt_to_broker_mode():
    """
    AppConfig.order_execution_timeout et data_fetch_timeout doivent
    retourner les valeurs cloud (12s / 15s) en mode 'metaapi' ou 'hybrid',
    et les valeurs locales (4s / 5s) en mode 'local_mt5'.
    """
    from infrastructure.config import AppConfig

    # Mode local
    cfg_local = AppConfig(BROKER_MODE="local_mt5", ENVIRONMENT="development")
    assert cfg_local.order_execution_timeout == cfg_local.ORDER_EXECUTION_TIMEOUT_LOCAL
    assert cfg_local.data_fetch_timeout == cfg_local.DATA_FETCH_TIMEOUT_LOCAL

    # Mode metaapi → cloud timeouts
    cfg_cloud = AppConfig(BROKER_MODE="metaapi", ENVIRONMENT="development")
    assert cfg_cloud.order_execution_timeout == cfg_cloud.ORDER_EXECUTION_TIMEOUT_CLOUD
    assert cfg_cloud.data_fetch_timeout == cfg_cloud.DATA_FETCH_TIMEOUT_CLOUD

    # Mode hybrid → cloud timeouts
    cfg_hybrid = AppConfig(BROKER_MODE="hybrid", ENVIRONMENT="development")
    assert cfg_hybrid.order_execution_timeout == cfg_hybrid.ORDER_EXECUTION_TIMEOUT_CLOUD
    assert cfg_hybrid.data_fetch_timeout == cfg_hybrid.DATA_FETCH_TIMEOUT_CLOUD

    # Valeurs par défaut
    assert cfg_local.ORDER_EXECUTION_TIMEOUT_LOCAL == 4.0
    assert cfg_cloud.ORDER_EXECUTION_TIMEOUT_CLOUD == 12.0
    assert cfg_local.DATA_FETCH_TIMEOUT_LOCAL == 5.0
    assert cfg_cloud.DATA_FETCH_TIMEOUT_CLOUD == 15.0


# ──────────────────────────────────────────────────────────────────────────────
# T2-06 : Fabrique create_connector_from_config sélectionne le bon connecteur
# ──────────────────────────────────────────────────────────────────────────────

def test_t2_broker_router_selects_metaapi_mode():
    """
    create_connector_from_config doit retourner :
    - MetaApiConnector en mode 'metaapi'
    - MT5Connector (mocké) en mode 'local_mt5'
    - BrokerRouter en mode 'hybrid' avec MetaApiConnector comme primary

    Note : MT5Connector est importé localement dans create_connector_from_config(),
    il faut donc le patcher à sa source (infrastructure.mt5_connector).
    """
    from infrastructure.config import AppConfig
    from infrastructure.broker_router import create_connector_from_config, BrokerRouter
    from infrastructure.metaapi_connector import MetaApiConnector

    mock_mt5_instance = MagicMock()

    # Patch MT5Connector à sa source pour intercepter l'import local dans create_connector_from_config
    with patch("infrastructure.mt5_connector.MT5Connector", return_value=mock_mt5_instance) as MockMT5:

        # ── Mode metaapi ──────────────────────────────────────────────────────
        cfg_meta = AppConfig(
            BROKER_MODE="metaapi",
            ENVIRONMENT="development",
            METAAPI_TOKEN="tok",
            METAAPI_ACCOUNT_ID="acc",
        )
        connector_meta = create_connector_from_config(cfg_meta)
        assert isinstance(connector_meta, MetaApiConnector), \
            "Mode 'metaapi' doit retourner MetaApiConnector"
        assert connector_meta._token == "tok"
        assert connector_meta._account_id == "acc"

        # ── Mode local_mt5 ────────────────────────────────────────────────────
        cfg_local = AppConfig(BROKER_MODE="local_mt5", ENVIRONMENT="development")
        connector_local = create_connector_from_config(cfg_local)
        assert not isinstance(connector_local, MetaApiConnector), \
            "Mode 'local_mt5' ne doit PAS retourner MetaApiConnector"
        MockMT5.assert_called()

        # ── Mode hybrid ───────────────────────────────────────────────────────
        cfg_hybrid = AppConfig(
            BROKER_MODE="hybrid",
            ENVIRONMENT="development",
            METAAPI_TOKEN="tok",
            METAAPI_ACCOUNT_ID="acc",
        )
        connector_hybrid = create_connector_from_config(cfg_hybrid)
        assert isinstance(connector_hybrid, BrokerRouter), \
            "Mode 'hybrid' doit retourner un BrokerRouter"
        assert isinstance(connector_hybrid.primary, MetaApiConnector), \
            "Le primary du BrokerRouter hybrid doit être MetaApiConnector"
