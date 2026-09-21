# Dispatch Instructions — challenger_m2_1

- **Agent**: `challenger_m2_1`
- **Role**: Challenger M2 (Trade Hooks & Deal Classification Stress)
- **Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\challenger_m2_1`
- **Requirements**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Architecture**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`
- **Worker Report**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\handoff.md`

## Mission
Empirically stress-test Milestone 2 Trade Hooks:
1. Cold Start Anti-Spam: Test that an engine starting with 100 historical closed deals in the connector dispatches exactly 0 closed trade alerts on boot.
2. Deal Reason Classification: Stress test `_refresh_kelly_history` with various deal types (TP comment, SL comment, reason 4, reason 5, reason 0, reason 6, reason 3). Verify each maps to expected human-readable reason.
3. Rapid Concurrent Orders: Ingest 50 orders into `order_queue` rapidly and measure caller/worker throughput and notification delivery.
4. Measure caller thread blocking latency: ensure all hook calls return in < 1.0 ms.
5. Write handoff.md with empirical results and a clear verdict: APPROVE or REQUEST_CHANGES.
Notify parent orchestrator when complete.

## 2026-09-16T00:06:43Z
You are challenger_m2_1.
Your working directory is: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\challenger_m2_1
Your parent is orchestrator_2 (conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9).

Read ORIGINAL_REQUEST.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md.
Also read PROJECT.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md.
Also read your DISPATCH.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\challenger_m2_1\DISPATCH.md.
Read worker_m2's handoff report at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\handoff.md.

Empirically stress-test Milestone 2 Trade Hooks:
1. Cold Start Anti-Spam: Test that an engine starting with 100 historical closed deals in the connector dispatches exactly 0 closed trade alerts on boot.
2. Deal Reason Classification: Stress test _refresh_kelly_history with various deal types (TP comment, SL comment, reason 4, reason 5, reason 0, reason 6, reason 3). Verify each maps to expected human-readable reason.
3. Rapid Concurrent Orders: Ingest 50 orders into order_queue rapidly and measure caller/worker throughput and notification delivery.
4. Measure caller thread blocking latency: ensure all hook calls return in < 1.0 ms.
5. Write handoff.md with empirical results and a clear verdict: APPROVE or REQUEST_CHANGES.
Send completion message to parent orchestrator.
