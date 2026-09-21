# Milestone 2 Investigation Report: Engine Event Hooks & Trade Lifecycle
**Agent**: `explorer_m2_1`  
**Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m2_1`  
**Target File**: `application/engine.py`  
**Parent Orchestrator**: `orchestrator_2` (`37865d3a-ef5b-4219-a235-789cd3dedba9`)  
**Date**: `2026-09-15T23:58:45Z`  

---

## 1. Observation

Direct examination of the repository source code yielded the following verbatim observations:

### 1.1 `infrastructure/telegram_notifier.py` API Contract
`TelegramNotifier` exposes the following thread-safe, non-blocking methods (`queue.put_nowait()`, latency < 0.05ms):
- Lines 389–432:
  ```python
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
  ```
- Lines 434–477:
  ```python
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
  ```
- Lines 479–506:
  ```python
  def notify_critical_event(
      self,
      event_type: str,
      reason: str,
      details: Optional[str] = None
  ) -> bool:
  ```
- Lines 508–556:
  ```python
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
  ```
- Lines 106–126 & 127–159: `start(self)` and `stop(self, timeout: float = 2.0)` lifecycle management methods.
- Lines 621–624: Global singleton instance `telegram_notifier = TelegramNotifier()`.

---

### 1.2 `application/engine.py` Observation Points

#### Point A: Engine Lifecycle & Initialization (`__init__`, `start`, `stop`)
- Lines 40–50:
  ```python
  class Engine:
      def __init__(self, connector: IBrokerConnector, db_session=None):
          self.connector     = connector
          self.state_manager = StateManager(connector)
          self.kill_switch   = KillSwitch(connector)
          self.circuit_breaker = CircuitBreaker(self.state_manager, self.kill_switch)
          self.db = db_session
          self.pretrade_validator = PreTradeValidator(db_session=self.db)
          self.dynamic_ts = DynamicTrailingStop()
          self.position_sizer = PositionSizer(db_session=self.db)
  ```
  *Observation*: `self.notifier` is currently missing from `Engine.__init__`. `KillSwitch` is instantiated without passing `notifier`. No deal tickets tracking (`_seen_deal_tickets`), date tracking (`_last_summary_date`), or disconnect state latching exists.
- Lines 103–116:
  ```python
      def start(self):
          # 1. Initialize MT5 in the MAIN thread (prevents deadlock)
          if not self.connector.connect():
              logging.error("[Engine] Échec de connexion au broker (Main Thread).")
              return
          self.running = True
          self._thread = threading.Thread(target=self._run_async_loop_thread, daemon=True)
          self._thread.start()
          self.ml_trainer.start_auto_retrain(self.connector, self.symbols)
          logging.info("[Engine] ✅ Démarré avec succès en mode Asyncio.")
  ```
  *Observation*: `self.notifier.start()` is not called; failure of `self.connector.connect()` logs an error but does not notify Telegram.
- Lines 118–126:
  ```python
      def _run_async_loop_thread(self):
          """Démarre la boucle d'événements asyncio dans le thread dédié."""
          if not self.connector.connect():
              logging.error("[Engine] Échec de connexion au broker dans le thread dédié.")
              self.running = False
              return
          asyncio.run(self._async_run_loop())
  ```
  *Observation*: Unhandled exceptions in `asyncio.run(self._async_run_loop())` crash the thread without notifying `FATAL_ERROR`.
- Lines 127–134:
  ```python
      def stop(self):
          self.running = False
          self.ml_trainer.stop()
          if self._thread:
              self._thread.join(timeout=5)
          self.connector.disconnect()
          logging.info("[Engine] ⛔ Arrêté.")
  ```
  *Observation*: `self.notifier.stop()` is not called upon engine shutdown.

---

#### Point B: Trade Open Hook (`_order_routing_worker`)
- Lines 525–572:
  ```python
      async def _order_routing_worker(self):
          """Worker asynchrone (Hummingbot-style). Dépile les ordres de la file et les exécute sans bloquer la boucle principale."""
          logging.info("[Engine] ⚡ Order Routing Worker démarré.")
          while self.running:
              try:
                  payload = await self.order_queue.get()
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
                      logging.info(
                          f"[Engine] ✅ Ordre exécuté ! Ticket: {result['ticket']} | "
                          f"Prix: {result['price']} | Volume: {result['volume']}"
                      )
                      try:
                          from utils.audit_trail import AuditTrail
                          if not hasattr(self, 'audit_trail'):
                              self.audit_trail = AuditTrail()
                          self.audit_trail.log_order({
                              'ticket': result['ticket'],
                              'symbol': payload['symbol'],
                              'direction': payload['direction'].name,
                              'volume': result['volume'],
                              'price': result['price'],
                              'sl': payload['sl_price'],
                              'tp': payload['tp_price'],
                              'ml_confidence': payload['metadata'].get('ml_confidence', 0.0)
                          })
                      except Exception as e:
                          logging.error(f"[Engine] Erreur AuditTrail : {e}")
                  self.order_queue.task_done()
              except asyncio.CancelledError:
                  break
              except Exception as e:
                  logging.error(f"[Engine] Erreur Order Routing Worker: {e}")
  ```
  *Observation*: When `result` is truthy, all required fields are accessible:
  - `symbol`: `payload['symbol']`
  - `direction`: `payload['direction'].name if hasattr(payload['direction'], 'name') else str(payload['direction'])`
  - `volume`: `float(result.get('volume', payload['volume']))`
  - `price`: `float(result['price'])`
  - `sl`: `float(payload.get('sl_price', 0.0))`
  - `tp`: `float(payload.get('tp_price', 0.0))`
  - `ticket`: `int(result['ticket'])`
  - `ml_confidence`: `float(payload.get('metadata', {}).get('ml_confidence'))` if present.
  Currently, NO call to `self.notifier.notify_trade_opened(...)` exists.

---

#### Point C: Trade Close Hook & Startup Anti-Spam (`_refresh_kelly_history`)
- Lines 378–433:
  ```python
      def _refresh_kelly_history(self):
          """Récupère l'historique réel MT5 pour alimenter le Kelly Criterion (Thread-Safe)."""
          try:
              import datetime as _dt
              from_date = _dt.datetime.now() - _dt.timedelta(days=60)
              to_date   = _dt.datetime.now() + _dt.timedelta(days=1)

              deals = self.connector.get_history_deals(from_date, to_date)
              if deals is None:
                  return

              closed = []
              for d in deals:
                  if d.profit != 0 and d.symbol != '':  # Ignorer les deals sans P&L et les dépôts
                      # --- CORRECTION ANOMALIE : GHOST LEDGER ---
                      closed.append({
                          'pnl': d.profit, 
                          'symbol': d.symbol, 
                          'ticket': d.ticket,
                          'time': _dt.datetime.fromtimestamp(d.time),
                          'volume': float(d.volume),
                          'type': 'BUY' if d.type == mt5.DEAL_TYPE_BUY else 'SELL',
                          'magic': getattr(d, 'magic', 0)
                      })

              if closed != self._closed_trades_cache:
                  self._closed_trades_cache = closed
                  self.position_sizer.update_history(closed)
                  ...
  ```
  *Observation*:
  1. `get_history_deals(from_date, to_date)` retrieves all MT5 deals from the last 60 days.
  2. Currently, every deal in history is looped through. If not tracked, on cold start the bot would spam Telegram with up to 60 days of historical deals!
  3. Deals in MT5 have:
     - `d.ticket`: unique deal ID.
     - `getattr(d, 'position_id', d.ticket)`: the original position ticket.
     - `getattr(d, 'entry', None)`: `0` (`DEAL_ENTRY_IN`), `1` (`DEAL_ENTRY_OUT`), `2` (`DEAL_ENTRY_INOUT`), `3` (`DEAL_ENTRY_OUT_BY`).
     - `d.reason`: MT5 deal execution reason integer (`0` Client, `1` Mobile, `2` Web, `3` Expert, `4` SL, `5` TP, `6` Stop Out).
     - `d.comment`: broker/EA comment string (often containing `"[sl]"`, `"[tp]"`, `"MarketShift Close"`).
     - `d.price`: exit execution price.
     - `d.profit`: realized PnL.
  4. There is currently no alert dispatch for closed trades.

---

#### Point D: Daily Summary Hook & Midnight Rollover (`_async_run_loop`)
- Lines 141–156:
  ```python
          while self.running:
              if self.kill_switch.is_triggered:
                  await asyncio.sleep(1)
                  continue

              start_time = time.time()
              self.state_manager.update_state()
              self.circuit_breaker.check()
              self._refresh_kelly_history()
  ```
  *Observation*:
  1. The main loop cycles every minute.
  2. `self.state_manager.update_state()` updates `self.state_manager.account` (providing `balance` and `equity`).
  3. `self.position_sizer` provides `win_rate` (line 190 of `position_sizer.py`) and `compute_kelly_fraction()` (line 91).
  4. Currently, no date tracking exists to detect midnight rollover (`date > _last_summary_date`), no PnL aggregation for the completed day, and no call to `self.notifier.notify_daily_summary(...)`.

---

## 2. Logic Chain

### 2.1 Engine Lifecycle & Dependency Injection
1. **Fact**: Multiple environments instantiate `Engine` (production via `main.py`, FastAPI via `api/server.py`, automated tests via `pytest`).
2. **Inference**: Adding `notifier: Optional[TelegramNotifier] = None` to `Engine.__init__` with default fallback to global `telegram_notifier` provides backward compatibility with zero breaking changes to existing callers while allowing mocks to be injected cleanly in unit tests.
3. **Inference**: Passing `notifier=self.notifier` to `KillSwitch(connector, notifier=self.notifier)` (with backward-compatible try/except) connects the critical events hook explored by `explorer_m2_2`.
4. **Inference**: Calling `self.notifier.start()` in `Engine.start()` guarantees the daemon worker is running, and `self.notifier.stop()` in `Engine.stop()` guarantees all pending alerts are flushed before process exit.

### 2.2 Trade Open Hook in `_order_routing_worker`
1. **Fact**: In lines 547–551, `result = await asyncio.to_thread(self.connector.execute_order, ...)` has succeeded. `result` contains `ticket`, `price`, `volume`.
2. **Fact**: `payload` contains `symbol`, `direction`, `sl_price`, `tp_price`, `metadata`.
3. **Fact**: `TelegramNotifier.notify_trade_opened` returns immediately in < 0.05ms via `queue.put_nowait()`.
4. **Inference**: Calling `self.notifier.notify_trade_opened(...)` right after the audit trail within a `try...except Exception as alert_err` block ensures:
   - All trade parameters are transmitted to Telegram in real time.
   - Any alert formatting or queue error is trapped without interrupting the trading order worker.

### 2.3 Trade Close Hook & Startup Anti-Spam in `_refresh_kelly_history`
1. **Fact**: MT5 historical deals are queried every ~60 seconds via `self.connector.get_history_deals(from_date, to_date)`.
2. **Fact**: On engine startup, `deals` contains up to 60 days of historical deals.
3. **Inference (Anti-Spam)**: By tracking `self._seen_deal_tickets: set = set()` and `self._deals_initialized: bool = False`:
   - On the first invocation (`not self._deals_initialized`), all deal tickets currently in `deals` are populated into `self._seen_deal_tickets`, and `self._deals_initialized` is set to `True`. Zero notifications are dispatched.
   - On all subsequent invocations, any deal whose `deal_ticket not in self._seen_deal_tickets` is identified as newly closed.
4. **Inference (Classification)**:
   - A closed deal has `symbol != ''` and (`d.profit != 0` or `getattr(d, 'entry', None) in (1, 2, 3)`).
   - The close reason can be classified by inspecting `d.reason` against MT5 constants and `d.comment` for tags (`"[tp]"`, `"[sl]"`).
   - In MT5 hedging mode, an exit deal (`DEAL_ENTRY_OUT = 1`) has `d.type` opposite to the opened position (closing a BUY is done by a SELL deal). If `d.entry == 1`, direction is `'BUY'` if `d.type == DEAL_TYPE_SELL` else `'SELL'`.
   - Dispatching `self.notifier.notify_trade_closed(...)` inside `_refresh_kelly_history` guarantees that **every closed trade is notified**, whether closed by TP, SL, Trailing Stop, Kill-Switch, or manual intervention.

### 2.4 Daily Summary Midnight Rollover in `_async_run_loop`
1. **Fact**: In `_async_run_loop`, each iteration updates `self.state_manager.account` and `self._refresh_kelly_history()`.
2. **Inference**: By comparing `datetime.date.today()` (or current UTC date) with `self._last_summary_date`:
   - When `current_date > self._last_summary_date`: midnight has elapsed.
   - The completed day is `completed_date = self._last_summary_date`.
   - Closed deals for that completed day are extracted from MT5 deals (or `self._closed_trades_cache`) spanning `combine(completed_date, time.min)` to `combine(completed_date, time.max)`.
   - `daily_pnl = sum(d.profit for d in day_deals)`.
   - `total_trades = len(day_deals)`.
   - `win_rate = self.position_sizer.win_rate`.
   - `kelly_fraction = self.position_sizer.compute_kelly_fraction()`.
   - `balance = self.state_manager.account.balance`, `equity = self.state_manager.account.equity`.
   - Call `self.notifier.notify_daily_summary(...)` and advance `self._last_summary_date = current_date`.
   - Adding a `force: bool = False` argument to `_check_daily_summary` allows deterministic verification in unit and integration tests.

---

## 3. Proposed Code Diffs for `application/engine.py`

### 3.1 Imports & Constructor (`Engine.__init__`)
```diff
--- a/application/engine.py
+++ b/application/engine.py
@@ -24,6 +24,7 @@ from risk.pretrade_validator import PreTradeValidator
 from risk.dynamic_trailing_stop import DynamicTrailingStop
 from core.interfaces import IBrokerConnector, OrderType, Signal
 from infrastructure.config import Config
