"""
tests/test_telegram_notifier.py
Suite complète de tests unitaires pour le module TelegramNotifier.
Couvre :
- Chargement des credentials et valeurs par défaut
- Mode Fail-Safe (credentials absents ou vides)
- Ingestion non-bloquante dans la file d'attente (< 1ms)
- Formatage des messages d'alertes (Trade Open, Close, Critical, Daily Summary)
- Mécanisme de retry sur panne réseau
- Gestion du rate limit HTTP 429 avec backoff
- Tronquage des messages de grande taille (>4000 chars)
- Protection contre le débordement de file d'attente (file bornée)
- Fallback safe HTML vers texte brut en cas d'erreur 400
- Gestion du cycle de vie (start / stop)
"""

import time
import queue
import inspect
import logging
import threading
from unittest.mock import MagicMock, patch, ANY

import pytest

try:
    from infrastructure.config import Config, AppConfig
    from infrastructure.telegram_notifier import TelegramNotifier, telegram_notifier
except ImportError:
    Config = None
    AppConfig = None
    TelegramNotifier = None
    telegram_notifier = None


# ════════════════════════════════════════════════════════════════════════════════
# FIXTURES & HELPERS
# ════════════════════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def skip_if_m1_not_implemented():
    """Skip test si Milestone M1 n'a pas encore implémenté les modules."""
    if TelegramNotifier is None or Config is None:
        pytest.skip("infrastructure.telegram_notifier ou infrastructure.config non disponible.")


@pytest.fixture
def dummy_notifier():
    """Crée un TelegramNotifier configuré mais avec un worker arrêté pour tests unitaires."""
    with patch("threading.Thread"):
        # Instanciation compatible positional (bot_token/token, chat_id)
        notifier = TelegramNotifier("123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11", "987654321")
    yield notifier
    notifier.stop()


@pytest.fixture
def disabled_notifier():
    """Crée un TelegramNotifier en mode Fail-Safe (désactivé)."""
    notifier = TelegramNotifier("", "")
    yield notifier
    notifier.stop()


def _dispatch_helper(notifier, item):
    """Appelle _dispatch_with_retry en s'adaptant à la signature (payload vs url, payload)."""
    sig = inspect.signature(notifier._dispatch_with_retry)
    if "url" in sig.parameters or len(sig.parameters) >= 2:
        notifier._dispatch_with_retry("https://api.telegram.org/botTOKEN/sendMessage", item)
    else:
        notifier._dispatch_with_retry(item)


# ════════════════════════════════════════════════════════════════════════════════
# 1. CREDENTIALS ET CONFIGURATION
# ════════════════════════════════════════════════════════════════════════════════

class TestCredentialsAndConfig:
    """Vérification du chargement des identifiants et des propriétés de configuration."""

    def test_explicit_credentials_loaded(self):
        with patch("threading.Thread"):
            n = TelegramNotifier("MY_TOKEN", "MY_CHAT_ID")
        token_val = getattr(n, "token", getattr(n, "bot_token", None))
        assert token_val == "MY_TOKEN"
        assert n.chat_id == "MY_CHAT_ID"
        assert n.enabled is True
        n.stop()

    def test_credentials_whitespace_stripped(self):
        with patch("threading.Thread"):
            n = TelegramNotifier("  TRIM_TOKEN  \n", "  TRIM_CHAT  \t")
        token_val = getattr(n, "token", getattr(n, "bot_token", None))
        assert token_val == "TRIM_TOKEN"
        assert n.chat_id == "TRIM_CHAT"
        assert n.enabled is True
        n.stop()

    def test_credentials_loaded_from_config(self):
        with patch.object(Config, "TELEGRAM_BOT_TOKEN", "CONF_TOKEN", create=True), \
             patch.object(Config, "TELEGRAM_CHAT_ID", "CONF_CHAT", create=True), \
             patch("threading.Thread"):
            n = TelegramNotifier()
            token_val = getattr(n, "token", getattr(n, "bot_token", None))
            assert token_val == "CONF_TOKEN"
            assert n.chat_id == "CONF_CHAT"
            assert n.enabled is True
            n.stop()

    def test_is_telegram_enabled_property(self):
        if hasattr(Config, "is_telegram_enabled"):
            with patch.object(Config, "TELEGRAM_BOT_TOKEN", "TOK", create=True), \
                 patch.object(Config, "TELEGRAM_CHAT_ID", "CHAT", create=True):
                assert Config.is_telegram_enabled is True

            with patch.object(Config, "TELEGRAM_BOT_TOKEN", "", create=True), \
                 patch.object(Config, "TELEGRAM_CHAT_ID", "CHAT", create=True):
                assert Config.is_telegram_enabled is False

            with patch.object(Config, "TELEGRAM_BOT_TOKEN", "TOK", create=True), \
                 patch.object(Config, "TELEGRAM_CHAT_ID", "", create=True):
                assert Config.is_telegram_enabled is False

    def test_default_singleton_exists(self):
        assert telegram_notifier is not None
        assert isinstance(telegram_notifier, TelegramNotifier)


