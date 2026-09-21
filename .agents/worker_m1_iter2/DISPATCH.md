# Dispatch — worker_m1_iter2

## 2026-09-15T23:45:39Z

## Identity
- Role: Telegram Notifier & Config Remediation Builder (Milestone 1, Iteration 2)
- Working Directory: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m1_iter2
- Parent: orchestrator_2 (Conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9)

## Mandatory Reading
- ORIGINAL_REQUEST.md at `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- PROJECT.md at `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`
- Forensic Auditor Report: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\auditor_m1_1\handoff.md`
- Remediation Explorer Reports & Deliverables:
  - `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m1_iter2_1\handoff.md`
  - `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m1_iter2_1\proposed_telegram_notifier.py`
  - `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m1_iter2_1\config.patch`
  - `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m1_iter2_2\handoff.md`
  - `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m1_iter2_3\handoff.md`

## Write Ownership
You EXCLUSIVELY own and may modify:
- `infrastructure/telegram_notifier.py`
- `infrastructure/config.py`
- `.env.example`
Do NOT modify any other files.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective & Tasks
Implement the complete remediation for Milestone 1:
1. Update `infrastructure/telegram_notifier.py`:
   - Align all method signatures strictly with `PROJECT.md § Interface Contracts`:
     - `__init__(self, bot_token: Optional[str] = None, chat_id: Optional[str] = None, max_queue_size: int = 500, auto_start: bool = True, min_send_interval: float = 0.04, token: Optional[str] = None)`
     - `notify_trade_closed(self, ticket: int, symbol: str, direction: str, volume: float, profit: float, reason: str, close_price: Optional[float] = None)` (with tolerant unpacking if called with legacy inverted args)
     - `notify_critical_event(self, event_type: str, reason: str, details: Optional[str] = None)` (supporting both 2-arg and 3-arg calls)
     - `notify_daily_summary(self, date_str: str, daily_pnl: float, win_rate: float, kelly_fraction: float, total_trades: int, balance: float, equity: float)`
     - Implement all 5 domain aliases: `notify_trade_open`, `notify_trade_close`, `notify_kill_switch`, `notify_mt5_disconnect`, `notify_fatal_error`.
   - Enforce 25 msg/s rate limiter (`_min_send_interval = 0.04s`) in `_worker_loop` using monotonic clock.
   - Implement HTML entity escaping: `import html` and wrap all dynamic inputs in `html.escape(str(...))`.
   - Implement clean, interruptible thread lifecycle: replace bare `time.sleep` with `self._stop_event.wait(timeout)`; guard `start()` and `stop()` with `_lifecycle_lock`; guard queue saturation eviction with `_queue_lock`; add `@property def queue_size(self) -> int`.
2. Update `infrastructure/config.py`:
   - Ensure `is_telegram_enabled` strips whitespace:
     `return bool(self.TELEGRAM_BOT_TOKEN and self.TELEGRAM_BOT_TOKEN.strip() and self.TELEGRAM_CHAT_ID and self.TELEGRAM_CHAT_ID.strip())`
3. Execute genuine verification tests:
   - `pytest tests/test_telegram_notifier.py -v`
   - `pytest tests/test_telegram_integration.py -v`
   - `python tests/benchmark_telegram_performance.py`
   - `python tests/test_m1_adversarial_challenge.py`
4. Document all exact command lines and genuine execution results in `handoff.md` in your working directory.
5. Send a completion message to parent orchestrator when done.