+from infrastructure.telegram_notifier import TelegramNotifier, telegram_notifier
 
 from strategies.aggregator import SignalAggregator
 from strategies.ema_crossover import EMACrossoverStrategy
@@ -38,12 +39,23 @@ from ml.predictor import MLPredictor
 
 
 class Engine:
-    def __init__(self, connector: IBrokerConnector, db_session=None):
+    def __init__(
+        self,
+        connector: IBrokerConnector,
+        db_session=None,
+        notifier: Optional[TelegramNotifier] = None
+    ):
         self.connector     = connector
+        self.notifier: TelegramNotifier = notifier if notifier is not None else telegram_notifier
         self.state_manager = StateManager(connector)
-        self.kill_switch   = KillSwitch(connector)
+        try:
+            self.kill_switch = KillSwitch(connector, notifier=self.notifier)
+        except TypeError:
+            self.kill_switch = KillSwitch(connector)
+            if hasattr(self.kill_switch, 'notifier'):
+                self.kill_switch.notifier = self.notifier
         self.circuit_breaker = CircuitBreaker(self.state_manager, self.kill_switch)
         self.db = db_session
         self.pretrade_validator = PreTradeValidator(db_session=self.db)
         self.dynamic_ts = DynamicTrailingStop()
         self.position_sizer = PositionSizer(db_session=self.db)
