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
import time
from typing import Optional, Tuple
import numpy as np

try:
    import pandas as pd
    from xgboost import XGBClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split, GridSearchCV
    from sklearn.metrics import accuracy_score
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from ml.lstm_model import LSTMPredictor, create_sequences
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    logging.warning("[MLTrainer] XGBoost, scikit-learn ou PyTorch non disponible. ML désactivé.")


class MLTrainer:
    """
    Entraîne et maintient un modèle XGBoost pour filtrer les signaux de trading.
    """

    RETRAIN_INTERVAL_HOURS = 4          # Ré-entraînement toutes les 4h
    MIN_SAMPLES_TO_TRAIN = 200          # Minimum de bougies pour entraîner
    PREDICTION_HORIZON = 5              # Horizon de prédiction en barres
    FEATURE_COLUMNS = [
        'ema_diff', 'rsi', 'macd_hist', 'atr_norm',
        'volume_rel', 'hour_sin', 'hour_cos',
        'ret_1', 'ret_3', 'ret_5'
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

    def start_auto_retrain(self, connector, symbols: list) -> None:
        """Lance le thread de ré-entraînement automatique."""
        if not ML_AVAILABLE:
            return
        self._running = True
        self._connector = connector
        self._symbols = symbols
        self._retrain_thread = threading.Thread(
            target=self._auto_retrain_loop, daemon=True
        )
        self._retrain_thread.start()
        logging.info("[MLTrainer] Thread de ré-entraînement automatique démarré.")

    def stop(self) -> None:
        self._running = False

    def _auto_retrain_loop(self) -> None:
        """Boucle de ré-entraînement toutes les RETRAIN_INTERVAL_HOURS."""
        # MUST initialize MT5 in this background thread context
        if not self._connector.connect():
            logging.error("[MLTrainer] Impossible d'initialiser MT5 dans le thread ML.")
            return

        while self._running:
            self._collect_and_train()
            time.sleep(self.RETRAIN_INTERVAL_HOURS * 3600)

    def _collect_and_train(self) -> None:
        """Collecte les données depuis MT5 et lance l'entraînement."""
        try:
            import MetaTrader5 as mt5
            all_dfs = []
            for symbol in self._symbols:
                # Récupérer 1000 bougies M15 par symbole
                df = self._connector.get_historical_data(symbol, mt5.TIMEFRAME_M15, 1000)
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
                hours = pd.to_datetime(df['time']).dt.hour
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

        # Label : direction future sur PREDICTION_HORIZON barres
        df['future_ret'] = df['close'].shift(-self.PREDICTION_HORIZON) / df['close'] - 1
        df['label'] = (df['future_ret'] > 0).astype(int)

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

            if len(processed) < self.MIN_SAMPLES_TO_TRAIN:
                logging.warning(
                    f"[MLTrainer] Pas assez de samples après feature engineering "
                    f"({len(processed)} < {self.MIN_SAMPLES_TO_TRAIN})"
                )
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

            # 1. Grid Search XGBoost (Walk-Forward Optimization Anti-Overfitting)
            logging.info("[MLTrainer] Lancement du Grid Search XGBoost avec TimeSeriesSplit (WFO)...")
            param_grid = {
                'n_estimators': [100, 200],
                'max_depth': [3, 5],
                'learning_rate': [0.05, 0.1]
            }
            tscv = TimeSeriesSplit(n_splits=3) # Empêche le look-ahead bias dans la validation croisée
            xgb = XGBClassifier(use_label_encoder=False, eval_metric='logloss', random_state=42)
            grid_search = GridSearchCV(estimator=xgb, param_grid=param_grid, cv=tscv, scoring='accuracy', n_jobs=-1)
            grid_search.fit(X_train_s, y_train)
            
            best_xgb = grid_search.best_estimator_
            logging.info(f"[MLTrainer] Meilleurs paramètres XGBoost: {grid_search.best_params_}")

            # 2. Entraînement LSTM (PyTorch)
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

            # Évaluation XGBoost seulement pour simplifier l'accuracy globale
            preds = best_xgb.predict(X_test_s)
            accuracy = accuracy_score(y_test, preds)

            with self._lock:
                self._xgb_model  = best_xgb
                self._lstm_model = lstm_model
                self._scaler  = scaler
                self._is_trained = True
                self._accuracy   = accuracy
                self._sample_count = len(processed)
                self._last_trained = time.strftime("%Y-%m-%d %H:%M:%S")

            logging.info(
                f"[MLTrainer] ✅ Modèle Ensemble (XGB+LSTM) entraîné — Samples: {len(processed)} | "
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
