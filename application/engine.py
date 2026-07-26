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
from typing import Dict, Optional

from application.state_manager import StateManager
from application.position_sizer import PositionSizer
from agents.kill_switch import KillSwitch
from agents.circuit_breaker import CircuitBreaker
from risk.pretrade_validator import PreTradeValidator
from risk.dynamic_trailing_stop import DynamicTrailingStop
from core.interfaces import IBrokerConnector, OrderType, Signal
from infrastructure.config import Config

from strategies.aggregator import SignalAggregator
from strategies.ema_crossover import EMACrossoverStrategy
from strategies.rsi_macd import RsiMacdStrategy
from strategies.smc_ict import SMCStrategy
from strategies.base import StrategyBase

import MetaTrader5 as mt5

from ml.trainer import MLTrainer
from ml.predictor import MLPredictor


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

        # Stocker les constantes MT5 à l'init pour éviter tout problème de scope
        # mt5.TIMEFRAME_M1 = 1
        self._tf_m1  = mt5.TIMEFRAME_M1
        self._tf_m15 = mt5.TIMEFRAME_M15

        # Multi-symbole : chaque symbole a ses propres instances de stratégies
        self.symbols: list = Config.TRADING_SYMBOLS
        self._symbol_strategies: Dict[str, list] = {}
        self._symbol_aggregators: Dict[str, SignalAggregator] = {}

        for symbol in self.symbols:
            strategies = [
                EMACrossoverStrategy(
                    name=f"EMA_Crossover_{symbol}", weight=1.0,
                    sl_multiplier=Config.ATR_SL_MULTIPLIER,
                    tp_multiplier=Config.ATR_TP_MULTIPLIER
                ),
                RsiMacdStrategy(
                    name=f"RSI_MACD_{symbol}", weight=1.5,
                    sl_multiplier=Config.ATR_SL_MULTIPLIER,
                    tp_multiplier=Config.ATR_TP_MULTIPLIER
                ),
                SMCStrategy(
                    name=f"SMC_{symbol}", weight=2.0,
                    sl_multiplier=Config.ATR_SL_MULTIPLIER,
                    tp_multiplier=Config.ATR_TP_MULTIPLIER
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
        self._closed_trades_cache = []

        logging.info(
            f"[Engine] Initialisé avec {len(self.symbols)} symboles: {', '.join(self.symbols)}"
        )

    def start(self):
        if not self.connector.connect():
            logging.error("[Engine] Échec de connexion au broker. Engine non démarré.")
            return

        self.running = True
        self._thread = threading.Thread(target=self._run_async_loop_thread, daemon=True)
        self._thread.start()

        # Démarrer l'auto-entraînement ML en arrière-plan
        self.ml_trainer.start_auto_retrain(self.connector, self.symbols)

        logging.info("[Engine] ✅ Démarré avec succès en mode Asyncio.")

    def _run_async_loop_thread(self):
        """Démarre la boucle d'événements asyncio dans le thread dédié."""
        asyncio.run(self._async_run_loop())

    def stop(self):
        self.running = False
        self.ml_trainer.stop()
        if self._thread:
            self._thread.join(timeout=5)
        self.connector.disconnect()
        logging.info("[Engine] ⛔ Arrêté.")

    async def _async_run_loop(self):
        """Boucle principale de trading multi-symbole en mode asynchrone (100% parallèle)."""
        self.order_queue = asyncio.Queue()
        worker_task = asyncio.create_task(self._order_routing_worker())
        
        while self.running:
            if self.kill_switch.is_triggered:
                await asyncio.sleep(1)
                continue

            start_time = time.time()

            # Mise à jour de l'état du compte et des positions (Bloquant mais rapide)
            await asyncio.to_thread(self.state_manager.update_state)

            # Vérifications de sécurité (Circuit Breaker)
            self.circuit_breaker.check()

            # Application du Trailing Stop Dynamique
            await asyncio.to_thread(self._apply_trailing_stops)

            # Mise à jour du Kelly Criterion avec les trades fermés
            self._refresh_kelly_history()

            # Mettre à jour le seuil de confidence ML depuis les settings runtime
            self.ml_predictor.set_confidence_threshold(Config.ML_CONFIDENCE_THRESHOLD)

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
            logging.debug(f"[Engine] Cycle d'analyse terminé en {elapsed:.3f}s pour {len(self.symbols)} symboles.")

            # Attendre précisément la prochaine minute (00s) au lieu d'un time.sleep(60) aveugle
            now = datetime.datetime.now()
            seconds_to_next_minute = 60 - now.second - (now.microsecond / 1_000_000.0)
            if seconds_to_next_minute < 0.1:
                seconds_to_next_minute += 60.0
            
            await asyncio.sleep(seconds_to_next_minute)

    async def _process_symbol_async(self, symbol: str):
        """Traite un symbole de manière asynchrone : données → signal → ML → sizing → exécution."""
        # 1. Récupérer les données OHLCV M1 (Offload au ThreadPool pour ne pas bloquer l'Event Loop)
        # On utilise self._tf_m1 (stocké dans __init__) pour éviter tout problème de scope Python 3.14
        df = await asyncio.to_thread(self.connector.get_historical_data, symbol, self._tf_m1, 200)
        if df is None or df.empty:
            logging.warning(f"[Engine] Pas de données pour {symbol}")
            return

        last_close = df.iloc[-1]['close']
        logging.debug(f"[Engine] {symbol} M1 Last Close: {last_close:.5f}")

        # 2. Nourrir les stratégies
        for strategy in self._symbol_strategies[symbol]:
            strategy.update_data(df)

        # 3. Signal technique via l'Aggregator
        signal: Optional[Signal] = self._symbol_aggregators[symbol].aggregate(symbol)
        if not signal:
            return

        logging.info(
            f"[Engine] 📊 Signal technique {signal.direction.name} sur {symbol} "
            f"(Confiance: {signal.confidence:.2f}, Source: {signal.source})"
        )

        # 4. Filtre ML — valide ou rejette le signal
        validated_signal = self.ml_predictor.filter_signal(signal, df)
        if not validated_signal:
            logging.info(f"[Engine] 🤖 Signal {signal.direction.name} {symbol} rejeté par ML.")
            return

        # 5. Sanity Check RTS 6 (PreTradeValidator)
        if not self.state_manager.account:
            return

        pip_size = StrategyBase.get_pip_size(symbol)
        
        # Récupération du spread en temps réel
        sym_info = await asyncio.to_thread(self.connector.get_symbol_info, symbol)
        current_spread_pips = 1.0  # Valeur par défaut
        if sym_info and getattr(sym_info, 'spread', None) is not None:
            # sym_info.spread est en points, on le convertit en pips
            current_spread_pips = sym_info.spread * (sym_info.point / pip_size)

        # Offload SQLAlchemy queries to a background thread to prevent blocking the async loop
        is_valid = await asyncio.to_thread(
            self.pretrade_validator.validate_signal,
            validated_signal, self.state_manager.account, current_spread_pips
        )
        if not is_valid:
            # Le Validator gère lui-même ses propres logs d'erreurs détaillés
            return

        # 6. Calcul du volume via Kelly Criterion
        volume = self.position_sizer.compute_volume(
            signal=validated_signal,
            account=self.state_manager.account,
            pip_value=self._get_pip_value(symbol),
            sl_pips=validated_signal.sl_pips
        )

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

    def _refresh_kelly_history(self):
        """Récupère l'historique réel MT5 pour alimenter le Kelly Criterion."""
        # Utiliser mt5 module-level (déjà importé en haut du fichier)
        # NE PAS faire 'import MetaTrader5 as mt5' ici — cela créerait une variable locale
        # qui entrerait en conflit avec le mt5 module-level sous Python 3.14+
        try:
            import datetime as _dt
            from_date = _dt.datetime.now() - _dt.timedelta(days=60)
            to_date   = _dt.datetime.now()

            deals = mt5.history_deals_get(from_date, to_date)
            if deals is None:
                return

            closed = []
            for d in deals:
                if d.profit != 0:  # Ignorer les deals sans P&L
                    closed.append({'pnl': d.profit, 'symbol': d.symbol, 'ticket': d.ticket})

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
                                    ticket=c['ticket'],
                                    symbol=c['symbol'],
                                    profit=c['pnl']
                                )
                                self.db.add(new_record)
                        self.db.commit()
                    except Exception as db_err:
                        self.db.rollback()
                        logging.error(f"[Engine] Erreur sauvegarde DB SQLite : {db_err}")

        except Exception as e:
            logging.error(f"[Engine] Erreur Kelly historique : {e}")

    def _apply_trailing_stops(self):
        """Applique le Trailing Stop sur toutes les positions ouvertes."""
        try:
            from api.server import _runtime_settings
            if not getattr(_runtime_settings, 'trailing_stop_active', False):
                return
            multiplier = getattr(_runtime_settings, 'trailing_stop_multiplier', 1.0)
        except ImportError:
            return  # Si lancé hors FastAPI

        for p in self.state_manager.positions:
            pip_size = StrategyBase.get_pip_size(p.symbol)
            # Distance de base (proxy pour ATR = 20 pips)
            atr_value = 20.0 * pip_size * multiplier

            new_sl = self.dynamic_ts.calculate_new_stop(
                current_price=p.current_price,
                open_price=p.open_price,
                current_stop=p.sl,
                direction=p.type.name,
                atr_value=atr_value
            )

            if new_sl:
                logging.info(f"[Engine] 🛡️ Trailing Stop Elastique ({p.type.name}) ajusté pour {p.symbol} (Ticket {p.ticket}): {p.sl:.5f} -> {new_sl:.5f}")
                self.connector.modify_position(p.ticket, p.symbol, new_sl)
                p.sl = new_sl  # Maj de l'état local

    @staticmethod
    def _get_pip_value(symbol: str) -> float:
        """Retourne la valeur en $ d'un pip par lot standard selon le symbole.
        Gère les suffixes XM (#) et noms alternatifs (GOLD# = XAU/USD).
        """
        s = symbol.upper().replace('#', '').replace('.', '')
        if 'JPY' in s:
            return 9.30
        elif 'XAU' in s or s == 'GOLD':
            return 10.0
        elif 'XAG' in s or s == 'SILVER':
            return 5.0
        elif 'GBP' in s:
            return 10.0
        else:
            return 10.0

    @staticmethod
    def _symbol_to_magic(symbol: str) -> int:
        """Génère un magic number unique par symbole.
        Gère les suffixes broker (EURUSD# → 11001, GOLD# → 11004).
        """
        # Normaliser : supprimer # et suffixes broker
        base = symbol.upper().replace('#', '').replace('.', '').replace('_', '')
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
                
                # Exécution (offload au ThreadPool pour ne pas bloquer ce worker si MT5 est lent)
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
                    
                    # Trace d'Audit MiFID II
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
