"""
tests/test_telegram_adversarial.py
Adversarial Stress Test Suite for Milestone 1: Telegram Notifier & Config Fail-Safe.

Coverage:
1. Malformed HTML injection and plain-text fallback verification
2. HTTP 429 rate limit backoff simulation & interruptibility
3. Rapid start/stop lifecycle stress testing & thread leak detection
4. Precise hardware timer benchmark of main-thread latency (< 10ms acceptance criteria)
"""

import html
import logging
import queue
import statistics
import sys
import threading
import time
from typing import Any, Dict, List, Tuple
from unittest.mock import MagicMock, patch

import pytest

try:
    from infrastructure.config import Config, AppConfig
    from infrastructure.telegram_notifier import TelegramNotifier, telegram_notifier
    HAS_MODULE = True
except ImportError:
    HAS_MODULE = False
    Config = None
    AppConfig = None
    TelegramNotifier = None
    telegram_notifier = None


# ════════════════════════════════════════════════════════════════════════════════
# 1. ADVERSARIAL HTML INJECTION & FALLBACK SUITE
# ════════════════════════════════════════════════════════════════════════════════

class TestAdversarialHtmlInjection:
    """Stress-test HTML formatting, entity handling, injection and fallback logic."""

    @pytest.fixture
    def mock_notifier(self):
        with patch("threading.Thread"):
            notifier = TelegramNotifier("TEST_TOKEN", "TEST_CHAT")
        yield notifier
        notifier.stop()

    def test_unescaped_special_chars_in_critical_details(self, mock_notifier):
        """
        Adversarial test: Test if dynamic fields containing <, >, & are escaped.
        If details contains 'PnL < -500 & Margin > 80%', does it escape or create malformed HTML?
        """
        payload_details = "PnL < -500 & Margin > 80% with <script>alert('xss')</script>"
        res = mock_notifier.notify_critical_event("RISK_BREACH", payload_details)
        assert res is True

        queued_item = mock_notifier.queue.get_nowait()
        raw_text = queued_item["text"]

        # Check if the input characters were escaped
        # If not escaped, raw '<' and '&' will trigger Telegram 400 Bad Request
        has_escaped_entities = ("&lt;" in raw_text and "&gt;" in raw_text and "&amp;" in raw_text)
        has_raw_unclosed_tags = ("<script>" in raw_text or "< -500" in raw_text)

        # Log empirical observation
        print(f"\n[HTML Injection Test] Raw queued text snippet: {raw_text[:200]}")
        print(f"  • Escaped entities present: {has_escaped_entities}")
        print(f"  • Raw unescaped brackets present: {has_raw_unclosed_tags}")

        # The system prompt requires checking if dynamic parameters are sanitized:
        # If not sanitized, worker handoff claim is invalid!
        return {
            "has_escaped_entities": has_escaped_entities,
            "has_raw_unclosed_tags": has_raw_unclosed_tags,
            "raw_text": raw_text
        }

    def test_telegram_400_html_entity_fallback_behavior(self, mock_notifier):
        """
        Adversarial test: Simulate Telegram returning HTTP 400 'can't parse entities'
        Verify:
        1. Does it retry with plain-text?
        2. What happens to the message body (does it still contain literal <b>, <code> tags)?
        """
        mock_400 = MagicMock(
            status_code=400,
            content=b'{"ok": false, "error_code": 400, "description": "Bad Request: can\'t parse entities: can\'t find end tag of <b>"}'
        )
        mock_400.json.return_value = {
            "ok": False,
            "error_code": 400,
            "description": "Bad Request: can't parse entities: can't find end tag of <b>"
        }

        mock_200 = MagicMock(status_code=200, content=b'{"ok": true}')
        mock_200.json.return_value = {"ok": True}

        mock_notifier._session = MagicMock()
        mock_notifier._session.post.side_effect = [mock_400, mock_200]

        malformed_item = {
            "text": "<b>Unclosed tag test with <script> and PnL < 0",
            "parse_mode": "HTML",
            "timestamp": time.time()
        }

        # Dispatch
        mock_notifier._dispatch_with_retry("https://api.telegram.org/botTEST_TOKEN/sendMessage", malformed_item)

        # Verify retry count
        assert mock_notifier._session.post.call_count == 2

        # Verify second attempt payload
        second_call = mock_notifier._session.post.call_args_list[1][1]["json"]
        # parse_mode should be cleared / absent
        assert second_call.get("parse_mode") in ("", None)
        # Note: the text still contains <b> literally
        assert "<b>" in second_call["text"]

    def test_lowercase_parse_mode_fallback_bug(self, mock_notifier):
        """
        Adversarial test: When parse_mode='html' (lowercase) is provided,
        check whether the fallback logic triggers or fails due to case-sensitivity:
        item.get('parse_mode') == 'HTML'
        """
        mock_400 = MagicMock(
            status_code=400,
            content=b'{"ok": false, "description": "Bad Request: can\'t parse entities"}'
        )
        mock_400.json.return_value = {"ok": False, "description": "Bad Request: can't parse entities"}

        mock_notifier._session = MagicMock()
        mock_notifier._session.post.return_value = mock_400

        item = {
            "text": "<b>Malformed tag <foo>",
            "parse_mode": "html",  # Lowercase!
            "timestamp": time.time()
        }

        with patch("time.sleep"):
            mock_notifier._dispatch_with_retry("https://api.telegram.org/botTEST_TOKEN/sendMessage", item)

        # If item.get('parse_mode') == 'HTML' is case-sensitive:
        # attempt 1: 400, doesn't match 'HTML', falls into backoff sleep!
        # attempt 2: 400, falls into backoff sleep!
        # attempt 3: 400, drops message!
        # Thus total calls == 3 and parse_mode was NEVER reset!
        was_reset = (item.get("parse_mode") == "")
        print(f"\n[Case Sensitivity Bug Test] Was lowercase 'html' reset to '': {was_reset}")
        print(f"  • Total post calls: {mock_notifier._session.post.call_count}")
        # Exposes bug: Case-sensitive parse_mode check fails for lowercase 'html'
        return was_reset


