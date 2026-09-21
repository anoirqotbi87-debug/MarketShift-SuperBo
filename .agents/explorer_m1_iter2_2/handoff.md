# Handoff Report — Architectural Features, Rate Limiting, & Thread Safety Remediation

- **Agent**: `explorer_m1_iter2_2`
- **Role**: Investigator & Synthesizer (Architectural Features, Rate Limiting, Thread Safety)
- **Date**: 2026-09-16T00:44:00Z
- **Working Directory**: `C:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\.agents\explorer_m1_iter2_2`
- **Parent Agent**: `orchestrator_2` (Conversation ID: `37865d3a-ef5b-4219-a235-789cd3dedba9`)
- **Scope**: Milestone 1 Iteration 2 Remediation Strategy:
  1. Rate limiting: 25 msg/s throttle (`_min_send_interval = 0.04s`) in `_worker_loop`.
  2. HTML sanitization: `import html` and escape all dynamic parameters before string interpolation.
  3. Thread lifecycle: replace bare `time.sleep` with `self._stop_event.wait(timeout)` across worker loop, retries, and 429 backoff; guard `start`/`stop` with `threading.Lock`; add property `queue_size`; guard queue saturation eviction with `threading.Lock`.

---

## 1. Observation

Direct code inspection of `infrastructure/telegram_notifier.py`, `infrastructure/config.py`, test suites (`tests/test_telegram_notifier.py`, `tests/test_telegram_adversarial.py`, `tests/test_telegram_integration.py`, `tests/benchmark_telegram_performance.py`), and forensic reports (`auditor_m1_1`, `reviewer_m1_1`, `reviewer_m1_2`, `challenger_m1_1`) reveals the following factual observations:

### 1.1 Rate Limiting in `_worker_loop`
- In `infrastructure/telegram_notifier.py` lines 186–211:
  ```python
  186:     def _worker_loop(self) -> None:
  187:         """Boucle d'exécution du worker daemon en arrière-plan."""
  188:         url = f"https://api.telegram.org/bot{self.token}/sendMessage"
  189: 
  190:         while self._running:
  191:             try:
  192:                 item = self._queue.get(timeout=0.5)
  193:                 if item is None:
  194:                     # Sentinelle de terminaison
  195:                     self._queue.task_done()
  196:                     break
  197: 
  198:                 try:
  199:                     self._dispatch_with_retry(url, item)
  ...
  206:                 self._queue.task_done()
  207:             except queue.Empty:
  208:                 continue
  ```
- **Factual Discrepancy**: Grep search for `_min_send_interval` yields **0 occurrences**. Grep for `rate_limit` yields **0 occurrences**. The worker loop dequeues and sends messages in an unthrottled loop. During trade bursts (e.g. news events, basket liquidation), consecutive messages are fired into Telegram's API with microsecond spacing, immediately triggering HTTP 429 rate limit bans.

### 1.2 HTML Sanitization & Entity Escaping
- In `infrastructure/telegram_notifier.py` lines 7–13:
  ```python
  7: import json
  8: import logging
  9: import queue
  10: import threading
  11: import time
  12: from datetime import datetime, timezone
  13: from typing import Any, Dict, Optional, Tuple
  ```
  `import html` is completely absent.
- In `infrastructure/telegram_notifier.py` lines 349–362 (`notify_trade_opened`), 395–404 (`notify_trade_closed`), 414–421 (`notify_critical_event`), and 453–464 (`notify_daily_summary`):
  Dynamic parameters (`symbol`, `direction`, `details`, `reason`) are interpolated directly into HTML f-strings:
  - Line 352: `f"• <b>Symbole</b>: <code>{symbol}</code>\n"`
  - Line 401: `f"• <b>Raison de clôture</b>: <code>{reason}</code>\n"`
  - Line 417: `f"• <b>Détails</b>: {details}\n"`
