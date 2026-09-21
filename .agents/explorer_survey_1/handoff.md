# Engine Architecture & Execution Flow Survey for Telegram Alert System

**Agent**: explorer_survey_1  
**Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_1`  
**Parent Orchestrator**: `de7f01c8-4201-46bc-b6b8-ab303286d79f`  
**Date**: 2026-09-15  

---

## 1. Observation

### 1.1 Repository Structure & Entry Points
Direct inspection of the repository revealed the following primary execution structure:
- **`main.py`**: Entry point. Line 65 instantiates `Engine(router, db_session=db_session)`. Line 69 injects `_engine` into FastAPI (`init_api(engine)`). Line 73 calls `engine.start()`. Line 78 instantiates and starts `SurveillanceAgent(engine)`. Line 84 blocks on `uvicorn.run(app, host="0.0.0.0", port=8000)`.
- **`application/engine.py`**: Core trading engine (578 lines). Implements `Engine` class.
- **`agents/kill_switch.py`**: Emergency shutdown manager (36 lines).
- **`agents/circuit_breaker.py`**: Daily loss guard (35 lines).
- **`monitoring/surveillance_agent.py`**: Independent supervisor thread (141 lines).
- **`infrastructure/mt5_connector.py`**: MetaTrader 5 driver (284 lines).
- **`infrastructure/broker_router.py`**: High-availability broker router (114 lines).
- **`infrastructure/config.py`**: Pydantic BaseSettings loading `.env` (82 lines).
- **`application/position_sizer.py`**: Fractional Kelly Criterion sizing (200 lines).
- **`application/state_manager.py`**: Account balance and position state tracking (52 lines).
- **`api/server.py`**: FastAPI server with WebSocket, REST endpoints, and in-memory log buffer (1253 lines).

### 1.2 Engine Lifecycle & Threading Model in `application/engine.py`
Direct observation of `application/engine.py`:
- **Line 40**: `class Engine:`
- **Line 41**: `def __init__(self, connector: IBrokerConnector, db_session=None):`
  - Instantiates `StateManager(connector)`, `KillSwitch(connector)`, `CircuitBreaker(self.state_manager, self.kill_switch)`, `PreTradeValidator`, `DynamicTrailingStop`, `PositionSizer`, `MLTrainer`, `MLPredictor`.
  - Line 57: `self.symbols: list = Config.TRADING_SYMBOLS`
  - Lines 90-91: `self.running = False`, `self._thread: Optional[threading.Thread] = None`
  - Line 94: `self._closed_trades_cache = None`
  - Line 97: `self._last_signal_candle: Dict[str, datetime.datetime] = {}`
- **Lines 103-117**: `def start(self):`
  - Line 105: `if not self.connector.connect(): logging.error("[Engine] Échec de connexion au broker (Main Thread)."); return`
  - Line 109: `self.running = True`
  - Line 110: `self._thread = threading.Thread(target=self._run_async_loop_thread, daemon=True)`
  - Line 111: `self._thread.start()`
  - Line 114: `self.ml_trainer.start_auto_retrain(self.connector, self.symbols)`
- **Lines 118-126**: `def _run_async_loop_thread(self):`
  - Line 120: `if not self.connector.connect(): self.running = False; return`
  - Line 125: `asyncio.run(self._async_run_loop())`
- **Lines 127-134**: `def stop(self):`
  - Line 128: `self.running = False`
  - Line 129: `self.ml_trainer.stop()`
  - Line 131: `if self._thread: self._thread.join(timeout=5)`
  - Line 132: `self.connector.disconnect()`
- **Lines 135-188**: `async def _async_run_loop(self):`
  - Line 137: `self.order_queue = asyncio.Queue()`
  - Line 138: `worker_task = asyncio.create_task(self._order_routing_worker())`
  - Line 139: `ts_task = asyncio.create_task(self._trailing_stop_worker())`
  - Main loop `while self.running:`:
    - Lines 142-144: `if self.kill_switch.is_triggered: await asyncio.sleep(1); continue`
    - Line 149: `self.state_manager.update_state()`
    - Line 152: `self.circuit_breaker.check()`
    - Line 155: `self._refresh_kelly_history()`
    - Lines 158-169: Concurrent evaluation of symbols via `asyncio.gather(*tasks, return_exceptions=True)` where each task is `self._process_symbol_async(symbol)`.
    - Lines 182-187: Precise sleep until the exact top of the next minute (`60 - now.second - (now.microsecond / 1_000_000.0)`).

### 1.3 Order Execution & Position Opened Flow
Direct observation of `_process_symbol_async` and `_order_routing_worker`:
- In `_process_symbol_async(self, symbol: str)` (lines 189-348):
  - Fetches M15 OHLCV via `await asyncio.to_thread(self.connector.get_historical_data, symbol, self._tf_m15, 200)`.
  - Evaluates strategies and aggregates signals (`signal = self._symbol_aggregators[symbol].aggregate(symbol)`).
  - Checks ADX trend filter (lines 220-230).
  - Evaluates ML filter: `validated_signal = await asyncio.to_thread(self.ml_predictor.filter_signal, signal, df)`.
  - Checks pyramiding rule (lines 260-263).
  - Validates pretrade risk (lines 282-288).
  - Computes lot size via Kelly: `volume = await asyncio.to_thread(self.position_sizer.compute_volume, ...)` (lines 309-318).
  - Computes SL/TP price levels: `sl_price, tp_price = self._compute_sl_tp_prices(...)` (lines 321-328).
  - Puts order payload onto `self.order_queue`:
    ```python
    payload = {
        'symbol': symbol,
        'direction': validated_signal.direction,
        'volume': volume,
        'sl_price': sl_price,
        'tp_price': tp_price,
        'magic': self._symbol_to_magic(symbol),
        'metadata': validated_signal.metadata
    }
    await self.order_queue.put(payload)
    ```
- In `_order_routing_worker(self)` (lines 525-578):
  - Line 534: `payload = await self.order_queue.get()`
  - Lines 537-545:
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
  - Lines 547-551:
    ```python
    if result:
        logging.info(
            f"[Engine] ✅ Ordre exécuté ! Ticket: {result['ticket']} | "
            f"Prix: {result['price']} | Volume: {result['volume']}"
        )
    ```
  - Lines 553-570: Logs to `AuditTrail`.
  - Line 572: `self.order_queue.task_done()`.

### 1.4 Position Closed Flow & Closed Trade Detection
- `infrastructure/mt5_connector.py:170`:
  `execute_order` returns `{"ticket": result.order, "price": result.price, "volume": result.volume}`.
- `infrastructure/mt5_connector.py:79-84`:
  `get_history_deals(self, from_date: Any, to_date: Any)` retrieves broker deals from MT5.
- `application/engine.py:378-433` (`_refresh_kelly_history`):
  - Queries deals for past 60 days: `deals = self.connector.get_history_deals(from_date, to_date)`.
  - Filters deals with `d.profit != 0 and d.symbol != ''`.
  - Compiles dictionary:
    ```python
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
  - Detects changes: `if closed != self._closed_trades_cache: ...`
  - Persists new records into SQLite `TradeRecord` table (lines 408-430).