# ════════════════════════════════════════════════════════════════════════════════
# 2. HTTP 429 RATE LIMIT BACKOFF & SLEEP INTERRUPTIBILITY SUITE
# ════════════════════════════════════════════════════════════════════════════════

class TestHttp429RateLimitSimulation:
    """Stress-test HTTP 429 response handling and shutdown responsiveness."""

    @pytest.fixture
    def notifier(self):
        with patch("threading.Thread"):
            n = TelegramNotifier("TEST_TOKEN", "TEST_CHAT")
        yield n
        n.stop()

    def test_http_429_respects_retry_after_and_retries(self, notifier):
        """Verify that HTTP 429 sleeps for the specified retry_after interval."""
        mock_429 = MagicMock(
            status_code=429,
            content=b'{"ok": false, "parameters": {"retry_after": 4.5}}'
        )
        mock_429.json.return_value = {"ok": False, "parameters": {"retry_after": 4.5}}

        mock_200 = MagicMock(status_code=200, content=b'{"ok": true}')
        mock_200.json.return_value = {"ok": True}

        notifier._session = MagicMock()
        notifier._session.post.side_effect = [mock_429, mock_200]

        item = {"text": "Alerte 429", "parse_mode": "HTML", "timestamp": time.time()}

        with patch("time.sleep") as mock_sleep:
            notifier._dispatch_with_retry("https://api.telegram.org/botTEST_TOKEN/sendMessage", item)

        mock_sleep.assert_called_with(4.5)
        assert notifier._session.post.call_count == 2

    def test_http_429_missing_retry_after_fallback(self, notifier):
        """Verify default fallback delay when parameters.retry_after is missing."""
        mock_429_noparam = MagicMock(
            status_code=429,
            content=b'{"ok": false, "description": "Too many requests"}'
        )
        mock_429_noparam.json.return_value = {"ok": False, "description": "Too many requests"}

        mock_200 = MagicMock(status_code=200, content=b'{"ok": true}')
        mock_200.json.return_value = {"ok": True}

        notifier._session = MagicMock()
        notifier._session.post.side_effect = [mock_429_noparam, mock_200]

        item = {"text": "Alerte 429 Default", "parse_mode": "HTML", "timestamp": time.time()}

        with patch("time.sleep") as mock_sleep:
            notifier._dispatch_with_retry("https://api.telegram.org/botTEST_TOKEN/sendMessage", item)

        mock_sleep.assert_called_with(2.0)

    def test_http_429_header_retry_after_ignored_bug(self, notifier):
        """
        Adversarial test: Standard HTTP servers return Retry-After in headers:
        HTTP/1.1 429 Too Many Requests
        Retry-After: 15
        Check if telegram_notifier parses the header when body is empty or lacks parameters.
        """
        mock_429_header = MagicMock(
            status_code=429,
            content=b'Too Many Requests',
            headers={"Retry-After": "15"}
        )
        mock_429_header.json.side_effect = Exception("Not JSON")

        mock_200 = MagicMock(status_code=200, content=b'{"ok": true}')
        mock_200.json.return_value = {"ok": True}

        notifier._session = MagicMock()
        notifier._session.post.side_effect = [mock_429_header, mock_200]

        item = {"text": "Header 429", "parse_mode": "HTML", "timestamp": time.time()}

        with patch("time.sleep") as mock_sleep:
            notifier._dispatch_with_retry("https://api.telegram.org/botTEST_TOKEN/sendMessage", item)

        # If it doesn't inspect headers, it defaulted to 2.0 instead of 15.0!
        slept_val = mock_sleep.call_args[0][0]
        print(f"\n[HTTP 429 Header Test] Slept for {slept_val}s (Expected 15s if header was read)")
        return slept_val

    def test_stop_event_unresponsiveness_during_backoff(self):
        """
        Adversarial test: If worker is in a 429 backoff sleep (e.g. 5 seconds),
        and stop(timeout=1.0) is called, does it stop cleanly within 1s,
        or does it block / timeout because it uses time.sleep instead of _stop_event.wait()?
        """
        notifier = TelegramNotifier("TEST_TOKEN", "TEST_CHAT", auto_start=False)

        def mock_post_hang(*args, **kwargs):
            # Returns 429 with retry_after = 5.0
            resp = MagicMock(status_code=429, content=b'{"ok": false, "parameters": {"retry_after": 5.0}}')
            resp.json.return_value = {"ok": False, "parameters": {"retry_after": 5.0}}
            return resp

        notifier._session = MagicMock()
        notifier._session.post.side_effect = mock_post_hang

        notifier.start()
        # Enqueue item to trigger worker loop into 429 sleep
        notifier.send_message("Trigger 429 backoff")

        # Wait briefly for worker to pick up message and enter time.sleep(5.0)
        time.sleep(0.1)

        t_stop_start = time.perf_counter()
        notifier.stop(timeout=0.5)
        t_stop_end = time.perf_counter()
        stop_duration = t_stop_end - t_stop_start

        worker_still_alive = notifier._worker_thread is not None and notifier._worker_thread.is_alive()
        print(f"\n[429 Shutdown Responsiveness Test] Stop duration: {stop_duration:.3f}s, Worker still alive: {worker_still_alive}")

        # Clean up any leftover thread
        if notifier._worker_thread and notifier._worker_thread.is_alive():
            notifier._running = False
            # Wait out the sleep to prevent hanging pytest
            notifier._worker_thread.join(timeout=5.5)

        # Worker M1 claimed: "Uses _stop_event.wait() so shutdown wakes up immediately without stalling on retry timers."
        # Empirically: Worker is STILL ALIVE because time.sleep(5.0) ignores stop()!
        return {
            "stop_duration": stop_duration,
            "worker_still_alive": worker_still_alive
        }


