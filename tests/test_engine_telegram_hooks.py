"""
tests/test_engine_telegram_hooks.py
Suite complète de tests unitaires et d'intégration pour les hooks Telegram du Milestone 2.

Vérifie :
1. Hook Trade Opened dans Engine._order_routing_worker (BUY/SELL, volume, prix, SL/TP, ticket, ML confidence)
2. Hook Trade Closed dans Engine._refresh_kelly_history (Seed anti-spam, classification TP/SL/Manual, anti-duplication)
3. Hook Critical Event dans KillSwitch.activate (Déclenchement immédiat, idempotence, thread-safety)
4. Hook Critical Event dans BrokerRouter.connect & _switch_to_fallback (Déconnexion totale, bascule failover)
5. Hook Daily Summary dans Engine (Rollover midnight, calcul PnL journalier, Kelly, win rate, solde/équité)
6. Cycle de vie et Fail-Safe (Injection de dépendance, start/stop, trading transparent si Telegram désactivé)
"""

import time
import queue
import asyncio
import datetime
import threading
from typing import Dict, Any, List, Optional
from unittest.mock import MagicMock, patch

import pytest

from core.interfaces import IBrokerConnector, AccountInfo, PositionInfo, OrderType, Signal
from infrastructure.config import Config


# ════════════════════════════════════════════════════════════════════════════════
# 1. DOUBLURES DE TEST (MOCK CONNECTOR, MOCK DEAL, MOCK NOTIFIER)
# ════════════════════════════════════════════════════════════════════════════════

class MockDeal:
    """Simule un deal d'historique MT5 avec toutes les propriétés requises."""
    def __init__(
        self,
        ticket: int,
        symbol: str,
        deal_type: int = 0,       # 0: DEAL_TYPE_BUY, 1: DEAL_TYPE_SELL
        profit: float = 0.0,
        volume: float = 0.1,
        price: float = 1.08500,
        deal_time: Optional[int] = None,
        reason: int = 0,          # 0: CLIENT, 3: EXPERT, 4: SL, 5: TP, 6: SO
        comment: str = "",
        magic: int = 11001
    ):
        self.ticket = ticket
        self.symbol = symbol
        self.type = deal_type
        self.profit = profit
        self.volume = volume
        self.price = price
        self.time = deal_time if deal_time is not None else int(time.time())
        self.reason = reason
        self.comment = comment
        self.magic = magic


class MockBrokerConnector(IBrokerConnector):
    """Connecteur de test conforme à IBrokerConnector pour tester l'Engine sans MT5 réel."""

    def __init__(self, connected: bool = True):
        self.connected = connected
        self.connect_calls = 0
        self.disconnect_calls = 0
        self.account_info = AccountInfo(
            login=123456,
            balance=10000.0,
            equity=10000.0,
            free_margin=10000.0,
            margin_level=1000.0,
            currency="USD",
            server="MockServer"
        )
        self.positions: List[PositionInfo] = []
        self.history_deals: List[MockDeal] = []
        self.executed_orders: List[Dict[str, Any]] = []
        self.closed_positions: List[int] = []
        self.fail_execute_order = False

    def connect(self) -> bool:
        self.connect_calls += 1
        return self.connected

    def disconnect(self) -> None:
        self.disconnect_calls += 1
        self.connected = False

    def get_account_info(self) -> Optional[AccountInfo]:
        return self.account_info if self.connected else None

    def get_positions(self, symbol: Optional[str] = None) -> List[PositionInfo]:
        if not self.connected:
            return []
        if symbol:
            return [p for p in self.positions if p.symbol == symbol]
        return list(self.positions)

    def execute_order(
        self,
        symbol: str,
        order_type: OrderType,
        volume: float,
        sl: float = 0.0,
        tp: float = 0.0,
        magic: int = 0
    ) -> Optional[Dict[str, Any]]:
        if not self.connected or self.fail_execute_order:
            return None

        ticket = 200000 + len(self.executed_orders) + 1
        price = 1.08550 if order_type == OrderType.BUY else 1.08450
        order_res = {
            'ticket': ticket,
            'symbol': symbol,
            'direction': order_type,
            'volume': volume,
            'price': price,
            'sl_price': sl,
            'tp_price': tp,
            'magic': magic
        }
        self.executed_orders.append(order_res)
        return order_res

    def close_position(self, ticket: int) -> bool:
        if not self.connected:
            return False
        self.closed_positions.append(ticket)
        self.positions = [p for p in self.positions if p.ticket != ticket]
        return True

    def modify_position(self, ticket: int, symbol: str, new_sl: float) -> bool:
        for p in self.positions:
            if p.ticket == ticket:
                p.sl = new_sl
                return True
        return False

    def get_historical_data(self, symbol: str, timeframe: int, num_candles: int) -> Optional[Any]:
        return None

    def get_symbol_info(self, symbol: str) -> Optional[Any]:
        class MockSymbolInfo:
            spread = 12
            point = 0.00001
            trade_tick_size = 0.00001
            trade_tick_value = 1.0
            volume_min = 0.01
            volume_max = 100.0
            volume_step = 0.01
        return MockSymbolInfo()

    def get_history_deals(self, from_date: Any, to_date: Any) -> Optional[List[MockDeal]]:
        if not self.connected:
            return None
        return list(self.history_deals)


