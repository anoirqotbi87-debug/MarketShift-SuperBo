"""
engine.py — Moteur de trading MarketShift SuperBot v2.0

Améliorations v2.0 :
  - Kelly Criterion pour le sizing des positions (remplace le volume statique 0.01)
  - SL/TP automatiques basés sur l'ATR (transmis depuis les stratégies)
  - Multi-symbole : boucle sur tous les symboles configurés dans TRADING_SYMBOLS
  - Filtre ML : les signaux techniques passent par le MLPredictor avant exécution
  - Logs en mémoire (via MemoryLogHandler dans api/server.py)
"""

import time
import logging
import threading
import asyncio
import datetime
from typing import Dict, Optional, Any

from application.state_manager import StateManager
from application.position_sizer import PositionSizer
from agents.kill_switch import KillSwitch
from agents.circuit_breaker import CircuitBreaker
from risk.pretrade_validator import PreTradeValidator
from risk.dynamic_trailing_stop import DynamicTrailingStop
from core.interfaces import IBrokerConnector, OrderType, Signal
from core.news_filter import NewsFilter
from infrastructure.config import Config

try:
    from infrastructure.telegram_notifier import TelegramNotifier, telegram_notifier
except ImportError:
    TelegramNotifier = None  # type: ignore
    telegram_notifier = None  # type: ignore

from strategies.aggregator import SignalAggregator
from strategies.smc_ict import SMCStrategy
from strategies.amd_ict import AMDStrategy
from strategies.base import StrategyBase

try:
    import MetaTrader5 as mt5
except ImportError:
    # MetaTrader5 est un paquet Windows-only ; sur Linux/CI on fournit des constantes de repli
    # pour que les tests unitaires puissent importer l'Engine (même pattern que TelegramNotifier).
    class _MT5Fallback:
        TIMEFRAME_M1 = 1
        TIMEFRAME_M5 = 5
        TIMEFRAME_M15 = 15
        TIMEFRAME_H1 = 16385
        TIMEFRAME_D1 = 16408
        SYMBOL_TRADE_MODE_FULL = 0
        ORDER_TYPE_BUY = 0
        ORDER_TYPE_SELL = 1
        ORDER_TIME_GTC = 0
        ORDER_FILLING_IOC = 2
        ORDER_FILLING_FOK = 1
        TRADE_ACTION_DEAL = 1
        POSITION_TYPE_BUY = 0
        POSITION_TYPE_SELL = 1
        DEAL_TYPE_BUY = 0
        DEAL_TYPE_SELL = 1
        DEAL_REASON_CLIENT = 0
        DEAL_REASON_MOBILE = 1
        DEAL_REASON_WEB = 2
        DEAL_REASON_EXPERT = 3
        DEAL_REASON_SL = 4
        DEAL_REASON_TP = 5
        DEAL_REASON_SO = 6
        DEAL_REASON_ROLLOVER = 7
        DEAL_REASON_VMARGIN = 8
        DEAL_REASON_SPLIT = 9
        DEAL_ENTRY_IN = 0
        DEAL_ENTRY_OUT = 1
        DEAL_ENTRY_INOUT = 2
        DEAL_ENTRY_OUT_BY = 3
        ACCOUNT_TRADE_MODE_DEMO = 0
        ACCOUNT_TRADE_MODE_CONTEST = 1
        ACCOUNT_TRADE_MODE_REAL = 2

        def __getattr__(self, name):
            return 0

    mt5 = _MT5Fallback()
    logging.getLogger(__name__).warning(
        "MetaTrader5 not available (Windows-only package). Engine runs with MT5 constants fallback."
    )

from ml.trainer import MLTrainer
from ml.predictor import MLPredictor


