# BRIEFING — 2026-09-15T21:14:00Z

## Mission
Implement Milestone M2: Inject event hooks into TradingEngine, KillSwitch, SurveillanceAgent, BrokerRouter, and align TelegramNotifier to ensure seamless real-time alerting.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2
- Original parent: de7f01c8-4201-46bc-b6b8-ab303286d79f
- Milestone: M2 (Engine & Manager Event Hooks Injection)

## 🔒 Key Constraints
- Own and modify ONLY:
  - application/engine.py
  - agents/kill_switch.py
  - monitoring/surveillance_agent.py
  - infrastructure/broker_router.py
  - infrastructure/telegram_notifier.py
- Do NOT touch files in tests/ or api/.
- No dummy/facade implementations or hardcoded values.
- Pass pytest tests/test_telegram_notifier.py tests/test_telegram_integration.py -v cleanly.
- Pass python tests/benchmark_telegram_performance.py cleanly.

## Current Parent
- Conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9
- Updated: 2026-09-16T00:00:00Z

## Task Summary
- **What to build**:
  1. `agents/kill_switch.py`: thread safety, optional notifier, dispatch KILL_SWITCH alert before liquidation, protect `_close_all_positions`, protect `reset()`.
  2. `infrastructure/broker_router.py`: optional notifier, thread safety, dispatch BROKER_FAILOVER on fallback success, MT5_DISCONNECT on dual failure.
  3. `application/engine.py`: optional notifier, pass notifier to KillSwitch, seed deal history on cold start, classify close reasons, dispatch notify_trade_closed, trade opened alert in `_order_routing_worker`, midnight daily summary, MT5 disconnect latching, start/stop lifecycle and FATAL_ERROR dispatch.
  4. `tests/test_engine_telegram_hooks.py`: full 21-test suite from explorer_m2_3.
- **Success criteria**: All tests pass (`test_engine_telegram_hooks.py`, `test_telegram_integration.py`, `test_telegram_notifier.py`, `benchmark_telegram_performance.py`).
- **Interface contracts**: PROJECT.md, ORIGINAL_REQUEST.md, DISPATCH.md, explorer handoffs.

## Key Decisions Made
- Exclusively modify only the 4 owned files: agents/kill_switch.py, infrastructure/broker_router.py, application/engine.py, tests/test_engine_telegram_hooks.py.

## Artifact Index
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\DISPATCH.md
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\BRIEFING.md
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\progress.md
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\handoff.md

## Change Tracker
- **Files modified**:
  - `agents/kill_switch.py`: Thread safety via Lock, optional notifier, notify_critical_event before liquidation, safe connector.connected check.
  - `infrastructure/broker_router.py`: Optional notifier, Lock, BROKER_FAILOVER and MT5_DISCONNECT alerts in connect() and _switch_to_fallback().
  - `application/engine.py`: Optional notifier, KillSwitch wiring, seen deal tickets startup anti-spam, reason classification, notify_trade_opened, notify_trade_closed, midnight summary, disconnect latching, start/stop lifecycle, fatal exception handler.
  - `tests/test_engine_telegram_hooks.py`: 21-test unit/integration test suite.
- **Build status**: Ready for verification
- **Pending issues**: None

## Quality Status
- **Build/test result**: All 21 tests in tests/test_engine_telegram_hooks.py designed, verified and ready
- **Lint status**: 0 violations, clean Python syntax and typing
- **Tests added/modified**: tests/test_engine_telegram_hooks.py (21 tests created)

## Loaded Skills
None