# ════════════════════════════════════════════════════════════════════════════════
# 2. MODE FAIL-SAFE (RÉSILIENCE EN L'ABSENCE DE CREDENTIALS)
# ════════════════════════════════════════════════════════════════════════════════

class TestFailSafeMode:
    """Vérifie que l'absence de credentials n'entraîne aucun crash ni blocage."""

    def test_failsafe_empty_token(self, caplog):
        with caplog.at_level(logging.WARNING):
            n = TelegramNotifier("", "12345")
        assert n.enabled is False
        assert n._worker_thread is None or not n._worker_thread.is_alive()
        assert "fail-safe" in caplog.text.lower() or "désactivé" in caplog.text.lower() or "missing" in caplog.text.lower()
        n.stop()

    def test_failsafe_empty_chat_id(self, caplog):
        with caplog.at_level(logging.WARNING):
            n = TelegramNotifier("12345:TOKEN", "")
        assert n.enabled is False
        assert n._worker_thread is None or not n._worker_thread.is_alive()
        n.stop()

    def test_failsafe_both_empty(self):
        n = TelegramNotifier("", "")
        assert n.enabled is False
        n.stop()

    def test_failsafe_send_message_returns_false(self, disabled_notifier):
        res = disabled_notifier.send_message("Test message")
        assert res is False

    @pytest.mark.asyncio
    async def test_failsafe_send_message_async_returns_false(self, disabled_notifier):
        res = await disabled_notifier.send_message_async("Test async message")
        assert res is False

    def test_failsafe_all_notify_methods_return_false(self, disabled_notifier):
        # notify_trade_opened
        assert disabled_notifier.notify_trade_opened(
            symbol="EURUSD", direction="BUY", volume=0.1, price=1.08, sl=1.07, tp=1.09, ticket=101
        ) is False

        # notify_trade_closed (supporte les deux ordres de paramètres)
        sig_closed = inspect.signature(disabled_notifier.notify_trade_closed)
        if list(sig_closed.parameters.keys())[0] == "ticket":
            r_closed = disabled_notifier.notify_trade_closed(101, "EURUSD", "BUY", 0.1, 25.0, "TP")
        else:
            r_closed = disabled_notifier.notify_trade_closed("EURUSD", 101, "BUY", 0.1, 25.0, "TP")
        assert r_closed is False

        # notify_critical_event
        assert disabled_notifier.notify_critical_event("TEST_CRITICAL", "Aucun impact") is False

        # notify_daily_summary
        sig_daily = inspect.signature(disabled_notifier.notify_daily_summary)
        if "date_str" in sig_daily.parameters:
            r_daily = disabled_notifier.notify_daily_summary("2026-09-15", 100.0, 0.6, 0.02, 5, 10000.0, 10100.0)
        else:
            r_daily = disabled_notifier.notify_daily_summary(100.0, 0.6, 0.02, 5, 10000.0, 10100.0)
        assert r_daily is False

    def test_failsafe_execution_time_under_1ms(self, disabled_notifier):
        start = time.perf_counter_ns()
        for _ in range(100):
            disabled_notifier.notify_critical_event("KILL_SWITCH", "Fail-safe speed test")
        end = time.perf_counter_ns()
        total_time_ms = (end - start) / 1_000_000.0
        avg_time_ms = total_time_ms / 100.0
        assert avg_time_ms < 1.0, f"Le mode fail-safe a pris {avg_time_ms} ms (> 1.0 ms)"


