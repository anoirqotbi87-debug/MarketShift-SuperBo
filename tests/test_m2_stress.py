"""
tests/test_m2_stress.py
Suite de stress-tests empiriques pour les hooks de trading du Milestone 2.

Exigences de stress (Challenger M2) :
1. Cold Start Anti-Spam :
   - Un moteur démarrant avec 100 deals fermés historiques dans le connecteur dispatche exactement 0 alerte.
   - Au cycle 2, un nouveau deal (101e) dispatche exactement 1 alerte.
   - Au cycle 3, les 101 deals existants dispatchent 0 alerte en double.
2. Deal Reason Classification :
   - Stress-test de _refresh_kelly_history et _classify_deal_close_reason sur l'ensemble des types :
     - TP comment ("[tp 1.09200]", "tp hit") -> "Take Profit (TP)"
     - SL comment ("[sl 1.08000]", "sl triggered") -> "Stop Loss (SL)"
     - reason 4 (DEAL_REASON_SL) -> "Stop Loss (SL)"
     - reason 5 (DEAL_REASON_TP) -> "Take Profit (TP)"
     - reason 0 (DEAL_REASON_CLIENT) -> "Manual / Client"
     - reason 6 (DEAL_REASON_SO) -> "Stop Out (Margin Call)"
     - reason 3 (DEAL_REASON_EXPERT) -> "Expert Advisor (EA)"
     - reason 1 (DEAL_REASON_MOBILE) -> "Manual / Mobile"
     - reason 2 (DEAL_REASON_WEB) -> "Manual / Web"
     - reason inconnu -> "Closed / Market"
3. Rapid Concurrent Orders :
   - Ingestion rapide de 50 ordres dans order_queue.
   - Mesure du débit de dépilement / exécution par _order_routing_worker.
   - Vérification de la livraison des 50 notifications Trade Opened correspondantes.
4. Latence de blocage du thread appelant :
   - Mesure empirique du temps de retour de chaque hook (< 1.0 ms).
   - Test sous latence réseau simulée de 2000 ms dans le daemon.
"""

import time
import asyncio
import threading
import statistics
from typing import Dict, Any, List, Optional
from unittest.mock import MagicMock, patch

import pytest

from core.interfaces import IBrokerConnector, AccountInfo, PositionInfo, OrderType, Signal
from infrastructure.config import Config


# ════════════════════════════════════════════════════════════════════════════════
# 1. DOUBLURES DE TEST HAUTE PERFORMANCE
# ════════════════════════════════════════════════════════════════════════════════

class StressDeal:
    """Deal MT5 simulé pour les stress-tests."""
    def __init__(
        self,
        ticket: int,
        symbol: str = "EURUSD",
        deal_type: int = 0,
        profit: float = 25.0,
        volume: float = 0.1,
        price: float = 1.08500,
        deal_time: Optional[int] = None,
        reason: int = 0,
        comment: str = "",
        magic: int = 11001,
        entry: int = 1
    ):
        self.ticket = ticket
        self.position_id = ticket
        self.symbol = symbol
        self.type = deal_type
        self.profit = profit
        self.volume = volume
        self.price = price
        self.time = deal_time if deal_time is not None else int(time.time())
        self.reason = reason
        self.comment = comment
        self.magic = magic
        self.entry = entry


class StressBrokerConnector(IBrokerConnector):
    """Connecteur broker mock pour stress-tests sans MT5 réel."""
    def __init__(self, connected: bool = True):
        self.connected = connected
        self.history_deals: List[StressDeal] = []
        self.executed_orders: List[Dict[str, Any]] = []
        self.account_info = AccountInfo(
            login=999999, balance=50000.0, equity=50000.0,
            free_margin=50000.0, margin_level=1000.0,
            currency="USD", server="StressServer"
        )
        self.positions: List[PositionInfo] = []

    def connect(self) -> bool:
        return self.connected

    def disconnect(self) -> None:
        self.connected = False

    def get_account_info(self) -> Optional[AccountInfo]:
        return self.account_info if self.connected else None

    def get_positions(self, symbol: Optional[str] = None) -> List[PositionInfo]:
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
        if not self.connected:
            return None
        ticket = 300000 + len(self.executed_orders) + 1
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
        self.positions = [p for p in self.positions if p.ticket != ticket]
        return True

    def modify_position(self, ticket: int, symbol: str, new_sl: float) -> bool:
        return True

    def get_historical_data(self, symbol: str, timeframe: int, num_candles: int) -> Optional[Any]:
        return None

    def get_symbol_info(self, symbol: str) -> Optional[Any]:
        class Info:
            spread = 10
            point = 0.00001
            trade_tick_size = 0.00001
            trade_tick_value = 1.0
            volume_min = 0.01
            volume_max = 100.0
            volume_step = 0.01
        return Info()

    def get_history_deals(self, from_date: Any, to_date: Any) -> Optional[List[StressDeal]]:
        if not self.connected:
            return None
        return list(self.history_deals)


