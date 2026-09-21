# Comprehensive Architectural Survey & Integration Blueprint: Telegram Alert System

**Agent**: `explorer_survey_1_gen2`  
**Date**: 2026-09-15  
**Target Project**: MarketShift SuperBot v2.0  
**Scope**: Core Trading Engine Architecture, Execution Loops, Event Hooks & Lifecycle  

---

## 1. Observation

Direct code observations across the repository files:

### 1.1 Process & Thread Architecture (`main.py`)
- **Lines 40–85 (`main.py`)**:
  - `xm_connector = MT5Connector(...)` (line 48)
  - `exness_connector = MT5Connector(...)` (line 55)
  - `router = BrokerRouter(primary=xm_connector, fallback=exness_connector)` (line 61)
  - `db_session = SessionLocal()` (line 64)
  - `engine = Engine(router, db_session=db_session)` (line 65)
  - `init_api(engine)` (line 69)
  - `engine.start()` (line 73)
  - `surveillance = SurveillanceAgent(engine); surveillance.start()` (lines 78–79)
  - `uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")` (line 84)
- **Observation**:
  - The **Main Thread** is occupied exclusively by `uvicorn.run(...)`.
  - The **Engine** runs in its own dedicated daemon thread (`threading.Thread(target=self._run_async_loop_thread, daemon=True)`).
  - The **Surveillance Agent** runs in a third thread (`threading.Thread(target=self._monitor_loop, daemon=True, name="SurveillanceThread")`).
  - **MLTrainer** runs retrain cycles in background threads via `start_auto_retrain`.

### 1.2 Engine Execution Model (`application/engine.py`)
- **`Engine.start()` (lines 103–117)**:
  - Connects to MT5 on the caller thread: `self.connector.connect()` (line 105).
  - Sets `self.running = True` (line 109).
  - Spawns thread: `self._thread = threading.Thread(target=self._run_async_loop_thread, daemon=True)` (line 110).
  - Starts ML retrainer: `self.ml_trainer.start_auto_retrain(self.connector, self.symbols)` (line 114).
- **`Engine._run_async_loop_thread()` (lines 118–126)**:
  - Verifies/reconnects MT5: `self.connector.connect()` (line 120).
  - Launches asyncio runtime: `asyncio.run(self._async_run_loop())` (line 125).
- **`Engine.stop()` (lines 127–134)**:
  - Sets `self.running = False` (line 128).
  - `self.ml_trainer.stop()` (line 129).
  - `self._thread.join(timeout=5)` (line 131).
  - `self.connector.disconnect()` (line 132).
- **`Engine._async_run_loop()` (lines 135–188)**:
  - Instantiates queue: `self.order_queue = asyncio.Queue()` (line 137).
  - Spawns background worker tasks:
    - `worker_task = asyncio.create_task(self._order_routing_worker())` (line 138)
    - `ts_task = asyncio.create_task(self._trailing_stop_worker())` (line 139)
  - Main loop (`while self.running:`):
    - Kill-switch check: `if self.kill_switch.is_triggered: await asyncio.sleep(1); continue` (lines 142–144).
    - Synchronous state sync: `self.state_manager.update_state()` (line 149).
    - Safety checks: `self.circuit_breaker.check()` (line 152).
    - Historical trade sync: `self._refresh_kelly_history()` (line 155).
    - Multi-symbol concurrency:
      ```python
      tasks = []
      for symbol in self.symbols:
          if self.kill_switch.is_triggered:
              break
          tasks.append(self._process_symbol_async(symbol))
      if tasks:
          results = await asyncio.gather(*tasks, return_exceptions=True)
      ```
      (lines 158–169).
    - Precise clock synchronization: computes `seconds_to_next_minute` until `00s` and sleeps via `await asyncio.sleep(seconds_to_next_minute)` (lines 182–187).