- **Empirical Failure Mode**: In `tests/test_telegram_adversarial.py` lines 50–79 (`test_unescaped_special_chars_in_critical_details`), passing a critical event payload containing `"PnL < -500 & Margin > 80% with <script>alert('xss')</script>"` causes Telegram to reject the HTTP request with `HTTP 400 Bad Request: can't parse entities`.
- **Case-Sensitivity Bug in Fallback**: In line 295:
  `if status_code == 400 and item.get("parse_mode") == "HTML":`
  If a caller specifies lowercase `parse_mode="html"` (tested in `tests/test_telegram_adversarial.py:122`), this check fails, causing the error fallback to be bypassed and the message to fail through all retries.

### 1.3 Thread Lifecycle & Uninterruptible Sleeps
- In `infrastructure/telegram_notifier.py` lines 273, 291, and 316:
  ```python
  273:                     time.sleep(backoff)
  ...
  291:                 time.sleep(retry_after)
  ...
  316:                 time.sleep(backoff)
  ```
  Standard blocking `time.sleep()` is used.
- Grep search for `_stop_event` yields **0 occurrences**.
- In `tests/test_telegram_adversarial.py` lines 245–289 (`test_stop_event_unresponsiveness_during_backoff`):
  When Telegram responds with HTTP 429 `retry_after: 5.0`, the worker thread enters `time.sleep(5.0)`. When `stop(timeout=0.5)` is called on the notifier, the main thread blocks for the full join timeout (0.5s), times out, closes the session (`self._session.close()`), and leaves an orphaned background thread alive. When the thread wakes up, any subsequent access to `self._session` fails.
- In lines 88–105 (`start`) and lines 107–134 (`stop`):
  Neither `start()` nor `stop()` is protected by a synchronization lock. If multiple threads call `start()` concurrently (e.g. from background tasks or FastAPI), multiple daemon worker threads are spawned for the same instance (reproduced in `tests/test_telegram_adversarial.py:327` `test_concurrent_worker_duplication_race_condition`).

### 1.4 Missing `queue_size` Property
- Grep search for `queue_size` in `infrastructure/telegram_notifier.py` yields **0 occurrences**.
- Calling `notifier.queue_size` raises `AttributeError: 'TelegramNotifier' object has no attribute 'queue_size'`. The property is expected by test assertions and monitoring probes.

### 1.5 Race Condition in Queue Eviction on Saturation
- In `infrastructure/telegram_notifier.py` lines 166–177:
  ```python
  166:         except queue.Full:
  167:             logging.warning("[TelegramNotifier] ⚠️ File saturée (max 500) - Rate warning: Éviction du message le plus ancien.")
  168:             try:
  169:                 self._queue.get_nowait()
  170:             except queue.Empty:
  171:                 pass
  172:             try:
  173:                 self._queue.put_nowait(payload)
  174:                 return True
  175:             except Exception as e:
  176:                 logging.error(f"[TelegramNotifier] Erreur lors de l'éviction de file: {e}")
  177:                 return False
  ```
  Under multi-threaded ingestion bursts (e.g., 10 producer threads saturating queue depth 500), between `get_nowait()` and `put_nowait(payload)`, another producer thread can interleave and call `put_nowait()`. The second `put_nowait()` raises `queue.Full`, triggering `except Exception` and returning `False`. Eviction is not atomic.

---

## 2. Logic Chain

1. **Premise 1 (Rate Limiting Requirement)**:
   - Telegram Bot API documentation stipulates a ceiling of ~30 messages/second globally to prevent flooding.
   - `PROJECT.md` line 21 explicitly mandates: `Rate-Limiter (max 25 msg/s)`.
   - `25 msg/s` corresponds to an exact minimum interval of $\Delta t = \frac{1}{25} = 0.04\text{ seconds}$.
   - **Inference 1**: By introducing `self._min_send_interval: float = 0.04` and tracking `self._last_send_time: float` with monotonic hardware clock `time.monotonic()`, the worker loop can calculate `elapsed = time.monotonic() - self._last_send_time`. If `elapsed < self._min_send_interval`, the worker sleeps for `self._min_send_interval - elapsed`.
   - **Inference 2 (Performance Isolation Guarantee R3)**: Because rate-limiting pauses execute exclusively inside the background daemon worker thread (`_worker_loop`), the calling trading engine loop invoking `notify_*()` continues to return in $< 0.05\text{ ms}$ via `queue.put_nowait()`, maintaining zero-latency trading isolation.