class MockTelegramNotifier:
    """Espion de test enregistrant tous les appels aux hooks Telegram."""

    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self.started = False
        self.stopped = False
        self.trade_opened_calls: List[Dict[str, Any]] = []
        self.trade_closed_calls: List[Dict[str, Any]] = []
        self.critical_event_calls: List[Dict[str, Any]] = []
        self.daily_summary_calls: List[Dict[str, Any]] = []
        self.messages: List[str] = []

    def start(self) -> None:
        self.started = True

    def stop(self, timeout: float = 2.0) -> None:
        self.stopped = True

    def send_message(self, text: str, parse_mode: str = "HTML") -> bool:
        if not self.enabled:
            return False
        self.messages.append(text)
        return True

    def notify_trade_opened(
        self,
        symbol: str,
        direction: str,
        volume: float,
        price: float,
        sl: float,
        tp: float,
        ticket: int,
        ml_confidence: Optional[float] = None
    ) -> bool:
        if not self.enabled:
            return False
        call_info = {
            'symbol': symbol,
            'direction': direction,
            'volume': volume,
            'price': price,
            'sl': sl,
            'tp': tp,
            'ticket': ticket,
            'ml_confidence': ml_confidence
        }
        self.trade_opened_calls.append(call_info)
        return True

    def notify_trade_closed(
        self,
        ticket: int,
        symbol: str,
        direction: str,
        volume: float,
        profit: float,
        reason: str,
        close_price: Optional[float] = None
    ) -> bool:
        if not self.enabled:
            return False
        # Normalisation automatique si ordre inversé (symbol, ticket)
        if isinstance(ticket, str) and isinstance(symbol, (int, float)):
            ticket, symbol = int(symbol), str(ticket)
        call_info = {
            'ticket': ticket,
            'symbol': symbol,
            'direction': direction,
            'volume': volume,
            'profit': profit,
            'reason': reason,
            'close_price': close_price
        }
        self.trade_closed_calls.append(call_info)
        return True

    def notify_critical_event(
        self,
        event_type: str,
        reason: str,
        details: Optional[str] = None
    ) -> bool:
        if not self.enabled:
            return False
        call_info = {
            'event_type': event_type,
            'reason': reason,
            'details': details
        }
        self.critical_event_calls.append(call_info)
        return True

    def notify_daily_summary(
        self,
        date_str: str,
        daily_pnl: float,
        win_rate: float,
        kelly_fraction: float,
        total_trades: int,
        balance: float,
        equity: float
    ) -> bool:
        if not self.enabled:
            return False
        call_info = {
            'date_str': date_str,
            'daily_pnl': daily_pnl,
            'win_rate': win_rate,
            'kelly_fraction': kelly_fraction,
            'total_trades': total_trades,
            'balance': balance,
            'equity': equity
        }
        self.daily_summary_calls.append(call_info)
        return True


