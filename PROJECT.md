# Project: MarketShift SuperBot Telegram Integration

## Architecture
The MarketShift SuperBot Telegram notification system provides real-time alerts for trading activities, risk events, and daily performance metrics without impacting zero-latency trading loops.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          MarketShift Engine Loop                       │
│  (_order_routing_worker / _refresh_kelly_history / KillSwitch.activate)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Non-blocking queue.put_nowait() (< 0.05ms)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   TelegramNotifier (In-Memory Queue)                   │
│                       queue.Queue(maxsize=500)                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Dequeue in background daemon thread
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  TelegramWorkerThread (Worker Daemon)                  │
│       Rate-Limiter (max 25 msg/s) + HTML Sanitizer + HTTP Retries      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP POST (timeout=5s)
                                    ▼
                          Telegram Bot API Server
```

- **Configuration Layer**: `infrastructure/config.py` loads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` via Pydantic settings from `.env`. If missing, gracefully operates in fail-safe disabled mode.
- **Service Layer**: `infrastructure/telegram_notifier.py` implements `TelegramNotifier` managing a thread-safe bounded queue and a background daemon worker thread.
- **Engine Hooks Layer**:
  - `application/engine.py:_order_routing_worker`: Trade open hook.
  - `application/engine.py:_refresh_kelly_history`: Trade close hook with reason classification (TP / SL / Manual).
  - `agents/kill_switch.py:KillSwitch.activate`: Centralized critical event hook for kill-switch activations.
  - `infrastructure/broker_router.py:BrokerRouter.connect`: MT5 connection loss alert.
  - `application/engine.py:_async_run_loop`: Midnight daily summary trigger & fatal exception alert.
- **Verification Layer**:
  - Standalone benchmark: `tests/benchmark_telegram_performance.py` (< 10ms main-thread latency guarantee).
  - Unit and integration test suite: `tests/test_telegram_notifier.py` and `tests/test_telegram_integration.py`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1: Env Config Loading | Load `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID` via `AppConfig` from `.env` | M1 | ORIGINAL_REQUEST §R1 |
| 2 | F2: Fail-Safe Resiliency | Omission of credentials logs warning; trading engine operates normally without crashing | M1 | ORIGINAL_REQUEST §R1 |
| 3 | F3: Non-Blocking Dispatch | Zero-latency dispatch (< 10ms main thread blocking time) via in-memory queue and daemon worker | M1 | ORIGINAL_REQUEST §R3 |
| 4 | F4: Trade Open Hook | Notification triggered upon broker order execution with symbol, type, volume, entry, SL/TP, ticket, ML confidence | M2 | ORIGINAL_REQUEST §R2 |
| 5 | F5: Trade Close Hook | Notification triggered upon deal closure with PnL, close reason (TP/SL/Manual), exit price, volume | M2 | ORIGINAL_REQUEST §R2 |
| 6 | F6: Critical Events Hook | Notifications triggered on Kill-Switch activation, MT5 broker disconnect, and fatal engine exceptions | M2 | ORIGINAL_REQUEST §R2 |
| 7 | F7: Daily Summary Hook | Automated midnight notification reporting daily realized PnL, daily win rate, Kelly fraction, balance, and equity | M2 | ORIGINAL_REQUEST §R2 |
| 8 | F8: Standalone Benchmark | Standalone verification script (`tests/benchmark_telegram_performance.py`) measuring main-thread blocking time < 10ms under multiple network conditions | M3 | ORIGINAL_REQUEST §R3 |
| 9 | F9: E2E Integration Suite | Complete test suite execution (Tiers 1-4) and Tier 5 adversarial hardening | M4 | ORIGINAL_REQUEST §Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Telegram Notifier & Config Fail-Safe | `infrastructure/config.py`, `.env.example`, `infrastructure/telegram_notifier.py` | None | DONE (Passed Gate Iteration 2: Clean Audit, All Approved) |
| M2 | Engine & Manager Event Hooks | `application/engine.py`, `agents/kill_switch.py`, `infrastructure/broker_router.py` | M1 | DONE (Passed Gate: Clean Audit, All Reviewers & Challengers Approved) |
| M3 | Standalone Performance Benchmark | `tests/benchmark_telegram_performance.py` measuring latency < 10ms across 5 scenarios | M1, M2 | DONE (Verified: Single Dispatch 0.041ms, Burst Max 0.098ms, Fail-Safe 0.004ms) |
| M4 | Final Milestone: E2E Verification & Adversarial Hardening | Pass 100% of E2E test suite (Tiers 1-4) + Tier 5 Adversarial Hardening | M1, M2, M3 | DONE (100% Pass: 95/95 Tests, 32 Adversarial Stress Tests Passed, TEST_READY.md Published) |

## Interface Contracts

### `infrastructure.telegram_notifier` ↔ Application Components
```python
class TelegramNotifier:
    def __init__(self, bot_token: Optional[str] = None, chat_id: Optional[str] = None, max_queue_size: int = 500):
        ...
    def start(self) -> None:
        ...
    def stop(self, timeout: float = 2.0) -> None:
        ...
    def notify_trade_opened(
        self,
        symbol: str,
        direction: str,
        volume: float,
        price: float,
        sl: float,
        tp: float,
        ticket: int,
        ml_confidence: Optional[float] = None
    ) -> bool:
        ...
    def notify_trade_closed(
        self,
        ticket: int,
        symbol: str,
        direction: str,
        volume: float,
        profit: float,
        reason: str,
        close_price: Optional[float] = None
    ) -> bool:
        ...
    def notify_critical_event(
        self,
        event_type: str,
        reason: str,
        details: Optional[str] = None
    ) -> bool:
        ...
    def notify_daily_summary(
        self,
        date_str: str,
        daily_pnl: float,
        win_rate: float,
        kelly_fraction: float,
        total_trades: int,
        balance: float,
        equity: float
    ) -> bool:
        ...
```

- **Thread-Safety**: All `notify_*` methods must be callable safely from coroutines, main thread, or secondary threads (`SurveillanceThread`, FastAPI worker).
- **Latency Guarantee**: Every `notify_*` call must return in < 0.1ms via non-blocking `queue.put_nowait()`.
- **Error Handling**: Missing credentials or network drops must never raise unhandled exceptions to callers.

## Code Layout
- `infrastructure/config.py`: Add `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID` Pydantic fields.
- `infrastructure/telegram_notifier.py`: Core asynchronous notifier service and background daemon thread.
- `application/engine.py`: Inject notifier, initialize in lifecycle, hook trade open/close/daily summary.
- `agents/kill_switch.py`: Inject notifier and hook `activate()`.
- `infrastructure/broker_router.py`: Hook broker disconnect event.
- `tests/benchmark_telegram_performance.py`: Standalone latency verification benchmark script.
- `tests/test_telegram_notifier.py`: Unit test suite for notifier logic, formatting, queueing, fail-safe.
- `tests/test_telegram_integration.py`: Integration test suite for engine hooks, kill-switch, and daily summary.
