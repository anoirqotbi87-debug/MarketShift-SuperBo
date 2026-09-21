# Dispatch — explorer_survey_2_gen2

## Identity
- Role: Managers, State & Config Explorer
- Working Directory: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_2_gen2
- Parent: orchestrator_2 (Conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9)

## Task Description
Read `ORIGINAL_REQUEST.md` at `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`.
Investigate the managers, risk system, configuration, and state tracking across the codebase:
1. Environment & Config: How `.env` is loaded across the project. How `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` should be integrated, including fail-safe fallback when omitted. Check `.env` and `.env.example`.
2. Managers & Risk: Explore `risk/`, `application/`, `core/`, `monitoring/` for:
   - Kill-switch logic and state triggers.
   - MT5 connection / bridge and disconnection detection.
   - Position tracking, order execution models, trade close reasons (TP/SL/Manual).
   - Daily performance metrics: where PnL, Win Rate, and Kelly fraction are computed or stored.
3. Define exact data schemas/payload structures for all Telegram notification events.
4. Document all file paths, class names, methods, and data attributes.

## Scope Boundaries
- Read-only exploration. DO NOT modify any code.
- Write your comprehensive findings and evidence report to `handoff.md` in your working directory.
- Send a completion message to parent when done.

## 2026-09-15T21:00:21Z
**Context**: Survey progress check
**Content**: Please proceed with your investigation of config, managers, risk system, and state tracking. If any shell command is paused waiting for approval, rely on direct file inspection (`requirements.txt`, `infrastructure/config.py`, `risk/`, etc.) using view_file or grep_search instead of running interactive shell commands.
**Action**: Complete your survey and write handoff.md.
