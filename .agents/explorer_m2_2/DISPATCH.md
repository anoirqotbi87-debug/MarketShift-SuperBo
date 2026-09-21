# Dispatch Instructions — explorer_m2_2

- **Agent**: `explorer_m2_2`
- **Role**: Critical Events & Risk Hooks Explorer (Milestone 2)
- **Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_2`
- **Requirements**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Project Architecture**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`

## Mission
Investigate the exact implementation strategy for Critical Events and Risk hooks:
1. **Kill-Switch Hook (`agents/kill_switch.py`)**:
   - Inspect `KillSwitch.__init__` and `KillSwitch.activate(reason: str)`.
   - Design injection of `notifier: Optional[TelegramNotifier] = None` (fallback to `telegram_notifier` from `infrastructure.telegram_notifier`).
   - In `activate(reason: str)`: before or during `_close_all_positions()`, trigger:
     `self.notifier.notify_critical_event("KILL_SWITCH", reason=reason, details=f"Emergency liquidation triggered: {len(self.connector.get_positions())} positions closed")`.
   - Ensure thread-safety: `KillSwitch.activate` may be called from `SurveillanceThread`, FastAPI worker, or `CircuitBreaker`.
2. **MT5 Disconnection & Fatal Error Hooks (`infrastructure/broker_router.py` & `application/engine.py`)**:
   - In `infrastructure/broker_router.py`:
     - When `_switch_to_fallback()` occurs: trigger failover notification.
     - When both primary and fallback connections fail in `connect()`: trigger `self.notifier.notify_critical_event("MT5_DISCONNECT", "Primary and fallback brokers unreachable")`.
   - In `application/engine.py`:
     - In `_run_async_loop_thread()`: catch unhandled exceptions at the top level and trigger `self.notifier.notify_critical_event("FATAL_ERROR", reason=f"Engine thread crashed: {e}")`.
     - In `_async_run_loop()`: detect when broker connection is lost (`not self.connector.connected` or `self.state_manager.account is None`) with anti-spam latching (notify once per disconnect incident).
3. **Surveillance Agent Integration (`monitoring/surveillance_agent.py`)**:
   - Check if watchdog thread needs explicit alert dispatch when it activates KillSwitch.

## Output
Write your comprehensive findings and exact proposed code diffs to `handoff.md` in your working directory.
When complete, notify your parent orchestrator (`37865d3a-ef5b-4219-a235-789cd3dedba9`) via `send_message`.

## 2026-09-16T00:55:27Z
Received dispatch from orchestrator_2 via user request:
- Perform a thorough investigation of Critical Events & Risk Hooks:
  1. KillSwitch Hook (agents/kill_switch.py): Design notifier injection into KillSwitch and calling self.notifier.notify_critical_event('KILL_SWITCH', reason=reason, details=...) inside activate(self, reason: str). Ensure thread safety when called from background watchdog or API.
  2. Broker Disconnect & Failover (infrastructure/broker_router.py): How BrokerRouter detects failover and total disconnect, and dispatches notify_critical_event.
  3. Engine Fatal Errors (application/engine.py): In _run_async_loop_thread and _async_run_loop, how to catch fatal exceptions and connection drop incidents with latching, dispatching notify_critical_event.
- Write comprehensive findings and exact proposed code diffs to handoff.md.
- Notify parent orchestrator (37865d3a-ef5b-4219-a235-789cd3dedba9) via send_message.
