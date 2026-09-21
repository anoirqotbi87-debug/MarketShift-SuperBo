# Handoff Report — Critical Events & Risk Hooks (Milestone 2)

**Agent**: `explorer_m2_2`  
**Role**: Critical Events & Risk Hooks Explorer  
**Mission**: Investigate and design exact implementation strategies and code diffs for KillSwitch, BrokerRouter, Engine Fatal Errors, and Disconnect Latching hooks.  
**Parent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)  
**Date**: 2026-09-16T00:58:30Z  

---

## 1. Observation

### 1.1 `agents/kill_switch.py`
- **File inspected**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\agents\kill_switch.py` (lines 1–36).
- **Current Constructor**:
  ```python
  class KillSwitch:
      def __init__(self, connector: MT5Connector):
          self.connector = connector
          self.is_triggered = False
  ```
  Lacks `notifier` injection and has no thread synchronization mechanism (`threading.Lock()`).
- **Current `activate` method**:
  ```python
  def activate(self, reason: str):
      """Active l'arrêt d'urgence et ferme toutes les positions (Article 12 RTS 6)"""
      if self.is_triggered:
          return

      logging.critical(f"⚠️ KILL SWITCH ACTIVÉ ⚠️ Raison: {reason}")
      self.is_triggered = True
      self._close_all_positions()
  ```
  Does not dispatch any notification. If multiple threads call `activate` simultaneously (e.g. `SurveillanceAgent` watchdog thread, FastAPI `/api/kill-switch` worker, and `CircuitBreaker` in engine loop), race conditions can cause multiple concurrent liquidation routines and log spam.
- **Current `_close_all_positions` method**:
  ```python
  def _close_all_positions(self):
      """Ferme drastiquement toutes les positions ouvertes"""
      if not self.connector.connected:
          logging.error("KillSwitch: Impossible de fermer les positions, MT5 non connecté.")
          return

      positions = self.connector.get_positions()
      for pos in positions:
          success = self.connector.close_position(pos.ticket)
          ...
  ```
  Can raise an exception if connector is a mock without `connected` attribute or if `get_positions` fails.

### 1.2 `infrastructure/broker_router.py`
- **File inspected**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\infrastructure\broker_router.py` (lines 1–114).
- **Current Constructor**:
  ```python
  def __init__(self, primary: IBrokerConnector, fallback: IBrokerConnector):
      self.primary = primary
      self.fallback = fallback
      self._active_broker = self.primary
      self.connected = False
  ```
  Lacks `notifier` injection and lock protection for failover state switches.
- **Current `connect` method**:
  ```python
  def connect(self) -> bool:
      primary_ok = self.primary.connect()
      if primary_ok:
          self._active_broker = self.primary
          self.connected = True
          logging.info("[Router] Connecté au courtier PRIMAIRE avec succès.")
          return True
          
      logging.warning("[Router] ⚠️ Primaire injoignable, tentative de connexion au FALLBACK.")
      fallback_ok = self.fallback.connect()
      if fallback_ok:
          self._active_broker = self.fallback
          self.connected = True
          logging.info("[Router] ✅ Connecté au courtier FALLBACK avec succès.")
          return True
          
      logging.error("[Router] ❌ Échec critique : Primaire et Fallback injoignables.")
      self.connected = False
      return False
  ```
  When primary is unreachable and fallback succeeds, no notification is dispatched. When both fail, no critical event is dispatched.
- **Current `_switch_to_fallback` method**:
  ```python
  def _switch_to_fallback(self) -> bool:
      """Tente de basculer sur le courtier de secours."""
      logging.warning("[Router] 🔄 Tentative de bascule (Failover) vers le courtier Fallback...")
      if not getattr(self.fallback, 'connected', False):
          if not self.fallback.connect():
              logging.error("[Router] ❌ Échec du Failover : Fallback injoignable.")
              return False
              
      self._active_broker = self.fallback
      logging.info("[Router] ✅ Failover réussi. Trafic routé vers le Fallback.")
      return True
  ```
  No lock protecting against concurrent failovers, and no alerts on failover success or total failover failure.

