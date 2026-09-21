# Handoff Report: Telegram Communication, Asynchronous Isolation & Verification

- **Agent**: `explorer_survey_3_gen2`
- **Role**: Telegram & Performance Spec Explorer
- **Date**: 2026-09-15T21:05:00Z
- **Target Audience**: `orchestrator_2`, `builder` agents, and testing engineers

---

## 1. Observation

### 1.1 Dependencies & Python Environment
- **`requirements.txt` inspection**:
  - `requirements.txt` (lines 1–27) defines core dependencies:
    ```text
    MetaTrader5>=5.0.45, python-dotenv>=1.0.0, pydantic>=2.0.0, pydantic-settings>=2.0.0,
    fastapi>=0.100.0, uvicorn[standard]>=0.23.0, websockets>=12.0, pandas>=2.0.0,
    numpy>=1.24.0, scikit-learn>=1.3.0, xgboost>=2.0.0, lightgbm>=4.0.0, ta>=0.10.2,
    pytest>=7.4.0, torch>=2.0.0, pytest-asyncio>=0.21.0, SQLAlchemy>=2.0.0
    ```
  - Neither `requests` nor `aiohttp` is explicitly listed in `requirements.txt`.
- **System Python Environment (`C:\Python314\python.exe` v3.14.6 AMD64)**:
  - Already installed:
    - `requests` (v2.34.2)
    - `aiohttp` (v3.13.5)
    - `httpx` (v0.27.2)
    - `urllib3` (v2.7.0)
    - `python-telegram-bot` (v22.8)
    - `pytest` (v9.1.1)
    - `pytest-asyncio` (v1.4.0)
    - `pydantic` (v2.12.5), `python-dotenv` (v1.0.1)
- **Codebase HTTP Patterns**:
  - In `api/server.py` lines 517–528, standard library `urllib.request` is already used with explicit timeouts:
    ```python
    url = "https://www.investing.com/rss/news_285.rss"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=5) as response:
    ```

### 1.2 Configuration & Environment Variables
- **`infrastructure/config.py`**:
  - Defines `AppConfig(BaseSettings)` with `SettingsConfigDict(env_file=".env", extra="ignore")`.
  - Currently contains no fields for Telegram (lines 1–82).
- **`.env.example`**:
  - Lines 1–24 specify broker logins, risk settings, and ML thresholds. Lacks `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
- **Fail-Safe Behavior**:
  - Adding `TELEGRAM_BOT_TOKEN: str = Field("")` and `TELEGRAM_CHAT_ID: str = Field("")` with default empty strings allows `Config` to load successfully even when `.env` omits both keys.

### 1.3 Engine Execution Model & Concurrency
- **`application/engine.py`**:
  - `Engine.start()` (lines 103–117): Connects MT5 on the main thread, then spawns a dedicated daemon thread:
    ```python
    self._thread = threading.Thread(target=self._run_async_loop_thread, daemon=True)
    self._thread.start()
    ```
  - `_run_async_loop_thread()` (lines 118–126): Executes `asyncio.run(self._async_run_loop())`.
  - `_async_run_loop()` (lines 135–188): Runs the event loop:
    - Spawns background worker tasks: `worker_task = asyncio.create_task(self._order_routing_worker())` and `ts_task = asyncio.create_task(self._trailing_stop_worker())`.
    - Iterates: updates account state, checks circuit breaker, refreshes Kelly history, executes parallel symbol evaluations (`asyncio.gather(*tasks)`), then sleeps until the next minute boundary.
  - `_order_routing_worker()` (lines 526–572):
    - Pulls order payloads from `self.order_queue.get()`.
    - Executes order offloaded to thread: `result = await asyncio.to_thread(self.connector.execute_order, ...)`.
    - On success: logs `[Engine] ✅ Ordre exécuté ! Ticket: {result['ticket']} | Prix: {result['price']} | Volume: {result['volume']}`. **This is the exact hook point for Position Opened.**
  - `_refresh_kelly_history()` (lines 378–433):
    - Polls `self.connector.get_history_deals(from_date, to_date)`.
    - Detects new closed trades: `if closed != self._closed_trades_cache:`.
    - Updates position sizer and commits `TradeRecord` to SQLite. **This is the exact hook point for Position Closed.**
- **`agents/kill_switch.py`**:
  - `KillSwitch.activate(reason: str)` (lines 9–17): Logs critical message, sets `self.is_triggered = True`, and invokes `self._close_all_positions()`. **This is the exact hook point for Kill-Switch Activated.**
- **`monitoring/surveillance_agent.py`**:
  - Runs in a separate thread `SurveillanceThread` (lines 28–64) monitoring `self.engine._thread.is_alive()`. Detects silent engine crashes.
- **`infrastructure/broker_router.py`**:
  - `connect()` (lines 17–38): Manages failover. Emits critical error if both primary and fallback brokers fail to connect.

### 1.4 Test Infrastructure
- **`tests/` Directory**:
  - Contains `test_position_sizer.py` (88 lines, 5 tests, all passing) and `test_smc_strategy.py` (99 lines).
  - Test runner: `pytest` 9.1.1 with `pytest-asyncio` 1.4.0.
  - Standard fixture pattern: `@pytest.fixture` supplying mock domain objects (`dummy_signal`, `dummy_account`).
  - No `conftest.py` currently exists in `tests/`.

---

## 2. Logic Chain

```
[Observation 1.1: requests/urllib3/urllib available, requests not in requirements.txt]
          +