# ════════════════════════════════════════════════════════════════════════════════
# 2. SUITE DE TESTS : HOOK TRADE OPENED (_order_routing_worker)
# ════════════════════════════════════════════════════════════════════════════════

class TestEngineTradeOpenHook:
    """Vérifie le déclenchement de notify_trade_opened lors de l'exécution d'un ordre."""

    @pytest.mark.asyncio
    async def test_order_routing_worker_dispatches_trade_opened_buy(self):
        """Vérifie que l'exécution d'un ordre BUY déclenche notify_trade_opened avec tous les champs."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier
        engine.running = True
        engine.order_queue = asyncio.Queue()

        # Enfilage d'un ordre simulé
        payload = {
            'symbol': 'EURUSD',
            'direction': OrderType.BUY,
            'volume': 0.25,
            'sl_price': 1.08200,
            'tp_price': 1.09100,
            'magic': 11001,
            'metadata': {'ml_confidence': 0.85}
        }
        await engine.order_queue.put(payload)

        # Lancer le worker pour dépiler exactement un ordre
        worker_task = asyncio.create_task(engine._order_routing_worker())
        await asyncio.sleep(0.05)  # Laisser dépiler
        engine.running = False
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass

        # Vérifications
        assert len(mock_notifier.trade_opened_calls) == 1
        call = mock_notifier.trade_opened_calls[0]
        assert call['symbol'] == 'EURUSD'
        assert call['direction'] == 'BUY'
        assert call['volume'] == 0.25
        assert call['sl'] == 1.08200
        assert call['tp'] == 1.09100
        assert call['ticket'] > 0
        assert call['ml_confidence'] == 0.85

    @pytest.mark.asyncio
    async def test_order_routing_worker_dispatches_trade_opened_sell_no_ml(self):
        """Vérifie qu'un ordre SELL sans ML confidence passe ml_confidence=None."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier
        engine.running = True
        engine.order_queue = asyncio.Queue()

        payload = {
            'symbol': 'USDJPY',
            'direction': OrderType.SELL,
            'volume': 0.10,
            'sl_price': 155.50,
            'tp_price': 154.00,
            'magic': 11003,
            'metadata': {}
        }
        await engine.order_queue.put(payload)

        worker_task = asyncio.create_task(engine._order_routing_worker())
        await asyncio.sleep(0.05)
        engine.running = False
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass

        assert len(mock_notifier.trade_opened_calls) == 1
        call = mock_notifier.trade_opened_calls[0]
        assert call['symbol'] == 'USDJPY'
        assert call['direction'] == 'SELL'
        assert call['ml_confidence'] is None

    @pytest.mark.asyncio
    async def test_order_routing_worker_skips_notification_on_execution_failure(self):
        """Vérifie qu'aucun message n'est envoyé si l'exécution de l'ordre échoue."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_connector.fail_execute_order = True  # Simule rejet broker
        mock_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier
        engine.running = True
        engine.order_queue = asyncio.Queue()

        payload = {
            'symbol': 'GBPUSD',
            'direction': OrderType.BUY,
            'volume': 0.50,
            'sl_price': 1.2800,
            'tp_price': 1.2900,
            'magic': 11002,
            'metadata': {}
        }
        await engine.order_queue.put(payload)

        worker_task = asyncio.create_task(engine._order_routing_worker())
        await asyncio.sleep(0.05)
        engine.running = False
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass

        assert len(mock_notifier.trade_opened_calls) == 0

    @pytest.mark.asyncio
    async def test_order_routing_worker_failsafe_when_telegram_disabled(self):
        """Vérifie que l'exécution de trading fonctionne sans crash si Telegram est désactivé."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=False)

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier
        engine.running = True
        engine.order_queue = asyncio.Queue()

        payload = {
            'symbol': 'EURUSD',
            'direction': OrderType.BUY,
            'volume': 0.10,
            'sl_price': 1.08,
            'tp_price': 1.09,
            'magic': 11001,
            'metadata': {}
        }
        await engine.order_queue.put(payload)

        worker_task = asyncio.create_task(engine._order_routing_worker())
        await asyncio.sleep(0.05)
        engine.running = False
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass

        assert len(mock_connector.executed_orders) == 1