### 1.3 `application/engine.py`
- **File inspected**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\application\engine.py` (lines 40–188).
- **Current `_run_async_loop_thread`**:
  ```python
  def _run_async_loop_thread(self):
      """Démarre la boucle d'événements asyncio dans le thread dédié."""
      if not self.connector.connect():
          logging.error("[Engine] Échec de connexion au broker dans le thread dédié.")
          self.running = False
          return
          
      asyncio.run(self._async_run_loop())
  ```
  If `asyncio.run(self._async_run_loop())` crashes from an unhandled exception, it terminates silently without notifying Telegram or operators.
- **Current `_async_run_loop`**:
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
  Does not check whether `self.connector.connected` or `self.state_manager.account` is missing. If connection drops, it will continue cycling every minute, potentially spamming errors in indicators/validator without alerting operators via Telegram.

### 1.4 `monitoring/surveillance_agent.py`
- **File inspected**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\monitoring\surveillance_agent.py` (lines 38–64).
- In `_monitor_loop()`:
  ```python
  if not self.engine._thread.is_alive():
      logging.critical("[SurveillanceAgent] 🚨 L'Event Loop asynchrone de l'Engine a crashé silencieusement ! Activation du Kill Switch.")
      self.kill_switch.activate("Crash de l'Engine Thread")
      self.engine.running = False
      break
  ```
  The watchdog calls `self.kill_switch.activate("Crash de l'Engine Thread")`. If `KillSwitch.activate` is the centralized alert point, this call will automatically trigger the critical event.

