# Original User Request

## 2026-09-15T20:34:50Z

# Teamwork Project Prompt

Build an asynchronous Telegram alert system natively integrated into the MarketShift SuperBot core engine. The system will send real-time notifications for trading activity and critical events without degrading engine performance.

Working directory: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot
Integrity mode: development

## Requirements

### R1. Telegram Integration
Implement a non-blocking/asynchronous Telegram notification module. It should use standard HTTP requests (e.g. `requests` or `aiohttp`) or a lightweight Telegram library. The `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` must be configured via the `.env` file. If these are missing, the bot must log a warning and continue trading normally (fail-safe).

### R2. Event Triggers
Inject the notification hooks into `application/engine.py` (and relevant managers) to trigger on:
- New positions opened (Buy/Sell, symbol, volume, SL/TP).
- Positions closed (Profit/Loss result, reason TP/SL/Manual).
- Critical Events: Kill-switch activation, MT5 disconnection, or fatal exceptions.
- Daily Summary: A midnight (or end of day) summary of daily PnL, Win Rate, and Kelly fraction.

### R3. Performance Isolation
The notification dispatch MUST be strictly asynchronous (or threaded) so that network latency to the Telegram API does not block the zero-latency trading loop.

## Acceptance Criteria

### Integration & Resilience
- [ ] The module successfully reads credentials from `.env`.
- [ ] If credentials are omitted from `.env`, the trading engine starts and loops without crashing, merely logging that Telegram is disabled.

### Asynchronous Execution
- [ ] The code dispatching the alert runs in a separate thread or via `asyncio.create_task`, ensuring the main engine loop (`_async_run_loop` or `start`) is not blocked by network I/O.
- [ ] A standalone verification script is provided that simulates triggering an alert and measures the main thread blocking time (must be < 10ms).

### Event Coverage
- [ ] Code inspection confirms hooks exist for trade open, trade close, and kill-switch activation.
