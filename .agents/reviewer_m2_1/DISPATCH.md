# Dispatch Instructions — reviewer_m2_1

- **Agent**: `reviewer_m2_1`
- **Role**: Reviewer M2 (Engine Hooks & Trade Lifecycle)
- **Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\reviewer_m2_1`
- **Requirements**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Architecture**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`
- **Worker Report**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\handoff.md`

## Mission
Independently review Milestone 2 implementation in `application/engine.py`:
1. Trade Open Hook: Verify `_order_routing_worker` invokes `self.notifier.notify_trade_opened(...)` with correct parameters without blocking.
2. Trade Close Hook: Verify `_refresh_kelly_history` seeds `_seen_deal_tickets` on cold start (0 alerts on boot), and correctly classifies deals into TP, SL, Stop Out, Manual/Client, EA.
3. Daily Summary Hook: Verify `_check_daily_summary` and `_dispatch_daily_summary` handle midnight date rollover and dispatch `notify_daily_summary(...)`.
4. Engine Lifecycle: Verify `start()`, `stop()`, and `_run_async_loop_thread()` exception handling (`FATAL_ERROR`).
5. Execute verification commands:
   - `pytest tests/test_engine_telegram_hooks.py -v`
   - `pytest tests/test_telegram_integration.py -v`
   - `python tests/benchmark_telegram_performance.py`
6. Write handoff.md with a clear verdict: APPROVE or REQUEST_CHANGES.
Notify parent orchestrator when complete.

## 2026-09-16T00:06:42Z
You are reviewer_m2_1.
Your working directory is: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\reviewer_m2_1
Your parent is orchestrator_2 (conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9).

Read ORIGINAL_REQUEST.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md.
Also read PROJECT.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md.
Also read your DISPATCH.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\reviewer_m2_1\DISPATCH.md.
Read worker_m2's handoff report at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\handoff.md.

Independently review Milestone 2 implementation in application/engine.py:
1. Trade Open Hook: Verify _order_routing_worker invokes self.notifier.notify_trade_opened(...) with all correct parameters (symbol, direction, volume, price, sl, tp, ticket, ml_confidence) without blocking.
2. Trade Close Hook: Verify _refresh_kelly_history seeds _seen_deal_tickets on cold start (0 alerts on boot), and correctly classifies deals into TP, SL, Stop Out, Manual/Client, EA.
3. Daily Summary Hook: Verify _check_daily_summary and _dispatch_daily_summary handle midnight date rollover and dispatch notify_daily_summary(...).
4. Engine Lifecycle: Verify start(), stop(), and _run_async_loop_thread() exception handling (FATAL_ERROR).
5. Execute verification commands:
   - pytest tests/test_engine_telegram_hooks.py -v
   - pytest tests/test_telegram_integration.py -v
   - python tests/benchmark_telegram_performance.py
6. Write handoff.md with a clear verdict: APPROVE or REQUEST_CHANGES.
Send completion message to parent orchestrator.