class Engine:
    def __init__(self, connector: IBrokerConnector, db_session=None, notifier: Optional[Any] = None):
        self.connector     = connector
        self.notifier      = notifier if notifier is not None else telegram_notifier
        self.state_manager = StateManager(connector)
        self.kill_switch   = KillSwitch(connector, notifier=self.notifier)
        self.circuit_breaker = CircuitBreaker(self.state_manager, self.kill_switch)
        self.db = db_session
        self.pretrade_validator = PreTradeValidator(db_session=self.db)
        self.dynamic_ts = DynamicTrailingStop()
        self.position_sizer = PositionSizer(db_session=self.db)
        self.news_filter = NewsFilter(pause_before_min=30, pause_after_min=30)

        # Stocker les constantes MT5 à l'init pour éviter tout problème de scope
        # mt5.TIMEFRAME_M1 = 1
        self._tf_m1  = mt5.TIMEFRAME_M1
        self._tf_m15 = mt5.TIMEFRAME_M15

        # Multi-symbole : chaque symbole a ses propres instances de stratégies
        self.symbols: list = Config.TRADING_SYMBOLS
        self._symbol_strategies: Dict[str, list] = {}
        self._symbol_aggregators: Dict[str, SignalAggregator] = {}
        self.latest_signals: Dict[str, Optional[Signal]] = {}

        for symbol in self.symbols:
            strategies = [
                SMCStrategy(
                    name=f"SMC_{symbol}", weight=2.0,
                    sl_multiplier=Config.get_symbol_sl_multiplier(symbol),
                    tp_multiplier=Config.get_symbol_tp_multiplier(symbol)
                ),
                AMDStrategy(
                    name=f"AMD_{symbol}", weight=2.5,
                    sl_multiplier=Config.get_symbol_sl_multiplier(symbol),
                    tp_multiplier=Config.get_symbol_tp_multiplier(symbol)
                )
            ]
            self._symbol_strategies[symbol] = strategies
            self._symbol_aggregators[symbol] = SignalAggregator(strategies)

        # ML — Entraîneur + Prédicateur
        self.ml_trainer   = MLTrainer()
        self.ml_predictor = MLPredictor(self.ml_trainer)

        # Référence publique vers l'aggregator du premier symbole (pour /predict API)
        self.aggregator = self._symbol_aggregators[self.symbols[0]] if self.symbols else None

        self.running  = False
        self._thread: Optional[threading.Thread] = None

        # Historique des trades fermés (pour le Kelly Criterion)
        self._closed_trades_cache = None  # Force l'update au premier cycle

        # Suivi des tickets de deals pour éviter les spams de clôture au démarrage
        self._seen_deal_tickets: set = set()
        self._deals_initialized: bool = False

        # Suivi de la date pour le résumé journalier (rollover minuit)
        self._last_summary_date: Optional[datetime.date] = datetime.date.today()

        # Anti-spam alerte déconnexion MT5 (latch)
        self._broker_disconnected_latched: bool = False
        
        # Anti-spam des signaux (un seul signal par bougie par symbole)
        self._last_signal_candle: Dict[str, datetime.datetime] = {}

        logging.info(
            f"[Engine] Initialisé avec {len(self.symbols)} symboles: {', '.join(self.symbols)}"
        )

    def start(self):
        # Démarrage du service d'alertes Telegram
        if self.notifier and hasattr(self.notifier, "start"):
            self.notifier.start()

        # 1. Initialize MT5 in the MAIN thread (prevents deadlock)
        if not self.connector.connect():
            logging.error("[Engine] Échec de connexion au broker (Main Thread).")
            if self.notifier:
                try:
                    self.notifier.notify_critical_event(
                        "MT5_DISCONNECT",
                        reason="Engine failed to connect to broker during startup (Main Thread)",
                        details="Initial connection attempt in Engine.start() failed"
                    )
                except Exception as notif_err:
                    logging.error(f"[Engine] Erreur notification MT5_DISCONNECT: {notif_err}")
            return
            
        self.running = True
        self._thread = threading.Thread(target=self._run_async_loop_thread, daemon=True)
        self._thread.start()

        # Démarrer l'auto-entraînement ML en arrière-plan
        self.ml_trainer.start_auto_retrain(self.connector, self.symbols)

        logging.info("[Engine] ✅ Démarré avec succès en mode Asyncio.")

    def _run_async_loop_thread(self):
        """Démarre la boucle d'événements asyncio dans le thread dédié avec capture des exceptions fatales."""
        try:
            if not self.connector.connect():
                logging.error("[Engine] Échec de connexion au broker dans le thread dédié.")
                self.running = False
                if self.notifier:
                    try:
                        self.notifier.notify_critical_event(
                            "MT5_DISCONNECT",
                            reason="Broker connection lost or account unavailable",
                            details=f"Connector.connected={getattr(self.connector, 'connected', False)}, Account={self.state_manager.account is not None}"
                        )
                    except Exception as notif_err:
                        logging.error(f"[Engine] Erreur dispatch MT5_DISCONNECT: {notif_err}")
                return
                
            asyncio.run(self._async_run_loop())
        except Exception as e:
            logging.critical(f"[Engine] 💥 Crash fatal dans le thread du moteur : {e}", exc_info=True)
            self.running = False
            if self.notifier:
                try:
                    self.notifier.notify_critical_event(
                        "FATAL_ERROR",
                        reason=f"Engine thread crashed: {e}",
                        details=f"Unhandled exception in _run_async_loop_thread: {type(e).__name__}: {e}"
                    )
                except Exception as notif_err:
                    logging.error(f"[Engine] Erreur notification FATAL_ERROR: {notif_err}")

    def stop(self):
        self.running = False
        self.news_filter.stop()
        self.ml_trainer.stop()
        if self._thread:
            self._thread.join(timeout=5)
        self.connector.disconnect()
        if self.notifier and hasattr(self.notifier, "stop"):
            self.notifier.stop()
        logging.info("[Engine] ⛔ Arrêté.")

    async def _async_run_loop(self):
        """Boucle principale de trading multi-symbole en mode asynchrone (100% parallèle)."""
        self.order_queue = asyncio.Queue()
        worker_task = asyncio.create_task(self._order_routing_worker())
        ts_task = asyncio.create_task(self._trailing_stop_worker())
        
        # Démarrer le news filter maintenant que l'event loop est active
        self.news_filter.start()
        
        while self.running:
            if self.kill_switch.is_triggered:
                await asyncio.sleep(1)
                continue

            start_time = time.time()

            # Mise à jour de l'état du compte et des positions (offload MT5 → timeout 4s anti-freeze)
            try:
                await asyncio.wait_for(asyncio.to_thread(self.state_manager.update_state), timeout=4.0)
            except asyncio.TimeoutError:
                logging.warning("[Engine] ⏱️ Timeout (4s) sur update_state — état du compte inchangé ce cycle.")
            except Exception as e:
                logging.error(f"[Engine] Erreur update_state: {e}")

            # Surveillance de connectivité Broker / Compte avec latch anti-spam
            is_connected = bool(getattr(self.connector, "connected", False) and (self.state_manager.account is not None))
            if not is_connected:
                if not self._broker_disconnected_latched:
                    self._broker_disconnected_latched = True
                    logging.error("[Engine] 🚨 Perte de connexion au courtier MT5 / Compte indisponible !")
                    if self.notifier:
                        try:
                            self.notifier.notify_critical_event(
                                "MT5_DISCONNECT",
                                reason="Broker connection lost or account unavailable",
                                details=f"Connector.connected={getattr(self.connector, 'connected', False)}, Account={self.state_manager.account is not None}"
                            )
                        except Exception as notif_err:
                            logging.error(f"[Engine] Erreur dispatch MT5_DISCONNECT: {notif_err}")
                await asyncio.sleep(5)
                continue
            else:
                if self._broker_disconnected_latched:
                    logging.info("[Engine] 🟢 Connexion au courtier MT5 rétablie avec succès.")
                    self._broker_disconnected_latched = False

            # Vérifications de sécurité (Circuit Breaker)
            self.circuit_breaker.check()

            # Mise à jour du Kelly Criterion avec les trades fermés (offload MT5 → timeout 4s)
            try:
                await asyncio.wait_for(asyncio.to_thread(self._refresh_kelly_history), timeout=4.0)
            except asyncio.TimeoutError:
                logging.warning("[Engine] ⏱️ Timeout (4s) sur refresh Kelly history — historique non rafraîchi ce cycle.")
            except Exception as e:
                logging.error(f"[Engine] Erreur refresh Kelly history: {e}")

            # Vérification du passage à minuit (Daily Summary Telegram) — offload thread → timeout 4s
            try:
                await asyncio.wait_for(
                    asyncio.to_thread(self._check_daily_summary),
                    timeout=4.0
                )
            except asyncio.TimeoutError:
                logging.warning("[Engine] ⏱️ Timeout (4s) sur daily summary — reporté au prochain cycle.")
            except Exception as e:
                logging.error(f"[Engine] Erreur daily summary: {e}")

            # ── Exécution Parallèle (Zero Latency) ────────────────────────────
            tasks = []
            for symbol in self.symbols:
                if self.kill_switch.is_triggered:
                    break
                tasks.append(self._process_symbol_async(symbol))

            if tasks:
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for i, r in enumerate(results):
                    if isinstance(r, Exception):
                        logging.error(f"[Engine] Erreur asynchrone sur {self.symbols[i]}: {r}")

            elapsed = time.time() - start_time
            
            # --- NOUVEAU: Résumé du cycle ---
            summary_parts = []
            for sym, last_sig in self._last_signal_candle.items():
                summary_parts.append(f"{sym}: Actif")
            
            # Pour éviter d'inonder les logs, on affiche juste qu'il a scanné X symboles
            # Mais si on a eu des signaux émis récemment, on les liste
            logging.info(f"[Engine] 🔄 Cycle terminé en {elapsed:.3f}s pour {len(self.symbols)} symboles. En attente d'opportunité...")

            # Attendre précisément la prochaine minute (00s) au lieu d'un time.sleep(60) aveugle
            now = datetime.datetime.now()
            seconds_to_next_minute = 60 - now.second - (now.microsecond / 1_000_000.0)
            if seconds_to_next_minute < 0.1:
                seconds_to_next_minute += 60.0
            
            await asyncio.sleep(seconds_to_next_minute)

    async def _process_symbol_async(self, symbol: str):
        """Traite un symbole de manière asynchrone : données → signal → ML → sizing → exécution."""
        # 1. Récupérer les données OHLCV M15 — timeout 5s strict pour éviter les freezes MT5
        try:
            df = await asyncio.wait_for(
                asyncio.to_thread(self.connector.get_historical_data, symbol, self._tf_m15, 200),
                timeout=5.0
            )
        except asyncio.TimeoutError:
            logging.warning(f"[Engine] ⏱️ Timeout (5s) sur get_historical_data({symbol}) — symbole ignoré ce cycle.")
            return
        except Exception as e:
            logging.warning(f"[Engine] Erreur get_historical_data({symbol}): {e}")
            return

        if df is None or len(df) < 2:
            logging.warning(f"[Engine] Pas de données pour {symbol}")
            return
            
        # 1.1 Sécurité Anti-Repainting : Ignorer la bougie en cours (incomplète) pour toutes les stratégies/IA
        df = df.iloc[:-1].copy()

        last_close = df.iloc[-1]['close']
        last_candle_time = df.iloc[-1]['time']
        logging.debug(f"[Engine] {symbol} M5 Last Close: {last_close:.5f}")
        
        # Filtre Macro-Économique
        if self.news_filter.is_news_embargo(symbol):
            # En embargo de news: on skip la recherche de nouveaux signaux
            return

        # 2. Nourrir les stratégies
        for strategy in self._symbol_strategies[symbol]:
            strategy.update_data(df)

        # 3. Signal technique via l'Aggregator
        signal: Optional[Signal] = self._symbol_aggregators[symbol].aggregate(symbol)
        self.latest_signals[symbol] = signal
        if not signal:
            return
            
        # 3.1 Anti-Spam (Un seul signal par bougie fermée)
        if self._last_signal_candle.get(symbol) == last_candle_time:
            return
        self._last_signal_candle[symbol] = last_candle_time

        # --- NOUVEAU: Filtre Global de Tendance (ADX > 25) ---
        try:
            import ta
            adx_series = ta.trend.adx(df['high'], df['low'], df['close'], window=14)
            current_adx = adx_series.iloc[-1]
            if current_adx < 25:
                if signal.confidence >= 0.90:
                    logging.info(f"[Engine] ⚡ ADX Bypass: Signal de Haute Qualité Institutionnelle (Conférence {signal.confidence*100}%) sur {symbol}. L'ADX est ignoré.")
                else:
                    logging.info(f"[Engine] 🛑 Rejet ADX: Marché en range sur {symbol} (ADX = {current_adx:.1f} < 25).")
                    return
        except Exception as e:
            logging.warning(f"[Engine] Erreur calcul ADX: {e}")


        # Pré-calcul SL/TP pour l'affichage Dashboard
        pip_size = StrategyBase.get_pip_size(symbol)
        sl_price, tp_price = self._compute_sl_tp_prices(
            symbol=symbol,
            direction=signal.direction,
            sl_pips=signal.sl_pips,
            tp_pips=signal.tp_pips,
            pip_size=pip_size,
            df=df
        )

        logging.info(
            f"[Engine] 📊 NOUVEAU SIGNAL: {signal.direction.name} {symbol} @ {last_close:.5f} | "
            f"SL: {sl_price:.5f} ({signal.sl_pips} pips) | TP: {tp_price:.5f} ({signal.tp_pips} pips) | "
            f"Source: {signal.source}"
        )

        # 4. Filtre ML — timeout 10s (le modèle LSTM peut être lent sur CPU)
        try:
            validated_signal = await asyncio.wait_for(
                asyncio.to_thread(self.ml_predictor.filter_signal, signal, df),
                timeout=10.0
            )
        except asyncio.TimeoutError:
            logging.warning(f"[Engine] ⏱️ Timeout ML (10s) sur {symbol} — signal ignoré ce cycle.")
            return
        if not validated_signal:
            logging.info(f"[Engine] 🤖 Signal {signal.direction.name} {symbol} rejeté par ML.")
            return

        # 5. Sanity Check RTS 6 (PreTradeValidator)
        if not self.state_manager.account:
            return

        # --- Bloqueur de Pyramiding (Account Blow-up Protection) ---
        has_open_position = any(p.symbol == symbol for p in self.state_manager.positions)
        if has_open_position:
            logging.info(f"[Engine] 🛡️ Rejet: Position déjà ouverte sur {symbol}. Pyramiding interdit.")
            return
            
        # --- Limite d'Exposition Globale (Max 2 trades simultanés) ---
        bot_positions = [p for p in self.state_manager.positions if getattr(p, 'magic', 0) != 0]
        if len(bot_positions) >= 2:
            logging.info(f"[Engine] 🛡️ Rejet: Limite d'exposition globale atteinte (Max 2 trades simultanés).")
            return

        pip_size = StrategyBase.get_pip_size(symbol)
        
        # Récupération du spread en temps réel et contraintes de volume (offload MT5 → timeout 4s)
        try:
            sym_info = await asyncio.wait_for(
                asyncio.to_thread(self.connector.get_symbol_info, symbol),
                timeout=4.0
            )
        except asyncio.TimeoutError:
            logging.warning(f"[Engine] ⏱️ Timeout (4s) sur get_symbol_info({symbol}) — valeurs par défaut de spread/volumes.")
            sym_info = None
        except Exception as e:
            logging.warning(f"[Engine] Erreur get_symbol_info({symbol}): {e}")
            sym_info = None

        current_spread_pips = 1.0  # Valeur par défaut
        min_vol = 0.01
        max_vol = 100.0
        vol_step = 0.01

        if sym_info:
            if getattr(sym_info, 'spread', None) is not None:
                current_spread_pips = sym_info.spread * (sym_info.point / pip_size)
            min_vol = getattr(sym_info, 'volume_min', 0.01)
            max_vol = getattr(sym_info, 'volume_max', 100.0)
            vol_step = getattr(sym_info, 'volume_step', 0.01)

        # Offload SQLAlchemy queries to a background thread — timeout 4s strict
        try:
            is_valid = await asyncio.wait_for(
                asyncio.to_thread(
                    self.pretrade_validator.validate_signal, 
                    validated_signal, 
                    self.state_manager.account, 
                    current_spread_pips,
                    self.state_manager.positions
                ),
                timeout=4.0
            )
        except asyncio.TimeoutError:
            logging.warning(f"[Engine] ⏱️ Timeout PreTradeValidator (4s) sur {symbol} — signal ignoré.")
            return
        if not is_valid:
            # Le Validator gère lui-même ses propres logs d'erreurs détaillés
            return

        # --- NOUVEAU: Protection Dynamique du Spread vs Stop Loss ---
        if validated_signal.sl_pips and (validated_signal.sl_pips < current_spread_pips * 1.5):
            logging.warning(
                f"[Engine] 🚫 Rejet: Le Spread dévore le SL "
                f"(SL={validated_signal.sl_pips:.1f} pips | Spread={current_spread_pips:.1f} pips). Suicide mathématique évité."
            )
            return

        # 6. Injection Dynamique du Risque et Calcul du Volume
        try:
            from api.server import _runtime_settings
            self.position_sizer.MAX_RISK_PCT = getattr(_runtime_settings, 'risk_percent', 0.02)
        except ImportError:
            pass

        # SQLAlchemy offloaded to thread — timeout 4s strict
        try:
            volume = await asyncio.wait_for(
                asyncio.to_thread(
                    self.position_sizer.compute_volume,
                    validated_signal,
                    self.state_manager.account,
                    self._get_pip_value(symbol, sym_info),
                    validated_signal.sl_pips,
                    min_vol,
                    max_vol,
                    vol_step
                ),
                timeout=4.0
            )
        except asyncio.TimeoutError:
            logging.warning(f"[Engine] ⏱️ Timeout (4s) sur compute_volume({symbol}) — signal ignoré.")
            return

        # 7. Convertir SL/TP pips → prix absolus pour MT5
        sl_price, tp_price = self._compute_sl_tp_prices(
            symbol=symbol,
            direction=validated_signal.direction,
            sl_pips=validated_signal.sl_pips,
            tp_pips=validated_signal.tp_pips,
            pip_size=pip_size,
            df=df
        )

        logging.warning(
            f"[Engine] 🚀 EXÉCUTION {validated_signal.direction.name} {volume} lots "
            f"sur {symbol} | SL={sl_price:.5f} | TP={tp_price:.5f} | "
            f"ML Confidence={validated_signal.metadata.get('ml_confidence', 'N/A')}"
        )

        # 8. Exécution de l'ordre (Offload asynchrone Hummingbot-style)
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
        logging.info(f"[Engine] ⚡ Ordre {validated_signal.direction.name} {volume} sur {symbol} mis en queue de routage asynchrone.")

    def _compute_sl_tp_prices(
        self, symbol: str, direction: OrderType,
        sl_pips: Optional[float], tp_pips: Optional[float],
        pip_size: float, df
    ):
        """Convertit SL/TP en pips vers des prix absolus."""
        try:
            current_price = float(df.iloc[-1]['close'])
        except Exception:
            current_price = 0.0

        # Valeurs par défaut si SL/TP absents
        if not sl_pips or sl_pips <= 0:
            sl_pips = 20.0
        if not tp_pips or tp_pips <= 0:
            tp_pips = 35.0

        sl_dist = sl_pips * pip_size
        tp_dist = tp_pips * pip_size

        if direction == OrderType.BUY:
            sl_price = current_price - sl_dist
            tp_price = current_price + tp_dist
        else:
            sl_price = current_price + sl_dist
            tp_price = current_price - tp_dist

        return round(sl_price, 5), round(tp_price, 5)

    def _classify_deal_close_reason(self, deal) -> str:
        """Classifie le motif de clôture d'un deal MT5 (SL, TP, Manuel, EA, Stop Out)."""
        comment = str(getattr(deal, 'comment', '')).lower()
        reason = getattr(deal, 'reason', None)

        # 1. Take Profit (DEAL_REASON_TP = 5 ou mention [tp]/[tp xx])
        if reason == getattr(mt5, 'DEAL_REASON_TP', 5) or "[tp" in comment or " tp" in comment or comment.rstrip().endswith("tp") or comment.lstrip().startswith("tp"):
            return "Take Profit (TP)"
            
        # 2. Stop Loss (DEAL_REASON_SL = 4 ou mention [sl]/[sl xx])
        if reason == getattr(mt5, 'DEAL_REASON_SL', 4) or "[sl" in comment or " sl" in comment or comment.rstrip().endswith("sl") or comment.lstrip().startswith("sl"):
            return "Stop Loss (SL)"
            
        # 3. Stop Out (DEAL_REASON_SO = 6 ou mention so/stop out)
        if reason == getattr(mt5, 'DEAL_REASON_SO', 6) or "stop out" in comment or "so:" in comment:
            return "Stop Out (Margin Call)"

        # 4. Clôture par le Bot/EA (DEAL_REASON_EXPERT = 3 ou commentaire marketshift/expert) — prioritaire
        #    sur la raison générique 0, car le commentaire de clôture du bot est plus spécifique.
        if reason == getattr(mt5, 'DEAL_REASON_EXPERT', 3) or "marketshift" in comment or "expert" in comment:
            return "Expert Advisor (EA)"

        # 5. Clôture Manuelle par l'utilisateur (DEAL_REASON_CLIENT = 0, MOBILE = 1, WEB = 2)
        if reason == getattr(mt5, 'DEAL_REASON_CLIENT', 0) or "client" in comment or "manual" in comment:
            return "Manual / Client"
        if reason == getattr(mt5, 'DEAL_REASON_MOBILE', 1):
            return "Manual / Mobile"
        if reason == getattr(mt5, 'DEAL_REASON_WEB', 2):
            return "Manual / Web"

        return "Closed / Market"

    def _refresh_kelly_history(self):
        """Récupère l'historique réel MT5 pour alimenter le Kelly Criterion et notifier les clôtures (Thread-Safe)."""
        try:
            import datetime as _dt
            from_date = _dt.datetime.now() - _dt.timedelta(days=60)
            to_date   = _dt.datetime.now() + _dt.timedelta(days=1)

            deals = self.connector.get_history_deals(from_date, to_date)
            if deals is None:
                return

            # Étape 1 : Initialisation sans spam au premier appel (cold start)
            is_initial_run = not self._deals_initialized
            if is_initial_run:
                for d in deals:
                    t = getattr(d, 'ticket', None)
                    if t is not None:
                        self._seen_deal_tickets.add(t)
                self._deals_initialized = True
                logging.info(f"[Engine] Historique des deals initialisé ({len(self._seen_deal_tickets)} tickets enregistrés sans alerte).")

            closed = []
            new_closed_deals = []
            for d in deals:
                if getattr(d, 'profit', 0) != 0 and getattr(d, 'symbol', '') != '':  # Ignorer les deals sans P&L et les dépôts
                    # --- CORRECTION ANOMALIE : GHOST LEDGER ---
                    d_time = getattr(d, 'time', None)
                    parsed_time = _dt.datetime.fromtimestamp(d_time) if isinstance(d_time, (int, float)) else (d_time or _dt.datetime.now())
                    deal_type_str = 'BUY' if getattr(d, 'type', 0) == getattr(mt5, 'DEAL_TYPE_BUY', 0) else 'SELL'
                    closed.append({
                        'pnl': float(d.profit), 
                        'symbol': str(d.symbol), 
                        'ticket': int(d.ticket), 
                        'time': parsed_time,
                        'volume': float(d.volume),
                        'type': deal_type_str,
                        'magic': getattr(d, 'magic', 0)
                    })

                # Détection des nouveaux deals clôturés pour notification Telegram
                deal_ticket = getattr(d, 'ticket', None)
                if not is_initial_run and deal_ticket is not None and deal_ticket not in self._seen_deal_tickets:
                    self._seen_deal_tickets.add(deal_ticket)
                    is_close_deal = (
                        getattr(d, 'symbol', '') != '' and
                        (getattr(d, 'profit', 0) != 0 or getattr(d, 'entry', None) in (1, 2, 3))
                    )
                    if is_close_deal:
                        new_closed_deals.append(d)

            # Étape 2 : Notification Telegram des positions clôturées
            if self.notifier and new_closed_deals:
                for d in new_closed_deals:
                    try:
                        if getattr(d, 'entry', None) == 1:
                            direction = 'BUY' if getattr(d, 'type', 1) == getattr(mt5, 'DEAL_TYPE_SELL', 1) else 'SELL'
                        else:
                            if isinstance(getattr(d, 'type', None), str):
                                direction = d.type
                            else:
                                direction = 'BUY' if getattr(d, 'type', 0) == getattr(mt5, 'DEAL_TYPE_BUY', 0) else 'SELL'

                        ticket_id = getattr(d, 'position_id', 0) or getattr(d, 'ticket', 0)
                        close_reason = self._classify_deal_close_reason(d)
                        close_price = float(d.price) if getattr(d, 'price', None) is not None else None

                        self.notifier.notify_trade_closed(
                            ticket=int(ticket_id),
                            symbol=str(d.symbol),
                            direction=direction,
                            volume=float(d.volume),
                            profit=float(d.profit),
                            reason=close_reason,
                            close_price=close_price
                        )
                    except Exception as alert_err:
                        logging.error(f"[Engine] Erreur notification deal #{getattr(d, 'ticket', '?')}: {alert_err}")

            if closed != self._closed_trades_cache:
                self._closed_trades_cache = closed
                self.position_sizer.update_history(closed)
                
                # Persistance en Base de Données SQLite
                if self.db:
                    try:
                        from infrastructure.models import TradeRecord
                        for c in closed:
                            # Vérifier si le ticket existe déjà pour ne pas dupliquer
                            existing = self.db.query(TradeRecord).filter(TradeRecord.ticket == c['ticket']).first()
                            if not existing:
                                new_record = TradeRecord(
                                    account_login=self.state_manager.account.login if self.state_manager.account else None,
                                    ticket=c['ticket'],
                                    magic=c['magic'],
                                    symbol=c['symbol'],
                                    profit=c['pnl'],
                                    close_time=c['time'],
                                    volume=c['volume'],
                                    type=c['type']
                                )
                                self.db.add(new_record)
                        self.db.commit()
                    except Exception as db_err:
                        self.db.rollback()
                        logging.error(f"[Engine] Erreur sauvegarde DB SQLite : {db_err}")

        except Exception as e:
            logging.error(f"[Engine] Erreur Kelly historique : {e}")

    def _dispatch_daily_summary(self, target_date_str: Optional[str] = None) -> bool:
        """Calcule et dispatche le résumé journalier pour une date cible (format YYYY-MM-DD)."""
        try:
            if target_date_str is None:
                target_date = datetime.date.today() - datetime.timedelta(days=1)
                target_date_str = target_date.strftime("%Y-%m-%d")
            else:
                target_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d").date()

            start_of_day = datetime.datetime.combine(target_date, datetime.time.min)
            end_of_day = datetime.datetime.combine(target_date, datetime.time.max)

            daily_pnl = 0.0
            total_trades = 0

            # 1. Vérifier dans self._closed_trades_cache
            trades_found_in_cache = False
            if self._closed_trades_cache:
                for t in self._closed_trades_cache:
                    t_time = t.get('time')
                    if t_time:
                        t_date = t_time.date() if isinstance(t_time, datetime.datetime) else t_time
                        if str(t_date) == target_date_str or t_date == target_date:
                            daily_pnl += float(t.get('pnl', 0.0))
                            total_trades += 1
                            trades_found_in_cache = True

            # 2. Si non trouvé dans le cache, interroger connector.get_history_deals
            #    (appel exécuté hors de la boucle principale — cf. _check_daily_summary)
            if not trades_found_in_cache:
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

            win_rate = float(getattr(self.position_sizer, 'win_rate', 0.0))
            try:
                kelly_fraction = float(self.position_sizer.compute_kelly_fraction())
            except Exception:
                kelly_fraction = 0.0

            account = getattr(self.state_manager, 'account', None)
            balance = float(account.balance) if account and hasattr(account, 'balance') else 0.0
            equity = float(account.equity) if account and hasattr(account, 'equity') else 0.0

            logging.info(
                f"[Engine] 📅 Résumé journalier ({target_date_str}) : "
                f"PnL={daily_pnl:.2f}, Trades={total_trades}, WinRate={win_rate:.1%}, "
                f"Kelly={kelly_fraction:.4f}, Balance={balance:.2f}, Equity={equity:.2f}"
            )

            if self.notifier:
                self.notifier.notify_daily_summary(
                    date_str=target_date_str,
                    daily_pnl=daily_pnl,
                    win_rate=win_rate,
                    kelly_fraction=kelly_fraction,
                    total_trades=total_trades,
                    balance=balance,
                    equity=equity
                )
            return True
        except Exception as e:
            logging.error(f"[Engine] Erreur dispatch daily summary: {e}")
            return False

    def _check_daily_summary(self, current_dt: Optional[datetime.datetime] = None, force: bool = False) -> bool:
        """Détecte le passage à minuit (date rollover) et dispatche le résumé journalier."""
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
                res = self._dispatch_daily_summary(date_str)
                self._last_summary_date = current_date
                return res

            return False
        except Exception as e:
            logging.error(f"[Engine] Erreur check daily summary: {e}")
            return False

    def _apply_trailing_stops(self):
        """Applique le Trailing Stop sur toutes les positions ouvertes par le bot."""
        try:
            from api.server import _runtime_settings
            if not getattr(_runtime_settings, 'trailing_stop_active', False):
                return
            multiplier = getattr(_runtime_settings, 'trailing_stop_multiplier', 1.0)
        except ImportError:
            return  # Si lancé hors FastAPI

        for p in self.state_manager.positions:
            # Ignorer les trades manuels de l'utilisateur (Magic Number = 0)
            if getattr(p, 'magic', 0) == 0:
                continue

            pip_size = StrategyBase.get_pip_size(p.symbol)
            
            # --- NOUVEAU : True Dynamic ATR pour le Trailing Stop ---
            last_signal = getattr(self, 'latest_signals', {}).get(p.symbol)
            if last_signal and getattr(last_signal, 'atr', 0.0) > 0:
                atr_value = last_signal.atr * multiplier
            else:
                # Proxy de secours si l'ATR réel n'est pas dispo
                atr_value = 20.0 * pip_size * multiplier

            new_sl = self.dynamic_ts.calculate_new_stop(
                current_price=p.current_price,
                open_price=p.open_price,
                current_stop=p.sl,
                direction=p.type.name,
                atr_value=atr_value,
                tp_price=p.tp
            )

            # Ne modifier que si la différence est significative (ex: > 0.5 pip) pour éviter l'erreur 10025 (No changes)
            if new_sl and abs(new_sl - p.sl) > (pip_size * 0.5):
                logging.info(f"[Engine] 🛡️ Trailing Stop Elastique ({p.type.name}) ajusté pour {p.symbol} (Ticket {p.ticket}): {p.sl:.5f} -> {new_sl:.5f}")
                self.connector.modify_position(p.ticket, p.symbol, new_sl)
                p.sl = new_sl  # Maj de l'état local

    def _get_pip_value(self, symbol: str, info=None) -> float:
        """
        Retourne la valeur dynamique en $ d'un 'pip' (10 points) selon MT5.
        `info` (déjà récupéré via get_symbol_info) est réutilisé pour éviter tout
        second appel MT5 bloquant depuis la boucle d'événements.
        """
        if info is None:
            info = self.connector.get_symbol_info(symbol)
        if not info:
            return 10.0
            
        point = info.point
        tick_size = info.trade_tick_size
        tick_value = info.trade_tick_value
        
        if tick_size == 0:
            return 10.0
            
        # L'ATR_pips est basé sur une échelle de 10 points par pip.
        # La valeur de 10 points = (10 * point / tick_size) * tick_value
        pip_dollar_value = (10 * point / tick_size) * tick_value
        return float(pip_dollar_value)

    @staticmethod
    def _symbol_to_magic(symbol: str) -> int:
        """Génère un magic number unique par symbole.
        Gère les suffixes broker (EURUSD# → 11001, GOLDmicro → 11004).
        """
        # Normaliser : supprimer #, ., et suffixes broker
        base = symbol.upper().replace('#', '').replace('.', '').replace('_', '').replace('MICRO', '')
        magic_map = {
            'EURUSD': 11001,
            'GBPUSD': 11002,
            'USDJPY': 11003,
            'XAUUSD': 11004,
            'GOLD':   11004,
            'USDCHF': 11005,
            'AUDUSD': 11006,
            'USDCAD': 11007,
            'USDCNH': 11008,
            'EURGBP': 11009,
            'XAGUSD': 11010,
            'SILVER': 11010,
        }
        return magic_map.get(base, 10000 + abs(hash(base)) % 1000)

    async def _trailing_stop_worker(self):
        """
        Worker asynchrone dédié au Trailing Stop (Haute fréquence).
        S'exécute toutes les 2 secondes indépendamment du cycle d'analyse lourd.
        """
        logging.info("[Engine] 🛡️ Trailing Stop Worker démarré (2s interval).")
        while self.running:
            try:
                if not self.kill_switch.is_triggered:
                    # Offload au thread pour ne pas bloquer l'event loop avec les appels réseau MT5 — timeout 4s strict
                    try:
                        await asyncio.wait_for(
                            asyncio.to_thread(self._apply_trailing_stops),
                            timeout=4.0
                        )
                    except asyncio.TimeoutError:
                        logging.warning("[Engine] ⏱️ Timeout (4s) sur trailing stop worker — modification SL ignorée ce tour.")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logging.error(f"[Engine] Erreur Trailing Stop Worker: {e}")
            await asyncio.sleep(2.0)

    async def _order_routing_worker(self):
        """
        Worker asynchrone (Hummingbot-style).
        Dépile les ordres de la file et les exécute sans bloquer la boucle principale.
        """
        logging.info("[Engine] ⚡ Order Routing Worker démarré.")
        while self.running:
            try:
                # Attend un ordre de la queue
                payload = await self.order_queue.get()
                
                # Exécution (offload au ThreadPool pour ne pas bloquer ce worker si MT5 est lent) — timeout 4s strict
                try:
                    result = await asyncio.wait_for(
                        asyncio.to_thread(
                            self.connector.execute_order,
                            payload['symbol'],
                            payload['direction'],
                            payload['volume'],
                            payload['sl_price'],
                            payload['tp_price'],
                            payload['magic']
                        ),
                        timeout=4.0
                    )
                except asyncio.TimeoutError:
                    logging.warning(
                        f"[Engine] ⏱️ Timeout (4s) sur exécution ordre {payload['symbol']} — "
                        "ordre abandonné, prochain ordre traité."
                    )
                    self.order_queue.task_done()
                    continue

                if result:
                    logging.info(
                        f"[Engine] ✅ Ordre exécuté ! Ticket: {result['ticket']} | "
                        f"Prix: {result['price']} | Volume: {result['volume']}"
                    )
                    
                    # Trace d'Audit MiFID II
                    try:
                        from utils.audit_trail import AuditTrail
                        if not hasattr(self, 'audit_trail'):
                            self.audit_trail = AuditTrail()
                        
                        self.audit_trail.log_order({
                            'ticket': result['ticket'],
                            'symbol': payload['symbol'],
                            'direction': payload['direction'].name if hasattr(payload['direction'], 'name') else str(payload['direction']),
                            'volume': result['volume'],
                            'price': result['price'],
                            'sl': payload['sl_price'],
                            'tp': payload['tp_price'],
                            'ml_confidence': payload.get('metadata', {}).get('ml_confidence', 0.0) if isinstance(payload.get('metadata'), dict) else 0.0
                        })
                    except Exception as e:
                        logging.error(f"[Engine] Erreur AuditTrail : {e}")

                    # Alerte Telegram Trade Opened (Non-bloquante < 0.05ms)
                    if self.notifier:
                        try:
                            dir_name = payload['direction'].name if hasattr(payload['direction'], 'name') else str(payload['direction']).replace('OrderType.', '')
                            metadata = payload.get('metadata') if isinstance(payload.get('metadata'), dict) else {}
                            ml_conf = metadata.get('ml_confidence') if metadata else None
                            self.notifier.notify_trade_opened(
                                symbol=str(payload['symbol']),
                                direction=str(dir_name),
                                volume=float(result.get('volume', payload.get('volume', 0.0))),
                                price=float(result.get('price', 0.0)),
                                sl=float(payload.get('sl_price', 0.0)),
                                tp=float(payload.get('tp_price', 0.0)),
                                ticket=int(result.get('ticket', 0)),
                                ml_confidence=float(ml_conf) if ml_conf is not None else None
                            )
                        except Exception as alert_err:
                            logging.error(f"[Engine] Erreur dispatch trade opened: {alert_err}")
                        
                self.order_queue.task_done()
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logging.error(f"[Engine] Erreur Order Routing Worker: {e}")