- `api/server.py:645-665` (`/history` endpoint):
  - Deals with `getattr(d, 'entry', 0) in (1, 2) and d.type <= 1` are position-closing deals (`DEAL_ENTRY_OUT`).
  - True net PnL: `true_pnl = d.profit + getattr(d, 'commission', 0.0) + getattr(d, 'swap', 0.0)`.
  - MT5 deals have execution reason codes in `d.reason`:
    - `0`: `DEAL_REASON_CLIENT` (Manual terminal)
    - `1`: `DEAL_REASON_MOBILE` (Manual mobile)
    - `2`: `DEAL_REASON_WEB` (Manual web)
    - `3`: `DEAL_REASON_EXPERT` (Bot / API script / KillSwitch)
    - `4`: `DEAL_REASON_SL` (Stop Loss hit)
    - `5`: `DEAL_REASON_TP` (Take Profit hit)
    - `6`: `DEAL_REASON_SO` (Stop Out / Margin Call)

### 1.5 Critical Events & Fail-Safes
- **KillSwitch**:
  - `agents/kill_switch.py:9-16`:
    ```python
    def activate(self, reason: str):
        if self.is_triggered:
            return
        logging.critical(f"⚠️ KILL SWITCH ACTIVÉ ⚠️ Raison: {reason}")
        self.is_triggered = True
        self._close_all_positions()
    ```
  - Callers of `kill_switch.activate`:
    - `agents/circuit_breaker.py:31`: `self.kill_switch.activate(reason="MAX_DAILY_LOSS_REACHED")`
    - `monitoring/surveillance_agent.py:44`: `self.kill_switch.activate("Crash de l'Engine Thread")`
    - `api/server.py:368`: `_engine.kill_switch.activate("MANUAL_TRIGGER_API")`