### 1.5 `infrastructure/telegram_notifier.py`
- **File inspected**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\infrastructure\telegram_notifier.py` (lines 480–507, 604–624).
- Method signature:
  ```python
  def notify_critical_event(
      self,
      event_type: str,
      reason: str,
      details: Optional[str] = None
  ) -> bool
  ```
  Non-blocking queue ingestion (`queue.put_nowait`), execution latency < 0.05ms, thread-safe, fail-safe when disabled. Singleton instance exported as `telegram_notifier`.

---

## 2. Logic Chain

1. **Kill-Switch Centralization**:
   - Multiple autonomous components can trigger emergency stops: `SurveillanceAgent` (watchdog), `CircuitBreaker` (drawdown threshold), `FastAPI` endpoint (`/api/kill-switch`), or manual CLI.
   - If each caller attempted its own alert dispatch, code would be duplicated and risk race conditions / duplicate alerts.
   - Placing the notification hook directly inside `KillSwitch.activate(reason: str)` guarantees that ANY activation will trigger a Telegram alert exactly once.
   - Adding `self._lock = threading.Lock()` guarantees thread safety across concurrent calls. The first entering thread acquires the lock, sets `self.is_triggered = True`, dispatches the notification, and liquidates positions. Subsequent threads wait and return immediately on `if self.is_triggered: return`.

2. **Alert Before vs. After Liquidation**:
   - Calling `self.notifier.notify_critical_event(...)` before `self._close_all_positions()` is optimal because:
     a) `notify_critical_event` puts an item in memory queue in < 0.05ms, introducing zero measurable latency into the liquidation routine.
     b) If MT5 freezes or disconnects during `_close_all_positions()`, the critical alert has ALREADY been enqueued and dispatched to the operator.
     c) The number of open positions can be counted prior to liquidation (`len(self.connector.get_positions())`), providing accurate details in the alert message (`"Emergency liquidation triggered: X positions closed"`).

3. **Broker Disconnect & Failover**:
   - In `BrokerRouter.connect()`, if primary fails and fallback connects, the system is operational but degraded. Notifying with `event_type="BROKER_FAILOVER"` alerts operators that primary is offline.
   - If both primary and fallback fail to connect, trading is impossible. Notifying with `event_type="MT5_DISCONNECT"`, `reason="Primary and fallback brokers unreachable"` informs operators immediately.
   - In `BrokerRouter._switch_to_fallback()`, wrapping state switch with `with self._lock:` prevents race conditions. Dispatches `BROKER_FAILOVER` on successful switch or `MT5_DISCONNECT` if fallback also fails.

4. **Engine Fatal Error Handling**:
   - Wrapping `asyncio.run(self._async_run_loop())` in `try...except Exception as e:` inside `_run_async_loop_thread()` catches any fatal unhandled exception at top level.
   - Immediately dispatches `self.notifier.notify_critical_event("FATAL_ERROR", reason=f"Engine thread crashed: {e}", details=...)` and sets `self.running = False`.
   - Even if the thread terminates, the `SurveillanceAgent` watchdog will detect `not self.engine._thread.is_alive()` and trigger `kill_switch.activate("Crash de l'Engine Thread")` as a secondary safety net.

5. **Anti-Spam Disconnect Latching in `_async_run_loop()`**:
   - MT5 disconnections can last minutes or hours. Because `_async_run_loop()` runs every minute, checking `is_connected = bool(self.connector.connected and self.state_manager.account is not None)` without latching would dispatch an alert every 60 seconds (spamming the user).
   - Solution: A stateful latch `self._broker_disconnected_latched: bool = False`.
   - On first disconnect detection: latch is `False` -> set to `True`, dispatch `MT5_DISCONNECT` alert once, suspend symbol analysis (`await asyncio.sleep(5); continue`).
   - On subsequent disconnect cycles: latch is `True` -> skip notification, continue waiting.
   - On reconnection: `is_connected` becomes `True` -> reset `self._broker_disconnected_latched = False`, log restoration. If connection drops again in the future, a new single alert will fire for the new incident.

---

## 3. Caveats

1. **Connector Attribute Normalization**: Some test mocks may not define `connected` on connector objects. Code must use `getattr(self.connector, "connected", False)` to avoid `AttributeError`.
2. **Exception Containment**: Notification dispatches must be wrapped in `try...except` so that any unexpected issue in the notifier layer (e.g. queue full, bad type) never interferes with emergency liquidation or engine crash reporting.
3. **Surveillance Agent Redundancy**: `SurveillanceAgent` does NOT need to dispatch its own Telegram alert when triggering `KillSwitch`. The centralized `KillSwitch.activate` hook already covers this. Emitting an alert from `SurveillanceAgent` in addition would create confusing duplicate messages.
4. **Coordination with `explorer_m2_1`**: `explorer_m2_1` handles `_order_routing_worker` (trade open), `_refresh_kelly_history` (trade close), and midnight daily summary in `application/engine.py`. The edits to `Engine.__init__`, `start()`, `stop()`, `_run_async_loop_thread()`, and the connection check at top of `_async_run_loop()` defined here compose cleanly with `explorer_m2_1`'s work.

---

## 4. Conclusion & Proposed Code Changes

### Proposed Diff 1: `agents/kill_switch.py`

```python
--- a/agents/kill_switch.py
+++ b/agents/kill_switch.py
@@ -1,36 +1,65 @@
 import logging
-from infrastructure.mt5_connector import MT5Connector
+import threading
+from typing import Any, Optional
+from infrastructure.mt5_connector import MT5Connector
+
+try:
+    from infrastructure.telegram_notifier import TelegramNotifier, telegram_notifier
+except ImportError:
+    TelegramNotifier = None  # type: ignore
+    telegram_notifier = None  # type: ignore
 
 class KillSwitch:
-    def __init__(self, connector: MT5Connector):
+    def __init__(self, connector: Any, notifier: Optional[Any] = None):
         self.connector = connector
-        self.is_triggered = False
+        self.notifier = notifier if notifier is not None else telegram_notifier
+        self.is_triggered: bool = False
+        self._lock: threading.Lock = threading.Lock()
 
     def activate(self, reason: str):