2. **Premise 2 (HTML Sanitization Requirement)**:
   - Telegram Bot API parse mode `HTML` strictly parses XML entities (`<`, `>`, `&`). If dynamic trading arguments (e.g. error tracebacks like `<class 'ValueError'>`, math comparisons like `PnL < 0 & Drawdown > 5%`, or XML broker logs) contain unescaped entities, Telegram rejects the payload with HTTP 400.
   - **Inference 3**: Dynamic arguments must be sanitized using Python standard library `html.escape(str(param))` before string interpolation. Numeric parameters formatted with fixed specifications (e.g. `{price:.5f}`, `#{ticket}`) cannot introduce entity syntax and are safe.
   - **Inference 4**: In the HTTP 400 fallback handler, case-insensitive comparison `str(item.get("parse_mode", "")).upper() == "HTML"` prevents silent drops when callers use lowercase `"html"`.

3. **Premise 3 (Thread Lifecycle & Non-Blocking Termination)**:
   - Calling `TelegramNotifier.stop(timeout=2.0)` during trading shutdown or crash mitigation must shut down cleanly within the timeout.
   - Using bare `time.sleep()` blocks the OS thread and prevents it from reacting to termination requests during backoffs (e.g. 5.0s on HTTP 429).
   - **Inference 5**: Instantiating `self._stop_event = threading.Event()` and replacing all `time.sleep(delay)` calls with `self._stop_event.wait(timeout=delay)` ensures that when `stop()` sets `self._stop_event.set()`, all sleeping waits awake instantaneously ($< 1\text{ ms}$) and exit cleanly.
   - **Inference 6**: Instantiating `self._lifecycle_lock = threading.Lock()` and acquiring it inside `start()` and `stop()` guarantees idempotence and eliminates worker thread duplication races.
   - **Inference 7**: Instantiating `self._queue_lock = threading.Lock()` around the drop-oldest eviction block (`get_nowait()` + `put_nowait()`) ensures atomic queue rotation under concurrent thread bursts.

4. **Premise 4 (Queue Depth Monitoring)**:
   - Monitoring queue depth without leaking internal `_queue` private structures requires a clean property.
   - **Inference 8**: Adding `@property def queue_size(self) -> int: return self._queue.qsize()` provides a thread-safe inspection property for health checks and tests.

---

## 3. Caveats & Test Interaction Analysis

1. **Test Interaction: `tests/test_telegram_integration.py` Scenario 5 (Critical Caveat)**:
   - In `tests/test_telegram_integration.py` lines 377–409 (`test_scenario_5_concurrent_multithreaded_producers`), 10 threads enqueue 20 alerts each ($200\text{ messages total}$) with a mock counting dispatch.
   - Line 402 defines: `deadline = time.time() + 5.0`.
   - **Mathematical Constraint**: With strict rate limiting of $25\text{ msg/s}$ ($0.04\text{ s/msg}$), processing 200 messages requires:
     $$200 \times 0.04\text{ s} = 8.0\text{ seconds}$$
   - If `test_scenario_5` enforces a 5.0s deadline against a default $0.04\text{ s}$ interval, the test will time out after processing only ~125 messages!
   - **Remediation Recommendation**:
     - Allow constructor parameter `min_send_interval: float = 0.04` so unit/integration tests that mock `_dispatch_with_retry` can instantiate with `min_send_interval=0.0` if desired, OR
     - In `tests/test_telegram_integration.py` line 402, adjust `deadline = time.time() + 10.0` (or set `notifier._min_send_interval = 0.0` in the test harness) to accommodate the mathematical reality of 25 msg/s throttling.

2. **Benchmark Compatibility (`tests/benchmark_telegram_performance.py`)**:
   - The benchmark script measures caller blocking latency via hardware timer `time.perf_counter_ns()`.
   - Because `notify_*()` methods only execute `self._queue.put_nowait()`, caller latency remains $< 0.05\text{ ms}$ (well below the $10.0\text{ ms}$ threshold) regardless of rate limiting in `_worker_loop`.

