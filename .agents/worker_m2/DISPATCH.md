# Dispatch Instructions — worker_m2 (Milestone 2 Implementation)

- **Agent**: `worker_m2`
- **Role**: Engine & Manager Event Hooks Builder (Milestone 2)
- **Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2`
- **Requirements**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Project Architecture**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Exclusive Write Ownership
You EXCLUSIVELY own and may modify:
- `agents/kill_switch.py`
- `infrastructure/broker_router.py`
- `application/engine.py`
- `tests/test_engine_telegram_hooks.py`
Do NOT modify any other files (e.g. do not modify `infrastructure/telegram_notifier.py`, `infrastructure/config.py`, or existing test files).

## Input Explorer Reports
Carefully read and follow the specifications and code diffs in:
1. `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_1\handoff.md` (Engine trade open, trade close, daily summary, lifecycle)
2. `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_2\handoff.md` (KillSwitch, BrokerRouter, fatal exceptions, disconnect latching)
3. `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_3\handoff.md` (Test harness specifications)
4. `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_3\proposed_test_engine_telegram_hooks.py` (21-test unit/integration suite)

## Implementation Tasks

### 1. `agents/kill_switch.py`
- Update constructor: `def __init__(self, connector: Any, notifier: Optional[Any] = None):`
  - Fallback to singleton `telegram_notifier` from `infrastructure.telegram_notifier`.
  - Add thread synchronization: `self._lock: threading.Lock = threading.Lock()`.
  - Maintain `self.is_triggered = False`.
- In `activate(self, reason: str)`:
  - Thread-safe using `with self._lock:`.
  - Check idempotence (`if self.is_triggered: return; self.is_triggered = True`).
  - Count open positions: `pos_count = len(self.connector.get_positions()) if hasattr(self.connector, "get_positions") else 0`.
  - Dispatch Telegram alert before liquidation:
    ```python
    if self.notifier:
        try:
            self.notifier.notify_critical_event(
                "KILL_SWITCH",
                reason=reason,
                details=f"Emergency liquidation triggered: {pos_count} positions closed"
            )
        except Exception as notif_err:
            logging.error(f"KillSwitch: Erreur dispatch notification: {notif_err}")
    ```
  - Call `self._close_all_positions()`.
- In `_close_all_positions(self)`:
  - Protect with `getattr(self.connector, "connected", False)` and wrap position iterations in `try...except`.
- In `reset(self)`:
  - Protect with `with self._lock: self.is_triggered = False`.

### 2. `infrastructure/broker_router.py`
- Update constructor: `def __init__(self, primary: IBrokerConnector, fallback: IBrokerConnector, notifier: Optional[Any] = None):`
  - Default `self.notifier = notifier if notifier is not None else telegram_notifier`.
  - Add `self._lock = threading.Lock()`.
- In `connect(self) -> bool`:
  - If primary fails and fallback succeeds: dispatch `self.notifier.notify_critical_event("BROKER_FAILOVER", reason="Primary broker unreachable during connect", details="Switched to fallback broker successfully")`.
  - If both fail: dispatch `self.notifier.notify_critical_event("MT5_DISCONNECT", reason="Primary and fallback brokers unreachable", details="Both primary and fallback MT5 connections failed during connect()")`.
- In `_switch_to_fallback(self) -> bool`:
  - Thread-safe using `with self._lock:`.
  - On successful switch: dispatch `BROKER_FAILOVER`.
  - If fallback also fails: dispatch `MT5_DISCONNECT`.

### 3. `application/engine.py`
- Import: import `telegram_notifier` from `infrastructure.telegram_notifier`.
- Update constructor: `def __init__(self, connector: IBrokerConnector, db_session=None, notifier: Optional[Any] = None):`
  - Set `self.notifier = notifier if notifier is not None else telegram_notifier`.
  - Pass notifier to KillSwitch: `self.kill_switch = KillSwitch(connector, notifier=self.notifier)`.
  - Initialize deal tracking: `self._seen_deal_tickets: set = set()`.
  - Initialize summary tracking: `self._last_summary_date: Optional[datetime.date] = None`.
  - Initialize disconnect latch: `self._broker_disconnected_latched: bool = False`.
- Lifecycle methods:
  - In `start(self)`: call `if self.notifier and hasattr(self.notifier, "start"): self.notifier.start()`. If `not self.connector.connect():` dispatch `MT5_DISCONNECT` alert.
  - In `stop(self)`: call `if self.notifier and hasattr(self.notifier, "stop"): self.notifier.stop()`.
  - In `_run_async_loop_thread(self)`: wrap execution in `try...except Exception as e:` catching fatal exceptions, logging critical, and dispatching `self.notifier.notify_critical_event("FATAL_ERROR", reason=f"Engine thread crashed: {e}")`.
- Hook 1: Trade Opened in `_order_routing_worker`:
  - Immediately after `if result:`, dispatch:
    ```python
    if self.notifier:
        try:
            self.notifier.notify_trade_opened(
                symbol=payload['symbol'],
                direction=payload['direction'].name if hasattr(payload['direction'], 'name') else str(payload['direction']).replace('OrderType.', ''),
                volume=float(result.get('volume', payload.get('volume', 0.0))),
                price=float(result.get('price', 0.0)),
                sl=float(payload.get('sl_price', 0.0)),
                tp=float(payload.get('tp_price', 0.0)),
                ticket=int(result.get('ticket', 0)),
                ml_confidence=payload.get('metadata', {}).get('ml_confidence') if isinstance(payload.get('metadata'), dict) else None
            )
        except Exception as notif_err:
            logging.error(f"[Engine] Erreur dispatch trade opened: {notif_err}")
    ```
- Hook 2: Trade Closed in `_refresh_kelly_history`:
  - On cold start (if not `self._seen_deal_tickets` and deals exist): seed `self._seen_deal_tickets.update(d.ticket for d in deals)` so startup historical deals do not spam Telegram.
  - On subsequent runs: for each deal `d` in `deals` where `d.profit != 0 and d.symbol != ''`:
    If `d.ticket not in self._seen_deal_tickets`:
      - Determine close reason via helper `_classify_deal_close_reason(d)` (SL, TP, Stop Out, Manual/Client, EA, Exit Signal).
      - Dispatch `self.notifier.notify_trade_closed(ticket=d.ticket, symbol=d.symbol, direction='BUY' if d.type == 0 else 'SELL', volume=float(d.volume), profit=float(d.profit), reason=close_reason, close_price=getattr(d, 'price', None))`.
      - Add `d.ticket` to `self._seen_deal_tickets`.
- Hook 3: Daily Summary in `_async_run_loop`:
  - On midnight rollover (`current_date = datetime.datetime.now().date()`, `if self._last_summary_date is not None and current_date > self._last_summary_date:`):
    - Compute daily realized PnL of deals closed on `self._last_summary_date`.
    - Win rate from `self.position_sizer.win_rate`.
    - Kelly fraction from `self.position_sizer.compute_kelly_fraction()`.
    - Total trades count.
    - Balance and equity from `self.state_manager.account`.
    - Dispatch `self.notifier.notify_daily_summary(date_str=str(self._last_summary_date), daily_pnl=daily_pnl, win_rate=win_rate, kelly_fraction=kelly_fraction, total_trades=total_trades, balance=balance, equity=equity)`.
  - Always update `self._last_summary_date = current_date`.
- Hook 4: Broker Disconnect Latching in `_async_run_loop`:
  - `is_connected = bool(getattr(self.connector, "connected", False) and (self.state_manager.account is not None))`
  - If disconnected and `not self._broker_disconnected_latched`: set latch to `True`, dispatch `MT5_DISCONNECT` alert, and pause loop (`await asyncio.sleep(5); continue`).
  - If reconnected and `self._broker_disconnected_latched`: reset latch to `False`.

### 4. Create `tests/test_engine_telegram_hooks.py`
- Copy the content from `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_3\proposed_test_engine_telegram_hooks.py` into `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\tests\test_engine_telegram_hooks.py`.
- Ensure all 21 unit/integration tests pass cleanly.

### 5. Verification Commands
Run and document real outputs for:
```bash
pytest tests/test_engine_telegram_hooks.py -v
pytest tests/test_telegram_integration.py -v
pytest tests/test_telegram_notifier.py -v
python tests/benchmark_telegram_performance.py
```
All commands must exit with 0 and pass with 100% success.

### 6. Handoff
Write your full report with code changes, verification commands, and exact terminal outputs to `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\handoff.md`.


## 2026-09-16T00:00:00Z
You are worker_m2.
Your working directory is: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2
Your parent is orchestrator_2 (conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9).
Tasks:
1. In agents/kill_switch.py:
   - Accept optional notifier: Optional[Any] = None (fallback to singleton telegram_notifier from infrastructure.telegram_notifier).
   - Add self._lock = threading.Lock() for thread safety.
   - In activate(self, reason: str): dispatch self.notifier.notify_critical_event("KILL_SWITCH", reason=reason, details=f"Emergency liquidation triggered: {pos_count} positions closed") before _close_all_positions().
   - Protect _close_all_positions with getattr(self.connector, "connected", False).
   - Protect reset() with self._lock.
2. In infrastructure/broker_router.py:
   - Accept optional notifier: Optional[Any] = None (fallback to singleton telegram_notifier).
   - Add self._lock = threading.Lock().
   - In connect(): dispatch BROKER_FAILOVER on fallback success; dispatch MT5_DISCONNECT if both primary and fallback fail.
   - In _switch_to_fallback(): thread-safe failover; dispatch BROKER_FAILOVER on success, MT5_DISCONNECT on failure.
3. In application/engine.py:
   - Accept optional notifier: Optional[Any] = None (fallback to singleton telegram_notifier).
   - Pass self.notifier to KillSwitch(connector, notifier=self.notifier).
   - Initialize self._seen_deal_tickets: set = set(), self._last_summary_date: Optional[datetime.date] = None, and self._broker_disconnected_latched: bool = False.
   - Engine lifecycle: call self.notifier.start() in start(), self.notifier.stop() in stop(), catch unhandled exceptions in _run_async_loop_thread and dispatch FATAL_ERROR.
   - Hook 1 (Trade Open): In _order_routing_worker, dispatch self.notifier.notify_trade_opened(...) with symbol, direction, volume, price, sl, tp, ticket, ml_confidence.
   - Hook 2 (Trade Close): In _refresh_kelly_history, seed self._seen_deal_tickets on cold start so existing deals don't spam alerts. For newly closed deals, classify close reason (SL, TP, Stop Out, Manual/Client, EA) and dispatch self.notifier.notify_trade_closed(...).
   - Hook 3 (Daily Summary): In _async_run_loop, detect midnight date rollover, calculate realized PnL, win rate, Kelly fraction, total trades, balance, equity, and dispatch self.notifier.notify_daily_summary(...).
   - Hook 4 (Disconnect Latching): In _async_run_loop, detect connection drops, dispatch MT5_DISCONNECT once per incident via latch, and reset on reconnection.
4. Place the test harness:
   - Write C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\tests\test_engine_telegram_hooks.py using the complete 21-test suite from explorer_m2_3.
5. Run verification commands:
   - pytest tests/test_engine_telegram_hooks.py -v
   - pytest tests/test_telegram_integration.py -v
   - pytest tests/test_telegram_notifier.py -v
   - python tests/benchmark_telegram_performance.py
   Ensure all tests execute genuinely and pass with exit code 0.
6. Document all results, verification outputs, and code changes in handoff.md in your working directory.
When done, send a message to your parent orchestrator (37865d3a-ef5b-4219-a235-789cd3dedba9).
