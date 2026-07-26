import threading
import time
import logging
from agents.kill_switch import KillSwitch
from agents.circuit_breaker import CircuitBreaker

class SurveillanceAgent:
    """
    Agent de Surveillance (Conformité Institutionnelle).
    Tourne sur un thread dédié pour surveiller l'état de l'Engine de l'extérieur.
    Consolide le Kill Switch et le Circuit Breaker pour s'assurer que le bot
    est arrêté proprement si l'équité chute ou si un paramètre critique est violé.
    """
    
    def __init__(self, engine):
        self.engine = engine
        # Le Circuit Breaker et le Kill Switch sont récupérés depuis l'engine
        self.circuit_breaker = engine.circuit_breaker
        self.kill_switch = engine.kill_switch
        self.running = False
        self._thread = None
        
        logging.info("[SurveillanceAgent] Initialisé. Prêt à surveiller l'Engine.")

    def start(self):
        self.running = True
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True, name="SurveillanceThread")
        self._thread.start()
        logging.info("[SurveillanceAgent] Thread de surveillance démarré.")

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join(timeout=2)
        logging.info("[SurveillanceAgent] Thread de surveillance arrêté.")

    def _monitor_loop(self):
        while self.running and self.engine.running:
            try:
                # Vérifier si l'Engine a un crash silencieux
                if not self.engine._thread.is_alive():
                    logging.critical("[SurveillanceAgent] 🚨 L'Event Loop asynchrone de l'Engine a crashé silencieusement ! Activation du Kill Switch.")
                    self.kill_switch.trigger("Crash de l'Engine Thread")
                    self.engine.running = False
                    break
                
                # Vérification du Drawdown global (Circuit Breaker)
                self.circuit_breaker.check()
                
                # Si le Kill Switch a été déclenché (par l'humain ou le circuit breaker)
                if self.kill_switch.is_triggered:
                    logging.critical("[SurveillanceAgent] 🛑 Kill Switch activé détecté. Arrêt immédiat de l'Engine.")
                    self.engine.running = False
                    break
                
            except Exception as e:
                logging.error(f"[SurveillanceAgent] Erreur dans la boucle de surveillance : {e}")
                
            time.sleep(5)  # Scan toutes les 5 secondes
