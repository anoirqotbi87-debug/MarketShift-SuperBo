# Dispatch Instructions — challenger_m2_2

- **Agent**: `challenger_m2_2`
- **Role**: Challenger M2 (Risk Hooks & Disconnect Latching Stress)
- **Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\challenger_m2_2`
- **Requirements**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Architecture**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`
- **Worker Report**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\handoff.md`

## Mission
Empirically challenge Milestone 2 Risk Hooks:
1. KillSwitch Concurrency & Latency: Spawn 10 threads calling `kill_switch.activate("CONCURRENT_STRESS")` simultaneously. Confirm exactly 1 critical event is dispatched, `is_triggered` is True, positions are closed, and execution time < 1.0 ms.
2. BrokerRouter Total Outage: Simulate primary and fallback connector failures. Verify `MT5_DISCONNECT` is triggered and caller receives False without crashing.
3. Engine Disconnect Latching: Simulate 10 consecutive loops where connector is disconnected. Confirm `MT5_DISCONNECT` is dispatched on loop 1, and 0 duplicate alerts are dispatched on loops 2–10. Simulate reconnect on loop 11 and confirm latch resets.
4. Fail-Safe Mode: Run Engine and KillSwitch with disabled notifier (`TelegramNotifier("", "")`). Verify 100% normal trading and liquidation execution without errors.
## 2026-09-16T00:06:43Z
You are challenger_m2_2.
Your working directory is: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\challenger_m2_2
Your parent is orchestrator_2 (conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9).

Read ORIGINAL_REQUEST.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md.
Also read PROJECT.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md.
Also read your DISPATCH.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\challenger_m2_2\DISPATCH.md.
Read worker_m2's handoff report at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\handoff.md.

Empirically challenge Milestone 2 Risk Hooks:
1. KillSwitch Concurrency & Latency: Spawn 10 threads calling kill_switch.activate("CONCURRENT_STRESS") simultaneously. Confirm exactly 1 critical event is dispatched, is_triggered is True, positions are closed, and execution time < 1.0 ms.
2. BrokerRouter Total Outage: Simulate primary and fallback connector failures. Verify MT5_DISCONNECT is triggered and caller receives False without crashing.
3. Engine Disconnect Latching: Simulate 10 consecutive loops where connector is disconnected. Confirm MT5_DISCONNECT is dispatched on loop 1, and 0 duplicate alerts are dispatched on loops 2–10. Simulate reconnect on loop 11 and confirm latch resets.
4. Fail-Safe Mode: Run Engine and KillSwitch with disabled notifier (TelegramNotifier("", "")). Verify 100% normal trading and liquidation execution without errors.
5. Write handoff.md with empirical results and a clear verdict: APPROVE or REQUEST_CHANGES.
Send completion message to parent orchestrator.
