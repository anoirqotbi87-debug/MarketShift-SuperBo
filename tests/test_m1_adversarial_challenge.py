"""
tests/test_m1_adversarial_challenge.py
Adversarial Stress Test & Empirical Challenge Harness for Milestone 1 (TelegramNotifier & config)

Authored by: challenger_m1_1 (Adversarial Challenger)
Role: Empirical Challenger & System Critic

Covers the 4 Empirical Challenge Dimensions:
1. Caller blocking time under extreme conditions (slow 5s worker sleep, simulated network stalls)
2. Multi-threaded concurrency: multiple concurrent caller threads enqueuing alerts
3. Queue saturation behavior (> 500 alerts rapidly enqueued, bounded memory, no engine lockup)
4. Fail-safe mode when credentials are empty/omitted (execution time, no worker thread, zero I/O)
5. Interface Contract Conformance (PROJECT.md vs implementation signatures & keyword arguments)
"""

import sys
import time
import queue
import logging
import inspect
import threading
import statistics
from typing import List, Dict, Any, Tuple
from unittest.mock import MagicMock, patch

from infrastructure.config import Config, AppConfig
from infrastructure.telegram_notifier import TelegramNotifier, telegram_notifier


# ════════════════════════════════════════════════════════════════════════════════
# 1. CHALLENGE 1: CALLER BLOCKING TIME UNDER EXTREME STALL (5s DELAY)
# ════════════════════════════════════════════════════════════════════════════════

def challenge_extreme_delay_caller_latency(
    num_calls: int = 50,
    simulated_delay_sec: float = 5.0
) -> Dict[str, Any]:
    """
    Test 1: Measures caller thread latency when worker thread is stalled for 5.0 seconds.
    The caller loop simulates the high-frequency trading engine loop.
    Requirement R3: Caller latency must be strictly < 10.0 ms (typically < 0.1 ms).
    """
    notifier = TelegramNotifier("MOCK_TOKEN", "MOCK_CHAT_ID")
    
    # Inject an extreme 5-second stall into network dispatch
    def stalling_dispatch(*args, **kwargs):
        time.sleep(simulated_delay_sec)
        return True

    notifier._dispatch_with_retry = stalling_dispatch
    latencies_ms: List[float] = []

    try:
        for i in range(num_calls):
            t0 = time.perf_counter_ns()
            res = notifier.notify_trade_opened(
                symbol="EURUSD",
                direction="BUY",
                volume=0.1,
                price=1.08500,
                sl=1.08000,
                tp=1.09000,
                ticket=10000 + i,
                ml_confidence=0.85
            )
            t1 = time.perf_counter_ns()
            duration_ms = (t1 - t0) / 1_000_000.0
            latencies_ms.append(duration_ms)
            if not res:
                raise RuntimeError(f"notify_trade_opened returned False at iteration {i}")

        avg_lat = statistics.mean(latencies_ms)
        max_lat = max(latencies_ms)
        min_lat = min(latencies_ms)
        passed = max_lat < 10.0

        return {
            "test_name": "Extreme Network Stall (5s)",
            "passed": passed,
            "num_calls": num_calls,
            "simulated_delay_s": simulated_delay_sec,
            "avg_ms": avg_lat,
            "max_ms": max_lat,
            "min_ms": min_lat,
            "threshold_ms": 10.0
        }
    finally:
        notifier.stop(timeout=1.0)


# ════════════════════════════════════════════════════════════════════════════════
# 2. CHALLENGE 2: HIGH CONCURRENCY MULTI-THREADED PRODUCERS
# ════════════════════════════════════════════════════════════════════════════════