@@ -95,6 +107,15 @@ class Engine:
         # Historique des trades fermés (pour le Kelly Criterion)
         self._closed_trades_cache = None  # Force l'update au premier cycle
         
+        # Suivi des tickets de deals pour éviter les spams de clôture au démarrage
+        self._seen_deal_tickets: set = set()
+        self._deals_initialized: bool = False
+
+        # Suivi de la date pour le résumé journalier (rollover minuit)
+        self._last_summary_date: Optional[datetime.date] = datetime.date.today()
+        # Anti-spam alerte déconnexion MT5
+        self._broker_disconnected_alerted: bool = False
+
         # Anti-spam des signaux (un seul signal par bougie par symbole)
         self._last_signal_candle: Dict[str, datetime.datetime] = {}
```

---

### 3.2 Lifecycle Hooks (`start`, `stop`, `_run_async_loop_thread`)
```diff
@@ -103,9 +124,18 @@ class Engine:
     def start(self):
+        # Démarrer le notificateur Telegram
+        if self.notifier and hasattr(self.notifier, 'start'):
+            self.notifier.start()
+
         # 1. Initialize MT5 in the MAIN thread (prevents deadlock)
         if not self.connector.connect():
             logging.error("[Engine] Échec de connexion au broker (Main Thread).")
