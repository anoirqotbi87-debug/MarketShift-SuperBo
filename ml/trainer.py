"""
ml/trainer.py — Entraîneur XGBoost pour MarketShift SuperBot

Entraîne un modèle de classification binaire (BUY / SELL ou WAIT) sur les données
OHLCV + indicateurs techniques.

Features utilisées :
  - EMA diff (9/21)
  - RSI 14
  - MACD histogram
  - ATR 14 normalisé
  - Volume relatif (vol / vol_ma20)
  - Heure du jour (0-23) encodée cycliquement
  - Retours sur 1, 3, 5 barres

Label : direction de la prochaine bougie N+5 (horizon court terme)
  1 = HAUSSE (BUY profitable)
  0 = BAISSE ou WAIT

Ré-entraînement automatique toutes les 4 heures.
"""

import logging
import threading
import multiprocessing
import time
import os
import joblib
from typing import Optional, Tuple
import numpy as np

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(MODEL_DIR, exist_ok=True)

def _run_isolated_training(symbols: list):
    """Exécuté dans un processus fantôme totalement séparé (Zero-Latency pour le bot)."""
    import logging
    from infrastructure.mt5_connector import MT5Connector
    
    # Configure un logger basique pour ce processus isolé
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - [ML-Worker] %(message)s")
    logging.info("[ML-Worker] Démarrage du processus d'entraînement ML isolé (CPU intensif)...")
    
    from infrastructure.config import Config
    
    try:
        xm_login = int(Config.XM_LOGIN) if Config.XM_LOGIN else 0
    except ValueError:
        xm_login = 0

    connector = MT5Connector(xm_login, Config.XM_PASSWORD, Config.XM_SERVER)
    if not connector.connect():
        logging.error("[ML-Worker] Échec connexion MT5. Annulation.")
        return
        
    # On instancie un trainer jetable juste pour la collecte et l'entraînement
    trainer = MLTrainer()
    trainer._connector = connector
    trainer._symbols = symbols
    
    # Ce processus prendra 100% de CPU mais ne bloquera pas le Main Process
    trainer._collect_and_train()
    
    connector.disconnect()
    logging.info("[ML-Worker] Entraînement terminé, processus fantôme détruit.")


try:
    import pandas as pd
    from xgboost import XGBClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split, GridSearchCV, TimeSeriesSplit
    from sklearn.metrics import accuracy_score, confusion_matrix
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    logging.warning("[MLTrainer] XGBoost ou scikit-learn non disponible. ML désactivé.")

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from ml.lstm_model import LSTMPredictor, create_sequences
    TORCH_AVAILABLE = True
except ImportError:
    torch = None
    nn = None
    optim = None
    LSTMPredictor = None
    create_sequences = None
    TORCH_AVAILABLE = False
    logging.info("[MLTrainer] PyTorch non disponible. Entraînement et prédictions en mode XGBoost.")

from infrastructure.config import Config
try:
    from infrastructure.telegram_notifier import telegram_notifier
except ImportError:
    telegram_notifier = None