class StressTelegramNotifier:
    """Espion haute précision pour mesurer les notifications et les temps d'appel."""
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self.trade_opened_calls: List[Dict[str, Any]] = []
        self.trade_closed_calls: List[Dict[str, Any]] = []
        self.critical_event_calls: List[Dict[str, Any]] = []
        self.daily_summary_calls: List[Dict[str, Any]] = []

    def start(self) -> None:
        pass

    def stop(self, timeout: float = 2.0) -> None:
        pass

    def notify_trade_opened(self, symbol: str, direction: str, volume: float, price: float,
                            sl: float, tp: float, ticket: int, ml_confidence: Optional[float] = None) -> bool:
        if not self.enabled:
            return False
        self.trade_opened_calls.append({
            'symbol': symbol, 'direction': direction, 'volume': volume,
            'price': price, 'sl': sl, 'tp': tp, 'ticket': ticket,
            'ml_confidence': ml_confidence
        })
        return True

    def notify_trade_closed(self, ticket: int, symbol: str, direction: str, volume: float,
                            profit: float, reason: str, close_price: Optional[float] = None) -> bool:
        if not self.enabled:
            return False
        self.trade_closed_calls.append({
            'ticket': ticket, 'symbol': symbol, 'direction': direction,
            'volume': volume, 'profit': profit, 'reason': reason,
            'close_price': close_price
        })
        return True

    def notify_critical_event(self, event_type: str, reason: str, details: Optional[str] = None) -> bool:
        if not self.enabled:
            return False
        self.critical_event_calls.append({
            'event_type': event_type, 'reason': reason, 'details': details
        })
        return True

    def notify_daily_summary(self, date_str: str, daily_pnl: float, win_rate: float,
                             kelly_fraction: float, total_trades: int, balance: float, equity: float) -> bool:
        if not self.enabled:
            return False
        self.daily_summary_calls.append({
            'date_str': date_str, 'daily_pnl': daily_pnl, 'win_rate': win_rate,
            'kelly_fraction': kelly_fraction, 'total_trades': total_trades,
            'balance': balance, 'equity': equity
        })
        return True


# ════════════════════════════════════════════════════════════════════════════════
# 2. STRESS-TEST 1 : COLD START ANTI-SPAM (100 DEALS HISTORIQUES -> 0 ALERTE)
# ════════════════════════════════════════════════════════════════════════════════

