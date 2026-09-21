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
        self.last_wfo_date = None
        
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
                    self.kill_switch.activate("Crash de l'Engine Thread")
                    self.engine.running = False
                    break
                
                # Vérification du Drawdown global (Circuit Breaker)
                self.circuit_breaker.check()
                
                # Exécution du Walk-Forward Optimization du Week-end (Samedi)
                self._run_weekend_wfo()
                
                # Si le Kill Switch a été déclenché (par l'humain ou le circuit breaker)
                if self.kill_switch.is_triggered:
                    logging.critical("[SurveillanceAgent] 🛑 Kill Switch activé détecté. Arrêt immédiat de l'Engine.")
                    self.engine.running = False
                    break
                
            except Exception as e:
                logging.error(f"[SurveillanceAgent] Erreur dans la boucle de surveillance : {e}")
                
            time.sleep(5)  # Scan toutes les 5 secondes

    def _run_weekend_wfo(self):
        """Lance l'optimisation WFO le samedi."""
        import datetime
        now = datetime.datetime.now()
        # Samedi = weekday() == 5
        if now.weekday() == 5:
            if self.last_wfo_date != now.date():
                self.last_wfo_date = now.date()
                wfo_thread = threading.Thread(target=self._wfo_task, daemon=True, name="WFOThread")
                wfo_thread.start()

    def _wfo_task(self):
        logging.info("[SurveillanceAgent] 🕒 Lancement de la Walk-Forward Optimization (WFO) du Week-end.")
        try:
            from optimization.auto_optimizer import optimizer_manager
            import MetaTrader5 as mt5
            import time
            
            if not self.engine.symbols:
                return
                
            # Optimisation sur le premier symbole actif comme proxy de la volatilité
            symbol = self.engine.symbols[0]
            # Historique de la semaine = env 1440 bougies M5
            df = self.engine.connector.get_historical_data(symbol, mt5.TIMEFRAME_M5, 1440)
            
            if df is not None and not df.empty:
                job_id = optimizer_manager.start_job(symbol, df, 10000.0, self.engine)
                
                # Attendre la fin du job
                while True:
                    status = optimizer_manager.get_job_status(job_id)
                    if status["status"] in ["completed", "error", "not_found"]:
                        break
                    time.sleep(5)
                    
                if status["status"] == "completed" and status.get("result"):
                    best_params = status["result"].get("bestParams", {})
                    if "slMult" in best_params:
                        # Mettre à jour RuntimeSettings
                        from api.server import _runtime_settings
                        _runtime_settings.sl_multiplier = float(best_params["slMult"])
                        _runtime_settings.tp_multiplier = float(best_params["slMult"] * 1.5)
                        
                        if "confThreshold" in best_params:
                            _runtime_settings.ml_confidence_threshold = float(best_params["confThreshold"]) / 100.0
                            
                        logging.info(f"[SurveillanceAgent] ✅ WFO terminé ! Nouveaux paramètres appliqués : {best_params}")
                        
                        # Sauvegarder dans .env pour la persistance au reboot
                        self._update_env("ATR_SL_MULTIPLIER", str(best_params["slMult"]))
                        self._update_env("ATR_TP_MULTIPLIER", str(best_params["slMult"] * 1.5))
                        if "confThreshold" in best_params:
                            self._update_env("ML_CONFIDENCE_THRESHOLD", str(best_params["confThreshold"] / 100.0))
                            
        except Exception as e:
            logging.error(f"[SurveillanceAgent] Erreur tâche WFO : {e}")

    def _update_env(self, key: str, value: str):
        try:
            import os
            env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
            if not os.path.exists(env_path):
                return
                
            with open(env_path, "r") as f:
                lines = f.readlines()
                
            with open(env_path, "w") as f:
                for line in lines:
                    if line.startswith(f"{key}="):
                        f.write(f"{key}={value}\n")
                    else:
                        f.write(line)
        except Exception as e:
            logging.error(f"[SurveillanceAgent] Erreur mise à jour .env : {e}")