+            if self.notifier:
+                self.notifier.notify_critical_event(
+                    "MT5_DISCONNECT",
+                    "Échec de connexion au broker MT5 (Main Thread)"
+                )
             return
             
         self.running = True
@@ -118,10 +148,27 @@ class Engine:
     def _run_async_loop_thread(self):
         """Démarre la boucle d'événements asyncio dans le thread dédié."""
-        if not self.connector.connect():
-            logging.error("[Engine] Échec de connexion au broker dans le thread dédié.")
-            self.running = False
-            return
-            
-        asyncio.run(self._async_run_loop())
+        try:
+            if not self.connector.connect():
+                logging.error("[Engine] Échec de connexion au broker dans le thread dédié.")
+                if self.notifier:
+                    self.notifier.notify_critical_event(
+                        "MT5_DISCONNECT",
+                        "Échec de connexion au broker dans le thread dédié"
+                    )
+                self.running = False
+                return
+                
+            asyncio.run(self._async_run_loop())
+        except Exception as e:
+            logging.critical(f"[Engine] Erreur fatale dans la boucle asynchrone: {e}", exc_info=True)
+            if self.notifier:
+                self.notifier.notify_critical_event(
+                    "FATAL_ERROR",
+                    reason=f"Boucle de trading asynchrone interrompue : {e}",
+                    details=str(e)
+                )
+            self.running = False
 
     def stop(self):
         self.running = False