-        """Active l'arrêt d'urgence et ferme toutes les positions (Article 12 RTS 6)"""
-        if self.is_triggered:
-            return
-
-        logging.critical(f"⚠️ KILL SWITCH ACTIVÉ ⚠️ Raison: {reason}")
-        self.is_triggered = True
-        self._close_all_positions()
+        """Active l'arrêt d'urgence et ferme toutes les positions (Article 12 RTS 6).
+        Thread-safe: protège contre les activations concurrentes (Watchdog, API, CircuitBreaker).
+        """
+        with self._lock:
+            if self.is_triggered:
+                return
+
+            self.is_triggered = True
+            logging.critical(f"⚠️ KILL SWITCH ACTIVÉ ⚠️ Raison: {reason}")
+
+            # Décompte des positions ouvertes avant liquidation
+            pos_count = 0
+            try:
+                if hasattr(self.connector, "get_positions"):
+                    positions = self.connector.get_positions()
+                    pos_count = len(positions) if positions else 0
+            except Exception as e:
+                logging.warning(f"KillSwitch: Impossible de décompter les positions: {e}")
+
+            # Dispatch de l'alerte critique Telegram (asynchrone, < 0.05ms)
+            if self.notifier:
+                try:
+                    self.notifier.notify_critical_event(
+                        "KILL_SWITCH",
+                        reason=reason,
+                        details=f"Emergency liquidation triggered: {pos_count} positions closed"
+                    )
+                except Exception as notif_err:
+                    logging.error(f"KillSwitch: Erreur dispatch notification: {notif_err}")
+
+            self._close_all_positions()
 
     def _close_all_positions(self):
-        """Ferme drastiquement toutes les positions ouvertes"""
-        if not self.connector.connected:
+        """Ferme drastiquement toutes les positions ouvertes."""
+        if not getattr(self.connector, "connected", False):
             logging.error("KillSwitch: Impossible de fermer les positions, MT5 non connecté.")
             return
 
-        positions = self.connector.get_positions()
-        for pos in positions:
-            success = self.connector.close_position(pos.ticket)
-            if success:
-                logging.info(f"KillSwitch: Position {pos.ticket} fermée avec succès.")
-            else:
-                logging.error(f"KillSwitch: ECHEC de la fermeture de la position {pos.ticket} !")
+        try:
+            positions = self.connector.get_positions()
+            for pos in positions:
+                success = self.connector.close_position(pos.ticket)
+                if success:
+                    logging.info(f"KillSwitch: Position {pos.ticket} fermée avec succès.")
+                else:
+                    logging.error(f"KillSwitch: ECHEC de la fermeture de la position {pos.ticket} !")
+        except Exception as e:
+            logging.error(f"KillSwitch: Erreur lors de la fermeture des positions: {e}")
 
     def reset(self):
-        """Désactive le Kill Switch (Nécessite intervention manuelle/biométrique dans l'UI)"""
-        logging.warning("Kill Switch réarmé.")
-        self.is_triggered = False
+        """Désactive le Kill Switch (Nécessite intervention manuelle/biométrique dans l'UI)."""
+        with self._lock:
+            logging.warning("Kill Switch réarmé.")
+            self.is_triggered = False
```

---

### Proposed Diff 2: `infrastructure/broker_router.py`

```python
--- a/infrastructure/broker_router.py
+++ b/infrastructure/broker_router.py
@@ -1,15 +1,24 @@
 import logging
-from typing import Optional, List, Dict, Any
+import threading
+from typing import Optional, List, Dict, Any
 from core.interfaces import IBrokerConnector, AccountInfo, PositionInfo, OrderType
 
+try:
+    from infrastructure.telegram_notifier import TelegramNotifier, telegram_notifier
+except ImportError:
+    TelegramNotifier = None  # type: ignore
+    telegram_notifier = None  # type: ignore
+
 class BrokerRouter(IBrokerConnector):
     """
     Routeur Multi-Courtiers pour la Haute Disponibilité.
     Encapsule deux connexions (Primary et Fallback) et route les opérations 
     automatiquement vers le fallback si le primaire défaille.
     """
