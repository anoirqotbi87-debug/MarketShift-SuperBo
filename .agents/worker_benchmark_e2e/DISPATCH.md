# Dispatch Instructions — worker_benchmark_e2e (Milestones 3 & 4 Phase 1)

- **Agent**: `worker_benchmark_e2e`
- **Role**: Performance Benchmark & E2E Test Suite Runner
- **Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_benchmark_e2e`
- **Requirements**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Architecture**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`
- **Test Infra**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\TEST_INFRA.md`
- **Test Ready**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\TEST_READY.md`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations and verification must be genuine. DO NOT fake benchmark numbers, hardcode test results, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work.

## Mission
1. **Execute Standalone Performance Benchmark (Milestone 3 / R3)**:
   - Run `python tests/benchmark_telegram_performance.py`.
   - Verify all 3 benchmark scenarios:
     - Single dispatch under 2000ms network delay (< 10.0 ms)
     - Burst of 100 alerts under severe network delay (< 10.0 ms max)
     - Fail-safe mode without credentials (< 1.0 ms)
   - Capture exact min, mean, median, p95, p99, and max latency figures.
   - Confirm process exit code is 0.

2. **Execute Full E2E Test Suite (Milestone 4 Phase 1)**:
   - Run `pytest tests/test_engine_telegram_hooks.py tests/test_telegram_integration.py tests/test_telegram_notifier.py tests/test_m1_adversarial_challenge.py tests/test_m2_stress.py tests/test_m2_challenger_stress.py -v`.
   - Confirm 100% of all tests across Tiers 1–4 pass with 0 failures and 0 errors.
   - Capture total test count, passed count, and execution time.

3. **Update `TEST_READY.md`**:
   - Update `TEST_READY.md` to reflect the comprehensive test coverage (Tiers 1–4 + Engine Hooks + Stress Suites).
   - Document verification commands and reproduction steps.

4. **Handoff Report**:
   - Write `handoff.md` in your working directory with full benchmark latency metrics, test pass statistics, and verification outputs.
   - Notify parent orchestrator when complete.

## 2026-09-16T00:11:13Z
<USER_REQUEST>
You are worker_benchmark_e2e.
Your working directory is: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_benchmark_e2e
Your parent is orchestrator_2 (conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9).

Read ORIGINAL_REQUEST.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md.
Also read PROJECT.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md.
Also read your DISPATCH.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_benchmark_e2e\DISPATCH.md.
Read TEST_INFRA.md and TEST_READY.md at project root.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All execution and outputs must be genuine. DO NOT fake benchmark numbers, hardcode test results, or fabricate outputs. A teamwork_preview_auditor will independently verify your work.

Tasks:
1. Run the Standalone Performance Benchmark (R3 verification):
   Run: python tests/benchmark_telegram_performance.py
   Measure and record:
   - Single dispatch latency under 2000ms network delay (must be < 10ms)
   - Burst of 100 alerts latency under 2000ms delay (max must be < 10ms)
   - Fail-safe mode latency (must be < 1ms)
   Confirm exit code is 0.

2. Run the Full E2E Test Suite (Milestone 4 Phase 1):
   Run: pytest tests/test_engine_telegram_hooks.py tests/test_telegram_integration.py tests/test_telegram_notifier.py tests/test_m1_adversarial_challenge.py tests/test_m2_stress.py tests/test_m2_challenger_stress.py -v
   Confirm 100% pass rate across all tests with 0 failures and 0 errors.

3. Update TEST_READY.md:
   Update TEST_READY.md at project root with the comprehensive test inventory, total test count, and exact commands.

4. Write handoff.md in your working directory with all benchmark metrics, test results, and command outputs.
When complete, notify your parent orchestrator (37865d3a-ef5b-4219-a235-789cd3dedba9) via send_message.
</USER_REQUEST>