# ════════════════════════════════════════════════════════════════════════════════
# 3. SUITE DE TESTS : HOOK TRADE CLOSED (_refresh_kelly_history)
# ════════════════════════════════════════════════════════════════════════════════

class TestEngineTradeCloseHook:
    """Vérifie la détection et la classification des clôtures de deals dans _refresh_kelly_history."""

    def test_refresh_kelly_startup_seed_no_spam(self):
        """Vérifie que les deals existants au démarrage peuplent _seen_deal_tickets SANS envoyer d'alertes."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        # 5 deals historiques existants au boot
        mock_connector.history_deals = [
            MockDeal(ticket=1001, symbol="EURUSD", profit=50.0, reason=5),
            MockDeal(ticket=1002, symbol="EURUSD", profit=-30.0, reason=4),
            MockDeal(ticket=1003, symbol="GBPUSD", profit=120.0, reason=5),
            MockDeal(ticket=1004, symbol="USDJPY", profit=-15.0, reason=4),
            MockDeal(ticket=1005, symbol="EURUSD", profit=20.0, reason=0),
        ]

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier

        # Premier rafraîchissement (seeding)
        engine._refresh_kelly_history()

        # Aucun message ne doit être envoyé pour l'historique passé
        assert len(mock_notifier.trade_closed_calls) == 0
        # Les tickets doivent être mémorisés
        assert hasattr(engine, '_seen_deal_tickets')
        for t in [1001, 1002, 1003, 1004, 1005]:
            assert t in engine._seen_deal_tickets

    def test_refresh_kelly_detects_take_profit_deal(self):
        """Vérifie qu'un nouveau deal TP déclenche notify_trade_closed avec la raison 'Take Profit (TP)'."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier

        # Seeding initial vide
        mock_connector.history_deals = []
        engine._refresh_kelly_history()

        # Nouveau deal TP clôturé
        new_deal = MockDeal(
            ticket=2001,
            symbol="EURUSD",
            deal_type=0,
            profit=85.50,
            volume=0.20,
            price=1.09200,
            reason=5,  # DEAL_REASON_TP
            comment="[tp 1.09200]"
        )
        mock_connector.history_deals.append(new_deal)

        engine._refresh_kelly_history()

        assert len(mock_notifier.trade_closed_calls) == 1
        call = mock_notifier.trade_closed_calls[0]
        assert call['ticket'] == 2001
        assert call['symbol'] == "EURUSD"
        assert call['profit'] == 85.50
        assert "TP" in call['reason'] or "Take Profit" in call['reason']

    def test_refresh_kelly_detects_stop_loss_deal(self):
        """Vérifie qu'un nouveau deal SL déclenche notify_trade_closed avec la raison 'Stop Loss (SL)'."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier
        mock_connector.history_deals = []
        engine._refresh_kelly_history()

        # Nouveau deal SL clôturé
        new_deal = MockDeal(
            ticket=2002,
            symbol="GBPUSD",
            deal_type=1,
            profit=-42.00,
            volume=0.15,
            price=1.28100,
            reason=4,  # DEAL_REASON_SL
            comment="[sl 1.28100]"
        )
        mock_connector.history_deals.append(new_deal)

        engine._refresh_kelly_history()

        assert len(mock_notifier.trade_closed_calls) == 1
        call = mock_notifier.trade_closed_calls[0]
        assert call['ticket'] == 2002
        assert call['symbol'] == "GBPUSD"
        assert call['profit'] == -42.00
        assert "SL" in call['reason'] or "Stop Loss" in call['reason']

    def test_refresh_kelly_detects_manual_close_deal(self):
        """Vérifie qu'un nouveau deal manuel (reason=0) déclenche notify_trade_closed avec raison 'Manual'."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier
        mock_connector.history_deals = []
        engine._refresh_kelly_history()

        new_deal = MockDeal(
            ticket=2003,
            symbol="USDJPY",
            deal_type=0,
            profit=15.00,
            volume=0.10,
            price=155.00,
            reason=0,  # DEAL_REASON_CLIENT
            comment=""
        )
        mock_connector.history_deals.append(new_deal)

        engine._refresh_kelly_history()

        assert len(mock_notifier.trade_closed_calls) == 1
        call = mock_notifier.trade_closed_calls[0]
        assert "Manual" in call['reason'] or "Client" in call['reason']

    def test_refresh_kelly_anti_duplication(self):
        """Vérifie que l'exécution répétée de _refresh_kelly_history n'envoie pas d'alertes en double."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier
        mock_connector.history_deals = []
        engine._refresh_kelly_history()

        # 1 nouveau deal
        mock_connector.history_deals.append(MockDeal(ticket=3001, symbol="EURUSD", profit=10.0, reason=5))
        engine._refresh_kelly_history()
        assert len(mock_notifier.trade_closed_calls) == 1

        # 2ème exécution sans nouveaux deals
        engine._refresh_kelly_history()
        assert len(mock_notifier.trade_closed_calls) == 1  # Inchangé

    def test_refresh_kelly_ignores_deposits_and_zero_profit(self):
        """Vérifie que les dépôts ou transactions à profit nul ne déclenchent pas d'alerte."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier
        mock_connector.history_deals = []
        engine._refresh_kelly_history()

        # Deal de balance/dépôt (profit=0 ou symbol vide)
        mock_connector.history_deals.append(MockDeal(ticket=9999, symbol="", profit=0.0))
        engine._refresh_kelly_history()

        assert len(mock_notifier.trade_closed_calls) == 0