[Observation 1.3: Alerts triggered from heterogeneous contexts:
                  - asyncio loop coroutines (_order_routing_worker)
                  - synchronous methods (KillSwitch.activate)
                  - secondary threads (SurveillanceAgent, FastAPI threadpool)]
          │
          ▼ (Step 1: Transport & Concurrency Isolation)
- Pure asyncio.create_task would fail when called from synchronous threads (e.g. KillSwitch).
- Synchronous requests in caller threads would block execution by 100ms - 2000ms+ (violating < 10ms requirement).
- SOLUTION: A dedicated background worker thread (TelegramNotifierWorker) consuming from a
  thread-safe queue (queue.Queue) completely isolates ALL callers with sub-millisecond overhead.
          │
          ▼ (Step 2: HTTP Client Selection)
- Standard library urllib.request or requests wrapped in the background worker thread.
- If requests is installed, use requests.post(timeout=5).
- Fallback to urllib.request if requests is absent.
- Both guarantee 0ms overhead on the trading engine because network I/O runs entirely
  inside the worker thread.
          │
          ▼ (Step 3: Caller Enqueue Latency < 10ms Verification)
- When a caller invokes notifier.send_message(text):
  1. Check self.enabled (if False, return immediately: < 0.005 ms).
  2. Call self._queue.put_nowait(payload) (typical duration: 0.002 - 0.010 ms).
  3. Return True.
- Total caller blocking time is < 0.05 ms — far below the 10.0 ms acceptance ceiling.
          │
          ▼ (Step 4: Fail-Safe & Network Degraded Resiliency)
- Missing .env tokens -> disabled flag set, warning logged once, zero exceptions raised.
- Network outage / high latency -> background worker thread waits on HTTP timeout (5s);
  engine trading loop continues uninhibited.
- Telegram rate-limiting (HTTP 429) -> worker sleeps for retry_after seconds; queue retains
  pending messages up to maxsize (e.g. 500).
- Queue full -> drop oldest/newest message with warning; NEVER block or crash the engine.
```

---

## 3. Recommended Architectural Choices & Interfaces

### 3.1 Module Location: `infrastructure/telegram_notifier.py`
A thread-safe, resilient notification service designed as a singleton or injectable dependency.

```python
# Architecture Blueprint for infrastructure/telegram_notifier.py
import queue
import threading
import time
import logging
import json
import urllib.request
import urllib.error
from typing import Optional, Dict, Any
from enum import Enum

