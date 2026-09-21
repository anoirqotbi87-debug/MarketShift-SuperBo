# Dispatch — worker_m1

## Identity
- Role: Telegram Notifier & Config Builder (Milestone 1)
- Working Directory: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m1
- Parent: orchestrator_2 (Conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9)

## Mandatory Reading
- ORIGINAL_REQUEST.md at `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- PROJECT.md at `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`
- Survey Reports:
  - `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_1_gen2\handoff.md`
  - `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_2_gen2\handoff.md`
  - `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_3_gen2\handoff.md`

## Write Ownership
You EXCLUSIVELY own and may modify:
- `infrastructure/config.py`
- `.env.example`
- `infrastructure/telegram_notifier.py`
Do NOT modify any other files.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective & Requirements
Implement Milestone 1:
1. In `infrastructure/config.py`:
   - Add `TELEGRAM_BOT_TOKEN: str = Field("")` and `TELEGRAM_CHAT_ID: str = Field("")` to `AppConfig`.
   - Ensure fail-safe loading: if `.env` does not define them, Pydantic defaults to empty strings without error.
2. In `.env.example`:
   - Add commented placeholders for `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
3. In `infrastructure/telegram_notifier.py`:
   - Implement `TelegramNotifier` per the specification and interface contract in `PROJECT.md § Interface Contracts`.
   - Asynchronous / non-blocking: uses `queue.Queue(maxsize=500)` and a background daemon worker thread. Calling `notify_*` methods must return in < 0.1ms using `put_nowait()`.
   - Implement rate limiting (max 25 msgs/sec), HTTP retry on network errors, handling HTTP 429 backoff, and HTML parse-mode tag escaping / plain text fallback.
   - Implement all notification formatting methods:
     - `notify_trade_opened(...)`
     - `notify_trade_closed(...)`
     - `notify_critical_event(...)`
     - `notify_daily_summary(...)`
     - `send_message(...)` and `send_message_async(...)`
   - Clean startup (`start()`) and shutdown (`stop(timeout=2.0)`).
   - Fail-safe handling: If `bot_token` or `chat_id` are missing, log warning once, set `self.enabled = False`, and return immediately without errors.
4. Run verification commands (e.g. `python -c ...` to verify imports and fail-safe behavior).
5. Document all results and commands in `handoff.md` in your working directory.

## 2026-09-15T21:04:42Z
You are worker_m1.
Your working directory is: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m1
Your parent is orchestrator_2 (conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9).

Read ORIGINAL_REQUEST.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md.
Also read PROJECT.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md.
Also read your DISPATCH.md at C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m1\DISPATCH.md.
Read the survey handoff reports:
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_1_gen2\handoff.md
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_2_gen2\handoff.md
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_3_gen2\handoff.md

Write Ownership:
You EXCLUSIVELY own and may modify:
- infrastructure/config.py
- .env.example
- infrastructure/telegram_notifier.py
Do NOT modify any other files.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Objective:
Implement Milestone 1 (Telegram Notifier & Config Fail-Safe):
1. In infrastructure/config.py:
   - Add TELEGRAM_BOT_TOKEN: str = Field("") and TELEGRAM_CHAT_ID: str = Field("") to AppConfig.
   - Ensure fail-safe loading: if .env does not define them, Pydantic defaults to empty strings without error.
2. In .env.example:
   - Add commented placeholders for TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
3. In infrastructure/telegram_notifier.py:
   - Implement TelegramNotifier per the specification and interface contract in PROJECT.md.
   - Asynchronous / non-blocking: uses queue.Queue(maxsize=500) and a background daemon worker thread. Calling notify_* methods must return in < 0.1ms using put_nowait().
   - Implement rate limiting (max 25 msgs/sec), HTTP retry on network errors, handling HTTP 429 backoff, and HTML parse-mode tag escaping / plain text fallback.
   - Implement all notification formatting methods:
     - notify_trade_opened(...)
     - notify_trade_closed(...)
     - notify_critical_event(...)
     - notify_daily_summary(...)
     - send_message(...) and send_message_async(...)
   - Clean startup (start()) and shutdown (stop(timeout=2.0)).
   - Fail-safe handling: If bot_token or chat_id are missing, log warning once, set self.enabled = False, and return immediately without errors.
4. Run verification commands to test imports, instantiation, and fail-safe behavior.
5. Document all results, verification commands, and code changes in handoff.md in your working directory.
When complete, send a message to your parent orchestrator (37865d3a-ef5b-4219-a235-789cd3dedba9).

