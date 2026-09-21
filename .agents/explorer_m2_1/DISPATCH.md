## 2026-09-15T23:55:26Z

# Dispatch Instructions — explorer_m2_1

- **Agent**: `explorer_m2_1`
- **Role**: Engine Hooks & Trade Lifecycle Explorer (Milestone 2)
- **Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_1`
- **Requirements**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\ORIGINAL_REQUEST.md`
- **Project Architecture**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\PROJECT.md`

## Mission
Investigate the exact implementation strategy for Milestone 2 hooks in `application/engine.py`:
1. **Trade Open Hook**:
   - Location: `_order_routing_worker` (lines ~547–552).
   - Inspect data available: `payload['symbol']`, `payload['direction']`, `result['price']`, `payload['volume']`, `payload['sl_price']`, `payload['tp_price']`, `result['ticket']`, `payload.get('metadata', {}).get('ml_confidence')`.
   - Formulate exact invocation of `self.notifier.notify_trade_opened(...)` or global `telegram_notifier.notify_trade_opened(...)`.
2. **Trade Close Hook**:
   - Location: `_refresh_kelly_history` (lines ~385–430).
   - Inspect closed deals from `self.connector.get_history_deals(...)`.
   - Prevent alert spamming on engine startup: track `self._seen_deal_tickets: set = set()` seeded on first check.
   - Classification of close reasons:
     - `deal.reason`: MT5 constants (DEAL_REASON_SL = 4, DEAL_REASON_TP = 5, DEAL_REASON_CLIENT = 0, DEAL_REASON_EXPERT = 3, DEAL_REASON_SO = 6).
     - `deal.comment`: check for `"[sl]"`, `"[tp]"`.
     - Output clean human-readable reason (`"Stop Loss (SL)"`, `"Take Profit (TP)"`, `"Manual / Client"`, etc.).
   - Formulate exact invocation of `self.notifier.notify_trade_closed(...)`.
3. **Daily Summary Hook**:
   - Location: `_async_run_loop` midnight rollover.
   - Track `self._last_summary_date: Optional[datetime.date]`.
   - When date changes at midnight:
     - Query realized PnL of closed deals for the completed day.
     - Query win rate from `self.position_sizer.win_rate`.
     - Query Kelly fraction from `self.position_sizer.compute_kelly_fraction()`.
     - Query total trades for the day.
     - Query account balance and equity from `self.state_manager.account`.
   - Formulate exact invocation of `self.notifier.notify_daily_summary(...)`.
4. **Engine Lifecycle & Notifier Wiring**:
   - `Engine.__init__`: initialize `self.notifier: TelegramNotifier = telegram_notifier` (or instantiate `TelegramNotifier()`).
   - `Engine.start()`: call `self.notifier.start()`.
   - `Engine.stop()`: call `self.notifier.stop()`.
   - Pass `notifier` into `KillSwitch(connector, notifier=self.notifier)`.

## Output
Write your comprehensive findings and exact proposed code diffs to `handoff.md` in your working directory.
When complete, notify your parent orchestrator (`37865d3a-ef5b-4219-a235-789cd3dedba9`) via `send_message`.