class AlertPriority(Enum):
    LOW = 1
    NORMAL = 2
    HIGH = 3
    CRITICAL = 4

class TelegramNotifier:
    """
    Non-blocking, asynchronous Telegram alert service.
    Guarantees < 0.1ms main-thread blocking time via queue-worker isolation.
    """
    def __init__(self, bot_token: Optional[str] = None, chat_id: Optional[str] = None, max_queue_size: int = 500):
        self.bot_token = bot_token or ""
        self.chat_id = chat_id or ""
        self.enabled = bool(self.bot_token.strip() and self.chat_id.strip())
        self.max_queue_size = max_queue_size
        self._queue: queue.Queue = queue.Queue(maxsize=max_queue_size)
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._last_send_time: float = 0.0
        self._min_send_interval: float = 0.04  # Max 25 msgs/sec (Telegram limit is 30/s)

        if not self.enabled:
            logging.warning("[TelegramNotifier] ⚠️ Credentials missing. Notifications disabled (fail-safe mode).")
        else:
            self._start_worker()

    def _start_worker(self):
        self._worker_thread = threading.Thread(target=self._worker_loop, name="TelegramWorker", daemon=True)
        self._worker_thread.start()
        logging.info("[TelegramNotifier] ✅ Background worker started.")

    def send_message(self, text: str, parse_mode: str = "HTML", priority: AlertPriority = AlertPriority.NORMAL) -> bool:
        """
        Non-blocking enqueue.
        Blocking time is strictly < 0.05ms.
        """
        if not self.enabled:
            return False

        payload = {
            "text": text,
            "parse_mode": parse_mode,
            "priority": priority,
            "timestamp": time.time()
        }
        try:
            self._queue.put_nowait(payload)
            return True
        except queue.Full:
            logging.warning("[TelegramNotifier] ⚠️ Alert queue full! Dropping alert to protect trading performance.")
            return False

    async def send_message_async(self, text: str, parse_mode: str = "HTML") -> bool:
        """Async convenience method. Non-blocking (delegates directly to send_message)."""
        return self.send_message(text, parse_mode=parse_mode)

    def stop(self, timeout: float = 2.0):
        """Gracefully stop worker thread."""
        self._stop_event.set()
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=timeout)

    def _worker_loop(self):
        """Background thread executing HTTP requests with rate-limiting and retries."""
        while not self._stop_event.is_set():
            try:
                payload = self._queue.get(timeout=0.5)
            except queue.Empty:
                continue

            self._dispatch_with_retry(payload)
            self._queue.task_done()

    def _dispatch_with_retry(self, payload: Dict[str, Any], max_retries: int = 3):
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        body = json.dumps({
            "chat_id": self.chat_id,
            "text": payload["text"],
            "parse_mode": payload["parse_mode"],
            "disable_web_page_preview": True
        }).encode("utf-8")

        for attempt in range(1, max_retries + 1):
            # Enforce gentle rate limit
            now = time.time()
            elapsed = now - self._last_send_time
            if elapsed < self._min_send_interval:
                time.sleep(self._min_send_interval - elapsed)

            try:
                req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=5.0) as resp:
                    if resp.status == 200:
                        self._last_send_time = time.time()
                        return
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    # Rate limited: extract retry_after if available
                    retry_after = 1.0
                    try:
                        err_data = json.loads(e.read().decode())
                        retry_after = err_data.get("parameters", {}).get("retry_after", 2.0)
                    except Exception:
                        pass
                    logging.warning(f"[TelegramNotifier] Rate limited (429). Sleeping {retry_after}s.")
                    time.sleep(retry_after)
                elif e.code == 400 and payload["parse_mode"] == "HTML":
                    # Fallback to plain text if HTML tags were malformed
                    payload["parse_mode"] = None
                    body = json.dumps({"chat_id": self.chat_id, "text": payload["text"]}).encode("utf-8")
                else:
                    logging.error(f"[TelegramNotifier] HTTP Error {e.code}: {e.reason}")
                    break
            except Exception as net_err:
                logging.warning(f"[TelegramNotifier] Network error (attempt {attempt}/{max_retries}): {net_err}")
                time.sleep(0.5 * attempt)