- **Broker Disconnection**:
  - `infrastructure/broker_router.py:35`: `logging.error("[Router] ❌ Échec critique : Primaire et Fallback injoignables.")`
  - `application/engine.py:105, 120`: `self.connector.connect()` returns `False`.
  - `application/state_manager.py:19-24`: `self._account_info = self.connector.get_account_info()` returns `None`.
- **Fatal Exceptions**:
  - `application/engine.py:125`: `asyncio.run(self._async_run_loop())` is unguarded against unhandled top-level loop crashes.
  - `monitoring/surveillance_agent.py:42-47`: Detects thread crash via `if not self.engine._thread.is_alive():` and triggers kill switch.

### 1.6 Configuration & Dependencies
- `infrastructure/config.py`: Uses `pydantic_settings.BaseSettings` reading `.env`. Currently does NOT define `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID`.
- `requirements.txt`: Contains `MetaTrader5`, `python-dotenv`, `pydantic`, `pydantic-settings`, `fastapi`, `uvicorn`, `websockets`, `pandas`, `numpy`, `SQLAlchemy`, etc.
- System check: `aiohttp` is already installed in the Python environment.

---

## 2. Logic Chain

1. **Main Loop & Threading Isolation**:
   - The engine runs its async loop (`_async_run_loop`) inside a dedicated OS thread (`self._thread`), while FastAPI/Uvicorn runs on the main thread.
   - Any alert mechanism must NOT perform synchronous network HTTP requests inside `_async_run_loop` or inside `_order_routing_worker`, because a blocking HTTP call (e.g., 200–2000ms latency to Telegram servers) would stall order routing and trailing stop adjustments.
   - Therefore, alerts must be dispatched either via an asynchronous coroutine (`asyncio.create_task`) on the event loop, or offloaded to a dedicated non-blocking background queue/worker thread.

2. **Position Opened Event**:
   - `_order_routing_worker` (lines 525-578) receives orders from `self.order_queue` and calls `self.connector.execute_order`.
   - On line 547, `if result:` confirms that the order was successfully filled by MT5.
   - All necessary parameters (`ticket`, `symbol`, `direction`, `volume`, `price`, `sl_price`, `tp_price`, `ml_confidence`) exist simultaneously at lines 548–569.
   - Therefore, the exact placement for the **Position Opened** hook is lines 552–570 in `application/engine.py`.

3. **Position Closed Event**:
   - In MT5, positions close either through automatic broker triggers (TP / SL / Trailing Stop), broker stop-out, or manual / script close (`connector.close_position`).
   - The bot does not poll individual closed positions in real-time; instead, `_refresh_kelly_history()` in `application/engine.py:378-433` fetches deals every cycle (60 seconds) and caches them in `self._closed_trades_cache`.
   - When a trade closes, it appears as a deal in `get_history_deals` with `d.entry in (1, 2)` (deal out) and `d.profit != 0`.
   - In addition, `d.reason` provides the exact closure cause (SL = 4, TP = 5, Client/Manual = 0/1/2, Expert = 3, Stop Out = 6).
   - Therefore, a closed trade detection mechanism maintaining a set of `_seen_deal_tickets` (seeded at startup so past history is not resent) within or alongside `_refresh_kelly_history` will reliably catch all closed trades and trigger **Position Closed** alerts with exact PnL and reason.

