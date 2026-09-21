"""
tests/test_telegram_integration.py
Tests d'intégration et de contrat boîte noire pour le système d'alerte Telegram.

Vérifie :
1. Contrats d'interface de configuration (infrastructure/config.py)
2. Contrat d'API du module TelegramNotifier (signatures et types de retour)
3. Intégration de bout en bout avec un serveur HTTP mock local (requête POST réelle, headers, payload JSON)
4. Scénarios opérationnels réels (Tier 4 du TEST_INFRA.md) :
   - Scénario 1 : Cycle de vie d'une journée de trading normale (Open -> Close -> Daily Summary)
   - Scénario 2 : Arrêt d'urgence Kill Switch / Circuit Breaker
   - Scénario 3 : Panne de l'API Telegram & rafale de forte volatilité
   - Scénario 4 : Démarrage à froid sans identifiants (Fail-Safe complet)
   - Scénario 5 : Concurrence multi-thread & coroutines asynchrones
"""

import time
import json
import inspect
import threading
from typing import Dict, Any, List
from http.server import HTTPServer, BaseHTTPRequestHandler
from unittest.mock import patch

import pytest

try:
    from infrastructure.config import Config, AppConfig
    from infrastructure.telegram_notifier import TelegramNotifier, telegram_notifier
except ImportError:
    Config = None
    AppConfig = None
    TelegramNotifier = None
    telegram_notifier = None


@pytest.fixture(autouse=True)
def check_m1_available():
    """Vérifie la disponibilité des modules M1 avant exécution."""
    if TelegramNotifier is None or Config is None:
        pytest.skip("Modules Milestone M1 (config.py ou telegram_notifier.py) non encore disponibles.")


# ════════════════════════════════════════════════════════════════════════════════
# SERVEUR HTTP MOCK LOCAL POUR TESTS D'INTÉGRATION E2E
# ════════════════════════════════════════════════════════════════════════════════

class MockTelegramServerHandler(BaseHTTPRequestHandler):
    """Handler HTTP simulant les réponses du serveur Telegram Bot API."""
    received_requests = []
    response_status = 200
    response_body = {"ok": True, "result": {"message_id": 12345}}

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)
        parsed_body = {}
        try:
            parsed_body = json.loads(post_data.decode("utf-8"))
        except Exception:
            pass

        self.__class__.received_requests.append({
            "path": self.path,
            "headers": dict(self.headers),
            "body": parsed_body
        })

        self.send_response(self.__class__.response_status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(self.__class__.response_body).encode("utf-8"))

    def log_message(self, format, *args):
        pass


@pytest.fixture
def mock_telegram_server():
    """Démarre un serveur HTTP local sur un port éphémère simulant Telegram API."""
    MockTelegramServerHandler.received_requests = []
    MockTelegramServerHandler.response_status = 200
    MockTelegramServerHandler.response_body = {"ok": True, "result": {"message_id": 12345}}

    server = HTTPServer(("127.0.0.1", 0), MockTelegramServerHandler)
    server_port = server.server_address[1]
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    yield {
        "host": "127.0.0.1",
        "port": server_port,
        "url_base": f"http://127.0.0.1:{server_port}",
        "handler": MockTelegramServerHandler
    }

    server.shutdown()
    server.server_close()


# ════════════════════════════════════════════════════════════════════════════════
# 1. TESTS DE CONTRATS D'INTERFACE (INTERFACE CONTRACTS)
# ════════════════════════════════════════════════════════════════════════════════