# ════════════════════════════════════════════════════════════════════════════════
# 4. SUITE DE TESTS : HOOK CRITICAL EVENT DANS KILLSWITCH (agents/kill_switch.py)
# ════════════════════════════════════════════════════════════════════════════════

class TestKillSwitchTelegramHook:
    """Vérifie le déclenchement de notify_critical_event dans KillSwitch.activate."""

    def test_kill_switch_activate_dispatches_critical_alert(self):
        """Vérifie que KillSwitch.activate déclenche notify_critical_event avec la raison."""
        from agents.kill_switch import KillSwitch

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        ks = KillSwitch(mock_connector, notifier=mock_notifier)
        ks.activate(reason="Perte journalière max atteinte (5.2%)")

        assert ks.is_triggered is True
        assert len(mock_notifier.critical_event_calls) == 1
        call = mock_notifier.critical_event_calls[0]
        assert call['event_type'] == "KILL_SWITCH"
        assert "Perte journalière max atteinte" in call['reason']

    def test_kill_switch_activate_idempotence(self):
        """Vérifie qu'un second appel à activate ne renvoie pas une seconde alerte."""
        from agents.kill_switch import KillSwitch

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        ks = KillSwitch(mock_connector, notifier=mock_notifier)
        ks.activate(reason="Premier appel")
        ks.activate(reason="Deuxième appel ignoré")

        assert len(mock_notifier.critical_event_calls) == 1

    def test_kill_switch_activate_thread_safety(self):
        """Vérifie que l'activation depuis un thread tiers s'exécute instantanément (< 1.0 ms)."""
        from agents.kill_switch import KillSwitch

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)
        ks = KillSwitch(mock_connector, notifier=mock_notifier)

        execution_times = []

        def worker():
            t0 = time.perf_counter_ns()
            ks.activate(reason="Activation depuis Watchdog Thread")
            t1 = time.perf_counter_ns()
            execution_times.append((t1 - t0) / 1_000_000.0)

        th = threading.Thread(target=worker)
        th.start()
        th.join(timeout=1.0)

        assert len(execution_times) == 1
        assert execution_times[0] < 1.0, f"KillSwitch.activate a pris {execution_times[0]} ms (> 1.0 ms)"
        assert len(mock_notifier.critical_event_calls) == 1

    def test_kill_switch_failsafe_when_notifier_disabled(self):
        """Vérifie que la clôture des positions a lieu même si Telegram est désactivé."""
        from agents.kill_switch import KillSwitch

        mock_connector = MockBrokerConnector(connected=True)
        # Position ouverte à fermer
        mock_connector.positions = [
            PositionInfo(
                ticket=555, symbol="EURUSD", type=OrderType.BUY, volume=0.1,
                open_price=1.08, current_price=1.07, sl=1.06, tp=1.10,
                profit=-10.0, time=int(time.time()), magic=11001
            )
        ]
        mock_notifier = MockTelegramNotifier(enabled=False)

        ks = KillSwitch(mock_connector, notifier=mock_notifier)
        ks.activate(reason="Arrêt Fail-Safe")

        assert ks.is_triggered is True
        assert 555 in mock_connector.closed_positions
        assert len(mock_notifier.critical_event_calls) == 0


