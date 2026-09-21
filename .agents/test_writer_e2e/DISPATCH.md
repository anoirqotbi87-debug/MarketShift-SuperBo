# Dispatch — test_writer_e2e

## Identity
- Role: E2E Test Suite Designer (E2E Testing Track)
- Working Directory: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\test_writer_e2e
- Parent: orchestrator_2 (Conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9)

## Mandatory Reading
- ORIGINAL_REQUEST.md at `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- PROJECT.md at `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`
- TEST_INFRA.md at `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\TEST_INFRA.md`
- Survey Reports:
  - `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_1_gen2\handoff.md`
  - `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_2_gen2\handoff.md`
  - `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_3_gen2\handoff.md`

## Write Ownership
You EXCLUSIVELY own and may modify:
- `tests/test_telegram_notifier.py`
- `tests/test_telegram_integration.py`
- `tests/benchmark_telegram_performance.py`
- `TEST_READY.md` (at project root)
Do NOT modify production source files under `application/`, `infrastructure/`, `agents/`, etc.

## Mandatory Integrity Warning
DO NOT CHEAT. All test implementations and benchmarks must be genuine and execute real assertions against code contracts. DO NOT fake results or create tautological tests. A teamwork_preview_auditor will independently verify your work.

## Objective & Requirements
Design and implement the comprehensive E2E test suite and standalone performance benchmark per `TEST_INFRA.md`:
1. `tests/test_telegram_notifier.py`:
   - Unit tests covering `TelegramNotifier` initialization, config reading, fail-safe mode (missing token/chat_id), enqueueing speed, queue overflow handling, worker thread dispatch, HTML sanitization, and rate-limiting.
   - Use mocking for network requests (`urllib.request` / `requests`) so tests run offline in CI/local.
2. `tests/test_telegram_integration.py`:
   - Comprehensive 4-Tier test cases:
     - Tier 1: Feature coverage (≥5 tests per feature F1-F7)
     - Tier 2: Boundary and corner cases (empty strings, None, large volume, negative pnl, rapid triggers)
     - Tier 3: Pairwise feature interactions (open + close, kill-switch + close, etc.)
     - Tier 4: Real-world application scenarios (full trading session, circuit breaker liquidation, daily summary rollover)
3. `tests/benchmark_telegram_performance.py`:
   - Standalone executable verification script.
   - Measures main-thread blocking time using `time.perf_counter_ns()`.
   - Tests 5 distinct scenarios: S1 Fail-Safe, S2 Normal Enqueue with 50ms worker I/O, S3 Severe Network Stall (5000ms delay in worker), S4 High-volume flood burst (100 rapid calls), S5 Async event loop jitter.
   - Asserts max main-thread blocking time < 10.0 ms across all scenarios. Exits with 0 on pass, 1 on fail.
4. Verify the test suite and benchmark script using pytest and python.
5. Create `TEST_READY.md` at project root summarizing the test runner command, tier counts, and feature checklist.
6. Write `handoff.md` in your working directory and notify parent when complete.