class TestInterfaceContracts:
    """Vérifie la conformité stricte avec les spécifications de PROJECT.md."""

    def test_config_interface_contract(self):
        """Vérifie les attributs requis dans infrastructure/config.py."""
        assert hasattr(Config, "TELEGRAM_BOT_TOKEN"), "Config doit posséder l'attribut TELEGRAM_BOT_TOKEN"
        assert hasattr(Config, "TELEGRAM_CHAT_ID"), "Config doit posséder l'attribut TELEGRAM_CHAT_ID"
        assert isinstance(Config.TELEGRAM_BOT_TOKEN, str)
        assert isinstance(Config.TELEGRAM_CHAT_ID, str)

        if hasattr(Config, "is_telegram_enabled"):
            assert isinstance(Config.is_telegram_enabled, bool)

    def test_telegram_notifier_api_contract(self):
        """Vérifie la présence et la signature des méthodes requises de TelegramNotifier."""
        notifier = TelegramNotifier("MOCK_TOKEN", "MOCK_CHAT")
        try:
            # send_message(text: str, parse_mode: str = "HTML") -> bool
            sig_send = inspect.signature(notifier.send_message)
            assert "text" in sig_send.parameters
            assert "parse_mode" in sig_send.parameters

            # notify_trade_opened
            sig_opened = inspect.signature(notifier.notify_trade_opened)
            for p in ["symbol", "direction", "volume", "price", "sl", "tp", "ticket"]:
                assert p in sig_opened.parameters, f"notify_trade_opened doit avoir le paramètre {p}"

            # notify_trade_closed (doit accepter symbol, ticket, volume, profit, reason)
            sig_closed = inspect.signature(notifier.notify_trade_closed)
            for p in ["symbol", "ticket", "volume", "profit", "reason"]:
                assert p in sig_closed.parameters, f"notify_trade_closed doit avoir le paramètre {p}"
            assert ("direction" in sig_closed.parameters or "order_type" in sig_closed.parameters)

            # notify_critical_event
            sig_critical = inspect.signature(notifier.notify_critical_event)
            assert "event_type" in sig_critical.parameters

            # notify_daily_summary
            sig_summary = inspect.signature(notifier.notify_daily_summary)
            for p in ["daily_pnl", "win_rate", "kelly_fraction", "total_trades", "balance", "equity"]:
                assert p in sig_summary.parameters, f"notify_daily_summary doit avoir le paramètre {p}"

            # start & stop
            assert callable(getattr(notifier, "start", None))
            assert callable(getattr(notifier, "stop", None))
        finally:
            notifier.stop()

    def test_singleton_notifier_instance(self):
        """Vérifie la présence de l'instance globale exportée."""
        assert telegram_notifier is not None
        assert isinstance(telegram_notifier, TelegramNotifier)


# ════════════════════════════════════════════════════════════════════════════════
# 2. TEST D'INTÉGRATION END-TO-END AVEC SERVEUR HTTP RÉEL
# ════════════════════════════════════════════════════════════════════════════════

class TestE2EHttpIntegration:
    """Vérifie l'envoi réel de requêtes HTTP POST à un serveur récepteur."""

    def test_e2e_message_delivery_to_mock_server(self, mock_telegram_server):
        server_url = mock_telegram_server["url_base"]
        test_token = "999888:AAABBBCCCDDD"
        test_chat_id = "123456789"

        notifier = TelegramNotifier(test_token, test_chat_id)
        try:
            # On patche la méthode HTTP interne pour rediriger vers notre serveur mock local
            original_send = getattr(notifier, "_send_http_request", None)
            if original_send is not None:
                def redirected_send(url, data):
                    mock_url = f"{server_url}/bot{test_token}/sendMessage"
                    return original_send(mock_url, data)
                notifier._send_http_request = redirected_send
            else:
                # Fallback session redirect
                orig_post = notifier._session.post
                def redirected_post(url, **kwargs):
                    mock_url = f"{server_url}/bot{test_token}/sendMessage"
                    return orig_post(mock_url, **kwargs)
                notifier._session.post = redirected_post

            # Envoi d'une notification réelle via worker
            res = notifier.notify_trade_opened(
                symbol="EURUSD",
                direction="BUY",
                volume=0.5,
                price=1.08450,
                sl=1.08100,
                tp=1.09200,
                ticket=765432,
                ml_confidence=0.88
            )
            assert res is True

            # Attente de réception par le serveur HTTP mock (max 2.0 secondes)
            for _ in range(30):
                if len(mock_telegram_server["handler"].received_requests) > 0:
                    break
                time.sleep(0.05)

            requests = mock_telegram_server["handler"].received_requests
            assert len(requests) >= 1, "Le serveur mock aurait dû recevoir la requête HTTP."

            req = requests[0]
            assert f"/bot{test_token}/sendMessage" in req["path"]
            assert req["body"]["chat_id"] == test_chat_id
            assert req["body"]["parse_mode"] == "HTML"
            assert "EURUSD" in req["body"]["text"]
            assert "765432" in req["body"]["text"]

        finally:
            notifier.stop()


