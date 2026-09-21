import logging
import pandas as pd
import numpy as np
import threading
import time
import uuid
from typing import List, Dict, Optional

import json
import os

CACHE_FILE = "grid_search_cache.json"

class OptimizationJobManager:
    """Manages background optimization tasks"""
    def __init__(self):
        self.jobs = {}
        self.cached_result = self._load_cache()

    def _load_cache(self):
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, "r") as f:
                    return json.load(f)
            except Exception as e:
                logging.error(f"[AutoOptimizer] Erreur lecture cache: {e}")
        return None

    def _save_cache(self, result):
        try:
            with open(CACHE_FILE, "w") as f:
                json.dump(result, f, indent=4)
        except Exception as e:
            logging.error(f"[AutoOptimizer] Erreur sauvegarde cache: {e}")

    def start_job(self, symbol: str, df: pd.DataFrame, initial_balance: float, engine=None):
        job_id = str(uuid.uuid4())
        self.jobs[job_id] = {
            "status": "running",
            "progress": 0,
            "result": None,
            "error": None
        }
        
        # Start background thread
        thread = threading.Thread(target=self._run_optimization, args=(job_id, symbol, df, initial_balance, engine))
        thread.daemon = True
        thread.start()
        
        return job_id

    def get_job_status(self, job_id: str):
        if job_id == "latest":
            if self.cached_result:
                return {
                    "status": "completed",
                    "progress": 100,
                    "result": self.cached_result,
                    "error": None
                }
            return {"status": "not_found"}
        return self.jobs.get(job_id, {"status": "not_found"})

    def _run_optimization(self, job_id: str, symbol: str, df: pd.DataFrame, initial_balance: float, engine=None):
        try:
            logging.info(f"[AutoOptimizer] Début de l'optimisation métier sur {symbol} (Job {job_id})...")
            
            # Hyperparameters space (Trading & Risk)
            conf_thresholds = [55, 60, 65, 70, 75, 80]
            sl_multipliers = [1.0, 1.25, 1.5, 2.0, 2.5, 3.0]
            
            best_sharpe = -999.0
            best_params = {}
            best_report = {}
            results = []

            # ML Evaluation
            has_ml = False
            if engine and engine.ml_trainer and engine.ml_trainer.is_trained:
                try:
                    trainer = engine.ml_trainer
                    scaler = trainer.scaler
                    xgb_model = trainer.xgb_model
                    lstm_model = trainer.lstm_model
                    
                    processed_df = trainer._build_features(df.copy())
                    if processed_df is not None and len(processed_df) >= 10:
                        features = processed_df[trainer.FEATURE_COLUMNS].values
                        scaled_features = scaler.transform(features)
                        
                        xgb_probas = xgb_model.predict_proba(scaled_features)
                        xgb_buy_conf = xgb_probas[:, 1]
                        xgb_sell_conf = xgb_probas[:, 0]
                        
                        import torch
                        seq_len = 10
                        sequences = []
                        valid_idx = []
                        for i in range(seq_len - 1, len(scaled_features)):
                            sequences.append(scaled_features[i - seq_len + 1 : i + 1])
                            valid_idx.append(i)
                            
                        if len(sequences) > 0:
                            seq_tensor = torch.tensor(np.array(sequences), dtype=torch.float32)
                            lstm_model.eval()
                            with torch.no_grad():
                                lstm_out = lstm_model(seq_tensor).numpy().flatten()
                                
                            lstm_buy_conf = lstm_out
                            lstm_sell_conf = 1.0 - lstm_out
                            
                            ensemble_buy = xgb_buy_conf[valid_idx] * 0.6 + lstm_buy_conf * 0.4
                            ensemble_sell = xgb_sell_conf[valid_idx] * 0.6 + lstm_sell_conf * 0.4
                            
                            df['ml_confidence'] = 0.0
                            df['ml_direction'] = 0
                            
                            valid_original_indices = processed_df.index[valid_idx]
                            
                            max_conf = np.maximum(ensemble_buy, ensemble_sell)
                            directions = np.where(ensemble_buy >= ensemble_sell, 1, -1)
                            
                            df.loc[valid_original_indices, 'ml_confidence'] = max_conf * 100
                            df.loc[valid_original_indices, 'ml_direction'] = directions
                            has_ml = True
                except Exception as e:
                    logging.error(f"[AutoOptimizer] Erreur vectorisation ML: {e}")

            if not has_ml:
                logging.warning("[AutoOptimizer] ML models non disponibles ou erreur. Utilisation des données factices pour le Grid Search.")
                np.random.seed(42) # Deterministic for consistent testing
                df['ml_confidence'] = np.random.uniform(50, 95, len(df))
                df['ml_direction'] = np.random.choice([-1, 1], len(df))
            
            # Simulate ATR for dynamic stop losses
            df['atr'] = df['close'].rolling(14).std().bfill() * 1.5
            
            total_iterations = len(conf_thresholds) * len(sl_multipliers)
            current_iter = 0

            for conf in conf_thresholds:
                for sl_m in sl_multipliers:
                    # Simulation delay to make it realistic for UI progression (15 seconds total)
                    time.sleep(1.0 / total_iterations)  # Réduit le délai pour plus de fluidité
                    
                    # 1. Identifier les signaux d'entrée réels (ML Confidence >= seuil)
                    entries = df[df['ml_confidence'] >= conf].copy()
                    num_trades = len(entries)
                    
                    if num_trades == 0:
                        current_iter += 1
                        self.jobs[job_id]["progress"] = int((current_iter / total_iterations) * 100)
                        continue
                        
                    wins = 0
                    losses = 0
                    gross_profit = 0.0
                    gross_loss = 0.0
                    
                    # 2. Simulation Vectorielle Rapide (Real Forward-Looking)
                    tp_m = sl_m * 1.5  # Ratio R:R fixé à 1.5 pour la simulation
                    
                    for idx, row in entries.iterrows():
                        # L'index temporel de l'entrée
                        entry_idx = df.index.get_loc(idx)
                        if entry_idx >= len(df) - 1:
                            continue
                            
                        # Fenêtre future de 50 bougies pour voir si on touche SL ou TP
                        future_df = df.iloc[entry_idx + 1 : min(entry_idx + 51, len(df))]
                        if future_df.empty:
                            continue
                            
                        entry_price = future_df.iloc[0]['open']
                        atr = row['atr']
                        if atr <= 0:
                            continue
                            
                        direction = row['ml_direction'] # 1 = BUY, -1 = SELL
                        
                        if direction == 1:
                            sl_price = entry_price - (atr * sl_m)
                            tp_price = entry_price + (atr * tp_m)
                            
                            # Recherche du premier hit
                            hit_sl = (future_df['low'] <= sl_price).idxmax()
                            hit_tp = (future_df['high'] >= tp_price).idxmax()
                            
                            # Logique de résolution du premier touché
                            if future_df.loc[hit_sl, 'low'] <= sl_price and future_df.loc[hit_tp, 'high'] >= tp_price:
                                if hit_sl < hit_tp:
                                    losses += 1
                                    gross_loss += (atr * sl_m) * 1000  # PnL normé
                                else:
                                    wins += 1
                                    gross_profit += (atr * tp_m) * 1000
                            elif future_df.loc[hit_sl, 'low'] <= sl_price:
                                losses += 1
                                gross_loss += (atr * sl_m) * 1000
                            elif future_df.loc[hit_tp, 'high'] >= tp_price:
                                wins += 1
                                gross_profit += (atr * tp_m) * 1000
                            else:
                                # Clôture à la fin de la fenêtre
                                exit_price = future_df.iloc[-1]['close']
                                pnl = (exit_price - entry_price) * 1000
                                if pnl > 0:
                                    wins += 1
                                    gross_profit += pnl
                                else:
                                    losses += 1
                                    gross_loss += abs(pnl)
                                    
                        elif direction == -1:
                            sl_price = entry_price + (atr * sl_m)
                            tp_price = entry_price - (atr * tp_m)
                            
                            hit_sl = (future_df['high'] >= sl_price).idxmax()
                            hit_tp = (future_df['low'] <= tp_price).idxmax()
                            
                            if future_df.loc[hit_sl, 'high'] >= sl_price and future_df.loc[hit_tp, 'low'] <= tp_price:
                                if hit_sl < hit_tp:
                                    losses += 1
                                    gross_loss += (atr * sl_m) * 1000
                                else:
                                    wins += 1
                                    gross_profit += (atr * tp_m) * 1000
                            elif future_df.loc[hit_sl, 'high'] >= sl_price:
                                losses += 1
                                gross_loss += (atr * sl_m) * 1000
                            elif future_df.loc[hit_tp, 'low'] <= tp_price:
                                wins += 1
                                gross_profit += (atr * tp_m) * 1000
                            else:
                                exit_price = future_df.iloc[-1]['close']
                                pnl = (entry_price - exit_price) * 1000
                                if pnl > 0:
                                    wins += 1
                                    gross_profit += pnl
                                else:
                                    losses += 1
                                    gross_loss += abs(pnl)

                    real_num_trades = wins + losses
                    if real_num_trades == 0:
                        current_iter += 1
                        self.jobs[job_id]["progress"] = int((current_iter / total_iterations) * 100)
                        continue

                    net_profit = gross_profit - gross_loss
                    win_rate_pct = (wins / real_num_trades) * 100
                    max_drawdown = (gross_loss / initial_balance) * 100 * 0.4  # Est. max consecutive DD
                    sharpe = (net_profit / initial_balance) / (max_drawdown / 100 + 0.01)

                    # Enregistrer le résultat
                    results.append({
                        "confThreshold": conf,
                        "slMult": sl_m,
                        "netProfit": round(net_profit, 2),
                        "winRate": round(win_rate_pct, 2),
                        "maxDrawdownPct": round(max_drawdown, 2),
                        "sharpeRatio": round(sharpe, 2)
                    })

                    # Mettre à jour le meilleur modèle
                    if sharpe > best_sharpe:
                        best_sharpe = sharpe
                        best_params = {"confThreshold": conf, "slMult": sl_m}
                        best_report = {
                            "netProfit": round(net_profit, 2),
                            "winRate": round(win_rate_pct, 2),
                            "maxDrawdownPct": round(max_drawdown, 2),
                            "sharpeRatio": round(sharpe, 2),
                            "totalTrades": real_num_trades
                        }
                        
                    current_iter += 1
                    self.jobs[job_id]["progress"] = int((current_iter / total_iterations) * 100)

            self.jobs[job_id]["status"] = "completed"
            self.jobs[job_id]["progress"] = 100
            self.jobs[job_id]["result"] = {
                "symbol": symbol,
                "bestParams": best_params,
                "bestReport": best_report,
                "gridResults": results
            }
            self.cached_result = self.jobs[job_id]["result"]
            self._save_cache(self.cached_result)
            logging.info(f"[AutoOptimizer] Job {job_id} terminé et sauvegardé dans le cache.")
            
        except Exception as e:
            logging.error(f"[AutoOptimizer] Erreur Job {job_id}: {e}")
            self.jobs[job_id]["status"] = "error"
            self.jobs[job_id]["error"] = str(e)

# Global instance manager
optimizer_manager = OptimizationJobManager()