@@ -129,6 +176,9 @@ class Engine:
         if self._thread:
             self._thread.join(timeout=5)
         self.connector.disconnect()
+        # Arrêt propre du notificateur Telegram
+        if self.notifier and hasattr(self.notifier, 'stop'):
+            self.notifier.stop()
         logging.info("[Engine] ⛔ Arrêté.")
```

---

### 3.3 Main Loop Broker Watchdog & Daily Summary (`_async_run_loop`)
```diff
@@ -141,6 +191,22 @@ class Engine:
         while self.running:
             if self.kill_switch.is_triggered:
                 await asyncio.sleep(1)
                 continue
 
+            # Surveillance de connectivité Broker / Compte avec latch anti-spam
+            broker_connected = getattr(self.connector, 'connected', True)
+            account_available = self.state_manager.account is not None
+            if not broker_connected or not account_available:
+                if not self._broker_disconnected_alerted:
+                    logging.warning("[Engine] Alerte: Déconnexion du terminal MT5 ou compte indisponible.")
+                    if self.notifier:
+                        self.notifier.notify_critical_event(
+                            "MT5_DISCONNECT",
+                            "Déconnexion du broker MT5 ou compte de trading inaccessible"
+                        )
+                    self._broker_disconnected_alerted = True
+            else:
+                if self._broker_disconnected_alerted:
+                    logging.info("[Engine] Connexion au broker MT5 rétablie.")
+                    self._broker_disconnected_alerted = False
+
             start_time = time.time()
@@ -153,6 +219,9 @@ class Engine:
             # Mise à jour du Kelly Criterion avec les trades fermés
             self._refresh_kelly_history()
 
+            # Vérification du passage à minuit (Daily Summary Telegram)
+            self._check_daily_summary()
+
             # ── Exécution Parallèle (Zero Latency) ────────────────────────────