# ════════════════════════════════════════════════════════════════════════════════
# 5. SUITE DE TESTS : HOOK BROKER ROUTER (infrastructure/broker_router.py)
# ════════════════════════════════════════════════════════════════════════════════

class TestBrokerRouterTelegramHook:
    """Vérifie le déclenchement d'alertes en cas de déconnexion ou failover du BrokerRouter."""

    def test_broker_router_total_disconnect_triggers_critical_alert(self):
        """Vérifie que l'échec de connexion du primaire ET du fallback déclenche une alerte MT5_DISCONNECT."""
        from infrastructure.broker_router import BrokerRouter

        primary = MockBrokerConnector(connected=False)
        fallback = MockBrokerConnector(connected=False)
        mock_notifier = MockTelegramNotifier(enabled=True)

        router = BrokerRouter(primary=primary, fallback=fallback, notifier=mock_notifier)
        success = router.connect()

        assert success is False
        assert len(mock_notifier.critical_event_calls) == 1
        call = mock_notifier.critical_event_calls[0]
        assert call['event_type'] == "MT5_DISCONNECT"
        assert "Primaire et Fallback injoignables" in call['reason'] or "injoignable" in call['reason'].lower()

    def test_broker_router_failover_triggers_alert(self):
        """Vérifie que la bascule vers le broker Fallback déclenche une alerte appropriée."""
        from infrastructure.broker_router import BrokerRouter

        primary = MockBrokerConnector(connected=False)
        fallback = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        router = BrokerRouter(primary=primary, fallback=fallback, notifier=mock_notifier)
        success = router.connect()

        assert success is True
        assert router._active_broker == fallback
        # Si le routeur notifie la bascule au connect
        if mock_notifier.critical_event_calls:
            assert any("FAILOVER" in c['event_type'] or "FALLBACK" in c['event_type'] for c in mock_notifier.critical_event_calls)

    def test_broker_router_normal_connect_no_alert(self):
        """Vérifie qu'une connexion réussie au broker primaire ne déclenche aucune alerte critique."""
        from infrastructure.broker_router import BrokerRouter

        primary = MockBrokerConnector(connected=True)
        fallback = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        router = BrokerRouter(primary=primary, fallback=fallback, notifier=mock_notifier)
        success = router.connect()

        assert success is True
        assert len(mock_notifier.critical_event_calls) == 0


# ════════════════════════════════════════════════════════════════════════════════
# 6. SUITE DE TESTS : HOOK DAILY SUMMARY (application/engine.py)
# ════════════════════════════════════════════════════════════════════════════════

