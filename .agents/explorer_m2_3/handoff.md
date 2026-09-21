# Handoff Report — Milestone 2 Verification Plan & Test Harness

**Agent**: `explorer_m2_3`  
**Role**: Integration Testing & Verification Plan Explorer  
**Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_3`  
**Parent Agent**: `orchestrator_2` (`37865d3a-ef5b-4219-a235-789cd3dedba9`)  
**Date**: 2026-09-16T01:00:00+01:00  
**Handoff Type**: Hard (Task Complete)

---

## 1. Observation

### 1.1 Existing Test Suites Audit (`tests/test_telegram_integration.py` & `tests/test_telegram_notifier.py`)
Direct inspection of the test codebase reveals the following:

- In `tests/test_telegram_integration.py` (lines 1–412):
  - `TestInterfaceContracts` (lines 105–158) verifies attributes on `Config` and method signatures on `TelegramNotifier`.
  - `TestE2EHttpIntegration` (lines 163–220) tests real HTTP POST delivery to a local ephemeral HTTP server (`MockTelegramServerHandler`).
  - `TestRealWorldApplicationScenarios` (lines 225–412) tests 5 scenarios (Lifecycle, Circuit Breaker, Outage Burst, Cold Boot, Multithreading), but **all calls invoke `notifier.notify_*` directly**.
  - **Verdict**: Neither `application.engine.Engine`, `agents.kill_switch.KillSwitch`, nor `infrastructure.broker_router.BrokerRouter` is imported or instantiated anywhere in `test_telegram_integration.py`.

- In `tests/test_telegram_notifier.py` (lines 1–555):
  - Verifies `TelegramNotifier` in isolation: credential loading, fail-safe speed (< 1ms), queue ingestion, HTML formatting, network retry backoff, HTTP 429 rate limiting, truncation > 4000 characters, and bounded queue overflow (500 items max).
  - **Verdict**: Zero engine components are exercised.

### 1.2 Target Production Components Audit
Direct inspection of the target source files for Milestone 2 reveals:

1. **`application/engine.py`**:
   - Lines 41–50 (`Engine.__init__`):
     ```python
     self.connector = connector
     self.state_manager = StateManager(connector)
     self.kill_switch = KillSwitch(connector)
     self.circuit_breaker = CircuitBreaker(self.state_manager, self.kill_switch)
     ```
     *Observation*: No `notifier` parameter or instance is initialized in `Engine`.
   - Lines 103–116 (`Engine.start`) & Lines 127–134 (`Engine.stop`):
     *Observation*: Does not call `self.notifier.start()` or `self.notifier.stop()`.
   - Lines 526–578 (`Engine._order_routing_worker`):
     ```python
     result = await asyncio.to_thread(self.connector.execute_order, ...)
     if result:
         logging.info(...)
         # AuditTrail logging ...
     ```
     *Observation*: Successfully executed orders are logged to `AuditTrail`, but no Telegram notification (`notify_trade_opened`) is called.
   - Lines 378–433 (`Engine._refresh_kelly_history`):
     ```python
     deals = self.connector.get_history_deals(from_date, to_date)
     ```
     *Observation*: Queries 60 days of historical deals on every cycle. There is no `_seen_deal_tickets` cache to distinguish startup historical deals from new closed deals, no reason classification (TP, SL, Manual, StopOut), and no `notify_trade_closed` hook.
   - Lines 135–188 (`Engine._async_run_loop`):
     *Observation*: Iterates every minute, but does not track calendar date transitions (`self._last_summary_date`) and has no midnight `notify_daily_summary` hook.

2. **`agents/kill_switch.py`**:
   - Lines 4–7 (`KillSwitch.__init__`): Only accepts `connector: MT5Connector`.
   - Lines 9–17 (`KillSwitch.activate`):
     ```python
     def activate(self, reason: str):
         if self.is_triggered:
             return
         logging.critical(f"⚠️ KILL SWITCH ACTIVÉ ⚠️ Raison: {reason}")
         self.is_triggered = True
         self._close_all_positions()
     ```
     *Observation*: `activate` sets `is_triggered = True` and closes positions, but never calls `notify_critical_event`.

3. **`infrastructure/broker_router.py`**:
   - Lines 11–15 (`BrokerRouter.__init__`): Accepts only `primary` and `fallback`.
   - Lines 17–38 (`BrokerRouter.connect`): Returns `False` when both primary and fallback fail, but triggers no alert.
   - Lines 45–56 (`BrokerRouter._switch_to_fallback`): Switches to fallback, but triggers no alert.

---

## 2. Logic Chain

```
[Observation: tests/test_telegram_*.py only test TelegramNotifier]
                        │
                        ▼
[Logic: No existing test verifies that Engine, KillSwitch, or BrokerRouter trigger notifications]
                        │
                        ▼
[Observation: MT5 terminal cannot run headless in automated CI without real broker connection]
                        │
                        ▼