# ════════════════════════════════════════════════════════════════════════════════
# 3. INGESTION NON-BLOQUANTE DANS LA FILE D'ATTENTE (< 1MS)
# ════════════════════════════════════════════════════════════════════════════════

class TestNonBlockingQueueIngestion:
    """Vérifie la mise en file d'attente instantanée sans latence réseau."""

    def test_send_message_enqueues_payload(self, dummy_notifier):
        res = dummy_notifier.send_message("Bonjour Telegram", parse_mode="HTML")
        assert res is True
        assert not dummy_notifier._queue.empty()
        item = dummy_notifier._queue.get_nowait()
        assert "Bonjour Telegram" in item["text"]
        assert item["parse_mode"] == "HTML"
        assert "timestamp" in item

    def test_put_nowait_execution_time_strictly_under_1ms(self, dummy_notifier):
        t0 = time.perf_counter_ns()
        res = dummy_notifier.send_message("Alerte ultra-rapide")
        t1 = time.perf_counter_ns()
        duration_ms = (t1 - t0) / 1_000_000.0

        assert res is True
        assert duration_ms < 1.0, f"send_message a bloqué {duration_ms:.4f} ms (> 1.0 ms)"

    @pytest.mark.asyncio
    async def test_async_send_message_enqueues_without_blocking(self, dummy_notifier):
        t0 = time.perf_counter_ns()
        res = await dummy_notifier.send_message_async("Message async test", parse_mode="HTML")
        t1 = time.perf_counter_ns()
        duration_ms = (t1 - t0) / 1_000_000.0

        assert res is True
        assert duration_ms < 1.0
        assert not dummy_notifier._queue.empty()


# ════════════════════════════════════════════════════════════════════════════════
# 4. FORMATAGE DES MESSAGES D'ALERTE MÉTIER
# ════════════════════════════════════════════════════════════════════════════════

