## 2026-09-15T23:40:28Z
You are the Worker agent for Milestone M2 (Engine & Manager Event Hooks Injection) for the MarketShift SuperBot Telegram alert system project.
Your working directory is: C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2_gen2
Your parent orchestrator is: de7f01c8-4201-46bc-b6b8-ab303286d79f

MANDATORY FIRST STEP:
Read C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md in full before starting work.
Also read:
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\TEST_READY.md
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_1\handoff.md (detailed lines and data flow in engine.py)
- C:\Users\Qotbi\.gemini\antigravity\brain\4cfc56b8-c414-416c-8b35-d2db55c65f62\handoff.md (detailed survey of managers, metrics, and state)
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m1\handoff.md (notifier implementation)
- C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_t1\handoff.md (test suite notes)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE FILE OWNERSHIP:
You own and may modify ONLY these files:
- application/engine.py
- agents/kill_switch.py
- monitoring/surveillance_agent.py
- infrastructure/broker_router.py
- infrastructure/telegram_notifier.py
Do NOT touch files in tests/ or api/.

Objectives for Milestone M2:
1. Align infrastructure/telegram_notifier.py:
   - Ensure notify_trade_closed accepts both parameter orderings flexibly (ticket first or symbol first, or kwargs):
     def notify_trade_closed(self, ticket_or_symbol, symbol_or_ticket, direction_or_order_type, volume: float, profit: float, reason: str = "Inconnue", close_price: Optional[float] = None)
     with robust argument detection.
   - Ensure notify_daily_summary supports optional date_str (if first arg is float, treated as daily_pnl with today's date).
   - In send_message: when queue is full (queue.Full), pop oldest item (self._queue.get_nowait()) before adding new item, logging a rate warning.
2. Inject hooks into agents/kill_switch.py:
   - In activate(self, reason: str): dispatch telegram_notifier.notify_critical_event("KILL_SWITCH", reason) before _close_all_positions().
3. Inject hooks into application/engine.py:
   - Import telegram_notifier from infrastructure.telegram_notifier.
   - Initialize self._seen_deal_tickets: set = set() and self._last_summary_date: Optional[datetime.date] = None in __init__.
   - Hook 1 - Position Opened: In _order_routing_worker, immediately after `if result:`, call:
     telegram_notifier.notify_trade_opened(
         symbol=payload['symbol'],
         direction=str(payload['direction']).replace('OrderType.', ''),
         volume=float(result.get('volume', payload.get('volume', 0.0))),
         price=float(result.get('price', 0.0)),
         sl=float(payload.get('sl_price', 0.0)),
         tp=float(payload.get('tp_price', 0.0)),
         ticket=int(result.get('ticket', 0)),
         ml_confidence=payload.get('metadata', {}).get('ml_confidence') if isinstance(payload.get('metadata'), dict) else None
     )
   - Hook 2 - Position Closed: In _refresh_kelly_history:
     On first run (if not self._seen_deal_tickets): seed with all current deal tickets from connector.get_history_deals.
     On subsequent runs: detect newly appeared closed deals (d.entry in (1, 2) or d.profit != 0) not in _seen_deal_tickets. For each new deal:
       - determine close reason from d.reason (4 -> 'Stop Loss (SL)', 5 -> 'Take Profit (TP)', 0 -> 'Client/Manual', 3 -> 'Expert/Bot', 6 -> 'Stop Out', etc.)
       - call telegram_notifier.notify_trade_closed(ticket=d.ticket, symbol=d.symbol, direction='BUY' if d.type==1 else 'SELL', volume=float(d.volume), profit=float(d.profit), reason=close_reason)
       - add d.ticket to _seen_deal_tickets.
   - Hook 3 - Daily Summary: In _async_run_loop:
     Track day change (`current_date = datetime.datetime.utcnow().date()`).
     If self._last_summary_date is not None and current_date > self._last_summary_date:
       Calculate daily metrics: sum of closed deals profit for the previous day, daily win rate, position_sizer.compute_kelly_fraction(), daily trade count, account balance, and equity.
       Call telegram_notifier.notify_daily_summary(daily_pnl=daily_pnl, win_rate=daily_win_rate, kelly_fraction=kelly_frac, total_trades=daily_trades, balance=balance, equity=equity).
     Always set self._last_summary_date = current_date.
   - Hook 4 - Fatal Exceptions & Disconnection:
     In _run_async_loop_thread: catch unhandled Exception as e, call telegram_notifier.notify_critical_event("FATAL_EXCEPTION", f"Trading engine thread crashed: {e}"), then log.
     In start() and _run_async_loop_thread: if connector.connect() fails, call telegram_notifier.notify_critical_event("MT5_DISCONNECT", "Failed to connect to broker").
4. Inject hooks into monitoring/surveillance_agent.py:
   - In _monitor_loop: when engine thread is detected dead (!self.engine._thread.is_alive()), dispatch telegram_notifier.notify_critical_event("ENGINE_THREAD_CRASH", "Watchdog detected engine thread termination").
5. Inject hooks into infrastructure/broker_router.py:
   - In _switch_to_fallback: dispatch telegram_notifier.notify_critical_event("BROKER_FAILOVER", f"Primary broker failed, switching to fallback {self.fallback_broker}").
   - When both brokers fail: dispatch telegram_notifier.notify_critical_event("BROKER_DISCONNECT", "Primary and fallback brokers unreachable").
6. Verification:
   - Run: `pytest tests/test_telegram_notifier.py tests/test_telegram_integration.py -v`
   - Run: `python tests/benchmark_telegram_performance.py`
   - Verify all tests pass cleanly with 0 failures and exit code 0.
7. Write your comprehensive handoff report to:
   C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\worker_m2_gen2\handoff.md
8. When done, send a message to your parent orchestrator (de7f01c8-4201-46bc-b6b8-ab303286d79f) with verification outputs.