- **`Engine._order_routing_worker()` (lines 525–578)**:
  - Consumes queue: `payload = await self.order_queue.get()` (line 534).
  - Dispatches execution to threadpool:
    ```python
    result = await asyncio.to_thread(
        self.connector.execute_order,
        payload['symbol'],
        payload['direction'],
        payload['volume'],
        payload['sl_price'],
        payload['tp_price'],
        payload['magic']
    )
    ```
    (lines 537–545).
  - On success: logs execution (lines 547–551) and records to `AuditTrail` (lines 553–570).

### 1.3 Event Hooks Locations

#### Hook 1: Trade Open
- **File**: `application/engine.py`
- **Method**: `_order_routing_worker(self)`
- **Lines**: 547–552
- **Verbatim Code**:
  ```python
  if result:
      logging.info(
          f"[Engine] ✅ Ordre exécuté ! Ticket: {result['ticket']} | "
          f"Prix: {result['price']} | Volume: {result['volume']}"
      )
  ```
- **Context & Data Available**:
  - `result['ticket']` (int): MT5 order/deal ticket
  - `result['price']` (float): Execution fill price
  - `result['volume']` (float): Filled volume in lots
  - `payload['symbol']` (str): e.g. `"EURUSD"`
  - `payload['direction'].name` (str): `"BUY"` or `"SELL"`
  - `payload['sl_price']` (float): Stop Loss price
  - `payload['tp_price']` (float): Take Profit price
  - `payload['magic']` (int): Magic number
  - `payload['metadata']` (dict): Strategy and ML metadata (e.g. `ml_confidence`)

#### Hook 2: Trade Close
- **File**: `application/engine.py`
- **Method**: `_refresh_kelly_history(self)`
- **Lines**: 378–433
- **Verbatim Code**:
  ```python
  deals = self.connector.get_history_deals(from_date, to_date)
  if deals is None:
      return

  closed = []
  for d in deals:
      if d.profit != 0 and d.symbol != '':  # Ignorer les deals sans P&L et les dépôts
          closed.append({
              'pnl': d.profit, 
              'symbol': d.symbol, 
              'ticket': d.ticket,
              'time': _dt.datetime.fromtimestamp(d.time),
              'volume': float(d.volume),
              'type': 'BUY' if d.type == mt5.DEAL_TYPE_BUY else 'SELL',
              'magic': getattr(d, 'magic', 0)
          })
  ```
  And database persistence check:
  ```python
  existing = self.db.query(TradeRecord).filter(TradeRecord.ticket == c['ticket']).first()
  if not existing:
      # Freshly closed trade!
  ```
- **Context & Reason Extraction**:
  - In MT5, deals returned by `history_deals_get()` contain `d.reason` and `d.comment`:
    - `d.reason == 4` (`DEAL_REASON_SL`) or `"[sl"` in `d.comment.lower()` -> **Stop Loss (SL)**
    - `d.reason == 5` (`DEAL_REASON_TP`) or `"[tp"` in `d.comment.lower()` -> **Take Profit (TP)**
    - `d.reason in (0, 1, 2)` (`DEAL_REASON_CLIENT`/`MOBILE`/`WEB`) or `"manual"` in `d.comment.lower()` -> **Manual**
    - `d.reason == 3` (`DEAL_REASON_EXPERT`): Bot close / Trailing Stop / Kill Switch.
  - PnL value: `d.profit` (or net `d.profit + getattr(d, 'commission', 0.0) + getattr(d, 'swap', 0.0)`).
  - Also in `agents/kill_switch.py:26` (`close_position`) and `api/server.py:771` (`close_position`), direct programmatic closes take place.

#### Hook 3: Critical Events
- **Kill-Switch Activation**:
  - **File**: `agents/kill_switch.py`
  - **Method**: `KillSwitch.activate(self, reason: str)`
  - **Lines**: 9–16
  - **Verbatim Code**:
    ```python
    def activate(self, reason: str):
        """Active l'arrêt d'urgence et ferme toutes les positions (Article 12 RTS 6)"""
        if self.is_triggered:
            return

        logging.critical(f"⚠️ KILL SWITCH ACTIVÉ ⚠️ Raison: {reason}")
        self.is_triggered = True
        self._close_all_positions()
    ```
  - **Callers observed**:
    1. `agents/circuit_breaker.py:31`: `self.kill_switch.activate(reason="MAX_DAILY_LOSS_REACHED")`
    2. `monitoring/surveillance_agent.py:44`: `self.kill_switch.activate("Crash de l'Engine Thread")`
    3. `api/server.py:368`: `_engine.kill_switch.activate("MANUAL_TRIGGER_API")`
  - Hooking `KillSwitch.activate(reason)` catches all kill-switch events globally.
