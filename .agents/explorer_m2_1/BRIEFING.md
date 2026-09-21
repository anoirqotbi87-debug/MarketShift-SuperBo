# BRIEFING — 2026-09-15T23:58:35Z

## Mission
Investigate application/engine.py to design exact event hooks (Trade Open, Trade Close, Daily Summary, Engine Lifecycle & Notifier Wiring) for Milestone 2 Telegram integration.

## 🔒 My Identity
- Archetype: explorer
- Roles: Engine Hooks & Trade Lifecycle Explorer (Milestone 2)
- Working directory: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_1
- Original parent: 37865d3a-ef5b-4219-a235-789cd3dedba9
- Milestone: M2

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Investigate application/engine.py in depth
- Ensure thread safety and non-blocking performance isolation (< 0.05ms)
- Produce exact proposed diffs and 5-component handoff report

## Current Parent
- Conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9
- Updated: 2026-09-15T23:58:35Z

## Investigation State
- **Explored paths**: `infrastructure/telegram_notifier.py`, `PROJECT.md`, `ORIGINAL_REQUEST.md`, `application/engine.py`, `application/position_sizer.py`, `agents/kill_switch.py`, `infrastructure/mt5_connector.py`, `infrastructure/broker_router.py`, `tests/test_telegram_integration.py`.
- **Key findings**:
  1. `Engine.__init__`: Inject optional `notifier: Optional[TelegramNotifier] = None` defaulting to `telegram_notifier`. Wire `notifier` into `KillSwitch`. Track `_seen_deal_tickets: set = set()`, `_deals_initialized: bool = False`, `_last_summary_date: date`, `_broker_disconnected_alerted: bool = False`.
  2. `Engine.start()` / `Engine.stop()`: Start and stop `self.notifier`.
  3. `_order_routing_worker`: In lines 547-572, hook `self.notifier.notify_trade_opened(...)` after successful `execute_order`.
  4. `_refresh_kelly_history`: Seed `_seen_deal_tickets` on startup to avoid startup alert spam; detect newly closed deals; classify reason via `_classify_deal_close_reason(deal)` into TP, SL, Stop Out, Manual/Client, EA; dispatch `self.notifier.notify_trade_closed(...)`.
  5. `_async_run_loop`: Midnight rollover detection via `_check_daily_summary()`. Computes realized daily PnL, win rate, Kelly fraction, total trades, account balance and equity; dispatches `self.notifier.notify_daily_summary(...)`. Disconnect latching for `notify_critical_event("MT5_DISCONNECT", ...)`.
- **Unexplored areas**: None within engine scope. Reconciled with explorer_m2_2 (critical events) and explorer_m2_3 (tests).

## Key Decisions Made
- [initial decision]: Examine `application/engine.py` line by line around order routing, kelly history, async loop, and lifecycle.
- [decision]: Provide both unified diff and proposed replacement snippets for `application/engine.py` to ensure unambiguous implementation by `worker_m2`.
- [decision]: Add `_classify_deal_close_reason` and `_check_daily_summary` as dedicated methods on `Engine` to keep `_refresh_kelly_history` and `_async_run_loop` modular and easily testable.

## Artifact Index
- handoff.md — Comprehensive 5-component handoff report with exact proposed code diffs
- progress.md — Heartbeat and task progress
- DISPATCH.md — Received instructions
