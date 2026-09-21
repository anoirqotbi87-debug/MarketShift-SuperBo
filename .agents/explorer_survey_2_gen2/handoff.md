# Handoff Report — Managers, State & Config Survey for Telegram Integration

**Author**: `explorer_survey_2_gen2`  
**Date**: 2026-09-15  
**Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_survey_2_gen2`  
**Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)

---

## 1. Observation

### 1.1 Environment & Configuration Architecture
- **Configuration Engine (`infrastructure/config.py`)**:
  - Uses `pydantic_settings.BaseSettings` and `SettingsConfigDict` (lines 4, 41-45):
    ```python
    class AppConfig(BaseSettings):
        ENVIRONMENT: str = Field("development")
        ACTIVE_BROKER: str = Field("xm")
        SIMULATION_MODE: bool = Field(True)
        API_SECRET_KEY: str = Field("marketshift_dev_secret_key_2026")
        ...
        model_config = SettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            extra="ignore"
        )
    ```
  - Global singleton instantiated at line 78:
    ```python
    try:
        Config = AppConfig()
    except Exception as e:
        logging.critical(f"Erreur fatale de configuration (.env invalide) : {e}")
        raise
    ```
  - `Config` is imported across the codebase: `application/engine.py:26`, `main.py:28`, `agents/circuit_breaker.py:4`, `risk/pretrade_validator.py:5`, `api/server.py:26`, `ml/trainer.py:44`.
  - Current `.env` file (lines 1-29) and `.env.example` (lines 1-24):
    - Neither file currently contains `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID`.
    - `python-dotenv>=1.0.0` and `pydantic-settings>=2.0.0` are present in `requirements.txt` (lines 2, 4, 12, 14).
    - In Pydantic Settings, any field defined with a default (e.g. `TELEGRAM_BOT_TOKEN: str = Field("")`) is automatically optional in `.env`. If omitted from `.env`, Pydantic assigns the default string without raising a `ValidationError`.

### 1.2 Kill-Switch Logic and State Triggers
- **KillSwitch Class (`agents/kill_switch.py`)**:
  - Constructor (lines 5-7):
    ```python
    class KillSwitch:
        def __init__(self, connector: MT5Connector):
            self.connector = connector
            self.is_triggered = False
    ```
  - Trigger method (lines 9-16):
    ```python
    def activate(self, reason: str):
        if self.is_triggered:
            return
        logging.critical(f"⚠️ KILL SWITCH ACTIVÉ ⚠️ Raison: {reason}")
        self.is_triggered = True
        self._close_all_positions()
    ```
  - Emergency position close (lines 18-30): loops over `self.connector.get_positions()` and calls `self.connector.close_position(pos.ticket)`.
  - Reset method (lines 32-35): `self.is_triggered = False`.
- **Triggers across Codebase**:
  1. `CircuitBreaker.check()` (`agents/circuit_breaker.py:27-32`):
     ```python
     loss_pct = (self.initial_balance - current_equity) / self.initial_balance
     if loss_pct >= self.max_daily_loss_pct:
         logging.warning(f"Circuit Breaker déclenché ! Perte: {loss_pct*100:.2f}% (Max {self.max_daily_loss_pct*100:.2f}%)")
         self.kill_switch.activate(reason="MAX_DAILY_LOSS_REACHED")
         return False
     ```
  2. `SurveillanceAgent._monitor_loop()` (`monitoring/surveillance_agent.py:42-46`):
     ```python
     if not self.engine._thread.is_alive():
         logging.critical("[SurveillanceAgent] 🚨 L'Event Loop asynchrone de l'Engine a crashé silencieusement ! Activation du Kill Switch.")
         self.kill_switch.activate("Crash de l'Engine Thread")
         self.engine.running = False
         break
     ```
  3. API Endpoint `/api/kill_switch` (`api/server.py:368` and `api_server_e9.py:322`):
     ```python
     if req.activate:
         _engine.kill_switch.activate("MANUAL_TRIGGER_API")
     ```
- **Engine Response to KillSwitch**:
  - `Engine._async_run_loop()` (`application/engine.py:142-144`):
    ```python
    if self.kill_switch.is_triggered:
        await asyncio.sleep(1)
        continue
    ```
  - `Engine._trailing_stop_worker()` (`application/engine.py:516`): pauses stop-loss adjustments while triggered.
  - `SurveillanceAgent._monitor_loop()` (`monitoring/surveillance_agent.py:55-58`): terminates engine if kill switch is triggered.

### 1.3 MT5 Connection, Bridge & Disconnection Detection
- **Connector (`infrastructure/mt5_connector.py`)**:
  - Implements `core.interfaces.IBrokerConnector`.
  - Attributes: `login: int`, `password: str`, `server: str`, `connected: bool = False`, `_lock: threading.Lock`.
  - `connect() -> bool` (line 24): Calls `mt5.initialize(login=..., password=..., server=...)`. Sets `self.connected = True`.
  - `disconnect() -> None` (line 47): Calls `mt5.shutdown()`. Sets `self.connected = False`.
  - `get_account_info() -> Optional[AccountInfo]` (line 54): Returns `None` if `not self.connected` or if `mt5.account_info()` returns `None`.
- **High Availability Router (`infrastructure/broker_router.py`)**:
  - `BrokerRouter` wraps `primary: IBrokerConnector` (XM) and `fallback: IBrokerConnector` (Exness).
  - Attributes: `_active_broker`, `connected: bool`.
  - Failover method `_switch_to_fallback()` (lines 46-55): switches active broker from primary to fallback when primary calls return `None` or fail.
- **State Management & Disconnection Detection (`application/state_manager.py`)**:
  - In `StateManager.update_state()` (lines 13-24):
    ```python
    def update_state(self) -> bool:
        if self.is_paused:
            return False
        try:
            self._account_info = self.connector.get_account_info()
            self._positions = self.connector.get_positions()
            return True
        except Exception as e:
            logging.error(f"Erreur lors de la mise à jour de l'état: {e}")
            return False
    ```
  - In `Engine._async_run_loop()` (line 149): `self.state_manager.update_state()` is executed on every loop iteration.
  - If MT5 disconnects or terminal terminates, `self.state_manager.account` becomes `None` or `self.connector.connected` becomes `False`.

### 1.4 Position Tracking & Order Execution Models
- **Data Models (`core/interfaces.py`)**:
  - `OrderType` (lines 7-9): `BUY = "BUY"`, `SELL = "SELL"`.
  - `PositionInfo` (lines 32-44): `ticket: int`, `symbol: str`, `type: OrderType`, `volume: float`, `open_price: float`, `current_price: float`, `sl: float`, `tp: float`, `profit: float`, `time: int`, `magic: int`.
  - `Signal` (lines 11-22): `symbol: str`, `direction: OrderType`, `confidence: float`, `source: str`, `timestamp: datetime`, `metadata: Dict[str, Any]`, `sl_pips: Optional[float]`, `tp_pips: Optional[float]`, `atr: Optional[float]`.
- **Order Flow & Execution (`application/engine.py`)**:
  - Order dispatch occurs in `_process_symbol_async()` (lines 337-346):
    ```python
    payload = {
        'symbol': symbol,
        'direction': validated_signal.direction,
        'volume': volume,
        'sl_price': sl_price,
        'tp_price': tp_price,
        'magic': self._symbol_to_magic(symbol),
        'metadata': validated_signal.metadata
    }
    await self.order_queue.put(payload)
    ```
  - Execution worker `_order_routing_worker()` (lines 526-578):
    ```python
    result = await asyncio.to_thread(
        self.connector.execute_order,
        payload['symbol'],
        payload['direction'],
        payload['volume'],
        payload['sl_price'],
        payload['tp_price'],
        payload['magic']
    )
    if result:
        logging.info(f"[Engine] ✅ Ordre exécuté ! Ticket: {result['ticket']} | Prix: {result['price']} | Volume: {result['volume']}")
        # MiFID II Audit Trail (lines 559-568)
    ```
  - Exact hook point for "New Position Opened": Inside `_order_routing_worker()` right after `if result:` (line 547).

### 1.5 Trade Close Detection & Reason Inference (TP / SL / Manual)
- **MT5 History Deals**:
  - In `infrastructure/mt5_connector.py:79`: `get_history_deals(from_date, to_date)` calls `mt5.history_deals_get(from_date, to_date)`.
  - In `application/engine.py:385-402` (`_refresh_kelly_history`):
    ```python
    deals = self.connector.get_history_deals(from_date, to_date)
    if deals is None:
        return
    closed = []
    for d in deals:
        if d.profit != 0 and d.symbol != '':
            closed.append({
                'pnl': d.profit,
                'symbol': d.symbol,
                'ticket': d.ticket,
                'time': _dt.datetime.fromtimestamp(d.time),
                'volume': float(d.volume),
                'type': 'BUY' if d.type == mt5.DEAL_TYPE_BUY else 'SELL',
                'magic': getattr(d, 'magic', 0)
            })
    ```
  - In MetaTrader 5 Deal Records:
    - Closing deals have `deal.entry in (1, 2)` (where `1 = DEAL_ENTRY_OUT`, `2 = DEAL_ENTRY_INOUT`).
    - Net PnL is `deal.profit + getattr(deal, 'commission', 0.0) + getattr(deal, 'swap', 0.0)` (as verified in `api/server.py:204-208` and line 929).
    - Reason code is in `deal.reason`:
      - `mt5.DEAL_REASON_TP` (`5`): Position closed by Take Profit.
      - `mt5.DEAL_REASON_SL` (`4`): Position closed by Stop Loss.
      - `mt5.DEAL_REASON_CLIENT` (`0`): Position closed manually by client / user in MT5 terminal.
      - `mt5.DEAL_REASON_EXPERT` (`3`): Position closed programmatically via API (`/api/close_trade`) or KillSwitch.
      - `mt5.DEAL_REASON_SO` (`6`): Stop Out (margin call).
    - Deal comment inspection (`deal.comment.lower()`):
      - Strings containing `"[tp]"` or `"tp"` -> `"TP"`
      - Strings containing `"[sl]"` or `"sl"` -> `"SL"`
      - Otherwise -> `"Manual"` (or `"Bot Close"` / `"Kill Switch"`)

### 1.6 Daily Performance Metrics (PnL, Win Rate, Kelly Fraction)
- **Daily Realized & Unrealized PnL (`api/server.py:196-214`, `385-407`)**:
  - Today start: `now.replace(hour=0, minute=0, second=0, microsecond=0)`.
  - Deals retrieved: `_engine.connector.get_history_deals(today_start, now + timedelta(days=1))`.
  - Realized Daily PnL:
    ```python
    realized_daily = sum(
        d.profit + getattr(d, 'commission', 0.0) + getattr(d, 'swap', 0.0)
        for d in deals
        if d.type <= 1 and getattr(d, 'entry', 1) in (1, 2)
    )
    ```
  - Unrealized PnL: `sum(p.profit + getattr(p, 'commission', 0.0) + getattr(p, 'swap', 0.0) for p in _engine.state_manager.positions)`.
- **Win Rate & Kelly Fraction (`application/position_sizer.py`)**:
  - Class: `PositionSizer` (lines 18-200), instantiated in `Engine.__init__` line 49 as `self.position_sizer`.
  - Win Rate calculation (lines 78-79):
    ```python
    winners = [t for t in self._trade_history if t.get('pnl', 0) > 0]
    self._win_rate = len(winners) / len(self._trade_history)
    ```
    Exposed via property `position_sizer.win_rate`.
  - Kelly Fraction calculation (lines 91-120):
    ```python
    p = self._win_rate
    q = 1.0 - p
    b = self._rr_ratio
    raw_kelly = (p * b - q) / b
    raw_kelly = max(0.0, raw_kelly)
    fractional_kelly = raw_kelly * self.KELLY_FRACTION  # 0.25
    capped_kelly = min(max(fractional_kelly, 0.01), self.MAX_RISK_PCT)  # clamped between 1% and 2%
    return capped_kelly
    ```
    Exposed via method `position_sizer.compute_kelly_fraction()`.

---

## 2. Logic Chain

1. **Environment & Fail-Safe Fallback**:
   - `AppConfig` in `infrastructure/config.py` inherits from `pydantic_settings.BaseSettings`.
   - By adding `TELEGRAM_BOT_TOKEN: str = Field("")` and `TELEGRAM_CHAT_ID: str = Field("")` to `AppConfig`, Pydantic loads their values if present in `.env` or defaults to `""` if absent.
   - When the notifier checks `if not (Config.TELEGRAM_BOT_TOKEN and Config.TELEGRAM_CHAT_ID)`, it can safely set `self.enabled = False` and log a warning without throwing an exception or blocking the engine. This satisfies R1 and Acceptance Criteria 1 & 2.

2. **Hooking New Position Opened**:
   - In `application/engine.py`, `_order_routing_worker` (lines 526-578) processes orders placed on `self.order_queue`.
   - Line 547 checks `if result:`. At this moment, the broker has executed the order and returned `ticket`, `price`, and `volume`. The trade parameters (`symbol`, `direction`, `sl_price`, `tp_price`, `magic`, `metadata`) are readily available in `payload`.
   - Dispatching `notify_position_opened` at line 552 (before or alongside `audit_trail.log_order`) provides exact, non-blocking notification for newly opened positions.

3. **Hooking Position Closed with Reason Resolution**:
   - In `application/engine.py`, `_refresh_kelly_history` (lines 378-433) already polls `deals = self.connector.get_history_deals(from_date, to_date)` at every cycle.
   - Closed deals have `getattr(deal, 'entry', 1) in (1, 2)`.
   - Tracking previously alerted deal tickets (e.g. via an in-memory set `_alerted_deal_tickets` or checking `TradeRecord` database entries) isolates newly closed deals.
   - Inspecting `deal.reason` (`mt5.DEAL_REASON_TP` -> "TP", `mt5.DEAL_REASON_SL` -> "SL", `mt5.DEAL_REASON_CLIENT` -> "Manual", `mt5.DEAL_REASON_EXPERT` -> "Manual / Bot", `mt5.DEAL_REASON_SO` -> "Stop Out") and cross-referencing `deal.comment` resolves the exact closure reason.
   - Dispatching `notify_position_closed` at this point satisfies R2.

4. **Hooking Critical Events**:
   - **Kill-Switch**: In `agents/kill_switch.py:15`, `activate(self, reason: str)` is the single central point through which all kill-switch triggers pass (CircuitBreaker, SurveillanceAgent, API). Hooking `notify_critical_event(event_type="KILL_SWITCH", reason=reason, details=...)` right inside `KillSwitch.activate` guarantees 100% coverage of all kill-switch activations.
   - **MT5 Disconnection**: In `application/engine.py:149`, `self.state_manager.update_state()` is called. In `StateManager`, `_account_info` is set to `connector.get_account_info()`. If connection transitions from connected to disconnected (`was_connected and not is_connected`), `notify_critical_event(event_type="MT5_DISCONNECTED", ...)` is fired.
   - **Fatal Exceptions**: Handled in top-level try/except in `Engine._async_run_loop` and `SurveillanceAgent._monitor_loop`.

5. **Hooking Daily Summary**:
   - At midnight (00:00 UTC or broker midnight), the date rolls over.
   - In `_async_run_loop`, a simple date check (`current_date != self._last_daily_summary_date`) detects midnight rollover.
   - It computes:
     - Realized Daily PnL: Sum of net profit (`profit + commission + swap`) for today's closed deals.
     - Daily Win Rate: Count of winning deals / total deals closed today.
     - Kelly Fraction: Retrieved from `self.position_sizer.compute_kelly_fraction()`.
     - Balance & Equity: From `self.state_manager.account`.
   - Dispatches `notify_daily_summary(...)` and updates `_last_daily_summary_date = current_date`.

6. **Performance Isolation (Zero-Latency Guarantee)**:
   - The notification dispatcher must NOT perform synchronous HTTP requests in `_async_run_loop` or `_order_routing_worker`.
   - Architecture:
     - The notifier maintains an internal async queue (`asyncio.Queue`) or worker thread queue.
     - Notifications are pushed using `queue.put_nowait(...)` which executes in microseconds (< 0.05ms, far below the 10ms threshold).
     - A dedicated background consumer worker handles formatting and sends HTTP requests to `https://api.telegram.org/bot<TOKEN>/sendMessage` with retries and timeout protection (e.g. 5s timeout).
     - Standard library `urllib.request` (or `aiohttp` / `httpx`) can be used, requiring no external package installation and ensuring resilience.