[Logic: Must design MockBrokerConnector implementing IBrokerConnector with MockDeal objects]
                        │
                        ▼
[Observation: Engine needs 4 distinct notification hooks + lifecycle wiring + fail-safe resiliency]
                        │
                        ▼
[Logic: Design 21 unit/integration test cases in dedicated test suite tests/test_engine_telegram_hooks.py]
```

### Step-by-Step Reasoning:
1. **Separation of Producer vs Consumer**:
   - Milestone 1 implemented and verified the consumer service (`TelegramNotifier`).
   - Milestone 2 implements the event producers (`Engine`, `KillSwitch`, `BrokerRouter`).
   - The test harness must verify that the producers correctly format, classify, and enqueue alerts under all operating conditions without degrading loop performance.
2. **Preventing Alert Spam on Startup**:
   - In `_refresh_kelly_history`, the connector returns up to 60 days of deals. Without an initialization seed, starting the engine would trigger hundreds of Telegram messages for past trades.
   - Logic: The first run must populate `_seen_deal_tickets` without dispatching alerts. Subsequent runs only dispatch for newly observed tickets. The test suite explicitly tests this boundary (`test_refresh_kelly_startup_seed_no_spam`).
3. **Deal Reason Classification**:
   - MT5 supplies `deal.reason` integer codes (4 = SL, 5 = TP, 0 = Client/Manual, 6 = Stop Out) and text comments like `"[sl 1.08200]"` or `"[tp 1.09100]"`.
   - Logic: The hook must classify these into clean, human-readable strings before dispatching. The test suite explicitly tests TP, SL, Manual, and anti-duplication.
4. **Zero Latency & Non-Blocking Execution Guarantee**:
   - Calling `notify_*` from the core engine loop or `KillSwitch.activate` must never block the calling thread (> 1ms).
   - Logic: The test suite includes high-resolution timer assertions (`time.perf_counter_ns`) ensuring hook execution remains strictly < 1.0 ms.
5. **Fail-Safe Operation**:
   - If Telegram is disabled (omitted credentials), trading and emergency liquidation must proceed with 100% functionality.
   - Logic: The test suite tests disabled notifier instances (`MockTelegramNotifier(enabled=False)`) across order routing, deal tracking, and kill-switch execution.

---

## 3. Caveats

1. **Hardware / Terminal Isolation**:
   - The test harness uses `MockBrokerConnector` and `MockDeal` to enable 100% headless, fast, and repeatable execution in any CI/CD environment without needing a live MetaTrader 5 Windows client running.
   - Caveat: Real broker slippage, partial fills, and physical TCP socket drops are simulated via unit test fixtures rather than actual network packet injection.
2. **Timezone & Date Rollover**:
   - The daily summary hook relies on calendar date change (`datetime.date.today()`).
   - In unit tests, date transitions are simulated deterministically by invoking the rollover dispatch with mock dates (`"2026-09-15"`).
3. **Asynchronous Order Queue**:
   - `Engine._order_routing_worker` is an asyncio coroutine running concurrently with the main loop. Tests must properly launch the worker via `asyncio.create_task` and cancel it cleanly on teardown.

---

## 4. Conclusion

1. **Test Coverage Gaps Identified**:
   - **6 critical gaps** were identified in the existing test suite: zero tests for Engine trade open, zero tests for Kelly deal close detection and classification, zero tests for KillSwitch notification dispatch, zero tests for BrokerRouter disconnect alerts, zero tests for midnight daily summary rollover, and zero tests for Engine lifecycle wiring.
2. **Test Harness Designed & Delivered**:
   - A complete 21-test unit and integration test harness has been designed and written to:
     `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_3\proposed_test_engine_telegram_hooks.py`
3. **Target Destination**:
   - Worker M2 should place this test suite into:
     `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\tests\test_engine_telegram_hooks.py`
   - And optionally add `test_scenario_6_engine_e2e_hook_integration` to `tests/test_telegram_integration.py`.

---

## 5. Verification Method

### 5.1 Test Execution Commands

Worker M2, Reviewers, and Auditors must execute the following commands to verify Milestone 2:

```bash
# 1. Run the dedicated M2 Engine Hooks test suite
pytest tests/test_engine_telegram_hooks.py -v

# 2. Run the integration test suite (validates interface contracts & E2E HTTP delivery)
pytest tests/test_telegram_integration.py -v

# 3. Run the core Telegram notifier test suite
pytest tests/test_telegram_notifier.py -v

# 4. Run the standalone latency performance benchmark (< 10ms guarantee)
python tests/benchmark_telegram_performance.py

# 5. Combined Milestone 2 Test Run (All Telegram & Engine hook tests)
pytest tests/test_engine_telegram_hooks.py tests/test_telegram_integration.py tests/test_telegram_notifier.py -v

