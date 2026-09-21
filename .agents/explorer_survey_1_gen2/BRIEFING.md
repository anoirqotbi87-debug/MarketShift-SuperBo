# BRIEFING — 2026-09-15T20:53:19Z

## Mission
Investigate core trading engine architecture in application/engine.py and main.py to identify execution model, event hooks, and lifecycle management for Telegram alert integration.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, survey, synthesis
- Working directory: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_1_gen2
- Original parent: 37865d3a-ef5b-4219-a235-789cd3dedba9
- Milestone: Telegram Alert System Integration Survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify source code (only write reports and metadata in own folder)
- Files for content delivery, Messages for coordination

## Current Parent
- Conversation ID: 37865d3a-ef5b-4219-a235-789cd3dedba9
- Updated: 2026-09-15T20:53:19Z

## Investigation State
- **Explored paths**: `main.py`, `application/engine.py`, `agents/kill_switch.py`, `agents/circuit_breaker.py`, `monitoring/surveillance_agent.py`, `infrastructure/broker_router.py`, `infrastructure/mt5_connector.py`, `application/position_sizer.py`, `application/state_manager.py`, `infrastructure/config.py`, `api/server.py`.
- **Key findings**:
  - Execution model: Main thread (uvicorn), Engine thread (asyncio event loop), Surveillance thread (monitoring & WFO), ML retrain threads.
  - Trade Open Hook: `application/engine.py:547-552` inside `_order_routing_worker()`.
  - Trade Close Hook: `application/engine.py:412-427` inside `_refresh_kelly_history()` via MT5 deals inspection.
  - Kill-Switch Hook: `agents/kill_switch.py:9-16` inside `KillSwitch.activate(reason)` catches all triggers.
  - MT5 Disconnect Hooks: `infrastructure/broker_router.py:35`, `application/engine.py:106, 121, 149`.
  - Daily Summary Hook: Midnight transition in `_async_run_loop()`, metrics from MT5 deals and `position_sizer`.
  - Performance Isolation: Thread-safe queue (`queue.Queue`) + background worker thread guarantees <0.05ms blocking time for calling loops.
- **Unexplored areas**: None within the assigned survey scope.

## Key Decisions Made
- Recommended queue-based non-blocking architecture for `TelegramNotifier` to support zero-latency calls across async loops and sync threads.
- Mapped all 4 required event trigger categories with exact file paths and line ranges.
- Completed comprehensive handoff report at `handoff.md`.

## Artifact Index
- DISPATCH.md — Task assignment from orchestrator
- BRIEFING.md — Situational awareness and working memory
- progress.md — Liveness heartbeat and milestone tracking
- handoff.md — 5-component architectural survey and integration blueprint

