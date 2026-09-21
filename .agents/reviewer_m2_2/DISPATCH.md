# Dispatch Instructions — reviewer_m2_2

- **Agent**: `reviewer_m2_2`
- **Role**: Reviewer M2 (Critical Events & Risk Hooks)
- **Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\reviewer_m2_2`
- **Requirements**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Architecture**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`
- **Worker Report**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\handoff.md`

## Mission
Independently review Milestone 2 implementation in `agents/kill_switch.py` and `infrastructure/broker_router.py`:
1. KillSwitch: Verify `KillSwitch.activate` thread safety via lock, optional notifier injection, position counting, and dispatch of `KILL_SWITCH` critical event before `_close_all_positions()`. Verify safe handling when connector is disconnected or mock.
2. BrokerRouter: Verify `BrokerRouter.connect` and `_switch_to_fallback` thread safety, dispatch of `BROKER_FAILOVER` on fallback, and `MT5_DISCONNECT` on total failure.
3. Engine Disconnect Latching: Verify `_broker_disconnected_latched` in `_async_run_loop()` dispatches `MT5_DISCONNECT` once per incident and resets upon reconnection.
4. Execute verification commands:
   - `pytest tests/test_engine_telegram_hooks.py -v`
   - `pytest tests/test_telegram_notifier.py -v`
   - `python tests/benchmark_telegram_performance.py`
5. Write handoff.md with a clear verdict: APPROVE or REQUEST_CHANGES.
Notify parent orchestrator when complete.