4. **Critical Events (Kill-Switch, MT5 Disconnect, Fatal Crash)**:
   - `KillSwitch.activate(self, reason: str)` in `agents/kill_switch.py:9-16` is the single bottleneck through which all emergency stops flow (Circuit Breaker loss violation, Surveillance Agent crash detection, or API manual trigger).
   - Adding an `on_activate` hook or alert dispatch in `KillSwitch.activate` captures 100% of kill-switch activations immediately.
   - MT5 disconnections are observable in `StateManager.update_state()` (when `account` becomes `None` or `connect()` fails) and `BrokerRouter` failover/fail events.
   - Fatal exceptions can be caught at `application/engine.py:125` (`_run_async_loop_thread`) before thread termination, and in `SurveillanceAgent._monitor_loop()` (lines 42-46) when the thread dies.

5. **Daily Summary Trigger**:
   - Currently, no daily summary trigger exists in the codebase.
   - In `application/engine.py:182-187`, the main loop sleeps until the top of each minute (`00s`).
   - At the beginning of a new day (`now.date() != self._last_daily_summary_date`), when `now.hour == 0` (midnight) or `23:59`, the engine can trigger the daily summary.
   - Metrics needed are readily available:
     - Today's closed deals PnL from MT5 `connector.get_history_deals(start_of_day, end_of_day)`.
     - Today's win rate (wins / total today).
     - Overall Kelly fraction from `self.position_sizer.compute_kelly_fraction()`.
     - Current account equity & balance from `self.state_manager.account`.

---

## 3. Caveats

1. **Broker Deal History Latency / MT5 Cache**:
   - MT5 sometimes delays syncing `history_deals_get` by a few hundred milliseconds after a position is closed by SL/TP. Checking deals on each 60s cycle in `_refresh_kelly_history` is completely safe, but if a sub-second closed-trade notification is required, an async worker polling MT5 deals every 2–5 seconds may be used.
2. **Cold Start Re-Alerting**:
   - When the bot boots, `_refresh_kelly_history` pulls 60 days of historical deals. The closed trade detector MUST seed `self._seen_deal_tickets` with all existing deal tickets on the very first cycle so that past trades are not spammed to Telegram upon restart.
3. **Multi-Threaded Hook Invocations**:
   - Kill-switch activation can occur from multiple threads: the Engine thread (via `CircuitBreaker`), the Surveillance thread (via `SurveillanceAgent`), or the API worker thread (via `/control` endpoint). The Telegram alert dispatcher must be thread-safe (e.g. using `queue.Queue` with a background sender thread, or thread-safe coroutine scheduling via `asyncio.run_coroutine_threadsafe`).
4. **Environment Variables**:
   - `.env` currently does not have `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID`. When adding them to `AppConfig` in `infrastructure/config.py`, they must be optional (`Optional[str] = None`) with default values to satisfy the fail-safe acceptance criteria.

---

## 4. Conclusion & Interface Contracts

### 4.1 Recommended System Architecture
Create a dedicated alert module: `infrastructure/telegram_alerter.py` (or `application/telegram_notifier.py`).
- **Class**: `TelegramNotifier`
- **Concurrency model**: Thread-safe worker with a background task/thread, or `aiohttp.ClientSession` with `asyncio.create_task` when in async loop, with a synchronous fallback queue for calls originating from external threads.
- **Fail-safe**: If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` are missing, logs `[TelegramNotifier] Telegram non configuré dans .env. Notifications désactivées.` and returns immediately (`< 0.01ms`).
- **Blocking overhead**: Enqueuing an alert into an in-memory queue or `asyncio.create_task` takes `< 0.1ms`, satisfying the `< 10ms` requirement by two orders of magnitude.

### 4.2 Data Structures & Event Contracts

```python
from dataclasses import dataclass
from typing import Optional
import datetime

@dataclass
class PositionOpenedEvent:
    ticket: int
    symbol: str
    direction: str  # "BUY" or "SELL"
    volume: float
    open_price: float
    sl_price: float
    tp_price: float
    ml_confidence: Optional[float] = None
    timestamp: datetime.datetime = datetime.datetime.now()

@dataclass
class PositionClosedEvent:
    ticket: int
    symbol: str
    direction: str  # "BUY" or "SELL"
    volume: float
    close_price: float
    pnl: float
    reason: str  # "TP", "SL", "MANUAL", "KILL_SWITCH", "STOP_OUT"
    close_time: datetime.datetime = datetime.datetime.now()

@dataclass
class CriticalAlertEvent:
    event_type: str  # "KILL_SWITCH", "DISCONNECT", "FATAL_EXCEPTION"
    title: str
    message: str
    details: Optional[str] = None
    timestamp: datetime.datetime = datetime.datetime.now()