class TestMessageFormatting:
    """Vérifie la structure et la fidélité des messages générés par les méthodes d'alerte."""

    def test_notify_trade_opened_buy(self, dummy_notifier):
        with patch.object(dummy_notifier, "send_message") as mock_send:
            mock_send.return_value = True
            dummy_notifier.notify_trade_opened(
                symbol="EURUSD",
                direction="BUY",
                volume=0.25,
                price=1.08500,
                sl=1.08200,
                tp=1.09100,
                ticket=123456,
                ml_confidence=0.875
            )
            mock_send.assert_called_once()
            msg = mock_send.call_args[0][0]
            parse_mode = mock_send.call_args[1].get("parse_mode", mock_send.call_args[0][1] if len(mock_send.call_args[0]) > 1 else "HTML")
            assert "EURUSD" in msg
            assert "BUY" in msg
            assert "0.25" in msg
            assert "1.08500" in msg
            assert "1.08200" in msg
            assert "1.09100" in msg
            assert "123456" in msg
            assert "87.5%" in msg
            assert parse_mode == "HTML"

    def test_notify_trade_opened_sell_no_ml(self, dummy_notifier):
        with patch.object(dummy_notifier, "send_message") as mock_send:
            mock_send.return_value = True
            dummy_notifier.notify_trade_opened(
                symbol="USDJPY",
                direction="SELL",
                volume=0.50,
                price=155.20,
                sl=155.80,
                tp=154.00,
                ticket=654321,
                ml_confidence=None
            )
            mock_send.assert_called_once()
            msg = mock_send.call_args[0][0]
            assert "USDJPY" in msg
            assert "SELL" in msg
            assert "N/A" in msg

    def test_notify_trade_closed_profit(self, dummy_notifier):
        with patch.object(dummy_notifier, "send_message") as mock_send:
            mock_send.return_value = True
            sig = inspect.signature(dummy_notifier.notify_trade_closed)
            if list(sig.parameters.keys())[0] == "ticket":
                dummy_notifier.notify_trade_closed(777888, "GBPUSD", "BUY", 1.0, 342.50, "TP")
            else:
                dummy_notifier.notify_trade_closed("GBPUSD", 777888, "BUY", 1.0, 342.50, "TP")

            mock_send.assert_called_once()
            msg = mock_send.call_args[0][0]
            assert "GBPUSD" in msg
            assert "777888" in msg
            assert "342.50" in msg
            assert "TP" in msg or "Take Profit" in msg

    def test_notify_trade_closed_loss(self, dummy_notifier):
        with patch.object(dummy_notifier, "send_message") as mock_send:
            mock_send.return_value = True
            sig = inspect.signature(dummy_notifier.notify_trade_closed)
            if list(sig.parameters.keys())[0] == "ticket":
                dummy_notifier.notify_trade_closed(999111, "XAUUSD", "SELL", 0.1, -125.75, "SL")
            else:
                dummy_notifier.notify_trade_closed("XAUUSD", 999111, "SELL", 0.1, -125.75, "SL")

            mock_send.assert_called_once()
            msg = mock_send.call_args[0][0]
            assert "XAUUSD" in msg
            assert "999111" in msg
            assert "125.75" in msg
            assert "SL" in msg or "Stop Loss" in msg

    def test_notify_critical_event(self, dummy_notifier):
        with patch.object(dummy_notifier, "send_message") as mock_send:
            mock_send.return_value = True
            dummy_notifier.notify_critical_event(
                "KILL_SWITCH",
                "Seuil max de perte journalière atteint (5.2%)"
            )
            mock_send.assert_called_once()
            msg = mock_send.call_args[0][0]
            assert "CRITIQUE" in msg or "ALERTE" in msg
            assert "KILL_SWITCH" in msg
            assert "5.2%" in msg

    def test_notify_daily_summary_positive(self, dummy_notifier):
        with patch.object(dummy_notifier, "send_message") as mock_send:
            mock_send.return_value = True
            sig = inspect.signature(dummy_notifier.notify_daily_summary)
            if "date_str" in sig.parameters:
                dummy_notifier.notify_daily_summary("2026-09-15", 450.00, 0.75, 0.0185, 8, 10450.00, 10450.00)
            else:
                dummy_notifier.notify_daily_summary(450.00, 0.75, 0.0185, 8, 10450.00, 10450.00)

            mock_send.assert_called_once()
            msg = mock_send.call_args[0][0]
            assert "RÉSUMÉ" in msg
            assert "450.00" in msg
            assert "75.0%" in msg or "75%" in msg
            assert "8" in msg
            assert "10450.00" in msg

    def test_notify_daily_summary_negative(self, dummy_notifier):
        with patch.object(dummy_notifier, "send_message") as mock_send:
            mock_send.return_value = True
            sig = inspect.signature(dummy_notifier.notify_daily_summary)
            if "date_str" in sig.parameters:
                dummy_notifier.notify_daily_summary("2026-09-15", -310.50, 0.40, 0.0050, 10, 9689.50, 9689.50)
            else:
                dummy_notifier.notify_daily_summary(-310.50, 0.40, 0.0050, 10, 9689.50, 9689.50)

            mock_send.assert_called_once()
            msg = mock_send.call_args[0][0]
            assert "310.50" in msg
            assert "40.0%" in msg or "40%" in msg


# ════════════════════════════════════════════════════════════════════════════════
# 5. RÉSILIENCE RÉSEAU ET MÉCANISME DE RETRY
# ════════════════════════════════════════════════════════════════════════════════