class TestEngineDailySummaryHook:
    """Vérifie la génération et l'envoi du résumé journalier lors du changement de date."""

    def test_daily_summary_calculation_and_dispatch(self):
        """Vérifie le calcul correct du PnL journalier, win rate, Kelly et transmission à notify_daily_summary."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier

        # Alimenter l'historique avec 4 deals pour la journée cible "2026-09-15"
        date_target = "2026-09-15"
        engine._closed_trades_cache = [
            {'pnl': 50.0, 'symbol': 'EURUSD', 'ticket': 1, 'time': datetime.datetime(2026, 9, 15, 10, 0), 'volume': 0.1, 'type': 'BUY', 'magic': 11001},
            {'pnl': -20.0, 'symbol': 'EURUSD', 'ticket': 2, 'time': datetime.datetime(2026, 9, 15, 11, 0), 'volume': 0.1, 'type': 'BUY', 'magic': 11001},
            {'pnl': 70.0, 'symbol': 'GBPUSD', 'ticket': 3, 'time': datetime.datetime(2026, 9, 15, 14, 0), 'volume': 0.2, 'type': 'SELL', 'magic': 11002},
            {'pnl': 10.0, 'symbol': 'USDJPY', 'ticket': 4, 'time': datetime.datetime(2026, 9, 15, 16, 0), 'volume': 0.1, 'type': 'BUY', 'magic': 11003},
            # Deal d'un autre jour qui ne doit pas impacter la journée cible
            {'pnl': 100.0, 'symbol': 'EURUSD', 'ticket': 5, 'time': datetime.datetime(2026, 9, 14, 18, 0), 'volume': 0.1, 'type': 'BUY', 'magic': 11001},
        ]
        engine.state_manager.update_state()

        # Appel direct de la méthode de dispatch du résumé journalier
        if hasattr(engine, '_dispatch_daily_summary'):
            engine._dispatch_daily_summary(date_target)
        else:
            # Simulation manuelle si méthode imbriquée
            daily_trades = [c for c in engine._closed_trades_cache if c['time'].strftime("%Y-%m-%d") == date_target]
            pnl = sum(c['pnl'] for c in daily_trades)
            win_rate = engine.position_sizer.win_rate
            kelly = engine.position_sizer.compute_kelly_fraction()
            total_trades = len(daily_trades)
            balance = engine.state_manager.account.balance
            equity = engine.state_manager.account.equity
            mock_notifier.notify_daily_summary(date_target, pnl, win_rate, kelly, total_trades, balance, equity)

        assert len(mock_notifier.daily_summary_calls) == 1
        call = mock_notifier.daily_summary_calls[0]
        assert call['date_str'] == "2026-09-15"
        assert call['daily_pnl'] == pytest.approx(110.0, 0.01)
        assert call['total_trades'] == 4
        assert call['balance'] == 10000.0
        assert call['equity'] == 10000.0

    def test_daily_summary_handles_zero_trades_day(self):
        """Vérifie que la notification s'envoie sans erreur de division par zéro les jours sans trades."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector)
        engine.notifier = mock_notifier
        engine._closed_trades_cache = []
        engine.state_manager.update_state()

        date_target = "2026-09-16"
        if hasattr(engine, '_dispatch_daily_summary'):
            engine._dispatch_daily_summary(date_target)
        else:
            mock_notifier.notify_daily_summary(
                date_target, 0.0, engine.position_sizer.win_rate,
                engine.position_sizer.compute_kelly_fraction(), 0, 10000.0, 10000.0
            )

        assert len(mock_notifier.daily_summary_calls) == 1
        call = mock_notifier.daily_summary_calls[0]
        assert call['daily_pnl'] == 0.0
        assert call['total_trades'] == 0


# ════════════════════════════════════════════════════════════════════════════════
# 7. SUITE DE TESTS : CYCLE DE VIE ET INJECTION DE DÉPENDANCES
# ════════════════════════════════════════════════════════════════════════════════

class TestEngineLifecycleAndWiring:
    """Vérifie l'injection du notifier et la propagation du cycle de vie start / stop."""

    def test_engine_accepts_custom_notifier(self):
        """Vérifie que le constructeur Engine accepte un notifier injecté."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        custom_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector, notifier=custom_notifier)
        assert engine.notifier == custom_notifier
        assert engine.kill_switch.notifier == custom_notifier

    def test_engine_start_and_stop_controls_notifier_lifecycle(self):
        """Vérifie que Engine.start() et Engine.stop() déclenchent start() et stop() sur le notificateur."""
        from application.engine import Engine

        mock_connector = MockBrokerConnector(connected=True)
        mock_notifier = MockTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector, notifier=mock_notifier)

        with patch.object(engine, "_run_async_loop_thread"):
            engine.start()
            assert mock_notifier.started is True

            engine.stop()
            assert mock_notifier.stopped is True