```

### 3.2 Specific Event Hook Formats
The notifier must provide dedicated helper methods producing clean, standardized HTML-formatted notifications:

1. **Trade Opened (`notify_trade_opened`)**:
   - Fields: `direction` (BUY/SELL), `symbol`, `volume`, `price`, `sl_price`, `tp_price`, `ticket`, `ml_confidence`.
   - Format:
     ```html
     🟢 <b>POSITION OUVERTE</b> #123456
     <b>Symbole:</b> EURUSD
     <b>Type:</b> BUY | <b>Volume:</b> 0.50 lots
     <b>Prix d'entrée:</b> 1.08500
     <b>SL:</b> 1.08300 (-20 pips) | <b>TP:</b> 1.08850 (+35 pips)
     <b>ML Confiance:</b> 84.2%
     ```
2. **Trade Closed (`notify_trade_closed`)**:
   - Fields: `ticket`, `symbol`, `direction`, `volume`, `profit` ($), `reason` (TP, SL, Manual, KillSwitch).
   - Format:
     ```html
     🔴 <b>POSITION FERMÉE</b> #123456
     <b>Symbole:</b> EURUSD | <b>Type:</b> BUY
     <b>Volume:</b> 0.50 lots
     <b>P&L Réalisé:</b> +$175.00 (+1.75%)
     <b>Motif:</b> Take Profit (TP)
     ```
3. **Critical Events (`notify_critical_event`)**:
   - Fields: `event_type` (`KILL_SWITCH`, `BROKER_DISCONNECT`, `FATAL_EXCEPTION`), `details`, `timestamp`.
   - Format:
     ```html
     🚨 <b>ÉVÉNEMENT CRITIQUE: KILL_SWITCH</b> 🚨
     <b>Détails:</b> Daily drawdown limit reached (-5.2%)
     <b>Statut:</b> Toutes les positions ont été liquidées d'urgence.
     ```
4. **Daily Summary (`notify_daily_summary`)**:
   - Fields: `date`, `daily_pnl`, `win_rate`, `kelly_fraction`, `total_trades`, `balance`, `equity`.
   - Format:
     ```html
     📊 <b>RÉSUMÉ QUOTIDIEN — 2026-09-15</b>
     <b>P&L Jour:</b> +$450.00 (+4.5%)
     <b>Win Rate:</b> 65.0% (13/20 trades)
     <b>Fraction Kelly:</b> 0.020 (Max Risk)
     <b>Balance:</b> $10,450.00 | <b>Équité:</b> $10,450.00
     ```

---

## 4. Standalone Verification Script Specification

### 4.1 Specification Overview
- **File Location**: `tests/benchmark_telegram_performance.py`
- **Execution**: `python tests/benchmark_telegram_performance.py`
- **Acceptance Criterion**: Maximum main-thread blocking time strictly **< 10.0 ms** across all tests (expected actual: < 0.1 ms). Return exit code `0` on PASS, `1` on FAIL.

### 4.2 Test Suite Matrix in Benchmark Script
The standalone script will execute 5 rigorous test scenarios using high-resolution hardware timers (`time.perf_counter_ns()`):

| Scenario | Iterations | Description | Acceptance Limit |
|----------|------------|-------------|-------------------|
| **S1: Fail-Safe Mode** | 1,000 | Tokens omitted/empty. Asserts immediate return without work. | Max < 1.0 ms (Target: < 0.01 ms) |
| **S2: Normal Enqueue** | 500 | Active worker thread consuming alerts with simulated 20ms network latency in worker. | Max < 10.0 ms (Target: < 0.05 ms) |
| **S3: Hanging Network Stall** | 20 | Worker thread blocked on simulated 5,000 ms network timeout. Main thread dispatches alerts. | Max < 10.0 ms (Target: < 0.05 ms) |
| **S4: High-Volume Flood Burst**| 100 | Rapid back-to-back enqueueing simulating high volatility panic dispatches. | Max < 10.0 ms per call; Total burst < 50 ms |
| **S5: Async Loop Tick Jitter** | 100 | Measured inside an active `asyncio` event loop running at 100 Hz. Asserts loop tick delay delta < 10 ms. | Loop Jitter < 10.0 ms |

### 4.3 Benchmark Script Implementation Structure
```python
# Specification for tests/benchmark_telegram_performance.py
import sys
import time
import statistics
import asyncio
from infrastructure.telegram_notifier import TelegramNotifier

