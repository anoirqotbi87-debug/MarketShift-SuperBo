"""
test_risk_m06_order_reconciliation.py — Tests unitaires pour M-06 : Réconciliation des ordres fantômes (timeout MT5)
"""
import pytest
import asyncio
from unittest.mock import MagicMock
from core.interfaces import OrderType, PositionInfo, AccountInfo
from application.engine import Engine

def _pos(ticket, symbol="EURUSD", order_type=OrderType.BUY, volume=0.05, magic=10001, comment="ms_key"):
    return PositionInfo(
        ticket=ticket,
        symbol=symbol,
        type=order_type,
        volume=volume,
        open_price=1.0850,
        current_price=1.0855,
        sl=1.0800,
        tp=1.0900,
        profit=25.0,
        time=1005,
        magic=magic,
        comment=comment
    )


@pytest.fixture
def mock_engine():
    connector = MagicMock()
    connector.connect.return_value = True
    connector.get_account_info.return_value = AccountInfo(
        login=123456,
        balance=10000.0,
        equity=10000.0,
        free_margin=10000.0,
        margin_level=100.0,
        currency="USD",
        server="DemoServer"
    )
    connector.get_positions.return_value = []
    
    notifier = MagicMock()
    engine = Engine(connector=connector, notifier=notifier)
    return engine

@pytest.mark.asyncio
async def test_reconcile_orphan_order_success(mock_engine):
    # Simuler un ordre ayant subi un timeout
    payload = {
        'symbol': 'EURUSD',
        'direction': OrderType.BUY,
        'volume': 0.05,
        'sl_price': 1.0800,
        'tp_price': 1.0900,
        'magic': 10001,
        'order_comment': 'ms_key',
        'pre_snapshot_ok': True,
        'pre_existing_tickets': [],
        'retries': 0,
        'timeout_at': 1000.0
    }
    mock_engine._pending_reconciliation.append(payload)

    # Simuler l'apparition de la position chez le broker (ordre exécuté malgré le timeout)
    discovered_pos = _pos(777123, comment="ms_key")
    mock_engine.state_manager._positions = [discovered_pos]

    # Exécution de la réconciliation
    await mock_engine._reconcile_orphan_orders()

    # Vérifications
    assert 777123 in mock_engine._known_position_tickets
    assert len(mock_engine._pending_reconciliation) == 0
    mock_engine.notifier.notify_critical_event.assert_called_once()
    call_args = mock_engine.notifier.notify_critical_event.call_args[0]
    assert call_args[0] == "ORPHAN_ORDER_ADOPTED"
    assert "EURUSD" in mock_engine.notifier.notify_critical_event.call_args[1]["reason"]

import time

@pytest.mark.asyncio
async def test_reconcile_orphan_order_abandonment_after_retries(mock_engine):
    payload = {
        'symbol': 'GBPUSD',
        'direction': OrderType.SELL,
        'volume': 0.10,
        'sl_price': 1.3000,
        'tp_price': 1.2800,
        'magic': 10002,
        'order_comment': 'ms_sell',
        'pre_snapshot_ok': True,
        'pre_existing_tickets': [],
        'retries': 0,
        'timeout_at': time.time()
    }
    mock_engine._pending_reconciliation.append(payload)
    mock_engine.state_manager._positions = []  # Aucune position chez le broker

    # Cycles 1 et 2 : l'ordre reste en attente
    await mock_engine._reconcile_orphan_orders()
    assert len(mock_engine._pending_reconciliation) == 1
    assert mock_engine._pending_reconciliation[0]['retries'] == 1

    await mock_engine._reconcile_orphan_orders()
    assert len(mock_engine._pending_reconciliation) == 1
    assert mock_engine._pending_reconciliation[0]['retries'] == 2

    # Cycle 3 : abandon définitif
    await mock_engine._reconcile_orphan_orders()
    assert len(mock_engine._pending_reconciliation) == 0
    assert len(mock_engine._known_position_tickets) == 0
    mock_engine.notifier.notify_critical_event.assert_not_called()

@pytest.mark.asyncio
async def test_reconcile_orphan_order_abandonment_after_time_elapsed(mock_engine):
    # Timeout survenu il y a 20 secondes (> 15s)
    payload = {
        'symbol': 'EURUSD',
        'direction': OrderType.BUY,
        'volume': 0.05,
        'sl_price': 1.0800,
        'tp_price': 1.0900,
        'magic': 10001,
        'order_comment': 'ms_key',
        'pre_snapshot_ok': True,
        'pre_existing_tickets': [],
        'retries': 0,
        'timeout_at': time.time() - 20.0
    }
    mock_engine._pending_reconciliation.append(payload)
    mock_engine.state_manager._positions = []

    await mock_engine._reconcile_orphan_orders()
    assert len(mock_engine._pending_reconciliation) == 0

@pytest.mark.asyncio
async def test_do_not_reconcile_already_known_ticket(mock_engine):
    # Le ticket 999111 est déjà connu
    mock_engine._known_position_tickets.add(999111)

    payload = {
        'symbol': 'EURUSD',
        'direction': OrderType.BUY,
        'volume': 0.05,
        'sl_price': 1.0800,
        'tp_price': 1.0900,
        'magic': 10001,
        'order_comment': 'ms_key',
        'pre_snapshot_ok': True,
        'pre_existing_tickets': [],
        'retries': 0,
        'timeout_at': time.time()
    }
    mock_engine._pending_reconciliation.append(payload)

    # Position déjà connue chez le broker
    existing_pos = _pos(999111, comment="ms_key")
    mock_engine.state_manager._positions = [existing_pos]

    # Exécution de la réconciliation : ne doit pas l'adopter à nouveau
    await mock_engine._reconcile_orphan_orders()
    assert len(mock_engine._pending_reconciliation) == 1
    assert mock_engine._pending_reconciliation[0]['retries'] == 1
    mock_engine.notifier.notify_critical_event.assert_not_called()

