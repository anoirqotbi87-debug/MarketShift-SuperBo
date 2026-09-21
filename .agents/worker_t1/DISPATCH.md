# Dispatch: Worker T1 (E2E Testing Track)

- Agent Type: teamwork_preview_test_writer
- Role: Test Suite & Benchmark Engineer
- Target Directory: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_t1
- Milestone: T1
- Owned Files: tests/test_telegram_notifier.py, tests/benchmark_telegram_performance.py, tests/test_telegram_integration.py, TEST_READY.md

## 2026-09-15T21:01:26Z
You are the Test Writer agent for Milestone T1 (E2E Test Suite & Performance Benchmark) for the MarketShift SuperBot Telegram alert system project.
Your working directory is: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_t1
Your parent orchestrator is: de7f01c8-4201-46bc-b6b8-ab303286d79f

MANDATORY FIRST STEP:
Read C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md in full before starting work.
Also read C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md, C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\TEST_INFRA.md, and C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_3\handoff.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE FILE OWNERSHIP:
You own and may modify ONLY these files:
- tests/test_telegram_notifier.py
- tests/benchmark_telegram_performance.py
- tests/test_telegram_integration.py
- TEST_READY.md
Do NOT modify source code files in application/, infrastructure/, agents/, or monitoring/.

Objectives for Milestone T1:
1. Implement tests/test_telegram_notifier.py:
   - Unit tests covering:
     * Credentials loading and defaults.
     * Fail-safe mode: when credentials omitted/empty, bot continues without crash, logging warning, dispatch returns False cleanly.
     * Non-blocking queue ingestion: put_nowait execution time < 1ms.
     * Message formatting for notify_trade_opened, notify_trade_closed, notify_critical_event, notify_daily_summary.
     * Retry mechanism on network failure (mocking requests/dispatch).
     * HTTP 429 rate limit backoff handling.
     * Message length truncation (>4000 chars).
     * Bounded queue overflow handling (drops oldest, avoids memory leaks).
2. Implement tests/benchmark_telegram_performance.py:
   - Standalone verification script required by Acceptance Criteria ("simulates triggering an alert and measures the main thread blocking time (must be < 10ms)").
   - Simulates 2000ms network delay on dispatch.
   - Measures caller thread blocking time for single dispatch (< 10ms).
   - Measures caller thread blocking time during 100-alert burst test (< 10ms).
   - Measures fail-safe mode blocking time (< 1ms).
   - Can be run directly via `python tests/benchmark_telegram_performance.py` and returns exit code 0 when all tests pass.
3. Implement tests/test_telegram_integration.py:
   - Opaque-box contract tests verifying integration points.
4. Execute tests via terminal commands (`pytest tests/test_telegram_notifier.py` and `python tests/benchmark_telegram_performance.py`) as Milestone M1 files become available.
5. Create TEST_READY.md at project root when test infrastructure and test cases are ready, following the template in TEST_INFRA.md.
6. Write your comprehensive handoff report to:
   C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_t1\handoff.md
7. When done, send a message to your parent orchestrator (de7f01c8-4201-46bc-b6b8-ab303286d79f) with a summary of test coverage, execution commands, and results.