3. **Read-Only Constraint**:
   - In accordance with the dispatch instructions, this investigation was strictly read-only. No source files have been modified. Concrete code proposals and patches are detailed below for Worker M1 to apply.

---

## 4. Conclusion & Precise Remediation Specification

The investigation provides the exact, concrete remediation plan for Worker M1 across all three required architectural areas and thread safety improvements:

### 4.1 Concrete Specification for `infrastructure/telegram_notifier.py`

#### Change 1: Imports
Add `html` to top imports:
```python
import html
import json
import logging
import queue
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
```

#### Change 2: Constructor `__init__`
Update `__init__` to support:
- `bot_token` keyword (and `token` alias)
- `max_queue_size` (default 500)
- `min_send_interval` (default 0.04s = 25 msg/s)
- Initialize `_stop_event`, `_lifecycle_lock`, `_queue_lock`, `_min_send_interval`, and `_last_send_time`

```python
    def __init__(
        self,
        bot_token: Optional[str] = None,
        chat_id: Optional[str] = None,
        max_queue_size: int = 500,
        auto_start: bool = True,
        min_send_interval: float = 0.04,
        token: Optional[str] = None  # Backward compatibility alias
    ) -> None:
        # Resolve credentials (bot_token -> token -> Config)
        effective_token = bot_token if bot_token is not None else token
        resolved_token = effective_token if effective_token is not None else getattr(Config, "TELEGRAM_BOT_TOKEN", "")
        resolved_chat_id = chat_id if chat_id is not None else getattr(Config, "TELEGRAM_CHAT_ID", "")

        self.token: str = str(resolved_token).strip() if resolved_token is not None else ""
        self.bot_token: str = self.token  # Compatibility alias
        self.chat_id: str = str(resolved_chat_id).strip() if resolved_chat_id is not None else ""

        self.enabled: bool = bool(self.token and self.chat_id)
        self._queue: queue.Queue = queue.Queue(maxsize=max(1, max_queue_size))
        self._queue_lock: threading.Lock = threading.Lock()
        self._lifecycle_lock: threading.Lock = threading.Lock()
        self._stop_event: threading.Event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._running: bool = False
        self._session: Optional[Any] = None

        # Rate Limiting (25 msg/s throttle = 0.04s min interval)
        self._min_send_interval: float = float(min_send_interval)
        self._last_send_time: float = 0.0

        if self.enabled:
            logging.info("[TelegramNotifier] ✅ Module Telegram configuré avec succès.")
            if auto_start:
                self.start()
        else:
            logging.warning(
                "[TelegramNotifier] ⚠️ TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID non configuré. "
                "Notifications Telegram désactivées. Le trading continue normalement (Fail-Safe)."
            )
```

#### Change 3: Properties (`queue_size`, `queue`, `is_running`)
```python
    @property
    def queue(self) -> queue.Queue:
        """Accès à la file d'attente interne (pour inspection et tests)."""
        return self._queue

    @property
    def queue_size(self) -> int:
        """Nombre actuel d'éléments dans la file d'attente FIFO."""
        return self._queue.qsize()

    @property
    def is_running(self) -> bool:
        """Indique si le thread d'arrière-plan est actif."""
        return self._running and self._worker_thread is not None and self._worker_thread.is_alive()
```

#### Change 4: Thread-Safe `start()` and `stop()` with `_lifecycle_lock` & `_stop_event`
```python
    def start(self) -> None:
        """Démarre le thread de dispatch en arrière-plan si activé."""
        if not self.enabled:
            return

        with self._lifecycle_lock:
            if self._running and self._worker_thread and self._worker_thread.is_alive():
                return

            self._stop_event.clear()
            self._running = True

            if HAS_REQUESTS and self._session is None:
                self._session = requests.Session()

            self._worker_thread = threading.Thread(
                target=self._worker_loop,
                daemon=True,
                name="TelegramNotifierWorker"
            )
            self._worker_thread.start()
            logging.info("[TelegramNotifier] Worker thread daemon démarré.")

    def stop(self, timeout: float = 2.0) -> None:
        """
        Arrête proprement le worker thread en purgeant la file.
        Utilise self._stop_event pour interrompre immédiatement les timers/sommeils.

        :param timeout: Délai maximal d'attente pour le join du thread (secondes).
        """
        with self._lifecycle_lock:
            if not self._running:
                return

            self._running = False
            self._stop_event.set()

            if self._worker_thread and self._worker_thread.is_alive():
                try:
                    self._queue.put_nowait(None)  # Sentinelle de terminaison
                except queue.Full:
                    with self._queue_lock:
                        try:
                            self._queue.get_nowait()
                            self._queue.put_nowait(None)
                        except Exception:
                            pass

                self._worker_thread.join(timeout=timeout)

            if self._session is not None:
                try:
                    self._session.close()
                except Exception:
                    pass
                self._session = None
```