# 6. Non-Regression Test on core engine components
pytest tests/test_position_sizer.py tests/test_smc_strategy.py -v
```

### 5.2 Test Inventory & Feature Mapping

| Test Class | Test Name | Target Hook / Feature | Expected Outcome |
|---|---|---|---|
| `TestEngineTradeOpenHook` | `test_order_routing_worker_dispatches_trade_opened_buy` | Trade Open (BUY) | `notify_trade_opened` called with exact symbol, volume, SL/TP, ticket, ML confidence |
| `TestEngineTradeOpenHook` | `test_order_routing_worker_dispatches_trade_opened_sell_no_ml` | Trade Open (SELL without ML) | `notify_trade_opened` called with `ml_confidence=None` |
| `TestEngineTradeOpenHook` | `test_order_routing_worker_skips_notification_on_execution_failure` | Failed Order Rejection | No notification dispatched when broker rejects order |
| `TestEngineTradeOpenHook` | `test_order_routing_worker_failsafe_when_telegram_disabled` | Fail-Safe Order Routing | Order executes normally even when Telegram is disabled |
| `TestEngineTradeCloseHook` | `test_refresh_kelly_startup_seed_no_spam` | Startup Anti-Spam Seed | Historical deals seeded into `_seen_deal_tickets` with 0 alerts sent |
| `TestEngineTradeCloseHook` | `test_refresh_kelly_detects_take_profit_deal` | Trade Close (TP) | New deal with reason=5 or `[tp]` dispatches `notify_trade_closed` with "Take Profit (TP)" |
| `TestEngineTradeCloseHook` | `test_refresh_kelly_detects_stop_loss_deal` | Trade Close (SL) | New deal with reason=4 or `[sl]` dispatches `notify_trade_closed` with "Stop Loss (SL)" |
| `TestEngineTradeCloseHook` | `test_refresh_kelly_detects_manual_close_deal` | Trade Close (Manual) | New deal with reason=0 dispatches `notify_trade_closed` with "Manual / Client" |
| `TestEngineTradeCloseHook` | `test_refresh_kelly_anti_duplication` | Deal Anti-Duplication | Re-running refresh cycle does not trigger duplicate notifications |
| `TestEngineTradeCloseHook` | `test_refresh_kelly_ignores_deposits_and_zero_profit` | Non-Trading Deal Filter | Deposits/withdrawals and zero-profit deals are ignored |
| `TestKillSwitchTelegramHook` | `test_kill_switch_activate_dispatches_critical_alert` | Kill-Switch Activation | `notify_critical_event("KILL_SWITCH", ...)` dispatched with reason |
| `TestKillSwitchTelegramHook` | `test_kill_switch_activate_idempotence` | Kill-Switch Idempotence | Subsequent calls while active trigger 0 additional alerts |
| `TestKillSwitchTelegramHook` | `test_kill_switch_activate_thread_safety` | Non-Blocking Latency | Activation from background thread completes in < 1.0 ms |
| `TestKillSwitchTelegramHook` | `test_kill_switch_failsafe_when_notifier_disabled` | Fail-Safe Liquidation | All positions closed even if Telegram is disabled |
| `TestBrokerRouterTelegramHook`| `test_broker_router_total_disconnect_triggers_critical_alert` | Total MT5 Disconnect | When primary & fallback fail, `notify_critical_event("MT5_DISCONNECT", ...)` dispatched |
| `TestBrokerRouterTelegramHook`| `test_broker_router_failover_triggers_alert` | Broker Failover Alert | Primary fail + fallback success triggers failover alert |
| `TestBrokerRouterTelegramHook`| `test_broker_router_normal_connect_no_alert` | Normal Primary Connect | Successful primary connect triggers 0 alerts |
| `TestEngineDailySummaryHook` | `test_daily_summary_calculation_and_dispatch` | Midnight Rollover Summary | Date change computes daily PnL, Kelly, win rate, trades, balance, equity and dispatches |
| `TestEngineDailySummaryHook` | `test_daily_summary_handles_zero_trades_day` | Zero-Trades Day Summary | Rollover on inactive days dispatches cleanly without division by zero |
| `TestEngineLifecycleAndWiring`| `test_engine_accepts_custom_notifier` | Dependency Injection | Engine accepts custom notifier and injects it into KillSwitch |
| `TestEngineLifecycleAndWiring`| `test_engine_start_and_stop_controls_notifier_lifecycle` | Lifecycle Propagation | `engine.start()` calls `notifier.start()`, `engine.stop()` calls `notifier.stop()` |

### 5.3 Invalidation Conditions
The verification plan is invalidated if:
1. Any test in `tests/test_engine_telegram_hooks.py` fails or raises an uncaught exception.
2. Hook execution time exceeds 1.0 ms on callers.
3. Order execution or position liquidation fails when Telegram credentials are missing.
4. Historical deals on engine boot produce notification spam.
