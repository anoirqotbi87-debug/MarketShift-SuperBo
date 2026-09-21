## 2026-09-15T23:55:28Z

# Dispatch Instructions — explorer_m2_3

- **Agent**: `explorer_m2_3`
- **Role**: Integration Testing & Verification Plan Explorer (Milestone 2)
- **Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_3`
- **Requirements**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Project Architecture**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`
- **Test Infrastructure**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\TEST_INFRA.md`
- **Test Inventory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\TEST_READY.md`

## Mission
Investigate test coverage and design the exact verification plan for Milestone 2:
1. **Existing Test Suite Audit (`tests/test_telegram_integration.py` & `tests/test_telegram_notifier.py`)**:
   - Verify how existing test cases exercise Trade Open, Trade Close, Kill-Switch, and Daily Summary.
   - Check if any new unit/integration tests are needed for `Engine` lifecycle wiring, `KillSwitch.activate` notification dispatch, `_refresh_kelly_history` deal detection, and `BrokerRouter` disconnect alerts.
2. **Unit Test Harness for Engine Hooks**:
   - Design unit tests with mock connectors to verify that:
     - `_order_routing_worker` dispatches `notify_trade_opened` with correct fields.
     - `_refresh_kelly_history` dispatches `notify_trade_closed` with correctly classified close reasons.
     - `KillSwitch.activate` dispatches `notify_critical_event`.
     - Date rollover dispatches `notify_daily_summary`.
3. **Execution Commands**:
   - Define exact pytest commands that Worker M2 and Reviewers must run to verify Milestone 2 without errors.

## Output
Write your comprehensive findings and verification plan to `handoff.md` in your working directory.
When complete, notify your parent orchestrator (`37865d3a-ef5b-4219-a235-789cd3dedba9`) via `send_message`.