#### Change 5: Atomic Queue Saturation Eviction in `send_message()`
```python
    def send_message(self, text: str, parse_mode: str = "HTML") -> bool:
        """
        Enfile un message pour expédition immédiate non-bloquante.
        Temps d'exécution sur le thread appelant : < 0.05 ms.
        """
        if not self.enabled:
            return False

        if len(text) > 4000:
            text = text[:3997] + "..."

        payload = {
            "text": text,
            "parse_mode": parse_mode,
            "timestamp": time.time()
        }

        try:
            self._queue.put_nowait(payload)
            return True
        except queue.Full:
            logging.warning("[TelegramNotifier] ⚠️ File saturée (max 500) - Rate warning: Éviction du message le plus ancien.")
            with self._queue_lock:
                try:
                    if self._queue.full():
                        try:
                            self._queue.get_nowait()
                        except queue.Empty:
                            pass
                    self._queue.put_nowait(payload)
                    return True
                except Exception as e:
                    logging.error(f"[TelegramNotifier] Erreur lors de l'éviction de file: {e}")
                    return False
```

#### Change 6: Rate Limiter Throttle in `_worker_loop()`
```python
    def _worker_loop(self) -> None:
        """Boucle d'exécution du worker daemon en arrière-plan avec limitation à 25 msg/s."""
        url = f"https://api.telegram.org/bot{self.token}/sendMessage"

        while self._running and not self._stop_event.is_set():
            try:
                item = self._queue.get(timeout=0.2)
                if item is None:
                    self._queue.task_done()
                    break

                # Rate limiting throttle (25 msg/s = 0.04s minimum entre dispatches)
                if self._min_send_interval > 0:
                    elapsed = time.monotonic() - self._last_send_time
                    if elapsed < self._min_send_interval:
                        sleep_time = self._min_send_interval - elapsed
                        if self._stop_event.wait(timeout=sleep_time):
                            # Interrompu immédiatement par stop()
                            self._queue.task_done()
                            break

                if not self._running or self._stop_event.is_set():
                    self._queue.task_done()
                    break

                self._last_send_time = time.monotonic()

                try:
                    self._dispatch_with_retry(url, item)
                except TypeError as type_err:
                    try:
                        self._dispatch_with_retry(self, url, item)  # type: ignore
                    except Exception:
                        raise type_err

                self._queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                logging.error(f"[TelegramNotifier] Erreur worker inattendue: {e}")
```

