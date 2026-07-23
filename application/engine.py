import time
import logging
import threading
from application.state_manager import StateManager
from agents.kill_switch import KillSwitch
from agents.circuit_breaker import CircuitBreaker
from agents.order_prechecker import OrderPreCheckerAgent
from core.interfaces import IBrokerConnector
import MetaTrader5 as mt5

class Engine:
    def __init__(self, connector: IBrokerConnector):
        self.connector = connector
        self.state_manager = StateManager(connector)
        self.kill_switch = KillSwitch(connector)
        self.circuit_breaker = CircuitBreaker(self.state_manager, self.kill_switch)
        self.prechecker = OrderPreCheckerAgent()
        
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
            # Récupération des bougies M1 pour EURUSD (5 dernières)
            df = self.connector.get_historical_data("EURUSD", mt5.TIMEFRAME_M1, 5)
            if df is not None and not df.empty:
                last_close = df.iloc[-1]['close']
                logging.info(f"[Market Data] EURUSD M1 Last Close: {last_close}")

            # Placeholder pour l'appel à l'Aggregator et stratégies
            
            time.sleep(60) # Tick toutes les minutes (simulé)