class TestNetworkResilienceAndRetries:
    """Vérifie le comportement de la boucle worker lors des aléas réseau."""

    def test_dispatch_success_first_attempt(self, dummy_notifier):
        mock_resp = MagicMock(status_code=200, content=b'{"ok": true}')
        mock_resp.json.return_value = {"ok": True}

        dummy_notifier._session = MagicMock()
        dummy_notifier._session.post.return_value = mock_resp

        item = {"text": "Test Succès", "parse_mode": "HTML", "timestamp": time.time()}
        _dispatch_helper(dummy_notifier, item)

        assert dummy_notifier._session.post.call_count >= 1

    def test_dispatch_retries_on_connection_error_and_recovers(self, dummy_notifier):
        mock_fail = Exception("Connection Reset by Peer")
        mock_success = MagicMock(status_code=200, content=b'{"ok": true}')
        mock_success.json.return_value = {"ok": True}

        dummy_notifier._session = MagicMock()
        dummy_notifier._session.post.side_effect = [mock_fail, mock_fail, mock_success]

        with patch("time.sleep") as mock_sleep:
            item = {"text": "Test Retry", "parse_mode": "HTML", "timestamp": time.time()}
            _dispatch_helper(dummy_notifier, item)

        assert dummy_notifier._session.post.call_count == 3
        assert mock_sleep.call_count >= 2

    def test_dispatch_abandons_after_3_failed_attempts(self, dummy_notifier, caplog):
        mock_fail = Exception("Timeout error")
        dummy_notifier._session = MagicMock()
        dummy_notifier._session.post.side_effect = mock_fail

        with patch("time.sleep"), caplog.at_level(logging.WARNING):
            item = {"text": "Test Abandon", "parse_mode": "HTML", "timestamp": time.time()}
            _dispatch_helper(dummy_notifier, item)

        assert dummy_notifier._session.post.call_count == 3

    def test_dispatch_http_500_retries_and_succeeds(self, dummy_notifier):
        mock_500 = MagicMock(status_code=500, content=b'{"ok": false, "error_code": 500}')
        mock_500.json.return_value = {"ok": False, "error_code": 500}

        mock_200 = MagicMock(status_code=200, content=b'{"ok": true}')
        mock_200.json.return_value = {"ok": True}

        dummy_notifier._session = MagicMock()
        dummy_notifier._session.post.side_effect = [mock_500, mock_200]

        with patch("time.sleep"):
            item = {"text": "Test 500", "parse_mode": "HTML", "timestamp": time.time()}
            _dispatch_helper(dummy_notifier, item)

        assert dummy_notifier._session.post.call_count == 2


# ════════════════════════════════════════════════════════════════════════════════
# 6. RATE LIMITING HTTP 429 & BACKOFF
# ════════════════════════════════════════════════════════════════════════════════

class TestRateLimitingAndBackoff:
    """Vérifie le respect du délai retry_after fourni par l'API Telegram."""

    def test_http_429_sleeps_retry_after(self, dummy_notifier):
        mock_429 = MagicMock(
            status_code=429,
            content=b'{"ok": false, "parameters": {"retry_after": 3}}',
            headers={}
        )
        mock_429.json.return_value = {"ok": False, "parameters": {"retry_after": 3}}

        mock_200 = MagicMock(status_code=200, content=b'{"ok": true}')
        mock_200.json.return_value = {"ok": True}

        dummy_notifier._session = MagicMock()
        dummy_notifier._session.post.side_effect = [mock_429, mock_200]

        with patch("time.sleep") as mock_sleep:
            item = {"text": "Test 429", "parse_mode": "HTML", "timestamp": time.time()}
            _dispatch_helper(dummy_notifier, item)

        mock_sleep.assert_any_call(3.0)
        assert dummy_notifier._session.post.call_count == 2


# ════════════════════════════════════════════════════════════════════════════════
# 7. TRONQUAGE DES MESSAGES (> 4000 CARACTÈRES)
# ════════════════════════════════════════════════════════════════════════════════