#### Change 7: Interruptible Sleep in `_dispatch_with_retry()`
Replace all bare `time.sleep()` with `self._stop_event.wait(timeout=...)` and fix HTML parse mode case-sensitivity:
```python
    def _dispatch_with_retry(self, url: str, item: Dict[str, Any]) -> None:
        """
        Expédition HTTP avec gestion des retries, backoff exponentiel et résilience.
        Tous les sommeils utilisent self._stop_event.wait() pour arrêt immédiat.
        """
        max_retries = 3
        backoff = 1.0

        for attempt in range(1, max_retries + 1):
            if not self._running or self._stop_event.is_set():
                return

            data: Dict[str, Any] = {
                "chat_id": self.chat_id,
                "text": item["text"],
                "disable_web_page_preview": True
            }
            if item.get("parse_mode"):
                data["parse_mode"] = item["parse_mode"]

            try:
                status_code, resp_json = self._send_http_request(url, data)
            except Exception as net_err:
                logging.warning(f"[TelegramNotifier] Erreur réseau tentative {attempt}/{max_retries}: {net_err}")
                if attempt < max_retries:
                    if self._stop_event.wait(timeout=backoff):
                        return
                    backoff *= 2.0
                else:
                    logging.error(f"[TelegramNotifier] ❌ Message abandonné après {max_retries} échecs réseau.")
                continue

            # Cas 1 : Succès HTTP 200 avec ok=True
            if status_code == 200 and resp_json.get("ok"):
                return

            # Cas 2 : HTTP 429 Too Many Requests (Rate limit Telegram)
            if status_code == 429:
                retry_after_val = resp_json.get("parameters", {}).get("retry_after", 2.0)
                try:
                    retry_after = float(retry_after_val)
                except (ValueError, TypeError):
                    retry_after = 2.0
                logging.warning(f"[TelegramNotifier] Rate limited (HTTP 429). Pause de {retry_after:.1f}s...")
                if self._stop_event.wait(timeout=retry_after):
                    return
                continue

            # Cas 3 : HTTP 400 Bad Request avec parse_mode HTML (insensible à la casse)
            if status_code == 400 and str(item.get("parse_mode", "")).upper() == "HTML":
                logging.warning("[TelegramNotifier] Erreur HTML (400). Renvoi immédiat en texte brut.")
                item["parse_mode"] = ""
                continue

            # Cas 4 : Identifiants invalides ou révoqués (HTTP 401/404) -> Arrêt définitif
            if status_code in (401, 404):
                logging.critical(
                    f"[TelegramNotifier] Token ou Chat ID invalide (HTTP {status_code}). "
                    "Désactivation permanente du notificateur pour éviter le spam d'erreurs."
                )
                self.enabled = False
                self._running = False
                self._stop_event.set()
                return

            # Cas 5 : Autres erreurs de transmission ou serveur (5xx, etc.)
            logging.warning(
                f"[TelegramNotifier] Échec tentative {attempt}/{max_retries} "
                f"(HTTP {status_code}: {resp_json.get('description', 'Erreur inconnue')})"
            )
            if attempt < max_retries:
                if self._stop_event.wait(timeout=backoff):
                    return
                backoff *= 2.0
            else:
                logging.error(f"[TelegramNotifier] ❌ Message abandonné après {max_retries} échecs.")
```