class TestColdStartAntiSpamStress:
    """Stress-test 1 : Validation de l'absence totale d'alertes au démarrage à froid avec 100 deals."""

    def test_cold_start_with_100_deals_dispatches_zero_alerts(self):
        from application.engine import Engine

        mock_connector = StressBrokerConnector(connected=True)
        mock_notifier = StressTelegramNotifier(enabled=True)

        # Génération de 100 deals historiques fermés avec divers profits et raisons
        historical_deals = []
        for i in range(1, 101):
            pnl = 15.50 if i % 2 == 0 else -10.25
            reason_code = 5 if i % 2 == 0 else 4
            deal = StressDeal(
                ticket=10000 + i,
                symbol="EURUSD" if i % 3 == 0 else "GBPUSD",
                profit=pnl,
                reason=reason_code,
                comment=f"historical deal #{i}"
            )
            historical_deals.append(deal)

        mock_connector.history_deals = historical_deals

        # Initialisation de l'Engine
        engine = Engine(connector=mock_connector, notifier=mock_notifier)
        assert engine._deals_initialized is False
        assert len(engine._seen_deal_tickets) == 0

        # Cycle 1 : Démarrage à froid (Cold Start)
        engine._refresh_kelly_history()

        # Vérification 1 : Exactement 0 alerte envoyée
        assert len(mock_notifier.trade_closed_calls) == 0, (
            f"VIOLATION ANTI-SPAM: {len(mock_notifier.trade_closed_calls)} alertes envoyées au boot !"
        )

        # Vérification 2 : Les 100 tickets sont tous enregistrés dans _seen_deal_tickets
        assert engine._deals_initialized is True
        assert len(engine._seen_deal_tickets) == 100
        for i in range(1, 101):
            assert (10000 + i) in engine._seen_deal_tickets

        # Cycle 2 : Arrivée d'un 101e deal en temps réel
        new_deal = StressDeal(
            ticket=20001,
            symbol="EURUSD",
            profit=45.0,
            reason=5,
            comment="[tp 1.0950]"
        )
        mock_connector.history_deals.append(new_deal)
        engine._refresh_kelly_history()

        # Vérification 3 : Exactement 1 seule alerte déclenchée pour le nouveau deal
        assert len(mock_notifier.trade_closed_calls) == 1
        assert mock_notifier.trade_closed_calls[0]['ticket'] == 20001
        assert mock_notifier.trade_closed_calls[0]['profit'] == 45.0
        assert "Take Profit (TP)" in mock_notifier.trade_closed_calls[0]['reason']

        # Cycle 3 : Re-scan sans nouveau deal (anti-duplication)
        engine._refresh_kelly_history()
        assert len(mock_notifier.trade_closed_calls) == 1, (
            "VIOLATION ANTI-DUPLICATION: Ré-émission d'alerte sur deal déjà notifié !"
        )


# ════════════════════════════════════════════════════════════════════════════════
# 3. STRESS-TEST 2 : DEAL REASON CLASSIFICATION STRESS
# ════════════════════════════════════════════════════════════════════════════════

class TestDealReasonClassificationStress:
    """Stress-test 2 : Vérification exhaustive du mapping des raisons de deal."""

    @pytest.mark.parametrize("reason_code, comment, expected_label", [
        # Take Profit
        (5, "", "Take Profit (TP)"),
        (0, "[tp 1.0850]", "Take Profit (TP)"),
        (0, "tp hit", "Take Profit (TP)"),
        (0, "closed at tp", "Take Profit (TP)"),
        (3, "[tp]", "Take Profit (TP)"),
        # Stop Loss
        (4, "", "Stop Loss (SL)"),
        (0, "[sl 1.0750]", "Stop Loss (SL)"),
        (0, "sl hit", "Stop Loss (SL)"),
        (0, "closed at sl", "Stop Loss (SL)"),
        (3, "[sl]", "Stop Loss (SL)"),
        # Stop Out
        (6, "", "Stop Out (Margin Call)"),
        (0, "so: margin call", "Stop Out (Margin Call)"),
        (0, "stop out triggered", "Stop Out (Margin Call)"),
        # Manual / Client
        (0, "", "Manual / Client"),
        (0, "client manual close", "Manual / Client"),
        (0, "manual intervention", "Manual / Client"),
        # Manual / Mobile & Web
        (1, "", "Manual / Mobile"),
        (2, "", "Manual / Web"),
        # Expert Advisor
        (3, "", "Expert Advisor (EA)"),
        (3, "expert close", "Expert Advisor (EA)"),
        (0, "marketshift closed", "Expert Advisor (EA)"),
        # Unclassified
        (99, "unknown reason", "Closed / Market"),
    ])
    def test_classify_deal_close_reason_mapping(self, reason_code, comment, expected_label):
        from application.engine import Engine

        mock_connector = StressBrokerConnector(connected=True)
        engine = Engine(connector=mock_connector)

        deal = StressDeal(
            ticket=999,
            symbol="EURUSD",
            profit=10.0,
            reason=reason_code,
            comment=comment
        )
        actual_label = engine._classify_deal_close_reason(deal)
        assert actual_label == expected_label, (
            f"Échec classification: reason={reason_code}, comment='{comment}' -> "
            f"obtenu '{actual_label}', attendu '{expected_label}'"
        )

    def test_refresh_kelly_history_dispatches_correct_classification(self):
        """Vérifie que _refresh_kelly_history transmet le motif exact à notify_trade_closed."""
        from application.engine import Engine

        mock_connector = StressBrokerConnector(connected=True)
        mock_notifier = StressTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector, notifier=mock_notifier)
        mock_connector.history_deals = []
        engine._refresh_kelly_history()  # Seed vide

        test_cases = [
            (3001, 5, "", "Take Profit (TP)"),
            (3002, 4, "", "Stop Loss (SL)"),
            (3003, 0, "", "Manual / Client"),
            (3004, 6, "", "Stop Out (Margin Call)"),
            (3005, 3, "", "Expert Advisor (EA)"),
            (3006, 0, "[tp]", "Take Profit (TP)"),
            (3007, 0, "[sl]", "Stop Loss (SL)"),
        ]

        for ticket, reason_code, comment, expected_reason in test_cases:
            deal = StressDeal(
                ticket=ticket,
                symbol="EURUSD",
                profit=20.0,
                reason=reason_code,
                comment=comment
            )
            mock_connector.history_deals.append(deal)

        engine._refresh_kelly_history()

        assert len(mock_notifier.trade_closed_calls) == len(test_cases)
        for i, (ticket, _, _, expected_reason) in enumerate(test_cases):
            call = mock_notifier.trade_closed_calls[i]
            assert call['ticket'] == ticket
            assert call['reason'] == expected_reason