-    def __init__(self, primary: IBrokerConnector, fallback: IBrokerConnector):
+    def __init__(self, primary: IBrokerConnector, fallback: IBrokerConnector, notifier: Optional[Any] = None):
         self.primary = primary
         self.fallback = fallback
+        self.notifier = notifier if notifier is not None else telegram_notifier
         self._active_broker = self.primary
         self.connected = False
+        self._lock = threading.Lock()
 
     def connect(self) -> bool:
         primary_ok = self.primary.connect()
@@ -23,12 +32,28 @@
         fallback_ok = self.fallback.connect()
         
         if fallback_ok:
             self._active_broker = self.fallback
             self.connected = True
             logging.info("[Router] ✅ Connecté au courtier FALLBACK avec succès.")
+            if self.notifier:
+                try:
+                    self.notifier.notify_critical_event(
+                        "BROKER_FAILOVER",
+                        reason="Primary broker unreachable during connect",
+                        details="Switched to fallback broker successfully"
+                    )
+                except Exception as e:
+                    logging.error(f"[Router] Erreur notification failover: {e}")
             return True
             
         logging.error("[Router] ❌ Échec critique : Primaire et Fallback injoignables.")
         self.connected = False
+        if self.notifier:
+            try:
+                self.notifier.notify_critical_event(
+                    "MT5_DISCONNECT",
+                    reason="Primary and fallback brokers unreachable",
+                    details="Both primary and fallback MT5 connections failed during connect()"
+                )
+            except Exception as e:
+                logging.error(f"[Router] Erreur notification deconnexion: {e}")
         return False
 
     def _switch_to_fallback(self) -> bool:
         """Tente de basculer sur le courtier de secours."""
-        logging.warning("[Router] 🔄 Tentative de bascule (Failover) vers le courtier Fallback...")
-        if not getattr(self.fallback, 'connected', False):
-            if not self.fallback.connect():
-                logging.error("[Router] ❌ Échec du Failover : Fallback injoignable.")
-                return False
-                
-        self._active_broker = self.fallback
-        logging.info("[Router] ✅ Failover réussi. Trafic routé vers le Fallback.")
-        return True
+        with self._lock:
+            if self._active_broker == self.fallback and getattr(self.fallback, 'connected', False):
+                return True
+                
+            logging.warning("[Router] 🔄 Tentative de bascule (Failover) vers le courtier Fallback...")
+            if not getattr(self.fallback, 'connected', False):
+                if not self.fallback.connect():
+                    logging.error("[Router] ❌ Échec du Failover : Fallback injoignable.")
+                    if self.notifier:
+                        try:
+                            self.notifier.notify_critical_event(
+                                "MT5_DISCONNECT",
+                                reason="Failover failed: Fallback broker unreachable",
+                                details="Primary broker failed and fallback connection attempt failed"
+                            )
+                        except Exception as e:
+                            logging.error(f"[Router] Erreur notification echec failover: {e}")
+                    return False
+                    
+            self._active_broker = self.fallback
+            logging.info("[Router] ✅ Failover réussi. Trafic routé vers le Fallback.")
+            if self.notifier:
+                try:
+                    self.notifier.notify_critical_event(
+                        "BROKER_FAILOVER",
+                        reason="Primary broker failure during operation",
+                        details="Active broker switched from primary to fallback"
+                    )
+                except Exception as e:
+                    logging.error(f"[Router] Erreur notification failover: {e}")
+            return True
```

---

### Proposed Diff 3: `application/engine.py`

```python
--- a/application/engine.py
+++ b/application/engine.py
@@ -17,6 +17,12 @@
 import datetime
-from typing import Dict, Optional
+from typing import Dict, Optional, Any
+
+try:
+    from infrastructure.telegram_notifier import TelegramNotifier, telegram_notifier
+except ImportError:
+    TelegramNotifier = None  # type: ignore
+    telegram_notifier = None  # type: ignore
 
@@ -40,9 +46,11 @@
 class Engine:
-    def __init__(self, connector: IBrokerConnector, db_session=None):
+    def __init__(self, connector: IBrokerConnector, db_session=None, notifier: Optional[Any] = None):
         self.connector     = connector
+        self.notifier      = notifier if notifier is not None else telegram_notifier
         self.state_manager = StateManager(connector)
-        self.kill_switch   = KillSwitch(connector)
+        self.kill_switch   = KillSwitch(connector, notifier=self.notifier)
         self.circuit_breaker = CircuitBreaker(self.state_manager, self.kill_switch)
         self.db = db_session
         self.pretrade_validator = PreTradeValidator(db_session=self.db)
         self.dynamic_ts = DynamicTrailingStop()
         self.position_sizer = PositionSizer(db_session=self.db)
+        self._broker_disconnected_latched: bool = False
@@ -103,6 +111,10 @@
     def start(self):
+        # Démarrage du service d'alertes Telegram
+        if self.notifier and hasattr(self.notifier, "start"):
+            self.notifier.start()
+
         # 1. Initialize MT5 in the MAIN thread (prevents deadlock)
         if not self.connector.connect():
             logging.error("[Engine] Échec de connexion au broker (Main Thread).")
+            if self.notifier:
+                try:
+                    self.notifier.notify_critical_event(
+                        "MT5_DISCONNECT",
+                        reason="Engine failed to connect to broker during startup (Main Thread)",
+                        details="Initial connection attempt in Engine.start() failed"
+                    )
+                except Exception as notif_err:
+                    logging.error(f"[Engine] Erreur notification MT5_DISCONNECT: {notif_err}")
             return
@@ -118,8 +130,28 @@
     def _run_async_loop_thread(self):
-        """Démarre la boucle d'événements asyncio dans le thread dédié."""
-        if not self.connector.connect():
-            logging.error("[Engine] Échec de connexion au broker dans le thread dédié.")
-            self.running = False
-            return
-            
-        asyncio.run(self._async_run_loop())
+        """Démarre la boucle d'événements asyncio dans le thread dédié avec capture des exceptions fatales."""
+        try:
+            if not self.connector.connect():
+                logging.error("[Engine] Échec de connexion au broker dans le thread dédié.")
+                self.running = False
+                if self.notifier:
+                    try:
+                        self.notifier.notify_critical_event(
+                            "MT5_DISCONNECT",
+                            reason="Engine failed to connect to broker in background thread",
+                            details="Broker connection failed in _run_async_loop_thread"
+                        )
+                    except Exception as notif_err:
+                        logging.error(f"[Engine] Erreur notification MT5_DISCONNECT: {notif_err}")
+                return
+                
+            asyncio.run(self._async_run_loop())
+        except Exception as e:
+            logging.critical(f"[Engine] 💥 Crash fatal dans le thread du moteur : {e}", exc_info=True)
+            self.running = False
+            if self.notifier:
+                try:
+                    self.notifier.notify_critical_event(
+                        "FATAL_ERROR",
+                        reason=f"Engine thread crashed: {e}",
+                        details=f"Unhandled exception in _run_async_loop_thread: {type(e).__name__}: {e}"
+                    )
+                except Exception as notif_err:
+                    logging.error(f"[Engine] Erreur notification FATAL_ERROR: {notif_err}")
@@ -127,6 +159,8 @@
     def stop(self):
         self.running = False
         self.ml_trainer.stop()
         if self._thread:
             self._thread.join(timeout=5)
         self.connector.disconnect()
+        if self.notifier and hasattr(self.notifier, "stop"):
+            self.notifier.stop()
         logging.info("[Engine] ⛔ Arrêté.")
@@ -148,6 +182,24 @@
             start_time = time.time()
 
             # Mise à jour de l'état du compte et des positions (Bloquant mais rapide)
             self.state_manager.update_state()