def challenge_multithreaded_concurrency(
    num_threads: int = 10,
    calls_per_thread: int = 30
) -> Dict[str, Any]:
    """
    Test 2: Multiple concurrent threads calling notify_* simultaneously.
    Simulates engine threads (Order routing, surveillance, FastAPI websocket, KillSwitch).
    Checks for race conditions, deadlock, or exception leaks.
    """
    notifier = TelegramNotifier("MOCK_TOKEN", "MOCK_CHAT_ID")
    dispatched_count = 0
    lock = threading.Lock()

    def counting_dispatch(*args, **kwargs):
        nonlocal dispatched_count
        with lock:
            dispatched_count += 1
        return True

    notifier._dispatch_with_retry = counting_dispatch
    latencies_per_thread: Dict[int, List[float]] = {t: [] for t in range(num_threads)}
    errors: List[Exception] = []

    def caller_worker(thread_id: int):
        for i in range(calls_per_thread):
            try:
                t0 = time.perf_counter_ns()
                res = notifier.notify_trade_opened(
                    symbol="GBPUSD",
                    direction="SELL",
                    volume=0.2,
                    price=1.2850,
                    sl=1.2900,
                    tp=1.2750,
                    ticket=thread_id * 1000 + i
                )
                t1 = time.perf_counter_ns()
                latencies_per_thread[thread_id].append((t1 - t0) / 1_000_000.0)
                if not res:
                    errors.append(RuntimeError(f"Thread {thread_id} got False on call {i}"))
            except Exception as ex:
                errors.append(ex)

    threads = [threading.Thread(target=caller_worker, args=(t,)) for t in range(num_threads)]
    total_calls = num_threads * calls_per_thread

    try:
        t_start = time.perf_counter()
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10.0)
        wall_time_s = time.perf_counter() - t_start

        all_latencies = [lat for thread_lats in latencies_per_thread.values() for lat in thread_lats]
        max_lat = max(all_latencies) if all_latencies else 0.0
        avg_lat = statistics.mean(all_latencies) if all_latencies else 0.0

        passed = len(errors) == 0 and max_lat < 10.0 and len(all_latencies) == total_calls

        return {
            "test_name": "Multi-threaded Concurrency",
            "passed": passed,
            "num_threads": num_threads,
            "total_calls": total_calls,
            "errors_count": len(errors),
            "errors": [str(e) for e in errors[:5]],
            "avg_ms": avg_lat,
            "max_ms": max_lat,
            "wall_time_s": wall_time_s
        }
    finally:
        notifier.stop(timeout=2.0)


# ════════════════════════════════════════════════════════════════════════════════
# 3. CHALLENGE 3: QUEUE SATURATION BEHAVIOR (> 500 ALERTS)
# ════════════════════════════════════════════════════════════════════════════════

def challenge_queue_saturation_stress(
    burst_count: int = 750
) -> Dict[str, Any]:
    """
    Test 3: Pushes > 500 alerts into the bounded queue while worker is frozen.
    Verifies:
    - Bounded queue memory (queue size does not exceed maxsize 500)
    - Caller thread is NEVER blocked (latency remains < 10.0 ms)
    - No unhandled exceptions or deadlocks during queue eviction
    - Identifies race condition vulnerabilities in get_nowait / put_nowait eviction
    """
    # Initialize with worker stopped so queue fills up completely
    notifier = TelegramNotifier("MOCK_TOKEN", "MOCK_CHAT_ID", auto_start=False)
    max_size = notifier.queue.maxsize
    latencies_ms: List[float] = []
    success_count = 0
    failure_count = 0

    try:
        for i in range(burst_count):
            t0 = time.perf_counter_ns()
            res = notifier.send_message(f"Saturation Stress Test Alert #{i}")
            t1 = time.perf_counter_ns()
            duration_ms = (t1 - t0) / 1_000_000.0
            latencies_ms.append(duration_ms)

            if res:
                success_count += 1
            else:
                failure_count += 1

        final_queue_size = notifier.queue.qsize()
        max_lat = max(latencies_ms)
        avg_lat = statistics.mean(latencies_ms)

        # Queue must remain bounded
        bounded = final_queue_size <= max_size
        latency_ok = max_lat < 10.0

        return {
            "test_name": "Queue Saturation (>500 alerts)",
            "passed": bounded and latency_ok,
            "burst_count": burst_count,
            "max_queue_size": max_size,
            "final_queue_size": final_queue_size,
            "success_count": success_count,
            "failure_count": failure_count,
            "avg_ms": avg_lat,
            "max_ms": max_lat,
            "queue_bounded": bounded
        }
    finally:
        notifier.stop()


# ════════════════════════════════════════════════════════════════════════════════
# 4. CHALLENGE 4: FAIL-SAFE MODE (EMPTY/OMITTED CREDENTIALS)
# ════════════════════════════════════════════════════════════════════════════════