```

---

### 3.4 Trade Close Hook & Classifier Helper (`_refresh_kelly_history`)
```diff
@@ -378,6 +447,40 @@ class Engine:
+    def _classify_deal_close_reason(self, deal) -> str:
+        """Classifie le motif de clôture d'un deal MT5 (SL, TP, Manuel, EA, Stop Out)."""
+        comment = str(getattr(deal, 'comment', '')).lower()
+        reason = getattr(deal, 'reason', None)
+
+        # 1. Take Profit (DEAL_REASON_TP = 5 ou mention [tp])
+        if reason == getattr(mt5, 'DEAL_REASON_TP', 5) or "[tp]" in comment or " tp" in comment:
+            return "Take Profit (TP)"
+            
+        # 2. Stop Loss (DEAL_REASON_SL = 4 ou mention [sl])
+        if reason == getattr(mt5, 'DEAL_REASON_SL', 4) or "[sl]" in comment or " sl" in comment:
+            return "Stop Loss (SL)"
+            
+        # 3. Stop Out (DEAL_REASON_SO = 6 ou mention so/stop out)
+        if reason == getattr(mt5, 'DEAL_REASON_SO', 6) or "stop out" in comment or "so:" in comment:
+            return "Stop Out (Margin Call)"
+            
+        # 4. Clôture Manuelle par l'utilisateur (DEAL_REASON_CLIENT = 0, MOBILE = 1, WEB = 2)
+        if reason == getattr(mt5, 'DEAL_REASON_CLIENT', 0) or "client" in comment or "manual" in comment:
+            return "Manual / Client"
+        if reason == getattr(mt5, 'DEAL_REASON_MOBILE', 1):
+            return "Manual / Mobile"
+        if reason == getattr(mt5, 'DEAL_REASON_WEB', 2):
+            return "Manual / Web"
+            
+        # 5. Clôture par le Bot ou Script (DEAL_REASON_EXPERT = 3 ou commentaire bot)
+        if reason == getattr(mt5, 'DEAL_REASON_EXPERT', 3) or "marketshift" in comment or "expert" in comment:
+            return "Expert Advisor (EA)"
+            
+        return "Closed / Market"
+
     def _refresh_kelly_history(self):
-        """Récupère l'historique réel MT5 pour alimenter le Kelly Criterion (Thread-Safe)."""
+        """Récupère l'historique réel MT5 pour alimenter le Kelly Criterion et notifier les clôtures (Thread-Safe)."""
         try:
             import datetime as _dt
             from_date = _dt.datetime.now() - _dt.timedelta(days=60)
             to_date   = _dt.datetime.now() + _dt.timedelta(days=1)
 
             deals = self.connector.get_history_deals(from_date, to_date)
             if deals is None:
                 return
 
+            # Étape 1 : Initialisation sans spam au premier appel
+            is_initial_run = not self._deals_initialized
+            if is_initial_run:
+                for d in deals:
+                    t = getattr(d, 'ticket', None)
+                    if t is not None:
+                        self._seen_deal_tickets.add(t)
+                self._deals_initialized = True
+                logging.info(f"[Engine] Historique des deals initialisé ({len(self._seen_deal_tickets)} tickets enregistrés sans alerte).")
+
             closed = []
+            new_closed_deals = []
             for d in deals:
                 if d.profit != 0 and d.symbol != '':  # Ignorer les deals sans P&L et les dépôts
                     # --- CORRECTION ANOMALIE : GHOST LEDGER ---
+                    d_time = getattr(d, 'time', None)
+                    parsed_time = _dt.datetime.fromtimestamp(d_time) if isinstance(d_time, (int, float)) else (d_time or _dt.datetime.now())
                     closed.append({
-                        'pnl': d.profit, 
-                        'symbol': d.symbol, 
-                        'ticket': d.ticket, 
-                        'time': _dt.datetime.fromtimestamp(d.time),
+                        'pnl': float(d.profit), 
+                        'symbol': str(d.symbol), 
+                        'ticket': int(d.ticket), 
+                        'time': parsed_time,
                         'volume': float(d.volume),
                         'type': 'BUY' if d.type == mt5.DEAL_TYPE_BUY else 'SELL',
                         'magic': getattr(d, 'magic', 0)
                     })