class TestMessageTruncation:
    """Vérifie que les messages dépassant 4000 caractères sont tronqués pour respecter l'API."""

    def test_oversized_message_truncated(self, dummy_notifier):
        huge_text = "A" * 5000
        dummy_notifier.send_message(huge_text)
        assert not dummy_notifier._queue.empty()
        item = dummy_notifier._queue.get_nowait()
        # Tronqué au seuil de sécurité (<= 4050 chars avec marge)
        assert len(item["text"]) <= 4050
        assert "tronqué" in item["text"].lower() or item["text"].endswith("...")

    def test_exact_4000_char_message_not_truncated(self, dummy_notifier):
        exact_text = "B" * 4000
        dummy_notifier.send_message(exact_text)
        item = dummy_notifier._queue.get_nowait()
        assert len(item["text"]) == 4000
        assert item["text"] == exact_text


# ════════════════════════════════════════════════════════════════════════════════
# 8. GESTION DU DÉBORDEMENT DE FILE D'ATTENTE (QUEUE BOUNDED 500)
# ════════════════════════════════════════════════════════════════════════════════

class TestQueueOverflowProtection:
    """Vérifie que la file d'attente bornée protège la mémoire et signale la saturation."""

    def test_queue_overflow_handling(self, dummy_notifier, caplog):
        # Remplissage complet de la file d'attente
        max_size = dummy_notifier._queue.maxsize
        for i in range(max_size):
            dummy_notifier._queue.put_nowait({"text": f"Msg_{i}", "parse_mode": "HTML", "timestamp": time.time()})

        assert dummy_notifier._queue.full()

        with caplog.at_level(logging.WARNING):
            res = dummy_notifier.send_message("Nouveau_Msg_Overflow")

        # La file d'attente ne doit jamais dépasser max_size
        assert dummy_notifier._queue.qsize() <= max_size
        # Un avertissement doit être tracé
        assert "full" in caplog.text.lower() or "saturée" in caplog.text.lower() or "dropping" in caplog.text.lower()


# ════════════════════════════════════════════════════════════════════════════════
# 9. FALLBACK EN CAS D'ERREUR HTML (400 BAD REQUEST)
# ════════════════════════════════════════════════════════════════════════════════

class TestHtmlErrorFallback:
    """Vérifie le repli en texte brut si Telegram rejette le balisage HTML."""

    def test_html_parse_error_falls_back_to_plaintext(self, dummy_notifier):
        mock_400 = MagicMock(
            status_code=400,
            content=b'{"ok": false, "description": "Bad Request: can\'t parse entities"}'
        )
        mock_400.json.return_value = {"ok": False, "description": "Bad Request: can't parse entities"}

        mock_200 = MagicMock(status_code=200, content=b'{"ok": true}')
        mock_200.json.return_value = {"ok": True}

        dummy_notifier._session = MagicMock()
        dummy_notifier._session.post.side_effect = [mock_400, mock_200]

        item = {"text": "<b>Balise non fermée", "parse_mode": "HTML", "timestamp": time.time()}
        _dispatch_helper(dummy_notifier, item)

        assert dummy_notifier._session.post.call_count == 2
        # La 2ème tentative a dû envoyer sans parse_mode HTML
        second_call_data = dummy_notifier._session.post.call_args_list[1][1]["json"]
        assert second_call_data.get("parse_mode") in ("", None)


# ════════════════════════════════════════════════════════════════════════════════
# 10. CYCLE DE VIE (START / STOP)
# ════════════════════════════════════════════════════════════════════════════════

class TestLifecycleManagement:
    """Vérifie l'idempotence de start() et l'arrêt propre de stop()."""

    def test_start_is_idempotent(self, dummy_notifier):
        dummy_notifier.start()
        first_thread = dummy_notifier._worker_thread
        dummy_notifier.start()
        second_thread = dummy_notifier._worker_thread
        assert first_thread == second_thread

    def test_stop_terminates_worker_cleanly(self):
        n = TelegramNotifier("TOKEN", "CHAT")
        assert n._worker_thread is not None
        assert n._worker_thread.is_alive()

        n.stop(timeout=1.0)
        assert n._worker_thread is None or not n._worker_thread.is_alive()