def challenge_failsafe_mode() -> Dict[str, Any]:
    """
    Test 4: Verifies fail-safe behavior when credentials are empty or omitted:
    - enabled == False
    - is_running == False
    - No worker thread started (_worker_thread is None)
    - All notify_* calls return False immediately (< 1.0 ms)
    - Zero network calls attempted
    """
    notifier = TelegramNotifier("", "")
    latencies: List[float] = []

    # Patch socket or requests to ensure zero network activity
    with patch("infrastructure.telegram_notifier.HAS_REQUESTS", True), \
         patch("requests.Session") as mock_req:
        
        # Verify disabled state
        enabled_val = notifier.enabled
        running_val = notifier.is_running
        thread_started = notifier._worker_thread is not None

        # Verify notify_* calls
        t0 = time.perf_counter_ns()
        r1 = notifier.send_message("FailSafe Test")
        r2 = notifier.notify_trade_opened("EURUSD", "BUY", 0.1, 1.08, 1.07, 1.09, 1)
        r3 = notifier.notify_critical_event("TEST", "Details")
        t1 = time.perf_counter_ns()

        latencies.append((t1 - t0) / 1_000_000.0)

        calls_returned_false = (r1 is False and r2 is False and r3 is False)
        no_network = mock_req.call_count == 0

        passed = (
            not enabled_val and
            not running_val and
            not thread_started and
            calls_returned_false and
            no_network and
            latencies[0] < 1.0
        )

        return {
            "test_name": "Fail-Safe Mode (Empty Credentials)",
            "passed": passed,
            "enabled": enabled_val,
            "is_running": running_val,
            "thread_started": thread_started,
            "calls_returned_false": calls_returned_false,
            "no_network_calls": no_network,
            "latency_ms": latencies[0]
        }


# ════════════════════════════════════════════════════════════════════════════════
# 5. CHALLENGE 5: INTERFACE CONTRACT AUDIT (PROJECT.md vs IMPLEMENTATION)
# ════════════════════════════════════════════════════════════════════════════════

def challenge_interface_contract_conformance() -> Dict[str, Any]:
    """
    Test 5: Adversarially tests interface contracts from PROJECT.md against implementation:
    - TelegramNotifier(bot_token=..., chat_id=..., max_queue_size=...) keyword support
    - notify_trade_closed(ticket, symbol, direction, volume, profit, reason, close_price=None)
    - notify_critical_event(event_type, reason, details=None)
    - notify_daily_summary(date_str, daily_pnl, win_rate, kelly_fraction, total_trades, balance, equity)
    """
    discrepancies: List[str] = []

    # 1. Constructor test
    try:
        n = TelegramNotifier(bot_token="TOKEN", chat_id="CHAT", max_queue_size=500, auto_start=False)
    except TypeError as e:
        discrepancies.append(f"Constructor rejects PROJECT.md parameters (bot_token / max_queue_size): {e}")

    n_test = TelegramNotifier("TOKEN", "CHAT", auto_start=False)

    # 2. notify_trade_closed signature test
    sig_close = inspect.signature(n_test.notify_trade_closed)
    params_close = list(sig_close.parameters.keys())
    # Expected: ticket, symbol, direction, volume, profit, reason, close_price
    if params_close != ["symbol", "ticket", "order_type", "volume", "profit", "reason"] and \
       params_close != ["ticket", "symbol", "direction", "volume", "profit", "reason", "close_price"]:
        discrepancies.append(f"notify_trade_closed signature is {params_close}")
    if "close_price" not in params_close:
        discrepancies.append("notify_trade_closed lacks 'close_price' parameter specified in PROJECT.md")
    if params_close and params_close[0] != "ticket":
        discrepancies.append(f"notify_trade_closed first parameter is '{params_close[0]}' instead of 'ticket'")
    if "direction" not in params_close:
        discrepancies.append("notify_trade_closed uses 'order_type' instead of 'direction' from PROJECT.md")

    # 3. notify_critical_event signature test
    sig_crit = inspect.signature(n_test.notify_critical_event)
    params_crit = list(sig_crit.parameters.keys())
    if "reason" not in params_crit:
        discrepancies.append(f"notify_critical_event signature is {params_crit}, missing 'reason' from PROJECT.md (event_type, reason, details)")

    # 4. notify_daily_summary signature test
    sig_daily = inspect.signature(n_test.notify_daily_summary)
    params_daily = list(sig_daily.parameters.keys())
    if "date_str" not in params_daily:
        discrepancies.append(f"notify_daily_summary signature is {params_daily}, missing 'date_str' from PROJECT.md")

    # 5. Hidden Bug: Check for _stop_event usage vs time.sleep in _dispatch_with_retry
    src = inspect.getsource(n_test._dispatch_with_retry)
    if "_stop_event" not in src and "time.sleep" in src:
        discrepancies.append("Worker sleep uses time.sleep() instead of _stop_event.wait(), blocking clean stop() during backoff")

    # 6. Hidden Bug: Check for html.escape usage
    src_opened = inspect.getsource(n_test.notify_trade_opened)
    if "html.escape" not in src_opened:
        discrepancies.append("notify_trade_opened does not use html.escape() despite claiming HTML sanitization")

    return {
        "test_name": "Interface Contract & Hidden Flaws Audit",
        "passed": len(discrepancies) == 0,
        "discrepancies_count": len(discrepancies),
        "discrepancies": discrepancies
    }