@dataclass
class DailySummaryEvent:
    date: datetime.date
    daily_pnl: float
    total_trades: int
    winning_trades: int
    win_rate: float
    kelly_fraction: float
    balance: float
    equity: float
    timestamp: datetime.datetime = datetime.datetime.now()
```

### 4.3 Exact Hook Placements in `application/engine.py` & Associated Files

| Event | Target File | Exact Line Range | Injection Point & Logic |
|---|---|---|---|
| **Telegram Config & Init** | `infrastructure/config.py` | Lines 40–45 | Add `TELEGRAM_BOT_TOKEN: Optional[str] = None` and `TELEGRAM_CHAT_ID: Optional[str] = None` |
| **Notifier Setup** | `application/engine.py` | Lines 95–102 (`__init__`) | Initialize `self.notifier = TelegramNotifier()`, attach callback to `self.kill_switch`, initialize `self._seen_deal_tickets: set = set()`, and `self._last_summary_date = datetime.date.today()` |
| **Position Opened** | `application/engine.py` | Lines 551–570 (`_order_routing_worker`) | Immediately after line 551 (`if result:`), dispatch `PositionOpenedEvent` with ticket, symbol, direction, volume, price, SL, TP, ML confidence |
| **Position Closed** | `application/engine.py` | Lines 403–430 (`_refresh_kelly_history`) | When processing closed deals: on first cycle, seed `self._seen_deal_tickets`. On subsequent cycles, for any deal not in `_seen_deal_tickets`, dispatch `PositionClosedEvent` with ticket, symbol, volume, PnL, mapped reason from `d.reason` |
| **Kill-Switch Triggered** | `agents/kill_switch.py` | Lines 9–16 (`activate`) | Add callback trigger `self._alert_callback(reason)` inside `activate()` before `_close_all_positions()` |
| **MT5 Disconnection** | `application/engine.py` / `infrastructure/broker_router.py` | `engine.py:149-150` / `broker_router.py:35` | Track connection state transition `was_connected -> not connected`; dispatch `CriticalAlertEvent` |
| **Fatal Exception** | `application/engine.py` | Lines 124–126 (`_run_async_loop_thread`) | Wrap `asyncio.run(self._async_run_loop())` with `try...except Exception as e` to dispatch critical alert before thread death |
| **Daily Summary** | `application/engine.py` | Lines 180–188 (`_async_run_loop`) | At start of new day (`now.date() > self._last_summary_date`), calculate yesterday's PnL, trades count, win rate, Kelly fraction, and dispatch `DailySummaryEvent` |

---

## 5. Verification Method

To independently verify these findings and prepare for implementation:

1. **Verify Files and Line References**:
   - View `application/engine.py:530-575` to inspect `_order_routing_worker` and `result` structure.
   - View `application/engine.py:378-433` to inspect `_refresh_kelly_history` and MT5 deal parsing.
   - View `agents/kill_switch.py:9-35` to inspect `KillSwitch.activate` and `_close_all_positions`.
   - View `application/position_sizer.py:91-121` to inspect `compute_kelly_fraction()` and `win_rate`.
   - View `infrastructure/config.py:30-45` to inspect `.env` loading via Pydantic.

2. **Verify MT5 Deal Attributes**:
   - Check MetaTrader 5 deal structure documentation: `d.entry` (1=OUT, 2=INOUT), `d.reason` (0=Client, 1=Mobile, 2=Web, 3=Expert, 4=SL, 5=TP, 6=SO), `d.profit`, `d.commission`, `d.swap`.

3. **Verify Non-Blocking Execution (< 10ms)**:
   - Run a benchmark test script measuring time to enqueue or create an async task for dispatch:
     ```python
     import time
     t0 = time.perf_counter()
     # Enqueue / create_task
     elapsed_ms = (time.perf_counter() - t0) * 1000.0
     assert elapsed_ms < 10.0
     ```

4. **Invalidation Conditions**:
   - If `application/engine.py` is refactored to remove `_order_routing_worker`, the order open hook must move to wherever `execute_order` is called.
   - If MT5 deal history is replaced with an internal transaction ledger, closed trades must be polled from that ledger.