+
+            # ── Détection de Déconnexion Broker avec Latch Anti-Spam ──
+            is_connected = bool(getattr(self.connector, "connected", False) and (self.state_manager.account is not None))
+            if not is_connected:
+                if not self._broker_disconnected_latched:
+                    self._broker_disconnected_latched = True
+                    logging.error("[Engine] 🚨 Perte de connexion au courtier MT5 / Compte indisponible !")
+                    if self.notifier:
+                        try:
+                            self.notifier.notify_critical_event(
+                                "MT5_DISCONNECT",
+                                reason="Broker connection lost or account unavailable",
+                                details=f"Connector.connected={getattr(self.connector, 'connected', False)}, Account={self.state_manager.account is not None}"
+                            )
+                        except Exception as notif_err:
+                            logging.error(f"[Engine] Erreur dispatch MT5_DISCONNECT: {notif_err}")
+                await asyncio.sleep(5)
+                continue
+            else:
+                if self._broker_disconnected_latched:
+                    logging.info("[Engine] 🟢 Connexion au courtier MT5 rétablie avec succès.")
+                    self._broker_disconnected_latched = False
```

---

## 5. Verification Method

To verify these implementations without MT5 hardware:

### 5.1 Unit Verification of `KillSwitch` Hook
```python
from unittest.mock import MagicMock
from agents.kill_switch import KillSwitch

def test_kill_switch_activation_notifies():
    mock_connector = MagicMock()
    mock_connector.connected = True
    pos1 = MagicMock(ticket=1001)
    pos2 = MagicMock(ticket=1002)
    mock_connector.get_positions.return_value = [pos1, pos2]
    mock_connector.close_position.return_value = True

    mock_notifier = MagicMock()
    ks = KillSwitch(connector=mock_connector, notifier=mock_notifier)
    ks.activate(reason="MAX_DAILY_LOSS_REACHED")

    assert ks.is_triggered is True
    mock_notifier.notify_critical_event.assert_called_once_with(
        "KILL_SWITCH",
        reason="MAX_DAILY_LOSS_REACHED",
        details="Emergency liquidation triggered: 2 positions closed"
    )
    assert mock_connector.close_position.call_count == 2

    # Second call must be idempotent
    ks.activate(reason="MAX_DAILY_LOSS_REACHED")
    assert mock_notifier.notify_critical_event.call_count == 1
```

### 5.2 Unit Verification of `BrokerRouter` Failover & Disconnect
```python
from unittest.mock import MagicMock
from infrastructure.broker_router import BrokerRouter

def test_broker_router_both_fail_notifies():
    mock_primary = MagicMock()
    mock_primary.connect.return_value = False
    mock_fallback = MagicMock()
    mock_fallback.connect.return_value = False

    mock_notifier = MagicMock()
    router = BrokerRouter(primary=mock_primary, fallback=mock_fallback, notifier=mock_notifier)
    res = router.connect()

    assert res is False
    mock_notifier.notify_critical_event.assert_called_once_with(
        "MT5_DISCONNECT",
        reason="Primary and fallback brokers unreachable",
        details="Both primary and fallback MT5 connections failed during connect()"
    )
```

### 5.3 Unit Verification of `Engine` Fatal Crash & Disconnect Latching
```python
from unittest.mock import MagicMock, patch
from application.engine import Engine

def test_engine_fatal_error_notifies():
    mock_connector = MagicMock()
    mock_connector.connect.return_value = True
    mock_notifier = MagicMock()

    engine = Engine(connector=mock_connector, notifier=mock_notifier)
    with patch.object(engine, "_async_run_loop", side_effect=RuntimeError("Database corruption")):
        engine._run_async_loop_thread()

    assert engine.running is False
    mock_notifier.notify_critical_event.assert_called_once()
    call_args = mock_notifier.notify_critical_event.call_args[0]
    assert call_args[0] == "FATAL_ERROR"
    assert "Database corruption" in call_args[1]
```

### 5.4 Test Execution Command
Run via pytest in workspace directory:
```bash
pytest tests/test_telegram_integration.py tests/test_telegram_notifier.py -v
```
All tests must pass with 0 errors and 0 warnings.