class MLTrainer:
    """
    Entraîne et maintient un modèle XGBoost pour filtrer les signaux de trading.
    """

    RETRAIN_INTERVAL_HOURS = 4          # Ré-entraînement toutes les 4h
    MIN_SAMPLES_TO_TRAIN = 200          # Minimum de bougies pour entraîner
    PREDICTION_HORIZON = 10             # Horizon étendu pour permettre au TP d'être touché (2h30 en M15)
    FEATURE_COLUMNS = [
        'ema_diff', 'rsi', 'macd_hist', 'atr_norm',
        'volume_rel', 'hour_sin', 'hour_cos',
        'ret_1', 'ret_3', 'ret_5',
        'adx', 'bb_width'
    ]

    def __init__(self):
        self._xgb_model: Optional[object] = None
        self._lstm_model: Optional[object] = None
        self._scaler: Optional[object] = None
        self._is_trained: bool = False
        self._accuracy: float = 0.0
        self._sample_count: int = 0
        self._last_trained: Optional[str] = None
        self._lock = threading.Lock()
        self._retrain_thread: Optional[threading.Thread] = None
        self._running = False
        self._load_models()

    def _load_models(self) -> None:
        """Charge les modèles sauvegardés au démarrage pour éviter de trader à l'aveugle."""
        if not ML_AVAILABLE: return
        try:
            xgb_path = os.path.join(MODEL_DIR, "xgb_model.pkl")
            scaler_path = os.path.join(MODEL_DIR, "scaler.pkl")
            lstm_path = os.path.join(MODEL_DIR, "lstm_model.pt")
            
            if os.path.exists(xgb_path) and os.path.exists(scaler_path):
                self._xgb_model = joblib.load(xgb_path)
                self._scaler = joblib.load(scaler_path)
                
                # Load PyTorch LSTM si disponible
                if TORCH_AVAILABLE and torch is not None and os.path.exists(lstm_path) and LSTMPredictor is not None:
                    try:
                        self._lstm_model = LSTMPredictor(input_size=len(self.FEATURE_COLUMNS), hidden_size=64, num_layers=2)
                        self._lstm_model.load_state_dict(torch.load(lstm_path, weights_only=True))
                        self._lstm_model.eval()
                    except Exception as lstm_err:
                        logging.warning(f"[MLTrainer] Impossible de charger lstm_model.pt: {lstm_err}")
                
                self._is_trained = True
                self._last_trained = "Loaded from disk"
                
                # Charger les métadonnées si présentes
                meta_path = os.path.join(MODEL_DIR, "model_meta.json")
                if os.path.exists(meta_path):
                    import json
                    try:
                        with open(meta_path, 'r') as f:
                            meta = json.load(f)
                            self._accuracy = meta.get("accuracy", 0.0)
                            self._sample_count = meta.get("sample_count", 0)
                            self._last_trained = meta.get("last_trained", "Loaded from disk")
                    except Exception as e:
                        logging.warning(f"[MLTrainer] Impossible de lire model_meta.json: {e}")

                logging.info(f"[MLTrainer] [OK] Mémoire restaurée : Modèles chargés depuis le disque avec succès. (Acc: {self._accuracy:.1%}, Samples: {self._sample_count})")
        except Exception as e:
            logging.warning(f"[MLTrainer] Échec du chargement des modèles depuis le disque (Normal si 1er run): {e}")

    def start_auto_retrain(self, connector, symbols: list) -> None:
        """Lance le thread superviseur de ré-entraînement automatique."""
        if not ML_AVAILABLE:
            return
        self._running = True
        self._symbols = symbols
        self._retrain_thread = threading.Thread(
            target=self._auto_retrain_loop, daemon=True
        )
        self._retrain_thread.start()
        logging.info("[MLTrainer] Thread de supervision (Multiprocessing Hot-Reload) démarré.")

    def stop(self) -> None:
        self._running = False

    def force_retrain(self) -> None:
        """Démarre un ré-entraînement forcé manuellement (Bouton UI)."""
        if not ML_AVAILABLE or not getattr(self, '_symbols', None):
            logging.warning("[MLTrainer] Impossible de forcer l'entraînement (ML non dispo ou symboles absents).")
            return
        logging.info("[MLTrainer] 🚀 FORCE RETRAIN: Lancement manuel du ML-Worker (Processus Fantôme)...")
        import subprocess
        import sys
        
        symbols_str = ",".join(self._symbols)
        worker_script = os.path.join(os.path.dirname(__file__), "ml_worker.py")
        subprocess.Popen([sys.executable, worker_script, "--symbols", symbols_str])

    def _auto_retrain_loop(self) -> None:
        """Surveille le disque pour recharger les modèles (Hot-Reload) et lance les Workers toutes les 4h."""
        xgb_path = os.path.join(MODEL_DIR, "xgb_model.pkl")
        last_mtime = 0
        if os.path.exists(xgb_path):
            last_mtime = os.path.getmtime(xgb_path)
            
        last_train_time = time.time()
        
        while self._running:
            now = time.time()
            
            # 1. Faut-il lancer un nouvel entraînement ?
            if (now - last_train_time) > (self.RETRAIN_INTERVAL_HOURS * 3600):
                logging.info("[MLTrainer] 🚀 Lancement du ML-Worker (Processus Fantôme) en arrière-plan...")
                import subprocess
                import sys
                symbols_str = ",".join(self._symbols)
                worker_script = os.path.join(os.path.dirname(__file__), "ml_worker.py")
                subprocess.Popen([sys.executable, worker_script, "--symbols", symbols_str])
                last_train_time = now
                
            # 2. Hot-Reloading: Les modèles sur le disque ont-ils été mis à jour par le ML-Worker ?
            if os.path.exists(xgb_path):
                current_mtime = os.path.getmtime(xgb_path)
                if current_mtime > last_mtime:
                    logging.info("[MLTrainer] 🔄 Nouveaux modèles détectés sur le disque. Hot-Reloading instantané...")
                    time.sleep(2) # Laisser le temps au ML-Worker de finir l'écriture disque
                    self._load_models()
                    last_mtime = current_mtime
                    
            # Check léger toutes les 10 secondes
            time.sleep(10)

    def _collect_and_train(self) -> None:
        """Collecte les données depuis MT5 et lance l'entraînement."""
        try:
            import MetaTrader5 as mt5
            all_dfs = []
            for symbol in self._symbols:
                # Récupérer 5000 bougies M15 par symbole pour de meilleures fondations statistiques
                df = self._connector.get_historical_data(symbol, mt5.TIMEFRAME_M5, 5000)
                if df is not None and len(df) > self.MIN_SAMPLES_TO_TRAIN:
                    df['symbol'] = symbol
                    all_dfs.append(df)

            if not all_dfs:
                logging.warning("[MLTrainer] Pas assez de données pour entraîner.")
                return

            combined_df = pd.concat(all_dfs, ignore_index=True)
            self.train(combined_df)

        except Exception as e:
            logging.error(f"[MLTrainer] Erreur lors du ré-entraînement: {e}")

    def _build_features(self, df: 'pd.DataFrame') -> 'pd.DataFrame':
        """
        Construit les features à partir des données OHLCV.
        """
        df = df.copy()

        # EMA Diff (9 vs 21 periodes)
        df['ema9']  = df['close'].ewm(span=9,  adjust=False).mean()
        df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
        df['ema_diff'] = (df['ema9'] - df['ema21']) / df['close']

        # RSI 14
        delta = df['close'].diff()
        gain  = delta.clip(lower=0).rolling(14).mean()
        loss  = (-delta.clip(upper=0)).rolling(14).mean()
        rs    = gain / loss.replace(0, 1e-9)
        df['rsi'] = 100 - (100 / (1 + rs))

        # MACD Histogram (12/26/9)
        ema12 = df['close'].ewm(span=12, adjust=False).mean()
        ema26 = df['close'].ewm(span=26, adjust=False).mean()
        macd_line   = ema12 - ema26
        signal_line = macd_line.ewm(span=9, adjust=False).mean()
        df['macd_hist'] = (macd_line - signal_line) / df['close']

        # ATR 14 normalisé
        tr = pd.concat([
            df['high'] - df['low'],
            (df['high'] - df['close'].shift()).abs(),
            (df['low']  - df['close'].shift()).abs()
        ], axis=1).max(axis=1)
        df['atr_norm'] = tr.rolling(14).mean() / df['close']

        # Volume relatif
        vol_col = 'tick_volume' if 'tick_volume' in df.columns else 'volume' if 'volume' in df.columns else None
        if vol_col:
            df['volume_rel'] = df[vol_col] / (df[vol_col].rolling(20).mean().replace(0, 1))
        else:
            df['volume_rel'] = 1.0

        # Heure encodée cycliquement (si colonne 'time' présente)
        if 'time' in df.columns:
            try:
                dt_col = pd.to_datetime(df['time'], utc=True)
                hours = dt_col.dt.hour
                df['hour_sin'] = np.sin(2 * np.pi * hours / 24)
                df['hour_cos'] = np.cos(2 * np.pi * hours / 24)
            except Exception:
                df['hour_sin'] = 0.0
                df['hour_cos'] = 1.0
        else:
            df['hour_sin'] = 0.0
            df['hour_cos'] = 1.0

        # Retours sur N barres
        df['ret_1'] = df['close'].pct_change(1)
        df['ret_3'] = df['close'].pct_change(3)
        df['ret_5'] = df['close'].pct_change(5)

        # ADX Approximation
        up_move = df['high'] - df['high'].shift(1)
        down_move = df['low'].shift(1) - df['low']
        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
        atr_14 = tr.rolling(14).mean().replace(0, 1e-9)
        plus_di = 100 * (pd.Series(plus_dm, index=df.index).ewm(span=14, adjust=False).mean() / atr_14)
        minus_di = 100 * (pd.Series(minus_dm, index=df.index).ewm(span=14, adjust=False).mean() / atr_14)
        dx = 100 * (abs(plus_di - minus_di) / (plus_di + minus_di + 1e-9))
        df['adx'] = dx.ewm(span=14, adjust=False).mean().fillna(0)

        # Bollinger Bands Width
        rolling_mean = df['close'].rolling(20).mean()
        rolling_std = df['close'].rolling(20).std()
        df['bb_width'] = ((rolling_std * 4) / df['close']).fillna(0)

        # -------------------------------------------------------------
        # Labeling : Simulation "Virtual Order" (Path Dependency Aware)
        # -------------------------------------------------------------
        # Calcul du min/max futur sur la fenêtre de N bougies
        future_max = df['high'].rolling(self.PREDICTION_HORIZON).max().shift(-self.PREDICTION_HORIZON)
        future_min = df['low'].rolling(self.PREDICTION_HORIZON).min().shift(-self.PREDICTION_HORIZON)

        # Calcul dynamique du SL (1.5 ATR) et TP (2.0 ATR)
        atr_val = tr.rolling(14).mean().replace(0, 1e-9)
        virtual_sl = df['close'] - (1.5 * atr_val)
        virtual_tp = df['close'] + (2.0 * atr_val)

        # Label 1 (Gagnant) : Le TP est touché, ET le SL n'est jamais touché dans la fenêtre
        df['label'] = ((future_max >= virtual_tp) & (future_min > virtual_sl)).astype(int)

        # Conservé pour analyse (compatibilité)
        df['future_ret'] = df['close'].shift(-self.PREDICTION_HORIZON) / df['close'] - 1

        return df.dropna()

    def train(self, df: 'pd.DataFrame') -> bool:
        """
        Entraîne le modèle XGBoost sur le DataFrame fourni.
        Returns True si l'entraînement a réussi.
        """
        if not ML_AVAILABLE:
            return False

        try:
            processed = self._build_features(df)

            min_samples = getattr(Config, 'ML_MIN_SAMPLES', 10000)
            if len(processed) < min_samples:
                logging.warning(
                    f"[MLTrainer] ❌ Ré-entraînement rejeté : volume d'échantillons insuffisant "
                    f"({len(processed)} < {min_samples}). Modèle en production conservé intact."
                )
                if telegram_notifier:
                    try:
                        telegram_notifier.notify_critical_event(
                            "ML_RETRAIN_REJECTED",
                            reason=f"Volume insuffisant : {len(processed)} < {min_samples} barres",
                            details="La porte de qualité a rejeté le modèle. Le modèle précédent reste actif."
                        )
                    except Exception as notif_err:
                        logging.error(f"[MLTrainer] Erreur notification Telegram: {notif_err}")
                return False

            X = processed[self.FEATURE_COLUMNS].values
            y = processed['label'].values

            from sklearn.model_selection import train_test_split, GridSearchCV, TimeSeriesSplit
            
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, shuffle=False  # Walk-Forward: Train on past, Test on future
            )

            scaler = StandardScaler()
            X_train_s = scaler.fit_transform(X_train)
            X_test_s  = scaler.transform(X_test)

            # Équilibrage des classes (Anti Perma-Bull)
            num_pos = np.sum(y_train == 1)
            num_neg = np.sum(y_train == 0)
            scale_pos_weight = float(num_neg) / float(num_pos) if num_pos > 0 else 1.0

            # 1. Grid Search XGBoost (Walk-Forward Optimization Anti-Overfitting)
            logging.info("[MLTrainer] Lancement du Grid Search XGBoost avec TimeSeriesSplit (WFO)...")
            param_grid = {
                'n_estimators': [100, 200],
                'max_depth': [3, 5],
                'learning_rate': [0.05, 0.1]
            }
            tscv = TimeSeriesSplit(n_splits=3) # Empêche le look-ahead bias dans la validation croisée
            xgb = XGBClassifier(
                use_label_encoder=False, 
                eval_metric='logloss', 
                random_state=42,
                scale_pos_weight=scale_pos_weight
            )
            grid_search = GridSearchCV(estimator=xgb, param_grid=param_grid, cv=tscv, scoring='accuracy', n_jobs=-1)
            grid_search.fit(X_train_s, y_train)
            
            best_xgb = grid_search.best_estimator_
            logging.info(f"[MLTrainer] Meilleurs paramètres XGBoost: {grid_search.best_params_}")

            # 2. Entraînement LSTM (PyTorch si disponible)
            lstm_model = None
            if TORCH_AVAILABLE and torch is not None and LSTMPredictor is not None and create_sequences is not None:
                try:
                    logging.info("[MLTrainer] Début de l'entraînement LSTM...")
                    seq_length = 10
                    X_seq, y_seq = create_sequences(X_train_s, y_train, seq_length)
                    
                    # Convert to PyTorch tensors
                    X_tensor = torch.tensor(X_seq, dtype=torch.float32)
                    y_tensor = torch.tensor(y_seq, dtype=torch.float32).unsqueeze(1)
                    
                    lstm_model = LSTMPredictor(input_size=len(self.FEATURE_COLUMNS), hidden_size=64, num_layers=2)
                    criterion = nn.BCELoss()
                    optimizer = optim.Adam(lstm_model.parameters(), lr=0.001)
                    
                    epochs = 10
                    lstm_model.train()
                    for epoch in range(epochs):
                        optimizer.zero_grad()
                        outputs = lstm_model(X_tensor)
                        loss = criterion(outputs, y_tensor)
                        loss.backward()
                        optimizer.step()
                    
                    lstm_model.eval()
                    logging.info("[MLTrainer] Entraînement LSTM terminé.")
                except Exception as lstm_err:
                    logging.warning(f"[MLTrainer] Échec entraînement LSTM (fallback XGBoost seul): {lstm_err}")
                    lstm_model = None
            else:
                logging.info("[MLTrainer] PyTorch non disponible : Entraînement en mode XGBoost pur.")

            # Évaluation XGBoost sur test set
            preds = best_xgb.predict(X_test_s)
            accuracy = float(accuracy_score(y_test, preds))
            min_accuracy = float(getattr(Config, 'ML_MIN_ACCURACY', 0.55))

            # Quality Gate : vérification de l'accuracy minimale
            if accuracy < min_accuracy:
                logging.warning(
                    f"[MLTrainer] ❌ Ré-entraînement rejeté : test accuracy trop faible "
                    f"({accuracy:.1%} < {min_accuracy:.1%}). Modèle en production conservé intact."
                )
                if telegram_notifier:
                    try:
                        telegram_notifier.notify_critical_event(
                            "ML_RETRAIN_REJECTED",
                            reason=f"Accuracy insuffisante : {accuracy:.1%} < {min_accuracy:.1%}",
                            details="La porte de qualité a rejeté le modèle. Le modèle précédent reste actif."
                        )
                    except Exception as notif_err:
                        logging.error(f"[MLTrainer] Erreur notification Telegram: {notif_err}")
                return False

            cm = confusion_matrix(y_test, preds).tolist()
            now_str = time.strftime("%Y-%m-%d %H:%M:%S")

            with self._lock:
                self._xgb_model  = best_xgb
                self._lstm_model = lstm_model
                self._scaler  = scaler
                self._is_trained = True
                self._accuracy   = accuracy
                self._sample_count = len(processed)
                self._last_trained = now_str

            # Persistance sur disque
            try:
                joblib.dump(best_xgb, os.path.join(MODEL_DIR, "xgb_model.pkl"))
                joblib.dump(scaler, os.path.join(MODEL_DIR, "scaler.pkl"))
                if TORCH_AVAILABLE and torch is not None and lstm_model is not None:
                    torch.save(lstm_model.state_dict(), os.path.join(MODEL_DIR, "lstm_model.pt"))
                
                import json
                meta = {
                    "accuracy": float(accuracy),
                    "sample_count": int(len(processed)),
                    "last_trained": self._last_trained,
                    "confusion_matrix": cm,
                    "min_accuracy_threshold": float(min_accuracy),
                    "symbols": getattr(self, '_symbols', [])
                }
                with open(os.path.join(MODEL_DIR, "model_meta.json"), 'w') as f:
                    json.dump(meta, f, indent=2)
                    
                logging.info("[MLTrainer] 💾 Modèles sauvegardés sur disque de manière permanente.")
            except Exception as save_err:
                logging.error(f"[MLTrainer] Échec de la sauvegarde sur disque : {save_err}")

            if telegram_notifier:
                try:
                    telegram_notifier.notify_critical_event(
                        "ML_RETRAIN_SUCCESS",
                        reason=f"Nouveau modèle ML validé avec {accuracy:.1%} d'accuracy (seuil {min_accuracy:.1%})",
                        details=f"Échantillons : {len(processed)} barres. Modèles sauvegardés sur disque."
                    )
                except Exception as notif_err:
                    logging.error(f"[MLTrainer] Erreur notification Telegram: {notif_err}")

            logging.info(
                f"[MLTrainer] ✅ Modèle Ensemble (XGB+LSTM) entraîné et validé — Samples: {len(processed)} | "
                f"XGB Accuracy: {accuracy:.1%} | Dernière MAJ: {self._last_trained}"
            )
            return True

        except Exception as e:
            logging.error(f"[MLTrainer] Erreur d'entraînement: {e}")
            return False

    def get_feature_importances(self) -> dict:
        """Retourne les importances de features du modèle entraîné."""
        if not self._is_trained or not ML_AVAILABLE:
            return {}
        with self._lock:
            importances = self._xgb_model.feature_importances_
        return {
            col: float(imp)
            for col, imp in zip(self.FEATURE_COLUMNS, importances)
        }

    @property
    def is_trained(self) -> bool:
        return self._is_trained

    @property
    def accuracy(self) -> float:
        return self._accuracy

    @property
    def sample_count(self) -> int:
        return self._sample_count

    @property
    def scaler(self) -> Optional[object]:
        return self._scaler

    @property
    def xgb_model(self) -> Optional[object]:
        return self._xgb_model

    @property
    def lstm_model(self) -> Optional[object]:
        return self._lstm_model

    @property
    def last_trained(self) -> Optional[str]:
        return self._last_trained

    @property
    def scaler(self) -> Optional[object]:
        with self._lock:
            return self._scaler