- **MT5 Disconnection**:
  - **File**: `infrastructure/broker_router.py` (lines 35–37, line 47) and `application/engine.py` (lines 105, 120).
  - In `BrokerRouter.connect()`: `logging.error("[Router] ❌ Échec critique : Primaire et Fallback injoignables.")` (line 35).
  - In `BrokerRouter._switch_to_fallback()`: failover between primary and fallback (line 47).
  - In `Engine._async_run_loop()`: `self.state_manager.update_state()` returns `False` or `self.state_manager.account` is `None` (line 149).
- **Fatal Exceptions**:
  - `application/engine.py` inside `_async_run_loop()` (lines 141–188) and `_run_async_loop_thread()` (lines 118–126).
  - `monitoring/surveillance_agent.py` lines 41–46 checks `not self.engine._thread.is_alive()`.

#### Hook 4: Daily Summary
- **Existing Daily Calculations**:
  - Located in `api/server.py` lines 201–208 & 395–404:
    ```python
    today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    deals = _engine.connector.get_history_deals(today_start, datetime.datetime.now() + datetime.timedelta(days=1))
    realized_daily = sum(
        d.profit + getattr(d, 'commission', 0.0) + getattr(d, 'swap', 0.0) 
        for d in deals 
        if d.type <= 1 and getattr(d, 'entry', 1) in (1, 2)
    )
    ```
  - Win Rate & Kelly fraction in `application/position_sizer.py`:
    - `position_sizer.win_rate` (lines 190–192)
    - `position_sizer.compute_kelly_fraction()` (lines 91–120)
    - `position_sizer.rr_ratio` (lines 194–196)
  - Current state in `Engine`: No automated midnight notification exists yet.

### 1.4 Configuration & Fail-Safe (`infrastructure/config.py` & `.env`)
- `infrastructure/config.py` (lines 6–45): Uses `pydantic_settings.BaseSettings` with `env_file=".env"`.
- `.env` currently does **not** have `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID`.
- Absence of credentials must be gracefully handled with a warning log and no crashes.

---

## 2. Logic Chain

### 2.1 Concurrency & Performance Isolation Reasoning
1. **Premise**: The trading engine operates on high-speed execution loops (`_order_routing_worker` and `_process_symbol_async`), requiring zero-latency order placement without blocking network calls.
2. **Observation**: `_order_routing_worker` runs inside the Engine's `asyncio` loop, while `KillSwitch.activate` can be invoked from other OS threads (e.g. `SurveillanceThread` or FastAPI thread).
3. **Inference**: If notification calls performed synchronous HTTP requests (`requests.post`), any network latency (50ms–5000ms) would block the caller thread:
   - Blocking `_order_routing_worker` delays subsequent orders.
   - Blocking `KillSwitch.activate` delays emergency position liquidation.
   - Calling `asyncio.create_task` from a non-asyncio thread (like `SurveillanceThread`) causes a `RuntimeError: no running event loop`.
4. **Resolution**:
   - A dedicated `TelegramNotifier` class should employ a **thread-safe unbounded queue** (`queue.Queue`) coupled with a **background worker daemon thread** (or `concurrent.futures.ThreadPoolExecutor`).
   - Calling `notify(...)` only executes `queue.put_nowait(payload)`, which executes in **under 0.05 milliseconds** (< 50 microseconds), completely satisfying the `< 10ms` latency criterion.
   - The worker thread dequeues payloads and executes the HTTP POST (using `urllib.request` standard library or `requests`/`aiohttp`) with a strict timeout (e.g. 5 seconds) and retry policy.
   - Failures in the worker thread are caught, logged, and isolated without propagating to the trading engine.

