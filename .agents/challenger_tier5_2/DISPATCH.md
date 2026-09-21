# Dispatch Instructions — challenger_tier5_2 (Tier 5 Adversarial Hardening)

- **Agent**: `challenger_tier5_2`
- **Role**: Tier 5 Adversarial Challenger (Engine & Risk Hooks White-Box)
- **Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\challenger_tier5_2`
- **Requirements**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Architecture**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`
- **Test Infra**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\TEST_INFRA.md`

## Mission (Tier 5 White-Box Adversarial Hardening)
Analyze the production source code in `application/engine.py`, `agents/kill_switch.py`, and `infrastructure/broker_router.py` alongside existing tests to find any untested execution paths or potential edge-case bugs:
1. **White-Box Code Analysis**:
   - Inspect deal extraction in `_refresh_kelly_history`: deal objects missing attributes, `None` prices, negative volumes, corrupt timestamps, zero-profit rollover deals, deposits/withdrawals filtering.
   - Inspect `_check_daily_summary` and `_dispatch_daily_summary`: timezone boundary crossings, date jumps > 1 day (e.g. weekend market closures), zero-trades days, negative daily PnL, division by zero in win rate.
   - Inspect `KillSwitch.activate`: concurrent calls from multiple threads, mock connector raising unexpected exceptions during `get_positions()`, connector disconnected during emergency stop.
   - Inspect `BrokerRouter`: primary and fallback both raising exceptions in `execute_order` or `close_position`.
   - Inspect `_async_run_loop` disconnect latching: flapping network connection (connect/disconnect cycles every 5 seconds).
2. **Adversarial Test Suite Generation**:
   - Write comprehensive adversarial tests in `tests/test_tier5_engine_adversarial.py` (or document gaps if none found).
3. **Report**:
   - Document any coverage gaps found or confirm complete coverage in `handoff.md`.
   - Verdict: **NO_GAPS** (if codebase handles all attacks robustly) or **GAPS_FOUND** (with reproduction tests).
Notify parent orchestrator when complete.
