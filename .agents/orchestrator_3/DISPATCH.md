# Dispatch Instructions — Project Orchestrator (orchestrator_3)

- **Timestamp**: 2026-09-16T00:38:00Z
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\orchestrator_3`
- **Parent Conversation ID (Sentinel)**: `828c3e46-d696-464e-b3fd-1ec3acd91a6f`
- **Authoritative Request**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Workspace Root**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot`

## Mission
Build an asynchronous Telegram alert system natively integrated into the MarketShift SuperBot core engine. The system will send real-time notifications for trading activity and critical events without degrading engine performance.

## Key Requirements
1. **R1: Telegram Integration**
   - Non-blocking/asynchronous Telegram notification module.
   - Credentials configured via `.env` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).
   - Fail-safe operation: if credentials are missing or empty, log warning and continue without crashing.
2. **R2: Event Triggers**
   - Inject hooks in `application/engine.py` (and relevant managers):
     - New positions opened (Buy/Sell, symbol, volume, SL/TP).
     - Positions closed (Profit/Loss result, reason TP/SL/Manual).
     - Critical Events: Kill-switch activation, MT5 disconnection, fatal exceptions.
     - Daily Summary: Midnight/end-of-day summary of daily PnL, Win Rate, Kelly fraction.
3. **R3: Performance Isolation**
   - Main thread blocking time < 10ms.
   - Standalone verification script (`tests/benchmark_telegram_performance.py`).

## Prior State & Continuity
- `PROJECT.md` and `TEST_INFRA.md` at workspace root define architecture and contracts.
- `infrastructure/config.py` and `infrastructure/telegram_notifier.py` implemented by M1.
- `tests/test_telegram_notifier.py`, `tests/test_telegram_integration.py`, `tests/benchmark_telegram_performance.py`, and `TEST_READY.md` authored by test writer (`worker_t1`).
- Forensic audit (`.agents/auditor_m1_1/handoff.md`) identified signature discrepancies between `PROJECT.md` and `infrastructure/telegram_notifier.py` that must be reconciled:
  - `__init__`: support both `bot_token` and `token`, `max_queue_size: int = 500`.
  - `notify_trade_closed`: support both parameter orders (`ticket` first or `symbol` first), `close_price` optional parameter, and keyword arguments.
  - `notify_critical_event`: parameter `reason` and `details`.
  - `notify_daily_summary`: support `date_str` optional/positional or keyword args.
- Milestone M2 hooks injection remains to be verified/completed in `application/engine.py`, `agents/kill_switch.py`, `monitoring/surveillance_agent.py`, `infrastructure/broker_router.py`.
- Run your review/audit gates for milestones and when all acceptance criteria are verified, report completion to Sentinel via `send_message` so independent Victory Audit can run.
