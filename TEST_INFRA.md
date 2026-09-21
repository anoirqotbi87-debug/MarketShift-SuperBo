# E2E Test Infra: MarketShift SuperBot Telegram Integration

## Test Philosophy
- **Opaque-box & Requirement-driven**: Derived directly from `ORIGINAL_REQUEST.md` specifications, independent of internal implementation artifacts.
- **Methodology**: 4-Tier verification hierarchy (Category-Partition, Boundary Value Analysis, Pairwise Combinatorial, Real-World Workload Testing).

## Feature Inventory & Tier Mapping
| # | Feature | Source | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) |
|---|---------|--------|:----------------:|:-----------------:|:-----------------:|
| F1 | Env Config Loading | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| F2 | Fail-Safe Resiliency | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| F3 | Non-Blocking Latency (< 10ms) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| F4 | Trade Open Event | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| F5 | Trade Close Event & Reasons | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| F6 | Critical Events (KillSwitch/Disconnect) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| F7 | Daily Summary Event | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| F8 | Standalone Benchmark Script | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner**:
  - `pytest tests/test_telegram_*.py -v`
  - `python tests/benchmark_telegram_performance.py`
  - Exit code 0 indicates all assertions passed without errors.
- **Test Directory Layout**:
  - `tests/test_telegram_notifier.py`: Unit tests for notifier, formatting, rate-limiting, error resilience.
  - `tests/test_telegram_integration.py`: Integration tests with engine hooks, kill-switch, and daily summaries.
  - `tests/benchmark_telegram_performance.py`: Standalone benchmark measuring execution latency with high-resolution timers.
- **Mocking & Isolation Strategy**:
  - Mock HTTP responses (e.g. `urllib.request.urlopen` or `requests.post`) to avoid real external Telegram network traffic.
  - Mock broker connectors to simulate order placement, deal closures, and MT5 disconnects.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Trading Day Lifecycle (Open -> Trail -> Close via TP) | F1, F3, F4, F5 | High |
| 2 | Emergency Circuit Breaker Trigger under Drawdown | F1, F3, F6 | High |
| 3 | Broker Disconnect & Failover Alerting | F1, F3, F6 | Medium |
| 4 | Midnight Daily Summary Rollover with PnL & Kelly metrics | F1, F3, F7 | Medium |
| 5 | Network Blackout / Telegram 429 Throttle Burst Resilience | F2, F3, F8 | High |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥ 40 test cases (≥ 5 per feature across 8 features)
- **Tier 2 (Boundary & Corner)**: ≥ 40 test cases (empty strings, None values, overflow numbers, rapid bursts, malformed inputs)
- **Tier 3 (Pairwise Interactions)**: ≥ 8 multi-feature interaction test cases
- **Tier 4 (Real-World Scenarios)**: ≥ 5 comprehensive end-to-end workload simulations
- **Total Minimum Test Count**: ≥ 93 test cases