# ════════════════════════════════════════════════════════════════════════════════
# 4. STRESS-TEST 3 : RAPID CONCURRENT ORDERS (50 ORDRES DANS ORDER_QUEUE)
# ════════════════════════════════════════════════════════════════════════════════

class TestRapidConcurrentOrdersStress:
    """Stress-test 3 : Ingestion rapide de 50 ordres et vérification du worker et des notifications."""

    @pytest.mark.asyncio
    async def test_rapid_ingestion_50_orders(self):
        from application.engine import Engine

        mock_connector = StressBrokerConnector(connected=True)
        mock_notifier = StressTelegramNotifier(enabled=True)

        engine = Engine(connector=mock_connector, notifier=mock_notifier)
        engine.running = True
        engine.order_queue = asyncio.Queue()

        # Démarrage du worker asynchrone
        worker_task = asyncio.create_task(engine._order_routing_worker())

        # Ingestion en rafale de 50 ordres dans order_queue
        t_start = time.perf_counter_ns()
        for i in range(50):
            direction = OrderType.BUY if i % 2 == 0 else OrderType.SELL
            payload = {
                'symbol': 'EURUSD' if i % 3 == 0 else 'GBPUSD',
                'direction': direction,
                'volume': round(0.1 + (i * 0.01), 2),
                'sl_price': 1.08000,
                'tp_price': 1.09000,
                'magic': 11001 + (i % 5),
                'metadata': {'ml_confidence': 0.70 + (i % 30) * 0.01}
            }
            await engine.order_queue.put(payload)
        t_enqueue = time.perf_counter_ns()
        enqueue_duration_ms = (t_enqueue - t_start) / 1_000_000.0

        # Attendre que la file soit complètement vidée
        await asyncio.wait_for(engine.order_queue.join(), timeout=5.0)
        t_done = time.perf_counter_ns()
        drain_duration_ms = (t_done - t_enqueue) / 1_000_000.0

        # Arrêt propre du worker
        engine.running = False
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass

        # Vérifications
        assert enqueue_duration_ms < 50.0, f"Ingestion trop lente: {enqueue_duration_ms} ms pour 50 ordres"
        assert len(mock_connector.executed_orders) == 50, (
            f"Ordres exécutés: {len(mock_connector.executed_orders)} / 50 attendus"
        )
        assert len(mock_notifier.trade_opened_calls) == 50, (
            f"Alertes Trade Opened reçues: {len(mock_notifier.trade_opened_calls)} / 50 attendues"
        )

        # Vérifier l'intégrité du premier et du dernier ordre notifié
        first_call = mock_notifier.trade_opened_calls[0]
        assert first_call['symbol'] == 'EURUSD'
        assert first_call['direction'] == 'BUY'
        assert first_call['volume'] == 0.10
        assert first_call['ticket'] == 300001

        last_call = mock_notifier.trade_opened_calls[49]
        assert last_call['direction'] == 'SELL'
        assert last_call['volume'] == pytest.approx(0.59, 0.01)
        assert last_call['ticket'] == 300050


# ════════════════════════════════════════════════════════════════════════════════
# 5. STRESS-TEST 4 : MESURE DE LATENCE DE BLOCAGE DU THREAD (< 1.0 MS)
# ════════════════════════════════════════════════════════════════════════════════

