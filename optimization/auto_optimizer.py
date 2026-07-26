import logging
import pandas as pd
from typing import List, Dict, Optional
from application.backtester import Backtester

class AutoOptimizer:
    """
    Grid Search Optimizer pour trouver les meilleurs paramètres (SL, TP).
    Utilise le moteur de Backtest existant.
    """
    def __init__(self, df: pd.DataFrame, initial_balance: float = 10000.0):
        self.df = df
        self.initial_balance = initial_balance
        
        # Hyperparameters space
        self.sl_range = [10, 20, 30]
        self.tp_range = [20, 40, 60]

    def optimize(self, symbol: str) -> dict:
        logging.info(f"[AutoOptimizer] Début de l'optimisation sur {symbol}...")
        
        best_sharpe = -999.0
        best_params = {}
        best_report = {}
        results = []

        total_iterations = len(self.sl_range) * len(self.tp_range)
        current_iter = 0

        for sl in self.sl_range:
            for tp in self.tp_range:
                current_iter += 1
                logging.info(f"[AutoOptimizer] {current_iter}/{total_iterations} - Test SL={sl}, TP={tp}")
                
                # Setup Backtester
                tester = Backtester(initial_balance=self.initial_balance)
                
                # Run backtest
                report = tester.run(self.df.copy(), symbol)
                
                if "error" in report:
                    continue
                    
                sharpe = report.get("sharpeRatio", 0)
                
                # Enregistrer le résultat
                results.append({
                    "sl": sl,
                    "tp": tp,
                    "netProfit": report.get("netProfit", 0),
                    "winRate": report.get("winRate", 0),
                    "maxDrawdownPct": report.get("maxDrawdownPct", 0),
                    "sharpeRatio": sharpe
                })

                # Mettre à jour le meilleur modèle basé sur le Sharpe Ratio
                if sharpe > best_sharpe:
                    best_sharpe = sharpe
                    best_params = {"sl": sl, "tp": tp}
                    best_report = report

        return {
            "symbol": symbol,
            "bestParams": best_params,
            "bestReport": best_report,
            "gridResults": results
        }
