import time
import logging
import threading
from application.state_manager import StateManager
from agents.kill_switch import KillSwitch
from agents.circuit_breaker import CircuitBreaker
from agents.order_prechecker import OrderPreCheckerAgent
from core.interfaces import IBrokerConnector, OrderType
import MetaTrader5 as mt5

from strategies.aggregator import SignalAggregator
from strategies.ema_crossover import EMACrossoverStrategy
from strategies.rsi_macd import RsiMacdStrategy

class Engine:
    def __init__(self, connector: IBrokerConnector):
        self.connector = connector
        self.state_manager = StateManager(connector)
        self.kill_switch = KillSwitch(connector)
        self.circuit_breaker = CircuitBreaker(self.state_manager, self.kill_switch)
        self.prechecker = OrderPreCheckerAgent()
        
        # Initialisation du Cerveau Mathématique
        self.strategies = [
            EMACrossoverStrategy(weight=1.0),
            RsiMacdStrategy(weight=1.5)
        ]
        self.aggregator = SignalAggregator(self.strategies)
        
        self.running = False
        self._thread = None

    def start(self):
        if not self.connector.connect():
            return
            
        self.running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logging.info("Engine démarré avec succès.")

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join(timeout=2)
        self.connector.disconnect()
        logging.info("Engine arrêté.")

    def _run_loop(self):
        while self.running:
            if self.kill_switch.is_triggered:
                time.sleep(1)
                continue

            # Update State
            self.state_manager.update_state()
            
            # Checks de sécurité
            self.circuit_breaker.check()

            # --- Data Feed Test (OHLCV) ---
            # Récupération de l'historique M1 pour EURUSD (100 dernières bougies pour le RSI/MACD)
            symbol = "EURUSD"
            df = self.connector.get_historical_data(symbol, mt5.TIMEFRAME_M1, 100)
            
            if df is not None and not df.empty:
                last_close = df.iloc[-1]['close']
                logging.info(f"[Market Data] {symbol} M1 Last Close: {last_close}")
                
                # 1. Nourrir les stratégies avec les nouvelles données
                for strategy in self.strategies:
                    strategy.update_data(df)
                    
                # 2. Demander l'avis du Conseil (Aggregator)
                signal = self.aggregator.aggregate(symbol)
                
                if signal:
                    logging.warning(f"🚀 SIGNAL VALIDÉ PAR L'AGGREGATOR: {signal.direction.name} sur {signal.symbol} (Confiance: {signal.confidence:.2f})")
                    
                    # 3. Sanity Check avant exécution (RTS 6)
                    if self.state_manager.account and self.prechecker.validate_signal(signal, self.state_manager.account):
                        # 4. Exécution (Volume statique pour le moment, à remplacer par Kelly Criterion)
                        volume = 0.01
                        logging.warning(f"⚡ EXÉCUTION DE L'ORDRE {signal.direction.name} {volume} LOTS SUR {symbol}")
                        
                        # Note: Pour un vrai test, commentez execute_order si vous ne voulez pas prendre de vrais trades
                        result = self.connector.execute_order(symbol, signal.direction, volume)
                        if result:
                            logging.info(f"✅ Ordre exécuté avec succès! Ticket: {result['ticket']}")
            
            time.sleep(60) # Tick toutes les minutes
