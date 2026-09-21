# BRIEFING — 2026-09-16T00:55:27Z

## Mission
Investigate Critical Events & Risk Hooks (KillSwitch, BrokerRouter, Engine Fatal Errors/Disconnect) for Milestone 2 Telegram integration.

## 🔒 My Identity
- Archetype: explorer
- Roles: Critical Events & Risk Hooks Explorer (Milestone 2)
- Working directory: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_2
- Original parent: 37865d3a-ef5b-4219-a235-789cd3dedba9
- Milestone: M2 - Engine & Manager Event Hooks

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source files.
- Deliver findings, logic chain, caveats, conclusion, and exact code diffs in handoff.md.
- Ensure thread safety, zero latency impact (< 0.1ms dispatch), fail-safe handling (None/disabled notifier).
- Communicate with parent via send_message.

## Current Parent
- Conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9
- Updated: not yet

## Investigation State
- **Explored paths**: `agents/kill_switch.py`, `infrastructure/broker_router.py`, `application/engine.py`, `monitoring/surveillance_agent.py`, `infrastructure/telegram_notifier.py`, `agents/circuit_breaker.py`, `main.py`, `tests/test_telegram_integration.py`
- **Key findings**:
  1. `KillSwitch.activate` is the centralized alert hook needed across all emergency callers (`SurveillanceAgent`, `CircuitBreaker`, FastAPI `/api/kill-switch`, manual). Needs `self._lock` for thread safety and dispatches `notify_critical_event("KILL_SWITCH", ...)` before `_close_all_positions()`.
  2. `BrokerRouter` needs notifier injection and `self._lock`. `connect()` dispatches `BROKER_FAILOVER` on secondary connection, and `MT5_DISCONNECT` when both fail. `_switch_to_fallback()` dispatches failover/disconnect on runtime failure.
  3. `Engine._run_async_loop_thread` needs top-level try/except catching unhandled exceptions and dispatching `notify_critical_event("FATAL_ERROR", ...)`.
  4. `Engine._async_run_loop` needs stateful latching (`_broker_disconnected_latched`) to dispatch `MT5_DISCONNECT` exactly once per disconnect incident and reset on reconnection.
- **Unexplored areas**: None. Complete investigation finished.

## Key Decisions Made
- Centralized kill-switch alert inside `KillSwitch.activate` avoids duplicate notifications from `SurveillanceAgent` watchdog.
- Thread safety via `threading.Lock()` inside `KillSwitch` and `BrokerRouter` prevents concurrent liquidation and redundant failover attempts.
- Anti-spam latching in `Engine._async_run_loop` ensures zero alert spam during extended broker downtime while guaranteeing immediate alert on first disconnect.
- Formulated exact proposed code diffs and unit test verification scripts in `handoff.md`.

## Artifact Index
- DISPATCH.md — Task assignment and instructions
- BRIEFING.md — Situational awareness and working memory
- progress.md — Liveness heartbeat and milestone tracking
- handoff.md — 5-component handoff report with proposed diffs