---

## 3. Caveats

1. **No External Network Calls in Read-Only Mode**: In this survey turn, no outbound HTTP calls to Telegram were executed, and no source files were modified.
2. **MT5 `deal.reason` Compatibility**: Different brokers may occasionally populate `deal.reason` differently for manual closing (some use `DEAL_REASON_CLIENT = 0`, some `DEAL_REASON_EXPERT = 3`). The schema incorporates comment checks (`"[sl]"`, `"[tp]"`) as a robust fallback.
3. **Multi-Broker Routing**: In `BrokerRouter`, if failover occurs between XM and Exness, the deals are queried on the active broker. The daily PnL collector should query deals from both connectors if a failover occurred during the day.

---

## 4. Conclusion & Precise Specifications

### 4.1 Integration Blueprint for Configuration
In `infrastructure/config.py`:
```python
# ── Telegram Notifications ────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN: str = Field("")
TELEGRAM_CHAT_ID: str = Field("")
```
In `.env` and `.env.example`:
```env
# Telegram Notifications
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

### 4.2 Exact Notification Payloads & Schemas

#### Event 1: Position Opened
**Schema (`PositionOpenedPayload`)**:
| Field | Type | Description | Example |
|---|---|---|---|
| `ticket` | `int` | Order / position ticket | `12345678` |
| `symbol` | `str` | Trading pair / instrument | `"EURUSD"` |
| `direction` | `str` | `"BUY"` or `"SELL"` | `"BUY"` |
| `volume` | `float` | Lots executed | `0.10` |
| `open_price` | `float` | Execution price | `1.08520` |
| `sl` | `float` | Absolute Stop Loss price | `1.08320` |
| `tp` | `float` | Absolute Take Profit price | `1.08870` |
| `magic` | `int` | Magic number | `11001` |
| `ml_confidence` | `Optional[float]` | Model prediction confidence | `0.78` |
| `timestamp` | `datetime` | UTC timestamp | `2026-09-15 14:30:00` |

**Telegram Message Formatting (HTML / Markdown)**:
```text
🟢 <b>POSITION OPENED</b>
━━━━━━━━━━━━━━━━━━━━
<b>Symbol:</b> EURUSD
<b>Action:</b> BUY 0.10 lots
<b>Entry Price:</b> 1.08520
<b>Stop Loss:</b> 1.08320 (20.0 pips)
<b>Take Profit:</b> 1.08870 (35.0 pips)
<b>Ticket:</b> #12345678
<b>ML Confidence:</b> 78.0%
<b>Time:</b> 2026-09-15 14:30:00 UTC
━━━━━━━━━━━━━━━━━━━━
```

---

#### Event 2: Position Closed
**Schema (`PositionClosedPayload`)**:
| Field | Type | Description | Example |
|---|---|---|---|
| `ticket` | `int` | Position ticket | `12345678` |
| `deal_ticket` | `int` | Deal ticket | `87654321` |
| `symbol` | `str` | Trading pair | `"EURUSD"` |
| `direction` | `str` | `"BUY"` or `"SELL"` | `"BUY"` |
| `volume` | `float` | Lots closed | `0.10` |
| `open_price` | `Optional[float]` | Original entry price | `1.08520` |
| `close_price` | `float` | Exit price | `1.08870` |
| `profit` | `float` | Net realized profit/loss in $ | `+35.00` |
| `reason` | `str` | `"TP"`, `"SL"`, `"Manual"`, or `"Stop Out"` | `"TP"` |
| `close_time` | `datetime` | UTC timestamp | `2026-09-15 15:15:00` |

**Telegram Message Formatting**:
```text
🔴 <b>POSITION CLOSED</b>
━━━━━━━━━━━━━━━━━━━━
<b>Symbol:</b> EURUSD (BUY)
<b>Result:</b> 🟢 +$35.00 (+35.0 pips)
<b>Close Reason:</b> 🎯 Take Profit (TP)
<b>Exit Price:</b> 1.08870
<b>Volume:</b> 0.10 lots
<b>Ticket:</b> #12345678
<b>Time:</b> 2026-09-15 15:15:00 UTC
━━━━━━━━━━━━━━━━━━━━
```

---

#### Event 3: Critical Events (Kill-Switch, Disconnection, Fatal Exception)
**Schema (`CriticalEventPayload`)**:
| Field | Type | Description | Example |
|---|---|---|---|
| `event_type` | `str` | `"KILL_SWITCH"`, `"MT5_DISCONNECTED"`, `"FATAL_EXCEPTION"` | `"KILL_SWITCH"` |
| `severity` | `str` | `"CRITICAL"`, `"HIGH"`, `"EMERGENCY"` | `"CRITICAL"` |
| `reason` | `str` | Cause or trigger description | `"MAX_DAILY_LOSS_REACHED"` |
| `details` | `Dict[str, Any]` | Context (drawdown %, open positions closed, error traceback) | `{"drawdown_pct": 10.2, "positions_closed": 3}` |
| `timestamp` | `datetime` | UTC timestamp | `2026-09-15 16:00:00` |

**Telegram Message Formatting (Kill-Switch Example)**:
```text
🚨 <b>CRITICAL ALERT: KILL-SWITCH ACTIVATED</b> 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Status:</b> EMERGENCY HALT
<b>Reason:</b> MAX_DAILY_LOSS_REACHED
<b>Drawdown:</b> 10.2% (Max Allowed: 10.0%)
<b>Action Taken:</b> All open positions closed immediately. Trading loop halted.
<b>Timestamp:</b> 2026-09-15 16:00:00 UTC
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ <i>Manual intervention required to reset the engine.</i>
```

**Telegram Message Formatting (MT5 Disconnection Example)**:
```text
⚠️ <b>CRITICAL ALERT: BROKER DISCONNECTED</b> ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Broker:</b> XM Global (Primary)
<b>Status:</b> Connection Lost (No IPC response)
<b>Action:</b> Switching to Fallback / Halting new orders
<b>Timestamp:</b> 2026-09-15 16:05:00 UTC
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

