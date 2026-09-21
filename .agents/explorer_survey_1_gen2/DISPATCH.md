# Dispatch — explorer_survey_1_gen2

## Identity
- Role: Codebase & Engine Architecture Explorer
- Working Directory: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_1_gen2
- Parent: orchestrator_2 (Conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9)

## Task Description
Read `ORIGINAL_REQUEST.md` at `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`.
Investigate the core trading engine architecture in `application/engine.py` and `main.py` (and related execution loops).
Identify:
1. The execution model: async vs threading vs sync loops, how `_async_run_loop` or `start()` is structured.
2. The exact code locations and hooks for:
   - Trade open (Buy/Sell, symbol, volume, SL/TP)
   - Trade close (Profit/Loss result, reason TP/SL/Manual)
   - Critical events: Kill-switch activation, MT5 disconnection, fatal exceptions
   - Daily summary: when and where end-of-day or midnight calculations occur
3. How engine lifecycle (start, stop, error recovery) is handled and where a Telegram notification manager should be initialized and cleanly shut down.
4. Document all file paths, line numbers, function signatures, and data structures.

## Scope Boundaries
- Read-only exploration. DO NOT modify any code.
- Write your comprehensive findings and evidence report to `handoff.md` in your working directory.
- Send a completion message to parent when done.

## 2026-09-15T20:53:19Z
Received user request from parent orchestrator_2:
Investigate core trading engine architecture in application/engine.py, main.py, and related execution loops.
Identify execution model, hooks (trade open, trade close, kill switch, MT5 disconnect, fatal exceptions, daily summary), lifecycle management, and clean shutdown.