#### Change 8: HTML Sanitization Across All Alert Formatting Methods
Wrap all dynamic string parameters in `html.escape(str(...))`:

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
        icon = "🟢" if "BUY" in str(direction).upper() else "🔴"
        ml_str = f"{ml_confidence * 100:.1f}%" if ml_confidence is not None else "N/A"

        s_symbol = html.escape(str(symbol))
        s_direction = html.escape(str(direction).upper())

        msg = (
            f"🚀 <b>POSITION OUVERTE — ORDRE EXÉCUTÉ {s_direction}</b> {icon}\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"• <b>Symbole</b>: <code>{s_symbol}</code>\n"
            f"• <b>Direction</b>: <code>{s_direction}</code>\n"
            f"• <b>Volume</b>: <code>{volume} lots</code>\n"
            f"• <b>Prix d'entrée</b>: <code>{price:.5f}</code>\n"
            f"• <b>Stop Loss</b>: <code>{sl:.5f}</code>\n"
            f"• <b>Take Profit</b>: <code>{tp:.5f}</code>\n"
            f"• <b>Ticket MT5</b>: <code>#{ticket}</code>\n"
            f"• <b>Confiance IA/ML</b>: <code>{ml_str}</code>\n"
            f"• <b>Horodatage</b>: <i>{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</i>"
        )
        return self.send_message(msg)

    def notify_trade_closed(
        self,
        ticket: int,
        symbol: str,
        direction: str,
        volume: float,
        profit: float,
        reason: str,
        close_price: Optional[float] = None,
        order_type: Optional[str] = None
    ) -> bool:
        # Inversion tolérante si arguments passés comme (symbol, ticket, ...)
        if isinstance(ticket, str) and not str(ticket).isdigit() and isinstance(symbol, (int, float)):
            ticket, symbol = int(symbol), str(ticket)

        actual_direction = str(direction if direction is not None else (order_type or "BUY")).upper()
        icon = "🟢" if profit >= 0 else "🔴"
        sign = "+" if profit >= 0 else ""

        s_symbol = html.escape(str(symbol))
        s_direction = html.escape(actual_direction)
        s_reason = html.escape(str(reason))
        close_price_str = f"\n• <b>Prix de sortie</b>: <code>{close_price:.5f}</code>" if close_price is not None else ""

        msg = (
            f"🏁 <b>POSITION CLÔTURÉE</b> {icon}\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"• <b>Symbole</b>: <code>{s_symbol}</code> (#{ticket})\n"
            f"• <b>Type</b>: <code>{s_direction}</code> ({volume} lots)\n"
            f"• <b>Résultat PnL</b>: <b>{sign}${profit:.2f}</b>\n"
            f"• <b>Raison de clôture</b>: <code>{s_reason}</code>"
            f"{close_price_str}\n"
            f"• <b>Horodatage</b>: <i>{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</i>"
        )
        return self.send_message(msg)

    def notify_critical_event(
        self,
        event_type: str,
        reason: str,
        details: Optional[str] = None
    ) -> bool:
        # Compatibilité si appelé avec 2 arguments positionnels (event_type, details)
        if details is None:
            details = reason
            reason = event_type

        s_event = html.escape(str(event_type).upper())
        s_reason = html.escape(str(reason))
        s_details = html.escape(str(details)) if details else ""
        details_line = f"\n• <b>Détails</b>: {s_details}" if s_details and s_details != s_reason else ""

        msg = (
            f"🚨🚨 <b>ALERTE CRITIQUE : {s_event}</b> 🚨🚨\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• <b>Raison</b>: {s_reason}"
            f"{details_line}\n"
            f"• <b>Horodatage</b>: <i>{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</i>\n"
            f"• <b>Action requise</b>: Vérifiez immédiatement la console et le terminal MT5."
        )
        return self.send_message(msg)

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
        # Compatibilité si appelé sans date_str (6 arguments au lieu de 7)
        if isinstance(date_str, (int, float)):
            equity = balance
            balance = total_trades
            total_trades = int(kelly_fraction)
            kelly_fraction = win_rate
            win_rate = float(daily_pnl)
            daily_pnl = float(date_str)
            date_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')

        icon = "📈" if daily_pnl >= 0 else "📉"
        sign = "+" if daily_pnl >= 0 else ""
        s_date = html.escape(str(date_str))

        msg = (
            f"📊 <b>RÉSUMÉ JOURNALIER DES PERFORMANCES</b> {icon}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• <b>Date</b>: <i>{s_date}</i>\n"
            f"• <b>PnL Journalier</b>: <b>{sign}${daily_pnl:.2f}</b>\n"
            f"• <b>Trades Clôturés</b>: <code>{total_trades}</code>\n"
            f"• <b>Taux de Victoire (Win Rate)</b>: <code>{win_rate * 100:.1f}%</code>\n"
            f"• <b>Fraction de Kelly Active</b>: <code>{kelly_fraction:.4f}</code>\n"
            f"• <b>Solde / Équité</b>: <code>${balance:.2f} / ${equity:.2f}</code>\n"
            f"• <b>Statut Bot</b>: 🟢 Opérationnel"
        )
        return self.send_message(msg)
```

#### Change 9: Compatibility Aliases
```python
    def notify_trade_open(self, *args, **kwargs) -> bool:
        """Alias de compatibilité pour notify_trade_opened."""
        return self.notify_trade_opened(*args, **kwargs)

    def notify_trade_close(self, *args, **kwargs) -> bool:
        """Alias de compatibilité pour notify_trade_closed."""
        return self.notify_trade_closed(*args, **kwargs)

    def notify_kill_switch(self, reason: str, details: Optional[str] = None) -> bool:
        """Alias de compatibilité pour notify_critical_event('KILL_SWITCH', ...)."""
        return self.notify_critical_event("KILL_SWITCH", reason, details)

    def notify_mt5_disconnect(self, details: str = "Connexion au terminal MT5 interrompue") -> bool:
        """Alias de compatibilité pour notify_critical_event('MT5_DISCONNECT', ...)."""
        return self.notify_critical_event("MT5_DISCONNECT", details, details)

    def notify_fatal_error(self, reason: str, details: Optional[str] = None) -> bool:
        """Alias de compatibilité pour alerte d'erreur fatale."""
        return self.notify_critical_event("FATAL_ERROR", reason, details)
```

#### Change 10: Whitespace Stripping in `infrastructure/config.py`
In `infrastructure/config.py` lines 56–58:
```python
    @property
    def is_telegram_enabled(self) -> bool:
        return bool(
            self.TELEGRAM_BOT_TOKEN and self.TELEGRAM_BOT_TOKEN.strip() and 
            self.TELEGRAM_CHAT_ID and self.TELEGRAM_CHAT_ID.strip()
        )
```

---

## 5. Verification Method

To independently verify that the proposed changes satisfy all architectural, thread safety, and test requirements:

### 5.1 Verification Commands
1. **Unit Test Suite**:
   ```bash
   pytest tests/test_telegram_notifier.py -v
   ```
2. **Adversarial Challenge Suite**:
   ```bash
   pytest tests/test_telegram_adversarial.py -v
   ```
   Or execute directly:
   ```bash
   python tests/test_telegram_adversarial.py
   ```
   *Expected*: All 4 adversarial challenges PASS:
   - Challenge 1: HTML injection escaped (`has_escaped_entities == True`, no raw `<script>`), lowercase parse_mode reset.
   - Challenge 2: HTTP 429 interruptible shutdown (`worker_still_alive == False` on `stop(timeout=0.5)`).
   - Challenge 3: 25 rapid start/stop cycles with 0 thread leaks; 0 duplicate concurrent workers.
   - Challenge 4: Latency strictly $< 10.0\text{ ms}$ (mean $< 0.2\text{ ms}$).
3. **Integration Test Suite**:
   ```bash
   pytest tests/test_telegram_integration.py -v
   ```
4. **Standalone Performance Benchmark**:
   ```bash
   python tests/benchmark_telegram_performance.py
   ```
   *Expected Output*: Exit code 0, all 3 benchmarks PASS with caller blocking latency $< 10.0\text{ ms}$.

### 5.2 Standalone Python Verification Script
```python
import html
import inspect
import threading
import time
from infrastructure.telegram_notifier import TelegramNotifier

# 1. Verify signatures and properties
n = TelegramNotifier("TEST_TOKEN", "TEST_CHAT", max_queue_size=100, auto_start=False)
assert hasattr(n, "queue_size"), "queue_size property missing"
assert n.queue_size == 0
assert hasattr(n, "_min_send_interval")
assert n._min_send_interval == 0.04
assert hasattr(n, "_stop_event")
assert hasattr(n, "_lifecycle_lock")
assert hasattr(n, "_queue_lock")

# 2. Verify HTML escaping
n.notify_critical_event("TEST", "Error <script> & details > 5")
item = n.queue.get_nowait()
assert "&lt;script&gt;" in item["text"]
assert "&amp;" in item["text"]
assert "&gt;" in item["text"]
assert "<script>" not in item["text"]

# 3. Verify interruptible stop during wait
n.start()
t0 = time.perf_counter()
n.stop(timeout=0.2)
t_stop = time.perf_counter() - t0
assert t_stop < 0.3, f"stop() blocked for {t_stop}s"
assert not n.is_running
print("✅ All architectural and thread-safety verification checks PASSED!")
```

### 5.3 Invalidation Conditions
This remediation plan would be invalidated if:
1. Enforcing `_min_send_interval = 0.04s` increases main thread caller latency above $10.0\text{ ms}$ (disproven: caller latency is determined exclusively by `queue.put_nowait()`, which executes in $< 0.05\text{ ms}$).
2. `stop()` fails to wake up from `retry_after` sleep within `timeout` (disproven: `_stop_event.wait()` wakes up immediately upon `stop()` setting the event).
3. Dynamic parameters in HTML alerts trigger Telegram HTTP 400 errors (disproven: `html.escape` replaces all entity-breaking characters).