### 2.2 Hook Placement & Signal Flow Reasoning
1. **Trade Open**:
   - In `application/engine.py:547`, `result = await asyncio.to_thread(self.connector.execute_order, ...)` returns the confirmed execution dictionary `{'ticket': ..., 'price': ..., 'volume': ...}`.
   - Placing `self.notifier.notify_trade_open(...)` right after line 551 gives complete access to fill price, ticket, volume, SL, TP, direction, symbol, and ML confidence.
2. **Trade Close**:
   - MT5 closing is asynchronous from the broker side (when price touches SL or TP).
   - In `application/engine.py:378-433`, `_refresh_kelly_history` retrieves all closed deals.
   - When a deal is not found in the cache or database (`if not existing:`), it is a new closing event.
   - By capturing `d.reason`, `d.comment`, and `d.profit` on these newly closed deals, `self.notifier.notify_trade_close(...)` accurately reports the trade outcome (PnL, profit/loss percentage, closing reason: TP / SL / Manual / KillSwitch).
3. **Critical Events**:
   - In `agents/kill_switch.py:15`: placing `self.notifier.notify_kill_switch(reason)` inside `KillSwitch.activate()` guarantees immediate alert dispatch for every kill-switch activation, regardless of who triggered it (CircuitBreaker, SurveillanceAgent, or API).
   - In `application/engine.py:106, 121` and `infrastructure/broker_router.py:35`: disconnection events trigger `self.notifier.notify_mt5_disconnect(...)`.
   - In `application/engine.py:_async_run_loop`: an outer `try...except Exception as e:` block captures fatal errors, calls `self.notifier.notify_fatal_error(str(e))`, and ensures the system logs full tracebacks.
4. **Daily Summary**:
   - The engine loop synchronizes to the minute mark at line 187 (`seconds_to_next_minute`).
   - By tracking `self._last_summary_date`, at the first cycle after 00:00:00 (or at 23:59), the engine calculates yesterday's realized PnL, Win Rate (from `position_sizer.win_rate`), and Kelly fraction (`position_sizer.compute_kelly_fraction()`), and calls `self.notifier.notify_daily_summary(...)`.

### 2.3 Lifecycle Integration Reasoning
1. In `main.py`, `TelegramNotifier` is initialized before or within `Engine.__init__`.
2. `engine.notifier` is passed to `KillSwitch(connector, notifier=self.notifier)` and stored on `self.notifier`.
3. In `engine.start()`, `self.notifier.start()` begins worker thread execution.
4. In `engine.stop()`, `self.notifier.stop()` drains remaining messages with a short timeout and terminates cleanly.

---

## 3. Caveats

1. **Broker Deals History Scope**: `get_history_deals` requires the MT5 terminal to be running and connected. When testing offline or without an active MT5 terminal, the connector returns `None` or `[]`.
2. **MetaTrader 5 Reason Code Variability**: Some brokers do not set `deal.reason` strictly to `4` (SL) or `5` (TP), but instead place text like `"[sl 1.0850]"` or `"[tp 1.0950]"` in `deal.comment`. The parser must inspect both `deal.reason` and `deal.comment` for maximum reliability.
3. **Network Latency / Telegram API Outages**: Telegram API endpoints can occasionally be unreachable in restricted network environments or during rate limits (429). The notification worker must include timeout guards (e.g. 5s) and catch all network exceptions to prevent resource leaks.
4. **Offline / Dev Mode Verification**: In development mode where `.env` has empty or placeholder Telegram credentials, the system must remain 100% operational without emitting crash stacks.

---

## 4. Conclusion & Architectural Blueprint

### 4.1 Recommended Module Architecture: `infrastructure/telegram_notifier.py`