# ════════════════════════════════════════════════════════════════════════════════
# 3. SCÉNARIOS OPÉRATIONNELS DU MONDE RÉEL (TIER 4)
# ════════════════════════════════════════════════════════════════════════════════

class TestRealWorldApplicationScenarios:
    """Scénarios Tier 4 définis dans TEST_INFRA.md."""

    def test_scenario_1_normal_trading_day_lifecycle(self):
        """Scénario 1 : Cycle complet d'une journée de trading."""
        notifier = TelegramNotifier("TOKEN_SC1", "CHAT_SC1")
        dispatched_items = []

        def mock_dispatch(*args, **kwargs):
            # Capture l'item payload quel que soit le mode d'appel
            payload = args[1] if len(args) >= 2 else (args[0] if args else kwargs.get("payload", {}))
            dispatched_items.append(payload)
            return True

        notifier._dispatch_with_retry = mock_dispatch

        try:
            # 1. Ouverture de position
            r1 = notifier.notify_trade_opened(
                symbol="GBPUSD", direction="BUY", volume=0.2, price=1.2850, sl=1.2810, tp=1.2930, ticket=10101
            )
            # 2. Clôture de position en profit
            sig = inspect.signature(notifier.notify_trade_closed)
            if list(sig.parameters.keys())[0] == "ticket":
                r2 = notifier.notify_trade_closed(10101, "GBPUSD", "BUY", 0.2, 80.0, "TP")
            else:
                r2 = notifier.notify_trade_closed("GBPUSD", 10101, "BUY", 0.2, 80.0, "TP")

            # 3. Résumé journalier à minuit
            sig_d = inspect.signature(notifier.notify_daily_summary)
            if "date_str" in sig_d.parameters:
                r3 = notifier.notify_daily_summary("2026-09-15", 80.0, 1.0, 0.02, 1, 10080.0, 10080.0)
            else:
                r3 = notifier.notify_daily_summary(80.0, 1.0, 0.02, 1, 10080.0, 10080.0)

            assert r1 is True and r2 is True and r3 is True

            # Attente que le worker vide la file
            for _ in range(30):
                if len(dispatched_items) == 3:
                    break
                time.sleep(0.05)

            assert len(dispatched_items) == 3
            assert any("OUVERT" in item.get("text", "") for item in dispatched_items)
            assert any("FERM" in item.get("text", "") or "CLÔTUR" in item.get("text", "") for item in dispatched_items)
            assert any("RÉSUMÉ" in item.get("text", "") for item in dispatched_items)
        finally:
            notifier.stop()

    def test_scenario_2_circuit_breaker_and_kill_switch_emergency(self):
        """Scénario 2 : Arrêt d'urgence Circuit Breaker / Kill Switch."""
        notifier = TelegramNotifier("TOKEN_SC2", "CHAT_SC2")
        dispatched_items = []

        def mock_dispatch(*args, **kwargs):
            payload = args[1] if len(args) >= 2 else (args[0] if args else kwargs.get("payload", {}))
            dispatched_items.append(payload)
            return True

        notifier._dispatch_with_retry = mock_dispatch

        try:
            t0 = time.perf_counter_ns()
            res = notifier.notify_critical_event(
                "KILL_SWITCH",
                "Arrêt d'urgence déclenché par SurveillanceAgent: Pertes consécutives anormales."
            )
            t1 = time.perf_counter_ns()
            duration_ms = (t1 - t0) / 1_000_000.0

            assert res is True
            # Le thread critique du kill-switch ne doit subir aucun blocage (< 1 ms)
            assert duration_ms < 1.0, f"Le dispatch critique a bloqué {duration_ms:.4f} ms"

            for _ in range(20):
                if len(dispatched_items) == 1:
                    break
                time.sleep(0.05)

            assert len(dispatched_items) == 1
            assert "KILL_SWITCH" in dispatched_items[0].get("text", "")
        finally:
            notifier.stop()

    def test_scenario_3_telegram_outage_burst(self):
        """Scénario 3 : Panne serveur Telegram avec rafale d'alertes simultanées."""
        notifier = TelegramNotifier("TOKEN_SC3", "CHAT_SC3")
        failed_attempts = 0

        def failing_dispatch(*args, **kwargs):
            nonlocal failed_attempts
            failed_attempts += 1
            time.sleep(0.01)
            raise ConnectionError("Telegram API Down")

        notifier._dispatch_with_retry = failing_dispatch

        try:
            # Envoi d'une rafale de 20 alertes rapides pendant que le réseau est KO
            t0 = time.perf_counter_ns()
            for i in range(20):
                ok = notifier.notify_trade_opened(
                    symbol="EURUSD", direction="SELL", volume=0.1, price=1.08, sl=1.09, tp=1.07, ticket=i
                )
                assert ok is True
            t1 = time.perf_counter_ns()
            burst_ms = (t1 - t0) / 1_000_000.0

            # Vérifie que le thread appelant n'a subi aucun retard malgré la panne réseau
            assert burst_ms < 10.0, f"La rafale en panne réseau a pris {burst_ms:.4f} ms (> 10ms)"
        finally:
            notifier.stop()

    def test_scenario_4_cold_boot_unconfigured_credentials(self):
        """Scénario 4 : Démarrage sans credentials (Fail-Safe total)."""
        notifier = TelegramNotifier("", "")
        try:
            assert notifier.enabled is False

            # Toutes les actions doivent renvoyer False immédiatement sans jamais crasher
            assert notifier.send_message("Test") is False
            assert notifier.notify_trade_opened("EURUSD", "BUY", 0.1, 1.0, 0.9, 1.1, 1) is False
            sig = inspect.signature(notifier.notify_trade_closed)
            if list(sig.parameters.keys())[0] == "ticket":
                assert notifier.notify_trade_closed(1, "EURUSD", "BUY", 0.1, 10.0, "TP") is False
            else:
                assert notifier.notify_trade_closed("EURUSD", 1, "BUY", 0.1, 10.0, "TP") is False

            assert notifier.notify_critical_event("TEST", "Details") is False
            sig_d = inspect.signature(notifier.notify_daily_summary)
            if "date_str" in sig_d.parameters:
                assert notifier.notify_daily_summary("2026-09-15", 0, 0, 0, 0, 0, 0) is False
            else:
                assert notifier.notify_daily_summary(0, 0, 0, 0, 0, 0) is False
        finally:
            notifier.stop()

    def test_scenario_5_concurrent_multithreaded_producers(self):
        """Scénario 5 : Concurrence d'ingestion depuis de multiples threads."""
        notifier = TelegramNotifier("TOKEN_SC5", "CHAT_SC5")
        dispatched_count = 0
        lock = threading.Lock()

        def counting_dispatch(*args, **kwargs):
            nonlocal dispatched_count
            with lock:
                dispatched_count += 1
            return True

        notifier._dispatch_with_retry = counting_dispatch

        num_threads = 10
        alerts_per_thread = 20
        total_expected = num_threads * alerts_per_thread

        def producer_worker(thread_id: int):
            for i in range(alerts_per_thread):
                notifier.notify_trade_opened(
                    symbol="EURUSD",
                    direction="BUY" if i % 2 == 0 else "SELL",
                    volume=0.1,
                    price=1.08,
                    sl=1.07,
                    tp=1.09,
                    ticket=thread_id * 1000 + i
                )

        threads = [threading.Thread(target=producer_worker, args=(t,)) for t in range(num_threads)]

        try:
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=5.0)

            # Attente de dépilage complet
            deadline = time.time() + 5.0
            while time.time() < deadline:
                with lock:
                    if dispatched_count == total_expected:
                        break
                time.sleep(0.05)

            assert dispatched_count == total_expected, f"Reçu {dispatched_count}/{total_expected} messages."
        finally:
            notifier.stop()