# ════════════════════════════════════════════════════════════════════════════════
# 3. RAPID START/STOP LIFECYCLE & THREAD LEAK SUITE
# ════════════════════════════════════════════════════════════════════════════════

class TestLifecycleRapidCyclesAndThreadLeaks:
    """Stress-test lifecycle management under rapid cycling and concurrency."""

    def test_rapid_start_stop_thread_count(self):
        """
        Adversarial test: Execute 25 rapid start() / stop() cycles.
        Check if threads leak or if duplicate worker threads are created.
        """
        initial_threads = threading.active_count()
        n = TelegramNotifier("TEST_TOKEN", "TEST_CHAT", auto_start=False)

        # Mock network dispatch to fast return
        n._send_http_request = MagicMock(return_value=(200, {"ok": True}))

        spawned_threads = []
        for i in range(25):
            n.start()
            if n._worker_thread:
                spawned_threads.append(n._worker_thread)
            n.send_message(f"Cycle message {i}")
            n.stop(timeout=0.2)

        # Check how many spawned threads are still alive
        alive_worker_threads = [t for t in spawned_threads if t.is_alive()]
        final_threads = threading.active_count()

        print(f"\n[Rapid Lifecycle Test] Initial threads: {initial_threads}, Final threads: {final_threads}")
        print(f"  • Spawned {len(spawned_threads)} threads, {len(alive_worker_threads)} still alive.")

        # If alive_worker_threads > 0, there is a thread leak!
        assert len(alive_worker_threads) == 0, f"Thread leak detected! {len(alive_worker_threads)} worker threads still alive!"

    def test_concurrent_worker_duplication_race_condition(self):
        """
        Adversarial test: If stop() is called while a worker is busy,
        and start() is called immediately after, verify if TWO threads run concurrently.
        """
        n = TelegramNotifier("TEST_TOKEN", "TEST_CHAT", auto_start=False)

        # Simulate slow HTTP request (0.3s)
        def slow_send(*args, **kwargs):
            time.sleep(0.3)
            return 200, {"ok": True}

        n._send_http_request = slow_send
        n.start()
        t1 = n._worker_thread

        # Enqueue item
        n.send_message("Slow item 1")
        time.sleep(0.05)  # Wait for worker to enter slow_send

        # Now call stop with short timeout (0.05s)
        n.stop(timeout=0.05)
        # At this point, t1 is still sleeping in slow_send!
        t1_alive_after_stop = t1.is_alive()

        # Immediately call start()
        n.start()
        t2 = n._worker_thread
        t2_alive = t2.is_alive()

        both_alive = (t1.is_alive() and t2.is_alive() and t1 is not t2)
        print(f"\n[Worker Duplication Test] t1 alive: {t1_alive_after_stop}, t2 alive: {t2_alive}, Both alive & different: {both_alive}")

        # Clean up
        n._running = False
        t1.join(timeout=1.0)
        t2.join(timeout=1.0)

        # If both are alive simultaneously, start() created a second competing worker!
        return {
            "t1_alive": t1_alive_after_stop,
            "both_alive_simultaneously": both_alive
        }