```python
class TelegramNotifier:
    """
    Asynchronous, non-blocking Telegram notification service.
    Uses an in-memory thread-safe queue and a background worker thread
    to guarantee zero latency impact on the trading loop (<0.05ms blocking).
    """
    def __init__(self, token: Optional[str] = None, chat_id: Optional[str] = None):
        ...
    def start(self) -> None: ...
    def stop(self, timeout: float = 2.0) -> None: ...
    
    # Event hooks (Non-blocking: queue.put_nowait)
    def notify_trade_open(self, symbol: str, direction: str, volume: float, price: float, sl: float, tp: float, metadata: dict = None) -> None: ...
    def notify_trade_close(self, ticket: int, symbol: str, profit: float, reason: str, volume: float = 0.0) -> None: ...
    def notify_kill_switch(self, reason: str) -> None: ...
    def notify_mt5_disconnect(self, details: str = "") -> None: ...
    def notify_fatal_error(self, error: str) -> None: ...
    def notify_daily_summary(self, date_str: str, daily_pnl: float, win_rate: float, kelly_fraction: float, balance: float, equity: float) -> None: ...
```

### 4.2 Configuration Parameters (`infrastructure/config.py` & `.env`)
Add to `AppConfig`:
- `TELEGRAM_BOT_TOKEN: str = Field(default="")`
- `TELEGRAM_CHAT_ID: str = Field(default="")`
- `TELEGRAM_ENABLED: bool = Field(default=True)`

### 4.3 Component Hook Mapping Matrix

| Event | Target File | Target Function / Method | Line Range | Hook Action |
|---|---|---|---|---|
| **Trade Open** | `application/engine.py` | `_order_routing_worker` | 547–552 | Call `notifier.notify_trade_open(...)` with order confirmation details |
| **Trade Close** | `application/engine.py` | `_refresh_kelly_history` | 412–427 | Call `notifier.notify_trade_close(...)` when new closed deal is identified |
| **Kill-Switch** | `agents/kill_switch.py` | `KillSwitch.activate` | 9–16 | Call `notifier.notify_kill_switch(reason)` immediately upon activation |
| **MT5 Disconnect** | `infrastructure/broker_router.py` & `application/engine.py` | `BrokerRouter.connect`, `Engine._async_run_loop` | 35, 149 | Call `notifier.notify_mt5_disconnect(...)` on connection loss |
| **Fatal Exceptions** | `application/engine.py` | `_async_run_loop` | 141–188 | Catch unhandled exceptions in engine loop and dispatch alert |
| **Daily Summary** | `application/engine.py` | `_async_run_loop` / `_daily_summary_worker` | 181–188 | Trigger midnight check on date change, compute daily metrics, and dispatch alert |

---

## 5. Verification Method

### 5.1 Static Verification
1. Inspect `infrastructure/telegram_notifier.py` to confirm thread-safe queue and daemon worker thread design.
2. Inspect `application/engine.py`, `agents/kill_switch.py`, and `infrastructure/config.py` to verify:
   - Credential fail-safe handling (returns without error if `.env` lacks token).
   - Hook invocations pass required parameters.
   - Clean startup and shutdown calls.

### 5.2 Latency Benchmark Verification Script
Create a standalone verification script (e.g. `tests/test_telegram_notifier_latency.py`):
```python
import time
from infrastructure.telegram_notifier import TelegramNotifier

def test_telegram_blocking_time():
    notifier = TelegramNotifier(token="mock_token", chat_id="mock_chat")
    # Simulate high network latency in worker, benchmark calling thread
    start = time.perf_counter()
    notifier.notify_trade_open(symbol="EURUSD", direction="BUY", volume=0.1, price=1.0850, sl=1.0800, tp=1.0950)
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    assert elapsed_ms < 10.0, f"Blocking time exceeded 10ms: {elapsed_ms:.3f}ms"
```

### 5.3 Test Suite Command
Run pytest on the test suite:
```powershell
pytest tests/ -v
```

### 5.4 Invalidation Conditions
The architectural conclusions would be invalidated if:
- MT5 Python API does not support background threads calling history deals (verified: MT5Connector already uses `self._lock` and `mt5.initialize()` in thread contexts).
- `queue.Queue` operations exceed 10ms under load (in Python, `queue.Queue.put_nowait` executes in < 0.05ms).