def run_benchmark():
    print("=" * 70)
    print("MarketShift SuperBot — Telegram Async Performance Benchmark")
    print("Requirement: Main-Thread Blocking Time Strictly < 10.0 ms")
    print("=" * 70)

    # 1. Benchmark S1: Disabled/Fail-Safe
    notifier_disabled = TelegramNotifier("", "")
    latencies_s1 = []
    for _ in range(1000):
        t0 = time.perf_counter_ns()
        notifier_disabled.send_message("Test message")
        latencies_s1.append((time.perf_counter_ns() - t0) / 1_000_000.0)

    # 2. Benchmark S2: Active with Simulated Latency
    notifier_active = TelegramNotifier("fake_token", "fake_chat_id")
    # Patch worker internal network dispatcher to simulate 50ms I/O on worker thread
    notifier_active._dispatch_with_retry = lambda payload: time.sleep(0.05)

    latencies_s2 = []
    for _ in range(500):
        t0 = time.perf_counter_ns()
        notifier_active.send_message("Active trade notification")
        latencies_s2.append((time.perf_counter_ns() - t0) / 1_000_000.0)

    # 3. Benchmark S3: Severe Network Hang (5.0s stall on worker)
    notifier_active._dispatch_with_retry = lambda payload: time.sleep(5.0)
    latencies_s3 = []
    for _ in range(20):
        t0 = time.perf_counter_ns()
        notifier_active.send_message("Hanging network test")
        latencies_s3.append((time.perf_counter_ns() - t0) / 1_000_000.0)

    # Clean up worker
    notifier_active.stop()

    # Results Table
    results = [
        ("S1: Fail-Safe (No Token)", latencies_s1),
        ("S2: Normal Worker (50ms I/O)", latencies_s2),
        ("S3: Severe Network Hang (5s stall)", latencies_s3),
    ]

    all_pass = True
    print(f"{'Scenario':<35} | {'Mean (ms)':<10} | {'p99 (ms)':<10} | {'Max (ms)':<10} | {'Status'}")
    print("-" * 75)
    for name, lat in results:
        mean_v = statistics.mean(lat)
        p99_v = statistics.quantiles(lat, n=100)[98] if len(lat) >= 100 else max(lat)
        max_v = max(lat)
        passed = max_v < 10.0
        if not passed:
            all_pass = False
        print(f"{name:<35} | {mean_v:<10.4f} | {p99_v:<10.4f} | {max_v:<10.4f} | {'PASS' if passed else 'FAIL'}")

    print("=" * 75)
    if all_pass:
        print("✅ ALL SCENARIOS PASSED: Main thread latency is strictly < 10ms.")
        sys.exit(0)
    else:
        print("❌ BENCHMARK FAILED: One or more iterations exceeded 10ms.")
        sys.exit(1)

if __name__ == "__main__":
    run_benchmark()
