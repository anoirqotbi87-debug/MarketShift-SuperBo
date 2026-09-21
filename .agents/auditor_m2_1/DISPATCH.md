# Dispatch Instructions — auditor_m2_1

- **Agent**: `auditor_m2_1`
- **Role**: Forensic Integrity Auditor (Milestone 2)
- **Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\auditor_m2_1`
- **Requirements**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Architecture**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`
- **Worker Report**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\handoff.md`

## Mission
Perform a comprehensive Forensic Integrity Audit on Milestone 2:
- `agents/kill_switch.py`
- `infrastructure/broker_router.py`
- `application/engine.py`
- `tests/test_engine_telegram_hooks.py`

Evaluate all 5 Forensic Integrity Checks:
1. **Genuine Logic**: Confirm authentic integration into `_order_routing_worker`, `_refresh_kelly_history`, `activate()`, and `BrokerRouter`. Ensure no dummy mocks, facade returns, or bypassed logic.
2. **No Hardcoded Outputs**: Verify that no trade metrics, tickets, prices, PnL, or test return values are hardcoded in production source files.
3. **Genuine Deal Classification & Anti-Spam**: Verify that `_seen_deal_tickets` authentically tracks deal tickets, that `_classify_deal_close_reason` inspects actual deal properties, and that no tests are faked.
4. **Interface Contract Conformance**: Formally verify that all calls match the method signatures defined in `PROJECT.md` and `infrastructure/telegram_notifier.py`:
   - `notify_trade_opened(symbol, direction, volume, price, sl, tp, ticket, ml_confidence)`
   - `notify_trade_closed(ticket, symbol, direction, volume, profit, reason, close_price)`
   - `notify_critical_event(event_type, reason, details)`
   - `notify_daily_summary(date_str, daily_pnl, win_rate, kelly_fraction, total_trades, balance, equity)`
5. **No Fabricated Outputs / Attestations**: Verify that all commands documented in worker_m2's handoff can genuinely execute and pass.

Write your forensic evidence report to `handoff.md` with a clear binary verdict:
- **CLEAN**
- **INTEGRITY VIOLATION**
Notify parent orchestrator when complete.

## 2026-09-16T00:06:44Z
<USER_REQUEST>
You are auditor_m2_1.
Your working directory is: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\auditor_m2_1
Your parent is orchestrator_2 (conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9).

Read ORIGINAL_REQUEST.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md.
Also read PROJECT.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md.
Also read your DISPATCH.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\auditor_m2_1\DISPATCH.md.
Read worker_m2's handoff report at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2\handoff.md.

Perform a comprehensive Forensic Integrity Audit on Milestone 2:
- agents/kill_switch.py
- infrastructure/broker_router.py
- application/engine.py
- tests/test_engine_telegram_hooks.py

Evaluate all 5 Forensic Integrity Checks:
1. Genuine Logic: Confirm authentic integration into _order_routing_worker, _refresh_kelly_history, activate(), and BrokerRouter. Ensure no dummy mocks, facade returns, or bypassed logic.
2. No Hardcoded Outputs: Verify that no trade metrics, tickets, prices, PnL, or test return values are hardcoded in production source files.
3. Genuine Deal Classification & Anti-Spam: Verify that _seen_deal_tickets authentically tracks deal tickets, that _classify_deal_close_reason inspects actual deal properties, and that no tests are faked.
4. Interface Contract Conformance: Formally verify that all calls match the method signatures defined in PROJECT.md and infrastructure/telegram_notifier.py:
   - notify_trade_opened(symbol, direction, volume, price, sl, tp, ticket, ml_confidence)
   - notify_trade_closed(ticket, symbol, direction, volume, profit, reason, close_price)
   - notify_critical_event(event_type, reason, details)
   - notify_daily_summary(date_str, daily_pnl, win_rate, kelly_fraction, total_trades, balance, equity)
5. No Fabricated Outputs / Attestations: Verify that all commands documented in worker_m2's handoff can genuinely execute and pass.

Write your forensic evidence report to handoff.md with a clear binary verdict:
- CLEAN
- INTEGRITY VIOLATION
Send completion message to parent orchestrator.
</USER_REQUEST>

