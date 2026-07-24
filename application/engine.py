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
from typing import Dict, Optional

from application.state_manager import StateManager
from application.position_sizer import PositionSizer
from agents.kill_switch import KillSwitch
from agents.circuit_breaker import CircuitBreaker
from agents.order_prechecker import OrderPreCheckerAgent
from core.interfaces import IBrokerConnector, OrderType, Signal
from infrastructure.config import Config

from strategies.aggregator import SignalAggregator
from strategies.ema_crossover import EMACrossoverStrategy
from strategies.rsi_macd import RsiMacdStrategy
from strategies.base import StrategyBase

import MetaTrader5 as mt5

from ml.trainer import MLTrainer
from ml.predictor import MLPredictor


class Engine:
    def __init__(self, connector: IBrokerConnector):
        self.connector     = connector
        self.state_manager = StateManager(connector)
        self.kill_switch   = KillSwitch(connector)
        self.circuit_breaker = CircuitBreaker(self.state_manager, self.kill_switch)
        self.prechecker    = OrderPreCheckerAgent()
        self.position_sizer = PositionSizer()

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
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

        # Démarrer l'auto-entraînement ML en arrière-plan
        self.ml_trainer.start_auto_retrain(self.connector, self.symbols)

        logging.info("[Engine] ✅ Démarré avec succès.")

    def stop(self):
        self.running = False
        self.ml_trainer.stop()
        if self._thread:
            self._thread.join(timeout=5)
        self.connector.disconnect()
        logging.info("[Engine] ⛔ Arrêté.")

    def _run_loop(self):
        """Boucle principale de trading multi-symbole."""
        while self.running:
            if self.kill_switch.is_triggered:
                time.sleep(1)
                continue

            # Mise à jour de l'état du compte et des positions
            self.state_manager.update_state()

            # Vérifications de sécurité (Circuit Breaker)
            self.circuit_breaker.check()

            # Mise à jour du Kelly Criterion avec les trades fermés
            self._refresh_kelly_history()

            # Mettre à jour le seuil de confidence ML depuis les settings runtime
            self.ml_predictor.set_confidence_threshold(Config.ML_CONFIDENCE_THRESHOLD)

            # ── Boucle multi-symbole ──────────────────────────────────────────
            for symbol in self.symbols:
                if self.kill_switch.is_triggered:
                    break

                try:
                    self._process_symbol(symbol)
                except Exception as e:
                    logging.error(f"[Engine] Erreur traitement {symbol}: {e}")

                # Délai entre symboles pour ne pas surcharger MT5
                time.sleep(0.5)

            # Attendre avant le prochain tick (M1)
            time.sleep(60)

    def _process_symbol(self, symbol: str):
        """Traite un symbole : données → signal → ML → sizing → exécution."""
        # 1. Récupérer les données OHLCV M1 (200 bougies pour ML features)
        # On utilise self._tf_m1 (stocké dans __init__) pour éviter tout problème de scope Python 3.14
        df = self.connector.get_historical_data(symbol, self._tf_m1, 200)
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

        # 5. Sanity Check RTS 6 (OrderPreChecker)
        if not self.state_manager.account:
            return

        if not self.prechecker.validate_signal(validated_signal, self.state_manager.account):
            logging.warning(f"[Engine] ⚠️ Signal {symbol} rejeté par OrderPreChecker (RTS 6).")
            return

        # 6. Calcul du volume via Kelly Criterion
        pip_size = StrategyBase.get_pip_size(symbol)
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

        # 8. Exécution de l'ordre
        result = self.connector.execute_order(
            symbol=symbol,
            order_type=validated_signal.direction,
            volume=volume,
            sl=sl_price,
            tp=tp_price,
            magic=self._symbol_to_magic(symbol)
        )

        if result:
            logging.info(
                f"[Engine] ✅ Ordre exécuté ! Ticket: {result['ticket']} | "
                f"Prix: {result['price']} | Volume: {result['volume']}"
            )

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
                    closed.append({'pnl': d.profit, 'symbol': d.symbol})

            if closed != self._closed_trades_cache:
                self._closed_trades_cache = closed
                self.position_sizer.update_history(closed)

        except Exception as e:
            logging.debug(f"[Engine] Erreur refresh Kelly history: {e}")

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