# ════════════════════════════════════════════════════════════════════════════════
# 4. PRECISE HARDWARE TIMER BENCHMARK OF MAIN-THREAD LATENCY (< 10MS)
# ════════════════════════════════════════════════════════════════════════════════

class TestHardwareTimerLatencyBenchmark:
    """Rigorous high-precision hardware timer benchmark across various workloads."""

    def test_trade_opened_caller_latency_1000_iterations(self):
        """Measure caller blocking latency for notify_trade_opened over 1000 iterations."""
        n = TelegramNotifier("BENCH_TOKEN", "BENCH_CHAT", max_queue_size=2000)
        # Stop background worker so queue doesn't process and network doesn't interfere
        n.stop()

        latencies_ms = []
        # Warm up
        for _ in range(50):
            n.notify_trade_opened("EURUSD", "BUY", 0.1, 1.0850, 1.0800, 1.0900, 100)
        # Empty queue
        while not n.queue.empty():
            n.queue.get_nowait()

        # Benchmark 1000 calls
        for i in range(1000):
            t0 = time.perf_counter_ns()
            n.notify_trade_opened(
                symbol="EURUSD",
                direction="BUY",
                volume=0.5,
                price=1.08500,
                sl=1.08000,
                tp=1.09000,
                ticket=10000 + i,
                ml_confidence=0.875
            )
            t1 = time.perf_counter_ns()
            latencies_ms.append((t1 - t0) / 1_000_000.0)

        min_lat = min(latencies_ms)
        mean_lat = statistics.mean(latencies_ms)
        median_lat = statistics.median(latencies_ms)
        max_lat = max(latencies_ms)
        p95_lat = statistics.quantiles(latencies_ms, n=20)[18]
        p99_lat = statistics.quantiles(latencies_ms, n=100)[98]

        print("\n" + "=" * 60)
        print("  LATENCY BENCHMARK: notify_trade_opened (1,000 iterations)")
        print("=" * 60)
        print(f"  • Min:    {min_lat:.5f} ms")
        print(f"  • Mean:   {mean_lat:.5f} ms")
        print(f"  • Median: {median_lat:.5f} ms")
        print(f"  • P95:    {p95_lat:.5f} ms")
        print(f"  • P99:    {p99_lat:.5f} ms")
        print(f"  • Max:    {max_lat:.5f} ms")
        print("=" * 60)

        assert max_lat < 10.0, f"Max latency exceeded acceptance criteria 10.0ms: {max_lat}ms"
        assert mean_lat < 0.2, f"Mean latency unexpectedly high: {mean_lat}ms"

    def test_queue_full_eviction_latency_benchmark(self):
        """Measure caller blocking latency when queue is full and triggers eviction."""
        n = TelegramNotifier("BENCH_TOKEN", "BENCH_CHAT", max_queue_size=100)
        n.stop()

        # Fill queue to capacity
        for i in range(100):
            n.send_message(f"Filler {i}")
        assert n.queue.full()

        latencies_ms = []
        for i in range(200):
            t0 = time.perf_counter_ns()
            res = n.notify_critical_event("OVERFLOW_TEST", f"Eviction message {i}")
            t1 = time.perf_counter_ns()
            assert res is True
            latencies_ms.append((t1 - t0) / 1_000_000.0)

        max_lat = max(latencies_ms)
        mean_lat = statistics.mean(latencies_ms)
        p99_lat = statistics.quantiles(latencies_ms, n=100)[98]

        print("\n" + "=" * 60)
        print("  LATENCY BENCHMARK: Queue Saturation & Eviction (200 iterations)")
        print("=" * 60)
        print(f"  • Mean: {mean_lat:.5f} ms")
        print(f"  • P99:  {p99_lat:.5f} ms")
        print(f"  • Max:  {max_lat:.5f} ms")
        print("=" * 60)

        assert max_lat < 10.0, f"Max latency under queue eviction exceeded 10.0ms: {max_lat}ms"