+
+                # Détection des nouveaux deals clôturés pour notification Telegram
+                deal_ticket = getattr(d, 'ticket', None)
+                if not is_initial_run and deal_ticket is not None and deal_ticket not in self._seen_deal_tickets:
+                    self._seen_deal_tickets.add(deal_ticket)
+                    is_close_deal = (
+                        getattr(d, 'symbol', '') != '' and
+                        (getattr(d, 'profit', 0) != 0 or getattr(d, 'entry', None) in (1, 2, 3))
+                    )
+                    if is_close_deal:
+                        new_closed_deals.append(d)
+
+            # Étape 2 : Notification Telegram des positions clôturées
+            if self.notifier and new_closed_deals:
+                for d in new_closed_deals:
+                    try:
+                        if getattr(d, 'entry', None) == 1:
+                            direction = 'BUY' if getattr(d, 'type', 1) == getattr(mt5, 'DEAL_TYPE_SELL', 1) else 'SELL'
+                        else:
+                            if isinstance(getattr(d, 'type', None), str):
+                                direction = d.type
+                            else:
+                                direction = 'BUY' if getattr(d, 'type', 0) == getattr(mt5, 'DEAL_TYPE_BUY', 0) else 'SELL'
+
+                        ticket_id = getattr(d, 'position_id', 0) or getattr(d, 'ticket', 0)
+                        close_reason = self._classify_deal_close_reason(d)
+                        close_price = float(d.price) if getattr(d, 'price', None) is not None else None
+
+                        self.notifier.notify_trade_closed(
+                            ticket=int(ticket_id),
+                            symbol=str(d.symbol),
+                            direction=direction,
+                            volume=float(d.volume),
+                            profit=float(d.profit),
+                            reason=close_reason,
+                            close_price=close_price
+                        )
+                    except Exception as alert_err:
+                        logging.error(f"[Engine] Erreur notification deal #{getattr(d, 'ticket', '?')}: {alert_err}")
```

---

### 3.5 Daily Summary Helper (`_check_daily_summary`)
```python
    def _check_daily_summary(self, current_dt: Optional[datetime.datetime] = None, force: bool = False) -> bool:
        """
        Détecte le passage à minuit (date rollover) et dispatche le résumé journalier.
        
        :param current_dt: Horodatage de référence (défaut: datetime.now()).
        :param force: Si True, force l'envoi immédiat même sans changement de date (pour tests).
        :return: True si un résumé a été dispatched, False sinon.
        """
        try:
            if current_dt is None:
                current_dt = datetime.datetime.now()

            current_date = current_dt.date() if isinstance(current_dt, datetime.datetime) else current_dt

            if self._last_summary_date is None:
                self._last_summary_date = current_date
                return False

            if current_date > self._last_summary_date or force:
                completed_date = self._last_summary_date if not force else current_date
                date_str = completed_date.strftime("%Y-%m-%d")

                start_of_day = datetime.datetime.combine(completed_date, datetime.time.min)
                end_of_day = datetime.datetime.combine(completed_date, datetime.time.max)

                daily_pnl = 0.0
                total_trades = 0

                deals = None
                try:
                    deals = self.connector.get_history_deals(start_of_day, end_of_day)
                except Exception as deals_err:
                    logging.warning(f"[Engine] get_history_deals non disponible pour daily summary: {deals_err}")

                if deals is not None:
                    for d in deals:
                        if getattr(d, 'symbol', '') != '' and (getattr(d, 'profit', 0) != 0 or getattr(d, 'entry', None) in (1, 2, 3)):
                            daily_pnl += float(getattr(d, 'profit', 0.0))
                            total_trades += 1
                elif self._closed_trades_cache:
                    for t in self._closed_trades_cache:
                        t_time = t.get('time')
                        if t_time:
                            t_date = t_time.date() if isinstance(t_time, datetime.datetime) else t_time
                            if t_date == completed_date:
                                daily_pnl += float(t.get('pnl', 0.0))
                                total_trades += 1

                win_rate = float(getattr(self.position_sizer, 'win_rate', 0.0))
                try:
                    kelly_fraction = float(self.position_sizer.compute_kelly_fraction())
                except Exception:
                    kelly_fraction = 0.0

                account = self.state_manager.account
                balance = float(account.balance) if account and hasattr(account, 'balance') else 0.0
                equity = float(account.equity) if account and hasattr(account, 'equity') else 0.0

                logging.info(
                    f"[Engine] 📅 Rollover minuit détecté ({date_str}) : "
                    f"PnL={daily_pnl:.2f}, Trades={total_trades}, WinRate={win_rate:.1%}, "
                    f"Kelly={kelly_fraction:.4f}, Balance={balance:.2f}, Equity={equity:.2f}"
                )

                if self.notifier:
                    self.notifier.notify_daily_summary(
                        date_str=date_str,
                        daily_pnl=daily_pnl,
                        win_rate=win_rate,
                        kelly_fraction=kelly_fraction,
                        total_trades=total_trades,
                        balance=balance,
                        equity=equity
                    )

                self._last_summary_date = current_date
                return True

            return False

        except Exception as e:
            logging.error(f"[Engine] Erreur traitement daily summary: {e}")
            return False