#### Event 4: Daily Performance Summary (Midnight / End of Day)
**Schema (`DailySummaryPayload`)**:
| Field | Type | Description | Example |
|---|---|---|---|
| `date` | `str` | Reporting date (`YYYY-MM-DD`) | `"2026-09-15"` |
| `total_trades` | `int` | Number of trades closed today | `8` |
| `winning_trades` | `int` | Winning trades today | `6` |
| `losing_trades` | `int` | Losing trades today | `2` |
| `daily_win_rate` | `float` | Daily win rate percentage | `75.0` |
| `realized_pnl` | `float` | Total realized PnL today in $ | `+245.50` |
| `unrealized_pnl` | `float` | Current open floating PnL | `-12.30` |
| `net_daily_pnl` | `float` | Realized + Unrealized | `+233.20` |
| `daily_return_pct` | `float` | Net PnL / Start Balance % | `+2.33` |
| `kelly_fraction` | `float` | Optimal Kelly fraction applied | `0.015` (1.5%) |
| `ending_balance` | `float` | Account balance | `10245.50` |
| `ending_equity` | `float` | Account equity | `10233.20` |

**Telegram Message Formatting**:
```text
📊 <b>MARKETSHIFT DAILY SUMMARY — 2026-09-15</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Daily PnL:</b> 🟢 +$245.50 (+2.33%)
<b>Floating PnL:</b> -$12.30
<b>Trades Today:</b> 8 (6 Win / 2 Loss)
<b>Daily Win Rate:</b> 75.0%
<b>Kelly Fraction:</b> 1.5% capital / trade
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Account Balance:</b> $10,245.50
<b>Account Equity:</b>  $10,233.20
<b>System Status:</b>  Online & Optimal 🚀
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 4.3 Component Mapping Index

| Component / Responsibility | File Path | Class Name | Methods / Attributes | Hook Location |
|---|---|---|---|---|
| **Configuration** | `infrastructure/config.py` | `AppConfig` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Model fields (lines 6-45) |
| **Kill-Switch** | `agents/kill_switch.py` | `KillSwitch` | `activate(reason)`, `is_triggered` | Line 14 inside `activate()` |
| **Circuit Breaker** | `agents/circuit_breaker.py` | `CircuitBreaker` | `check() -> bool` | Line 31 calling `kill_switch.activate()` |
| **Surveillance Agent** | `monitoring/surveillance_agent.py` | `SurveillanceAgent` | `_monitor_loop()` | Line 44 calling `kill_switch.activate()` |
| **Broker Connector** | `infrastructure/mt5_connector.py` | `MT5Connector` | `connected`, `get_account_info()`, `close_position()` | Lines 21, 54, 172 |
| **Broker Router** | `infrastructure/broker_router.py` | `BrokerRouter` | `_switch_to_fallback()`, `get_account_info()` | Lines 46, 57 |
| **State Manager** | `application/state_manager.py` | `StateManager` | `update_state()`, `account`, `positions` | Line 13 `update_state()` |
| **Core Engine** | `application/engine.py` | `Engine` | `_order_routing_worker()`, `_refresh_kelly_history()`, `_async_run_loop()` | Line 551 (Open), Line 405 (Close), Line 150 (Disconnection & Daily) |
| **Position Sizer** | `application/position_sizer.py` | `PositionSizer` | `win_rate`, `compute_kelly_fraction()`, `_trade_history` | Lines 91-120, 190 |
| **Audit Trail** | `utils/audit_trail.py` | `AuditTrail` | `log_order(order_data)` | Line 30 |

---

## 5. Verification Method

To independently verify the survey findings:

1. **Verify Configuration Loading & Fallback**:
   - Inspect `infrastructure/config.py` to confirm `pydantic_settings.BaseSettings` and `SettingsConfigDict` usage.
   - Run Python in the workspace virtualenv:
     ```python
     from infrastructure.config import AppConfig
     cfg = AppConfig()
     assert hasattr(cfg, "model_config")
     ```
   - Check that `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` can be initialized with default `""` without crashing if `.env` does not specify them.

2. **Verify Kill-Switch Hook Location**:
   - Inspect `agents/kill_switch.py:9-16`: verify that calling `KillSwitch.activate(reason)` is the single entry point for all emergency closures across `CircuitBreaker`, `SurveillanceAgent`, and `api/server.py`.

3. **Verify Order Execution & Position Opened Hook**:
   - Inspect `application/engine.py:537-569`: verify that `_order_routing_worker` executes the trade and obtains the result (`ticket`, `price`, `volume`) asynchronously, with all order parameters in `payload`.

4. **Verify Position Close & Reason Extraction**:
   - Inspect `application/engine.py:385-405`: verify `connector.get_history_deals` retrieval.
   - Verify `api/server.py:204-208` and `928-932` for `deal.profit + deal.commission + deal.swap` net profit calculation and `entry in (1, 2)` filtering.

5. **Verify Performance Isolation (< 10ms benchmark)**:
   - A standalone benchmark script can push 1,000 alert payloads into the asynchronous alert queue and measure execution time per call:
     ```python
     import time, asyncio
     queue = asyncio.Queue()
     start = time.perf_counter()
     queue.put_nowait({"type": "TEST"})
     elapsed_ms = (time.perf_counter() - start) * 1000.0
     assert elapsed_ms < 10.0
     ```