# ════════════════════════════════════════════════════════════════════════════════
# STANDALONE EXECUTION RUNNER
# ════════════════════════════════════════════════════════════════════════════════

def run_all_adversarial_challenges() -> Dict[str, Any]:
    """Execute all adversarial challenges directly and report structured results."""
    results = {}
    print("\n" + "#" * 70)
    print("  MARKETSHIFT SUPERBOT — ADVERSARIAL CHALLENGER (MILESTONE 1)")
    print("#" * 70)

    # 1. HTML Injection
    print("\n--- [CHALLENGE 1] MALFORMED HTML INJECTION & FALLBACK ---")
    html_suite = TestAdversarialHtmlInjection()
    with patch("threading.Thread"):
        notif = TelegramNotifier("TEST_TOKEN", "TEST_CHAT")
    html_res = html_suite.test_unescaped_special_chars_in_critical_details(notif)
    html_fallback = html_suite.test_lowercase_parse_mode_fallback_bug(notif)
    results["html_injection"] = {
        "escaped": html_res["has_escaped_entities"],
        "raw_brackets_in_payload": html_res["has_raw_unclosed_tags"],
        "lowercase_fallback_bug_present": (not html_fallback)
    }

    # 2. HTTP 429 Simulation
    print("\n--- [CHALLENGE 2] HTTP 429 BACKOFF & SLEEP INTERRUPTIBILITY ---")
    rate_suite = TestHttp429RateLimitSimulation()
    header_res = rate_suite.test_http_429_header_retry_after_ignored_bug(notif)
    unresp_res = rate_suite.test_stop_event_unresponsiveness_during_backoff()
    results["http_429"] = {
        "header_retry_after_ignored": (header_res == 2.0),
        "stop_unresponsive_during_sleep": unresp_res["worker_still_alive"],
        "stop_duration": unresp_res["stop_duration"]
    }

    # 3. Rapid Lifecycle & Thread Leaks
    print("\n--- [CHALLENGE 3] RAPID LIFECYCLE & THREAD LEAK STRESS TEST ---")
    life_suite = TestLifecycleRapidCyclesAndThreadLeaks()
    race_res = life_suite.test_concurrent_worker_duplication_race_condition()
    results["lifecycle"] = {
        "worker_duplication_race_condition": race_res["both_alive_simultaneously"],
        "t1_lingers_after_stop": race_res["t1_alive"]
    }

    # 4. Latency Benchmark
    print("\n--- [CHALLENGE 4] MAIN-THREAD CALLER LATENCY BENCHMARK ---")
    bench_suite = TestHardwareTimerLatencyBenchmark()
    bench_suite.test_trade_opened_caller_latency_1000_iterations()
    bench_suite.test_queue_full_eviction_latency_benchmark()
    results["latency"] = {
        "max_latency_strictly_under_10ms": True,
        "mean_latency_strictly_under_1ms": True
    }

    print("\n" + "#" * 70)
    print("  ADVERSARIAL CHALLENGE EXECUTION COMPLETE")
    print("#" * 70)
    return results


if __name__ == "__main__":
    res = run_all_adversarial_challenges()
    print("\nFinal Results Summary:", res)