```

---

### 3.6 Trade Open Hook in `_order_routing_worker`
```diff
@@ -547,6 +675,23 @@ class Engine:
                 if result:
                     logging.info(
                         f"[Engine] ✅ Ordre exécuté ! Ticket: {result['ticket']} | "
                         f"Prix: {result['price']} | Volume: {result['volume']}"
                     )
                     
                     # Trace d'Audit MiFID II
                     try:
@@ -569,6 +714,24 @@ class Engine:
                     except Exception as e:
                         logging.error(f"[Engine] Erreur AuditTrail : {e}")
 
+                    # Alerte Telegram Trade Opened (Non-bloquante < 0.05ms)
+                    try:
+                        if self.notifier:
+                            dir_name = payload['direction'].name if hasattr(payload['direction'], 'name') else str(payload['direction'])
+                            metadata = payload.get('metadata') or {}
+                            ml_conf = metadata.get('ml_confidence')
+                            self.notifier.notify_trade_opened(
+                                symbol=str(payload['symbol']),
+                                direction=str(dir_name),
+                                volume=float(result.get('volume', payload.get('volume', 0.0))),
+                                price=float(result['price']),
+                                sl=float(payload.get('sl_price', 0.0)),
+                                tp=float(payload.get('tp_price', 0.0)),
+                                ticket=int(result['ticket']),
+                                ml_confidence=float(ml_conf) if ml_conf is not None else None
+                            )
+                    except Exception as alert_err:
+                        logging.error(f"[Engine] Erreur notification trade opened: {alert_err}")
+
                 self.order_queue.task_done()
```

---

## 4. Caveats
1. **Timezone Handling**: Deals recorded in MT5 store timestamps `d.time` as UNIX seconds (epoch), which `datetime.fromtimestamp()` parses into naive datetime. The daily summary logic combines `completed_date` with `datetime.time.min` / `max` using naive timestamps, ensuring exact alignment with MT5 timestamps.
2. **Hedging Direction Inversion**: In MT5 hedging accounts, when a position is closed, the closing deal record (`DEAL_ENTRY_OUT = 1`) contains `d.type` opposite to the opened position. The classifier checks `if d.entry == 1: direction = 'BUY' if d.type == DEAL_TYPE_SELL else 'SELL'`, preserving user-expected position direction in the Telegram alert.
3. **Fail-Safe Operation**: If `notifier` is unconfigured (empty credentials), every `notify_*` call returns `False` in < 0.001ms without throwing any exceptions, adhering strictly to Acceptance Criteria §Integration & Resilience.

---

## 5. Conclusion
1. All four target areas in `application/engine.py` (Trade Open Hook, Trade Close Hook, Daily Summary Hook, and Engine Lifecycle Wiring) are thoroughly investigated and mapped to exact line ranges.
2. Performance isolation is guaranteed: all alert calls invoke `TelegramNotifier`'s in-memory FIFO queue, completing in < 0.05ms on the caller's thread, maintaining zero-latency trading execution.
3. Cold start alert spamming is prevented by latching existing deal tickets on the first cycle.
4. Close reason classification covers TP, SL, Stop Out, Manual/Client, and EA/Script actions.
5. Daily summary rollover reliably captures completed day performance metrics with full support for manual or automated unit testing.

---

## 6. Verification Method

### 6.1 Inspect Files
Verify that `application/engine.py` contains:
- `self.notifier: TelegramNotifier` initialized in `__init__`
- `self._seen_deal_tickets: set` initialized in `__init__`
- `self.notifier.notify_trade_opened(...)` in `_order_routing_worker`
- `self.notifier.notify_trade_closed(...)` in `_refresh_kelly_history`
- `self._check_daily_summary()` called in `_async_run_loop`

### 6.2 Test Commands
Run existing and new integration tests:
```powershell
pytest -v tests/test_telegram_notifier.py tests/test_telegram_integration.py
```

### 6.3 Invalidation Conditions
The proposed design is invalidated if:
- `notify_trade_opened` blocks the `_order_routing_worker` for > 1ms.
- Engine cold start triggers alerts for deals that occurred days or weeks ago.
- Date rollover fails to compute daily realized PnL from MT5 history deals.
- Missing credentials cause any unhandled exception or halt the engine loop.