class TestCallerThreadBlockingLatencyStress:
    """Stress-test 4 : Mesure systématique du temps de blocage de l'appelant sur tous les hooks (< 1.0 ms)."""

    def test_all_hooks_blocking_latency_under_one_millisecond(self):
        from infrastructure.telegram_notifier import TelegramNotifier
        from agents.kill_switch import KillSwitch

        # Instanciation d'un TelegramNotifier réel avec worker mocké sous forte latence (2000 ms)
        notifier = TelegramNotifier("123456:TEST_TOKEN", "987654321")

        def slow_network_dispatch(*args, **kwargs):
            time.sleep(2.0)  # 2 secondes de latence réseau simulée dans le thread daemon
            return True

        notifier._dispatch_with_retry = slow_network_dispatch

        try:
            # 1. notify_trade_opened latency
            t0 = time.perf_counter_ns()
            res_open = notifier.notify_trade_opened(
                symbol="EURUSD", direction="BUY", volume=0.10,
                price=1.08500, sl=1.08300, tp=1.08900,
                ticket=123456, ml_confidence=0.88
            )
            t1 = time.perf_counter_ns()
            open_lat_ms = (t1 - t0) / 1_000_000.0
            assert res_open is True
            assert open_lat_ms < 1.0, f"notify_trade_opened a bloqué {open_lat_ms:.4f} ms (> 1.0 ms) !"

            # 2. notify_trade_closed latency
            t0 = time.perf_counter_ns()
            res_close = notifier.notify_trade_closed(
                ticket=123456, symbol="EURUSD", direction="BUY",
                volume=0.10, profit=54.20, reason="Take Profit (TP)",
                close_price=1.08900
            )
            t1 = time.perf_counter_ns()
            close_lat_ms = (t1 - t0) / 1_000_000.0
            assert res_close is True
            assert close_lat_ms < 1.0, f"notify_trade_closed a bloqué {close_lat_ms:.4f} ms (> 1.0 ms) !"

            # 3. notify_critical_event latency
            t0 = time.perf_counter_ns()
            res_crit = notifier.notify_critical_event(
                "KILL_SWITCH", reason="Drawdown critique atteint (4.5%)"
            )
            t1 = time.perf_counter_ns()
            crit_lat_ms = (t1 - t0) / 1_000_000.0
            assert res_crit is True
            assert crit_lat_ms < 1.0, f"notify_critical_event a bloqué {crit_lat_ms:.4f} ms (> 1.0 ms) !"

            # 4. notify_daily_summary latency
            t0 = time.perf_counter_ns()
            res_sum = notifier.notify_daily_summary(
                date_str="2026-09-15", daily_pnl=142.50, win_rate=0.68,
                kelly_fraction=0.12, total_trades=8, balance=10250.0, equity=10250.0
            )
            t1 = time.perf_counter_ns()
            sum_lat_ms = (t1 - t0) / 1_000_000.0
            assert res_sum is True
            assert sum_lat_ms < 1.0, f"notify_daily_summary a bloqué {sum_lat_ms:.4f} ms (> 1.0 ms) !"

            # 5. KillSwitch.activate latency (incluant hook Telegram + thread safety lock)
            mock_connector = StressBrokerConnector(connected=True)
            ks = KillSwitch(mock_connector, notifier=notifier)
            t0 = time.perf_counter_ns()
            ks.activate(reason="Arrêt de sécurité challenger")
            t1 = time.perf_counter_ns()
            ks_lat_ms = (t1 - t0) / 1_000_000.0
            assert ks.is_triggered is True
            assert ks_lat_ms < 1.0, f"KillSwitch.activate a bloqué {ks_lat_ms:.4f} ms (> 1.0 ms) !"

            # 6. Rafale de 50 dispatches pour mesurer la latence moyenne et max
            burst_latencies = []
            for i in range(50):
                t_b0 = time.perf_counter_ns()
                notifier.notify_critical_event("STRESS_BURST", f"Stress #{i}")
                t_b1 = time.perf_counter_ns()
                burst_latencies.append((t_b1 - t_b0) / 1_000_000.0)

            avg_burst = statistics.mean(burst_latencies)
            max_burst = max(burst_latencies)
            assert max_burst < 1.0, f"Rafale: max a bloqué {max_burst:.4f} ms (> 1.0 ms) !"
            assert avg_burst < 0.2, f"Rafale: moyenne a bloqué {avg_burst:.4f} ms (> 0.2 ms) !"

        finally:
            notifier.stop()