def run_all_challenges() -> Dict[str, Any]:
    """Runs the entire empirical challenge suite."""
    print("=" * 80)
    print("  EMPIRICAL CHALLENGER (challenger_m1_1) — ADVERSARIAL VERIFICATION SUITE")
    print("=" * 80)

    results = {}

    # Challenge 1
    print("\n[CHALLENGE 1] Measuring caller blocking time under 5s simulated network stall...")
    r1 = challenge_extreme_delay_caller_latency(num_calls=50, simulated_delay_sec=5.0)
    results["challenge_1_latency"] = r1
    status1 = "PASS" if r1["passed"] else "FAIL"
    print(f"  [{status1}] Avg Latency: {r1['avg_ms']:.4f} ms | Max: {r1['max_ms']:.4f} ms | Threshold: {r1['threshold_ms']} ms")

    # Challenge 2
    print("\n[CHALLENGE 2] Testing multi-threaded concurrency (10 threads, 300 calls)...")
    r2 = challenge_multithreaded_concurrency(num_threads=10, calls_per_thread=30)
    results["challenge_2_concurrency"] = r2
    status2 = "PASS" if r2["passed"] else "FAIL"
    print(f"  [{status2}] Total Calls: {r2['total_calls']} | Errors: {r2['errors_count']} | Max Latency: {r2['max_ms']:.4f} ms")

    # Challenge 3
    print("\n[CHALLENGE 3] Testing queue saturation behavior (> 500 alerts: 750 burst)...")
    r3 = challenge_queue_saturation_stress(burst_count=750)
    results["challenge_3_saturation"] = r3
    status3 = "PASS" if r3["passed"] else "FAIL"
    print(f"  [{status3}] Burst: {r3['burst_count']} | Final Queue Size: {r3['final_queue_size']}/{r3['max_queue_size']} | Max Latency: {r3['max_ms']:.4f} ms")

    # Challenge 4
    print("\n[CHALLENGE 4] Testing fail-safe mode with empty credentials...")
    r4 = challenge_failsafe_mode()
    results["challenge_4_failsafe"] = r4
    status4 = "PASS" if r4["passed"] else "FAIL"
    print(f"  [{status4}] Enabled: {r4['enabled']} | Running: {r4['is_running']} | Latency: {r4['latency_ms']:.4f} ms")

    # Challenge 5
    print("\n[CHALLENGE 5] Auditing interface contracts and architectural claims...")
    r5 = challenge_interface_contract_conformance()
    results["challenge_5_contracts"] = r5
    status5 = "PASS" if r5["passed"] else "FAIL"
    print(f"  [{status5}] Discrepancies found: {r5['discrepancies_count']}")
    for d in r5["discrepancies"]:
        print(f"    • {d}")

    print("\n" + "=" * 80)
    all_ok = all(r["passed"] for r in results.values())
    if all_ok:
        print("  GLOBAL VERDICT: APPROVE")
    else:
        print("  GLOBAL VERDICT: REQUEST_CHANGES (Interface & Architectural Discrepancies Found)")
    print("=" * 80)

    return results


if __name__ == "__main__":
    res = run_all_challenges()
    sys.exit(0 if all(r["passed"] for r in res.values()) else 1)