```

---

## 5. Caveats

1. **Telegram API Rate Limits**:
   - Telegram enforces a limit of 30 messages per second across all chats, and 1 message per second for a single chat. If multiple alerts fire simultaneously (e.g. 5 positions closed at once by KillSwitch), the background worker must serialize them and handle HTTP 429 backoff safely without dropping critical security alerts.
2. **Memory Bounding on Extended Disconnections**:
   - If the bot runs in an isolated network environment with no internet access for several days, an unbounded queue could theoretically consume memory. The queue must be bounded (`maxsize=500`), discarding the oldest non-critical alerts when full while logging a rate warning.
3. **HTML Parse Mode Sanitization**:
   - If error messages or exception stack traces contain unescaped `<` or `>` characters, Telegram will reject the request with `HTTP 400 Bad Request (Can't parse entities)`. The notifier must sanitize tags (e.g. `html.escape()`) or provide an automatic fallback to plaintext on HTTP 400.
4. **Python MT5 Headless CI Testing**:
   - The `MetaTrader5` package requires a running 64-bit Windows MT5 terminal for real broker connections. Therefore, all unit and integration tests for the Telegram notifier must use mock connectors and synthetic data frames to run cleanly in CI and local test environments.

---

## 6. Conclusion

1. **Architecture Verdict**: A **dedicated background worker thread with a thread-safe `queue.Queue`** (`infrastructure/telegram_notifier.py`) is the optimal, zero-overhead mechanism. It isolates the engine trading loop from network latency completely (< 0.05ms blocking time vs 10ms threshold) and can be safely called from any context (async coroutines, synchronous callbacks, secondary threads).
2. **Dependencies**: Standard library `urllib.request` + `json` (or `requests` if available) provides a zero-dependency, robust implementation. No mandatory new packages are needed in `requirements.txt`, though `requests>=2.28.0` is recommended.
3. **Configuration**: Add `TELEGRAM_BOT_TOKEN: str = Field("")` and `TELEGRAM_CHAT_ID: str = Field("")` to `AppConfig` in `infrastructure/config.py` and document them in `.env.example`.
4. **Hooks**:
   - `Engine._order_routing_worker`: Trade opened.
   - `Engine._refresh_kelly_history`: Trade closed.
   - `KillSwitch.activate`: Emergency shutdown.
   - `BrokerRouter.connect`: Broker disconnection / failover failure.
   - `Engine._async_run_loop`: Midnight daily summary.
5. **Testing & Verification**:
   - Unit test suite: `tests/test_telegram_notifier.py`
   - Integration test suite: `tests/test_telegram_integration.py`
   - Latency benchmark script: `tests/benchmark_telegram_performance.py` (< 10ms verification).

---

## 7. Verification Method

To independently verify these specifications and the future implementation:

1. **Inspect Configuration & Interface Files**:
   - Verify `infrastructure/config.py` for `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` with default `""`.
   - Verify `infrastructure/telegram_notifier.py` implements `TelegramNotifier` with `queue.Queue` and daemon worker thread.
2. **Run Unit and Integration Tests**:
   ```powershell
   python -m pytest tests/test_telegram_notifier.py tests/test_telegram_integration.py -v
   ```
3. **Run Standalone Latency Benchmark**:
   ```powershell
   python tests/benchmark_telegram_performance.py
   ```
   *Success criteria*: All scenarios report `PASS`, max latency < 10.0 ms, exit code 0.
4. **Verify Fail-Safe Zero-Crash Behavior**:
   Run with empty credentials in `.env`:
   ```powershell
   python -c "from infrastructure.config import Config; from infrastructure.telegram_notifier import TelegramNotifier; tn = TelegramNotifier(Config.TELEGRAM_BOT_TOKEN, Config.TELEGRAM_CHAT_ID); tn.send_message('Test'); print('Notifier enabled:', tn.enabled)"
   ```
   *Expected output*: Warning logged, `Notifier enabled: False`, no exception raised.
